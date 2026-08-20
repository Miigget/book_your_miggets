import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { ProfileError, submitNicknameChangeRequest } from "@/lib/services/profile";
import { ensureOwnProfile } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const requested = (form.get("requested_nickname") as string | null) ?? "";

  const fail = (message: string) => context.redirect(`/profile?error=${encodeURIComponent(message)}`);
  const succeed = (message: string) => context.redirect(`/profile?notice=${encodeURIComponent(message)}`);

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
    console.error("ensureOwnProfile failed", err);
    return fail("Could not prepare your profile");
  }

  try {
    await submitNicknameChangeRequest(supabase, user.id, requested);
  } catch (err) {
    if (err instanceof ProfileError) {
      return fail(err.message);
    }
    console.error("submitNicknameChangeRequest failed", err);
    return fail("Could not submit nickname request");
  }

  return succeed("Nickname change requested.");
};
