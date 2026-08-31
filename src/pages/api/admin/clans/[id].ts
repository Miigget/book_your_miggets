import type { APIContext, APIRoute } from "astro";
import { commentJson, wantsJson } from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { ClanError, CLAN_UPDATE_FAILED, updateClanAsAdmin } from "@/lib/services/clans";
import { isUuid } from "@/lib/services/runs";

function formString(form: FormData, key: string, fallback = ""): string {
  return ((form.get(key) as string | null) ?? fallback).trim();
}

function formFile(form: FormData, key: string): File | null {
  const value = form.get(key);
  if (value instanceof File && value.size > 0) {
    return value;
  }
  return null;
}

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

  const form = await context.request.formData();
  const name = formString(form, "name");
  const tag = formString(form, "tag");
  const pictureFile = formFile(form, "picture");

  try {
    await updateClanAsAdmin(supabase, clanId, { name, tag, pictureFile });
  } catch (err) {
    if (err instanceof ClanError) {
      return fail(err.message);
    }
    console.error("updateClanAsAdmin failed", err);
    return fail(CLAN_UPDATE_FAILED);
  }

  const detailUrl = `/clans/${clanId}?notice=${encodeURIComponent("Clan saved")}`;
  if (wantsJson(context.request)) {
    return commentJson({ ok: true, redirect: detailUrl });
  }
  return context.redirect(detailUrl);
};
