import React, { useState } from "react";
import { Check, Tag, UserMinus, UserPlus, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Button } from "@/components/ui/button";
import { withReturnTo } from "@/lib/safe-return-to";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database";

export interface PendingApplicant {
  id: string;
  nickname: string | null;
}

interface Props {
  runId: string;
  joinMode: Enums<"join_mode">;
  maxParticipants: number;
  confirmedCount: number;
  isGuest: boolean;
  isBanned: boolean;
  isOrganizer: boolean;
  nickname: string | null;
  ownStatus: Enums<"participant_status"> | null;
  organizerSeated: boolean;
  pending: PendingApplicant[];
  denied: PendingApplicant[];
  serverError?: string | null;
}

export default function RunParticipantActions({
  runId,
  joinMode,
  maxParticipants,
  confirmedCount,
  isGuest,
  isBanned,
  isOrganizer,
  nickname,
  ownStatus,
  organizerSeated,
  pending,
  denied,
  serverError,
}: Props) {
  const returnPath = `/runs/${runId}`;
  const [nick, setNick] = useState("");
  const [nickError, setNickError] = useState<string | undefined>();

  function validateNickname(e: React.SubmitEvent<HTMLFormElement>) {
    const trimmed = nick.trim();
    if (!trimmed) {
      e.preventDefault();
      setNickError("Nickname is required");
      return;
    }
    if (trimmed.length > 32) {
      e.preventDefault();
      setNickError("Nickname must be 32 characters or fewer");
    }
  }

  function confirmAccept(e: React.SubmitEvent<HTMLFormElement>) {
    if (confirmedCount >= maxParticipants) {
      const ok = window.confirm(
        `This run is already at capacity (${confirmedCount}/${maxParticipants}). Accept anyway?`,
      );
      if (!ok) e.preventDefault();
    }
  }

  if (isGuest) {
    return (
      <div className="space-y-3">
        <ServerError message={serverError} />
        <p className="text-sm text-blue-100/60">Sign in to apply to this run.</p>
        <div className="flex flex-wrap gap-3">
          <a
            href={withReturnTo("/auth/signin", returnPath)}
            className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
          >
            Sign in
          </a>
          <a
            href={withReturnTo("/auth/signup", returnPath)}
            className="inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Sign up
          </a>
        </div>
      </div>
    );
  }

  const isAutoJoin = joinMode === "auto_join";
  const autoJoinFull = isAutoJoin && confirmedCount >= maxParticipants;

  return (
    <div className="space-y-5">
      <ServerError message={serverError} />

      {isBanned && ownStatus === null && (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          Your account is banned — you cannot join runs.
        </p>
      )}

      {!isBanned && autoJoinFull && ownStatus === null && (
        <div className="space-y-2">
          <Button type="button" disabled className="w-full rounded-lg bg-white/10 px-4 py-2 font-medium text-white/60">
            <UserPlus className="size-4" />
            This run is full
          </Button>
          <p className="text-sm text-blue-100/50">All {maxParticipants} slots are taken.</p>
        </div>
      )}

      {!isBanned && !autoJoinFull && !nickname && ownStatus === null && (
        <form
          method="POST"
          action="/api/profile/nickname"
          className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3"
          onSubmit={validateNickname}
          noValidate
        >
          <p className="text-sm text-amber-100/90">Set a public nickname before applying.</p>
          <input type="hidden" name="redirect" value={returnPath} />
          <FormField
            id="nickname"
            label="Nickname"
            value={nick}
            onChange={(v) => {
              setNick(v);
              if (nickError) setNickError(undefined);
            }}
            placeholder="Your in-game name"
            error={nickError}
            icon={<Tag className="size-4" />}
          />
          <SubmitButton pendingText="Saving..." icon={<Tag className="size-4" />}>
            Save nickname
          </SubmitButton>
        </form>
      )}

      {!isBanned && !autoJoinFull && nickname && ownStatus === null && (
        <form method="POST" action={`/api/runs/${runId}/apply`}>
          <SubmitButton pendingText={isAutoJoin ? "Joining..." : "Applying..."} icon={<UserPlus className="size-4" />}>
            {isAutoJoin ? "Join run" : "Apply to join"}
          </SubmitButton>
        </form>
      )}

      {ownStatus === "pending" && (
        <div className="space-y-3">
          <p className="text-sm text-blue-100/80">
            Status: <span className="text-amber-200">Pending approval</span>
          </p>
          <form method="POST" action={`/api/runs/${runId}/withdraw`}>
            <SubmitButton pendingText="Withdrawing..." icon={<UserMinus className="size-4" />}>
              Withdraw application
            </SubmitButton>
          </form>
        </div>
      )}

      {ownStatus === "denied" && (
        <p className="text-sm text-blue-100/80">
          Status: <span className="text-red-300">Denied</span>
          <span className="mt-1 block text-blue-100/50">
            You cannot apply again. The organizer can still accept you later.
          </span>
        </p>
      )}

      {ownStatus === "confirmed" && !isOrganizer && (
        <p className="text-sm text-blue-100/80">
          Status: <span className="text-emerald-300">Confirmed</span>
        </p>
      )}

      {isOrganizer && organizerSeated && (
        <form method="POST" action={`/api/runs/${runId}/leave-team`}>
          <SubmitButton pendingText="Leaving..." icon={<UserMinus className="size-4" />}>
            Leave team
          </SubmitButton>
        </form>
      )}

      {isOrganizer && ownStatus === null && joinMode === "approval_required" && nickname && (
        <p className="text-sm text-blue-100/50">You left the team. You can apply like any other member.</p>
      )}

      {isOrganizer && (
        <div className="space-y-3 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold tracking-wide text-white/80 uppercase">Pending applications</h3>
          {pending.length === 0 ? (
            <p className="text-sm text-blue-100/50">No pending applications.</p>
          ) : (
            <ul className="space-y-3">
              {pending.map((applicant) => (
                <li
                  key={applicant.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
                  )}
                >
                  <span className="text-sm text-white">{applicant.nickname ?? "Unknown player"}</span>
                  <div className="flex gap-2">
                    <form
                      method="POST"
                      action={`/api/runs/${runId}/participants/${applicant.id}/decide`}
                      onSubmit={confirmAccept}
                    >
                      <input type="hidden" name="status" value="confirmed" />
                      <Button
                        type="submit"
                        size="sm"
                        className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                      >
                        <Check className="size-4" />
                        Accept
                      </Button>
                    </form>
                    <form method="POST" action={`/api/runs/${runId}/participants/${applicant.id}/decide`}>
                      <input type="hidden" name="status" value="denied" />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="rounded-lg border-white/20 bg-transparent text-white hover:bg-white/10"
                      >
                        <X className="size-4" />
                        Deny
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isOrganizer && (
        <div className="space-y-3 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold tracking-wide text-white/80 uppercase">Denied applications</h3>
          {denied.length === 0 ? (
            <p className="text-sm text-blue-100/50">No denied applications.</p>
          ) : (
            <ul className="space-y-3">
              {denied.map((applicant) => (
                <li
                  key={applicant.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
                  )}
                >
                  <span className="text-sm text-white">{applicant.nickname ?? "Unknown player"}</span>
                  <form
                    method="POST"
                    action={`/api/runs/${runId}/participants/${applicant.id}/decide`}
                    onSubmit={confirmAccept}
                  >
                    <input type="hidden" name="status" value="confirmed" />
                    <Button
                      type="submit"
                      size="sm"
                      className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      <Check className="size-4" />
                      Accept
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
