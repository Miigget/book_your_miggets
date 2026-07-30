import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { ensureOwnProfile } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const nickname = ((form.get("nickname") as string | null) ?? "").trim();
  const redirectRaw = (form.get("redirect") as string | null) ?? "/runs/new";
  const redirectTo = redirectRaw.startsWith("/") && !redirectRaw.startsWith("//") ? redirectRaw : "/runs/new";

  const fail = (message: string) => context.redirect(`${redirectTo}?error=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect("/auth/signin");
  }

  try {
    await ensureOwnProfile(supabase);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not prepare your profile");
  }

  if (!nickname) {
    return fail("Nickname is required");
  }

  if (nickname.length > 32) {
    return fail("Nickname must be 32 characters or fewer");
  }

  const { error } = await supabase.from("profiles").update({ nickname }).eq("id", user.id);

  if (error) {
    const message =
      error.code === "23505" ? "That nickname is already taken" : `Could not save nickname: ${error.message}`;
    return fail(message);
  }

  return context.redirect(redirectTo);
};
