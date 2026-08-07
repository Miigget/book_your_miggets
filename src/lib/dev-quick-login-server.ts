import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "astro:env/server";
import { isDevQuickLoginEnabled } from "@/lib/dev-quick-login";
import type { Database } from "@/types/database";

/** Local Supabase CLI demo service_role key — never used unless DEV + localhost URL. */
const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export const DEV_QUICK_LOGIN_ACCOUNTS = {
  avolicious: {
    email: "avolicious@local.test",
    password: "dev-quick-login-avolicious",
    nickname: "Avolicious",
  },
  qshar: {
    email: "qshar@local.test",
    password: "dev-quick-login-qshar",
    nickname: "QshaR",
  },
} as const;

export type DevQuickLoginAccountId = keyof typeof DEV_QUICK_LOGIN_ACCOUNTS;

export function resolveDevQuickLoginAccount(raw: FormDataEntryValue | null): DevQuickLoginAccountId | null {
  if (typeof raw !== "string") return null;
  if (raw === "avolicious" || raw === "qshar") return raw;
  return null;
}

export function createLocalServiceRoleClient() {
  if (!isDevQuickLoginEnabled() || !SUPABASE_URL) return null;
  return createSupabaseJsClient<Database>(SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
