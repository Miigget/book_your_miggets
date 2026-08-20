import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { fetchFormJson } from "@/lib/fetch-form-json";

interface Props {
  runId: string;
}

export default function AdminRunControls({ runId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDelete(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm("Delete this run permanently? Confirmed participants will be removed.");
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const { response, data } = await fetchFormJson(e.currentTarget);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      if (!response.ok) {
        setError(data.error ?? "Could not delete this run");
        return;
      }
      window.location.assign(data.redirect ?? "/runs");
    } catch {
      setError("Could not delete this run");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold tracking-wide text-white/80 uppercase">Admin</h3>
      <ServerError message={error} />
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
