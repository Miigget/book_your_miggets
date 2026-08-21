import type { Enums } from "@/types/database";
import { isUuid, type AppSupabaseClient } from "@/lib/services/runs";

const GENERIC_MUTATION = "Could not update friend request";
const BOTH_VERIFIED = "Both members must be verified to become friends.";
const ONLY_VERIFIED = "Only verified members can send or manage friend requests.";

export class FriendsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriendsError";
  }
}

export type FriendRelationshipStatus = "none" | "outgoing_pending" | "incoming_pending" | "accepted";

export interface FriendRelationship {
  status: FriendRelationshipStatus;
  requestId: string | null;
}

export interface PublicFriend {
  id: string;
  nickname: string | null;
}

export interface FriendInboxRow {
  id: string;
  userId: string;
  nickname: string | null;
}

interface FriendRequestRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: Enums<"friend_request_status">;
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

function nicknameOf(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function compareNicknameNullsLast(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

async function loadPairRow(supabase: AppSupabaseClient, a: string, b: string): Promise<FriendRequestRow | null> {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("id, sender_id, receiver_id, status")
    .in("sender_id", [a, b])
    .in("receiver_id", [a, b])
    .maybeSingle();

  if (error) {
    console.error("load friend pair failed", error);
    throw new FriendsError(GENERIC_MUTATION);
  }

  return data;
}

async function verifiedIdSet(supabase: AppSupabaseClient, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter((id) => isUuid(id)))];
  if (unique.length === 0) return new Set();

  const { data, error } = await supabase.from("public_profiles").select("id, is_verified").in("id", unique);

  if (error) {
    console.error("friend verification lookup failed", error);
    throw new FriendsError(GENERIC_MUTATION);
  }

  const verified = new Set<string>();
  for (const row of data) {
    if (row.id && row.is_verified) verified.add(row.id);
  }
  return verified;
}

async function bothCurrentlyVerified(supabase: AppSupabaseClient, a: string, b: string): Promise<boolean> {
  const verified = await verifiedIdSet(supabase, [a, b]);
  return verified.has(a) && verified.has(b);
}

async function requireVerifiedViewer(supabase: AppSupabaseClient, viewerId: string): Promise<void> {
  const verified = await verifiedIdSet(supabase, [viewerId]);
  if (!verified.has(viewerId)) {
    throw new FriendsError(ONLY_VERIFIED);
  }
}

async function requireBothVerified(supabase: AppSupabaseClient, viewerId: string, otherId: string): Promise<void> {
  if (!(await bothCurrentlyVerified(supabase, viewerId, otherId))) {
    throw new FriendsError(BOTH_VERIFIED);
  }
}

function noneRelationship(): FriendRelationship {
  return { status: "none", requestId: null };
}

/**
 * Live relationship for CTAs. Declined rows map to `none` (reopen is internal to `sendFriendRequest`).
 * Unverified either party → `{ status: "none", requestId: null }` and pending is not returned.
 */
export async function getRelationship(
  supabase: AppSupabaseClient,
  viewerId: string,
  otherId: string,
): Promise<FriendRelationship> {
  if (!isUuid(viewerId) || !isUuid(otherId) || viewerId === otherId) {
    return noneRelationship();
  }

  if (!(await bothCurrentlyVerified(supabase, viewerId, otherId))) {
    return noneRelationship();
  }

  const row = await loadPairRow(supabase, viewerId, otherId);
  if (!row) return noneRelationship();

  if (row.status === "pending" && row.sender_id === viewerId) {
    return { status: "outgoing_pending", requestId: row.id };
  }
  if (row.status === "pending" && row.receiver_id === viewerId) {
    return { status: "incoming_pending", requestId: row.id };
  }
  if (row.status === "accepted") {
    return { status: "accepted", requestId: null };
  }

  return noneRelationship();
}

