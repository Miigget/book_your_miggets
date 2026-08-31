import { FriendsError, listPublicFriends } from "@/lib/services/friends";
import { isUuid, type AppSupabaseClient } from "@/lib/services/runs";
import {
  assertPublicImageFile,
  CLAN_PICTURES_BUCKET,
  clanPictureObjectPath,
  PICTURE_REJECT_MESSAGE,
  removeObject,
  StorageImageError,
  uploadPublicImage,
} from "@/lib/storage";

export const CLAN_NAME_MAX_LENGTH = 100;
export const CLAN_TAG_MAX_LENGTH = 16;

export const CLAN_VERIFIED_ONLY =
  "Clans require a verified account. Ask an admin to verify you before you can create a clan.";
export const CLAN_NICKNAME_LOCKED = "Verified nicknames are locked. Request a change on your profile.";
export const CLAN_ALREADY_MEMBER = "You already belong to a clan.";
export const CLAN_TAG_TAKEN = "That clan tag is already taken.";
export const CLAN_PICTURE_REJECT = PICTURE_REJECT_MESSAGE;
export const CLAN_CREATE_FAILED = "Could not create clan";
export const CLAN_UPDATE_FAILED = "Could not update clan";
export const CLAN_DELETE_FAILED = "Could not delete this clan";
export const CLAN_LOAD_FAILED = "Could not load clans";
/** Send-path copy for the owner. Do not reuse CLAN_ALREADY_MEMBER (first-person viewer/Accept). */
export const CLAN_INVITEE_ALREADY_MEMBER = "They already belong to a clan.";
export const CLAN_INVITE_MUST_BE_FRIENDS = "Invitees must be friends with you.";
export const CLAN_INVITE_MUST_BE_FRIENDS_WITH_OWNER = "You must be friends with the clan owner.";
export const CLAN_INVITE_NOT_OWNER = "You can only invite friends into a clan you own.";
export const CLAN_INVITE_NOT_PENDING = "That clan invite is not pending.";
export const CLAN_INVITE_PICK_AT_LEAST_ONE = "Pick at least one friend.";
export const CLAN_INVITE_ALREADY_PENDING = "That friend is already invited.";
export const CLAN_INVITE_SEND_FAILED = "Could not send clan invite";
export const CLAN_INVITE_UPDATE_FAILED = "Could not update clan invite";
export const CLAN_INVITE_LOAD_FAILED = "Could not load clan invites";

export class ClanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClanError";
  }
}

export interface ClanMembership {
  clanId: string;
}

export interface ClanMember {
  id: string;
  nickname: string | null;
}

export interface ClanListItem {
  id: string;
  name: string;
  tag: string;
  points: number;
  picturePath: string | null;
}

export interface ClanDetail extends ClanListItem {
  ownerId: string;
  members: ClanMember[];
}

export interface ClanInvitee {
  id: string;
  nickname: string | null;
}

export interface ClanInviteInboxRow {
  id: string;
  clanId: string;
  clanName: string;
  clanTag: string;
  userId: string;
  nickname: string | null;
}

interface PostgrestErrorBlob {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
}

