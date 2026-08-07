import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { AdminError, deleteRunAsAdmin } from "@/lib/services/admin";
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

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  if (context.locals.profile?.role !== "admin") {
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

  return context.redirect(`/runs?notice=${encodeURIComponent("Run deleted")}`);
};
