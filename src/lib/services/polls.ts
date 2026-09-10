import type { AppSupabaseClient } from "@/lib/services/runs";
import { isUuid } from "@/lib/services/runs";

export class PollError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PollError";
  }
}

const NOT_FOUND_MESSAGE = "Run not found or no longer active";
const BANNED_MESSAGE = "Your account is banned";
const CREATE_GENERIC = "Could not create this map poll";
const VOTE_GENERIC = "Could not submit your vote";
const CLOSE_GENERIC = "Could not close this poll";
const LOAD_GENERIC = "Failed to load map poll";

export interface PollOption {
  mapId: string;
  name: string;
  difficulty: string;
  points: number;
}

export type RunMapPoll =
  | {
      closed: false;
      options: PollOption[];
      ownMapId: string | null;
    }
  | {
      closed: true;
      options: (PollOption & { count: number })[];
      ownMapId: string | null;
      winnerMapId: string | null;
    };

interface PollOptionMapEmbed {
  id: string;
  name: string;
  difficulty: string;
  points: number;
}

interface PollOptionRow {
  map_id: string;
  position: number;
  map: PollOptionMapEmbed | PollOptionMapEmbed[] | null;
}

function coerceOptionMap(value: PollOptionRow["map"]): PollOptionMapEmbed | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function mapPollRpcError(rpcName: string, error: unknown, generic: string): never {
  console.error(`${rpcName} failed`, error);
  throw new PollError(generic);
}

function unexpectedOutcome(rpcName: string, outcome: string | null, generic: string): never {
  console.error(`${rpcName} returned unexpected outcome`, outcome);
  throw new PollError(generic);
}

function mapSharedOutcome(outcome: string): PollError | null {
  switch (outcome) {
    case "not_found":
    case "not_authenticated":
      return new PollError(NOT_FOUND_MESSAGE);
    case "banned":
      return new PollError(BANNED_MESSAGE);
    default:
      return null;
  }
}

export async function getRunMapPoll(
  supabase: AppSupabaseClient,
  runId: string,
  viewerId: string | null,
): Promise<RunMapPoll | null> {
  const { data: poll, error: pollError } = await supabase
    .from("run_map_polls")
    .select("id, closed_at, winner_map_id")
    .eq("run_id", runId)
    .maybeSingle();

  if (pollError) {
    console.error("getRunMapPoll failed", pollError);
    throw new Error(LOAD_GENERIC);
  }
  if (!poll) return null;

  const { data: optionData, error: optionsError } = await supabase
    .from("run_map_poll_options")
    .select(
      `
      map_id,
      position,
      map:maps!run_map_poll_options_map_id_fkey (
        id,
        name,
        difficulty,
        points
      )
    `,
    )
    .eq("poll_id", poll.id)
    .order("position", { ascending: true });

  if (optionsError) {
    console.error("getRunMapPoll options failed", optionsError);
    throw new Error(LOAD_GENERIC);
  }

  const optionRows = optionData as unknown as PollOptionRow[];
  const options: PollOption[] = [];
  for (const row of optionRows) {
    const map = coerceOptionMap(row.map);
    if (!map) continue;
    options.push({
      mapId: map.id,
      name: map.name,
      difficulty: map.difficulty,
      points: map.points,
    });
  }

  const isClosed = poll.closed_at != null;

  if (!isClosed) {
    let ownMapId: string | null = null;
    if (viewerId) {
      const { data: ownVote, error: voteError } = await supabase
        .from("run_map_poll_votes")
        .select("map_id")
        .eq("poll_id", poll.id)
        .eq("user_id", viewerId)
        .maybeSingle();

      if (voteError) {
        console.error("getRunMapPoll own vote failed", voteError);
        throw new Error(LOAD_GENERIC);
      }
      ownMapId = ownVote?.map_id ?? null;
    }

    return { closed: false, options, ownMapId };
  }

  const { data: votes, error: votesError } = await supabase
    .from("run_map_poll_votes")
    .select("map_id, user_id")
    .eq("poll_id", poll.id);

  if (votesError) {
    console.error("getRunMapPoll votes failed", votesError);
    throw new Error(LOAD_GENERIC);
  }

  const countByMapId = new Map<string, number>();
  let ownMapId: string | null = null;
  for (const vote of votes) {
    countByMapId.set(vote.map_id, (countByMapId.get(vote.map_id) ?? 0) + 1);
    if (viewerId && vote.user_id === viewerId) {
      ownMapId = vote.map_id;
    }
  }

  return {
    closed: true,
    options: options.map((option) => ({ ...option, count: countByMapId.get(option.mapId) ?? 0 })),
    ownMapId,
    winnerMapId: poll.winner_map_id,
  };
}

export async function createMapPoll(supabase: AppSupabaseClient, runId: string, mapIdsRaw: string[]): Promise<void> {
  const mapIds = mapIdsRaw.filter((id) => isUuid(id));

  const { data: outcome, error } = await supabase.rpc("create_map_poll", {
    p_run_id: runId,
    p_map_ids: mapIds,
  });

  if (error) {
    return mapPollRpcError("create_map_poll", error, CREATE_GENERIC);
  }

  switch (outcome) {
    case "created":
      return;
    case "not_open":
      throw new PollError("This run can no longer be edited");
    case "poll_exists":
      throw new PollError("This run already has a map poll");
    case "invalid_options":
      throw new PollError("Pick between 2 and 8 different maps");
    default: {
      const shared = outcome ? mapSharedOutcome(outcome) : null;
      if (shared) throw shared;
      unexpectedOutcome("create_map_poll", outcome, CREATE_GENERIC);
    }
  }
}

export async function voteMapPoll(supabase: AppSupabaseClient, runId: string, mapId: string): Promise<void> {
  if (!isUuid(mapId)) {
    throw new PollError("That map is not an option");
  }

  const { data: outcome, error } = await supabase.rpc("vote_map_poll", {
    p_run_id: runId,
    p_map_id: mapId,
  });

  if (error) {
    return mapPollRpcError("vote_map_poll", error, VOTE_GENERIC);
  }

  switch (outcome) {
    case "voted":
      return;
    case "poll_closed":
      throw new PollError("This poll is closed");
    case "invalid_option":
      throw new PollError("That map is not an option");
    default: {
      const shared = outcome ? mapSharedOutcome(outcome) : null;
      if (shared) throw shared;
      unexpectedOutcome("vote_map_poll", outcome, VOTE_GENERIC);
    }
  }
}

export async function closeMapPoll(supabase: AppSupabaseClient, runId: string): Promise<void> {
  const { data: outcome, error } = await supabase.rpc("close_map_poll", { p_run_id: runId });

  if (error) {
    return mapPollRpcError("close_map_poll", error, CLOSE_GENERIC);
  }

  switch (outcome) {
    case "closed":
      return;
    case "already_closed":
      throw new PollError("This poll is already closed");
    case "no_votes":
      throw new PollError("No votes yet — wait for a vote before closing");
    case "already_verified":
      throw new PollError("Finish is already verified");
    case "not_active":
      throw new PollError(NOT_FOUND_MESSAGE);
    default: {
      const shared = outcome ? mapSharedOutcome(outcome) : null;
      if (shared) throw shared;
      unexpectedOutcome("close_map_poll", outcome, CLOSE_GENERIC);
    }
  }
}
