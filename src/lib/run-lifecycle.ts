export const MAX_ACTIVE_RUNS_PER_ORGANIZER = 5;

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
 * Audience-active ⇔ no stamp and not elapsed extend.
 * `startsAt` is unused for the boolean (kept so call sites stay readable).
 */
export function isRunActive(
  startsAt: string | Date,
  archivedAt: string | Date | null | undefined,
  extendedUntil: string | Date | null | undefined,
  now?: Date | number,
): boolean {
  void startsAt;
  if (archivedAt != null) return false;
  if (extendedUntil != null) {
    const deadline = instantMs(extendedUntil);
    if (!Number.isNaN(deadline) && resolveNow(now) >= deadline) return false;
  }
  return true;
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
