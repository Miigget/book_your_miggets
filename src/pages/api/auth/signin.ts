import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorRedirect, safeAuthReturnTo } from "@/lib/safe-return-to";

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

  return context.redirect(returnTo ?? "/");
};
