import React from "react";
import { Heart, MessageSquare, Trash2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { NicknameLink } from "@/components/NicknameLink";
import { Button } from "@/components/ui/button";
import { formatStart } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { RunComment } from "@/lib/services/comments";

interface Props {
  runId: string;
  comments: RunComment[];
  canPostOrLike: boolean;
  isAdmin: boolean;
  commentError?: string | null;
}

export default function RunComments({ runId, comments, canPostOrLike, isAdmin, commentError }: Props) {
  function confirmDelete(e: React.SubmitEvent<HTMLFormElement>) {
    const ok = window.confirm("Delete this comment permanently? Likes on it will be removed.");
    if (!ok) e.preventDefault();
  }

  return (
    <div className="space-y-5">
      <ServerError message={commentError} />

      {comments.length === 0 ? (
        <p className="text-sm text-blue-100/60">No comments yet.</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    <NicknameLink userId={comment.authorId} nickname={comment.nickname} />
                  </p>
                  <p className="mt-0.5 text-xs text-blue-100/50">
                    <time dateTime={comment.createdAt}>{formatStart(comment.createdAt)}</time>
                  </p>
                </div>
                {isAdmin && (
                  <form
                    method="POST"
                    action={`/api/admin/runs/${runId}/comments/${comment.id}/delete`}
                    onSubmit={confirmDelete}
                  >
                    <Button type="submit" variant="destructive" size="sm" className="rounded-lg">
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </form>
                )}
              </div>

              <p className={cn("mt-3 text-sm whitespace-pre-wrap text-white")}>{comment.body}</p>

              <div className="mt-3">
                {canPostOrLike ? (
                  <form method="POST" action={`/api/runs/${runId}/comments/${comment.id}/like`}>
                    <input type="hidden" name="value" value={comment.likedByMe ? "false" : "true"} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      className={cn("rounded-lg text-white hover:bg-white/10", comment.likedByMe && "text-pink-300")}
                      aria-pressed={comment.likedByMe}
                      aria-label={comment.likedByMe ? "Unlike comment" : "Like comment"}
                    >
                      <Heart className={cn("size-4", comment.likedByMe && "fill-current")} />
                      <span>{comment.likeCount}</span>
                    </Button>
                  </form>
                ) : (
                  <p
                    className="flex items-center gap-1.5 text-sm text-blue-100/60"
                    aria-label={`${comment.likeCount} likes`}
                  >
                    <Heart className="size-4" />
                    <span>{comment.likeCount}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canPostOrLike && (
        <form method="POST" action={`/api/runs/${runId}/comments`} className="space-y-3">
          <label htmlFor="comment-body" className="mb-1 block text-sm text-blue-100/80">
            Add a comment
          </label>
          <textarea
            id="comment-body"
            name="body"
            rows={3}
            maxLength={1000}
            placeholder="Share a note with the team"
            className={cn(
              "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:ring-2 focus:ring-purple-400 focus:outline-none",
            )}
          />
          <SubmitButton pendingText="Posting..." icon={<MessageSquare className="size-4" />}>
            Post comment
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