export async function listPublicFriends(supabase: AppSupabaseClient, userId: string): Promise<PublicFriend[]> {
  if (!isUuid(userId)) return [];

  const { data: edges, error } = await supabase.from("public_friendships").select("friend_id").eq("user_id", userId);

  if (error) {
    console.error("listPublicFriends failed", error);
    throw new FriendsError("Could not load friends");
  }

  const friendIds = [
    ...new Set(edges.map((edge) => edge.friend_id).filter((id): id is string => typeof id === "string" && isUuid(id))),
  ];
  if (friendIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("public_profiles")
    .select("id, nickname")
    .in("id", friendIds);

  if (profileError) {
    console.error("listPublicFriends nicknames failed", profileError);
    throw new FriendsError("Could not load friends");
  }

  const friends: PublicFriend[] = [];
  for (const profile of profiles) {
    if (!profile.id) continue;
    friends.push({ id: profile.id, nickname: nicknameOf(profile.nickname) });
  }

  friends.sort((a, b) => compareNicknameNullsLast(a.nickname, b.nickname));
  return friends;
}

async function nicknamesByVerifiedId(
  supabase: AppSupabaseClient,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(userIds.filter((id) => isUuid(id)))];
  if (unique.length === 0) return new Map();

  const { data: profiles, error } = await supabase
    .from("public_profiles")
    .select("id, nickname, is_verified")
    .in("id", unique);

  if (error) {
    console.error("pending friend nicknames failed", error);
    throw new FriendsError("Could not load friend requests");
  }

  const byId = new Map<string, string | null>();
  for (const profile of profiles) {
    if (!profile.id || !profile.is_verified) continue;
    byId.set(profile.id, nicknameOf(profile.nickname));
  }
  return byId;
}

export async function listIncomingPending(supabase: AppSupabaseClient, viewerId: string): Promise<FriendInboxRow[]> {
  if (!isUuid(viewerId)) return [];

  const verified = await verifiedIdSet(supabase, [viewerId]);
  if (!verified.has(viewerId)) return [];

  const { data: rows, error } = await supabase
    .from("friend_requests")
    .select("id, sender_id")
    .eq("receiver_id", viewerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("list incoming pending friends failed", error);
    throw new FriendsError("Could not load friend requests");
  }

  const byId = await nicknamesByVerifiedId(
    supabase,
    rows.map((row) => row.sender_id),
  );
  const inbox: FriendInboxRow[] = [];
  for (const row of rows) {
    const nickname = byId.get(row.sender_id);
    if (nickname === undefined) continue;
    inbox.push({ id: row.id, userId: row.sender_id, nickname });
  }
  return inbox;
}

export async function listOutgoingPending(supabase: AppSupabaseClient, viewerId: string): Promise<FriendInboxRow[]> {
  if (!isUuid(viewerId)) return [];

  const verified = await verifiedIdSet(supabase, [viewerId]);
  if (!verified.has(viewerId)) return [];

  const { data: rows, error } = await supabase
    .from("friend_requests")
    .select("id, receiver_id")
    .eq("sender_id", viewerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("list outgoing pending friends failed", error);
    throw new FriendsError("Could not load friend requests");
  }

  const byId = await nicknamesByVerifiedId(
    supabase,
    rows.map((row) => row.receiver_id),
  );
  const inbox: FriendInboxRow[] = [];
  for (const row of rows) {
    const nickname = byId.get(row.receiver_id);
    if (nickname === undefined) continue;
    inbox.push({ id: row.id, userId: row.receiver_id, nickname });
  }
  return inbox;
}

async function reopenDeclined(
  supabase: AppSupabaseClient,
  viewerId: string,
  targetId: string,
  requestId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("friend_requests")
    .update({
      sender_id: viewerId,
      receiver_id: targetId,
      status: "pending",
    })
    .eq("id", requestId)
    .eq("status", "declined")
    .select("id");

  if (error) {
    console.error("reopen declined friend request failed", error);
    throw new FriendsError(GENERIC_MUTATION);
  }

  if (data.length === 0) {
    throw new FriendsError(GENERIC_MUTATION);
  }
}

async function insertPending(supabase: AppSupabaseClient, viewerId: string, targetId: string): Promise<void> {
  const { data, error } = await supabase
    .from("friend_requests")
    .insert({
      sender_id: viewerId,
      receiver_id: targetId,
      status: "pending",
    })
    .select("id");

  if (error) {
    console.error("sendFriendRequest insert failed", error);
    if (isUniqueViolation(error)) {
      const row = await loadPairRow(supabase, viewerId, targetId);
      if (row?.status === "accepted") {
        throw new FriendsError("You are already friends.");
      }
      if (row?.status === "pending" && row.sender_id === viewerId) {
        throw new FriendsError("Friend request already sent.");
      }
      if (row?.status === "pending" && row.receiver_id === viewerId) {
        await acceptFriendRequest(supabase, viewerId, row.id);
        return;
      }
      if (row?.status === "declined") {
        await reopenDeclined(supabase, viewerId, targetId, row.id);
        return;
      }
    }
    throw new FriendsError(GENERIC_MUTATION);
  }

  if (data.length === 0) {
    throw new FriendsError(GENERIC_MUTATION);
  }
}

