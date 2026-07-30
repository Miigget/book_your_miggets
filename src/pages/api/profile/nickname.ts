import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const nickname = ((form.get("nickname") as string | null) ?? "").trim();
  const redirectRaw = (form.get("redirect") as string | null) ?? "/runs/new";
  const redirectTo = redirectRaw.startsWith("/") && !redirectRaw.startsWith("//") ? redirectRaw : "/runs/new";

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${redirectTo}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect("/auth/signin");
  }

  if (!nickname) {
    return context.redirect(`${redirectTo}?error=${encodeURIComponent("Nickname is required")}`);
  }

  if (nickname.length > 32) {
    return context.redirect(`${redirectTo}?error=${encodeURIComponent("Nickname must be 32 characters or fewer")}`);
  }

  const { error } = await supabase.from("profiles").update({ nickname }).eq("id", user.id);

  if (error) {
    const message =
      error.code === "23505" ? "That nickname is already taken" : `Could not save nickname: ${error.message}`;
    return context.redirect(`${redirectTo}?error=${encodeURIComponent(message)}`);
  }

  return context.redirect(redirectTo);
};
