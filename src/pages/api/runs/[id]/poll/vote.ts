import type { APIRoute } from "astro";
import { commentInvalidRun, commentJson, commentUnauthorized, pollFail, wantsJson } from "@/lib/comment-mutation-http";
import { getRunMapPoll, PollError, voteMapPoll } from "@/lib/services/polls";
import { isUuid } from "@/lib/services/runs";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";

  if (!isUuid(runId)) {
    return commentInvalidRun(context);
  }

  const fail = (message: string) => pollFail(context, runId, message);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured");
  }

  const user = context.locals.user;
  if (!user) {
    return commentUnauthorized(context, runId);
  }

  const form = await context.request.formData();
  const mapIdRaw = form.get("map_id");
  const mapId = typeof mapIdRaw === "string" ? mapIdRaw.trim() : "";

  try {
    await voteMapPoll(supabase, runId, mapId);
  } catch (err) {
    if (err instanceof PollError) {
      return fail(err.message);
    }
    console.error("voteMapPoll failed", err);
    return fail("Could not submit your vote");
  }

  if (wantsJson(context.request)) {
    try {
      const poll = await getRunMapPoll(supabase, runId, user.id);
      return commentJson({ ok: true, poll });
    } catch (err) {
      console.error("getRunMapPoll after vote failed", err);
      return commentJson({ ok: true });
    }
  }

  return context.redirect(`/runs/${runId}`);
};
