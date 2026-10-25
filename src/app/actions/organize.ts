"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/data";
import { str, strOrNull, uuid } from "@/lib/form";
import { FIELD_TYPES, LINK_KINDS } from "@/lib/labels";
import type { ActionState, LinkKind } from "@/lib/types";
import { dbError } from "./helpers";

function refresh() {
  revalidatePath("/", "layout");
}

type Table = "categories" | "tags";

function tableFor(fd: FormData): { table: Table; kind?: "tag" | "interest" } | null {
  const t = str(fd, "type");
  if (t === "category") return { table: "categories" };
  if (t === "tag" || t === "interest") return { table: "tags", kind: t };
  return null;
}

export async function createLabel(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const target = tableFor(fd);
  const name = str(fd, "name");
  if (!target) return { ok: false, message: "Unbekannter Typ." };
  if (!name || name.length > 60) return { ok: false, message: "Name fehlt oder ist länger als 60 Zeichen." };
  const { error } =
    target.table === "tags"
      ? await supabase.from("tags").insert({ name, kind: target.kind })
      : await supabase.from("categories").insert({ name });
  if (error) return { ok: false, message: dbError(error) };
  refresh();
  return { ok: true };
}

export async function renameLabel(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const target = tableFor(fd);
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!target || !uuid.safeParse(id).success) return { ok: false, message: "Ungültiger Eintrag." };
  if (!name || name.length > 60) return { ok: false, message: "Name fehlt oder ist länger als 60 Zeichen." };
  const { error } = await supabase.from(target.table).update({ name }).eq("id", id);
  if (error) return { ok: false, message: dbError(error) };
  refresh();
  return { ok: true };
}

export async function archiveLabel(fd: FormData) {
  const { supabase } = await requireUser();
  const target = tableFor(fd);
  const id = str(fd, "id");
  if (!target || !uuid.safeParse(id).success) return;
  const archived = str(fd, "archived") === "1";
  await supabase.from(target.table).update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  refresh();
}

export async function deleteLabel(fd: FormData) {
  const { supabase } = await requireUser();
  const target = tableFor(fd);
  const id = str(fd, "id");
  if (!target || !uuid.safeParse(id).success) return;
  await supabase.from(target.table).delete().eq("id", id);
  refresh();
}

/** Zwei Tags zusammenführen: alle Zuordnungen wandern zum Ziel, die Quelle wird gelöscht. */
export async function mergeTags(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const from = str(fd, "id");
  const into = str(fd, "into");
  if (!uuid.safeParse(from).success || !uuid.safeParse(into).success || from === into) {
    return { ok: false, message: "Bitte ein anderes Ziel wählen." };
  }
  const { data: rows } = await supabase.from("person_tags").select("person_id").eq("tag_id", from);
  if (rows?.length) {
    await supabase.from("person_tags").upsert(
      rows.map((r) => ({ person_id: r.person_id, tag_id: into })),
      { ignoreDuplicates: true },
    );
  }
  const { data: erows } = await supabase.from("encounter_tags").select("encounter_id").eq("tag_id", from);
  if (erows?.length) {
    await supabase.from("encounter_tags").upsert(
      erows.map((r) => ({ encounter_id: r.encounter_id, tag_id: into })),
      { ignoreDuplicates: true },
    );
  }
  await supabase.from("tags").delete().eq("id", from);
  refresh();
  return { ok: true };
}

function slugKey(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "feld"
  );
}

export async function createField(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const label = str(fd, "label");
  const field_type = str(fd, "field_type");
  if (!label || label.length > 60) return { ok: false, message: "Bezeichnung fehlt oder ist zu lang." };
  if (!FIELD_TYPES.some((t) => t.value === field_type)) return { ok: false, message: "Unbekannter Feldtyp." };
  const base = slugKey(label);
  const { data: existing } = await supabase.from("field_definitions").select("key");
  const keys = new Set((existing ?? []).map((r) => r.key));
  let key = base;
  for (let i = 2; keys.has(key); i++) key = `${base}_${i}`;
  const { error } = await supabase.from("field_definitions").insert({ key, label, field_type, sort_order: keys.size });
  if (error) return { ok: false, message: dbError(error) };
  refresh();
  return { ok: true };
}

export async function renameField(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  const label = str(fd, "label");
  if (!uuid.safeParse(id).success || !label || label.length > 60) return { ok: false, message: "Bezeichnung ungültig." };
  const { error } = await supabase.from("field_definitions").update({ label }).eq("id", id);
  if (error) return { ok: false, message: dbError(error) };
  refresh();
  return { ok: true };
}

export async function archiveField(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  const archived = str(fd, "archived") === "1";
  await supabase.from("field_definitions").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  refresh();
}

const LINK_SET = new Set(LINK_KINDS.map((k) => k.value));

export async function createLink(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const person_a = str(fd, "person_a");
  const person_b = str(fd, "person_b");
  const kind = str(fd, "kind") as LinkKind;
  if (!uuid.safeParse(person_a).success || !uuid.safeParse(person_b).success) return { ok: false, message: "Bitte eine Person auswählen." };
  if (person_a === person_b) return { ok: false, message: "Eine Person kann nicht mit sich selbst verknüpft werden." };
  if (!LINK_SET.has(kind)) return { ok: false, message: "Bitte die Art der Verbindung wählen." };
  // "hat vorgestellt" ist gerichtet. Ist die Richtung umgekehrt gewählt, werden die Seiten getauscht.
  const reversed = kind === "introduced" && str(fd, "direction") === "b_introduced_a";
  const { error } = await supabase.from("person_links").insert({
    person_a: reversed ? person_b : person_a,
    person_b: reversed ? person_a : person_b,
    kind,
    description: strOrNull(fd, "description")?.slice(0, 300) ?? null,
    note: strOrNull(fd, "note")?.slice(0, 5000) ?? null,
  });
  if (error) return { ok: false, message: dbError(error) };
  refresh();
  return { ok: true };
}

export async function deleteLink(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  await supabase.from("person_links").delete().eq("id", id);
  refresh();
}
