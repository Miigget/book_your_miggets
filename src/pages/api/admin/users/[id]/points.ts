import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { AdminError, setAdminKogPoints } from "@/lib/services/admin";
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
  const kogPoints = (form.get("kog_points") as string | null) ?? "";

  try {
    await setAdminKogPoints(supabase, userId, kogPoints);
  } catch (err) {
    if (err instanceof AdminError) {
      return fail(err.message);
    }
    console.error("setAdminKogPoints failed", err);
    return fail("Could not save KoG points");
  }

  return succeed("KoG points saved");
};
