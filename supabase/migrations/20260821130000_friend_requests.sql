-- S-11 / add-friends: directed requests that become mutual on accept.
-- Guests never SELECT friend_requests; live verified edges go through public_friendships.
-- are_friends() is the S-15 hook; do not call it from policies on this table.

-- ---------------------------------------------------------------------------
-- Enum + table
-- ---------------------------------------------------------------------------

create type public.friend_request_status as enum ('pending', 'accepted', 'declined');

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status public.friend_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_not_self_chk check (sender_id <> receiver_id)
);

create unique index friend_requests_unordered_pair_uidx
  on public.friend_requests (least(sender_id, receiver_id), greatest(sender_id, receiver_id));

create index friend_requests_sender_id_idx on public.friend_requests (sender_id);
create index friend_requests_receiver_id_idx on public.friend_requests (receiver_id);
create index friend_requests_receiver_pending_idx
  on public.friend_requests (receiver_id)
  where status = 'pending'::public.friend_request_status;

revoke all on table public.friend_requests from public, anon;
grant select, insert, update, delete on table public.friend_requests to authenticated;

alter table public.friend_requests enable row level security;

-- ---------------------------------------------------------------------------
-- RLS (TO authenticated, (select auth.uid()); verification via public_profiles)
-- ---------------------------------------------------------------------------

create policy "friend_requests_select_participant"
  on public.friend_requests
  for select
  to authenticated
  using (
    (select auth.uid()) in (sender_id, receiver_id)
  );

create policy "friend_requests_select_admin"
  on public.friend_requests
  for select
  to authenticated
  using (public.is_admin());

create policy "friend_requests_insert_sender_pending"
  on public.friend_requests
  for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and status = 'pending'::public.friend_request_status
    and public.is_not_banned()
    and sender_id <> receiver_id
    and exists (
      select 1
      from public.public_profiles sp
      where sp.id = sender_id
        and sp.is_verified
    )
    and exists (
      select 1
      from public.public_profiles rp
      where rp.id = receiver_id
        and rp.is_verified
    )
  );

create policy "friend_requests_update_receiver_pending"
  on public.friend_requests
  for update
  to authenticated
  using (
    (select auth.uid()) = receiver_id
    and status = 'pending'::public.friend_request_status
    and public.is_not_banned()
  )
  with check (
    (select auth.uid()) = receiver_id
    and status in (
      'accepted'::public.friend_request_status,
      'declined'::public.friend_request_status
    )
  );

create policy "friend_requests_update_reopen_declined"
  on public.friend_requests
  for update
  to authenticated
  using (
    (select auth.uid()) in (sender_id, receiver_id)
    and status = 'declined'::public.friend_request_status
    and public.is_not_banned()
  )
  with check (
    (select auth.uid()) = sender_id
    and status = 'pending'::public.friend_request_status
    and sender_id <> receiver_id
    and exists (
      select 1
      from public.public_profiles sp
      where sp.id = sender_id
        and sp.is_verified
    )
    and exists (
      select 1
      from public.public_profiles rp
      where rp.id = receiver_id
        and rp.is_verified
    )
  );

create policy "friend_requests_delete_sender_pending"
  on public.friend_requests
  for delete
  to authenticated
  using (
    (select auth.uid()) = sender_id
    and status = 'pending'::public.friend_request_status
    and public.is_not_banned()
  );

create policy "friend_requests_delete_participant_accepted"
  on public.friend_requests
  for delete
  to authenticated
  using (
    (select auth.uid()) in (sender_id, receiver_id)
    and status = 'accepted'::public.friend_request_status
    and public.is_not_banned()
  );

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE: pair identity + accepted is immutable (unfriend is DELETE).
-- Extra status-machine guards close a Postgres RLS hole: multiple PERMISSIVE
-- UPDATE policies OR their USING and WITH CHECK independently, so a declined
-- participant could otherwise WITH CHECK through receiver_pending (accepted).
-- ---------------------------------------------------------------------------

create or replace function public.friend_requests_before_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'accepted'::public.friend_request_status then
    raise exception 'accepted friendships cannot be updated';
  end if;
  if old.status = 'pending'::public.friend_request_status then
    if new.status is distinct from 'accepted'::public.friend_request_status
       and new.status is distinct from 'declined'::public.friend_request_status then
      raise exception 'pending requests can only be accepted or declined';
    end if;
    new.sender_id := old.sender_id;
    new.receiver_id := old.receiver_id;
  end if;
  if old.status = 'declined'::public.friend_request_status then
    if new.status is distinct from 'pending'::public.friend_request_status then
      raise exception 'declined requests can only be reopened to pending';
    end if;
    -- allow sender/receiver swap; unordered pair must stay the same
    if least(new.sender_id, new.receiver_id) is distinct from least(old.sender_id, old.receiver_id)
       or greatest(new.sender_id, new.receiver_id) is distinct from greatest(old.sender_id, old.receiver_id) then
      raise exception 'cannot change friend pair';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.friend_requests_before_update() from public;

create trigger friend_requests_before_update
  before update on public.friend_requests
  for each row
  execute function public.friend_requests_before_update();

-- ---------------------------------------------------------------------------
-- Guest-readable live graph (accepted + both currently verified)
-- security_invoker = false: guests cannot SELECT friend_requests or profiles.
-- ---------------------------------------------------------------------------

create or replace view public.public_friendships
with (security_invoker = false)
as
select
  fr.sender_id as user_id,
  fr.receiver_id as friend_id
from public.friend_requests fr
inner join public.public_profiles sender
  on sender.id = fr.sender_id
 and sender.is_verified
inner join public.public_profiles receiver
  on receiver.id = fr.receiver_id
 and receiver.is_verified
where fr.status = 'accepted'::public.friend_request_status
union all
select
  fr.receiver_id as user_id,
  fr.sender_id as friend_id
from public.friend_requests fr
inner join public.public_profiles sender
  on sender.id = fr.sender_id
 and sender.is_verified
inner join public.public_profiles receiver
  on receiver.id = fr.receiver_id
 and receiver.is_verified
where fr.status = 'accepted'::public.friend_request_status;

revoke all on table public.public_friendships from public;
grant select on table public.public_friendships to anon, authenticated;

-- ---------------------------------------------------------------------------
-- S-15 hook: accepted unordered pair AND both currently verified.
-- DEFINER so runs policies can ask without SELECT on friend_requests.
-- Do not grant to anon. Do not call from friend_requests policies.
-- ---------------------------------------------------------------------------

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    a is not null
    and b is not null
    and a is distinct from b
    and exists (
      select 1
      from public.friend_requests fr
      where fr.status = 'accepted'::public.friend_request_status
        and least(fr.sender_id, fr.receiver_id) = least(a, b)
        and greatest(fr.sender_id, fr.receiver_id) = greatest(a, b)
    )
    and exists (
      select 1
      from public.public_profiles pa
      where pa.id = a
        and pa.is_verified
    )
    and exists (
      select 1
      from public.public_profiles pb
      where pb.id = b
        and pb.is_verified
    );
$$;

revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
