import { useState } from "react";
import { UserPlus } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { CLAN_INVITE_PICK_AT_LEAST_ONE, type ClanInvitee } from "@/lib/services/clans";
import { cn } from "@/lib/utils";

interface Props {
  clanId: string;
  friends: ClanInvitee[];
}

export default function InviteFriendsForm({ clanId, friends }: Props) {
  const [selectedInviteeIds, setSelectedInviteeIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    if (selectedInviteeIds.size < 1) {
      event.preventDefault();
      setError(CLAN_INVITE_PICK_AT_LEAST_ONE);
    }
  }

  return (
    <form
      method="POST"
      action={`/api/clans/${clanId}/invites`}
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate
    >
      <fieldset>
        <legend className="mb-1 block text-sm text-blue-100/80">Friends</legend>
        {friends.length === 0 ? (
          <p className="text-sm text-blue-100/50">
            None of your friends can be invited right now. They may already be in a clan or already invited.
          </p>
        ) : (
          <ul className="space-y-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            {friends.map((friend) => {
              const checked = selectedInviteeIds.has(friend.id);
              return (
                <li key={friend.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-white">
                    <input
                      type="checkbox"
                      name="invitee_ids"
                      value={friend.id}
                      checked={checked}
                      onChange={(event) => {
                        setSelectedInviteeIds((prev) => {
                          const next = new Set(prev);
                          if (event.target.checked) next.add(friend.id);
                          else next.delete(friend.id);
                          return next;
                        });
                        if (error) setError(undefined);
                      }}
                      className={cn("size-4 rounded border-white/30 bg-white/10 text-purple-400 focus:ring-purple-400")}
                    />
                    <span>{friend.nickname ?? "Unknown player"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
      </fieldset>

      {friends.length > 0 && (
        <SubmitButton pendingText="Sending…" icon={<UserPlus className="size-4" />}>
          Send invites
        </SubmitButton>
      )}
    </form>
  );
}
