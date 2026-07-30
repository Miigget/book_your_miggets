import type { SupabaseClient } from "@supabase/supabase-js";
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
  organizerNickname: string | null;
}

export type RunDetail = RunListItem & {
  createdAt: string;
};

const RUN_SELECT = `
  id,
  title,
  starts_at,
  max_participants,
  min_points,
  join_mode,
  created_at,
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
  max_participants: number;
  min_points: number;
  join_mode: Enums<"join_mode">;
  created_at: string;
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

function mapRunRow(row: RunRow): RunDetail {
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
    organizerNickname,
    displayTitle: resolveRunTitle({
      title: row.title,
      mapName: map?.name,
      nickname: organizerNickname,
    }),
  };
}

export async function listActiveRuns(supabase: AppSupabaseClient): Promise<RunListItem[]> {
  const { data, error } = await supabase
    .from("runs")
    .select(RUN_SELECT)
    .is("archived_at", null)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list active runs: ${error.message}`);
  }

  return (data as unknown as RunRow[]).map(mapRunRow);
}

export async function getActiveRunById(supabase: AppSupabaseClient, id: string): Promise<RunDetail | null> {
  const { data, error } = await supabase
    .from("runs")
    .select(RUN_SELECT)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load run: ${error.message}`);
  }

  if (!data) return null;
  return mapRunRow(data);
}
