import type { APIRoute } from "astro";
import { commentInvalidRun, commentJson, commentUnauthorized, runFail, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { leaveTeamAsOrganizer, ParticipantError } from "@/lib/services/participants";
import { isUuid } from "@/lib/services/runs";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return commentUnauthorized(context, runId);
  }

  try {
    await leaveTeamAsOrganizer(supabase, runId, user.id);
  } catch (err) {
    if (err instanceof ParticipantError) {
      return fail(err.message);
    }
    console.error("leaveTeamAsOrganizer failed", err);
    return fail("Could not leave the team");
  }

  if (wantsJson(context.request)) {
    return commentJson({ ok: true });
  }

  return context.redirect(`/runs/${runId}`);
};
