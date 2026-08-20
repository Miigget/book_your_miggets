import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { CommentError, deleteCommentAsAdmin } from "@/lib/services/comments";
import { isUuid } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";
  const commentId = context.params.commentId ?? "";

  if (!isUuid(runId) || !isUuid(commentId)) {
    return context.redirect("/runs");
  }

  const fail = (message: string) => context.redirect(`/runs/${runId}?commentError=${encodeURIComponent(message)}`);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured");
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  if (context.locals.profile?.role !== "admin") {
    return context.redirect("/");
  }

  try {
    await deleteCommentAsAdmin(supabase, runId, commentId);
  } catch (err) {
    if (err instanceof CommentError) {
      return fail(err.message);
    }
    console.error("deleteCommentAsAdmin failed", err);
    return fail("Could not delete this comment");
  }

  return context.redirect(`/runs/${runId}`);
};
