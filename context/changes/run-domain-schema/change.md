---
change_id: run-domain-schema
title: Run-domain schema and RLS baseline
status: implementing
created: 2026-07-29
updated: 2026-07-29
archived_at: null
---

## Notes

Run-domain schema and RLS baseline from @context/foundation/roadmap.md

First admin (manual): `update public.profiles set role = 'admin' where id = '<auth-user-uuid>';`

### Profile backfill (pre-trigger Auth users)

Users created before `on_auth_user_created` may lack a `profiles` row. One-off:

```sql
insert into public.profiles (id)
select u.id
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
```
