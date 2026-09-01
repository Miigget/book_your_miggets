import type { APIRoute } from "astro";
import { commentInvalidRun, commentJson, commentUnauthorized, runFail, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { completeClanRun, isUuid, RunError } from "@/lib/services/runs";

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

  try {
    await completeClanRun(supabase, runId);
  } catch (err) {
    if (err instanceof RunError) {
      return fail(err.message);
    }
    console.error("completeClanRun failed", err);
    return fail("Could not complete this clan run");
  }

  const redirect = `/runs/${runId}`;
  if (wantsJson(context.request)) {
    return commentJson({ ok: true, redirect });
  }

  return context.redirect(redirect);
};
