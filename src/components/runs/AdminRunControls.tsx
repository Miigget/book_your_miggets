import React, { useState } from "react";
import { Archive, BadgeCheck, Trash2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { fetchFormJson } from "@/lib/fetch-form-json";
import { cn } from "@/lib/utils";

interface Props {
  runId: string;
  showArchive?: boolean;
  showVerifyFinish?: boolean;
}

export default function AdminRunControls({ runId, showArchive = false, showVerifyFinish = false }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function postAdmin(form: HTMLFormElement, fallback: string, fallbackRedirect: string): Promise<void> {
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
      window.location.assign(data.redirect ?? fallbackRedirect);
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyFinish(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm(
      "Confirm you checked in-game /teamrank that declared participants finished. This awards clan points from the map and cannot be undone. Mark verified-finish?",
    );
    if (!ok) return;
    await postAdmin(e.currentTarget, "Could not verify this clan run", `/runs/${runId}`);
  }

  async function onArchive(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm("This run will leave the active list. Archive this run?");
    if (!ok) return;
    await postAdmin(e.currentTarget, "Could not archive this run", `/runs/${runId}`);
  }

  async function onDelete(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm("Delete this run permanently? Confirmed participants will be removed.");
    if (!ok) return;
    await postAdmin(e.currentTarget, "Could not delete this run", "/runs");
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold tracking-wide text-white/80 uppercase">Admin</h3>
      <ServerError message={error} />
      {showVerifyFinish ? (
        <form
          method="POST"
          action={`/api/admin/runs/${runId}/verify-finish`}
          onSubmit={(event) => {
            event.preventDefault();
            void onVerifyFinish(event);
          }}
        >
          <Button type="submit" variant="outline" size="sm" className={cn("rounded-lg")} disabled={busy}>
            <BadgeCheck className="size-4" />
            Mark verified-finish
          </Button>
        </form>
      ) : null}
      {showArchive ? (
        <form
          method="POST"
          action={`/api/admin/runs/${runId}/archive`}
          onSubmit={(event) => {
            event.preventDefault();
            void onArchive(event);
          }}
        >
          <Button type="submit" variant="outline" size="sm" className={cn("rounded-lg")} disabled={busy}>
            <Archive className="size-4" />
            Archive run
          </Button>
        </form>
      ) : null}
      <form
        method="POST"
        action={`/api/admin/runs/${runId}/delete`}
        onSubmit={(event) => {
          event.preventDefault();
          void onDelete(event);
        }}
      >
        <Button type="submit" variant="destructive" size="sm" className="rounded-lg" disabled={busy}>
          <Trash2 className="size-4" />
          Delete run
        </Button>
      </form>
    </div>
  );
}