function nicknameOf(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

export function parseClanName(raw: string): string {
  const name = raw.trim();
  if (!name) {
    throw new ClanError("Clan name is required");
  }
  if (name.length > CLAN_NAME_MAX_LENGTH) {
    throw new ClanError(`Clan name must be ${CLAN_NAME_MAX_LENGTH} characters or fewer`);
  }
  return name;
}

export function parseClanTag(raw: string): string {
  const tag = raw.trim();
  if (!tag) {
    throw new ClanError("Clan tag is required");
  }
  if (tag.length > CLAN_TAG_MAX_LENGTH) {
    throw new ClanError(`Clan tag must be ${CLAN_TAG_MAX_LENGTH} characters or fewer`);
  }
  return tag;
}

function mapClanCreateConstraintError(error: PostgrestErrorBlob): ClanError | null {
  if (error.code !== "23505") return null;
  const blob = `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (blob.includes("clans_tag_lower_btrim_uidx")) {
    return new ClanError(CLAN_TAG_TAKEN);
  }
  if (blob.includes("clan_members_pkey")) {
    return new ClanError(CLAN_ALREADY_MEMBER);
  }
  return null;
}

function mapClanInviteConstraintError(error: PostgrestErrorBlob): ClanError | null {
  if (error.code !== "23505") return null;
  const blob = `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (blob.includes("clan_invites_clan_invitee_key")) {
    return new ClanError(CLAN_INVITE_ALREADY_PENDING);
  }
  if (blob.includes("clan_members_pkey")) {
    return new ClanError(CLAN_INVITEE_ALREADY_MEMBER);
  }
  return null;
}

async function loadFriendIdSet(
  supabase: AppSupabaseClient,
  userId: string,
  genericMessage: string,
): Promise<Set<string>> {
  const { data, error } = await supabase.from("public_friendships").select("friend_id").eq("user_id", userId);

  if (error) {
    console.error("load clan invite friend ids failed", error);
    throw new ClanError(genericMessage);
  }

  return new Set(data.map((row) => row.friend_id).filter((id): id is string => typeof id === "string" && isUuid(id)));
}

async function hydrateClanInviteInbox(
  supabase: AppSupabaseClient,
  rows: { id: string; clan_id: string; user_id: string }[],
): Promise<ClanInviteInboxRow[]> {
  if (rows.length === 0) return [];

  const clanIds = [...new Set(rows.map((row) => row.clan_id))];
  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const { data: clans, error: clanError } = await supabase.from("clans").select("id, name, tag").in("id", clanIds);
  if (clanError) {
    console.error("hydrateClanInviteInbox clans failed", clanError);
    throw new ClanError(CLAN_INVITE_LOAD_FAILED);
  }

  const clanById = new Map(clans.map((clan) => [clan.id, clan]));

  const { data: profiles, error: profileError } = await supabase
    .from("public_profiles")
    .select("id, nickname")
    .in("id", userIds);

  if (profileError) {
    console.error("hydrateClanInviteInbox nicknames failed", profileError);
    throw new ClanError(CLAN_INVITE_LOAD_FAILED);
  }

  const nicknameById = new Map<string, string | null>();
  for (const profile of profiles) {
    if (!profile.id) continue;
    nicknameById.set(profile.id, nicknameOf(profile.nickname));
  }

  const inbox: ClanInviteInboxRow[] = [];
  for (const row of rows) {
    const clan = clanById.get(row.clan_id);
    if (!clan) continue;
    inbox.push({
      id: row.id,
      clanId: row.clan_id,
      clanName: clan.name,
      clanTag: clan.tag,
      userId: row.user_id,
      nickname: nicknameById.get(row.user_id) ?? null,
    });
  }
  return inbox;
}

async function requireVerifiedViewer(supabase: AppSupabaseClient, viewerId: string): Promise<void> {
  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, is_verified")
    .eq("id", viewerId)
    .maybeSingle();

  if (error) {
    console.error("clan verification lookup failed", error);
    throw new ClanError(CLAN_CREATE_FAILED);
  }

  if (!data?.is_verified) {
    throw new ClanError(CLAN_VERIFIED_ONLY);
  }
}

export async function getClanMembershipForUser(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<ClanMembership | null> {
  if (!isUuid(userId)) return null;

  const { data, error } = await supabase.from("clan_members").select("clan_id").eq("user_id", userId).maybeSingle();

  if (error) {
    console.error("getClanMembershipForUser failed", error);
    throw new ClanError(CLAN_LOAD_FAILED);
  }

  if (!data) return null;
  return { clanId: data.clan_id };
}

export async function listClans(supabase: AppSupabaseClient): Promise<ClanListItem[]> {
  const { data, error } = await supabase
    .from("clans")
    .select("id, name, tag, points, picture_path")
    .order("points", { ascending: false })
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("listClans failed", error);
    throw new ClanError(CLAN_LOAD_FAILED);
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    tag: row.tag,
    points: row.points,
    picturePath: row.picture_path,
  }));
}

