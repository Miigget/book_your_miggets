import { activeWindowStartsAfter } from "@/lib/run-lifecycle";
import type { Enums } from "@/types/database";
import { ensureOwnProfile, getOwnNickname, isUuid, type AppSupabaseClient } from "@/lib/services/runs";

export type ParticipantStatus = Enums<"participant_status">;

export interface ConfirmedParticipant {
  id: string;
  userId: string;
  nickname: string | null;
}

export interface PendingParticipant {
  id: string;
  userId: string;
  nickname: string | null;
  createdAt: string;
}

export interface OwnParticipation {
  id: string;
  status: ParticipantStatus;
}

export class ParticipantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParticipantError";
  }
}

interface ParticipantRow {
  id: string;
  user_id: string;
  status: ParticipantStatus;
  created_at: string;
  profile: { nickname: string | null } | null;
}

const PARTICIPANT_SELECT = `
  id,
  user_id,
  status,
  created_at,
  profile:public_profiles!run_participants_user_id_fkey (
    nickname
  )
` as const;

function mapNickname(row: ParticipantRow): string | null {
  const nickname = row.profile?.nickname?.trim();
  if (!nickname) return null;
  return nickname;
}

export async function listConfirmedParticipants(
  supabase: AppSupabaseClient,
  runId: string,
): Promise<ConfirmedParticipant[]> {
  const { data, error } = await supabase
    .from("run_participants")
    .select(PARTICIPANT_SELECT)
    .eq("run_id", runId)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list confirmed participants: ${error.message}`);
  }

  return (data as unknown as ParticipantRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    nickname: mapNickname(row),
  }));
}

export async function listPendingParticipants(
  supabase: AppSupabaseClient,
  runId: string,
): Promise<PendingParticipant[]> {
  const { data, error } = await supabase
    .from("run_participants")
    .select(PARTICIPANT_SELECT)
    .eq("run_id", runId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list pending participants: ${error.message}`);
  }

  return (data as unknown as ParticipantRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    nickname: mapNickname(row),
    createdAt: row.created_at,
  }));
}

export async function listDeniedParticipants(
  supabase: AppSupabaseClient,
  runId: string,
): Promise<PendingParticipant[]> {
  const { data, error } = await supabase
    .from("run_participants")
    .select(PARTICIPANT_SELECT)
    .eq("run_id", runId)
    .eq("status", "denied")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list denied participants: ${error.message}`);
  }

  return (data as unknown as ParticipantRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    nickname: mapNickname(row),
    createdAt: row.created_at,
  }));
}

export async function getOwnParticipation(
  supabase: AppSupabaseClient,
  runId: string,
  userId: string,
): Promise<OwnParticipation | null> {
  const { data, error } = await supabase
    .from("run_participants")
    .select("id, status")
    .eq("run_id", runId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load participation: ${error.message}`);
  }

  if (!data) return null;
  return { id: data.id, status: data.status };
}

export async function countConfirmedParticipants(supabase: AppSupabaseClient, runId: string): Promise<number> {
  const { count, error } = await supabase
    .from("run_participants")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("status", "confirmed");

  if (error) {
    throw new Error(`Failed to count confirmed participants: ${error.message}`);
  }

  return count ?? 0;
}

