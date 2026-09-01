import type { APIRoute } from "astro";
import {
  commentFail,
  commentInvalidRun,
  commentJson,
  commentUnauthorized,
  wantsJson,
} from "@/lib/comment-mutation-http";
import { createClient } from "@/lib/supabase";
import { CommentError, createComment } from "@/lib/services/comments";
import { isUuid } from "@/lib/services/runs";

function formFile(form: FormData, key: string): File | null {
  const value = form.get(key);
  if (value instanceof File && value.size > 0) {
    return value;
  }
  return null;
}

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";

  if (!isUuid(runId)) {
    return commentInvalidRun(context);
  }

  const fail = (message: string) => commentFail(context, runId, message);

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
  const body = (form.get("body") as string | null) ?? "";
  const screenshot = formFile(form, "screenshot");

  try {
    const comment = await createComment(supabase, runId, user.id, body, screenshot);
    if (wantsJson(context.request)) {
      return commentJson({ comment });
    }
  } catch (err) {
    if (err instanceof CommentError) {
      return fail(err.message);
    }
    console.error("createComment failed", err);
    return fail("Could not post comment");
  }

  return context.redirect(`/runs/${runId}`);
};