export async function getClanById(supabase: AppSupabaseClient, id: string): Promise<ClanDetail | null> {
  if (!isUuid(id)) return null;

  const { data: clan, error } = await supabase
    .from("clans")
    .select("id, name, tag, points, picture_path, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getClanById failed", error);
    throw new ClanError(CLAN_LOAD_FAILED);
  }

  if (!clan) return null;

  const { data: memberRows, error: memberError } = await supabase
    .from("clan_members")
    .select("user_id")
    .eq("clan_id", clan.id)
    .order("created_at", { ascending: true });

  if (memberError) {
    console.error("getClanById members failed", memberError);
    throw new ClanError(CLAN_LOAD_FAILED);
  }

  const userIds = memberRows.map((row) => row.user_id);
  const members: ClanMember[] = [];

  if (userIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("public_profiles")
      .select("id, nickname")
      .in("id", userIds);

    if (profileError) {
      console.error("getClanById nicknames failed", profileError);
      throw new ClanError(CLAN_LOAD_FAILED);
    }

    const nicknameById = new Map<string, string | null>();
    for (const profile of profiles) {
      if (!profile.id) continue;
      nicknameById.set(profile.id, nicknameOf(profile.nickname));
    }

    for (const userId of userIds) {
      members.push({ id: userId, nickname: nicknameById.get(userId) ?? null });
    }
  }

  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    points: clan.points,
    picturePath: clan.picture_path,
    ownerId: clan.owner_id,
    members,
  };
}

export async function createClan(
  supabase: AppSupabaseClient,
  input: { ownerId: string; name: string; tag: string; pictureFile?: File | null },
): Promise<{ id: string }> {
  const name = parseClanName(input.name);
  const tag = parseClanTag(input.tag);

  await requireVerifiedViewer(supabase, input.ownerId);

  const existing = await getClanMembershipForUser(supabase, input.ownerId);
  if (existing) {
    throw new ClanError(CLAN_ALREADY_MEMBER);
  }

  const clanId = crypto.randomUUID().toLowerCase();
  let picturePath: string | null = null;

  const pictureFile = input.pictureFile;
  if (pictureFile && pictureFile.size > 0) {
    try {
      const { mime, ext } = assertPublicImageFile(pictureFile);
      picturePath = clanPictureObjectPath(input.ownerId, clanId, ext);
      const bytes = new Uint8Array(await pictureFile.arrayBuffer());
      await uploadPublicImage(supabase, {
        bucket: CLAN_PICTURES_BUCKET,
        path: picturePath,
        bytes,
        mime,
      });
    } catch (err) {
      if (err instanceof StorageImageError) {
        throw new ClanError(CLAN_PICTURE_REJECT);
      }
      console.error("clan picture upload failed", err);
      throw new ClanError(CLAN_CREATE_FAILED);
    }
  }

  const { data, error } = await supabase
    .from("clans")
    .insert({
      id: clanId,
      owner_id: input.ownerId,
      name,
      tag,
      picture_path: picturePath,
    })
    .select("id")
    .single();

  if (error) {
    console.error("create clan insert failed", error);
    if (picturePath) {
      await removeObject(supabase, CLAN_PICTURES_BUCKET, picturePath);
    }
    const mapped = mapClanCreateConstraintError(error);
    if (mapped) throw mapped;
    throw new ClanError(CLAN_CREATE_FAILED);
  }

  return { id: data.id };
}

