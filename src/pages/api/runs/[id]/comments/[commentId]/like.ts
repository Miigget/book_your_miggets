import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { CommentError, setCommentLiked } from "@/lib/services/comments";
import { isUuid } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";
  const commentId = context.params.commentId ?? "";

  if (!isUuid(runId)) {
    return context.redirect("/runs");
  }

  const fail = (message: string) => context.redirect(`/runs/${runId}?commentError=${encodeURIComponent(message)}`);

  if (!isUuid(commentId)) {
    return context.redirect(`/runs/${runId}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(`/auth/signin?returnTo=${encodeURIComponent(`/runs/${runId}`)}`);
  }

  const form = await context.request.formData();
  const value = form.get("value");
  if (value !== "true" && value !== "false") {
    return fail("Invalid request");
  }
  const liked = value === "true";

  try {
    await setCommentLiked(supabase, runId, commentId, user.id, liked);
  } catch (err) {
    if (err instanceof CommentError) {
      return fail(err.message);
    }
    console.error("setCommentLiked failed", err);
    return fail("Could not update like");
  }

  return context.redirect(`/runs/${runId}`);
};
