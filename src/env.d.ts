declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    profile: { role: "member" | "admin"; isBanned: boolean; nickname: string | null } | null;
  }
}
