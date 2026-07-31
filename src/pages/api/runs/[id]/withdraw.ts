import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { ParticipantError, withdrawApplication } from "@/lib/services/participants";
import { isUuid } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";

  if (!isUuid(runId)) {
    return context.redirect("/runs");
  }

  const fail = (message: string) => context.redirect(`/runs/${runId}?error=${encodeURIComponent(message)}`);

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

  try {
    await withdrawApplication(supabase, runId, user.id);
  } catch (err) {
    if (err instanceof ParticipantError) {
      return fail(err.message);
    }
    console.error("withdrawApplication failed", err);
    return fail("Could not withdraw application");
  }

  return context.redirect(`/runs/${runId}`);
};
