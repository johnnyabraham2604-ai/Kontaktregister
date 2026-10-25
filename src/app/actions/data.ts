"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/data";
import { list, normalizeLink, personSchema } from "@/lib/form";
import { normalizeName, parseDateLoose } from "@/lib/csv";
import { ensureTags } from "./helpers";

export type ImportRow = Record<string, string>;
export type Decision = "create" | "skip" | "merge";
export interface DuplicateInfo {
  index: number;
  matchId: string | null;
  matchName: string | null;
  reason: string | null;
  problem: string | null;
}

const MAX_ROWS = 3000;

const SIMPLE_FIELDS = [
  "first_name", "last_name", "nickname", "email", "phone", "occupation", "company", "organization", "city", "country",
  "origin_country", "met_country", "met_place", "met_context", "about", "goals", "open_items",
] as const;

/** Wandelt eine importierte Zeile in eine gültige Personenzeile um oder liefert den Grund, warum nicht. */
function toPerson(row: ImportRow): { person: Record<string, unknown> | null; problem: string | null } {
  const get = (k: string) => (row[k] ?? "").trim();
  let first = get("first_name");
  let last = get("last_name");
  // Nur eine Namensspalte vorhanden: "Max Mustermann" aufteilen
  if (first && !last && !("last_name" in row) && first.includes(" ")) {
    const parts = first.split(/\s+/);
    last = parts.pop() ?? "";
    first = parts.join(" ");
  }
  if (!first && last) {
    first = last;
    last = "";
  }
  if (!first) return { person: null, problem: "Name fehlt" };
  const metRaw = get("met_on");
  const met_on = metRaw ? parseDateLoose(metRaw) : null;
  const links = list(get("links") || null).map(normalizeLink).filter((l): l is string => Boolean(l));
  const data: Record<string, unknown> = { first_name: first, last_name: last };
  for (const f of SIMPLE_FIELDS) if (f !== "first_name" && f !== "last_name") data[f] = get(f) || null;
  const email = get("email");
  data.email = email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
  data.links = links;
  data.languages = list(get("languages") || null);
  data.met_on = met_on;
  const parsed = personSchema.safeParse(data);
  if (!parsed.success) return { person: null, problem: parsed.error.issues[0]?.message ?? "Ungültige Zeile" };
  return { person: parsed.data, problem: metRaw && !met_on ? "Datum nicht erkannt, wird leer gelassen" : null };
}

/** Prüft jede Zeile auf mögliche Dubletten (gleiche E-Mail oder gleicher Name). Schreibt nichts. */
export async function previewImport(rows: ImportRow[]): Promise<{ ok: boolean; message?: string; results: DuplicateInfo[] }> {
  const { supabase } = await requireUser();
  if (rows.length > MAX_ROWS) return { ok: false, message: `Höchstens ${MAX_ROWS} Zeilen pro Import.`, results: [] };
  const { data: people } = await supabase.from("people").select("id, first_name, last_name, email").is("deleted_at", null).limit(20000);
  const byEmail = new Map<string, { id: string; name: string }>();
  const byName = new Map<string, { id: string; name: string }>();
  for (const p of people ?? []) {
    const name = `${p.first_name} ${p.last_name}`.trim();
    if (p.email) byEmail.set(String(p.email).toLowerCase(), { id: p.id, name });
    byName.set(normalizeName(p.first_name, p.last_name), { id: p.id, name });
  }
  const seen = new Map<string, number>();
  const results = rows.map((row, index): DuplicateInfo => {
    const { person, problem } = toPerson(row);
    if (!person) return { index, matchId: null, matchName: null, reason: null, problem };
    const email = (person.email as string | null)?.toLowerCase();
    const key = normalizeName(String(person.first_name), String(person.last_name));
    const hit = (email && byEmail.get(email)) || byName.get(key);
    if (hit) {
      return { index, matchId: hit.id, matchName: hit.name, reason: email && byEmail.get(email) ? "Gleiche E-Mail" : "Gleicher Name", problem };
    }
    const earlier = seen.get(key);
    seen.set(key, index);
    if (earlier !== undefined) return { index, matchId: null, matchName: null, reason: `Gleicher Name wie Zeile ${earlier + 2}`, problem };
    return { index, matchId: null, matchName: null, reason: null, problem };
  });
  return { ok: true, results };
}

