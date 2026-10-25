"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, getFieldDefinitions } from "@/lib/data";
import { all, bool, firstIssue, isoDate, list, normalizeLink, personSchema, str, strOrNull, uuid } from "@/lib/form";
import type { ActionState } from "@/lib/types";
import { dbError, ensureTags, syncPersonJoin } from "./helpers";
import { getToday } from "@/lib/data";

function refresh() {
  revalidatePath("/", "layout");
}

/** Schnellerfassung: nur Name und optional Kontext. Weiter geht es auf der Profilseite. */
export async function quickCreatePerson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const first_name = str(fd, "first_name");
  if (!first_name) return { ok: false, message: "Bitte mindestens einen Vornamen eingeben." };
  if (first_name.length > 100 || str(fd, "last_name").length > 100) return { ok: false, message: "Name ist zu lang." };
  const met_on = strOrNull(fd, "met_on");
  if (met_on && !isoDate.safeParse(met_on).success) return { ok: false, message: "Datum ist ungültig." };

  const { data, error } = await supabase
    .from("people")
    .insert({
      first_name,
      last_name: str(fd, "last_name"),
      met_context: strOrNull(fd, "met_context")?.slice(0, 2000) ?? null,
      met_place: strOrNull(fd, "met_place")?.slice(0, 300) ?? null,
      met_on,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: dbError(error) };

  const categoryIds = all(fd, "categories").filter((id) => uuid.safeParse(id).success);
  if (categoryIds.length) await syncPersonJoin(supabase, "person_categories", "category_id", data.id, categoryIds);
  refresh();
  redirect(`/personen/${data.id}?neu=1`);
}

