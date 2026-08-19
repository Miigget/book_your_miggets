import type { Enums } from "@/types/database";

/** Postgres `integer` max — out-of-range values 400 PostgREST instead of filtering. */
const PG_INT4_MAX = 2_147_483_647;

const UTC_YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WHOLE_NON_NEGATIVE_INT_RE = /^(0|[1-9]\d*)$/;

export interface RunListFilters {
  mapQuery?: string;
  date?: string;
  minPoints?: number;
  joinMode?: Enums<"join_mode">;
}

function parseUtcCalendarDate(value: string): Date | null {
  const match = UTC_YMD_RE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }

  return utc;
}

function parseMinPoints(raw: string): number | undefined {
  if (!WHOLE_NON_NEGATIVE_INT_RE.test(raw) || raw.length > 10) return undefined;

  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > PG_INT4_MAX) return undefined;
  return n;
}

function parseJoinMode(raw: string): Enums<"join_mode"> | undefined {
  if (raw === "approval_required" || raw === "auto_join") return raw;
  return undefined;
}

/** `[start, end)` UTC instants for a validated `YYYY-MM-DD` calendar day. */
export function utcDayRange(date: string): { startIso: string; endIso: string } {
  const start = parseUtcCalendarDate(date);
  if (!start) {
    throw new Error(`Invalid UTC calendar date: ${date}`);
  }

  const end = new Date(start.getTime() + 86_400_000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Date / points / join mode — not search. Used to expand the filter card. */
export function hasExtraFilters(filters: RunListFilters): boolean {
  return filters.date != null || filters.minPoints != null || filters.joinMode != null;
}

export function hasActiveFilters(filters: RunListFilters): boolean {
  return filters.mapQuery != null || hasExtraFilters(filters);
}

export function parseRunListFilters(searchParams: URLSearchParams): RunListFilters {
  const filters: RunListFilters = {};

  const mapRaw = searchParams.get("map")?.trim();
  if (mapRaw) filters.mapQuery = mapRaw;

  const dateRaw = searchParams.get("date")?.trim();
  if (dateRaw && parseUtcCalendarDate(dateRaw)) filters.date = dateRaw;

  const minPointsRaw = searchParams.get("min_points")?.trim();
  if (minPointsRaw) {
    const minPoints = parseMinPoints(minPointsRaw);
    if (minPoints !== undefined) filters.minPoints = minPoints;
  }

  const joinRaw = searchParams.get("join")?.trim();
  if (joinRaw) {
    const joinMode = parseJoinMode(joinRaw);
    if (joinMode) filters.joinMode = joinMode;
  }

  return filters;
}
