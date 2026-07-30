import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { ensureOwnProfile, getOwnNickname, isJoinMode, isUuid } from "@/lib/services/runs";

function formString(form: FormData, key: string, fallback = ""): string {
  return ((form.get(key) as string | null) ?? fallback).trim();
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const titleRaw = formString(form, "title");
  const mapIdRaw = formString(form, "map_id");
  const startsAtRaw = formString(form, "starts_at");
  const maxParticipantsRaw = formString(form, "max_participants");
  const minPointsRaw = formString(form, "min_points", "0");
  const joinModeRaw = formString(form, "join_mode");
  const nicknameRaw = formString(form, "nickname");

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
    return fail(err instanceof Error ? err.message : "Could not prepare your profile");
  }

  const existingNickname = await getOwnNickname(supabase, user.id);

  if (!existingNickname) {
    if (!nicknameRaw) {
      return fail("Set a nickname before creating a run");
    }
    if (nicknameRaw.length > 32) {
      return fail("Nickname must be 32 characters or fewer");
    }

    const { error: nickError } = await supabase.from("profiles").update({ nickname: nicknameRaw }).eq("id", user.id);

    if (nickError) {
      const message =
        nickError.code === "23505" ? "That nickname is already taken" : `Could not save nickname: ${nickError.message}`;
      return fail(message);
    }
  }

  const title = titleRaw.length > 0 ? titleRaw : null;
  const mapId = mapIdRaw.length > 0 ? mapIdRaw : null;

  if (mapId !== null) {
    if (!isUuid(mapId)) {
      return fail("Invalid map selection");
    }
    const { data: mapRow, error: mapError } = await supabase.from("maps").select("id").eq("id", mapId).maybeSingle();
    if (mapError) {
      return fail(`Could not validate map: ${mapError.message}`);
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

  const { data: run, error: insertError } = await supabase
    .from("runs")
    .insert({
      organizer_id: user.id,
      title,
      map_id: mapId,
      starts_at: startsAt.toISOString(),
      max_participants: maxParticipants,
      min_points: minPoints,
      join_mode: joinModeRaw,
      archived_at: null,
    })
    .select("id")
    .single();

  if (insertError) {
    return fail(insertError.message);
  }

  return context.redirect(`/runs/${run.id}`);
};