/** Vollständiges Profilformular (Anlegen und Bearbeiten). */
export async function savePerson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const id = strOrNull(fd, "id");
  if (id && !uuid.safeParse(id).success) return { ok: false, message: "Ungültige Person." };

  const rawLinks = list(strOrNull(fd, "links"));
  const links = rawLinks.map(normalizeLink);
  if (links.some((l) => l === null)) return { ok: false, message: "Ein Link ist ungültig. Bitte vollständige Web-Adressen verwenden." };

  const parsed = personSchema.safeParse({
    first_name: str(fd, "first_name"),
    last_name: str(fd, "last_name"),
    nickname: strOrNull(fd, "nickname"),
    email: strOrNull(fd, "email"),
    phone: strOrNull(fd, "phone"),
    city: strOrNull(fd, "city"),
    country: strOrNull(fd, "country"),
    origin_country: strOrNull(fd, "origin_country"),
    occupation: strOrNull(fd, "occupation"),
    company: strOrNull(fd, "company"),
    organization: strOrNull(fd, "organization"),
    links,
    languages: list(strOrNull(fd, "languages")),
    met_on: strOrNull(fd, "met_on"),
    met_country: strOrNull(fd, "met_country"),
    met_place: strOrNull(fd, "met_place"),
    met_context: strOrNull(fd, "met_context"),
    about: strOrNull(fd, "about"),
    goals: strOrNull(fd, "goals"),
    open_items: strOrNull(fd, "open_items"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  // Eigene Felder: nur aktive Definitionen übernehmen, Werte archivierter Felder bleiben erhalten.
  const defs = (await getFieldDefinitions()).filter((d) => !d.archived_at);
  let existingCustom: Record<string, string> = {};
  if (id) {
    const { data } = await supabase.from("people").select("custom_fields").eq("id", id).single();
    existingCustom = (data?.custom_fields as Record<string, string>) ?? {};
  }
  const custom: Record<string, string> = { ...existingCustom };
  for (const d of defs) {
    const v = str(fd, `cf_${d.key}`).slice(0, 2000);
    if (!v) {
      delete custom[d.key];
      continue;
    }
    if (d.field_type === "number" && Number.isNaN(Number(v.replace(",", ".")))) {
      return { ok: false, message: `${d.label}: bitte eine Zahl eingeben.` };
    }
    if (d.field_type === "date" && !isoDate.safeParse(v).success) return { ok: false, message: `${d.label}: Datum ungültig.` };
    if (d.field_type === "url") {
      const link = normalizeLink(v);
      if (!link) return { ok: false, message: `${d.label}: Link ungültig.` };
      custom[d.key] = link;
      continue;
    }
    custom[d.key] = v;
  }

  const row = { ...parsed.data, custom_fields: custom };
  let personId = id;
  try {
    if (id) {
      const { error } = await supabase.from("people").update(row).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("people").insert(row).select("id").single();
      if (error) throw error;
      personId = data.id;
    }
    const categoryIds = all(fd, "categories").filter((x) => uuid.safeParse(x).success);
    const tagIds = all(fd, "tags").filter((x) => uuid.safeParse(x).success);
    const interestIds = all(fd, "interests").filter((x) => uuid.safeParse(x).success);
    const newTags = await ensureTags(supabase, "tag", all(fd, "tags_new"));
    const newInterests = await ensureTags(supabase, "interest", all(fd, "interests_new"));
    await syncPersonJoin(supabase, "person_categories", "category_id", personId!, categoryIds);
    await syncPersonJoin(supabase, "person_tags", "tag_id", personId!, [...tagIds, ...interestIds, ...newTags, ...newInterests]);
  } catch (e) {
    return { ok: false, message: dbError(e) };
  }
  refresh();
  redirect(`/personen/${personId}`);
}

/** Notizfelder direkt auf der Profilseite bearbeiten. */
export async function saveNotes(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return { ok: false, message: "Ungültige Person." };
  const update = {
    about: strOrNull(fd, "about"),
    goals: strOrNull(fd, "goals"),
    open_items: strOrNull(fd, "open_items"),
  };
  if ((update.about?.length ?? 0) > 50000) return { ok: false, message: "Notiz ist zu lang." };
  const { error } = await supabase.from("people").update(update).eq("id", id);
  if (error) return { ok: false, message: dbError(error) };
  refresh();
  return { ok: true, message: "Notizen gespeichert." };
}

/** Kurze, datierte Notiz in der Timeline (zählt nicht als Kontakt). */
export async function addNote(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const person_id = str(fd, "person_id");
  const notes = str(fd, "notes");
  if (!uuid.safeParse(person_id).success) return { ok: false, message: "Ungültige Person." };
  if (!notes) return { ok: false, message: "Die Notiz ist leer." };
  const { error } = await supabase
    .from("encounters")
    .insert({ person_id, kind: "note", occurred_on: await getToday(), notes: notes.slice(0, 50000) });
  if (error) return { ok: false, message: dbError(error) };
  refresh();
  return { ok: true };
}

export async function trashPerson(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  await supabase.from("people").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  refresh();
  redirect("/personen?geloescht=1");
}

export async function restorePerson(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  await supabase.from("people").update({ deleted_at: null }).eq("id", id);
  refresh();
}

/** Endgültig löschen: Person, Begegnungen, Erinnerungen, Verknüpfungen und Profilbild. */
export async function deletePersonForever(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  const { data } = await supabase.from("people").select("photo_path, deleted_at").eq("id", id).single();
  if (!data?.deleted_at) return; // nur aus dem Papierkorb heraus
  if (data.photo_path) await supabase.storage.from("avatars").remove([data.photo_path]);
  await supabase.from("people").delete().eq("id", id);
  refresh();
}

export async function emptyTrash() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("people").select("id, photo_path").not("deleted_at", "is", null);
  const photos = (data ?? []).map((p) => p.photo_path).filter((p): p is string => Boolean(p));
  if (photos.length) await supabase.storage.from("avatars").remove(photos);
  if (data?.length) await supabase.from("people").delete().in("id", data.map((p) => p.id));
  refresh();
}

/** Profilbild setzen, nachdem der Browser es direkt in den privaten Speicher geladen hat. */
export async function setPhoto(personId: string, path: string | null): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  if (!uuid.safeParse(personId).success) return { ok: false, message: "Ungültige Person." };
  if (path && !path.startsWith(`${user.id}/`)) return { ok: false, message: "Ungültiger Speicherort." };
  const { data: before } = await supabase.from("people").select("photo_path").eq("id", personId).single();
  const { error } = await supabase.from("people").update({ photo_path: path }).eq("id", personId);
  if (error) return { ok: false, message: dbError(error) };
  if (before?.photo_path && before.photo_path !== path) {
    await supabase.storage.from("avatars").remove([before.photo_path]);
  }
  refresh();
  return { ok: true };
}

export async function togglePersonCategory(fd: FormData) {
  const { supabase } = await requireUser();
  const person_id = str(fd, "person_id");
  const category_id = str(fd, "category_id");
  if (!uuid.safeParse(person_id).success || !uuid.safeParse(category_id).success) return;
  if (bool(fd, "remove")) {
    await supabase.from("person_categories").delete().eq("person_id", person_id).eq("category_id", category_id);
  } else {
    await supabase.from("person_categories").upsert({ person_id, category_id }, { ignoreDuplicates: true });
  }
  refresh();
}
