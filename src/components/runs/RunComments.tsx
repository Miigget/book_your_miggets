import React, { useState } from "react";
import { Heart, MessageSquare, Trash2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { NicknameLink } from "@/components/NicknameLink";
import { Button } from "@/components/ui/button";
import { fetchFormJson } from "@/lib/fetch-form-json";
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
  const [items, setItems] = useState(comments);
  const [error, setError] = useState(commentError ?? null);
  const [posting, setPosting] = useState(false);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function onPost(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setPosting(true);
    setError(null);
    try {
      const { response, data } = await fetchFormJson(form);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      const comment = data.comment;
      if (!response.ok || !comment) {
        setError(data.error ?? "Could not post comment");
        return;
      }
      setItems((prev) => [...prev, comment]);
      form.reset();
    } catch {
      setError("Could not post comment");
    } finally {
      setPosting(false);
    }
  }

  async function onLike(e: React.SubmitEvent<HTMLFormElement>, comment: RunComment) {
    e.preventDefault();
    if (likingId) return;
    const nextLiked = !comment.likedByMe;
    setLikingId(comment.id);
    setError(null);
    try {
      const { response, data } = await fetchFormJson(e.currentTarget);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      if (!response.ok) {
        setError(data.error ?? "Could not update like");
        return;
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id !== comment.id
            ? item
            : {
                ...item,
                likedByMe: nextLiked,
                likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)),
              },
        ),
      );
    } catch {
      setError("Could not update like");
    } finally {
      setLikingId(null);
    }
  }

  async function onDelete(e: React.SubmitEvent<HTMLFormElement>, commentId: string) {
    e.preventDefault();
    const ok = window.confirm("Delete this comment permanently? Likes on it will be removed.");
    if (!ok) return;
    setDeletingId(commentId);
    setError(null);
    try {
      const { response, data } = await fetchFormJson(e.currentTarget);
      if (response.status === 401 && data.signIn) {
        window.location.assign(data.signIn);
        return;
      }
      if (!response.ok) {
        setError(data.error ?? "Could not delete this comment");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== commentId));
    } catch {
      setError("Could not delete this comment");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <ServerError message={error} />

      {items.length === 0 ? (
        <p className="text-sm text-blue-100/60">No comments yet.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((comment) => (
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
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onDelete(event, comment.id);
                    }}
                  >
                    <Button
                      type="submit"
                      variant="destructive"
                      size="sm"
                      className="rounded-lg"
                      disabled={deletingId === comment.id}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </form>
                )}
              </div>

              <p className={cn("mt-3 text-sm whitespace-pre-wrap text-white")}>{comment.body}</p>

              <div className="mt-3">
                {canPostOrLike ? (
                  <form
                    method="POST"
                    action={`/api/runs/${runId}/comments/${comment.id}/like`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onLike(event, comment);
                    }}
                  >
                    <input type="hidden" name="value" value={comment.likedByMe ? "false" : "true"} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      disabled={likingId === comment.id}
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
        <form
          method="POST"
          action={`/api/runs/${runId}/comments`}
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onPost(event);
          }}
        >
          <label htmlFor="comment-body" className="mb-1 block text-sm text-blue-100/80">
            Add a comment
          </label>
          <textarea
            id="comment-body"
            name="body"
            rows={3}
            maxLength={1000}
            placeholder="Share a note with the team"
            disabled={posting}
            className={cn(
              "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:ring-2 focus:ring-purple-400 focus:outline-none",
            )}
          />
          <SubmitButton pendingText="Posting..." icon={<MessageSquare className="size-4" />} busy={posting}>
            Post comment
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
