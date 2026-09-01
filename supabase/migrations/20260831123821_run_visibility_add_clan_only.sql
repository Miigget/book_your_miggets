-- S-21 / clan-runs Phase 1: commit the new enum label in its own transaction.
-- Postgres 17: ALTER TYPE … ADD VALUE inside a transaction cannot use the new
-- label until commit (https://www.postgresql.org/docs/17/sql-altertype.html).
-- Policies and function bodies that write 'clan_only' live in the next migration.

alter type public.run_visibility add value 'clan_only';
