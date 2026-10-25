import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import type { EmailPayload, OutboxRow, Settings } from "@/lib/types";
import type { DispatchStore, NewOutboxRow, ReminderWithPerson, RunStats } from "./store";

const REMINDER_COLUMNS =
  "id, user_id, due_date, due_time, reason, note, status, email_individual, individual_sent_at, completed_at, person:people!inner(id, first_name, last_name, deleted_at)";

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Datenzugriff des Dispatchers über Supabase mit Service-Schlüssel. */
export function supabaseStore(db: AdminClient): DispatchStore {
  return {
    async startRun(source) {
      const data = must(await db.from("scheduler_runs").insert({ source }).select("id").single(), "Scheduler-Lauf anlegen");
      return (data as { id: number }).id;
    },
    async finishRun(id, stats: RunStats, error) {
      await db
        .from("scheduler_runs")
        .update({ ...stats, error, finished_at: new Date().toISOString() })
        .eq("id", id);
    },
    async lastRunAt(source) {
      const data = must(
        await db
          .from("scheduler_runs")
          .select("started_at")
          .eq("source", source)
          .order("started_at", { ascending: false })
          .limit(1),
        "Letzten Lauf lesen",
      );
      return (data as { started_at: string }[])[0]?.started_at ?? null;
    },
    async listSettings() {
      return must(await db.from("settings").select("*"), "Einstellungen lesen") as Settings[];
    },
    async getSettings(userId) {
      const data = must(await db.from("settings").select("*").eq("user_id", userId).maybeSingle(), "Einstellungen lesen");
      return (data as Settings | null) ?? null;
    },
    async listIndividualCandidates(userId, fromDate, toDate) {
      const data = must(
        await db
          .from("reminders")
          .select(REMINDER_COLUMNS)
          .eq("user_id", userId)
          .eq("status", "planned")
          .eq("email_individual", true)
          .gte("due_date", fromDate)
          .lte("due_date", toDate)
          .is("person.deleted_at", null),
        "Erinnerungen lesen",
      );
      return data as unknown as ReminderWithPerson[];
    },
    async insertOutbox(rows: NewOutboxRow[]) {
      const data = must(
        await db
          .from("email_outbox")
          .upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
          .select("id"),
        "Outbox schreiben",
      );
      return (data as unknown[]).length;
    },
    async claim(limit, nowIso) {
      return must(await db.rpc("claim_outbox", { p_limit: limit, p_now: nowIso }), "Outbox reservieren") as OutboxRow[];
    },
    async savePayload(id, payload: EmailPayload) {
      must(await db.from("email_outbox").update({ payload, subject: payload.subject }).eq("id", id), "Inhalt speichern");
    },
    async markSent(row, providerId) {
      const sentAt = new Date().toISOString();
      must(
        await db
          .from("email_outbox")
          .update({
            status: "sent",
            provider_message_id: providerId,
            sent_at: sentAt,
            payload: null,
            last_error: null,
            locked_at: null,
          })
          .eq("id", row.id),
        "Versand protokollieren",
      );
      if (row.kind === "individual" && row.reminder_id) {
        await db.from("reminders").update({ individual_sent_at: sentAt }).eq("id", row.reminder_id);
      }
    },
    async markRetry(id, nextAttemptAt, error) {
      must(
        await db
          .from("email_outbox")
          .update({ status: "pending", next_attempt_at: nextAttemptAt, last_error: error, locked_at: null })
          .eq("id", id),
        "Wiederholung planen",
      );
    },
    async markFailed(id, error) {
      must(
        await db.from("email_outbox").update({ status: "failed", last_error: error, locked_at: null }).eq("id", id),
        "Fehler protokollieren",
      );
    },
    async markSkipped(id, reason) {
      must(
        await db
          .from("email_outbox")
          .update({ status: "skipped", last_error: reason, locked_at: null, payload: null })
          .eq("id", id),
        "Überspringen protokollieren",
      );
    },
    async getReminder(id) {
      const data = must(await db.from("reminders").select(REMINDER_COLUMNS).eq("id", id).maybeSingle(), "Erinnerung lesen");
      return (data as unknown as ReminderWithPerson | null) ?? null;
    },
    async getLastEncounter(personId) {
      const data = must(
        await db
          .from("encounters")
          .select("occurred_on, kind, topics, notes")
          .eq("person_id", personId)
          .neq("kind", "note")
          .order("occurred_on", { ascending: false })
          .order("occurred_time", { ascending: false, nullsFirst: false })
          .limit(1),
        "Letzte Begegnung lesen",
      );
      return (data as never[])[0] ?? null;
    },
    async getOpenRemindersUntil(userId, date) {
      const data = must(
        await db
          .from("reminders")
          .select(REMINDER_COLUMNS)
          .eq("user_id", userId)
          .eq("status", "planned")
          .lte("due_date", date)
          .is("person.deleted_at", null)
          .order("due_date")
          .order("due_time", { nullsFirst: false }),
        "Offene Erinnerungen lesen",
      );
      return data as unknown as ReminderWithPerson[];
    },
    async getDoneSince(userId, sinceIso) {
      const data = must(
        await db
          .from("reminders")
          .select(REMINDER_COLUMNS)
          .eq("user_id", userId)
          .eq("status", "done")
          .gte("completed_at", sinceIso)
          .is("person.deleted_at", null)
          .order("completed_at"),
        "Erledigte Erinnerungen lesen",
      );
      return data as unknown as ReminderWithPerson[];
    },
    async purgeTrash(beforeIso) {
      const data = must(
        await db.from("people").select("id, user_id, photo_path").lt("deleted_at", beforeIso).limit(50),
        "Papierkorb lesen",
      ) as { id: string; user_id: string; photo_path: string | null }[];
      if (data.length === 0) return 0;
      const photos = data.map((p) => p.photo_path).filter((p): p is string => Boolean(p));
      if (photos.length) await db.storage.from("avatars").remove(photos);
      must(
        await db
          .from("people")
          .delete()
          .in(
            "id",
            data.map((p) => p.id),
          ),
        "Papierkorb leeren",
      );
      return data.length;
    },
  };
}
