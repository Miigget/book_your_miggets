import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { ensureOwnProfile } from "@/lib/services/runs";

const MIN_PASSWORD_LENGTH = 6;

function isInvalidCredentials(error: { code?: string; message: string }): boolean {
  return error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const currentPassword = (form.get("current_password") as string | null) ?? "";
  const password = (form.get("password") as string | null) ?? "";
  const confirmPassword = (form.get("confirmPassword") as string | null) ?? "";

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

  if (!currentPassword) {
    return fail("Current password is required");
  }
  if (!password) {
    return fail("Password is required");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail("Password must be at least 6 characters");
  }
  if (!confirmPassword) {
    return fail("Please confirm your password");
  }
  if (password !== confirmPassword) {
    return fail("Passwords do not match");
  }

  const sessionEmail = user.email;
  if (!sessionEmail) {
    console.error("password change missing session email");
    return fail("Could not update password");
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: sessionEmail,
    password: currentPassword,
  });

  if (reauthError) {
    console.error("password re-auth failed", reauthError);
    return fail(isInvalidCredentials(reauthError) ? "Current password is incorrect" : "Could not update password");
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    console.error("updateUser password failed", updateError);
    return fail("Could not update password");
  }

  return succeed("Password updated.");
};
