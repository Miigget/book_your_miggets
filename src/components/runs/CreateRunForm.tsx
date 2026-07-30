import React, { useMemo, useState } from "react";
import { CalendarClock, Hash, Tag, Users } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { MapPicker } from "@/components/runs/MapPicker";
import { cn } from "@/lib/utils";
import type { MapPickerItem } from "@/lib/services/runs";

const selectClass =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-400";

interface Props {
  maps: MapPickerItem[];
  nickname: string | null;
  serverError?: string | null;
}

function defaultLocalStartsAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateRunForm({ maps, nickname: initialNickname, serverError }: Props) {
  const needsNickname = !initialNickname;
  const [nickname, setNickname] = useState("");
  const [title, setTitle] = useState("");
  const [mapId, setMapId] = useState("");
  const [startsAtLocal, setStartsAtLocal] = useState(defaultLocalStartsAt);
  const [maxParticipants, setMaxParticipants] = useState("2");
  const [minPoints, setMinPoints] = useState("0");
  const [joinMode, setJoinMode] = useState<"approval_required" | "auto_join">("approval_required");
  const [errors, setErrors] = useState<{
    nickname?: string;
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

    if (needsNickname) {
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
      } else if (d.getTime() <= Date.now()) {
        next.starts_at = "Start time must be in the future";
      }
    }

    const capacity = Number.parseInt(maxParticipants, 10);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      next.max_participants = "Must be a whole number greater than 0";
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
    <form method="POST" action="/api/runs" className="space-y-5" onSubmit={handleSubmit} noValidate>
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

      {!needsNickname && initialNickname && (
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

      <MapPicker maps={maps} selectedId={mapId} onSelect={setMapId} />

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
          name="join_mode"
          value={joinMode}
          onChange={(e) => {
            setJoinMode(e.target.value as "approval_required" | "auto_join");
          }}
          className={selectClass}
        >
          <option value="approval_required" className="bg-slate-900">
            Approval required
          </option>
          <option value="auto_join" className="bg-slate-900">
            Auto join
          </option>
        </select>
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Creating…" icon={<CalendarClock className="size-4" />}>
        Create run
      </SubmitButton>
    </form>
  );
}
