import type { APIRoute } from "astro";
import { postFriendMutation } from "@/lib/friend-mutation-http";
import { unfriend } from "@/lib/services/friends";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const otherId = ((form.get("user_id") as string | null) ?? "").trim();

  return postFriendMutation(context, form, "Friend removed.", async (supabase, userId) => {
    await unfriend(supabase, userId, otherId);
  });
};
