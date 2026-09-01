import React, { useState } from "react";
import { Archive, CheckCircle2, Clock } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { fetchFormJson } from "@/lib/fetch-form-json";
import { formatStart } from "@/lib/format-date";
import type { ActiveRunLifecyclePhase } from "@/lib/run-lifecycle";
import { cn } from "@/lib/utils";

const EXTEND_HOURS = [1, 2, 3, 6] as const;

interface Props {
  runId: string;
  lifecyclePhase: ActiveRunLifecyclePhase;
  extendedUntil: string | null;
  timeZone?: string;
  showComplete?: boolean;
  completedAt?: string | null;
}

export default function OrganizerRunLifecycleControls({
  runId,
  lifecyclePhase,
  extendedUntil,
  timeZone,
  showComplete = false,
  completedAt = null,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canExtend = lifecyclePhase === "in_progress" && extendedUntil == null && completedAt == null;
  const scheduledLeave = extendedUntil != null;

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
