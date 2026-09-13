import React, { useState } from "react";
import { Archive, ArrowRightLeft, CheckCircle2, Clock, Trash2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { fetchFormJson } from "@/lib/fetch-form-json";
import { formatStart } from "@/lib/format-date";
import type { ActiveRunLifecyclePhase } from "@/lib/run-lifecycle";
import { cn } from "@/lib/utils";
import type { Enums } from "@/types/database";

const EXTEND_HOURS = [1, 2, 3, 6] as const;

export interface TransferCandidate {
  userId: string;
  nickname: string | null;
}

interface Props {
  runId: string;
  lifecyclePhase: ActiveRunLifecyclePhase;
  extendedUntil: string | null;
  timeZone?: string;
  showComplete?: boolean;
  completedAt?: string | null;
  visibility?: Enums<"run_visibility">;
  transferCandidates?: TransferCandidate[];
}

export default function OrganizerRunLifecycleControls({
  runId,
  lifecyclePhase,
  extendedUntil,
  timeZone,
  showComplete = false,
  completedAt = null,
  visibility = "public",
  transferCandidates = [],
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canExtend = lifecyclePhase === "in_progress" && extendedUntil == null && completedAt == null;
  const scheduledLeave = extendedUntil != null;
  const showTransfer = visibility !== "clan_only" && transferCandidates.length > 0;

  async function postLifecycle(form: HTMLFormElement, fallback: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { response, data } = await fetchFormJson(form);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      if (!response.ok) {
        setError(data.error ?? fallback);
        return;
      }
      window.location.assign(data.redirect ?? `/runs/${runId}`);
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  async function onComplete(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm(
      "This marks the clan run completed for later admin verify. It does not archive and does not award clan points. Complete this run?",
    );
    if (!ok) return;
    await postLifecycle(e.currentTarget, "Could not complete this clan run");
  }

  async function onArchive(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm(
      "This run will leave the active list and can be reopened from Dashboard → Past. Archive this run?",
    );
    if (!ok) return;
    await postLifecycle(e.currentTarget, "Could not archive this run");
  }

  async function onDelete(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm("Delete this run permanently? Confirmed participants will be removed.");
    if (!ok) return;
    await postLifecycle(e.currentTarget, "Could not delete this run");
  }

  async function onTransfer(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm("You will lose organizer tools on this run. Transfer ownership?");
    if (!ok) return;
    await postLifecycle(e.currentTarget, "Could not transfer this run");
  }

  async function onExtend(e: React.SubmitEvent<HTMLFormElement>, hours: number) {
    e.preventDefault();
    const label = hours === 1 ? "1 hour" : `${hours} hours`;
    const ok = window.confirm(`This run will leave the active list in ${label}. Continue?`);
    if (!ok) return;
    await postLifecycle(e.currentTarget, "Could not extend this run");
  }

  return (
    <div className={cn("flex flex-col gap-3")}>
      <ServerError message={error} />
      <div className={cn("flex flex-wrap items-center gap-2")}>
        {showComplete ? (
          <form
            method="POST"
            action={`/api/runs/${runId}/complete`}
            onSubmit={(event) => {
              event.preventDefault();
              void onComplete(event);
            }}
          >
            <Button type="submit" size="sm" className={cn("rounded-lg")} disabled={busy}>
              <CheckCircle2 className="size-4" />
              Complete
            </Button>
          </form>
        ) : null}
        <form
          method="POST"
          action={`/api/runs/${runId}/archive`}
          onSubmit={(event) => {
            event.preventDefault();
            void onArchive(event);
          }}
        >
          <Button type="submit" variant="outline" size="sm" className={cn("rounded-lg")} disabled={busy}>
            <Archive className="size-4" />
            Archive
          </Button>
        </form>
        <form
          method="POST"
          action={`/api/runs/${runId}/delete`}
          onSubmit={(event) => {
            event.preventDefault();
            void onDelete(event);
          }}
        >
          <Button type="submit" variant="destructive" size="sm" className={cn("rounded-lg")} disabled={busy}>
            <Trash2 className="size-4" />
            Delete run
          </Button>
        </form>
        {showTransfer ? (
          <form
            method="POST"
            action={`/api/runs/${runId}/transfer`}
            className={cn("flex flex-wrap items-center gap-2")}
            onSubmit={(event) => {
              event.preventDefault();
              void onTransfer(event);
            }}
          >
            <NativeSelect
              id="new_organizer_id"
              name="new_organizer_id"
              required
              disabled={busy}
              aria-label="New organizer"
              className={cn(
                "h-8 rounded-lg border border-white/20 bg-white/10 px-2 text-sm text-white focus:ring-2 focus:ring-purple-400 focus:outline-none",
              )}
              wrapperClassName="w-auto shrink-0"
            >
              <option value="" className="bg-slate-900">
                Choose a player…
              </option>
              {transferCandidates.map((candidate) => (
                <option key={candidate.userId} value={candidate.userId} className="bg-slate-900">
                  {candidate.nickname ?? "Unknown player"}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="outline" size="sm" className={cn("rounded-lg")} disabled={busy}>
              <ArrowRightLeft className="size-4" />
              Transfer
            </Button>
          </form>
        ) : null}
        {canExtend
          ? EXTEND_HOURS.map((hours) => (
              <form
                key={hours}
                method="POST"
                action={`/api/runs/${runId}/extend`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void onExtend(event, hours);
                }}
              >
                <input type="hidden" name="hours" value={hours} />
                <Button type="submit" variant="outline" size="sm" className={cn("rounded-lg")} disabled={busy}>
                  <Clock className="size-4" />
                  {hours === 1 ? "1 hour" : `${hours} hours`}
                </Button>
              </form>
            ))
          : null}
      </div>
      {scheduledLeave && extendedUntil ? (
        <p className="text-sm text-blue-100/70">
          This run will leave the active list at {formatStart(extendedUntil, timeZone)}.
        </p>
      ) : null}
    </div>
  );
}
