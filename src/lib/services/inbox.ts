import type { AstroCookies } from "astro";
import { audienceActiveOrFilter, isRunActive } from "@/lib/run-lifecycle";
import { listIncomingClanInvites } from "@/lib/services/clans";
import { listIncomingPending } from "@/lib/services/friends";
import { formatVisibility, isUuid, resolveRunTitle, type AppSupabaseClient } from "@/lib/services/runs";
import type { Enums } from "@/types/database";

export const INBOX_LOAD_FAILED = "Could not load invitations";

export class InboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InboxError";
  }
}

export interface RunInboxRow {
  id: string;
  displayTitle: string;
  visibility: Extract<Enums<"run_visibility">, "friends_only" | "invite_only">;
  visibilityLabel: string;
  startsAt: string;
  organizerId: string;
  organizerNickname: string | null;
}

interface IncomingRunRow {
  id: string;
  title: string | null;
  starts_at: string;
  archived_at: string | null;
  extended_until: string | null;
  visibility: Enums<"run_visibility">;
  organizer_id: string;
  map: { name: string } | { name: string }[] | null;
  organizer: { nickname: string | null } | null;
}

function uuidSet(values: readonly (string | null)[] | null | undefined): Set<string> {
  return new Set((values ?? []).filter((id): id is string => typeof id === "string" && isUuid(id)));
}

function mapNameOf(value: IncomingRunRow["map"]): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ? value[0].name : null;
  return value.name;
}

function nicknameOf(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function isIncomingRunVisibility(
  value: Enums<"run_visibility">,
): value is Extract<Enums<"run_visibility">, "friends_only" | "invite_only"> {
  return value === "friends_only" || value === "invite_only";
}

export async function listIncomingRunInvites(supabase: AppSupabaseClient, viewerId: string): Promise<RunInboxRow[]> {
  if (!isUuid(viewerId)) return [];

  const now = Date.now();
  const [friendsResult, invitesResult, seatedResult] = await Promise.all([
    supabase.from("public_friendships").select("friend_id").eq("user_id", viewerId),
    supabase.from("run_invites").select("run_id").eq("user_id", viewerId),
    supabase.from("run_participants").select("run_id").eq("user_id", viewerId).in("status", ["confirmed", "pending"]),
  ]);

  if (friendsResult.error || invitesResult.error || seatedResult.error) {
    console.error(
      "listIncomingRunInvites lookup failed",
      friendsResult.error ?? invitesResult.error ?? seatedResult.error,
    );
    throw new InboxError(INBOX_LOAD_FAILED);
  }

  const friendIds = uuidSet(friendsResult.data.map((row) => row.friend_id));
  const invitedIds = uuidSet(invitesResult.data.map((row) => row.run_id));
  const seatedIds = uuidSet(seatedResult.data.map((row) => row.run_id));

  if (friendIds.size === 0 && invitedIds.size === 0) return [];

  const { data, error } = await supabase
    .from("runs")
    .select(
      `
      id,
      title,
      starts_at,
      archived_at,
      extended_until,
      visibility,
      organizer_id,
      map:maps!runs_map_id_fkey (name),
      organizer:public_profiles!runs_organizer_id_fkey (nickname)
    `,
    )
    .is("archived_at", null)
    .neq("organizer_id", viewerId)
    .in("visibility", ["friends_only", "invite_only"])
    .or(audienceActiveOrFilter(now))
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("listIncomingRunInvites runs failed", error);
    throw new InboxError(INBOX_LOAD_FAILED);
  }

  const inbox: RunInboxRow[] = [];
  for (const raw of data) {
    const row = raw as IncomingRunRow;
    if (!isIncomingRunVisibility(row.visibility)) continue;
    if (seatedIds.has(row.id)) continue;
    if (!isRunActive(row.starts_at, row.archived_at, row.extended_until, now)) continue;
    if (row.visibility === "invite_only" && !invitedIds.has(row.id)) continue;
    if (row.visibility === "friends_only" && !friendIds.has(row.organizer_id)) continue;

    const organizerNickname = nicknameOf(row.organizer?.nickname);
    inbox.push({
      id: row.id,
      displayTitle: resolveRunTitle({
        title: row.title,
        mapName: mapNameOf(row.map),
        nickname: organizerNickname,
      }),
      visibility: row.visibility,
      visibilityLabel: formatVisibility(row.visibility),
      startsAt: row.starts_at,
      organizerId: row.organizer_id,
      organizerNickname,
    });
  }

  return inbox;
}

export async function countIncomingInbox(supabase: AppSupabaseClient, viewerId: string): Promise<number> {
  const [friends, clans, runs] = await Promise.all([
    listIncomingPending(supabase, viewerId),
    listIncomingClanInvites(supabase, viewerId),
    listIncomingRunInvites(supabase, viewerId),
  ]);
  return friends.length + clans.length + runs.length;
}

export const INBOX_TOAST_COOKIE = "inbox_toast";

export function parseInboxToastCount(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return 0;
  return Math.min(n, 99);
}

export async function setInboxToastCookie(
  cookies: AstroCookies,
  supabase: AppSupabaseClient,
  userId: string,
  secure: boolean,
): Promise<void> {
  try {
    const count = await countIncomingInbox(supabase, userId);
    if (count < 1) return;
    cookies.set(INBOX_TOAST_COOKIE, String(Math.min(count, 99)), {
      path: "/",
      maxAge: 120,
      httpOnly: true,
      sameSite: "lax",
      secure,
    });
  } catch (err) {
    console.error("inbox toast cookie failed", err);
  }
}
