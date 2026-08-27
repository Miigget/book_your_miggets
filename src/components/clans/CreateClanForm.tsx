import { useState } from "react";
import { Flag, ImagePlus, Tag, Users } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { CLAN_NAME_MAX_LENGTH, CLAN_TAG_MAX_LENGTH } from "@/lib/services/clans";
import { PICTURE_REJECT_MESSAGE, PUBLIC_IMAGE_MAX_BYTES, PUBLIC_IMAGE_MIME_TYPES } from "@/lib/storage";
import { cn } from "@/lib/utils";

interface Props {
  serverError?: string | null;
}

export default function CreateClanForm({ serverError }: Props) {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [errors, setErrors] = useState<{ name?: string; tag?: string; picture?: string }>({});

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    const next: typeof errors = {};

    if (!name.trim()) {
      next.name = "Clan name is required";
    } else if (name.trim().length > CLAN_NAME_MAX_LENGTH) {
      next.name = `Clan name must be ${CLAN_NAME_MAX_LENGTH} characters or fewer`;
    }

    if (!tag.trim()) {
      next.tag = "Clan tag is required";
    } else if (tag.trim().length > CLAN_TAG_MAX_LENGTH) {
      next.tag = `Clan tag must be ${CLAN_TAG_MAX_LENGTH} characters or fewer`;
    }

    const pictureInput = event.currentTarget.elements.namedItem("picture");
    if (pictureInput instanceof HTMLInputElement) {
      const file = pictureInput.files?.[0];
      if (file && (file.size > PUBLIC_IMAGE_MAX_BYTES || !PUBLIC_IMAGE_MIME_TYPES.has(file.type))) {
        next.picture = PICTURE_REJECT_MESSAGE;
      }
    }

    if (Object.keys(next).length > 0) {
      event.preventDefault();
      setErrors(next);
    }
  }

  return (
    <form
      method="POST"
      action="/api/clans"
      encType="multipart/form-data"
      className="space-y-5"
      onSubmit={handleSubmit}
      noValidate
    >
      <FormField
        id="name"
        name="name"
        label="Name"
        value={name}
        onChange={(value) => {
          setName(value);
          if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
        }}
        placeholder="Clan name"
        error={errors.name}
        maxLength={CLAN_NAME_MAX_LENGTH}
        icon={<Users className="size-4" />}
      />

      <FormField
        id="tag"
        name="tag"
        label="Tag"
        value={tag}
        onChange={(value) => {
          setTag(value);
          if (errors.tag) setErrors((prev) => ({ ...prev, tag: undefined }));
        }}
        placeholder="TAG"
        error={errors.tag}
        maxLength={CLAN_TAG_MAX_LENGTH}
        icon={<Tag className="size-4" />}
        hint={<p className="mt-1 text-xs text-blue-100/40">Up to 16 characters. Must be unique.</p>}
      />

      <div>
        <label htmlFor="picture" className="mb-1 block text-sm text-blue-100/80">
          Picture <span className="font-normal text-blue-100/40">(optional)</span>
        </label>
        <div className="relative">
          <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
            <ImagePlus className="size-4" />
          </span>
          <input
            id="picture"
            name="picture"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className={cn(
              "w-full rounded-lg border bg-white/10 py-2 pr-3 pl-10 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-sm file:text-white focus:ring-2 focus:outline-none",
              errors.picture ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
            )}
            onChange={() => {
              if (errors.picture) setErrors((prev) => ({ ...prev, picture: undefined }));
            }}
          />
        </div>
        {errors.picture ? (
          <p className="mt-1 text-xs text-red-300">{errors.picture}</p>
        ) : (
          <p className="mt-1 text-xs text-blue-100/40">JPEG, PNG, or WebP. Max 1 MB.</p>
        )}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Creating…" icon={<Flag className="size-4" />}>
        Create clan
      </SubmitButton>
    </form>
  );
}
