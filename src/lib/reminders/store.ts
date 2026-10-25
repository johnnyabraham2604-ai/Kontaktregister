import type { EncounterKind, OutboxKind, OutboxRow, EmailPayload, Settings } from "@/lib/types";

export interface ReminderWithPerson {
  id: string;
  user_id: string;
  due_date: string;
  due_time: string | null;
  reason: string;
  note: string | null;
  status: "planned" | "done" | "cancelled";
  email_individual: boolean;
  individual_sent_at: string | null;
  completed_at: string | null;
  person: { id: string; first_name: string; last_name: string; deleted_at: string | null };
}

export interface NewOutboxRow {
  user_id: string;
  kind: OutboxKind;
  idempotency_key: string;
  reminder_id: string | null;
  scheduled_for: string;
  next_attempt_at: string;
  status?: "pending" | "skipped";
  last_error?: string | null;
}

export interface RunStats {
  planned: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Datenzugriff des Dispatchers. In Produktion über Supabase (service_role),
 * in Tests über eine echte Postgres-Instanz mit demselben Schema.
 */
export interface DispatchStore {
  startRun(source: string): Promise<number>;
  finishRun(id: number, stats: RunStats, error: string | null): Promise<void>;
  lastRunAt(source: string): Promise<string | null>;

  listSettings(): Promise<Settings[]>;
  getSettings(userId: string): Promise<Settings | null>;
  listIndividualCandidates(userId: string, fromDate: string, toDate: string): Promise<ReminderWithPerson[]>;
  insertOutbox(rows: NewOutboxRow[]): Promise<number>;

  claim(limit: number, nowIso: string): Promise<OutboxRow[]>;
  savePayload(id: string, payload: EmailPayload): Promise<void>;
  markSent(row: OutboxRow, providerId: string): Promise<void>;
  markRetry(id: string, nextAttemptAt: string, error: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;

  getReminder(id: string): Promise<ReminderWithPerson | null>;
  getLastEncounter(
    personId: string,
  ): Promise<{ occurred_on: string; kind: EncounterKind; topics: string | null; notes: string | null } | null>;
  getOpenRemindersUntil(userId: string, date: string): Promise<ReminderWithPerson[]>;
  getDoneSince(userId: string, sinceIso: string): Promise<ReminderWithPerson[]>;

  purgeTrash(beforeIso: string): Promise<number>;
}
