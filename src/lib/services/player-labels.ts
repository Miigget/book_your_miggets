import { AdminError } from "@/lib/services/admin";
import { isUuid, type AppSupabaseClient } from "@/lib/services/runs";
import { canonicalPaletteHex } from "@/lib/player-label-palette";

const NAME_TAKEN = "That label name is already used.";
const UNKNOWN_LABEL = "Unknown label";
const INVALID_PLAYER = "Invalid user";
const UNKNOWN_PLAYER = "Unknown player";
const LABEL_MISSING = "Label not found";
const BLANK_NAME = "Label name is required";
const NAME_TOO_LONG = "Label name must be 24 characters or fewer";
const INVALID_COLOR = "Pick a color from the palette";

const MAX_NAME_LENGTH = 24;

export interface PlayerLabel {
  id: string;
  name: string;
  color: string;
}

function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

function isForeignKeyViolation(error: { code?: string }): boolean {
  return error.code === "23503";
}

export function parseLabelName(raw: string): string {
  const name = raw.trim();
  if (!name) throw new AdminError(BLANK_NAME);
  if (name.length > MAX_NAME_LENGTH) throw new AdminError(NAME_TOO_LONG);
  return name;
}

function requirePaletteColor(raw: string): string {
  const hex = canonicalPaletteHex(raw);
  if (!hex) throw new AdminError(INVALID_COLOR);
  return hex;
}

export async function listDictionary(supabase: AppSupabaseClient): Promise<PlayerLabel[]> {
  const { data, error } = await supabase
    .from("player_labels")
    .select("id, name, color")
    .order("name", { ascending: true });

  if (error) {
    console.error("listDictionary failed", error);
    throw new AdminError("Could not load labels");
  }

  return data.map((row) => ({ id: row.id, name: row.name, color: row.color }));
}

/** One query over assignments; returns label_id → count for the admin dictionary page. */
export async function countAssignmentsByLabel(supabase: AppSupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("player_label_assignments").select("label_id");

  if (error) {
    console.error("countAssignmentsByLabel failed", error);
    throw new AdminError("Could not load labels");
  }

  const counts = new Map<string, number>();
  for (const row of data) {
    counts.set(row.label_id, (counts.get(row.label_id) ?? 0) + 1);
  }
  return counts;
}

export async function listAssignedLabels(supabase: AppSupabaseClient, profileId: string): Promise<PlayerLabel[]> {
  if (!isUuid(profileId)) return [];

  const { data, error } = await supabase
    .from("player_label_assignments")
    .select("player_labels!inner(id, name, color)")
    .eq("profile_id", profileId);

  if (error) {
    console.error("listAssignedLabels failed", error);
    throw new AdminError("Could not load labels");
  }

  const labels: PlayerLabel[] = data.map((row) => ({
    id: row.player_labels.id,
    name: row.player_labels.name,
    color: row.player_labels.color,
  }));

  labels.sort((a, b) => a.name.localeCompare(b.name));
  return labels;
}

export async function createLabel(supabase: AppSupabaseClient, name: string, color: string): Promise<PlayerLabel> {
  const parsedName = parseLabelName(name);
  const parsedColor = requirePaletteColor(color);

  const { data, error } = await supabase
    .from("player_labels")
    .insert({ name: parsedName, color: parsedColor })
    .select("id, name, color")
    .single();

  if (error) {
    if (isUniqueViolation(error)) throw new AdminError(NAME_TAKEN);
    console.error("createLabel failed", error);
    throw new AdminError("Could not create label");
  }

  return { id: data.id, name: data.name, color: data.color };
}

export async function updateLabel(
  supabase: AppSupabaseClient,
  id: string,
  name: string,
  color: string,
): Promise<PlayerLabel> {
  if (!isUuid(id)) throw new AdminError(LABEL_MISSING);

  const parsedName = parseLabelName(name);
  const parsedColor = requirePaletteColor(color);

  const { data, error } = await supabase
    .from("player_labels")
    .update({ name: parsedName, color: parsedColor, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, color")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) throw new AdminError(NAME_TAKEN);
    console.error("updateLabel failed", error);
    throw new AdminError("Could not update label");
  }

  if (!data) throw new AdminError(LABEL_MISSING);

  return { id: data.id, name: data.name, color: data.color };
}

export async function deleteLabel(
  supabase: AppSupabaseClient,
  id: string,
): Promise<{ name: string; assignedCount: number }> {
  if (!isUuid(id)) throw new AdminError(LABEL_MISSING);

  const { data: existing, error: loadError } = await supabase
    .from("player_labels")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    console.error("deleteLabel load failed", loadError);
    throw new AdminError("Could not delete label");
  }
  if (!existing) throw new AdminError(LABEL_MISSING);

  const { count, error: countError } = await supabase
    .from("player_label_assignments")
    .select("*", { count: "exact", head: true })
    .eq("label_id", id);

  if (countError) {
    console.error("deleteLabel count failed", countError);
    throw new AdminError("Could not delete label");
  }

  const assignedCount = count ?? 0;

  const { error: deleteError } = await supabase.from("player_labels").delete().eq("id", id);

  if (deleteError) {
    console.error("deleteLabel failed", deleteError);
    throw new AdminError("Could not delete label");
  }

  return { name: existing.name, assignedCount };
}

export async function replacePlayerLabels(
  supabase: AppSupabaseClient,
  profileId: string,
  labelIds: string[],
): Promise<void> {
  if (!isUuid(profileId)) throw new AdminError(INVALID_PLAYER);

  const uniqueIds = [...new Set(labelIds.filter((id) => typeof id === "string" && id.length > 0))];

  for (const id of uniqueIds) {
    if (!isUuid(id)) throw new AdminError(UNKNOWN_LABEL);
  }

  const dictionary = await listDictionary(supabase);
  const dictionaryIds = new Set(dictionary.map((label) => label.id));

  for (const id of uniqueIds) {
    if (!dictionaryIds.has(id)) throw new AdminError(UNKNOWN_LABEL);
  }

  const { error: deleteError } = await supabase.from("player_label_assignments").delete().eq("profile_id", profileId);

  if (deleteError) {
    console.error("replacePlayerLabels delete failed", deleteError);
    throw new AdminError("Could not save labels");
  }

  if (uniqueIds.length === 0) return;

  const { error: insertError } = await supabase
    .from("player_label_assignments")
    .insert(uniqueIds.map((label_id) => ({ profile_id: profileId, label_id })));

  if (insertError) {
    if (isForeignKeyViolation(insertError)) throw new AdminError(UNKNOWN_PLAYER);
    console.error("replacePlayerLabels insert failed", insertError);
    throw new AdminError("Could not save labels");
  }
}
