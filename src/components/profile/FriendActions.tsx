import React, { useState } from "react";
import { Check, UserMinus, UserPlus } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { fetchFormJson, reloadKeepingScroll } from "@/lib/fetch-form-json";
import type { FriendRelationshipStatus } from "@/lib/services/friends";
import { cn } from "@/lib/utils";

interface Props {
  targetUserId: string;
  relationship: FriendRelationshipStatus;
  requestId: string | null;
}

const GENERIC = "Could not update friend request";

export default function FriendActions({ targetUserId, relationship, requestId }: Props) {
  const redirectTo = `/players/${targetUserId}`;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const { response, data } = await fetchFormJson(form);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      if (!response.ok || !data.ok) {
        setError(data.error ?? GENERIC);
        return;
      }
      reloadKeepingScroll();
    } catch {
      setError(GENERIC);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("mt-3 space-y-2")}>
      <ServerError message={error} />

      {relationship === "none" && (
        <form
          method="POST"
          action="/api/friends/request"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(event);
          }}
        >
          <input type="hidden" name="user_id" value={targetUserId} />
          <input type="hidden" name="redirect" value={redirectTo} />
          <Button
            type="submit"
            disabled={busy}
            className={cn(
              "rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500",
            )}
          >
            <UserPlus className="size-4" />
            {busy ? "Sending..." : "Add friend"}
          </Button>
        </form>
      )}

      {relationship === "outgoing_pending" && (
        <Button type="button" disabled className={cn("rounded-lg bg-white/10 px-4 py-2 font-medium text-white/60")}>
          Request sent
        </Button>
      )}

      {relationship === "incoming_pending" && requestId && (
        <form
          method="POST"
          action="/api/friends/accept"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(event);
          }}
        >
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="redirect" value={redirectTo} />
          <Button
            type="submit"
            disabled={busy}
            className={cn(
              "rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition-colors hover:bg-emerald-500",
            )}
          >
            <Check className="size-4" />
            {busy ? "Accepting..." : "Accept request"}
          </Button>
        </form>
      )}

      {relationship === "accepted" && (
        <form
          method="POST"
          action="/api/friends/unfriend"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(event);
          }}
        >
          <input type="hidden" name="user_id" value={targetUserId} />
          <input type="hidden" name="redirect" value={redirectTo} />
          <Button
            type="submit"
            variant="outline"
            disabled={busy}
            className={cn(
              "rounded-lg border-white/20 bg-transparent px-4 py-2 font-medium text-white hover:bg-white/10",
            )}
          >
            <UserMinus className="size-4" />
            {busy ? "Removing..." : "Remove friend"}
          </Button>
        </form>
      )}
    </div>
  );
}