async function loadActiveRunForMutation(
  supabase: AppSupabaseClient,
  runId: string,
): Promise<{ id: string; join_mode: Enums<"join_mode">; organizer_id: string }> {
  if (!isUuid(runId)) {
    throw new ParticipantError("Invalid run");
  }

  const { data, error } = await supabase
    .from("runs")
    .select("id, join_mode, organizer_id")
    .eq("id", runId)
    .is("archived_at", null)
    .gt("starts_at", activeWindowStartsAfter())
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load run: ${error.message}`);
  }

  if (!data) {
    throw new ParticipantError("Run not found or no longer active");
  }

  return data;
}

async function autoJoinRun(supabase: AppSupabaseClient, runId: string): Promise<void> {
  const { data: outcome, error } = await supabase.rpc("auto_join_run", { p_run_id: runId });

  if (error) {
    console.error("auto_join_run RPC failed", error);
    throw new ParticipantError("Could not apply to this run");
  }

  switch (outcome) {
    case "confirmed":
    case "already_confirmed":
      // already_confirmed is idempotent success: a double-submit race resolves
      // here once the run-row lock serializes the two requests.
      return;
    case "full":
      throw new ParticipantError("This run is already full");
    case "already_pending":
      throw new ParticipantError("You already applied to this run");
    case "denied":
      throw new ParticipantError("Your application was denied; the organizer can still accept you later");
    case "no_nickname":
      throw new ParticipantError("Set a nickname before applying");
    case "not_active":
      throw new ParticipantError("Run not found or no longer active");
    default:
      // not_auto_join / banned / not_authenticated should be unreachable via the
      // service prelude; treat them (and unknown outcomes) as unexpected.
      console.error("auto_join_run returned unexpected outcome", outcome);
      throw new ParticipantError("Could not apply to this run");
  }
}

export async function applyToRun(
  supabase: AppSupabaseClient,
  runId: string,
  userId: string,
): Promise<{ status: "pending" | "confirmed"; participantId: string }> {
  await ensureOwnProfile(supabase);

  const run = await loadActiveRunForMutation(supabase, runId);

  const nickname = await getOwnNickname(supabase, userId);
  if (!nickname) {
    throw new ParticipantError("Set a nickname before applying");
  }

  const existing = await getOwnParticipation(supabase, runId, userId);
  if (existing) {
    switch (existing.status) {
      case "pending":
        throw new ParticipantError("You already applied to this run");
      case "confirmed":
        throw new ParticipantError("You are already on this run");
      case "denied":
        throw new ParticipantError("Your application was denied; the organizer can still accept you later");
      default: {
        const _exhaustive: never = existing.status;
        void _exhaustive;
        throw new ParticipantError("Unexpected participation status");
      }
    }
  }

  if (run.join_mode === "auto_join") {
    await autoJoinRun(supabase, runId);
    const own = await getOwnParticipation(supabase, runId, userId);
    if (own?.status !== "confirmed") {
      throw new ParticipantError("Could not apply to this run");
    }
    return { status: "confirmed", participantId: own.id };
  }

  const { data, error } = await supabase
    .from("run_participants")
    .insert({
      run_id: runId,
      user_id: userId,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      throw new ParticipantError("You already have an application for this run");
    }
    throw new Error(`Failed to apply: ${error.message}`);
  }

  if (!data) {
    throw new ParticipantError("Could not apply to this run");
  }

  return { status: "pending", participantId: data.id };
}

export async function withdrawApplication(supabase: AppSupabaseClient, runId: string, userId: string): Promise<void> {
  await loadActiveRunForMutation(supabase, runId);

  const own = await getOwnParticipation(supabase, runId, userId);
  if (!own) {
    throw new ParticipantError("No pending application to withdraw");
  }
  if (own.status !== "pending") {
    throw new ParticipantError("Only a pending application can be withdrawn");
  }

  const { error, count } = await supabase
    .from("run_participants")
    .delete({ count: "exact" })
    .eq("id", own.id)
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to withdraw: ${error.message}`);
  }

  if (!count) {
    throw new ParticipantError("No pending application to withdraw");
  }
}

export async function leaveTeamAsOrganizer(supabase: AppSupabaseClient, runId: string, userId: string): Promise<void> {
  const run = await loadActiveRunForMutation(supabase, runId);

  if (run.organizer_id !== userId) {
    throw new ParticipantError("Only the organizer can leave the team this way");
  }

  const own = await getOwnParticipation(supabase, runId, userId);
  if (own?.status !== "confirmed") {
    throw new ParticipantError("You are not seated on this run");
  }

  const { error, count } = await supabase
    .from("run_participants")
    .delete({ count: "exact" })
    .eq("id", own.id)
    .eq("user_id", userId)
    .eq("status", "confirmed");

  if (error) {
    throw new Error(`Failed to leave team: ${error.message}`);
  }

  if (!count) {
    throw new ParticipantError("You are not seated on this run");
  }
}

export async function decideParticipant(
  supabase: AppSupabaseClient,
  runId: string,
  participantId: string,
  organizerId: string,
  status: "confirmed" | "denied",
): Promise<void> {
  const run = await loadActiveRunForMutation(supabase, runId);

  if (run.organizer_id !== organizerId) {
    throw new ParticipantError("Only the organizer can accept or deny applicants");
  }

  if (!isUuid(participantId)) {
    throw new ParticipantError("Invalid participant");
  }

  const { data: row, error: loadError } = await supabase
    .from("run_participants")
    .select("id, status, run_id")
    .eq("id", participantId)
    .eq("run_id", runId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load participant: ${loadError.message}`);
  }

  if (!row) {
    throw new ParticipantError("Participant not found");
  }

  if (row.status === status) {
    return;
  }

  if (row.status === "confirmed" && status === "denied") {
    throw new ParticipantError("Cannot deny a confirmed participant");
  }

  if (row.status !== "pending" && row.status !== "denied") {
    throw new ParticipantError("Could not update participant");
  }

  const { data: updated, error } = await supabase
    .from("run_participants")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", participantId)
    .eq("run_id", runId)
    .in("status", ["pending", "denied"])
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update participant: ${error.message}`);
  }

  if (!updated) {
    throw new ParticipantError("Could not update participant");
  }
}
