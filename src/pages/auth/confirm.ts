import type { APIRoute } from "astro";
import { completeEmailAuth } from "@/lib/auth-callback";
import { authErrorRedirect, authVerifiedLocation, safeAuthConfirmNext } from "@/lib/safe-return-to";
import { createClient } from "@/lib/supabase";

export const GET: APIRoute = async (context) => {
  const next = safeAuthConfirmNext(context.url.searchParams.get("next"));
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const emailAuth = await completeEmailAuth(supabase, context.url);
    if (emailAuth.handled) {
      return context.redirect(emailAuth.location);
    }
  }

  if (context.locals.user) {
    return context.redirect(authVerifiedLocation(next));
  }

  return context.redirect(authErrorRedirect("/auth/signin", "Invalid confirmation link", null));
};
