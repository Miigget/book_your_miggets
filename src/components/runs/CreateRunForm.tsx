import React, { useMemo, useState } from "react";
import { CalendarClock, Hash, Tag, Users } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { MapPicker } from "@/components/runs/MapPicker";
import { MAP_CATEGORIES } from "@/lib/map-categories";
import { isRunActive } from "@/lib/run-lifecycle";
import { cn } from "@/lib/utils";
import type { MapPickerItem } from "@/lib/services/runs";

const selectClass =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-400";

export type CreateRunFormJoinMode = "approval_required" | "auto_join";

export interface CreateRunFormEditValues {
  runId: string;
  title: string;
  mapId: string;
  mapCategory: string;
  startsAt: string;
  maxParticipants: number;
  minPoints: number;
  joinMode: CreateRunFormJoinMode;
  confirmedCount: number;
  joinModeLocked: boolean;
}

interface Props {
  maps: MapPickerItem[];
  nickname: string | null;
  isVerified: boolean;
  serverError?: string | null;
  edit?: CreateRunFormEditValues;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatLocalDatetimeValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function defaultLocalStartsAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return formatLocalDatetimeValue(d);
}

function startsAtToLocalDatetime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatLocalDatetimeValue(d);
}

export default function CreateRunForm({ maps, nickname: initialNickname, isVerified, serverError, edit }: Props) {
  const isEdit = Boolean(edit);
  const needsNickname = !isEdit && !initialNickname && !isVerified;
  const verifiedNeedsRequest = !isEdit && !initialNickname && isVerified;
  const [nickname, setNickname] = useState("");
  const [title, setTitle] = useState(edit?.title ?? "");
  const [mapId, setMapId] = useState(edit?.mapId ?? "");
  const [category, setCategory] = useState(edit?.mapCategory ?? "");
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    edit ? startsAtToLocalDatetime(edit.startsAt) : defaultLocalStartsAt(),
  );
  const [maxParticipants, setMaxParticipants] = useState(edit ? String(edit.maxParticipants) : "2");
  const [minPoints, setMinPoints] = useState(edit ? String(edit.minPoints) : "0");
  const [joinMode, setJoinMode] = useState<CreateRunFormJoinMode>(edit?.joinMode ?? "approval_required");
  const [errors, setErrors] = useState<{
    nickname?: string;
    map_category?: string;
    starts_at?: string;
    max_participants?: string;
    min_points?: string;
  }>({});

  const startsAtIso = useMemo(() => {
    if (!startsAtLocal) return "";
    const d = new Date(startsAtLocal);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }, [startsAtLocal]);

  function validate() {
    const next: typeof errors = {};

    if (verifiedNeedsRequest) {
      next.nickname = "Request a nickname on your profile before creating a run";
    } else if (needsNickname) {
      if (!nickname.trim()) {
        next.nickname = "Nickname is required";
      } else if (nickname.trim().length > 32) {
        next.nickname = "Nickname must be 32 characters or fewer";
      }
    }

    if (!startsAtLocal) {
      next.starts_at = "Start time is required";
    } else {
      const d = new Date(startsAtLocal);
      if (Number.isNaN(d.getTime())) {
        next.starts_at = "Start time is invalid";
      } else if (isEdit) {
        if (!isRunActive(d, null)) {
          next.starts_at = "Start time must keep the run active";
        }
      } else if (d.getTime() <= Date.now()) {
        next.starts_at = "Start time must be in the future";
      }
    }

    if (!mapId && !category) {
      next.map_category = "Pick a map or a category";
    }

    const capacity = Number.parseInt(maxParticipants, 10);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      next.max_participants = "Must be a whole number greater than 0";
    } else if (edit && capacity !== edit.maxParticipants && capacity < edit.confirmedCount) {
      next.max_participants = "Capacity cannot be below the confirmed roster";
    }

    const points = Number.parseInt(minPoints, 10);
    if (!Number.isFinite(points) || points < 0) {
      next.min_points = "Must be 0 or greater";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form
      method="POST"
      action={edit ? `/api/runs/${edit.runId}` : "/api/runs"}
      className="space-y-5"
      onSubmit={handleSubmit}
      noValidate
    >
      {verifiedNeedsRequest && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-100/90">
            Request a nickname on your{" "}
            <a href="/profile" className="font-medium text-white underline hover:text-purple-100">
              profile
            </a>{" "}
            before creating a run.
          </p>
          {errors.nickname && <p className="mt-2 text-xs text-red-300">{errors.nickname}</p>}
        </div>
      )}

      {needsNickname && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <p className="mb-3 text-sm text-amber-100/90">
            Choose a public nickname. Run titles can fall back to{" "}
            <span className="font-medium text-white">{"{nickname} run"}</span>.
          </p>
          <FormField
            id="nickname"
            label="Nickname"
            value={nickname}
            onChange={(v) => {
              setNickname(v);
              if (errors.nickname) setErrors((prev) => ({ ...prev, nickname: undefined }));
            }}
            placeholder="Your in-game name"
            error={errors.nickname}
            icon={<Tag className="size-4" />}
          />
        </div>
      )}

      {!isEdit && !needsNickname && initialNickname && (
        <p className="text-sm text-blue-100/60">
          Creating as <span className="text-white">{initialNickname}</span>
        </p>
      )}

      <FormField
        id="title"
        label="Custom title (optional)"
        value={title}
        onChange={setTitle}
        placeholder="Leave blank to use map / nickname fallback"
        icon={<Tag className="size-4" />}
      />

      <MapPicker
        maps={maps}
        selectedId={mapId}
        onSelect={(id) => {
          setMapId(id);
          if (id) {
            setCategory("");
          }
          if (errors.map_category) setErrors((prev) => ({ ...prev, map_category: undefined }));
        }}
      />

      <input type="hidden" name="map_category" value={mapId ? "" : category} />

      {!mapId && (
        <div>
          <label htmlFor="run_category" className="mb-1 block text-sm text-blue-100/80">
            Run category
          </label>
          <select
            id="run_category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              if (errors.map_category) setErrors((prev) => ({ ...prev, map_category: undefined }));
            }}
            className={cn(selectClass, errors.map_category ? "border-red-400/60 focus:ring-red-400" : undefined)}
          >
            <option value="" className="bg-slate-900">
              Select a category
            </option>
            {MAP_CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-slate-900">
                {c}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-blue-100/40">Required when no map.</p>
          {errors.map_category && <p className="mt-1 text-xs text-red-300">{errors.map_category}</p>}
        </div>
      )}

      <div>
        <label htmlFor="starts_at_local" className="mb-1 block text-sm text-blue-100/80">
          Starts at
        </label>
        <div className="relative">
          <CalendarClock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
          <input
            id="starts_at_local"
            type="datetime-local"
            value={startsAtLocal}
            onChange={(e) => {
              setStartsAtLocal(e.target.value);
              if (errors.starts_at) setErrors((prev) => ({ ...prev, starts_at: undefined }));
            }}
            className={cn(
              "w-full rounded-lg border bg-white/10 py-2 pr-3 pl-10 text-white transition-colors focus:ring-2 focus:outline-none",
              errors.starts_at ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
            )}
          />
        </div>
        <input type="hidden" name="starts_at" value={startsAtIso} />
        {errors.starts_at && <p className="mt-1 text-xs text-red-300">{errors.starts_at}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          id="max_participants"
          label="Capacity"
          type="number"
          value={maxParticipants}
          onChange={(v) => {
            setMaxParticipants(v);
            if (errors.max_participants) setErrors((prev) => ({ ...prev, max_participants: undefined }));
          }}
          placeholder="2"
          error={errors.max_participants}
          icon={<Users className="size-4" />}
        />
        <FormField
          id="min_points"
          label="Min points"
          type="number"
          value={minPoints}
          onChange={(v) => {
            setMinPoints(v);
            if (errors.min_points) setErrors((prev) => ({ ...prev, min_points: undefined }));
          }}
          placeholder="0"
          error={errors.min_points}
          icon={<Hash className="size-4" />}
          hint={<p className="mt-1 text-xs text-blue-100/40">Organizer-set — not prefilled from the map.</p>}
        />
      </div>

      <div>
        <label htmlFor="join_mode" className="mb-1 block text-sm text-blue-100/80">
          Join mode
        </label>
        <select
          id="join_mode"
          name={edit?.joinModeLocked ? undefined : "join_mode"}
          value={joinMode}
          disabled={Boolean(edit?.joinModeLocked)}
          onChange={(e) => {
            setJoinMode(e.target.value as CreateRunFormJoinMode);
          }}
          className={cn(selectClass, edit?.joinModeLocked && "cursor-not-allowed opacity-60")}
        >
          <option value="approval_required" className="bg-slate-900">
            Approval required
          </option>
          <option value="auto_join" className="bg-slate-900">
            Auto join
          </option>
        </select>
        {edit?.joinModeLocked && (
          <p className="mt-1 text-xs text-blue-100/50">Join mode cannot be changed after someone has applied.</p>
        )}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText={isEdit ? "Saving…" : "Creating…"} icon={<CalendarClock className="size-4" />}>
        {isEdit ? "Save changes" : "Create run"}
      </SubmitButton>
    </form>
  );
}
