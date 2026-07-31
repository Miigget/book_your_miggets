import type { APIRoute } from "astro";
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
    return context.redirect("/runs");
  }

  const fail = (message: string) => context.redirect(`/runs/${runId}?error=${encodeURIComponent(message)}`);

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
    return context.redirect(`/auth/signin?returnTo=${encodeURIComponent(`/runs/${runId}`)}`);
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
    return fail(err instanceof Error ? err.message : "Could not update application");
  }

  return context.redirect(`/runs/${runId}`);
};
