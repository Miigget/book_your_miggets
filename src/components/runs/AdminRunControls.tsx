import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  runId: string;
}

export default function AdminRunControls({ runId }: Props) {
  function confirmDelete(e: React.SubmitEvent<HTMLFormElement>) {
    const ok = window.confirm("Delete this run permanently? Confirmed participants will be removed.");
    if (!ok) e.preventDefault();
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold tracking-wide text-white/80 uppercase">Admin</h3>
      <form method="POST" action={`/api/admin/runs/${runId}/delete`} onSubmit={confirmDelete}>
        <Button type="submit" variant="destructive" size="sm" className="rounded-lg">
          <Trash2 className="size-4" />
          Delete run
        </Button>
      </form>
    </div>
  );
}
