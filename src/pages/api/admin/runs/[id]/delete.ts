import type { APIRoute } from "astro";
import { commentInvalidRun, commentJson, commentUnauthorized, runFail, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { AdminError, deleteRunAsAdmin } from "@/lib/services/admin";
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

  if (!context.locals.user) {
    return commentUnauthorized(context, runId);
  }

  if (context.locals.profile?.role !== "admin") {
    if (wantsJson(context.request)) {
      return commentJson({ error: "Forbidden" }, 403);
    }
    return context.redirect("/");
  }

  try {
    await deleteRunAsAdmin(supabase, runId);
  } catch (err) {
    if (err instanceof AdminError) {
      return fail(err.message);
    }
    console.error("deleteRunAsAdmin failed", err);
    return fail("Could not delete this run");
  }

  const listUrl = `/runs?notice=${encodeURIComponent("Run deleted")}`;
  if (wantsJson(context.request)) {
    return commentJson({ ok: true, redirect: listUrl });
  }

  return context.redirect(listUrl);
};
