import type { APIRoute } from "astro";
import {
  commentFail,
  commentInvalidRun,
  commentJson,
  commentUnauthorized,
  wantsJson,
} from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { CommentError, deleteCommentAsAdmin } from "@/lib/services/comments";
import { isUuid } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";
  const commentId = context.params.commentId ?? "";

  if (!isUuid(runId) || !isUuid(commentId)) {
    return commentInvalidRun(context);
  }

  const fail = (message: string) => commentFail(context, runId, message);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return fail("Supabase is not configured");
  }

  if (!context.locals.user) {
    return commentUnauthorized(context, runId);
  }

  if (context.locals.profile?.role !== "admin") {
    if (wantsJson(context.request)) {
      return commentJson({ error: "Forbidden" }, 403);
    }
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

  if (wantsJson(context.request)) {
    return commentJson({ ok: true });
  }

  return context.redirect(`/runs/${runId}`);
};
