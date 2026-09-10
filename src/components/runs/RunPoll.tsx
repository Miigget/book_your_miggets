import React, { useState } from "react";
import { Lock, Vote } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { MapPicker } from "@/components/runs/MapPicker";
import { Button } from "@/components/ui/button";
import { fetchFormJson } from "@/lib/fetch-form-json";
import { RUN_MAPS_MAX } from "@/lib/run-maps";
import type { RunMapPoll } from "@/lib/services/polls";
import type { MapPickerItem } from "@/lib/services/runs";
import { cn } from "@/lib/utils";

interface Props {
  runId: string;
  poll: RunMapPoll | null;
  maps: MapPickerItem[];
  canCreate: boolean;
  canClose: boolean;
  canVote: boolean;
  pollError?: string | null;
}

export default function RunPoll({ runId, poll: initialPoll, maps, canCreate, canClose, canVote, pollError }: Props) {
  const [poll, setPoll] = useState(initialPoll);
  const [error, setError] = useState(pollError ?? null);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [votingMapId, setVotingMapId] = useState<string | null>(null);

  if (!poll && !canCreate) return null;

  async function postAndRedirect(form: HTMLFormElement, fallback: string): Promise<void> {
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

  async function onCreate(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm("Create a map poll with these maps? Votes stay hidden until you close it.");
    if (!ok) return;
    await postAndRedirect(e.currentTarget, "Could not create this map poll");
  }

  async function onClose(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = window.confirm("Close this poll and lock the winning map? You cannot reopen it.");
    if (!ok) return;
    await postAndRedirect(e.currentTarget, "Could not close this poll");
  }

  async function onVote(e: React.SubmitEvent<HTMLFormElement>, mapId: string) {
    e.preventDefault();
    if (votingMapId) return;
    setVotingMapId(mapId);
    setError(null);
    try {
      const { response, data } = await fetchFormJson(e.currentTarget);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      if (!response.ok) {
        setError(data.error ?? "Could not submit your vote");
        return;
      }
      if (data.poll) {
        setPoll(data.poll);
      } else {
        window.location.reload();
      }
    } catch {
      setError("Could not submit your vote");
    } finally {
      setVotingMapId(null);
    }
  }

  return (
    <div className="space-y-4">
      <ServerError message={error} />

      {poll && !poll.closed ? (
        <>
          <ul className="space-y-2">
            {poll.options.map((option) => {
              const selected = poll.ownMapId === option.mapId;
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="font-medium text-white">{option.name}</span>
                    <span className="mt-0.5 block text-xs text-blue-100/50">
                      {option.difficulty} · {option.points} pts
                    </span>
                  </span>
                  {selected ? <span className="shrink-0 text-xs text-purple-200">Your vote</span> : null}
                </>
              );
              return (
                <li key={option.mapId}>
                  {canVote ? (
                    <form
                      method="POST"
                      action={`/api/runs/${runId}/poll/vote`}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void onVote(event, option.mapId);
                      }}
                    >
                      <input type="hidden" name="map_id" value={option.mapId} />
                      <button
                        type="submit"
                        disabled={votingMapId != null}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          selected
                            ? "border-purple-400/50 bg-purple-500/15"
                            : "border-white/10 bg-white/5 hover:bg-white/10",
                          votingMapId != null && "opacity-60",
                        )}
                      >
                        {body}
                      </button>
                    </form>
                  ) : (
                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
                        selected ? "border-purple-400/50 bg-purple-500/15" : "border-white/10 bg-white/5",
                      )}
                    >
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {canVote ? (
            <p className="text-xs text-blue-100/50">
              You can change your vote until the poll closes. Counts stay hidden.
            </p>
          ) : null}
          {canClose ? (
            <form
              method="POST"
              action={`/api/runs/${runId}/poll/close`}
              onSubmit={(event) => {
                event.preventDefault();
                void onClose(event);
              }}
            >
              <Button type="submit" variant="outline" size="sm" className={cn("rounded-lg")} disabled={busy}>
                <Lock className="size-4" />
                Close poll
              </Button>
            </form>
          ) : null}
        </>
      ) : null}

      {poll?.closed ? (
        <ul className="space-y-2">
          {poll.options.map((option) => {
            const winner = poll.winnerMapId === option.mapId;
            const votesLabel = option.count === 1 ? "1 vote" : `${option.count} votes`;
            return (
              <li
                key={option.mapId}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
                  winner ? "border-purple-400/50 bg-purple-500/15" : "border-white/10 bg-white/5",
                )}
              >
                <span className="min-w-0">
                  <span className="font-medium text-white">{option.name}</span>
                  <span className="mt-0.5 block text-xs text-blue-100/50">
                    {option.difficulty} · {option.points} pts
                  </span>
                </span>
                <span className="shrink-0 text-xs text-blue-100/70">
                  {votesLabel}
                  {winner ? <span className="ml-2 text-purple-200">Winner</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {canCreate && !poll ? (
        <form
          method="POST"
          action={`/api/runs/${runId}/poll`}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onCreate(event);
          }}
        >
          <MapPicker
            maps={maps}
            selectedIds={selectedIds}
            includeCategoryField={false}
            label="Poll maps"
            emptyHint="Pick 2 to 8 catalog maps. They do not have to be on the session list."
            capMessage={`Pick at most ${RUN_MAPS_MAX} maps`}
            onChange={setSelectedIds}
          />
          <SubmitButton pendingText="Creating..." icon={<Vote className="size-4" />} busy={busy}>
            Create poll
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
