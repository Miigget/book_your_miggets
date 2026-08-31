import type { APIContext } from "astro";
import { commentJson, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { safeAuthReturnTo, safeClanInviteRedirect } from "@/lib/safe-return-to";
import { ClanError, CLAN_INVITE_UPDATE_FAILED } from "@/lib/services/clans";
import { ensureOwnProfile, type AppSupabaseClient } from "@/lib/services/runs";

function formString(form: FormData, key: string): string {
  return ((form.get(key) as string | null) ?? "").trim();
}

function clanInviteSignInUrl(redirect: string): string {
  const safe = safeAuthReturnTo(redirect);
  if (!safe) return "/auth/signin";
  return `/auth/signin?returnTo=${encodeURIComponent(safe)}`;
}

export async function postClanInviteMutation(
  context: APIContext,
  form: FormData,
  notice: string,
  mutate: (supabase: AppSupabaseClient, userId: string) => Promise<void>,
  options?: { redirectTo?: string },
): Promise<Response> {
  const redirectTo = options?.redirectTo ?? safeClanInviteRedirect(formString(form, "redirect")) ?? "/profile";
  const json = wantsJson(context.request);

  const fail = (message: string) => {
    if (json) {
      return commentJson({ error: message }, 400);
    }
    return context.redirect(`${redirectTo}?error=${encodeURIComponent(message)}`);
  };

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const signIn = clanInviteSignInUrl(redirectTo);
    if (json) {
      return commentJson({ error: "Sign in required", signIn }, 401);
    }
    return context.redirect(signIn);
  }

  try {
    await ensureOwnProfile(supabase);
  } catch (err) {
    console.error("ensureOwnProfile failed", err);
    return fail("Could not prepare your profile");
  }

  try {
    await mutate(supabase, user.id);
  } catch (err) {
    if (err instanceof ClanError) {
      return fail(err.message);
    }
    console.error("clan invite mutation failed", err);
    return fail(CLAN_INVITE_UPDATE_FAILED);
  }

  if (json) {
    return commentJson({ ok: true });
  }

  return context.redirect(`${redirectTo}?notice=${encodeURIComponent(notice)}`);
}
