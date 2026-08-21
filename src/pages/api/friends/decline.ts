import type { APIRoute } from "astro";
import { postFriendMutation } from "@/lib/friend-mutation-http";
import { declineFriendRequest } from "@/lib/services/friends";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const requestId = ((form.get("request_id") as string | null) ?? "").trim();

  return postFriendMutation(context, form, "Friend request declined.", async (supabase, userId) => {
    await declineFriendRequest(supabase, userId, requestId);
  });
};
