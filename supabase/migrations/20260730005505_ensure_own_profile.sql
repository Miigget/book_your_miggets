-- Ensure a profiles row exists for the current auth user (pre-trigger / backfill gaps).
-- Authenticated clients cannot INSERT into profiles; this SECURITY DEFINER RPC fills the gap.

create or replace function public.ensure_own_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  row public.profiles;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into row from public.profiles where id = uid;
  if found then
    return row;
  end if;

  insert into public.profiles (id, role, is_verified, is_banned)
  values (uid, 'member'::public.user_role, false, false)
  on conflict (id) do nothing;

  select * into row from public.profiles where id = uid;
  if not found then
    raise exception 'Could not create profile';
  end if;

  return row;
end;
$$;

revoke all on function public.ensure_own_profile() from public;
grant execute on function public.ensure_own_profile() to authenticated;
