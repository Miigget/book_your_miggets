import type { AppSupabaseClient } from "@/lib/services/runs";
import { isUuid } from "@/lib/services/runs";

const NICKNAME_MAX_LENGTH = 32;

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileError";
  }
}

export interface OwnProfile {
  id: string;
  nickname: string | null;
  isVerified: boolean;
  kogPoints: number | null;
  kogPointsVerified: boolean;
}

export interface PublicProfile {
  id: string;
  nickname: string | null;
  isVerified: boolean;
  kogPoints: number | null;
  kogPointsVerified: boolean;
}

export interface PendingNicknameRequest {
  id: string;
  requestedNickname: string;
  createdAt: string;
  updatedAt: string;
}

function nicknameKey(value: string): string {
  return value.trim().toLowerCase();
}

function escapeIlikeExact(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

export function parseNickname(raw: string): string {
  const nickname = raw.trim();
  if (!nickname) {
    throw new ProfileError("Nickname is required");
  }
  if (nickname.length > NICKNAME_MAX_LENGTH) {
    throw new ProfileError("Nickname must be 32 characters or fewer");
  }
  return nickname;
}

export function parseKogPoints(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) {
    throw new ProfileError("KoG points must be a whole number 0 or greater");
  }
  const points = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(points) || points < 0) {
    throw new ProfileError("KoG points must be a whole number 0 or greater");
  }
  return points;
}

async function findProfileIdByNickname(supabase: AppSupabaseClient, nickname: string): Promise<string | null> {
  const key = nicknameKey(nickname);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname")
    .ilike("nickname", escapeIlikeExact(nickname.trim()))
    .maybeSingle();

  if (error) {
    console.error("nickname uniqueness lookup failed", error);
    throw new ProfileError("Could not check nickname");
  }

  if (!data?.nickname || nicknameKey(data.nickname) !== key) {
    return null;
  }

  return data.id;
}

export async function getOwnProfile(supabase: AppSupabaseClient, userId: string): Promise<OwnProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, is_verified, kog_points, kog_points_verified")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("getOwnProfile failed", error);
    throw new ProfileError("Could not load your profile");
  }

  if (!data) {
    throw new ProfileError("Could not load your profile");
  }

  return {
    id: data.id,
    nickname: data.nickname?.trim() ? data.nickname.trim() : null,
    isVerified: data.is_verified,
    kogPoints: data.kog_points,
    kogPointsVerified: data.kog_points_verified,
  };
}

export async function getPublicProfile(supabase: AppSupabaseClient, userId: string): Promise<PublicProfile | null> {
  if (!isUuid(userId)) return null;

  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, nickname, is_verified, kog_points, kog_points_verified")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("getPublicProfile failed", error);
    throw new ProfileError("Could not load this profile");
  }

  if (!data?.id) return null;

  return {
    id: data.id,
    nickname: data.nickname?.trim() ? data.nickname.trim() : null,
    isVerified: Boolean(data.is_verified),
    kogPoints: data.kog_points,
    kogPointsVerified: Boolean(data.kog_points_verified),
  };
}

export async function getPendingNicknameRequest(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<PendingNicknameRequest | null> {
  const { data, error } = await supabase
    .from("nickname_change_requests")
    .select("id, requested_nickname, created_at, updated_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    console.error("getPendingNicknameRequest failed", error);
    throw new ProfileError("Could not load nickname request");
  }

  if (!data) return null;

  return {
    id: data.id,
    requestedNickname: data.requested_nickname,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function setOwnNickname(supabase: AppSupabaseClient, userId: string, rawNickname: string): Promise<void> {
  const own = await getOwnProfile(supabase, userId);
  if (own.isVerified) {
    throw new ProfileError("Verified nicknames are locked. Request a change instead.");
  }

  const nickname = parseNickname(rawNickname);
  const takenBy = await findProfileIdByNickname(supabase, nickname);
  if (takenBy && takenBy !== userId) {
    throw new ProfileError("That nickname is already taken.");
  }

  const { data, error } = await supabase.from("profiles").update({ nickname }).eq("id", userId).select("id");

  if (error) {
    console.error("setOwnNickname failed", error);
    if (isUniqueViolation(error)) {
      throw new ProfileError("That nickname is already taken.");
    }
    throw new ProfileError("Could not save nickname");
  }

  if (data.length === 0) {
    throw new ProfileError("Could not save nickname");
  }
}

async function updatePendingNicknameRequest(
  supabase: AppSupabaseClient,
  userId: string,
  nickname: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("nickname_change_requests")
    .update({ requested_nickname: nickname, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("update pending nickname request failed", error);
    throw new ProfileError("Could not submit nickname request");
  }

  return data.length > 0;
}

export async function submitNicknameChangeRequest(
  supabase: AppSupabaseClient,
  userId: string,
  rawNickname: string,
): Promise<void> {
  const own = await getOwnProfile(supabase, userId);
  if (!own.isVerified) {
    throw new ProfileError("Only verified members can request a nickname change.");
  }

  const nickname = parseNickname(rawNickname);
  if (own.nickname && nicknameKey(nickname) === nicknameKey(own.nickname)) {
    throw new ProfileError("That's already your nickname.");
  }

  const takenBy = await findProfileIdByNickname(supabase, nickname);
  if (takenBy && takenBy !== userId) {
    throw new ProfileError("That nickname is already taken.");
  }

  const pending = await getPendingNicknameRequest(supabase, userId);
  if (pending) {
    await updatePendingNicknameRequest(supabase, userId, nickname);
    return;
  }

  const { error } = await supabase.from("nickname_change_requests").insert({
    user_id: userId,
    requested_nickname: nickname,
    status: "pending",
  });

  if (!error) return;

  if (isUniqueViolation(error)) {
    const replaced = await updatePendingNicknameRequest(supabase, userId, nickname);
    if (replaced) return;
  }

  console.error("submitNicknameChangeRequest failed", error);
  throw new ProfileError("Could not submit nickname request");
}

export async function setOwnKogPoints(supabase: AppSupabaseClient, userId: string, rawPoints: string): Promise<void> {
  const kogPoints = parseKogPoints(rawPoints);

  const { data, error } = await supabase
    .from("profiles")
    .update({ kog_points: kogPoints })
    .eq("id", userId)
    .select("id");

  if (error) {
    console.error("setOwnKogPoints failed", error);
    throw new ProfileError("Could not save KoG points");
  }

  if (data.length === 0) {
    throw new ProfileError("Could not save KoG points");
  }
}
