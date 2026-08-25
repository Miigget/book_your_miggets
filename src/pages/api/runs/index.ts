import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { ProfileError, getOwnProfile, setOwnNickname } from "@/lib/services/profile";
import {
  createInviteOnlyRun,
  ensureOwnProfile,
  INVITE_LIST_EMPTY_MESSAGE,
  isJoinMode,
  isUuid,
  isVisibility,
  mapRunMapCategoryConstraintError,
  normalizeOptionalRunTitle,
  normalizeRunMapAndCategory,
  parseInviteeIds,
  RESTRICTED_VISIBILITY_UNVERIFIED,
  RunError,
} from "@/lib/services/runs";

function formString(form: FormData, key: string, fallback = ""): string {
  return ((form.get(key) as string | null) ?? fallback).trim();
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const titleRaw = formString(form, "title");
  const mapIdRaw = formString(form, "map_id");
  const mapCategoryRaw = formString(form, "map_category");
  const startsAtRaw = formString(form, "starts_at");
  const maxParticipantsRaw = formString(form, "max_participants");
  const minPointsRaw = formString(form, "min_points", "0");
  const joinModeRaw = formString(form, "join_mode");
  const nicknameRaw = formString(form, "nickname");
  const visibilityRaw = formString(form, "visibility", "public");
  const inviteeIds = parseInviteeIds(form);

  const fail = (message: string) => context.redirect(`/runs/new?error=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect("/auth/signin");
  }

  try {
    await ensureOwnProfile(supabase);
  } catch (err) {
    console.error("ensureOwnProfile failed", err);
    return fail("Could not prepare your profile");
  }

  let ownProfile: Awaited<ReturnType<typeof getOwnProfile>>;
  try {
    ownProfile = await getOwnProfile(supabase, user.id);
  } catch (err) {
    if (err instanceof ProfileError) {
      return fail(err.message);
    }
    console.error("getOwnProfile failed", err);
    return fail("Could not load your profile");
  }

  if (!ownProfile.nickname) {
    if (ownProfile.isVerified) {
      return fail("Verified nicknames are locked. Request a change on your profile.");
    }
    if (!nicknameRaw) {
      return fail("Set a nickname before creating a run");
    }
    try {
      await setOwnNickname(supabase, user.id, nicknameRaw);
    } catch (err) {
      if (err instanceof ProfileError) {
        return fail(err.message);
      }
      console.error("setOwnNickname failed", err);
      return fail("Could not save nickname");
    }
  }

  if (!isVisibility(visibilityRaw)) {
    return fail("Visibility is invalid");
  }
  if (!ownProfile.isVerified && visibilityRaw !== "public") {
    return fail(RESTRICTED_VISIBILITY_UNVERIFIED);
  }
  if (visibilityRaw === "invite_only" && inviteeIds.length < 1) {
    return fail(INVITE_LIST_EMPTY_MESSAGE);
  }

  let title: string | null;
  try {
    title = normalizeOptionalRunTitle(titleRaw);
  } catch (err) {
    if (err instanceof RunError) {
      return fail(err.message);
    }
    throw err;
  }
  let mapId: string | null;
  let mapCategory: string | null;
  try {
    ({ mapId, mapCategory } = normalizeRunMapAndCategory(mapIdRaw, mapCategoryRaw));
  } catch (err) {
    if (err instanceof RunError) {
      return fail(err.message);
    }
    throw err;
  }

  if (mapId !== null) {
    if (!isUuid(mapId)) {
      return fail("Invalid map selection");
    }
    const { data: mapRow, error: mapError } = await supabase.from("maps").select("id").eq("id", mapId).maybeSingle();
    if (mapError) {
      console.error("create run map lookup failed", mapError);
      return fail("Could not create this run");
    }
    if (!mapRow) {
      return fail("Selected map was not found");
    }
  }

  if (!startsAtRaw) {
    return fail("Start time is required");
  }

  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) {
    return fail("Start time is invalid");
  }
  if (startsAt.getTime() <= Date.now()) {
    return fail("Start time must be in the future");
  }

  const maxParticipants = Number.parseInt(maxParticipantsRaw, 10);
  if (!Number.isFinite(maxParticipants) || maxParticipants <= 0) {
    return fail("Capacity must be a whole number greater than 0");
  }

  const minPoints = Number.parseInt(minPointsRaw, 10);
  if (!Number.isFinite(minPoints) || minPoints < 0) {
    return fail("Min points must be 0 or greater");
  }

  if (!isJoinMode(joinModeRaw)) {
    return fail("Join mode is invalid");
  }

  if (visibilityRaw === "invite_only") {
    try {
      const runId = await createInviteOnlyRun(supabase, user.id, {
        title,
        mapId,
        mapCategory,
        startsAtIso: startsAt.toISOString(),
        maxParticipants,
        minPoints,
        joinMode: joinModeRaw,
        inviteeIds,
      });
      return context.redirect(`/runs/${runId}`);
    } catch (err) {
      if (err instanceof RunError) {
        return fail(err.message);
      }
      console.error("create_invite_only_run failed", err);
      return fail("Could not create this run");
    }
  }

  const { data: run, error: insertError } = await supabase
    .from("runs")
    .insert({
      organizer_id: user.id,
      title,
      map_id: mapId,
      map_category: mapCategory,
      starts_at: startsAt.toISOString(),
      max_participants: maxParticipants,
      min_points: minPoints,
      join_mode: joinModeRaw,
      visibility: visibilityRaw,
      archived_at: null,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("create run insert failed", insertError);
    const mapped = mapRunMapCategoryConstraintError(insertError);
    if (mapped) {
      return fail(mapped.message);
    }
    return fail("Could not create this run");
  }

  return context.redirect(`/runs/${run.id}`);
};
