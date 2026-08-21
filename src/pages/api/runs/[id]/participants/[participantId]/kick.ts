import type { APIRoute } from "astro";
import { commentInvalidRun, commentJson, commentUnauthorized, runFail, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { kickParticipant, ParticipantError } from "@/lib/services/participants";
import { isUuid } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";
  const participantId = context.params.participantId ?? "";

  if (!isUuid(runId)) {
    return commentInvalidRun(context);
  }

  const fail = (message: string) => runFail(context, runId, message);

  if (!isUuid(participantId)) {
    return fail("Invalid participant");
  }

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
    await kickParticipant(supabase, runId, participantId, user.id);
  } catch (err) {
    if (err instanceof ParticipantError) {
      return fail(err.message);
    }
    console.error("kickParticipant failed", err);
    return fail("Could not remove this player");
  }

  if (wantsJson(context.request)) {
    return commentJson({ ok: true, participantId });
  }

  return context.redirect(`/runs/${runId}`);
};
