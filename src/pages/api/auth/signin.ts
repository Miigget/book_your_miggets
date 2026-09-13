import type { APIRoute } from "astro";
import { authErrorRedirect, safeAuthReturnTo } from "@/lib/safe-return-to";
import { setInboxToastCookie } from "@/lib/services/inbox";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const returnTo = safeAuthReturnTo((form.get("returnTo") as string | null) ?? undefined);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(authErrorRedirect("/auth/signin", "Supabase is not configured", returnTo));
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(authErrorRedirect("/auth/signin", error.message, returnTo));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await setInboxToastCookie(context.cookies, supabase, user.id, context.url.protocol === "https:");
  }

  return context.redirect(returnTo ?? "/");
};