/**
 * Führt den Import mit den gewählten Entscheidungen aus. "merge" füllt nur leere Felder und ergänzt
 * Kategorien, Tags und Interessen. Vorhandene Angaben werden nie überschrieben.
 */
export async function runImport(
  rows: ImportRow[],
  decisions: Decision[],
  matches: (string | null)[],
): Promise<{ ok: boolean; message: string }> {
  const { supabase } = await requireUser();
  if (rows.length > MAX_ROWS || decisions.length !== rows.length) return { ok: false, message: "Ungültige Importdaten." };

  const { data: cats } = await supabase.from("categories").select("id, name");
  const catByName = new Map((cats ?? []).map((c) => [String(c.name).toLowerCase(), String(c.id)]));
  const ensureCategories = async (names: string[]) => {
    const missing = Array.from(new Set(names.map((n) => n.trim()).filter((n) => n && !catByName.has(n.toLowerCase())))).map((n) => n.slice(0, 60));
    if (missing.length) {
      const { data } = await supabase.from("categories").insert(missing.map((name) => ({ name }))).select("id, name");
      for (const c of data ?? []) catByName.set(String(c.name).toLowerCase(), String(c.id));
    }
    return names.map((n) => catByName.get(n.trim().toLowerCase())).filter((x): x is string => Boolean(x));
  };

  let created = 0;
  let merged = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const decision = decisions[i];
    if (decision === "skip") {
      skipped++;
      continue;
    }
    const { person } = toPerson(rows[i]);
    if (!person) {
      skipped++;
      continue;
    }
    try {
      let personId: string;
      if (decision === "merge" && matches[i]) {
        personId = matches[i]!;
        const { data: existing } = await supabase.from("people").select("*").eq("id", personId).single();
        if (!existing) throw new Error("Person nicht gefunden");
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(person)) {
          const cur = (existing as Record<string, unknown>)[k];
          const empty = cur === null || cur === "" || (Array.isArray(cur) && cur.length === 0);
          if (empty && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)) patch[k] = v;
        }
        if (Object.keys(patch).length) {
          const { error } = await supabase.from("people").update(patch).eq("id", personId);
          if (error) throw error;
        }
        merged++;
      } else {
        const { data, error } = await supabase.from("people").insert(person).select("id").single();
        if (error) throw error;
        personId = data.id;
        created++;
      }
      const catIds = await ensureCategories(list(rows[i].categories || null));
      const tagIds = await ensureTags(supabase, "tag", list(rows[i].tags || null));
      const intIds = await ensureTags(supabase, "interest", list(rows[i].interests || null));
      if (catIds.length) await supabase.from("person_categories").upsert(catIds.map((category_id) => ({ person_id: personId, category_id })), { ignoreDuplicates: true });
      const all = [...tagIds, ...intIds];
      if (all.length) await supabase.from("person_tags").upsert(all.map((tag_id) => ({ person_id: personId, tag_id })), { ignoreDuplicates: true });
    } catch {
      errors.push(`Zeile ${i + 2}`);
    }
  }
  revalidatePath("/", "layout");
  const parts = [`${created} neu angelegt`, `${merged} ergänzt`, `${skipped} übersprungen`];
  if (errors.length) parts.push(`Fehler in ${errors.slice(0, 10).join(", ")}${errors.length > 10 ? " und weiteren" : ""}`);
  return { ok: errors.length === 0, message: `Import abgeschlossen: ${parts.join(", ")}.` };
}

type Row = Record<string, unknown>;

