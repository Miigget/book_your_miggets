import type { AppSupabaseClient } from "@/lib/services/runs";

export const CLAN_PICTURES_BUCKET = "clan-pictures";

export const PUBLIC_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const PUBLIC_IMAGE_MAX_BYTES = 1_048_576;

export const PICTURE_REJECT_MESSAGE = "Picture must be a JPEG, PNG, or WebP under 1 MB.";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class StorageImageError extends Error {
  constructor(message = PICTURE_REJECT_MESSAGE) {
    super(message);
    this.name = "StorageImageError";
  }
}

export function extensionForImageMime(mime: string): string | null {
  return MIME_TO_EXT[mime] ?? null;
}

export function clanPictureObjectPath(ownerId: string, clanId: string, ext: string): string {
  return `${ownerId.toLowerCase()}/${clanId.toLowerCase()}.${ext}`;
}

export function assertPublicImage(bytes: ArrayBuffer | Uint8Array, mime: string): void {
  const size = bytes.byteLength;
  if (size <= 0 || size > PUBLIC_IMAGE_MAX_BYTES || !PUBLIC_IMAGE_MIME_TYPES.has(mime)) {
    throw new StorageImageError();
  }
}

export function assertPublicImageFile(file: File): { mime: string; ext: string } {
  const mime = file.type.trim().toLowerCase();
  const ext = extensionForImageMime(mime);
  if (!ext || file.size <= 0 || file.size > PUBLIC_IMAGE_MAX_BYTES) {
    throw new StorageImageError();
  }
  return { mime, ext };
}

function isBucketLimitFailure(error: { message?: string; statusCode?: string | number }): boolean {
  const code = String(error.statusCode ?? "");
  if (code === "413" || code === "415") return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("exceeded") ||
    message.includes("too large") ||
    message.includes("file size") ||
    message.includes("mime") ||
    message.includes("not allowed") ||
    message.includes("not supported")
  );
}

export async function uploadPublicImage(
  supabase: AppSupabaseClient,
  options: { bucket: string; path: string; bytes: ArrayBuffer | Uint8Array; mime: string },
): Promise<void> {
  assertPublicImage(options.bytes, options.mime);
  const { error } = await supabase.storage.from(options.bucket).upload(options.path, options.bytes, {
    contentType: options.mime,
    upsert: false,
  });
  if (!error) return;
  console.error("storage upload failed", error);
  if (isBucketLimitFailure(error)) {
    throw new StorageImageError();
  }
  throw new Error("upload_failed");
}

export function publicObjectUrl(supabase: AppSupabaseClient, bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function removeObject(supabase: AppSupabaseClient, bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    console.error("storage remove failed", error);
  }
}
