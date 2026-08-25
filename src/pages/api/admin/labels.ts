import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { AdminError } from "@/lib/services/admin";
import { createLabel } from "@/lib/services/player-labels";

export const POST: APIRoute = async (context) => {
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

  const form = await context.request.formData();
  const name = (form.get("name") as string | null) ?? "";
  const color = (form.get("color") as string | null) ?? "";

  try {
    await createLabel(supabase, name, color);
  } catch (err) {
    if (err instanceof AdminError) {
      return fail(err.message);
    }
    console.error("createLabel failed", err);
    return fail("Could not create label");
  }

  return succeed("Label created");
};
