import type { Enums } from "@/types/database";
import {
  ProfileError,
  findProfileIdByNickname,
  getPendingNicknameRequest,
  parseKogPoints,
  parseNickname,
} from "@/lib/services/profile";
import { isUuid, type AppSupabaseClient } from "@/lib/services/runs";

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

function nicknameKey(value: string): string {
  return value.trim().toLowerCase();
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

function asAdminError(err: unknown, fallback: string): never {
  if (err instanceof AdminError) throw err;
  if (err instanceof ProfileError) throw new AdminError(err.message);
  console.error(fallback, err);
  throw new AdminError(fallback);
}

export interface AdminProfileRow {
  id: string;
  nickname: string | null;
  role: Enums<"user_role">;
  is_verified: boolean;
  is_banned: boolean;
  created_at: string;
  hasPendingNicknameRequest: boolean;
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

  const { data: pendingRows, error: pendingError } = await supabase
    .from("nickname_change_requests")
    .select("user_id")
    .eq("status", "pending");

  if (pendingError) {
    console.error("listProfilesForAdmin pending nickname requests failed", pendingError);
    return data.map((row) => ({ ...row, hasPendingNicknameRequest: false }));
  }

  const pendingUserIds = new Set(pendingRows.map((row) => row.user_id));
  return data.map((row) => ({ ...row, hasPendingNicknameRequest: pendingUserIds.has(row.id) }));
}

export interface AdminPlayerProfile {
  id: string;
  nickname: string | null;
  kog_points: number | null;
  kog_points_verified: boolean;
}

/** Header for `/admin/users/{id}` — id + nickname + points. Do not return role/verified/banned. */
export async function getProfileForAdmin(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<AdminPlayerProfile | null> {
  if (!isUuid(userId)) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, kog_points, kog_points_verified")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("getProfileForAdmin failed", error);
    throw new AdminError("Could not load this player");
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
  if (!verified) {
    await denyPendingNicknameRequestIfAny(supabase, userId);
  }

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

async function loadPendingNicknameRequest(supabase: AppSupabaseClient, userId: string) {
  try {
    return await getPendingNicknameRequest(supabase, userId);
  } catch (err) {
    asAdminError(err, "Could not load nickname request");
  }
}

async function closePendingNicknameRequest(
  supabase: AppSupabaseClient,
  userId: string,
  nickname: string,
): Promise<void> {
  const pending = await loadPendingNicknameRequest(supabase, userId);
  if (!pending) return;

  const status = nicknameKey(pending.requestedNickname) === nicknameKey(nickname) ? "accepted" : "denied";
  const { error } = await supabase
    .from("nickname_change_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("status", "pending");

  if (error) {
    console.error("closePendingNicknameRequest failed", error);
    throw new AdminError("Could not update nickname request");
  }
}

export async function setAdminNickname(supabase: AppSupabaseClient, userId: string, raw: string): Promise<void> {
  let nickname: string;
  try {
    nickname = parseNickname(raw);
  } catch (err) {
    asAdminError(err, "Could not save nickname");
  }

  let takenBy: string | null;
  try {
    takenBy = await findProfileIdByNickname(supabase, nickname);
  } catch (err) {
    asAdminError(err, "Could not save nickname");
  }

  if (takenBy && takenBy !== userId) {
    throw new AdminError("That nickname is already taken.");
  }

  const { data, error } = await supabase.from("profiles").update({ nickname }).eq("id", userId).select("id");

  if (error) {
    console.error("setAdminNickname failed", error);
    if (isUniqueViolation(error)) {
      throw new AdminError("That nickname is already taken.");
    }
    throw new AdminError("Could not save nickname");
  }

  if (data.length === 0) {
    throw new AdminError("Could not save nickname");
  }

  await closePendingNicknameRequest(supabase, userId, nickname);
}

export async function setAdminKogPoints(supabase: AppSupabaseClient, userId: string, raw: string): Promise<void> {
  let kogPoints: number | null;
  try {
    kogPoints = parseKogPoints(raw);
  } catch (err) {
    asAdminError(err, "Could not save KoG points");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ kog_points: kogPoints })
    .eq("id", userId)
    .select("id");

  if (error) {
    console.error("setAdminKogPoints failed", error);
    throw new AdminError("Could not save KoG points");
  }

  if (data.length === 0) {
    throw new AdminError("Could not save KoG points");
  }
}

export async function setKogPointsVerified(
  supabase: AppSupabaseClient,
  userId: string,
  verified: boolean,
): Promise<void> {
  if (verified) {
    const { data: current, error: loadError } = await supabase
      .from("profiles")
      .select("id, kog_points")
      .eq("id", userId)
      .maybeSingle();

    if (loadError) {
      console.error("setKogPointsVerified load failed", loadError);
      throw new AdminError("Could not mark KoG points as checked in-game");
    }

    if (!current) {
      throw new AdminError("Could not mark KoG points as checked in-game");
    }

    if (current.kog_points === null) {
      throw new AdminError("Set KoG points before marking them checked in-game.");
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ kog_points_verified: verified })
    .eq("id", userId)
    .select("id, kog_points_verified");

  if (error) {
    console.error("setKogPointsVerified failed", error);
    throw new AdminError(verified ? "Could not mark KoG points as checked in-game" : "Could not unmark KoG points");
  }

  if (data.length === 0 || data[0].kog_points_verified !== verified) {
    throw new AdminError(verified ? "Could not mark KoG points as checked in-game" : "Could not unmark KoG points");
  }
}

export async function acceptNicknameChangeRequest(supabase: AppSupabaseClient, userId: string): Promise<void> {
  const pending = await loadPendingNicknameRequest(supabase, userId);
  if (!pending) {
    throw new AdminError("No pending nickname request");
  }

  const nickname = pending.requestedNickname;
  let takenBy: string | null;
  try {
    takenBy = await findProfileIdByNickname(supabase, nickname);
  } catch (err) {
    asAdminError(err, "Could not accept nickname request");
  }

  if (takenBy && takenBy !== userId) {
    throw new AdminError("That nickname is already taken.");
  }

  const { data, error } = await supabase.from("profiles").update({ nickname }).eq("id", userId).select("id");

  if (error) {
    console.error("acceptNicknameChangeRequest nickname failed", error);
    if (isUniqueViolation(error)) {
      throw new AdminError("That nickname is already taken.");
    }
    throw new AdminError("Could not accept nickname request");
  }

  if (data.length === 0) {
    throw new AdminError("Could not accept nickname request");
  }

  const { data: updated, error: statusError } = await supabase
    .from("nickname_change_requests")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id");

  if (statusError) {
    console.error("acceptNicknameChangeRequest status failed", statusError);
    throw new AdminError("Could not accept nickname request");
  }

  if (updated.length === 0) {
    throw new AdminError("Could not accept nickname request");
  }
}

export async function denyNicknameChangeRequest(supabase: AppSupabaseClient, userId: string): Promise<void> {
  const pending = await loadPendingNicknameRequest(supabase, userId);
  if (!pending) {
    throw new AdminError("No pending nickname request");
  }

  const { data, error } = await supabase
    .from("nickname_change_requests")
    .update({ status: "denied", updated_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("denyNicknameChangeRequest failed", error);
    throw new AdminError("Could not deny nickname request");
  }

  if (data.length === 0) {
    throw new AdminError("Could not deny nickname request");
  }
}

export async function denyPendingNicknameRequestIfAny(supabase: AppSupabaseClient, userId: string): Promise<void> {
  const pending = await loadPendingNicknameRequest(supabase, userId);
  if (!pending) return;

  const { data, error } = await supabase
    .from("nickname_change_requests")
    .update({ status: "denied", updated_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("denyPendingNicknameRequestIfAny failed", error);
    throw new AdminError("Could not deny nickname request");
  }

  if (data.length === 0) {
    throw new AdminError("Could not deny nickname request");
  }
}
