export const PLAYER_LABEL_PALETTE = [
  { hex: "#6D28D9", name: "Violet" },
  { hex: "#1D4ED8", name: "Blue" },
  { hex: "#0E7490", name: "Cyan" },
  { hex: "#047857", name: "Emerald" },
  { hex: "#B45309", name: "Amber" },
  { hex: "#B91C1C", name: "Red" },
  { hex: "#BE185D", name: "Pink" },
  { hex: "#C2410C", name: "Orange" },
  { hex: "#4338CA", name: "Indigo" },
  { hex: "#475569", name: "Slate" },
] as const;

const PALETTE_HEXES = new Set(PLAYER_LABEL_PALETTE.map((entry) => entry.hex));

/** Trim, case-insensitive match against the palette; returns canonical `#RRGGBB` uppercase or null. */
export function isPaletteHex(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const canonical = trimmed.toUpperCase();
  return PALETTE_HEXES.has(canonical as (typeof PLAYER_LABEL_PALETTE)[number]["hex"]);
}

export function canonicalPaletteHex(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const canonical = trimmed.toUpperCase();
  if (!PALETTE_HEXES.has(canonical as (typeof PLAYER_LABEL_PALETTE)[number]["hex"])) return null;
  return canonical;
}
