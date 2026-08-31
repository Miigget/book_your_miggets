import type { APIRoute } from "astro";
import { commentInvalidRun, commentJson, commentUnauthorized, runFail, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { extendRun, isUuid, RunError, type ExtendRunHours } from "@/lib/services/runs";

const EXTEND_HOURS: readonly ExtendRunHours[] = [1, 2, 3, 6];
const INVALID_HOURS_MESSAGE = "Extend duration must be 1, 2, 3, or 6 hours";

function parseExtendHours(form: FormData): ExtendRunHours | null {
  const raw = form.get("hours");
  if (typeof raw !== "string") return null;
  const hours = Number(raw);
  return EXTEND_HOURS.find((allowed) => allowed === hours) ?? null;
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
  const hours = parseExtendHours(form);
  if (hours === null) {
    return fail(INVALID_HOURS_MESSAGE);
  }

  try {
    await extendRun(supabase, runId, hours);
  } catch (err) {
    if (err instanceof RunError) {
      return fail(err.message);
    }
    console.error("extendRun failed", err);
    return fail("Could not extend this run");
  }

  const redirect = `/runs/${runId}`;
  if (wantsJson(context.request)) {
    return commentJson({ ok: true, redirect });
  }

  return context.redirect(redirect);
};
