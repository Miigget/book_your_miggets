import { isUuid, type AppSupabaseClient, type RunListItem } from "@/lib/services/runs";

export interface RunListViewerFacts {
  viewerId: string | null;
  isAdmin: boolean;
  friendIds: ReadonlySet<string>;
  invitedRunIds: ReadonlySet<string>;
  confirmedRunIds: ReadonlySet<string>;
}

export interface PartitionedActiveRuns {
  publicRuns: RunListItem[];
  friendsRuns: RunListItem[];
  invitedRuns: RunListItem[];
  restrictedAdminRuns: RunListItem[];
}

export function emptyRunListViewerFacts(isAdmin = false): RunListViewerFacts {
  return {
    viewerId: null,
    isAdmin,
    friendIds: new Set(),
    invitedRunIds: new Set(),
    confirmedRunIds: new Set(),
  };
}

function uuidSet(values: readonly (string | null)[] | null | undefined): Set<string> {
  return new Set((values ?? []).filter((id): id is string => typeof id === "string" && isUuid(id)));
}

export async function loadRunListViewerFacts(
  supabase: AppSupabaseClient,
  viewerId: string,
  isAdmin: boolean,
  runIds: readonly string[],
): Promise<RunListViewerFacts> {
  if (!isUuid(viewerId)) {
    return { ...emptyRunListViewerFacts(isAdmin), viewerId };
  }

  const listedIds = runIds.filter((id) => isUuid(id));

  const [friendsResult, invitesResult, confirmedResult] = await Promise.all([
    supabase.from("public_friendships").select("friend_id").eq("user_id", viewerId),
    supabase.from("run_invites").select("run_id").eq("user_id", viewerId),
    listedIds.length === 0
      ? Promise.resolve({ data: [] as { run_id: string }[], error: null })
      : supabase
          .from("run_participants")
          .select("run_id")
          .eq("user_id", viewerId)
          .eq("status", "confirmed")
          .in("run_id", listedIds),
  ]);

  if (friendsResult.error || invitesResult.error || confirmedResult.error) {
    console.error("loadRunListViewerFacts failed", friendsResult.error ?? invitesResult.error ?? confirmedResult.error);
    throw new Error("Failed to load runs.");
  }

  return {
    viewerId,
    isAdmin,
    friendIds: uuidSet(friendsResult.data.map((row) => row.friend_id)),
    invitedRunIds: uuidSet(invitesResult.data.map((row) => row.run_id)),
    confirmedRunIds: uuidSet(confirmedResult.data.map((row) => row.run_id)),
  };
}

function inFriendsSection(run: RunListItem, facts: RunListViewerFacts): boolean {
  if (run.visibility !== "friends_only" || !facts.viewerId) return false;
  return (
    facts.viewerId === run.organizerId || facts.friendIds.has(run.organizerId) || facts.confirmedRunIds.has(run.id)
  );
}

function inInvitedSection(run: RunListItem, facts: RunListViewerFacts): boolean {
  if (run.visibility !== "invite_only" || !facts.viewerId) return false;
  return facts.viewerId === run.organizerId || facts.invitedRunIds.has(run.id) || facts.confirmedRunIds.has(run.id);
}

/** Presentational split. Never put friends_only / invite_only into Public, including for admins. */
export function partitionActiveRuns(runs: readonly RunListItem[], facts: RunListViewerFacts): PartitionedActiveRuns {
  const publicRuns: RunListItem[] = [];
  const friendsRuns: RunListItem[] = [];
  const invitedRuns: RunListItem[] = [];
  const restrictedAdminRuns: RunListItem[] = [];

  for (const run of runs) {
    if (run.visibility === "public") {
      publicRuns.push(run);
      continue;
    }
    if (inFriendsSection(run, facts)) {
      friendsRuns.push(run);
      continue;
    }
    if (inInvitedSection(run, facts)) {
      invitedRuns.push(run);
      continue;
    }
    if (facts.isAdmin) {
      restrictedAdminRuns.push(run);
    }
  }

  return { publicRuns, friendsRuns, invitedRuns, restrictedAdminRuns };
}
