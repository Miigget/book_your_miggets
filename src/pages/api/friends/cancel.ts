import type { APIRoute } from "astro";
import { postFriendMutation } from "@/lib/friend-mutation-http";
import { cancelFriendRequest } from "@/lib/services/friends";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const requestId = ((form.get("request_id") as string | null) ?? "").trim();

  return postFriendMutation(context, form, "Friend request cancelled.", async (supabase, userId) => {
    await cancelFriendRequest(supabase, userId, requestId);
  });
};
