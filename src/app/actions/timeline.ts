"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getToday } from "@/lib/data";
import { all, bool, isoDate, isoTime, str, strOrNull, uuid } from "@/lib/form";
import { ENCOUNTER_KINDS } from "@/lib/labels";
import { addDays, addMonths } from "@/lib/dates";
import type { ActionState, EncounterKind } from "@/lib/types";
import { dbError, ensureTags } from "./helpers";

const KINDS = new Set(ENCOUNTER_KINDS.map((k) => k.value));

function refresh() {
  revalidatePath("/", "layout");
}

function readReminder(fd: FormData, prefix = "") {
  const due_date = str(fd, `${prefix}due_date`);
  const due_time = strOrNull(fd, `${prefix}due_time`);
  const reason = str(fd, `${prefix}reason`);
  return {
    due_date,
    due_time,
    reason,
    note: strOrNull(fd, `${prefix}note`),
    email_individual: bool(fd, `${prefix}email_individual`),
  };
}

function checkReminder(r: ReturnType<typeof readReminder>): string | null {
  if (!isoDate.safeParse(r.due_date).success) return "Bitte ein Fälligkeitsdatum wählen.";
  if (r.due_time && !isoTime.safeParse(r.due_time).success) return "Uhrzeit ist ungültig.";
  if (!r.reason) return "Bitte einen Anlass angeben.";
  if (r.reason.length > 200) return "Anlass ist zu lang (höchstens 200 Zeichen).";
  if ((r.note?.length ?? 0) > 5000) return "Notiz ist zu lang.";
  return null;
}

/**
 * Begegnung anlegen oder bearbeiten. Optional wird im selben Schritt der nächste
 * Kontakttermin festgelegt ("Treffen festhalten").
 */
export async function saveEncounter(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const id = strOrNull(fd, "id");
  const person_id = str(fd, "person_id");
  const kind = str(fd, "kind") as EncounterKind;
  const occurred_on = str(fd, "occurred_on");
  const occurred_time = strOrNull(fd, "occurred_time");
  if (!uuid.safeParse(person_id).success || (id && !uuid.safeParse(id).success)) return { ok: false, message: "Ungültiger Eintrag." };
  if (!KINDS.has(kind)) return { ok: false, message: "Bitte die Art des Kontakts wählen." };
  if (!isoDate.safeParse(occurred_on).success) return { ok: false, message: "Bitte ein Datum wählen." };
  if (occurred_time && !isoTime.safeParse(occurred_time).success) return { ok: false, message: "Uhrzeit ist ungültig." };

  const row = {
    person_id,
    kind,
    occurred_on,
    occurred_time,
    location: strOrNull(fd, "location")?.slice(0, 300) ?? null,
    notes: strOrNull(fd, "notes")?.slice(0, 50000) ?? null,
    topics: strOrNull(fd, "topics")?.slice(0, 2000) ?? null,
    agreements: strOrNull(fd, "agreements")?.slice(0, 5000) ?? null,
  };

  const withNext = bool(fd, "plan_next");
  const next = readReminder(fd, "next_");
  if (withNext) {
    const problem = checkReminder(next);
    if (problem) return { ok: false, message: `Nächster Kontakt: ${problem}` };
  }

  try {
    let encounterId = id;
    if (id) {
      const { error } = await supabase.from("encounters").update(row).eq("id", id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("encounters").insert(row).select("id").single();
      if (error) throw error;
      encounterId = data.id;
    }
    const tagIds = [...all(fd, "tags").filter((x) => uuid.safeParse(x).success), ...(await ensureTags(supabase, "tag", all(fd, "tags_new")))];
    await supabase.from("encounter_tags").delete().eq("encounter_id", encounterId!);
    if (tagIds.length) {
      const { error } = await supabase.from("encounter_tags").insert(Array.from(new Set(tagIds)).map((tag_id) => ({ encounter_id: encounterId, tag_id })));
      if (error) throw error;
    }
    if (withNext) {
      const { error } = await supabase.from("reminders").insert({ person_id, ...next });
      if (error) throw error;
    }
  } catch (e) {
    return { ok: false, message: dbError(e) };
  }
  refresh();
  return { ok: true, message: "Gespeichert." };
}

export async function deleteEncounter(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  await supabase.from("encounters").delete().eq("id", id);
  refresh();
}

/** Wiedervorlage anlegen oder bearbeiten. */
export async function saveReminder(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const id = strOrNull(fd, "id");
  const person_id = str(fd, "person_id");
  if (!uuid.safeParse(person_id).success || (id && !uuid.safeParse(id).success)) return { ok: false, message: "Ungültiger Eintrag." };
  const r = readReminder(fd);
  const problem = checkReminder(r);
  if (problem) return { ok: false, message: problem };
  const { error } = id
    ? await supabase.from("reminders").update(r).eq("id", id)
    : await supabase.from("reminders").insert({ person_id, ...r });
  if (error) return { ok: false, message: dbError(error) };
  refresh();
  return { ok: true, message: "Gespeichert." };
}

/** Erledigt markieren. Löst bewusst keine neue Erinnerung aus. */
export async function completeReminder(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  await supabase
    .from("reminders")
    .update({ status: "done", completed_at: new Date().toISOString(), cancelled_at: null })
    .eq("id", id)
    .eq("status", "planned");
  refresh();
}

export async function cancelReminder(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  await supabase
    .from("reminders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "planned");
  refresh();
}

export async function reopenReminder(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  await supabase.from("reminders").update({ status: "planned", completed_at: null, cancelled_at: null }).eq("id", id);
  refresh();
}

/** Verschieben um eine feste Spanne ab heute (z.B. 1 Woche) oder auf ein gewähltes Datum. */
export async function postponeReminder(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  const by = str(fd, "by");
  const date = str(fd, "date");
  if (!uuid.safeParse(id).success) return;
  const today = await getToday();
  let due: string | null = null;
  if (by === "1d") due = addDays(today, 1);
  else if (by === "1w") due = addDays(today, 7);
  else if (by === "1m") due = addMonths(today, 1);
  else if (by === "3m") due = addMonths(today, 3);
  else if (isoDate.safeParse(date).success) due = date;
  if (!due) return;
  await supabase.from("reminders").update({ due_date: due, status: "planned" }).eq("id", id);
  refresh();
}

export async function deleteReminder(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  await supabase.from("reminders").delete().eq("id", id);
  refresh();
}
