import type { APIRoute } from "astro";
import { postClanInviteMutation } from "@/lib/clan-invite-mutation-http";
import { acceptClanInvite } from "@/lib/services/clans";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const inviteId = ((form.get("invite_id") as string | null) ?? "").trim();

  return postClanInviteMutation(context, form, "Clan invite accepted.", async (supabase, userId) => {
    await acceptClanInvite(supabase, userId, inviteId);
  });
};