export async function updateClanAsAdmin(
  supabase: AppSupabaseClient,
  clanId: string,
  input: { name: string; tag: string; pictureFile?: File | null },
): Promise<void> {
  if (!isUuid(clanId)) {
    throw new ClanError(CLAN_UPDATE_FAILED);
  }

  const name = parseClanName(input.name);
  const tag = parseClanTag(input.tag);

  const { data: existing, error: loadError } = await supabase
    .from("clans")
    .select("id, owner_id, picture_path")
    .eq("id", clanId)
    .maybeSingle();

  if (loadError) {
    console.error("updateClanAsAdmin load failed", loadError);
    throw new ClanError(CLAN_UPDATE_FAILED);
  }
  if (!existing) {
    throw new ClanError(CLAN_UPDATE_FAILED);
  }

  let picturePath = existing.picture_path;
  let uploadedPath: string | null = null;
  const previousPath = existing.picture_path;

  const pictureFile = input.pictureFile;
  if (pictureFile && pictureFile.size > 0) {
    try {
      const { mime, ext } = assertPublicImageFile(pictureFile);
      const nextPath = clanPictureObjectPath(existing.owner_id, clanId, ext);
      if (previousPath === nextPath) {
        await removeObject(supabase, CLAN_PICTURES_BUCKET, previousPath);
      }
      const bytes = new Uint8Array(await pictureFile.arrayBuffer());
      await uploadPublicImage(supabase, {
        bucket: CLAN_PICTURES_BUCKET,
        path: nextPath,
        bytes,
        mime,
      });
      uploadedPath = nextPath;
      picturePath = nextPath;
    } catch (err) {
      if (err instanceof StorageImageError) {
        throw new ClanError(CLAN_PICTURE_REJECT);
      }
      console.error("admin clan picture upload failed", err);
      throw new ClanError(CLAN_UPDATE_FAILED);
    }
  }

  const { data, error } = await supabase
    .from("clans")
    .update({ name, tag, picture_path: picturePath })
    .eq("id", clanId)
    .select("id");

  if (error) {
    console.error("updateClanAsAdmin failed", error);
    if (uploadedPath && uploadedPath !== previousPath) {
      await removeObject(supabase, CLAN_PICTURES_BUCKET, uploadedPath);
    }
    const mapped = mapClanCreateConstraintError(error);
    if (mapped) throw mapped;
    throw new ClanError(CLAN_UPDATE_FAILED);
  }

  if (data.length === 0) {
    if (uploadedPath && uploadedPath !== previousPath) {
      await removeObject(supabase, CLAN_PICTURES_BUCKET, uploadedPath);
    }
    throw new ClanError(CLAN_UPDATE_FAILED);
  }

  if (uploadedPath && previousPath && previousPath !== uploadedPath) {
    await removeObject(supabase, CLAN_PICTURES_BUCKET, previousPath);
  }
}

export async function deleteClanAsAdmin(supabase: AppSupabaseClient, clanId: string): Promise<void> {
  if (!isUuid(clanId)) {
    throw new ClanError(CLAN_DELETE_FAILED);
  }

  const { data: existing, error: loadError } = await supabase
    .from("clans")
    .select("id, picture_path")
    .eq("id", clanId)
    .maybeSingle();

  if (loadError) {
    console.error("deleteClanAsAdmin load failed", loadError);
    throw new ClanError(CLAN_DELETE_FAILED);
  }
  if (!existing) {
    throw new ClanError(CLAN_DELETE_FAILED);
  }

  const { data, error } = await supabase.from("clans").delete().eq("id", clanId).select("id");

  if (error) {
    console.error("deleteClanAsAdmin failed", error);
    throw new ClanError(CLAN_DELETE_FAILED);
  }

  if (data.length === 0) {
    throw new ClanError(CLAN_DELETE_FAILED);
  }

  if (existing.picture_path) {
    await removeObject(supabase, CLAN_PICTURES_BUCKET, existing.picture_path);
  }
}

export async function listEligibleClanInvitees(
  supabase: AppSupabaseClient,
  ownerId: string,
  clanId: string,
): Promise<ClanInvitee[]> {
  if (!isUuid(ownerId) || !isUuid(clanId)) return [];

  let friends: ClanInvitee[];
  try {
    friends = await listPublicFriends(supabase, ownerId);
  } catch (err) {
    if (err instanceof FriendsError) {
      throw new ClanError(CLAN_INVITE_LOAD_FAILED);
    }
    throw err;
  }

  if (friends.length === 0) return [];

  const friendIds = friends.map((friend) => friend.id);

  const [{ data: memberRows, error: memberError }, { data: pendingRows, error: pendingError }] = await Promise.all([
    supabase.from("clan_members").select("user_id").in("user_id", friendIds),
    supabase
      .from("clan_invites")
      .select("invitee_id")
      .eq("clan_id", clanId)
      .eq("status", "pending")
      .in("invitee_id", friendIds),
  ]);

  if (memberError) {
    console.error("listEligibleClanInvitees members failed", memberError);
    throw new ClanError(CLAN_INVITE_LOAD_FAILED);
  }
  if (pendingError) {
    console.error("listEligibleClanInvitees pending failed", pendingError);
    throw new ClanError(CLAN_INVITE_LOAD_FAILED);
  }

  const inClan = new Set(memberRows.map((row) => row.user_id));
  const pending = new Set(pendingRows.map((row) => row.invitee_id));

  return friends.filter((friend) => !inClan.has(friend.id) && !pending.has(friend.id));
}

