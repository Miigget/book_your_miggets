# book_your_miggets
Team Finder / Run Scheduler for gores

## Profile

Signed-in members open **Profile** in the top bar (`/profile`) to manage nickname, email, password, and self-reported KoG points. The top bar shows nickname (or “Set nickname”), never email. Email stays off public pages.

## Admin access

There are no seeded admin credentials. To designate the first admin:

1. Sign up normally through the app.
2. Find the user id: `select id, email from auth.users;` (SQL editor) or Supabase dashboard → Auth → Users.
3. Promote the account in the SQL editor (or `psql` against the local stack). The
   `profiles_enforce_privileged_columns` trigger resets `role`/`is_verified`/`is_banned` for
   non-admin callers — and `auth.uid()` is null in a SQL-editor session — so the trigger must be
   disabled around the promote:

   ```sql
   begin;
   alter table public.profiles disable trigger profiles_enforce_privileged_columns;
   update public.profiles set role = 'admin' where id = '<user-id>';
   alter table public.profiles enable trigger profiles_enforce_privileged_columns;
   commit;
   ```

4. After signing in again (or refreshing), the account sees the **Admin** link in the top bar and
   can moderate from `/admin`: ban/unban and verify/unverify users, and delete runs from each
   run's detail page. Nicknames on `/admin` open `/admin/users/{id}` (that player's confirmed
   archived runs).

Further role changes stay manual by design — there is no role-management UI. Ban and verify
toggles are available in the admin UI once at least one admin exists (admin sessions pass the
trigger check, so no SQL is needed for those).
