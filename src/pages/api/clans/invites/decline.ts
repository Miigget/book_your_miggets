import type { APIRoute } from "astro";
import { postClanInviteMutation } from "@/lib/clan-invite-mutation-http";
import { declineClanInvite } from "@/lib/services/clans";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const inviteId = ((form.get("invite_id") as string | null) ?? "").trim();

  return postClanInviteMutation(context, form, "Clan invite declined.", async (supabase, userId) => {
    await declineClanInvite(supabase, userId, inviteId);
  });
};
