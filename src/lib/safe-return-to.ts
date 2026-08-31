const RUN_RETURN_TO_RE = /^\/runs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const PLAYER_PATH_RE = /^\/players\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const CLAN_PATH_RE = /^\/clans\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Allow only `/runs/{uuid}` relative paths (blocks open redirects). */
export function safeRunReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = RUN_RETURN_TO_RE.exec(trimmed);
  if (!match) return null;
  return `/runs/${match[1]}`;
}

/** Post-login `?returnTo=` — `/runs/{uuid}`, `/players/{uuid}`, or `/clans/{uuid}` only. Do not allow `/profile`. */
export function safeAuthReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const run = RUN_RETURN_TO_RE.exec(trimmed);
  if (run) return `/runs/${run[1]}`;
  const player = PLAYER_PATH_RE.exec(trimmed);
  if (player) return `/players/${player[1]}`;
  const clan = CLAN_PATH_RE.exec(trimmed);
  if (clan) return `/clans/${clan[1]}`;
  return null;
}

/** Friend mutation bounce — `/profile` or `/players/{uuid}` only. */
export function safeFriendRedirect(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "/profile") return "/profile";
  const player = PLAYER_PATH_RE.exec(trimmed);
  if (player) return `/players/${player[1]}`;
  return null;
}

/** Clan-invite mutation bounce — `/profile` or `/clans/{uuid}` only. Do not allow `/profile` in `safeAuthReturnTo`. */
export function safeClanInviteRedirect(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "/profile") return "/profile";
  const clan = CLAN_PATH_RE.exec(trimmed);
  if (clan) return `/clans/${clan[1]}`;
  return null;
}

/** After email confirm/PKCE — `/`, `/profile`, or the post-login allowlist. */
export function safeAuthConfirmNext(value: string | null | undefined): string {
  if (!value) return "/";
  const trimmed = value.trim();
  if (trimmed === "/" || trimmed === "/profile") return trimmed;
  return safeAuthReturnTo(trimmed) ?? "/";
}

/** Absolute `emailRedirectTo` for GoTrue (signup + email change). */
export function authConfirmRedirectUrl(origin: string, next?: string | null): string {
  const url = new URL("/auth/confirm", origin);
  const safe = safeAuthConfirmNext(next);
  if (safe !== "/") url.searchParams.set("next", safe);
  return url.href;
}

/** Same-request redirect after PKCE/OTP so the success page loads with session cookies. */
export function authVerifiedLocation(next: string): string {
  const safe = safeAuthConfirmNext(next);
  if (safe === "/") return "/auth/verified";
  const url = new URL("/auth/verified", "http://local.invalid");
  url.searchParams.set("next", safe);
  return `${url.pathname}${url.search}`;
}

export function withReturnTo(path: string, returnTo: string | null | undefined): string {
  const safe = safeAuthReturnTo(returnTo);
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
  const safe = safeAuthReturnTo(returnTo);
  if (safe) url.searchParams.set("returnTo", safe);
  return `${url.pathname}${url.search}`;
}
