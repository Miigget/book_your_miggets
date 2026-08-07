/** One-hour grace after `starts_at` before a run leaves the active window (FR-013). */
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

/** Lower bound for `starts_at` queries: still inside upcoming-or-grace window. */
export function activeWindowStartsAfter(now?: Date | number): string {
  return new Date(resolveNow(now) - RUN_GRACE_MS).toISOString();
}

/** Instant when the run leaves the active window (`starts_at + 1h`). */
export function archiveDeadlineAt(startsAt: string | Date): Date {
  return new Date(startsAtMs(startsAt) + RUN_GRACE_MS);
}

export function getRunLifecyclePhase(startsAt: string | Date, now?: Date | number): RunLifecyclePhase {
  const t = resolveNow(now);
  const start = startsAtMs(startsAt);
  if (Number.isNaN(start)) return "archived";
  if (t < start) return "upcoming";
  if (t < start + RUN_GRACE_MS) return "in_progress";
  return "archived";
}

/**
 * Active ⇔ no stamped archive and still inside the grace-or-upcoming window.
 * Non-null `archivedAt` wins even if `starts_at` is still inside the time window.
 */
export function isRunActive(
  startsAt: string | Date,
  archivedAt: string | Date | null | undefined,
  now?: Date | number,
): boolean {
  if (archivedAt != null) return false;
  return getRunLifecyclePhase(startsAt, now) !== "archived";
}
