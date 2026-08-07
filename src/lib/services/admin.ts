import type { Enums } from "@/types/database";
import type { AppSupabaseClient } from "@/lib/services/runs";

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

export interface AdminProfileRow {
  id: string;
  nickname: string | null;
  role: Enums<"user_role">;
  is_verified: boolean;
  is_banned: boolean;
  created_at: string;
}

export async function listProfilesForAdmin(supabase: AppSupabaseClient): Promise<AdminProfileRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, role, is_verified, is_banned, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("listProfilesForAdmin failed", error);
    throw new AdminError("Could not load users");
  }

  return data;
}

export async function deleteRunAsAdmin(supabase: AppSupabaseClient, runId: string): Promise<void> {
  const { data, error } = await supabase.from("runs").delete().eq("id", runId).select("id");

  if (error) {
    console.error("deleteRunAsAdmin failed", error);
    throw new AdminError("Could not delete this run");
  }

  // RLS yields zero rows (not an error) when the caller lacks the admin
  // DELETE policy or the run is already gone.
  if (data.length === 0) {
    throw new AdminError("Could not delete this run");
  }
}

export async function setUserBanned(supabase: AppSupabaseClient, userId: string, banned: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_banned: banned })
    .eq("id", userId)
    .select("id, is_banned");

  if (error) {
    console.error("setUserBanned failed", error);
    throw new AdminError(banned ? "Could not ban this user" : "Could not unban this user");
  }

  // Zero rows = RLS filtered the target; a mismatched flag = the
  // privileged-columns trigger reset it (caller not admin).
  if (data.length === 0 || data[0].is_banned !== banned) {
    throw new AdminError(banned ? "Could not ban this user" : "Could not unban this user");
  }
}

export async function setUserVerified(supabase: AppSupabaseClient, userId: string, verified: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_verified: verified })
    .eq("id", userId)
    .select("id, is_verified");

  if (error) {
    console.error("setUserVerified failed", error);
    throw new AdminError(verified ? "Could not verify this user" : "Could not unverify this user");
  }

  if (data.length === 0 || data[0].is_verified !== verified) {
    throw new AdminError(verified ? "Could not verify this user" : "Could not unverify this user");
  }
}
