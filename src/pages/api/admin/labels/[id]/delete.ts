import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { AdminError } from "@/lib/services/admin";
import { deleteLabel } from "@/lib/services/player-labels";
import { isUuid } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const labelId = context.params.id ?? "";

  const fail = (message: string) => context.redirect(`/admin/labels?error=${encodeURIComponent(message)}`);
  const succeed = (message: string) => context.redirect(`/admin/labels?notice=${encodeURIComponent(message)}`);

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

  if (!isUuid(labelId)) {
    return fail("Invalid label");
  }

  try {
    const result = await deleteLabel(supabase, labelId);
    const playerWord = result.assignedCount === 1 ? "player" : "players";
    return succeed(`Deleted “${result.name}” (removed from ${result.assignedCount} ${playerWord})`);
  } catch (err) {
    if (err instanceof AdminError) {
      return fail(err.message);
    }
    console.error("deleteLabel failed", err);
    return fail("Could not delete label");
  }
};
