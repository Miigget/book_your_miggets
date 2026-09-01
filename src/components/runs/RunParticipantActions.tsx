import React, { useState } from "react";
import { Check, Tag, UserMinus, UserPlus, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { NicknameLink } from "@/components/NicknameLink";
import { Button } from "@/components/ui/button";
import { fetchFormJson, reloadKeepingScroll } from "@/lib/fetch-form-json";
import { withReturnTo } from "@/lib/safe-return-to";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database";

export interface PendingApplicant {
  id: string;
  userId: string;
  nickname: string | null;
}

export interface ConfirmedPlayer {
  id: string;
  userId: string;
  nickname: string | null;
}

interface Props {
  runId: string;
  organizerId: string;
  viewerUserId: string | null;
  joinMode: Enums<"join_mode">;
  autoJoinMin: number | null;
  maxParticipants: number;
  isGuest: boolean;
  isBanned: boolean;
  isOrganizer: boolean;
  nickname: string | null;
  isVerified: boolean;
  ownStatus: Enums<"participant_status"> | null;
  confirmed: ConfirmedPlayer[];
  pending: PendingApplicant[];
  denied: PendingApplicant[];
  commentsMounted: boolean;
  serverError?: string | null;
  rosterFrozen?: boolean;
}

export default function RunParticipantActions({
  runId,
  organizerId,
  viewerUserId,
  joinMode,
  autoJoinMin,
  maxParticipants,
  isGuest,
  isBanned,
  isOrganizer,
  nickname: initialNickname,
  isVerified,
  ownStatus: initialOwnStatus,
  confirmed: initialConfirmed,
  pending: initialPending,
  denied: initialDenied,
  commentsMounted,
  serverError,
  rosterFrozen = false,
}: Props) {
  const returnPath = `/runs/${runId}`;
  const [nick, setNick] = useState("");
  const [nickError, setNickError] = useState<string | undefined>();
  const [nickname, setNickname] = useState(initialNickname);
  const [ownStatus, setOwnStatus] = useState(initialOwnStatus);
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [pending, setPending] = useState(initialPending);
  const [denied, setDenied] = useState(initialDenied);
  const [error, setError] = useState(serverError ?? null);
  const [busy, setBusy] = useState<string | null>(null);

  const confirmedCount = confirmed.length;
  const hasBand = autoJoinMin != null;
  const isJoinCta = (hasBand && confirmedCount < autoJoinMin) || (!hasBand && joinMode === "auto_join");
  const runFull = (hasBand || joinMode === "auto_join") && confirmedCount >= maxParticipants;

  function validateNickname(): boolean {
    const trimmed = nick.trim();
    if (!trimmed) {
      setNickError("Nickname is required");
      return false;
    }
    if (trimmed.length > 32) {
      setNickError("Nickname must be 32 characters or fewer");
      return false;
    }
    return true;
  }

  async function submitForm(form: HTMLFormElement, busyKey: string): Promise<boolean> {
    setBusy(busyKey);
    setError(null);
    try {
      const { response, data } = await fetchFormJson(form);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return false;
      }
      if (!response.ok) {
        setError(data.error ?? "Could not update this run");
        return false;
      }
      if (!data.ok) {
        setError(data.error ?? "Could not update this run");
        return false;
      }
      return true;
    } catch {
      setError("Could not update this run");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function onApply(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy("apply");
    setError(null);
    try {
      const { response, data } = await fetchFormJson(form);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      if (!response.ok || !data.ok || (data.status !== "pending" && data.status !== "confirmed")) {
        setError(data.error ?? "Could not apply to this run");
        return;
      }
      setOwnStatus(data.status);
      if (data.status === "pending" && viewerUserId && data.participantId) {
        setPending((prev) =>
          prev.some((row) => row.id === data.participantId)
            ? prev
            : [...prev, { id: data.participantId, userId: viewerUserId, nickname }],
        );
      }
      if (data.status === "confirmed" && viewerUserId && data.participantId) {
        setConfirmed((prev) =>
          prev.some((row) => row.id === data.participantId)
            ? prev
            : [...prev, { id: data.participantId, userId: viewerUserId, nickname }],
        );
        if (!commentsMounted) {
          reloadKeepingScroll();
        }
      }
    } catch {
      setError("Could not apply to this run");
    } finally {
      setBusy(null);
    }
  }

  async function onWithdraw(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!(await submitForm(e.currentTarget, "withdraw"))) return;
    setOwnStatus(null);
    if (viewerUserId) {
      setPending((prev) => prev.filter((row) => row.userId !== viewerUserId));
    }
  }

  async function onLeaveTeam(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!(await submitForm(e.currentTarget, "leave"))) return;
    setOwnStatus(null);
    if (viewerUserId) {
      setConfirmed((prev) => prev.filter((row) => row.userId !== viewerUserId));
    }
    if (commentsMounted) {
      reloadKeepingScroll();
    }
  }

  async function onKick(e: React.SubmitEvent<HTMLFormElement>, player: ConfirmedPlayer) {
    e.preventDefault();
    const label = player.nickname?.trim() ? player.nickname.trim() : "This player";
    const ok = window.confirm(
      `${label} will be removed from the run and cannot rejoin unless you accept them again. Continue?`,
    );
    if (!ok) return;
    if (!(await submitForm(e.currentTarget, `kick:${player.id}`))) return;
    setConfirmed((prev) => prev.filter((row) => row.id !== player.id));
    setDenied((prev) => (prev.some((row) => row.id === player.id) ? prev : [...prev, player]));
  }

  async function onSaveNickname(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateNickname()) return;
    const form = e.currentTarget;
    setBusy("nick");
    setError(null);
    try {
      const { response, data } = await fetchFormJson(form);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      if (!response.ok || !data.nickname) {
        setError(data.error ?? "Could not save nickname");
        return;
      }
      setNickname(data.nickname);
    } catch {
      setError("Could not save nickname");
    } finally {
      setBusy(null);
    }
  }

  async function onDecide(
    e: React.SubmitEvent<HTMLFormElement>,
    applicant: PendingApplicant,
    nextStatus: "confirmed" | "denied",
  ) {
    e.preventDefault();
    if (nextStatus === "confirmed" && confirmedCount >= maxParticipants) {
      const ok = window.confirm(
        `This run is already at capacity (${confirmedCount}/${maxParticipants}). Accept anyway?`,
      );
      if (!ok) return;
    }
    const form = e.currentTarget;
    const busyKey = `decide:${applicant.id}`;
    setBusy(busyKey);
    setError(null);
    try {
      const { response, data } = await fetchFormJson(form);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not update application");
        return;
      }
      setPending((prev) => prev.filter((row) => row.id !== applicant.id));
      if (nextStatus === "confirmed") {
        setDenied((prev) => prev.filter((row) => row.id !== applicant.id));
        setConfirmed((prev) => (prev.some((row) => row.id === applicant.id) ? prev : [...prev, applicant]));
        if (applicant.userId === viewerUserId) {
          setOwnStatus("confirmed");
        }
      } else {
        setDenied((prev) => (prev.some((row) => row.id === applicant.id) ? prev : [...prev, applicant]));
        if (applicant.userId === viewerUserId) {
          setOwnStatus("denied");
        }
      }
    } catch {
      setError("Could not update application");
    } finally {
      setBusy(null);
    }
  }

  if (isGuest) {
    return (
      <div className="space-y-3">
        <h2 className="mb-4 text-sm font-semibold tracking-wide text-white/80 uppercase">
          Participants ({confirmedCount}/{maxParticipants})
        </h2>
        <RosterList
          confirmed={confirmed}
          organizerId={organizerId}
          isOrganizer={false}
          runId={runId}
          busy={busy}
          onKick={onKick}
        />
        <ServerError message={error} />
        {rosterFrozen ? (
          <p className="text-sm text-blue-100/60">This clan run is completed. The roster cannot change.</p>
        ) : (
          <>
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
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-semibold tracking-wide text-white/80 uppercase">
        Participants ({confirmedCount}/{maxParticipants})
      </h2>
      <RosterList
        confirmed={confirmed}
        organizerId={organizerId}
        isOrganizer={isOrganizer && !rosterFrozen}
        runId={runId}
        busy={busy}
        onKick={onKick}
      />
      <ServerError message={error} />

      {rosterFrozen && (
        <p className="text-sm text-blue-100/60">This clan run is completed. The roster cannot change.</p>
      )}

      {!rosterFrozen && isBanned && ownStatus === null && (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          Your account is banned — you cannot join runs.
        </p>
      )}

      {!rosterFrozen && !isBanned && runFull && ownStatus === null && (
        <div className="space-y-2">
          <Button type="button" disabled className="w-full rounded-lg bg-white/10 px-4 py-2 font-medium text-white/60">
            <UserPlus className="size-4" />
            This run is full
          </Button>
          <p className="text-sm text-blue-100/50">All {maxParticipants} slots are taken.</p>
        </div>
      )}

      {!rosterFrozen && !isBanned && !runFull && !nickname && ownStatus === null && isVerified && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-100/90">
            Request a nickname on your{" "}
            <a href="/profile" className="font-medium text-white underline hover:text-purple-100">
              profile
            </a>{" "}
            before applying.
          </p>
        </div>
      )}

      {!rosterFrozen && !isBanned && !runFull && !nickname && ownStatus === null && !isVerified && (
        <form
          method="POST"
          action="/api/profile/nickname"
          className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onSaveNickname(event);
          }}
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
          <SubmitButton pendingText="Saving..." icon={<Tag className="size-4" />} busy={busy === "nick"}>
            Save nickname
          </SubmitButton>
        </form>
      )}

      {!rosterFrozen && !isBanned && !runFull && nickname && ownStatus === null && (
        <form
          method="POST"
          action={`/api/runs/${runId}/apply`}
          onSubmit={(event) => {
            event.preventDefault();
            void onApply(event);
          }}
        >
          <SubmitButton
            pendingText={isJoinCta ? "Joining..." : "Applying..."}
            icon={<UserPlus className="size-4" />}
            busy={busy === "apply"}
          >
            {isJoinCta ? "Join run" : "Apply to join"}
          </SubmitButton>
        </form>
      )}

      {!rosterFrozen && ownStatus === "pending" && (
        <div className="space-y-3">
          <p className="text-sm text-blue-100/80">
            Status: <span className="text-amber-200">Pending approval</span>
          </p>
          <form
            method="POST"
            action={`/api/runs/${runId}/withdraw`}
            onSubmit={(event) => {
              event.preventDefault();
              void onWithdraw(event);
            }}
          >
            <SubmitButton
              pendingText="Withdrawing..."
              icon={<UserMinus className="size-4" />}
              busy={busy === "withdraw"}
            >
              Withdraw application
            </SubmitButton>
          </form>
        </div>
      )}

      {!rosterFrozen && ownStatus === "denied" && (
        <p className="text-sm text-blue-100/80">
          Status: <span className="text-red-300">Denied</span>
          <span className="mt-1 block text-blue-100/50">
            You cannot apply again. The organizer can still accept you later.
          </span>
        </p>
      )}

      {!rosterFrozen && ownStatus === "confirmed" && (
        <div className="space-y-3">
          {!isOrganizer && (
            <p className="text-sm text-blue-100/80">
              Status: <span className="text-emerald-300">Confirmed</span>
            </p>
          )}
          <form
            method="POST"
            action={`/api/runs/${runId}/leave-team`}
            onSubmit={(event) => {
              event.preventDefault();
              void onLeaveTeam(event);
            }}
          >
            <SubmitButton pendingText="Leaving..." icon={<UserMinus className="size-4" />} busy={busy === "leave"}>
              Leave team
            </SubmitButton>
          </form>
        </div>
      )}

      {!rosterFrozen && isOrganizer && ownStatus === null && joinMode === "approval_required" && nickname && (
        <p className="text-sm text-blue-100/50">You left the team. You can apply like any other member.</p>
      )}

      {!rosterFrozen && isOrganizer && (
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
                  <span className="text-sm text-white">
                    <NicknameLink userId={applicant.userId} nickname={applicant.nickname} />
                  </span>
                  <div className="flex gap-2">
                    <form
                      method="POST"
                      action={`/api/runs/${runId}/participants/${applicant.id}/decide`}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void onDecide(event, applicant, "confirmed");
                      }}
                    >
                      <input type="hidden" name="status" value="confirmed" />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={busy === `decide:${applicant.id}`}
                        className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                      >
                        <Check className="size-4" />
                        Accept
                      </Button>
                    </form>
                    <form
                      method="POST"
                      action={`/api/runs/${runId}/participants/${applicant.id}/decide`}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void onDecide(event, applicant, "denied");
                      }}
                    >
                      <input type="hidden" name="status" value="denied" />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={busy === `decide:${applicant.id}`}
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

      {!rosterFrozen && isOrganizer && (
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
                  <span className="text-sm text-white">
                    <NicknameLink userId={applicant.userId} nickname={applicant.nickname} />
                  </span>
                  <form
                    method="POST"
                    action={`/api/runs/${runId}/participants/${applicant.id}/decide`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onDecide(event, applicant, "confirmed");
                    }}
                  >
                    <input type="hidden" name="status" value="confirmed" />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={busy === `decide:${applicant.id}`}
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

function RosterList({
  confirmed,
  organizerId,
  isOrganizer,
  runId,
  busy,
  onKick,
}: {
  confirmed: ConfirmedPlayer[];
  organizerId: string;
  isOrganizer: boolean;
  runId: string;
  busy: string | null;
  onKick: (event: React.SubmitEvent<HTMLFormElement>, player: ConfirmedPlayer) => Promise<void>;
}) {
  if (confirmed.length === 0) {
    return <p className="text-sm text-blue-100/60">No confirmed players yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {confirmed.map((participant) => (
        <li
          key={participant.id}
          className={cn("flex flex-col gap-2 text-sm text-white sm:flex-row sm:items-center sm:justify-between")}
        >
          <span>
            <NicknameLink userId={participant.userId} nickname={participant.nickname} />
            {organizerId === participant.userId && <span className="ml-2 text-xs text-blue-100/50">(organizer)</span>}
          </span>
          {isOrganizer && participant.userId !== organizerId && (
            <form
              method="POST"
              action={`/api/runs/${runId}/participants/${participant.id}/kick`}
              onSubmit={(event) => {
                event.preventDefault();
                void onKick(event, participant);
              }}
            >
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={busy === `kick:${participant.id}`}
                className="rounded-lg border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                <UserMinus className="size-4" />
                Kick
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
