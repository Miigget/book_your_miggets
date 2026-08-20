import type { APIRoute } from "astro";
import {
  commentFail,
  commentInvalidRun,
  commentJson,
  commentUnauthorized,
  wantsJson,
} from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { CommentError, setCommentLiked } from "@/lib/services/comments";
import { isUuid } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";
  const commentId = context.params.commentId ?? "";

  if (!isUuid(runId)) {
    return commentInvalidRun(context);
  }

  const fail = (message: string) => commentFail(context, runId, message);

  if (!isUuid(commentId)) {
    if (wantsJson(context.request)) {
      return commentJson({ error: "Invalid request" }, 400);
    }
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
    return commentUnauthorized(context, runId);
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

  if (wantsJson(context.request)) {
    return commentJson({ ok: true, liked });
  }

  return context.redirect(`/runs/${runId}`);
};
