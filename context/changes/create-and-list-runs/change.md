---
change_id: create-and-list-runs
title: Run creation and public active-runs list
status: implementing
created: 2026-07-29
updated: 2026-07-29
archived_at: null
---

## Notes

from @context/foundation/roadmap.md

Map catalog: import from https://github.com/Gamer12120/KoGmaps (mapinfo.txt). Vendor snapshot + loader for seed; future — automate pulls from GitHub raw URL. Upstream helpers: mapinfo_to_csv.py, mapinfo_to_json.py. Unparseable DATE values → null released_on.

Re-vendor + regenerate seed SQL (offline reset uses committed files only; loaded via `config.toml` `[db.seed] sql_paths`):

```bash
curl -fsSL https://raw.githubusercontent.com/Gamer12120/KoGmaps/main/mapinfo.txt \
  -o supabase/seed-data/kog-mapinfo.txt
npm run db:import-kog-maps
```

Remote: `db push` applies schema only — run generated `supabase/seed-data/kog-maps.sql` explicitly on the linked project if seed is not applied.
