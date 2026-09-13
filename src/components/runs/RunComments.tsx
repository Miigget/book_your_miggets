import React, { useRef, useState } from "react";
import { Heart, ImagePlus, MessageSquare, Trash2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { NicknameLink } from "@/components/NicknameLink";
import { Button } from "@/components/ui/button";
import { fetchFormJson } from "@/lib/fetch-form-json";
import { formatStart } from "@/lib/format-date";
import type { RunComment } from "@/lib/services/comments";
import { COMMENT_SCREENSHOT_MAX_BYTES, PUBLIC_IMAGE_MIME_TYPES, SCREENSHOT_REJECT_MESSAGE } from "@/lib/storage";
import { cn } from "@/lib/utils";

interface Props {
  runId: string;
  comments: RunComment[];
  canPostOrLike: boolean;
  isAdmin: boolean;
  commentError?: string | null;
  timeZone?: string;
}

export default function RunComments({ runId, comments, canPostOrLike, isAdmin, commentError, timeZone }: Props) {
  const [items, setItems] = useState(comments);
  const [error, setError] = useState(commentError ?? null);
  const [posting, setPosting] = useState(false);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  function attachScreenshot(file: File) {
    const input = screenshotInputRef.current;
    if (!input) return;
    if (file.size > COMMENT_SCREENSHOT_MAX_BYTES || !PUBLIC_IMAGE_MIME_TYPES.has(file.type)) {
      setError(SCREENSHOT_REJECT_MESSAGE);
      input.value = "";
      setScreenshotName(null);
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    setScreenshotName(file.name.trim() || "screenshot");
    if (error === SCREENSHOT_REJECT_MESSAGE) setError(null);
  }

  function onPaste(event: React.ClipboardEvent<HTMLFormElement>) {
    const data = event.clipboardData;
    const fromFiles = Array.from(data.files).find((file) => PUBLIC_IMAGE_MIME_TYPES.has(file.type));
    const fromItems = Array.from(data.items)
      .filter((item) => item.kind === "file" && PUBLIC_IMAGE_MIME_TYPES.has(item.type))
      .map((item) => item.getAsFile())
      .find((file): file is File => file != null);
    const image = fromFiles ?? fromItems;
    if (!image) return;
    if (!data.getData("text/plain")) {
      event.preventDefault();
    }
    attachScreenshot(image);
  }

  async function onPost(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const screenshotInput = form.elements.namedItem("screenshot");
    if (screenshotInput instanceof HTMLInputElement) {
      const file = screenshotInput.files?.[0];
      if (file && (file.size > COMMENT_SCREENSHOT_MAX_BYTES || !PUBLIC_IMAGE_MIME_TYPES.has(file.type))) {
        setError(SCREENSHOT_REJECT_MESSAGE);
        return;
      }
    }
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
      setScreenshotName(null);
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
            <li key={comment.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/5 px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    <NicknameLink userId={comment.authorId} nickname={comment.nickname} />
                  </p>
                  <p className="mt-0.5 text-xs text-blue-100/50">
                    <time dateTime={comment.createdAt}>{formatStart(comment.createdAt, timeZone)}</time>
                  </p>
                </div>
                <div className="flex shrink-0 items-start gap-1">
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
                      className="flex items-center gap-1.5 px-2 py-1 text-sm text-blue-100/60"
                      aria-label={`${comment.likeCount} likes`}
                    >
                      <Heart className="size-4" />
                      <span>{comment.likeCount}</span>
                    </p>
                  )}
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
              </div>

              {comment.body ? (
                <p className={cn("mt-3 min-w-0 text-sm break-all whitespace-pre-wrap text-white")}>{comment.body}</p>
              ) : null}
              {comment.screenshotUrl ? (
                <img src={comment.screenshotUrl} alt="Comment screenshot" className={cn("mt-3 max-w-full")} />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canPostOrLike && (
        <form
          method="POST"
          action={`/api/runs/${runId}/comments`}
          encType="multipart/form-data"
          className="space-y-3"
          onPaste={onPaste}
          onSubmit={(event) => {
            event.preventDefault();
            void onPost(event);
          }}
        >
          <label htmlFor="comment-body" className="mb-1 block text-sm text-blue-100/80">
            Add a comment
          </label>
          <div
            className={cn(
              "rounded-lg border bg-white/10 focus-within:ring-2",
              error === SCREENSHOT_REJECT_MESSAGE
                ? "border-red-400/60 focus-within:ring-red-400"
                : "border-white/20 focus-within:ring-purple-400",
            )}
          >
            <div className="relative">
              <textarea
                id="comment-body"
                name="body"
                rows={3}
                maxLength={1000}
                placeholder="Share a note with the team"
                disabled={posting}
                className="w-full resize-y rounded-lg border-0 bg-transparent py-2 pr-11 pl-3 text-sm text-white placeholder-white/40 focus:ring-0 focus:outline-none"
              />
              <input
                ref={screenshotInputRef}
                id="comment-screenshot"
                name="screenshot"
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                disabled={posting}
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) {
                    setScreenshotName(null);
                    return;
                  }
                  if (file.size > COMMENT_SCREENSHOT_MAX_BYTES || !PUBLIC_IMAGE_MIME_TYPES.has(file.type)) {
                    setError(SCREENSHOT_REJECT_MESSAGE);
                    event.currentTarget.value = "";
                    setScreenshotName(null);
                    return;
                  }
                  setScreenshotName(file.name.trim() || "screenshot");
                  if (error === SCREENSHOT_REJECT_MESSAGE) setError(null);
                }}
              />
              <button
                type="button"
                disabled={posting}
                className="absolute right-2 bottom-2 rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Attach screenshot"
                onClick={() => {
                  screenshotInputRef.current?.click();
                }}
              >
                <ImagePlus className="size-4" />
              </button>
            </div>
            {screenshotName ? (
              <div className="border-t border-white/10 px-3 py-1.5">
                <p className="truncate text-xs text-blue-100/50">{screenshotName}</p>
              </div>
            ) : null}
          </div>
          {error === SCREENSHOT_REJECT_MESSAGE ? (
            <p className="text-xs text-red-300">{SCREENSHOT_REJECT_MESSAGE}</p>
          ) : null}
          <SubmitButton pendingText="Posting..." icon={<MessageSquare className="size-4" />} busy={posting}>
            Post comment
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
