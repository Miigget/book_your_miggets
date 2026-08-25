-- Cap optional custom run titles so list/detail layouts stay readable.
-- Truncate existing over-limit values before adding the check (char_length, not byte length).

update public.runs
set title = left(title, 100)
where title is not null
  and char_length(title) > 100;

alter table public.runs
  add constraint runs_title_max_length_chk
  check (title is null or char_length(title) <= 100);
