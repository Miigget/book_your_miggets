import { SUPABASE_URL } from "astro:env/server";

/** True only during `astro dev` against a local Supabase URL. Safe for page imports. */
export function isDevQuickLoginEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  if (!SUPABASE_URL) return false;
  try {
    const host = new URL(SUPABASE_URL).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}
