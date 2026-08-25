import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { AdminError, setKogPointsVerified } from "@/lib/services/admin";
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
  const value = form.get("value");
  if (value !== "true" && value !== "false") {
    return fail("Invalid request");
  }
  const verified = value === "true";

  try {
    await setKogPointsVerified(supabase, userId, verified);
  } catch (err) {
    if (err instanceof AdminError) {
      return fail(err.message);
    }
    console.error("setKogPointsVerified failed", err);
    return fail(verified ? "Could not mark KoG points as checked in-game" : "Could not unmark KoG points");
  }

  return succeed(verified ? "KoG points marked as checked in-game" : "KoG points unmarked");
};
