import { isMapCategory } from "@/lib/map-categories";

export const RUN_MAPS_MAX = 8;
export const RUN_MAPS_CARD_VISIBLE = 3;

export const RUN_MAPS_CAP_MESSAGE = `A run can have at most ${RUN_MAPS_MAX} maps`;

export class RunMapsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunMapsError";
  }
}

/** Repeated `map_ids` FormData field: strings, trimmed, empty dropped. */
export function parseMapIdsFromForm(form: FormData): string[] {
  return form
    .getAll("map_ids")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Dedupes first-seen, caps at `RUN_MAPS_MAX`. First id syncs to `mapId`.
 * Non-empty list XOR-clears category (list wins if the form also sent difficulty).
 */
export function normalizeRunMapsAndCategory(
  mapIdsRaw: string[],
  categoryRaw: string,
): { mapIds: string[]; mapId: string | null; mapCategory: string | null } {
  const seen = new Set<string>();
  const mapIds: string[] = [];
  for (const raw of mapIdsRaw) {
    const id = raw.trim();
    if (id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    mapIds.push(id);
  }

  if (mapIds.length > RUN_MAPS_MAX) {
    throw new RunMapsError(RUN_MAPS_CAP_MESSAGE);
  }

  const mapId = mapIds[0] ?? null;
  if (mapIds.length > 0) {
    return { mapIds, mapId, mapCategory: null };
  }

  const category = categoryRaw.trim().length > 0 ? categoryRaw.trim() : null;
  if (category === null) {
    return { mapIds, mapId: null, mapCategory: null };
  }

  if (!isMapCategory(category)) {
    throw new RunMapsError("Category is invalid");
  }

  return { mapIds, mapId: null, mapCategory: category };
}

export interface RunMapsSummaryMap {
  name: string;
  difficulty: string | null;
  points: number | null;
  stars?: string | null;
}

export type RunMapsSummary =
  | { kind: "maps"; visible: RunMapsSummaryMap[]; extra: number }
  | { kind: "category"; category: string }
  | { kind: "none" };

/**
 * Card/detail display model. Empty junction + singular `map` still renders as a one-item set
 * (half-written public create). Category only when the list is empty.
 */
export function summarizeRunMaps(
  maps: RunMapsSummaryMap[],
  fallbackMap: RunMapsSummaryMap | null,
  mapCategory: string | null,
): RunMapsSummary {
  const list = maps.length > 0 ? maps : fallbackMap ? [fallbackMap] : [];
  if (list.length > 0) {
    const visible = list.slice(0, RUN_MAPS_CARD_VISIBLE);
    return { kind: "maps", visible, extra: Math.max(0, list.length - visible.length) };
  }
  if (mapCategory) {
    return { kind: "category", category: mapCategory };
  }
  return { kind: "none" };
}
