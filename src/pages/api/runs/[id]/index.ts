import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { isUuid, RunError, updateRun } from "@/lib/services/runs";

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

  try {
    await updateRun(supabase, user.id, runId, {
      title: titleRaw,
      mapId: mapIdRaw,
      mapCategory: mapCategoryRaw,
      startsAt: startsAtRaw,
      maxParticipants: maxParticipantsRaw,
      minPoints: minPointsRaw,
      joinMode: joinModeRaw,
    });
  } catch (err) {
    if (err instanceof RunError) {
      return fail(err.message);
    }
    console.error("updateRun failed", err);
    return fail("Could not save this run");
  }

  return context.redirect(`/runs/${runId}`);
};
