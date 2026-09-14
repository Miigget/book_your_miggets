-- Optional short note on dictionary labels; shown as a tooltip on public profile chips.

alter table public.player_labels
  add column description text;

alter table public.player_labels
  add constraint player_labels_description_length_chk
  check (
    description is null
    or (
      char_length(btrim(description)) > 0
      and char_length(description) <= 160
    )
  );
