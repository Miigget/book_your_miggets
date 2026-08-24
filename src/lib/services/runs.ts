import type { SupabaseClient } from "@supabase/supabase-js";
import { isMapCategory } from "@/lib/map-categories";
import {
  activeWindowStartsAfter,
  getRunLifecyclePhase,
  isRunActive,
  type ActiveRunLifecyclePhase,
} from "@/lib/run-lifecycle";
import { utcDayRange, type RunListFilters } from "@/lib/run-list-filters";
import { countConfirmedParticipants, getOwnParticipation } from "@/lib/services/participants";
import type { Database, Enums, Tables } from "@/types/database";

export type AppSupabaseClient = SupabaseClient<Database>;

export type RunMap = Pick<
  Tables<"maps">,
  "id" | "name" | "difficulty" | "stars" | "points" | "length" | "creator" | "released_on"
>;

export interface RunListItem {
  id: string;
  title: string | null;
  startsAt: string;
  maxParticipants: number;
  minPoints: number;
  joinMode: Enums<"join_mode">;
  visibility: Enums<"run_visibility">;
  displayTitle: string;
  map: RunMap | null;
  mapCategory: string | null;
  organizerId: string;
  organizerNickname: string | null;
  confirmedCount: number;
  lifecyclePhase: ActiveRunLifecyclePhase;
}

export type RunDetail = RunListItem & {
  createdAt: string;
};

export type ArchivedRunListItem = Omit<RunListItem, "lifecyclePhase"> & {
  lifecyclePhase: "archived";
};

export type ArchivedRunDetail = ArchivedRunListItem & {
  createdAt: string;
};

export type OrganizerRunListItem = RunListItem & {
  pendingCount: number;
};

const RUN_SELECT = `
  id,
  title,
  starts_at,
  archived_at,
  max_participants,
  min_points,
  join_mode,
  visibility,
  created_at,
  organizer_id,
  map_category,
  map:maps (
    id,
    name,
    difficulty,
    stars,
    points,
    length,
    creator,
    released_on
  ),
  organizer:public_profiles!runs_organizer_id_fkey (
    nickname
  )
` as const;

interface RunRow {
  id: string;
  title: string | null;
  starts_at: string;
  archived_at: string | null;
  max_participants: number;
  min_points: number;
  join_mode: Enums<"join_mode">;
  visibility: Enums<"run_visibility">;
  created_at: string;
  organizer_id: string;
  map_category: string | null;
  map: RunMap | null;
  organizer: { nickname: string | null } | null;
}

export function resolveRunTitle({
  title,
  mapName,
  nickname,
}: {
  title: string | null | undefined;
  mapName: string | null | undefined;
  nickname: string | null | undefined;
}): string {
  const custom = title?.trim();
  if (custom) return custom;

  const nick = nickname?.trim();
  const map = mapName?.trim();

  if (map && nick) return `${map} run by ${nick}`;
  if (nick) return `${nick} run`;
  if (map) return `${map} run`;
  return "Untitled run";
}

