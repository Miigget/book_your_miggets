const RUN_RETURN_TO_RE = /^\/runs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Allow only `/runs/{uuid}` relative paths (blocks open redirects). */
export function safeRunReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = RUN_RETURN_TO_RE.exec(trimmed);
  if (!match) return null;
  return `/runs/${match[1]}`;
}

export function withReturnTo(path: string, returnTo: string | null | undefined): string {
  const safe = safeRunReturnTo(returnTo);
  if (!safe) return path;
  const url = new URL(path, "http://local.invalid");
  url.searchParams.set("returnTo", safe);
  return `${url.pathname}${url.search}`;
}

export function authErrorRedirect(
  basePath: "/auth/signin" | "/auth/signup",
  message: string,
  returnTo: string | null | undefined,
): string {
  const url = new URL(basePath, "http://local.invalid");
  url.searchParams.set("error", message);
  const safe = safeRunReturnTo(returnTo);
  if (safe) url.searchParams.set("returnTo", safe);
  return `${url.pathname}${url.search}`;
}
