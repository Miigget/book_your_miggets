import type { APIRoute } from "astro";
import {
  DEV_QUICK_LOGIN_ACCOUNTS,
  createLocalServiceRoleClient,
  isDevQuickLoginEnabled,
  resolveDevQuickLoginAccount,
} from "@/lib/dev-quick-login";
import { authErrorRedirect, safeRunReturnTo } from "@/lib/safe-return-to";
import { createClient } from "@/lib/supabase";
import { ensureOwnProfile } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  if (!isDevQuickLoginEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  const form = await context.request.formData();
  const returnTo = safeRunReturnTo((form.get("returnTo") as string | null) ?? undefined);
  const accountId = resolveDevQuickLoginAccount(form.get("account"));
  if (!accountId) {
    return context.redirect(authErrorRedirect("/auth/signin", "Unknown dev account", returnTo));
  }

  const { email, password, nickname } = DEV_QUICK_LOGIN_ACCOUNTS[accountId];

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(authErrorRedirect("/auth/signin", "Supabase is not configured", returnTo));
  }

  const admin = createLocalServiceRoleClient();
  if (!admin) {
    return context.redirect(authErrorRedirect("/auth/signin", "Dev quick login unavailable", returnTo));
  }

  // Clear any existing session so switching accounts is one click.
  await supabase.auth.signOut();

  let { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nickname },
    });

    if (createError) {
      const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = listed.users.find((user) => user.email?.toLowerCase() === email);
      if (!existing) {
        return context.redirect(
          authErrorRedirect("/auth/signin", createError.message || "Could not create dev user", returnTo),
        );
      }
      const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
      if (updateError) {
        return context.redirect(authErrorRedirect("/auth/signin", updateError.message, returnTo));
      }
    }

    ({ error: signInError } = await supabase.auth.signInWithPassword({ email, password }));
  }

  if (signInError) {
    return context.redirect(authErrorRedirect("/auth/signin", signInError.message, returnTo));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(authErrorRedirect("/auth/signin", "Dev quick login failed", returnTo));
  }

  try {
    await ensureOwnProfile(supabase);
    const { data: profile } = await supabase.from("profiles").select("nickname").eq("id", user.id).maybeSingle();
    if (profile?.nickname !== nickname) {
      const { error: nickError } = await supabase.from("profiles").update({ nickname }).eq("id", user.id);
      if (nickError && nickError.code !== "23505") {
        return context.redirect(authErrorRedirect("/auth/signin", nickError.message, returnTo));
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not prepare dev profile";
    return context.redirect(authErrorRedirect("/auth/signin", message, returnTo));
  }

  return context.redirect(returnTo ?? "/runs");
};
