import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { ProfileError, getOwnProfile } from "@/lib/services/profile";
import {
  INVITE_LIST_EMPTY_MESSAGE,
  isUuid,
  isVisibility,
  parseInviteeIds,
  RESTRICTED_VISIBILITY_UNVERIFIED,
  RunError,
  setRunVisibilityAndInvites,
  updateRun,
} from "@/lib/services/runs";

function formString(form: FormData, key: string, fallback = ""): string {
  return ((form.get(key) as string | null) ?? fallback).trim();
}

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";

  if (!isUuid(runId)) {
    return context.redirect("/runs");
  }

  const form = await context.request.formData();
  const titleRaw = formString(form, "title");
  const mapIdRaw = formString(form, "map_id");
  const mapCategoryRaw = formString(form, "map_category");
  const startsAtRaw = formString(form, "starts_at");
  const maxParticipantsRaw = formString(form, "max_participants");
  const minPointsRaw = formString(form, "min_points", "0");
  const joinModeRaw = formString(form, "join_mode");
  const visibilityRaw = formString(form, "visibility", "public");
  const inviteeIds = parseInviteeIds(form);

  const fail = (message: string) => context.redirect(`/runs/${runId}/edit?error=${encodeURIComponent(message)}`);

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

  if (!isVisibility(visibilityRaw)) {
    return fail("Visibility is invalid");
  }
  if (!ownProfile.isVerified && visibilityRaw !== "public") {
    return fail(RESTRICTED_VISIBILITY_UNVERIFIED);
  }
  if (visibilityRaw === "invite_only" && inviteeIds.length < 1) {
    return fail(INVITE_LIST_EMPTY_MESSAGE);
  }

  const input = {
    title: titleRaw,
    mapId: mapIdRaw,
    mapCategory: mapCategoryRaw,
    startsAt: startsAtRaw,
    maxParticipants: maxParticipantsRaw,
    minPoints: minPointsRaw,
    joinMode: joinModeRaw,
    visibility: visibilityRaw,
  };

  try {
    if (visibilityRaw === "invite_only") {
      await setRunVisibilityAndInvites(supabase, user.id, runId, input, inviteeIds);
    } else {
      await updateRun(supabase, user.id, runId, input);
    }
  } catch (err) {
    if (err instanceof RunError) {
      return fail(err.message);
    }
    console.error(visibilityRaw === "invite_only" ? "set_run_visibility_and_invites failed" : "updateRun failed", err);
    return fail("Could not save this run");
  }

  return context.redirect(`/runs/${runId}`);
};
