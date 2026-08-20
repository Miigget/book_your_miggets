import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { CommentError, createComment } from "@/lib/services/comments";
import { isUuid } from "@/lib/services/runs";

export const POST: APIRoute = async (context) => {
  const runId = context.params.id ?? "";

  if (!isUuid(runId)) {
    return context.redirect("/runs");
  }

  const fail = (message: string) => context.redirect(`/runs/${runId}?commentError=${encodeURIComponent(message)}`);

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
  const body = (form.get("body") as string | null) ?? "";

  try {
    await createComment(supabase, runId, user.id, body);
  } catch (err) {
    if (err instanceof CommentError) {
      return fail(err.message);
    }
    console.error("createComment failed", err);
    return fail("Could not post comment");
  }

  return context.redirect(`/runs/${runId}`);
};