/**
 * Stellt einen JSON-Export wieder her. Fügt nur fehlende Datensätze hinzu (gleiche ID wird
 * übersprungen) und überschreibt nichts. Kategorien und Tags mit gleichem Namen werden zusammengelegt.
 */
export async function restoreBackup(json: string): Promise<{ ok: boolean; message: string }> {
  const { supabase, user } = await requireUser();
  let parsed: { format?: string; version?: number; tables?: Record<string, Row[]> };
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, message: "Die Datei ist kein gültiges JSON." };
  }
  if (parsed.format !== "register-export" || parsed.version !== 1 || !parsed.tables) {
    return { ok: false, message: "Das ist kein Register-Export (Format oder Version unbekannt)." };
  }
  const t = parsed.tables;
  const clean = (rows: Row[] | undefined, drop: string[] = []) =>
    (rows ?? []).map((r) => {
      const out: Row = { ...r };
      for (const k of ["user_id", "search_text", ...drop]) delete out[k];
      return out;
    });
  const counts: Record<string, number> = {};

  const insert = async (table: string, rows: Row[], conflict = "id") => {
    let n = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { data, error } = await supabase.from(table).upsert(chunk, { onConflict: conflict, ignoreDuplicates: true }).select();
      if (error) throw new Error(`${table}: ${error.message}`);
      n += data?.length ?? 0;
    }
    counts[table] = n;
  };

  try {
    // Kategorien und Tags: gleiche Namen auf vorhandene IDs abbilden
    const remap = new Map<string, string>();
    const { data: existingCats } = await supabase.from("categories").select("id, name");
    const catName = new Map((existingCats ?? []).map((c) => [String(c.name).toLowerCase(), String(c.id)]));
    const newCats = clean(t.categories).filter((c) => {
      const hit = catName.get(String(c.name).toLowerCase());
      if (hit && hit !== c.id) {
        remap.set(String(c.id), hit);
        return false;
      }
      return true;
    });
    const { data: existingTags } = await supabase.from("tags").select("id, name, kind");
    const tagName = new Map((existingTags ?? []).map((x) => [`${x.kind}:${String(x.name).toLowerCase()}`, String(x.id)]));
    const newTags = clean(t.tags).filter((x) => {
      const hit = tagName.get(`${x.kind}:${String(x.name).toLowerCase()}`);
      if (hit && hit !== x.id) {
        remap.set(String(x.id), hit);
        return false;
      }
      return true;
    });
    const id = (v: unknown) => remap.get(String(v)) ?? v;

    await insert("categories", newCats);
    await insert("tags", newTags);
    await insert("field_definitions", clean(t.field_definitions), "user_id,key");
    await insert(
      "people",
      clean(t.people).map((p) => ({ ...p, photo_path: typeof p.photo_path === "string" && p.photo_path.startsWith(`${user.id}/`) ? p.photo_path : null })),
    );
    await insert("person_categories", clean(t.person_categories).map((r) => ({ ...r, category_id: id(r.category_id) })), "person_id,category_id");
    await insert("person_tags", clean(t.person_tags).map((r) => ({ ...r, tag_id: id(r.tag_id) })), "person_id,tag_id");
    await insert("encounters", clean(t.encounters));
    await insert("encounter_tags", clean(t.encounter_tags).map((r) => ({ ...r, tag_id: id(r.tag_id) })), "encounter_id,tag_id");
    await insert("reminders", clean(t.reminders));
    await insert("person_links", clean(t.person_links));
  } catch (e) {
    return { ok: false, message: `Wiederherstellung abgebrochen: ${e instanceof Error ? e.message : "unbekannter Fehler"}. Bereits eingefügte Datensätze bleiben erhalten; ein erneuter Lauf überspringt sie.` };
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `Wiederhergestellt: ${counts.people ?? 0} Personen, ${counts.encounters ?? 0} Begegnungen, ${counts.reminders ?? 0} Erinnerungen, ${(counts.categories ?? 0) + (counts.tags ?? 0)} Kategorien und Tags. Vorhandene Datensätze wurden nicht verändert.`,
  };
}
