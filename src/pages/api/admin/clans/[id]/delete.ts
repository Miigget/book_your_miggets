import type { APIContext, APIRoute } from "astro";
import { commentJson, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { ClanError, CLAN_DELETE_FAILED, deleteClanAsAdmin } from "@/lib/services/clans";
import { isUuid } from "@/lib/services/runs";

function unauthorized(context: APIContext, clanId: string): Response {
  const signIn = `/auth/signin?returnTo=${encodeURIComponent(`/clans/${clanId}`)}`;
  if (wantsJson(context.request)) {
    return commentJson({ error: "Sign in required", signIn }, 401);
  }
  return context.redirect(signIn);
}

function invalid(context: APIContext): Response {
  if (wantsJson(context.request)) {
    return commentJson({ error: "Invalid request" }, 400);
  }
  return context.redirect("/clans");
}

export const POST: APIRoute = async (context) => {
  const clanId = context.params.id ?? "";

  if (!isUuid(clanId)) {
    return invalid(context);
  }

  const fail = (message: string) => {
    if (wantsJson(context.request)) {
      return commentJson({ error: message }, 400);
    }
    return context.redirect(`/clans/${clanId}?error=${encodeURIComponent(message)}`);
  };

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured");
  }

  if (!context.locals.user) {
    return unauthorized(context, clanId);
  }

  if (context.locals.profile?.role !== "admin") {
    if (wantsJson(context.request)) {
      return commentJson({ error: "Forbidden" }, 403);
    }
    return context.redirect("/");
  }

  try {
    await deleteClanAsAdmin(supabase, clanId);
  } catch (err) {
    if (err instanceof ClanError) {
      return fail(err.message);
    }
    console.error("deleteClanAsAdmin failed", err);
    return fail(CLAN_DELETE_FAILED);
  }

  const listUrl = `/clans?notice=${encodeURIComponent("Clan deleted")}`;
  if (wantsJson(context.request)) {
    return commentJson({ ok: true, redirect: listUrl });
  }
  return context.redirect(listUrl);
};
