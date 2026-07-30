import { useMemo, useState } from "react";
import { Map as MapIcon, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapPickerItem } from "@/lib/services/runs";

const fieldClass =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400";

interface MapPickerProps {
  maps: MapPickerItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  error?: string;
}

export function MapPicker({ maps, selectedId, onSelect, error }: MapPickerProps) {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("");

  const difficulties = useMemo(() => {
    const set = new Set(maps.map((m) => m.difficulty));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [maps]);

  const selected = maps.find((m) => m.id === selectedId) ?? null;

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm text-blue-100/80">Map (optional)</label>
        {selected && (
          <button
            type="button"
            onClick={() => {
              onSelect("");
            }}
            className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-100"
          >
            <X className="size-3" />
            Clear selection
          </button>
        )}
      </div>

      {selected ? (
        <div className="rounded-lg border border-purple-400/40 bg-purple-500/10 px-3 py-2 text-sm text-white">
          <div className="flex items-start gap-2">
            <MapIcon className="mt-0.5 size-4 shrink-0 text-purple-300" />
            <div>
              <p className="font-medium">{selected.name}</p>
              <p className="text-blue-100/60">
                {selected.difficulty} · {selected.stars} · {selected.points} pts
              </p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-blue-100/50">No map selected — title or nickname will name the run.</p>
      )}

      <input type="hidden" name="map_id" value={selectedId} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
          <input
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
        <select
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value);
          }}
          className={cn(fieldClass, "sm:min-w-40")}
          aria-label="Filter by difficulty"
        >
          <option value="" className="bg-slate-900">
            All difficulties
          </option>
          {difficulties.map((d) => (
            <option key={d} value={d} className="bg-slate-900">
              {d}
            </option>
          ))}
        </select>
      </div>

      <ul
        className={cn(
          "max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-black/20",
          error && "border-red-400/60",
        )}
        role="listbox"
        aria-label="Map results"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-blue-100/50">No maps match your filters.</li>
        ) : (
          filtered.map((m) => {
            const active = m.id === selectedId;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onSelect(m.id);
                  }}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-purple-600/40 text-white" : "text-blue-100/90 hover:bg-white/10",
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
      {filtered.length === 40 && (
        <p className="text-xs text-blue-100/40">Showing first 40 matches — refine search to narrow results.</p>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
