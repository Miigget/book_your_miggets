import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { acceptNicknameChangeRequest, AdminError, denyNicknameChangeRequest } from "@/lib/services/admin";
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
  const decision = form.get("decision");
  if (decision !== "accept" && decision !== "deny") {
    return fail("Invalid request");
  }

  try {
    if (decision === "accept") {
      await acceptNicknameChangeRequest(supabase, userId);
    } else {
      await denyNicknameChangeRequest(supabase, userId);
    }
  } catch (err) {
    if (err instanceof AdminError) {
      return fail(err.message);
    }
    console.error("nickname request decision failed", err);
    return fail(decision === "accept" ? "Could not accept nickname request" : "Could not deny nickname request");
  }

  return succeed(decision === "accept" ? "Nickname request accepted" : "Nickname request denied");
};
