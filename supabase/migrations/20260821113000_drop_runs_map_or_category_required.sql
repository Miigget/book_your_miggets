-- QA follow-up (S-14): category is optional again. Map-less runs may have
-- neither map_id nor map_category. Catalog CHECK stays.

alter table public.runs
  drop constraint if exists runs_map_or_category_required;
