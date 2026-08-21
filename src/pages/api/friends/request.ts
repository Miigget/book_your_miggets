import type { APIRoute } from "astro";
import { postFriendMutation } from "@/lib/friend-mutation-http";
import { sendFriendRequest } from "@/lib/services/friends";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const targetId = ((form.get("user_id") as string | null) ?? "").trim();

  return postFriendMutation(context, form, "Friend request sent.", async (supabase, userId) => {
    await sendFriendRequest(supabase, userId, targetId);
  });
};