export function formatJoinMode(mode: Enums<"join_mode">): string {
  switch (mode) {
    case "approval_required":
      return "Approval required";
    case "auto_join":
      return "Auto join";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function formatVisibility(visibility: Enums<"run_visibility">): string {
  switch (visibility) {
    case "public":
      return "Public";
    case "friends_only":
      return "Friends only";
    case "invite_only":
      return "Invite only";
    default: {
      const _exhaustive: never = visibility;
      return _exhaustive;
    }
  }
}

function runFieldsFromRow(row: RunRow, confirmedCount: number) {
  const map = row.map;
  const organizerNickname = row.organizer?.nickname ?? null;

  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    maxParticipants: row.max_participants,
    minPoints: row.min_points,
    joinMode: row.join_mode,
    visibility: row.visibility,
    createdAt: row.created_at,
    map,
    mapCategory: row.map_category,
    organizerId: row.organizer_id,
    organizerNickname,
    confirmedCount,
    displayTitle: resolveRunTitle({
      title: row.title,
      mapName: map?.name,
      nickname: organizerNickname,
    }),
  };
}

function mapRunRow(row: RunRow, confirmedCount = 0, now = Date.now()): RunDetail | null {
  const phase = getRunLifecyclePhase(row.starts_at, now);
  if (phase === "archived") return null;

  return { ...runFieldsFromRow(row, confirmedCount), lifecyclePhase: phase };
}

function mapArchivedRunRow(row: RunRow, confirmedCount = 0, now = Date.now()): ArchivedRunDetail | null {
  if (isRunActive(row.starts_at, row.archived_at, now)) return null;

  return { ...runFieldsFromRow(row, confirmedCount), lifecyclePhase: "archived" };
}

function matchesMapOrOrganizer(row: RunRow, query: string): boolean {
  const needle = query.toLowerCase();
  const mapName = row.map?.name.toLowerCase() ?? "";
  const nickname = row.organizer?.nickname?.toLowerCase() ?? "";
  const category = row.map_category?.toLowerCase() ?? "";
  return mapName.includes(needle) || nickname.includes(needle) || category.includes(needle);
}

async function confirmedCountsForRuns(supabase: AppSupabaseClient, runIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of runIds) {
    counts.set(id, 0);
  }

  if (runIds.length === 0) return counts;

  await Promise.all(
    runIds.map(async (id) => {
      const { count, error } = await supabase
        .from("run_participants")
        .select("id", { count: "exact", head: true })
        .eq("run_id", id)
        .eq("status", "confirmed");

      if (error) {
        throw new Error(`Failed to count confirmed participants: ${error.message}`);
      }

      counts.set(id, count ?? 0);
    }),
  );

  return counts;
}

async function pendingCountsForRuns(supabase: AppSupabaseClient, runIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of runIds) {
    counts.set(id, 0);
  }

  if (runIds.length === 0) return counts;

  await Promise.all(
    runIds.map(async (id) => {
      const { count, error } = await supabase
        .from("run_participants")
        .select("id", { count: "exact", head: true })
        .eq("run_id", id)
        .eq("status", "pending");

      if (error) {
        throw new Error(`Failed to count pending participants: ${error.message}`);
      }

      counts.set(id, count ?? 0);
    }),
  );

  return counts;
}

export interface ListActiveRunsOptions {
  /** Dual-defense catalog: SQL `visibility = public` in addition to RLS. */
  publicOnly?: boolean;
}

export async function listActiveRuns(
  supabase: AppSupabaseClient,
  filters: RunListFilters = {},
  options: ListActiveRunsOptions = {},
): Promise<RunListItem[]> {
  const now = Date.now();
  let query = supabase
    .from("runs")
    .select(RUN_SELECT)
    .is("archived_at", null)
    .gt("starts_at", activeWindowStartsAfter(now));

  if (options.publicOnly) {
    query = query.eq("visibility", "public");
  }
  if (filters.date) {
    const { startIso, endIso } = utcDayRange(filters.date);
    query = query.gte("starts_at", startIso).lt("starts_at", endIso);
  }
  if (filters.minPoints !== undefined) {
    query = query.lte("min_points", filters.minPoints);
  }
  if (filters.joinMode) {
    query = query.eq("join_mode", filters.joinMode);
  }

  const { data, error } = await query.order("starts_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list active runs: ${error.message}`);
  }

  let rows = data as unknown as RunRow[];
  if (filters.mapQuery) {
    const query = filters.mapQuery;
    rows = rows.filter((row) => matchesMapOrOrganizer(row, query));
  }

  const counts = await confirmedCountsForRuns(
    supabase,
    rows.map((row) => row.id),
  );

  return rows
    .map((row) => mapRunRow(row, counts.get(row.id) ?? 0, now))
    .filter((run): run is RunDetail => run !== null);
}

export async function getActiveRunById(supabase: AppSupabaseClient, id: string): Promise<RunDetail | null> {
  if (!isUuid(id)) return null;

  const now = Date.now();
  const { data, error } = await supabase
    .from("runs")
    .select(RUN_SELECT)
    .eq("id", id)
    .is("archived_at", null)
    .gt("starts_at", activeWindowStartsAfter(now))
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load run: ${error.message}`);
  }

  if (!data) return null;

  // Detail pages load the confirmed roster separately; avoid a duplicate count fetch here.
  return mapRunRow(data, 0, now);
}

/**
 * Owner-only loader for `/runs/{id}/edit`. Do not use `getActiveRunById` as the gate —
 * that would pass for any signed-in viewer of a public active run.
 */
export async function getOwnedActiveRunForEdit(
  supabase: AppSupabaseClient,
  runId: string,
  userId: string,
): Promise<RunDetail | null> {
  if (!isUuid(runId)) return null;

  const now = Date.now();
  const { data, error } = await supabase
    .from("runs")
    .select(RUN_SELECT)
    .eq("id", runId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load run: ${error.message}`);
  }
  if (!data) return null;
  if (!isRunActive(data.starts_at, data.archived_at, now)) return null;

  return mapRunRow(data, 0, now);
}

