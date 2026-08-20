import type { APIRoute } from "astro";
import { commentInvalidRun, commentJson, commentUnauthorized, runFail, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { decideParticipant, ParticipantError } from "@/lib/services/participants";
import { isUuid } from "@/lib/services/runs";

function formString(form: FormData, key: string): string {
  return ((form.get(key) as string | null) ?? "").trim();
}

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

  const form = await context.request.formData();
  const statusRaw = formString(form, "status");

  if (statusRaw !== "confirmed" && statusRaw !== "denied") {
    return fail("Decision must be accept or deny");
  }

  try {
    await decideParticipant(supabase, runId, participantId, user.id, statusRaw);
  } catch (err) {
    if (err instanceof ParticipantError) {
      return fail(err.message);
    }
    console.error("decideParticipant failed", err);
    return fail("Could not update application");
  }

  if (wantsJson(context.request)) {
    return commentJson({ ok: true, status: statusRaw, participantId });
  }

  return context.redirect(`/runs/${runId}`);
};
