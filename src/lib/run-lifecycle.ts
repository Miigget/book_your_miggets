export const MAX_ACTIVE_RUNS_PER_ORGANIZER = 5;

/** Default in-progress window after `starts_at` when the organizer has not extended. */
export const RUN_GRACE_MS = 3_600_000;

export type RunLifecyclePhase = "upcoming" | "in_progress" | "archived";

export type ActiveRunLifecyclePhase = Exclude<RunLifecyclePhase, "archived">;

function resolveNow(now?: Date | number): number {
  if (now === undefined) return Date.now();
  return typeof now === "number" ? now : now.getTime();
}

function startsAtMs(startsAt: string | Date): number {
  return typeof startsAt === "string" ? Date.parse(startsAt) : startsAt.getTime();
}

function instantMs(value: string | Date): number {
  return typeof value === "string" ? Date.parse(value) : value.getTime();
}

/**
 * Audience-active ⇔ no stamp, and either an unelapsed extend or still inside
 * the 1-hour window after `starts_at`.
 */
export function isRunActive(
  startsAt: string | Date,
  archivedAt: string | Date | null | undefined,
  extendedUntil: string | Date | null | undefined,
  now?: Date | number,
): boolean {
  if (archivedAt != null) return false;
  const t = resolveNow(now);
  if (extendedUntil != null) {
    const deadline = instantMs(extendedUntil);
    if (Number.isNaN(deadline)) return false;
    return t < deadline;
  }
  const start = startsAtMs(startsAt);
  if (Number.isNaN(start)) return false;
  return t < start + RUN_GRACE_MS;
}

/** PostgREST `.or(...)` dual-defense for audience-active list/detail queries. */
export function audienceActiveOrFilter(now?: Date | number): string {
  const t = resolveNow(now);
  const nowIso = new Date(t).toISOString();
  const windowIso = new Date(t - RUN_GRACE_MS).toISOString();
  return `extended_until.gt."${nowIso}",starts_at.gt."${windowIso}"`;
}

export function getRunLifecyclePhase(
  startsAt: string | Date,
  archivedAt: string | Date | null | undefined,
  extendedUntil: string | Date | null | undefined,
  now?: Date | number,
): RunLifecyclePhase {
  if (!isRunActive(startsAt, archivedAt, extendedUntil, now)) return "archived";
  const t = resolveNow(now);
  const start = startsAtMs(startsAt);
  if (Number.isNaN(start)) return "archived";
  if (t < start) return "upcoming";
  return "in_progress";
}

interface AudienceActiveClockRow {
  starts_at: string | Date;
  archived_at: string | Date | null | undefined;
  extended_until: string | Date | null | undefined;
}

/** Count of audience-active rows; extra fields such as `completed_at` are ignored. */
export function countActiveFromRows(rows: readonly AudienceActiveClockRow[], now?: Date | number): number {
  return rows.filter((row) => isRunActive(row.starts_at, row.archived_at, row.extended_until, now)).length;
}

/** Active-list gate: `null` when not audience-active, otherwise upcoming or in_progress. */
export function toActiveLifecyclePhaseOrNull(
  startsAt: string | Date,
  archivedAt: string | Date | null | undefined,
  extendedUntil: string | Date | null | undefined,
  now?: Date | number,
): ActiveRunLifecyclePhase | null {
  const phase = getRunLifecyclePhase(startsAt, archivedAt, extendedUntil, now);
  if (phase === "archived") return null;
  return phase;
}
