import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { ProfileError, getOwnProfile } from "@/lib/services/profile";
import { ensureOwnProfile } from "@/lib/services/runs";
import {
  ClanError,
  CLAN_CREATE_FAILED,
  CLAN_NICKNAME_LOCKED,
  CLAN_VERIFIED_ONLY,
  createClan,
} from "@/lib/services/clans";

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

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const name = formString(form, "name");
  const tag = formString(form, "tag");
  const pictureFile = formFile(form, "picture");

  const fail = (message: string) => context.redirect(`/clans/new?error=${encodeURIComponent(message)}`);

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

  let ownProfile: Awaited<ReturnType<typeof getOwnProfile>>;
  try {
    ownProfile = await getOwnProfile(supabase, user.id);
  } catch (err) {
    if (err instanceof ProfileError) {
      return fail(err.message);
    }
    console.error("getOwnProfile failed", err);
    return fail("Could not load your profile");
  }

  if (!ownProfile.isVerified) {
    return fail(CLAN_VERIFIED_ONLY);
  }

  if (!ownProfile.nickname) {
    return fail(CLAN_NICKNAME_LOCKED);
  }

  try {
    const clan = await createClan(supabase, { ownerId: user.id, name, tag, pictureFile });
    return context.redirect(`/clans/${clan.id}`);
  } catch (err) {
    if (err instanceof ClanError) {
      return fail(err.message);
    }
    console.error("createClan failed", err);
    return fail(CLAN_CREATE_FAILED);
  }
};
