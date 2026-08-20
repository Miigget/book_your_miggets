import type { APIContext } from "astro";

export function wantsJson(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("application/json");
}

export function commentJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function runFail(context: APIContext, runId: string, message: string): Response {
  if (wantsJson(context.request)) {
    return commentJson({ error: message }, 400);
  }
  return context.redirect(`/runs/${runId}?error=${encodeURIComponent(message)}`);
}

export function commentFail(context: APIContext, runId: string, message: string): Response {
  if (wantsJson(context.request)) {
    return commentJson({ error: message }, 400);
  }
  return context.redirect(`/runs/${runId}?commentError=${encodeURIComponent(message)}`);
}

export function commentUnauthorized(context: APIContext, runId: string): Response {
  const signIn = `/auth/signin?returnTo=${encodeURIComponent(`/runs/${runId}`)}`;
  if (wantsJson(context.request)) {
    return commentJson({ error: "Sign in required", signIn }, 401);
  }
  return context.redirect(signIn);
}

export function commentInvalidRun(context: APIContext): Response {
  if (wantsJson(context.request)) {
    return commentJson({ error: "Invalid request" }, 400);
  }
  return context.redirect("/runs");
}
