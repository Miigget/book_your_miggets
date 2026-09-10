import type { APIRoute } from "astro";
import { commentInvalidRun, commentJson, commentUnauthorized, runFail, wantsJson } from "@/lib/comment-mutation-http";
import { parseMapIdsFromForm } from "@/lib/run-maps";
import { createMapPoll, PollError } from "@/lib/services/polls";
import { isUuid } from "@/lib/services/runs";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";

  if (!isUuid(runId)) {
    return commentInvalidRun(context);
  }

  const fail = (message: string) => runFail(context, runId, message);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured");
  }

  if (!context.locals.user) {
    return commentUnauthorized(context, runId);
  }

  const form = await context.request.formData();
  const mapIds = parseMapIdsFromForm(form);

  try {
    await createMapPoll(supabase, runId, mapIds);
  } catch (err) {
    if (err instanceof PollError) {
      return fail(err.message);
    }
    console.error("createMapPoll failed", err);
    return fail("Could not create this map poll");
  }

  const redirect = `/runs/${runId}`;
  if (wantsJson(context.request)) {
    return commentJson({ ok: true, redirect });
  }

  return context.redirect(redirect);
};
