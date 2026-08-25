import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { AdminError } from "@/lib/services/admin";
import { replacePlayerLabels } from "@/lib/services/player-labels";
import { isUuid } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const userId = context.params.id ?? "";

  const fail = (message: string) => context.redirect(`/admin/users/${userId}?error=${encodeURIComponent(message)}`);
  const succeed = (message: string) => context.redirect(`/admin/users/${userId}?notice=${encodeURIComponent(message)}`);

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

  if (!isUuid(userId)) {
    return fail("Invalid user");
  }

  const form = await context.request.formData();
  const labelIds = form.getAll("label_id").filter((value): value is string => typeof value === "string");

  try {
    await replacePlayerLabels(supabase, userId, labelIds);
  } catch (err) {
    if (err instanceof AdminError) {
      return fail(err.message);
    }
    console.error("replacePlayerLabels failed", err);
    return fail("Could not save labels");
  }

  return succeed("Labels saved");
};
