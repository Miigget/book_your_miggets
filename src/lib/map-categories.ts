/** Catalog difficulty strings stored on `runs.map_category`. Must match `runs_map_category_catalog`. */
export const MAP_CATEGORIES = ["Easy", "Main", "Hard", "Insane", "Extreme", "Mod", "Solo", "Others"] as const;

export type MapCategory = (typeof MAP_CATEGORIES)[number];

export function isMapCategory(value: string): value is MapCategory {
  return (MAP_CATEGORIES as readonly string[]).includes(value);
}
