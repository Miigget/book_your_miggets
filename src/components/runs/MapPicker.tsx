import { useMemo, useState } from "react";
import { Map as MapIcon, Search, X } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { MAP_CATEGORIES } from "@/lib/map-categories";
import { RUN_MAPS_CAP_MESSAGE, RUN_MAPS_MAX } from "@/lib/run-maps";
import { cn } from "@/lib/utils";
import type { MapPickerItem } from "@/lib/services/runs";

const fieldClass =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400";

interface MapPickerProps {
  maps: MapPickerItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  error?: string;
  initialDifficulty?: string;
  maxSelected?: number;
  includeCategoryField?: boolean;
  capMessage?: string;
  label?: string;
  emptyHint?: string;
}

export function MapPicker({
  maps,
  selectedIds,
  onChange,
  error,
  initialDifficulty = "",
  maxSelected = RUN_MAPS_MAX,
  includeCategoryField = true,
  capMessage = RUN_MAPS_CAP_MESSAGE,
  label = "Maps (optional)",
  emptyHint = "No maps selected — the difficulty filter below is the run category if you pick one.",
}: MapPickerProps) {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState(() =>
    (MAP_CATEGORIES as readonly string[]).includes(initialDifficulty) ? initialDifficulty : "",
  );
  const [capError, setCapError] = useState<string | undefined>();

  const mapsById = useMemo(() => new Map(maps.map((m) => [m.id, m])), [maps]);
  const selected = selectedIds.map((id) => mapsById.get(id)).filter((m): m is MapPickerItem => m != null);
  const atCap = selectedIds.length >= maxSelected;
  const displayError = error ?? capError;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return maps
      .filter((m) => {
        if (difficulty && m.difficulty !== difficulty) return false;
        if (!q) return true;
        return m.name.toLowerCase().includes(q) || m.difficulty.toLowerCase().includes(q);
      })
      .slice(0, 40);
  }, [maps, query, difficulty]);

  function append(id: string) {
    if (selectedIds.includes(id)) return;
    if (selectedIds.length >= maxSelected) {
      setCapError(capMessage);
      return;
    }
    setCapError(undefined);
    onChange([...selectedIds, id]);
  }

  function remove(id: string) {
    setCapError(undefined);
    onChange(selectedIds.filter((selectedId) => selectedId !== id));
  }

  function clearAll() {
    setCapError(undefined);
    onChange([]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="map-search" className="text-sm text-blue-100/80">
          {label}
        </label>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-100"
          >
            <X className="size-3" />
            Clear all
          </button>
        )}
      </div>

      {selected.length > 0 ? (
        <ol className="space-y-2">
          {selected.map((m, index) => (
            <li
              key={m.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-purple-400/40 bg-purple-500/10 px-3 py-2 text-sm text-white"
            >
              <div className="flex min-w-0 items-start gap-2">
                <MapIcon className="mt-0.5 size-4 shrink-0 text-purple-300" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {index + 1}. {m.name}
                  </p>
                  <p className="text-blue-100/60">
                    {m.difficulty} · {m.stars} · {m.points} pts
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  remove(m.id);
                }}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-purple-300 hover:text-purple-100"
                aria-label={`Remove ${m.name}`}
              >
                <X className="size-3" />
                Remove
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-blue-100/50">{emptyHint}</p>
      )}

      {selectedIds.map((id) => (
        <input key={id} type="hidden" name="map_ids" value={id} />
      ))}
      {includeCategoryField ? (
        <input type="hidden" name="map_category" value={selectedIds.length === 0 ? difficulty : ""} />
      ) : null}

      <p className="text-xs text-blue-100/40">
        Up to {maxSelected} maps. Add order is the list order.
        {selectedIds.length > 0 ? ` ${selectedIds.length}/${maxSelected} selected.` : ""}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
          <input
            id="map-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Search maps by name…"
            className={cn(fieldClass, "pl-10")}
            autoComplete="off"
          />
        </div>
        <NativeSelect
          id="map-difficulty"
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value);
          }}
          className={cn(fieldClass, "sm:min-w-40")}
          wrapperClassName="sm:w-auto"
          aria-label="Difficulty"
        >
          <option value="" className="bg-slate-900">
            All difficulties
          </option>
          {MAP_CATEGORIES.map((d) => (
            <option key={d} value={d} className="bg-slate-900">
              {d}
            </option>
          ))}
        </NativeSelect>
      </div>
      <ul
        className={cn(
          "max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-black/20",
          displayError && "border-red-400/60",
        )}
        role="listbox"
        aria-multiselectable="true"
        aria-label="Map results"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-blue-100/50">No maps match your filters.</li>
        ) : (
          filtered.map((m) => {
            const active = selectedIds.includes(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    append(m.id);
                  }}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-purple-600/40 text-white" : "text-blue-100/90 hover:bg-white/10",
                    !active && atCap && "opacity-60",
                  )}
                >
                  <span className="font-medium">{m.name}</span>
                  <span className="shrink-0 text-xs text-blue-100/50">
                    {m.difficulty} · {m.points} pts
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      {displayError && <p className="text-xs text-red-300">{displayError}</p>}
    </div>
  );
}
