import { activeWindowStartsAfter } from "@/lib/run-lifecycle";
import { getOwnParticipation } from "@/lib/services/participants";
import type { AppSupabaseClient } from "@/lib/services/runs";
import {
  COMMENT_SCREENSHOT_MAX_BYTES,
  COMMENT_SCREENSHOTS_BUCKET,
  SCREENSHOT_REJECT_MESSAGE,
  StorageImageError,
  assertPublicImageFile,
  commentScreenshotObjectPath,
  createSignedObjectUrl,
  removeObject,
  uploadPublicImage,
} from "@/lib/storage";

const COMMENT_BODY_MAX = 1000;

export class CommentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentError";
  }
}

export interface RunComment {
  id: string;
  runId: string;
  authorId: string;
  nickname: string | null;
  body: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  screenshotUrl: string | null;
}

interface CommentRow {
  id: string;
  run_id: string;
  author_id: string;
  body: string;
  created_at: string;
  screenshot_path: string | null;
  profile: { nickname: string | null } | null;
}

const COMMENT_SELECT = `
  id,
  run_id,
  author_id,
  body,
  created_at,
  screenshot_path,
  profile:public_profiles!run_comments_author_id_fkey (
    nickname
  )
` as const;

function mapNickname(row: CommentRow): string | null {
  const nickname = row.profile?.nickname?.trim();
  if (!nickname) return null;
  return nickname;
}

async function requireConfirmedParticipant(
  supabase: AppSupabaseClient,
  runId: string,
  userId: string,
  message: string,
): Promise<void> {
  const own = await getOwnParticipation(supabase, runId, userId);
  if (own?.status !== "confirmed") {
    throw new CommentError(message);
  }
}

async function requireActiveRun(supabase: AppSupabaseClient, runId: string): Promise<void> {
  const { data, error } = await supabase
    .from("runs")
    .select("id")
    .eq("id", runId)
    .is("archived_at", null)
    .gt("starts_at", activeWindowStartsAfter())
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load run: ${error.message}`);
  }

  if (!data) {
    throw new CommentError("Run not found or no longer active");
  }
}

async function mintScreenshotUrls(supabase: AppSupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) {
    return urls;
  }

  try {
    const { data, error } = await supabase.storage.from(COMMENT_SCREENSHOTS_BUCKET).createSignedUrls(unique, 3600);
    if (error) {
      console.error("storage signed urls failed", error);
    } else {
      for (const item of data) {
        if (item.path && item.signedUrl) {
          urls.set(item.path, item.signedUrl);
        }
      }
      return urls;
    }
  } catch (err) {
    console.error("storage signed urls failed", err);
  }

  await Promise.all(
    unique.map(async (path) => {
      const signed = await createSignedObjectUrl(supabase, COMMENT_SCREENSHOTS_BUCKET, path);
      if (signed) {
        urls.set(path, signed);
      }
    }),
  );
  return urls;
}

export async function listCommentsForRun(
  supabase: AppSupabaseClient,
  runId: string,
  viewerId: string | null,
): Promise<RunComment[]> {
  const { data, error } = await supabase
    .from("run_comments")
    .select(COMMENT_SELECT)
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list comments: ${error.message}`);
  }

  const rows = data as unknown as CommentRow[];
  if (rows.length === 0) {
    return [];
  }

  const { data: likes, error: likesError } = await supabase
    .from("run_comment_likes")
    .select("comment_id, user_id")
    .eq("run_id", runId);

  if (likesError) {
    throw new Error(`Failed to list comment likes: ${likesError.message}`);
  }

  const likeCountByComment = new Map<string, number>();
  const likedByMe = new Set<string>();

  for (const like of likes) {
    likeCountByComment.set(like.comment_id, (likeCountByComment.get(like.comment_id) ?? 0) + 1);
    if (viewerId && like.user_id === viewerId) {
      likedByMe.add(like.comment_id);
    }
  }

  const screenshotPaths = rows.map((row) => row.screenshot_path).filter((path): path is string => Boolean(path));
  const signedByPath = await mintScreenshotUrls(supabase, screenshotPaths);

  return rows.map((row) =>
    mapComment(
      row,
      likeCountByComment.get(row.id) ?? 0,
      likedByMe.has(row.id),
      row.screenshot_path ? (signedByPath.get(row.screenshot_path) ?? null) : null,
    ),
  );
}

function mapComment(row: CommentRow, likeCount: number, likedByMe: boolean, screenshotUrl: string | null): RunComment {
  return {
    id: row.id,
    runId: row.run_id,
    authorId: row.author_id,
    nickname: mapNickname(row),
    body: row.body,
    createdAt: row.created_at,
    likeCount,
    likedByMe,
    screenshotUrl,
  };
}

