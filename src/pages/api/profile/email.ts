import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { ensureOwnProfile } from "@/lib/services/runs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = ((form.get("email") as string | null) ?? "").trim();

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

  if (!email) {
    return fail("Email is required");
  }
  if (!EMAIL_RE.test(email)) {
    return fail("Enter a valid email address");
  }

  const currentEmail = user.email ?? "";
  if (currentEmail.toLowerCase() === email.toLowerCase()) {
    return succeed("Email updated.");
  }

  const { data, error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: new URL("/profile", context.url.origin).href },
  );

  if (error) {
    console.error("updateUser email failed", error);
    return fail("Could not update email");
  }

  const applied = (data.user.email ?? "").toLowerCase() === email.toLowerCase();
  return succeed(applied ? "Email updated." : "Check your inbox to confirm");
};
