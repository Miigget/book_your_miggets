import { isUuid, type AppSupabaseClient, type RunListItem } from "@/lib/services/runs";

export interface RunListViewerFacts {
  viewerId: string | null;
  isAdmin: boolean;
  friendIds: ReadonlySet<string>;
  invitedRunIds: ReadonlySet<string>;
  confirmedRunIds: ReadonlySet<string>;
  viewerClanId: string | null;
  organizerClanByUserId: ReadonlyMap<string, string>;
}

export interface PartitionedActiveRuns {
  publicRuns: RunListItem[];
  friendsRuns: RunListItem[];
  invitedRuns: RunListItem[];
  clanRuns: RunListItem[];
  restrictedAdminRuns: RunListItem[];
}

export function emptyRunListViewerFacts(isAdmin = false): RunListViewerFacts {
  return {
    viewerId: null,
    isAdmin,
    friendIds: new Set(),
    invitedRunIds: new Set(),
    confirmedRunIds: new Set(),
    viewerClanId: null,
    organizerClanByUserId: new Map(),
  };
}

function uuidSet(values: readonly (string | null)[] | null | undefined): Set<string> {
  return new Set((values ?? []).filter((id): id is string => typeof id === "string" && isUuid(id)));
}

export async function loadRunListViewerFacts(
  supabase: AppSupabaseClient,
  viewerId: string,
  isAdmin: boolean,
  runs: readonly RunListItem[],
): Promise<RunListViewerFacts> {
  if (!isUuid(viewerId)) {
    return { ...emptyRunListViewerFacts(isAdmin), viewerId };
  }

  const listedIds = runs.map((run) => run.id).filter((id) => isUuid(id));
  const clanOrganizerIds = [
    ...new Set(
      runs.filter((run) => run.visibility === "clan_only" && isUuid(run.organizerId)).map((run) => run.organizerId),
    ),
  ];

  const [friendsResult, invitesResult, confirmedResult, viewerClanResult, organizerClansResult] = await Promise.all([
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
    supabase.from("clan_members").select("clan_id").eq("user_id", viewerId).maybeSingle(),
    clanOrganizerIds.length === 0
      ? Promise.resolve({ data: [] as { user_id: string; clan_id: string }[], error: null })
      : supabase.from("clan_members").select("user_id, clan_id").in("user_id", clanOrganizerIds),
  ]);

  if (
    friendsResult.error ||
    invitesResult.error ||
    confirmedResult.error ||
    viewerClanResult.error ||
    organizerClansResult.error
  ) {
    console.error(
      "loadRunListViewerFacts failed",
      friendsResult.error ??
        invitesResult.error ??
        confirmedResult.error ??
        viewerClanResult.error ??
        organizerClansResult.error,
    );
    throw new Error("Failed to load runs.");
  }

  const organizerClanByUserId = new Map<string, string>();
  for (const row of organizerClansResult.data) {
    if (isUuid(row.user_id) && isUuid(row.clan_id)) {
      organizerClanByUserId.set(row.user_id, row.clan_id);
    }
  }

  const viewerClanId =
    typeof viewerClanResult.data?.clan_id === "string" && isUuid(viewerClanResult.data.clan_id)
      ? viewerClanResult.data.clan_id
      : null;

  return {
    viewerId,
    isAdmin,
    friendIds: uuidSet(friendsResult.data.map((row) => row.friend_id)),
    invitedRunIds: uuidSet(invitesResult.data.map((row) => row.run_id)),
    confirmedRunIds: uuidSet(confirmedResult.data.map((row) => row.run_id)),
    viewerClanId,
    organizerClanByUserId,
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

function inClanSection(run: RunListItem, facts: RunListViewerFacts): boolean {
  if (run.visibility !== "clan_only" || !facts.viewerId) return false;
  if (facts.viewerId === run.organizerId || facts.confirmedRunIds.has(run.id)) return true;
  const viewerClanId = facts.viewerClanId;
  if (!viewerClanId) return false;
  return facts.organizerClanByUserId.get(run.organizerId) === viewerClanId;
}

/** Presentational split. Never put friends_only / invite_only / clan_only into Public, including for admins. */
export function partitionActiveRuns(runs: readonly RunListItem[], facts: RunListViewerFacts): PartitionedActiveRuns {
  const publicRuns: RunListItem[] = [];
  const friendsRuns: RunListItem[] = [];
  const invitedRuns: RunListItem[] = [];
  const clanRuns: RunListItem[] = [];
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
    if (inClanSection(run, facts)) {
      clanRuns.push(run);
      continue;
    }
    if (facts.isAdmin) {
      restrictedAdminRuns.push(run);
    }
  }

  return { publicRuns, friendsRuns, invitedRuns, clanRuns, restrictedAdminRuns };
}
