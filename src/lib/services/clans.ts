import {
  assertPublicImageFile,
  CLAN_PICTURES_BUCKET,
  clanPictureObjectPath,
  PICTURE_REJECT_MESSAGE,
  removeObject,
  StorageImageError,
  uploadPublicImage,
} from "@/lib/storage";
import { isUuid, type AppSupabaseClient } from "@/lib/services/runs";

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
