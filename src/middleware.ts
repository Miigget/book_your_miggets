import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/runs/new", "/admin", "/runs/history", "/profile"];
const EDIT_RUN_PATH = /^\/runs\/[^/]+\/edit\/?$/;

/** Same-origin Referer pathname, else "/" — the open-redirect guard for the banned-POST gate. */
function bannedRedirectTarget(referer: string | null, requestOrigin: string): string {
  if (!referer) return "/";
  try {
    const url = new URL(referer);
    if (url.origin === requestOrigin) {
      return url.pathname;
    }
  } catch {
    // Unparseable Referer — fall through to "/".
  }
  return "/";
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  context.locals.user = null;
  context.locals.profile = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, is_banned, nickname")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        // Fail closed for /admin, open for the ban gate — RLS remains the backstop.
        console.error("Failed to load profile in middleware", error);
      } else if (data) {
        context.locals.profile = { role: data.role, isBanned: data.is_banned, nickname: data.nickname };
      }
    }
  }

  const pathname = context.url.pathname;

  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route)) || EDIT_RUN_PATH.test(pathname)) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (pathname.startsWith("/admin") && context.locals.profile?.role !== "admin") {
    // Plain 404 (no /404 page exists) — avoids advertising the admin surface.
    return new Response("Not found", { status: 404 });
  }

  if (
    context.request.method === "POST" &&
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth/") &&
    context.locals.profile?.isBanned
  ) {
    const target = bannedRedirectTarget(context.request.headers.get("Referer"), context.url.origin);
    return context.redirect(`${target}?error=${encodeURIComponent("Your account is banned")}`);
  }

  return next();
});
