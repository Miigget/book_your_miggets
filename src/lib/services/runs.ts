import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeWindowStartsAfter,
  getRunLifecyclePhase,
  isRunActive,
  type ActiveRunLifecyclePhase,
} from "@/lib/run-lifecycle";
import { utcDayRange, type RunListFilters } from "@/lib/run-list-filters";
import { getOwnParticipation } from "@/lib/services/participants";
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
  displayTitle: string;
  map: RunMap | null;
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

const RUN_SELECT = `
  id,
  title,
  starts_at,
  archived_at,
  max_participants,
  min_points,
  join_mode,
  created_at,
  organizer_id,
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
  created_at: string;
  organizer_id: string;
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
    createdAt: row.created_at,
    map,
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
  return mapName.includes(needle) || nickname.includes(needle);
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

export async function listActiveRuns(
  supabase: AppSupabaseClient,
  filters: RunListFilters = {},
): Promise<RunListItem[]> {
  const now = Date.now();
  let query = supabase
    .from("runs")
    .select(RUN_SELECT)
    .is("archived_at", null)
    .gt("starts_at", activeWindowStartsAfter(now));

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
 * Personal archive index: confirmed participation ids first, then keep archived.
 * Never list every archived row organizer/admin RLS can SELECT (S-08 leak).
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
