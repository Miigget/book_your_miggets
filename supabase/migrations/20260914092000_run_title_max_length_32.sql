-- Tighten optional custom run titles to 32 characters so list cards stay readable.
-- Delete rows whose custom title exceeds the new cap (unicode overflow tests in production).

delete from public.runs
where title is not null
  and char_length(title) > 32;

alter table public.runs
  drop constraint runs_title_max_length_chk;

alter table public.runs
  add constraint runs_title_max_length_chk
  check (title is null or char_length(title) <= 32);
