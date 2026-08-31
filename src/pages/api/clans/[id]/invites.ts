import type { APIRoute } from "astro";
import { postClanInviteMutation } from "@/lib/clan-invite-mutation-http";
import { inviteFriendsToClan } from "@/lib/services/clans";
import { isUuid, parseInviteeIds } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const clanId = context.params.id ?? "";

  if (!isUuid(clanId)) {
    return context.redirect("/clans");
  }

  const form = await context.request.formData();
  const inviteeIds = parseInviteeIds(form);

  return postClanInviteMutation(
    context,
    form,
    "Clan invites sent.",
    async (supabase, userId) => {
      await inviteFriendsToClan(supabase, { ownerId: userId, clanId, inviteeIds });
    },
    { redirectTo: `/clans/${clanId}` },
  );
};
