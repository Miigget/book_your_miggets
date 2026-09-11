import type { APIRoute } from "astro";
import { commentInvalidRun, commentJson, commentUnauthorized, runFail, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { isUuid, RunError, transferRunOwnership } from "@/lib/services/runs";

function formString(form: FormData, key: string): string {
  return ((form.get(key) as string | null) ?? "").trim();
}

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
  const newOrganizerId = formString(form, "new_organizer_id");

  try {
    await transferRunOwnership(supabase, runId, newOrganizerId);
  } catch (err) {
    if (err instanceof RunError) {
      return fail(err.message);
    }
    console.error("transferRunOwnership failed", err);
    return fail("Could not transfer this run");
  }

  const redirect = `/runs/${runId}`;
  if (wantsJson(context.request)) {
    return commentJson({ ok: true, redirect });
  }

  return context.redirect(redirect);
};
