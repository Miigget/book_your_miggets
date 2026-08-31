-- S-19 / clan-friend-invites: pending|declined invites; accept is invitee DELETE + DEFINER seat.
-- No GRANT INSERT on clan_members. No officers. Do not join runs.

-- ---------------------------------------------------------------------------
-- Enum + table
-- ---------------------------------------------------------------------------

create type public.clan_invite_status as enum ('pending', 'declined');

create table public.clan_invites (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  status public.clan_invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clan_invites_not_self_chk check (invitee_id <> inviter_id),
  constraint clan_invites_clan_invitee_key unique (clan_id, invitee_id)
);

create index clan_invites_invitee_id_idx on public.clan_invites (invitee_id);
create index clan_invites_inviter_id_idx on public.clan_invites (inviter_id);

create index clan_invites_invitee_pending_idx
  on public.clan_invites (invitee_id)
  where status = 'pending'::public.clan_invite_status;

create index clan_invites_clan_pending_idx
  on public.clan_invites (clan_id)
  where status = 'pending'::public.clan_invite_status;

revoke all on table public.clan_invites from public, anon;
grant select, insert, update, delete on table public.clan_invites to authenticated;

alter table public.clan_invites enable row level security;

-- ---------------------------------------------------------------------------
-- RLS (TO authenticated, (select auth.uid()); live friends via are_friends)
-- ---------------------------------------------------------------------------

create policy "clan_invites_select_participant_or_admin"
  on public.clan_invites
  for select
  to authenticated
  using (
    (select auth.uid()) in (inviter_id, invitee_id)
    or public.is_admin()
  );

create policy "clan_invites_insert_owner_pending"
  on public.clan_invites
  for insert
  to authenticated
  with check (
    (select auth.uid()) = inviter_id
    and status = 'pending'::public.clan_invite_status
    and public.is_not_banned()
    and public.are_friends(inviter_id, invitee_id)
    and exists (
      select 1
      from public.clans c
      where c.id = clan_id
        and c.owner_id = inviter_id
    )
    and not exists (
      select 1
      from public.clan_members m
      where m.user_id = invitee_id
    )
  );

create policy "clan_invites_update_invitee_decline"
  on public.clan_invites
  for update
  to authenticated
  using (
    (select auth.uid()) = invitee_id
    and status = 'pending'::public.clan_invite_status
    and public.is_not_banned()
  )
  with check (
    (select auth.uid()) = invitee_id
    and status = 'declined'::public.clan_invite_status
  );

create policy "clan_invites_update_owner_reopen"
  on public.clan_invites
  for update
  to authenticated
  using (
    (select auth.uid()) = inviter_id
    and status = 'declined'::public.clan_invite_status
    and public.is_not_banned()
  )
  with check (
    (select auth.uid()) = inviter_id
    and status = 'pending'::public.clan_invite_status
    and public.is_not_banned()
    and public.are_friends(inviter_id, invitee_id)
    and exists (
      select 1
      from public.clans c
      where c.id = clan_id
        and c.owner_id = inviter_id
    )
    and not exists (
      select 1
      from public.clan_members m
      where m.user_id = invitee_id
    )
  );

create policy "clan_invites_delete_invitee_accept"
  on public.clan_invites
  for delete
  to authenticated
  using (
    (select auth.uid()) = invitee_id
    and status = 'pending'::public.clan_invite_status
    and public.are_friends(inviter_id, invitee_id)
    and public.is_not_banned()
  );

create policy "clan_invites_delete_owner_cancel"
  on public.clan_invites
  for delete
  to authenticated
  using (
    (select auth.uid()) = inviter_id
    and status = 'pending'::public.clan_invite_status
    and public.is_not_banned()
  );

create policy "clan_invites_delete_admin"
  on public.clan_invites
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- clans BEFORE DELETE: transaction-local teardown so CASCADE is not Accept.
-- Parent BEFORE DELETE runs before child CASCADE.
-- ---------------------------------------------------------------------------

create or replace function public.clans_before_delete_teardown()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('app.clan_delete_teardown', '1', true);
  return old;
end;
$$;

revoke all on function public.clans_before_delete_teardown() from public;

create trigger clans_before_delete_teardown
  before delete on public.clans
  for each row
  execute function public.clans_before_delete_teardown();

-- ---------------------------------------------------------------------------
-- clan_invites BEFORE DELETE (DEFINER): invitee pending → seat + clear other pendings.
-- Nested sibling deletes skip via pg_trigger_depth. CASCADE skip via teardown GUC.
-- Do not skip seating because is_admin() is true.
-- ---------------------------------------------------------------------------

create or replace function public.clan_invites_before_delete_accept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.clan_delete_teardown', true) = '1' then
    return old;
  end if;

  if pg_trigger_depth() > 1 then
    return old;
  end if;

  if (select auth.uid()) = old.invitee_id
     and old.status = 'pending'::public.clan_invite_status then
    insert into public.clan_members (user_id, clan_id)
    values (old.invitee_id, old.clan_id);

    delete from public.clan_invites
    where invitee_id = old.invitee_id
      and id is distinct from old.id
      and status = 'pending'::public.clan_invite_status;
  end if;

  return old;
end;
$$;

revoke all on function public.clan_invites_before_delete_accept() from public;

create trigger clan_invites_before_delete_accept
  before delete on public.clan_invites
  for each row
  execute function public.clan_invites_before_delete_accept();

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE: freeze pair + inviter; pending↔declined only (friends dual-UPDATE hole).
-- ---------------------------------------------------------------------------

create or replace function public.clan_invites_before_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.clan_id is distinct from old.clan_id
     or new.invitee_id is distinct from old.invitee_id
     or new.inviter_id is distinct from old.inviter_id then
    raise exception 'cannot change clan invite pair';
  end if;

  if old.status = 'pending'::public.clan_invite_status then
    if new.status is distinct from 'declined'::public.clan_invite_status then
      raise exception 'pending invites can only be declined';
    end if;
  elsif old.status = 'declined'::public.clan_invite_status then
    if new.status is distinct from 'pending'::public.clan_invite_status then
      raise exception 'declined invites can only be reopened to pending';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.clan_invites_before_update() from public;

create trigger clan_invites_before_update
  before update on public.clan_invites
  for each row
  execute function public.clan_invites_before_update();
