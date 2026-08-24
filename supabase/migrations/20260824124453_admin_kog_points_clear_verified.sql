-- Any kog_points change (including admin) clears kog_points_verified.
-- Non-admins still cannot SET the flag true when points are unchanged.

create or replace function public.enforce_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.is_verified := old.is_verified;
    new.is_banned := old.is_banned;
    if old.is_verified then
      new.nickname := old.nickname;
    end if;
    if new.kog_points is not distinct from old.kog_points then
      new.kog_points_verified := old.kog_points_verified;
    end if;
  end if;
  if new.kog_points is distinct from old.kog_points then
    new.kog_points_verified := false;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.enforce_profile_privileged_columns() from public;