export async function inviteFriendsToClan(
  supabase: AppSupabaseClient,
  input: { ownerId: string; clanId: string; inviteeIds: string[] },
): Promise<void> {
  const { ownerId, clanId } = input;
  const inviteeIds = [...new Set(input.inviteeIds.filter((id) => isUuid(id)))];

  if (!isUuid(ownerId) || !isUuid(clanId)) {
    throw new ClanError(CLAN_INVITE_NOT_OWNER);
  }
  if (inviteeIds.length === 0) {
    throw new ClanError(CLAN_INVITE_PICK_AT_LEAST_ONE);
  }

  const { data: clan, error: clanError } = await supabase
    .from("clans")
    .select("id, owner_id")
    .eq("id", clanId)
    .maybeSingle();

  if (clanError) {
    console.error("inviteFriendsToClan load clan failed", clanError);
    throw new ClanError(CLAN_INVITE_SEND_FAILED);
  }
  if (clan?.owner_id !== ownerId) {
    throw new ClanError(CLAN_INVITE_NOT_OWNER);
  }

  const friendIds = await loadFriendIdSet(supabase, ownerId, CLAN_INVITE_SEND_FAILED);
  if (inviteeIds.some((id) => !friendIds.has(id))) {
    throw new ClanError(CLAN_INVITE_MUST_BE_FRIENDS);
  }

  const { data: memberRows, error: memberError } = await supabase
    .from("clan_members")
    .select("user_id")
    .in("user_id", inviteeIds);

  if (memberError) {
    console.error("inviteFriendsToClan members failed", memberError);
    throw new ClanError(CLAN_INVITE_SEND_FAILED);
  }
  if (memberRows.length > 0) {
    throw new ClanError(CLAN_INVITEE_ALREADY_MEMBER);
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("clan_invites")
    .select("id, invitee_id, status")
    .eq("clan_id", clanId)
    .in("invitee_id", inviteeIds);

  if (existingError) {
    console.error("inviteFriendsToClan existing invites failed", existingError);
    throw new ClanError(CLAN_INVITE_SEND_FAILED);
  }

  if (existingRows.some((row) => row.status === "pending")) {
    throw new ClanError(CLAN_INVITE_ALREADY_PENDING);
  }

  const declined = existingRows.filter((row) => row.status === "declined");
  const declinedInviteeIds = new Set(declined.map((row) => row.invitee_id));
  const toInsert = inviteeIds.filter((id) => !declinedInviteeIds.has(id));

  if (declined.length > 0) {
    const { data: reopened, error: reopenError } = await supabase
      .from("clan_invites")
      .update({ status: "pending" })
      .in(
        "id",
        declined.map((row) => row.id),
      )
      .eq("status", "declined")
      .select("id");

    if (reopenError) {
      console.error("inviteFriendsToClan reopen failed", reopenError);
      const mapped = mapClanInviteConstraintError(reopenError);
      if (mapped) throw mapped;
      throw new ClanError(CLAN_INVITE_SEND_FAILED);
    }
    if (reopened.length !== declined.length) {
      throw new ClanError(CLAN_INVITE_SEND_FAILED);
    }
  }

  if (toInsert.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("clan_invites")
      .insert(
        toInsert.map((inviteeId) => ({
          clan_id: clanId,
          invitee_id: inviteeId,
          inviter_id: ownerId,
          status: "pending" as const,
        })),
      )
      .select("id");

    if (insertError) {
      console.error("inviteFriendsToClan insert failed", insertError);
      const mapped = mapClanInviteConstraintError(insertError);
      if (mapped) throw mapped;
      throw new ClanError(CLAN_INVITE_SEND_FAILED);
    }
    if (inserted.length !== toInsert.length) {
      throw new ClanError(CLAN_INVITE_SEND_FAILED);
    }
  }
}

export async function cancelClanInvite(supabase: AppSupabaseClient, ownerId: string, inviteId: string): Promise<void> {
  if (!isUuid(ownerId) || !isUuid(inviteId)) {
    throw new ClanError(CLAN_INVITE_NOT_PENDING);
  }

  const { data, error } = await supabase
    .from("clan_invites")
    .delete()
    .eq("id", inviteId)
    .eq("inviter_id", ownerId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("cancelClanInvite failed", error);
    throw new ClanError(CLAN_INVITE_UPDATE_FAILED);
  }

  if (data.length === 0) {
    throw new ClanError(CLAN_INVITE_NOT_PENDING);
  }
}

function mapAcceptClanInviteError(error: PostgrestErrorBlob): ClanError | null {
  const blob = `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (error.code === "23505" && blob.includes("clan_members_pkey")) {
    return new ClanError(CLAN_ALREADY_MEMBER);
  }
  if (blob.includes("are_friends") || error.code === "42501") {
    return new ClanError(CLAN_INVITE_MUST_BE_FRIENDS_WITH_OWNER);
  }
  return null;
}

export async function acceptClanInvite(supabase: AppSupabaseClient, viewerId: string, inviteId: string): Promise<void> {
  if (!isUuid(viewerId) || !isUuid(inviteId)) {
    throw new ClanError(CLAN_INVITE_NOT_PENDING);
  }

  const { data: existing, error: loadError } = await supabase
    .from("clan_invites")
    .select("id, inviter_id, status")
    .eq("id", inviteId)
    .eq("invitee_id", viewerId)
    .maybeSingle();

  if (loadError) {
    console.error("acceptClanInvite load failed", loadError);
    throw new ClanError(CLAN_INVITE_UPDATE_FAILED);
  }

  if (existing?.status !== "pending") {
    throw new ClanError(CLAN_INVITE_NOT_PENDING);
  }

  const friendIds = await loadFriendIdSet(supabase, viewerId, CLAN_INVITE_UPDATE_FAILED);
  if (!friendIds.has(existing.inviter_id)) {
    throw new ClanError(CLAN_INVITE_MUST_BE_FRIENDS_WITH_OWNER);
  }

  const { data, error } = await supabase
    .from("clan_invites")
    .delete()
    .eq("id", inviteId)
    .eq("invitee_id", viewerId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("acceptClanInvite failed", error);
    const mapped = mapAcceptClanInviteError(error);
    if (mapped) throw mapped;
    throw new ClanError(CLAN_INVITE_UPDATE_FAILED);
  }

  if (data.length === 0) {
    throw new ClanError(CLAN_INVITE_NOT_PENDING);
  }
}

export async function declineClanInvite(
  supabase: AppSupabaseClient,
  viewerId: string,
  inviteId: string,
): Promise<void> {
  if (!isUuid(viewerId) || !isUuid(inviteId)) {
    throw new ClanError(CLAN_INVITE_NOT_PENDING);
  }

  const { data, error } = await supabase
    .from("clan_invites")
    .update({ status: "declined" })
    .eq("id", inviteId)
    .eq("invitee_id", viewerId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("declineClanInvite failed", error);
    throw new ClanError(CLAN_INVITE_UPDATE_FAILED);
  }

  if (data.length === 0) {
    throw new ClanError(CLAN_INVITE_NOT_PENDING);
  }
}

export async function listIncomingClanInvites(
  supabase: AppSupabaseClient,
  viewerId: string,
): Promise<ClanInviteInboxRow[]> {
  if (!isUuid(viewerId)) return [];

  const { data: rows, error } = await supabase
    .from("clan_invites")
    .select("id, clan_id, inviter_id")
    .eq("invitee_id", viewerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listIncomingClanInvites failed", error);
    throw new ClanError(CLAN_INVITE_LOAD_FAILED);
  }

  const friendIds = await loadFriendIdSet(supabase, viewerId, CLAN_INVITE_LOAD_FAILED);
  return hydrateClanInviteInbox(
    supabase,
    rows
      .filter((row) => friendIds.has(row.inviter_id))
      .map((row) => ({
        id: row.id,
        clan_id: row.clan_id,
        user_id: row.inviter_id,
      })),
  );
}

export async function listOutgoingClanInvites(
  supabase: AppSupabaseClient,
  viewerId: string,
): Promise<ClanInviteInboxRow[]> {
  if (!isUuid(viewerId)) return [];

  const { data: rows, error } = await supabase
    .from("clan_invites")
    .select("id, clan_id, invitee_id")
    .eq("inviter_id", viewerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listOutgoingClanInvites failed", error);
    throw new ClanError(CLAN_INVITE_LOAD_FAILED);
  }

  return hydrateClanInviteInbox(
    supabase,
    rows.map((row) => ({
      id: row.id,
      clan_id: row.clan_id,
      user_id: row.invitee_id,
    })),
  );
}