export async function createComment(
  supabase: AppSupabaseClient,
  runId: string,
  userId: string,
  body: string,
  file?: File | null,
): Promise<RunComment> {
  const trimmed = body.trim();
  const hasFile = Boolean(file && file.size > 0);
  if (!trimmed && !hasFile) {
    throw new CommentError("Comment cannot be empty");
  }
  if (trimmed.length > COMMENT_BODY_MAX) {
    throw new CommentError("Comment must be 1000 characters or fewer");
  }

  await requireConfirmedParticipant(supabase, runId, userId, "Only confirmed participants can post comments");
  await requireActiveRun(supabase, runId);

  let commentId: string | null = null;
  let screenshotPath: string | null = null;

  if (hasFile && file) {
    try {
      const { mime, ext } = assertPublicImageFile(file, COMMENT_SCREENSHOT_MAX_BYTES, SCREENSHOT_REJECT_MESSAGE);
      commentId = crypto.randomUUID().toLowerCase();
      screenshotPath = commentScreenshotObjectPath(userId, runId, commentId, ext);
      const bytes = new Uint8Array(await file.arrayBuffer());
      await uploadPublicImage(supabase, {
        bucket: COMMENT_SCREENSHOTS_BUCKET,
        path: screenshotPath,
        bytes,
        mime,
        maxBytes: COMMENT_SCREENSHOT_MAX_BYTES,
        rejectMessage: SCREENSHOT_REJECT_MESSAGE,
      });
    } catch (err) {
      if (err instanceof StorageImageError) {
        throw new CommentError(SCREENSHOT_REJECT_MESSAGE);
      }
      throw err;
    }
  }

  const { data, error } = await supabase
    .from("run_comments")
    .insert({
      ...(commentId ? { id: commentId } : {}),
      run_id: runId,
      author_id: userId,
      body: trimmed,
      screenshot_path: screenshotPath,
    })
    .select(COMMENT_SELECT)
    .maybeSingle();

  if (error) {
    if (screenshotPath) {
      await removeObject(supabase, COMMENT_SCREENSHOTS_BUCKET, screenshotPath);
    }
    throw new Error(`Failed to post comment: ${error.message}`);
  }

  if (!data) {
    if (screenshotPath) {
      await removeObject(supabase, COMMENT_SCREENSHOTS_BUCKET, screenshotPath);
    }
    throw new CommentError("Could not post comment");
  }

  const screenshotUrl = screenshotPath
    ? await createSignedObjectUrl(supabase, COMMENT_SCREENSHOTS_BUCKET, screenshotPath)
    : null;

  return mapComment(data, 0, false, screenshotUrl);
}

export async function setCommentLiked(
  supabase: AppSupabaseClient,
  runId: string,
  commentId: string,
  userId: string,
  liked: boolean,
): Promise<void> {
  await requireConfirmedParticipant(supabase, runId, userId, "Only confirmed participants can like comments");
  await requireActiveRun(supabase, runId);

  const { data: comment, error: commentError } = await supabase
    .from("run_comments")
    .select("id, run_id")
    .eq("id", commentId)
    .maybeSingle();

  if (commentError) {
    throw new Error(`Failed to load comment: ${commentError.message}`);
  }

  if (comment?.run_id !== runId) {
    throw new CommentError("Comment not found");
  }

  if (liked) {
    const { data, error } = await supabase
      .from("run_comment_likes")
      .insert({
        comment_id: commentId,
        run_id: runId,
        user_id: userId,
      })
      .select("comment_id");

    if (error) {
      if (error.code === "23505") {
        return;
      }
      throw new Error(`Failed to like comment: ${error.message}`);
    }

    if (data.length === 0) {
      throw new CommentError("Could not like this comment");
    }
    return;
  }

  const { error } = await supabase
    .from("run_comment_likes")
    .delete()
    .eq("comment_id", commentId)
    .eq("run_id", runId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to unlike comment: ${error.message}`);
  }
}

export async function deleteCommentAsAdmin(
  supabase: AppSupabaseClient,
  runId: string,
  commentId: string,
): Promise<void> {
  const { data: existing, error: loadError } = await supabase
    .from("run_comments")
    .select("screenshot_path")
    .eq("id", commentId)
    .eq("run_id", runId)
    .maybeSingle();

  if (loadError) {
    console.error("deleteCommentAsAdmin failed", loadError);
    throw new CommentError("Could not delete this comment");
  }

  if (!existing) {
    throw new CommentError("Could not delete this comment");
  }

  const screenshotPath = existing.screenshot_path;

  const { data, error } = await supabase
    .from("run_comments")
    .delete()
    .eq("id", commentId)
    .eq("run_id", runId)
    .select("id");

  if (error) {
    console.error("deleteCommentAsAdmin failed", error);
    throw new CommentError("Could not delete this comment");
  }

  if (data.length === 0) {
    throw new CommentError("Could not delete this comment");
  }

  if (screenshotPath) {
    await removeObject(supabase, COMMENT_SCREENSHOTS_BUCKET, screenshotPath);
  }
}
