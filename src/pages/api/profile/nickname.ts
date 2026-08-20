import type { APIRoute } from "astro";
import { commentJson, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { safeRunReturnTo } from "@/lib/safe-return-to";
import { ProfileError, setOwnNickname } from "@/lib/services/profile";
import { ensureOwnProfile } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const nickname = (form.get("nickname") as string | null) ?? "";
  const runReturn = safeRunReturnTo((form.get("redirect") as string | null) ?? undefined);
  const redirectTo = runReturn ?? "/profile";
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
    if (json) {
      return commentJson({ error: "Sign in required", signIn: "/auth/signin" }, 401);
    }
    return context.redirect("/auth/signin");
  }

  try {
    await ensureOwnProfile(supabase);
  } catch (err) {
    console.error("ensureOwnProfile failed", err);
    return fail("Could not prepare your profile");
  }

  try {
    await setOwnNickname(supabase, user.id, nickname);
  } catch (err) {
    if (err instanceof ProfileError) {
      return fail(err.message);
    }
    console.error("setOwnNickname failed", err);
    return fail("Could not save nickname");
  }

  const saved = nickname.trim();
  if (json) {
    return commentJson({ ok: true, nickname: saved });
  }

  if (runReturn) {
    return context.redirect(runReturn);
  }

  return context.redirect(`/profile?notice=${encodeURIComponent("Nickname saved.")}`);
};
