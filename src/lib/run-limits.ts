export const MAX_RUN_CAPACITY = 64;
export const DEFAULT_RUN_CAPACITY = 64;

export const CAPACITY_INVALID_MESSAGE = "Capacity must be a whole number greater than 0";
export const CAPACITY_MAX_MESSAGE = `Capacity cannot exceed ${MAX_RUN_CAPACITY}`;
export const STARTS_AT_FUTURE_MESSAGE = "Start time must be in the future";
export const STARTS_AT_ONE_YEAR_MESSAGE = "Start time cannot be more than 1 year ahead";
export const AUTO_JOIN_MIN_INVALID_MESSAGE = "Auto-join minimum must be a whole number of at least 1";
export const AUTO_JOIN_MIN_RANGE_MESSAGE = "Auto-join minimum cannot exceed capacity";

export type ParseAutoJoinMinResult = { ok: true; value: number | null } | { ok: false; message: string };

const WHOLE_NUMBER_RE = /^-?\d+$/;

/**
 * Empty/whitespace → unset (`null`). Otherwise a whole number `1 … maxParticipants`.
 * `0` is invalid, not unset. Callers use `message` constants — never `Error.message`.
 */
export function parseAutoJoinMin(raw: string, maxParticipants: number): ParseAutoJoinMinResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }

  if (!WHOLE_NUMBER_RE.test(trimmed)) {
    return { ok: false, message: AUTO_JOIN_MIN_INVALID_MESSAGE };
  }

  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value < 1) {
    return { ok: false, message: AUTO_JOIN_MIN_INVALID_MESSAGE };
  }

  if (value > maxParticipants) {
    return { ok: false, message: AUTO_JOIN_MIN_RANGE_MESSAGE };
  }

  return { ok: true, value };
}

function resolveNow(now?: Date | number): number {
  if (now === undefined) return Date.now();
  return typeof now === "number" ? now : now.getTime();
}

/**
 * Inclusive one-year horizon from `now` (`setFullYear(+1)`).
 * Callers that also check “in the future” must pass the same `now`.
 */
export function oneYearAhead(now?: Date | number): Date {
  const max = new Date(resolveNow(now));
  max.setFullYear(max.getFullYear() + 1);
  return max;
}

/**
 * Parsed capacity is allowed when it is a positive integer ≤ `MAX_RUN_CAPACITY`,
 * or when it is unchanged from `existingCapacity` (grandfather values > 64).
 */
export function isAllowedRunCapacity(capacity: number, existingCapacity?: number): boolean {
  if (!Number.isFinite(capacity) || capacity < 1) return false;
  if (existingCapacity !== undefined && capacity === existingCapacity) return true;
  return capacity <= MAX_RUN_CAPACITY;
}

export function isStartsAtInFuture(date: Date, now?: Date | number): boolean {
  return date.getTime() > resolveNow(now);
}

export function isStartsAtWithinOneYear(date: Date, now?: Date | number): boolean {
  return date.getTime() <= oneYearAhead(now).getTime();
}
