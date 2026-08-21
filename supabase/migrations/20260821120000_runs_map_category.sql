-- S-14 / category-only-runs: stored catalog difficulty on runs, XOR with map_id on
-- new writes, and organizer UPDATE grant for the new column.
-- Catalog CHECK is VALID (null is allowed). XOR CHECK is NOT VALID so existing
-- map-less rows do not fail db push. Do not VALIDATE in this slice.

-- ---------------------------------------------------------------------------
-- Column + catalog CHECK (null or one of eight KoG DIFF strings)
-- ---------------------------------------------------------------------------

alter table public.runs
  add column map_category text null;

alter table public.runs
  add constraint runs_map_category_catalog
  check (
    map_category is null
    or map_category in ('Easy', 'Main', 'Hard', 'Insane', 'Extreme', 'Mod', 'Solo', 'Others')
  );

-- ---------------------------------------------------------------------------
-- XOR: exactly one of map_id / map_category. NOT VALID: grandfathered both-null
-- rows stay readable. Fresh INSERT/UPDATE must still satisfy the check.
-- ---------------------------------------------------------------------------

alter table public.runs
  add constraint runs_map_or_category_required
  check ((map_id is null) <> (map_category is null))
  not valid;

-- ---------------------------------------------------------------------------
-- Column-level UPDATE: authenticated may patch map_category on editable runs.
-- INSERT / DELETE / SELECT grants are unchanged.
-- ---------------------------------------------------------------------------

revoke update on table public.runs from authenticated;
grant update (
  title,
  map_id,
  map_category,
  starts_at,
  max_participants,
  min_points,
  join_mode
) on table public.runs to authenticated;
