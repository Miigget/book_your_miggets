import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { AdminError, setUserVerified } from "@/lib/services/admin";
import { isUuid } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const userId = context.params.id ?? "";

  const fail = (message: string) => context.redirect(`/admin?error=${encodeURIComponent(message)}`);
  const succeed = (message: string) => context.redirect(`/admin?notice=${encodeURIComponent(message)}`);

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
    await setUserVerified(supabase, userId, verified);
  } catch (err) {
    if (err instanceof AdminError) {
      return fail(err.message);
    }
    console.error("setUserVerified failed", err);
    return fail(verified ? "Could not verify this user" : "Could not unverify this user");
  }

  return succeed(verified ? "User verified" : "User unverified");
};
