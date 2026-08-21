/** Shared locale formatting for run start times (list + detail). */

const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Cloudflare Worker `Request.cf.timezone` (IANA), plus the `cf-timezone` header fallback. */
export function getRequestTimeZone(request: Request): string | undefined {
  const cf = (request as Request & { cf?: { timezone?: string } }).cf;
  if (typeof cf?.timezone === "string" && cf.timezone.length > 0) {
    return cf.timezone;
  }
  const header = request.headers.get("cf-timezone");
  return header && header.length > 0 ? header : undefined;
}

/** Format a Date as a `datetime-local` value in the runtime's local calendar. */
export function formatLocalDatetimeValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Parse a `datetime-local` value as wall-clock local time.
 * `new Date("YYYY-MM-DDTHH:mm")` is implementation-defined (UTC vs local); component construction is not.
 */
export function parseLocalDatetime(value: string): Date | null {
  const match = LOCAL_DATETIME_RE.exec(value.trim());
  if (!match) return null;
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = secondStr ? Number(secondStr) : 0;
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }
  return date;
}

export function formatStart(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  };
  if (timeZone) {
    try {
      return date.toLocaleString("en-US", { ...options, timeZone });
    } catch {
      // Invalid IANA zone from cf — fall through to runtime default.
    }
  }
  return date.toLocaleString("en-US", options);
}
