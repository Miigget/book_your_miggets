import React, { useState } from "react";
import { Hash, Lock, Mail, Tag } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";

const MIN_PASSWORD_LENGTH = 6;
const NICKNAME_MAX_LENGTH = 32;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  email: string;
  nickname: string | null;
  isVerified: boolean;
  kogPoints: number | null;
  kogPointsVerified: boolean;
  pendingRequestedNickname: string | null;
}

export default function OwnProfileForm({
  email: initialEmail,
  nickname,
  isVerified,
  kogPoints,
  kogPointsVerified,
  pendingRequestedNickname,
}: Props) {
  const [nextNickname, setNextNickname] = useState(nickname ?? "");
  const [requestedNickname, setRequestedNickname] = useState(pendingRequestedNickname ?? "");
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [points, setPoints] = useState(kogPoints === null ? "" : String(kogPoints));

  const [nickError, setNickError] = useState<string | undefined>();
  const [requestError, setRequestError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordErrors, setPasswordErrors] = useState<{
    current_password?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [pointsError, setPointsError] = useState<string | undefined>();

  function validateNickname(e: React.SubmitEvent<HTMLFormElement>) {
    const trimmed = nextNickname.trim();
    if (!trimmed) {
      e.preventDefault();
      setNickError("Nickname is required");
      return;
    }
    if (trimmed.length > NICKNAME_MAX_LENGTH) {
      e.preventDefault();
      setNickError("Nickname must be 32 characters or fewer");
    }
  }

  function validateRequest(e: React.SubmitEvent<HTMLFormElement>) {
    const trimmed = requestedNickname.trim();
    if (!trimmed) {
      e.preventDefault();
      setRequestError("Nickname is required");
      return;
    }
    if (trimmed.length > NICKNAME_MAX_LENGTH) {
      e.preventDefault();
      setRequestError("Nickname must be 32 characters or fewer");
    }
  }

  function validateEmail(e: React.SubmitEvent<HTMLFormElement>) {
    if (!email.trim()) {
      e.preventDefault();
      setEmailError("Email is required");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      e.preventDefault();
      setEmailError("Enter a valid email address");
    }
  }

  function validatePassword(e: React.SubmitEvent<HTMLFormElement>) {
    const next: typeof passwordErrors = {};
    if (!currentPassword) {
      next.current_password = "Current password is required";
    }
    if (!password) {
      next.password = "Password is required";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (!confirmPassword) {
      next.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Passwords do not match";
    }
    if (Object.keys(next).length > 0) {
      e.preventDefault();
      setPasswordErrors(next);
    }
  }

  function validatePoints(e: React.SubmitEvent<HTMLFormElement>) {
    const trimmed = points.trim();
    if (trimmed === "") return;
    if (!/^\d+$/.test(trimmed)) {
      e.preventDefault();
      setPointsError("KoG points must be a whole number 0 or greater");
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold tracking-wide text-white/80 uppercase">Nickname</h2>
        {isVerified ? (
          <>
            <p className="text-sm text-blue-100/80">
              Current: <span className="text-white">{nickname ?? "—"}</span>
              <span className="mt-1 block text-xs text-blue-100/50">Verified nicknames are locked.</span>
            </p>
            {pendingRequestedNickname && (
              <p className="text-sm text-amber-100/80">
                Pending request: <span className="text-white">{pendingRequestedNickname}</span>
              </p>
            )}
            <form
              method="POST"
              action="/api/profile/nickname-request"
              className="space-y-4"
              onSubmit={validateRequest}
              noValidate
            >
              <FormField
                id="requested_nickname"
                label="Request a new nickname"
                value={requestedNickname}
                onChange={(v) => {
                  setRequestedNickname(v);
                  if (requestError) setRequestError(undefined);
                }}
                placeholder="Your in-game name"
                error={requestError}
                icon={<Tag className="size-4" />}
              />
              <SubmitButton pendingText="Submitting..." icon={<Tag className="size-4" />}>
                Request nickname change
              </SubmitButton>
            </form>
          </>
        ) : (
          <form
            method="POST"
            action="/api/profile/nickname"
            className="space-y-4"
            onSubmit={validateNickname}
            noValidate
          >
            <FormField
              id="nickname"
              label="Nickname"
              value={nextNickname}
              onChange={(v) => {
                setNextNickname(v);
                if (nickError) setNickError(undefined);
              }}
              placeholder={nickname ?? "Your in-game name"}
              error={nickError}
              icon={<Tag className="size-4" />}
            />
            <SubmitButton pendingText="Saving..." icon={<Tag className="size-4" />}>
              Save nickname
            </SubmitButton>
          </form>
        )}
      </section>

      <section className="space-y-4 border-t border-white/10 pt-8">
        <h2 className="text-sm font-semibold tracking-wide text-white/80 uppercase">Email</h2>
        <form method="POST" action="/api/profile/email" className="space-y-4" onSubmit={validateEmail} noValidate>
          <FormField
            id="email"
            type="email"
            label="Email"
            value={email}
            onChange={(v) => {
              setEmail(v);
              if (emailError) setEmailError(undefined);
            }}
            placeholder="you@example.com"
            error={emailError}
            icon={<Mail className="size-4" />}
          />
          <SubmitButton pendingText="Saving..." icon={<Mail className="size-4" />}>
            Update email
          </SubmitButton>
        </form>
      </section>

      <section className="space-y-4 border-t border-white/10 pt-8">
        <h2 className="text-sm font-semibold tracking-wide text-white/80 uppercase">Password</h2>
        <form method="POST" action="/api/profile/password" className="space-y-4" onSubmit={validatePassword} noValidate>
          <FormField
            id="current_password"
            label="Current password"
            type={showCurrent ? "text" : "password"}
            value={currentPassword}
            onChange={(v) => {
              setCurrentPassword(v);
              if (passwordErrors.current_password) {
                setPasswordErrors((prev) => ({ ...prev, current_password: undefined }));
              }
            }}
            placeholder="Your current password"
            error={passwordErrors.current_password}
            icon={<Lock className="size-4" />}
            endContent={
              <PasswordToggle
                visible={showCurrent}
                onToggle={() => {
                  setShowCurrent(!showCurrent);
                }}
              />
            }
          />
          <FormField
            id="password"
            label="New password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(v) => {
              setPassword(v);
              if (passwordErrors.password) {
                setPasswordErrors((prev) => ({ ...prev, password: undefined }));
              }
            }}
            placeholder="Min. 6 characters"
            error={passwordErrors.password}
            icon={<Lock className="size-4" />}
            endContent={
              <PasswordToggle
                visible={showPassword}
                onToggle={() => {
                  setShowPassword(!showPassword);
                }}
              />
            }
          />
          <FormField
            id="confirmPassword"
            name="confirmPassword"
            label="Confirm new password"
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(v) => {
              setConfirmPassword(v);
              if (passwordErrors.confirmPassword) {
                setPasswordErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }
            }}
            placeholder="Re-enter your new password"
            error={passwordErrors.confirmPassword}
            icon={<Lock className="size-4" />}
            endContent={
              <PasswordToggle
                visible={showConfirm}
                onToggle={() => {
                  setShowConfirm(!showConfirm);
                }}
              />
            }
          />
          <SubmitButton pendingText="Updating..." icon={<Lock className="size-4" />}>
            Update password
          </SubmitButton>
        </form>
      </section>

      <section className="space-y-4 border-t border-white/10 pt-8">
        <h2 className="text-sm font-semibold tracking-wide text-white/80 uppercase">KoG points</h2>
        <form method="POST" action="/api/profile/points" className="space-y-4" onSubmit={validatePoints} noValidate>
          <FormField
            id="kog_points"
            type="text"
            label="KoG points"
            value={points}
            onChange={(v) => {
              setPoints(v);
              if (pointsError) setPointsError(undefined);
            }}
            placeholder="Leave blank for none"
            error={pointsError}
            icon={<Hash className="size-4" />}
            hint={
              <p className="mt-1 text-xs text-blue-100/40">{kogPointsVerified ? "Checked in-game" : "Self-reported"}</p>
            }
          />
          <SubmitButton pendingText="Saving..." icon={<Hash className="size-4" />}>
            Save points
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