/**
 * Personal organizer inventory by ownership (`organizer_id`), not participation.
 * Leave-team does not hide created runs. Do not reuse `listArchivedRunsForParticipant`.
 */
export async function listRunsForOrganizer(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<{ active: OrganizerRunListItem[]; archived: ArchivedRunListItem[] }> {
  const now = Date.now();
  const { data, error } = await supabase.from("runs").select(RUN_SELECT).eq("organizer_id", userId);

  if (error) {
    throw new Error(`Failed to list organizer runs: ${error.message}`);
  }

  const rows = data as unknown as RunRow[];
  if (rows.length === 0) {
    return { active: [], archived: [] };
  }

  const activeRows = rows
    .filter((row) => isRunActive(row.starts_at, row.archived_at, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const archivedRows = rows
    .filter((row) => !isRunActive(row.starts_at, row.archived_at, now))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

  const pendingIds = activeRows.filter((row) => row.join_mode === "approval_required").map((row) => row.id);
  const [activeCounts, archivedCounts, pendingCounts] = await Promise.all([
    confirmedCountsForRuns(
      supabase,
      activeRows.map((row) => row.id),
    ),
    confirmedCountsForRuns(
      supabase,
      archivedRows.map((row) => row.id),
    ),
    pendingCountsForRuns(supabase, pendingIds),
  ]);

  const active = activeRows
    .map((row) => {
      const mapped = mapRunRow(row, activeCounts.get(row.id) ?? 0, now);
      if (!mapped) return null;
      return { ...mapped, pendingCount: pendingCounts.get(row.id) ?? 0 };
    })
    .filter((run): run is OrganizerRunListItem => run !== null);

  const archived = archivedRows
    .map((row) => mapArchivedRunRow(row, archivedCounts.get(row.id) ?? 0, now))
    .filter((run): run is ArchivedRunDetail => run !== null);

  return { active, archived };
}

/**
 * Personal archive index: confirmed participation ids first, then keep archived.
 * Never list every archived row organizer/admin RLS can SELECT from `/runs/history`.
 * Organizer inventory is `listRunsForOrganizer` (filter by `organizer_id`), not this helper.
 */
export async function listArchivedRunsForParticipant(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<ArchivedRunListItem[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from("run_participants")
    .select("run_id")
    .eq("user_id", userId)
    .eq("status", "confirmed");

  if (membershipError) {
    throw new Error(`Failed to list archived run memberships: ${membershipError.message}`);
  }

  const runIds = [...new Set(memberships.map((row) => row.run_id))];
  if (runIds.length === 0) return [];

  const now = Date.now();
  const { data, error } = await supabase.from("runs").select(RUN_SELECT).in("id", runIds);

  if (error) {
    throw new Error(`Failed to list archived runs: ${error.message}`);
  }

  const archivedRows = (data as unknown as RunRow[])
    .filter((row) => !isRunActive(row.starts_at, row.archived_at, now))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

  const counts = await confirmedCountsForRuns(
    supabase,
    archivedRows.map((row) => row.id),
  );

  return archivedRows
    .map((row) => mapArchivedRunRow(row, counts.get(row.id) ?? 0, now))
    .filter((run): run is ArchivedRunDetail => run !== null);
}

/**
 * Archived `/runs/{id}` only when the viewer still has a confirmed row and the run is archived.
 * Organizer/admin RLS success is not enough — return null without a current confirmed seat.
 * Organizer inventory is `listRunsForOrganizer`; this helper stays membership-gated.
 */
export async function getArchivedRunForParticipant(
  supabase: AppSupabaseClient,
  runId: string,
  userId: string,
): Promise<ArchivedRunDetail | null> {
  if (!isUuid(runId)) return null;

  const own = await getOwnParticipation(supabase, runId, userId);
  if (own?.status !== "confirmed") return null;

  const now = Date.now();
  const { data, error } = await supabase.from("runs").select(RUN_SELECT).eq("id", runId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load archived run: ${error.message}`);
  }

  if (!data) return null;

  return mapArchivedRunRow(data, 0, now);
}

/**
 * Archived `/runs/{id}` when the signed-in viewer is the organizer, even without a confirmed seat.
 * Callers MUST pass the signed-in viewer. The `organizer_id === userId` check is mandatory:
 * admin RLS would otherwise return other people's rows from a by-id fetch.
 * Do not reuse participant membership. Do not call from `/runs/history`.
 */
export async function getArchivedRunForOrganizer(
  supabase: AppSupabaseClient,
  runId: string,
  userId: string,
): Promise<ArchivedRunDetail | null> {
  if (!isUuid(runId)) return null;

  const now = Date.now();
  const { data, error } = await supabase.from("runs").select(RUN_SELECT).eq("id", runId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load archived run: ${error.message}`);
  }

  if (!data) return null;
  if (data.organizer_id !== userId) return null;

  return mapArchivedRunRow(data, 0, now);
}

/**
 * Archived `/runs/{id}` by id with no confirmed-seat check.
 * Callers MUST already have verified `locals.profile.role === "admin"`.
 * Organizer inventory is `listRunsForOrganizer` (by `organizer_id`); this by-id loader is not that surface.
 */
export async function getArchivedRunForAdmin(
  supabase: AppSupabaseClient,
  runId: string,
): Promise<ArchivedRunDetail | null> {
  if (!isUuid(runId)) return null;

  const now = Date.now();
  const { data, error } = await supabase.from("runs").select(RUN_SELECT).eq("id", runId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load archived run: ${error.message}`);
  }

  if (!data) return null;

  return mapArchivedRunRow(data, 0, now);
}

export type MapPickerItem = Pick<Tables<"maps">, "id" | "name" | "difficulty" | "points" | "stars">;

export async function listMapsForPicker(supabase: AppSupabaseClient): Promise<MapPickerItem[]> {
  const { data, error } = await supabase
    .from("maps")
    .select("id, name, difficulty, points, stars")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to list maps: ${error.message}`);
  }

  return data;
}

export async function ensureOwnProfile(supabase: AppSupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("ensure_own_profile");
  if (error) {
    throw new Error(`Failed to ensure profile: ${error.message}`);
  }
}

export async function getOwnNickname(supabase: AppSupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("nickname").eq("id", userId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }

  const nickname = data?.nickname?.trim();
  if (!nickname) return null;
  return nickname;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export const JOIN_MODES = ["approval_required", "auto_join"] as const satisfies readonly Enums<"join_mode">[];

export function isJoinMode(value: string): value is Enums<"join_mode"> {
  return (JOIN_MODES as readonly string[]).includes(value);
}

export const VISIBILITIES = [
  "public",
  "friends_only",
  "invite_only",
] as const satisfies readonly Enums<"run_visibility">[];

export function isVisibility(value: string): value is Enums<"run_visibility"> {
  return (VISIBILITIES as readonly string[]).includes(value);
}

/** Shared create/edit `?error=` when an unverified organizer posts a non-public visibility. */
export const RESTRICTED_VISIBILITY_UNVERIFIED = "Verify your account to create friends-only or invite-only runs";

export const INVITE_LIST_EMPTY_MESSAGE = "Invite-only runs need at least one invitee";

export function parseInviteeIds(form: FormData): string[] {
  const ids = form
    .getAll("invitee_ids")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(isUuid);
  return [...new Set(ids)];
}

export async function listRunInviteeIds(supabase: AppSupabaseClient, runId: string): Promise<string[]> {
  if (!isUuid(runId)) return [];

  const { data, error } = await supabase.from("run_invites").select("user_id").eq("run_id", runId);

  if (error) {
    throw new Error(`Failed to list run invitees: ${error.message}`);
  }

  return [...new Set(data.map((row) => row.user_id).filter(isUuid))];
}

export async function listPublicNicknamesByIds(
  supabase: AppSupabaseClient,
  ids: string[],
): Promise<{ id: string; nickname: string | null }[]> {
  const unique = [...new Set(ids.filter(isUuid))];
  if (unique.length === 0) return [];

  const { data, error } = await supabase.from("public_profiles").select("id, nickname").in("id", unique);

  if (error) {
    throw new Error(`Failed to load invitee nicknames: ${error.message}`);
  }

  const byId = new Map<string, string | null>();
  for (const profile of data) {
    if (!profile.id) continue;
    const trimmed = profile.nickname?.trim();
    if (!trimmed) {
      byId.set(profile.id, null);
    } else {
      byId.set(profile.id, trimmed);
    }
  }

  return unique.map((id) => ({ id, nickname: byId.get(id) ?? null }));
}

export class RunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunError";
  }
}

export function normalizeRunMapAndCategory(
  mapIdRaw: string,
  categoryRaw: string,
): { mapId: string | null; mapCategory: string | null } {
  const mapId = mapIdRaw.trim().length > 0 ? mapIdRaw.trim() : null;
  const category = categoryRaw.trim().length > 0 ? categoryRaw.trim() : null;

  if (mapId !== null) {
    return { mapId, mapCategory: null };
  }

  if (category === null) {
    return { mapId: null, mapCategory: null };
  }

  if (!isMapCategory(category)) {
    throw new RunError("Category is invalid");
  }

  return { mapId: null, mapCategory: category };
}

export interface UpdateRunInput {
  title: string;
  mapId: string;
  mapCategory: string;
  startsAt: string;
  maxParticipants: string;
  minPoints: string;
  joinMode: string;
  visibility: string;
}

interface PreparedRunPatch {
  title: string | null;
  mapId: string | null;
  mapCategory: string | null;
  startsAtIso: string;
  maxParticipants: number;
  minPoints: number;
  /** Null when join mode is locked — omit from UPDATE / pass null to the RPC. */
  joinMode: Enums<"join_mode"> | null;
  visibility: Enums<"run_visibility">;
}

interface PostgrestErrorBlob {
  message: string;
  details?: string | null;
  hint?: string | null;
}

export function mapRunMapCategoryConstraintError(error: PostgrestErrorBlob): RunError | null {
  const blob = `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (blob.includes("runs_map_category_catalog")) {
    return new RunError("Category is invalid");
  }
  return null;
}

function mapRunWriteError(error: PostgrestErrorBlob): RunError | null {
  const mappedCategory = mapRunMapCategoryConstraintError(error);
  if (mappedCategory) return mappedCategory;

  const blob = `${error.message} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (blob.includes("join_mode_locked")) {
    return new RunError("Join mode cannot be changed after someone has applied");
  }
  if (blob.includes("capacity_below_confirmed")) {
    return new RunError("Capacity cannot be below the confirmed roster");
  }
  if (blob.includes("invite_list_empty")) {
    return new RunError(INVITE_LIST_EMPTY_MESSAGE);
  }
  if (blob.includes("invitee_not_friend")) {
    return new RunError("Invitees must be friends");
  }
  if (blob.includes("invitee_is_organizer")) {
    return new RunError("You cannot invite yourself");
  }
  if (blob.includes("run_not_found")) {
    return new RunError("Run not found or no longer active");
  }
  return null;
}

async function loadCurrentFriendIdSet(
  supabase: AppSupabaseClient,
  userId: string,
  genericMessage: string,
): Promise<Set<string>> {
  const { data, error } = await supabase.from("public_friendships").select("friend_id").eq("user_id", userId);

  if (error) {
    console.error("load friend ids for invites failed", error);
    throw new RunError(genericMessage);
  }

  return new Set(data.map((row) => row.friend_id).filter((id): id is string => typeof id === "string" && isUuid(id)));
}

async function assertNewInviteesAreFriends(
  supabase: AppSupabaseClient,
  organizerId: string,
  inviteeIds: string[],
  snapshotIds: readonly string[],
  genericMessage: string,
): Promise<void> {
  const snapshot = new Set(snapshotIds);
  const newcomers = inviteeIds.filter((id) => !snapshot.has(id));
  if (newcomers.length === 0) return;

  const friendIds = await loadCurrentFriendIdSet(supabase, organizerId, genericMessage);
  if (newcomers.some((id) => !friendIds.has(id))) {
    throw new RunError("Invitees must be friends");
  }
}

/**
 * Shared normalize/validate for organizer edits. Used by `updateRun` (public/friends-only)
 * and `setRunVisibilityAndInvites` (invite-only RPC) so S-13 checks stay in one place.
 */
async function prepareOwnedActiveRunPatch(
  supabase: AppSupabaseClient,
  userId: string,
  runId: string,
  input: UpdateRunInput,
): Promise<PreparedRunPatch> {
  if (!isUuid(runId)) {
    throw new RunError("Run not found or no longer active");
  }

  if (!isVisibility(input.visibility)) {
    throw new RunError("Visibility is invalid");
  }

  const { data: existing, error: loadError } = await supabase
    .from("runs")
    .select("id, max_participants")
    .eq("id", runId)
    .eq("organizer_id", userId)
    .is("archived_at", null)
    .gt("starts_at", activeWindowStartsAfter())
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load run: ${loadError.message}`);
  }
  if (!existing) {
    throw new RunError("Run not found or no longer active");
  }

  const title = input.title.trim().length > 0 ? input.title.trim() : null;
  const { mapId, mapCategory } = normalizeRunMapAndCategory(input.mapId, input.mapCategory);

  if (mapId !== null) {
    if (!isUuid(mapId)) {
      throw new RunError("Invalid map selection");
    }
    const { data: mapRow, error: mapError } = await supabase.from("maps").select("id").eq("id", mapId).maybeSingle();
    if (mapError) {
      console.error("updateRun map lookup failed", mapError);
      throw new RunError("Could not save this run");
    }
    if (!mapRow) {
      throw new RunError("Selected map was not found");
    }
  }

  const startsAtRaw = input.startsAt.trim();
  if (!startsAtRaw) {
    throw new RunError("Start time is required");
  }
  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) {
    throw new RunError("Start time is invalid");
  }
  if (!isRunActive(startsAt, null)) {
    throw new RunError("Start time must keep the run active");
  }

  const maxParticipants = Number.parseInt(input.maxParticipants, 10);
  if (!Number.isFinite(maxParticipants) || maxParticipants <= 0) {
    throw new RunError("Capacity must be a whole number greater than 0");
  }

  const minPoints = Number.parseInt(input.minPoints, 10);
  if (!Number.isFinite(minPoints) || minPoints < 0) {
    throw new RunError("Min points must be 0 or greater");
  }

  const [confirmedCount, otherParticipants] = await Promise.all([
    countConfirmedParticipants(supabase, runId),
    supabase
      .from("run_participants")
      .select("id", { count: "exact", head: true })
      .eq("run_id", runId)
      .neq("user_id", userId),
  ]);

  if (otherParticipants.error) {
    throw new Error(`Failed to count participants: ${otherParticipants.error.message}`);
  }

  if (maxParticipants !== existing.max_participants && maxParticipants < confirmedCount) {
    throw new RunError("Capacity cannot be below the confirmed roster");
  }

  const joinModeLocked = (otherParticipants.count ?? 0) > 0;
  let joinMode: Enums<"join_mode"> | null = null;
  if (!joinModeLocked) {
    if (!isJoinMode(input.joinMode)) {
      throw new RunError("Join mode is invalid");
    }
    joinMode = input.joinMode;
  }

  return {
    title,
    mapId,
    mapCategory,
    startsAtIso: startsAt.toISOString(),
    maxParticipants,
    minPoints,
    joinMode,
    visibility: input.visibility,
  };
}

export interface CreateInviteOnlyRunInput {
  title: string | null;
  mapId: string | null;
  mapCategory: string | null;
  startsAtIso: string;
  maxParticipants: number;
  minPoints: number;
  joinMode: Enums<"join_mode">;
  inviteeIds: string[];
}

/**
 * Invite-only create in one transaction. Never pair `.insert()` with a separate invite write.
 */
export async function createInviteOnlyRun(
  supabase: AppSupabaseClient,
  userId: string,
  input: CreateInviteOnlyRunInput,
): Promise<string> {
  if (input.inviteeIds.length < 1) {
    throw new RunError(INVITE_LIST_EMPTY_MESSAGE);
  }

  await assertNewInviteesAreFriends(supabase, userId, input.inviteeIds, [], "Could not create this run");

  const { data, error } = await supabase.rpc("create_invite_only_run", {
    p_title: input.title,
    p_map_id: input.mapId,
    p_map_category: input.mapCategory,
    p_starts_at: input.startsAtIso,
    p_max_participants: input.maxParticipants,
    p_min_points: input.minPoints,
    p_join_mode: input.joinMode,
    p_invitee_ids: input.inviteeIds,
  } as Database["public"]["Functions"]["create_invite_only_run"]["Args"]);

  if (error) {
    console.error("create_invite_only_run failed", error);
    const mapped = mapRunWriteError(error);
    if (mapped) throw mapped;
    throw new RunError("Could not create this run");
  }
  if (!data) {
    throw new RunError("Could not create this run");
  }
  return data;
}

/**
 * Organizer-only update of an active run. Do not use `getActiveRunById` as the owner gate.
 * Join mode is omitted from the patch when any non-organizer participant row exists.
 * Visibility is always patchable. Invite-only edits must use `setRunVisibilityAndInvites`.
 */
export async function updateRun(
  supabase: AppSupabaseClient,
  userId: string,
  runId: string,
  input: UpdateRunInput,
): Promise<void> {
  const prepared = await prepareOwnedActiveRunPatch(supabase, userId, runId, input);

  if (prepared.visibility === "invite_only") {
    throw new RunError("Could not save this run");
  }

  const patch: {
    title: string | null;
    map_id: string | null;
    map_category: string | null;
    starts_at: string;
    max_participants: number;
    min_points: number;
    visibility: Enums<"run_visibility">;
    join_mode?: Enums<"join_mode">;
  } = {
    title: prepared.title,
    map_id: prepared.mapId,
    map_category: prepared.mapCategory,
    starts_at: prepared.startsAtIso,
    max_participants: prepared.maxParticipants,
    min_points: prepared.minPoints,
    visibility: prepared.visibility,
  };

  if (prepared.joinMode) {
    patch.join_mode = prepared.joinMode;
  }

  const { data: updated, error: updateError } = await supabase
    .from("runs")
    .update(patch)
    .eq("id", runId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("updateRun failed", updateError);
    const mapped = mapRunWriteError(updateError);
    if (mapped) throw mapped;
    throw new RunError("Could not save this run");
  }

  if (!updated) {
    throw new RunError("Run not found or no longer active");
  }
}

/**
 * Invite-only edit in one transaction. Calls `set_run_visibility_and_invites` instead of
 * `updateRun` so the run patch and invite replace commit together. `p_join_mode` is omitted
 * when join mode is locked (Postgres default null = leave unchanged).
 */
export async function setRunVisibilityAndInvites(
  supabase: AppSupabaseClient,
  userId: string,
  runId: string,
  input: UpdateRunInput,
  inviteeIds: string[],
): Promise<void> {
  if (inviteeIds.length < 1) {
    throw new RunError(INVITE_LIST_EMPTY_MESSAGE);
  }

  const [prepared, snapshotIds] = await Promise.all([
    prepareOwnedActiveRunPatch(supabase, userId, runId, input),
    listRunInviteeIds(supabase, runId),
  ]);

  if (prepared.visibility !== "invite_only") {
    throw new RunError("Could not save this run");
  }

  await assertNewInviteesAreFriends(supabase, userId, inviteeIds, snapshotIds, "Could not save this run");

  const { error } = await supabase.rpc("set_run_visibility_and_invites", {
    p_run_id: runId,
    p_visibility: prepared.visibility,
    p_invitee_ids: inviteeIds,
    p_title: prepared.title,
    p_map_id: prepared.mapId,
    p_map_category: prepared.mapCategory,
    p_starts_at: prepared.startsAtIso,
    p_max_participants: prepared.maxParticipants,
    p_min_points: prepared.minPoints,
    ...(prepared.joinMode ? { p_join_mode: prepared.joinMode } : {}),
  } as Database["public"]["Functions"]["set_run_visibility_and_invites"]["Args"]);

  if (error) {
    console.error("set_run_visibility_and_invites failed", error);
    const mapped = mapRunWriteError(error);
    if (mapped) throw mapped;
    throw new RunError("Could not save this run");
  }
}