export async function sendFriendRequest(
  supabase: AppSupabaseClient,
  viewerId: string,
  targetId: string,
): Promise<void> {
  if (!isUuid(viewerId) || !isUuid(targetId)) {
    throw new FriendsError("Invalid player");
  }
  if (viewerId === targetId) {
    throw new FriendsError("You cannot send a friend request to yourself.");
  }

  await requireVerifiedViewer(supabase, viewerId);
  await requireBothVerified(supabase, viewerId, targetId);

  const row = await loadPairRow(supabase, viewerId, targetId);
  if (row?.status === "pending" && row.receiver_id === viewerId) {
    await acceptFriendRequest(supabase, viewerId, row.id);
    return;
  }
  if (row?.status === "accepted") {
    throw new FriendsError("You are already friends.");
  }
  if (row?.status === "pending" && row.sender_id === viewerId) {
    throw new FriendsError("Friend request already sent.");
  }
  if (row?.status === "declined") {
    await reopenDeclined(supabase, viewerId, targetId, row.id);
    return;
  }

  await insertPending(supabase, viewerId, targetId);
}

export async function acceptFriendRequest(
  supabase: AppSupabaseClient,
  viewerId: string,
  requestId: string,
): Promise<void> {
  if (!isUuid(viewerId) || !isUuid(requestId)) {
    throw new FriendsError("Invalid request");
  }

  await requireVerifiedViewer(supabase, viewerId);

  const { data: existing, error: loadError } = await supabase
    .from("friend_requests")
    .select("id, sender_id, receiver_id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (loadError) {
    console.error("acceptFriendRequest load failed", loadError);
    throw new FriendsError(GENERIC_MUTATION);
  }

  if (existing?.status !== "pending" || existing.receiver_id !== viewerId) {
    throw new FriendsError(GENERIC_MUTATION);
  }

  await requireBothVerified(supabase, viewerId, existing.sender_id);

  const { data, error } = await supabase
    .from("friend_requests")
    .update({ status: "accepted" })
    .eq("id", requestId)
    .eq("receiver_id", viewerId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("acceptFriendRequest failed", error);
    throw new FriendsError(GENERIC_MUTATION);
  }

  if (data.length === 0) {
    throw new FriendsError(GENERIC_MUTATION);
  }
}

export async function declineFriendRequest(
  supabase: AppSupabaseClient,
  viewerId: string,
  requestId: string,
): Promise<void> {
  if (!isUuid(viewerId) || !isUuid(requestId)) {
    throw new FriendsError("Invalid request");
  }

  await requireVerifiedViewer(supabase, viewerId);

  const { data, error } = await supabase
    .from("friend_requests")
    .update({ status: "declined" })
    .eq("id", requestId)
    .eq("receiver_id", viewerId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("declineFriendRequest failed", error);
    throw new FriendsError(GENERIC_MUTATION);
  }

  if (data.length === 0) {
    throw new FriendsError(GENERIC_MUTATION);
  }
}

export async function cancelFriendRequest(
  supabase: AppSupabaseClient,
  viewerId: string,
  requestId: string,
): Promise<void> {
  if (!isUuid(viewerId) || !isUuid(requestId)) {
    throw new FriendsError("Invalid request");
  }

  await requireVerifiedViewer(supabase, viewerId);

  const { data, error } = await supabase
    .from("friend_requests")
    .delete()
    .eq("id", requestId)
    .eq("sender_id", viewerId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("cancelFriendRequest failed", error);
    throw new FriendsError(GENERIC_MUTATION);
  }

  if (data.length === 0) {
    throw new FriendsError(GENERIC_MUTATION);
  }
}

export async function unfriend(supabase: AppSupabaseClient, viewerId: string, otherId: string): Promise<void> {
  if (!isUuid(viewerId) || !isUuid(otherId)) {
    throw new FriendsError("Invalid player");
  }
  if (viewerId === otherId) {
    throw new FriendsError(GENERIC_MUTATION);
  }

  await requireVerifiedViewer(supabase, viewerId);

  const row = await loadPairRow(supabase, viewerId, otherId);
  if (row?.status !== "accepted") {
    throw new FriendsError("You are not friends.");
  }

  const { data, error } = await supabase
    .from("friend_requests")
    .delete()
    .eq("id", row.id)
    .eq("status", "accepted")
    .select("id");

  if (error) {
    console.error("unfriend failed", error);
    throw new FriendsError(GENERIC_MUTATION);
  }

  if (data.length === 0) {
    throw new FriendsError(GENERIC_MUTATION);
  }
}
