import type { EmailOtpType } from "@supabase/supabase-js";
import { authErrorRedirect, authVerifiedLocation, safeAuthConfirmNext } from "@/lib/safe-return-to";
import type { AppSupabaseClient } from "@/lib/services/runs";

export type EmailAuthCallback = { handled: false } | { handled: true; location: string };

/**
 * Completes PKCE (`?code=`) or token-hash (`?token_hash=&type=`) from an Auth email link.
 * Caller must redirect to `location` so Set-Cookie is committed before the next SSR pass.
 */
export async function completeEmailAuth(supabase: AppSupabaseClient, url: URL): Promise<EmailAuthCallback> {
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const typeRaw = url.searchParams.get("type");
  const next = safeAuthConfirmNext(url.searchParams.get("next"));

  if (!code && !tokenHash) {
    return { handled: false };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("exchangeCodeForSession failed", error);
      return { handled: true, location: authErrorRedirect("/auth/signin", confirmLinkError(error.message), null) };
    }
    return { handled: true, location: authVerifiedLocation(next) };
  }

  if (tokenHash && isEmailOtpType(typeRaw)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: typeRaw });
    if (error) {
      console.error("verifyOtp failed", error);
      return { handled: true, location: authErrorRedirect("/auth/signin", confirmLinkError(error.message), null) };
    }
    return { handled: true, location: authVerifiedLocation(next) };
  }

  return { handled: true, location: authErrorRedirect("/auth/signin", "Invalid confirmation link", null) };
}

export function signupErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "over_email_send_rate_limit" || /email rate limit exceeded/i.test(error.message)) {
    return "Too many confirmation emails have been sent from this site in the last hour. Wait about an hour, then try again.";
  }
  return error.message;
}

function isEmailOtpType(value: string | null): value is EmailOtpType {
  switch (value) {
    case "signup":
    case "invite":
    case "magiclink":
    case "recovery":
    case "email_change":
    case "email":
      return true;
    default:
      return false;
  }
}

function confirmLinkError(message: string): string {
  if (/expired|invalid|otp/i.test(message)) {
    return "This confirmation link is invalid or has expired. Request a new one from sign up.";
  }
  return message;
}
