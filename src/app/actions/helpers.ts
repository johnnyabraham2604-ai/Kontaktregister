import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TagKind } from "@/lib/types";

/** Legt fehlende Tags oder Interessen an (Groß-/Kleinschreibung egal) und liefert alle IDs. */
export async function ensureTags(supabase: SupabaseClient, kind: TagKind, names: string[]): Promise<string[]> {
  const wanted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).map((n) => n.slice(0, 60));
  if (wanted.length === 0) return [];
  const { data: existing } = await supabase.from("tags").select("id, name").eq("kind", kind);
  const byName = new Map((existing ?? []).map((t) => [String(t.name).toLowerCase(), String(t.id)]));
  const missing = wanted.filter((n) => !byName.has(n.toLowerCase()));
  if (missing.length) {
    const { data: inserted, error } = await supabase
      .from("tags")
      .insert(missing.map((name) => ({ name, kind })))
      .select("id, name");
    if (error) throw new Error(error.message);
    for (const t of inserted ?? []) byName.set(String(t.name).toLowerCase(), String(t.id));
  }
  return wanted.map((n) => byName.get(n.toLowerCase())).filter((x): x is string => Boolean(x));
}

/** Gleicht eine n:m-Zuordnung einer Person mit der gewünschten Menge ab. */
export async function syncPersonJoin(
  supabase: SupabaseClient,
  table: "person_categories" | "person_tags",
  column: "category_id" | "tag_id",
  personId: string,
  ids: string[],
) {
  const unique = Array.from(new Set(ids));
  const { data: current } = await supabase.from(table).select(column).eq("person_id", personId);
  const have = new Set((current ?? []).map((r) => String((r as Record<string, unknown>)[column])));
  const remove = [...have].filter((id) => !unique.includes(id));
  const add = unique.filter((id) => !have.has(id));
  if (remove.length) {
    const { error } = await supabase.from(table).delete().eq("person_id", personId).in(column, remove);
    if (error) throw new Error(error.message);
  }
  if (add.length) {
    const { error } = await supabase.from(table).insert(add.map((id) => ({ person_id: personId, [column]: id })));
    if (error) throw new Error(error.message);
  }
}

export function dbError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/duplicate key|unique/i.test(msg)) return "Diesen Eintrag gibt es bereits.";
  if (/row-level security/i.test(msg)) return "Keine Berechtigung für diese Aktion.";
  if (/violates check constraint/i.test(msg)) return "Eine Eingabe ist zu lang oder ungültig.";
  return "Speichern fehlgeschlagen. Bitte erneut versuchen.";
}
