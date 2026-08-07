/** Shared locale formatting for run start times (list + detail). */
export function formatStart(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
