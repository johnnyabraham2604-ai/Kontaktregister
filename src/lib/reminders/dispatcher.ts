import { DateTime } from "luxon";
import { addDays, formatDateTime } from "@/lib/dates";
import type { OutboxRow, Settings, EmailPayload } from "@/lib/types";
import {
  MAX_ATTEMPTS,
  classifySendFailure,
  digestDateFromKey,
  individualStillValid,
  planDigest,
  planIndividual,
  retryDelayMinutes,
  zoneOf,
} from "./schedule";
import { buildDigestEmail, buildIndividualEmail, buildTestEmail, type DigestItem } from "./templates";
import type { SendFn } from "./resend";
import type { DispatchStore, NewOutboxRow, ReminderWithPerson, RunStats } from "./store";

export interface DispatchOptions {
  store: DispatchStore;
  send: SendFn;
  appUrl: string;
  source: string;
  now?: () => Date;
  /** Pause zwischen zwei Sendungen, um das Ratenlimit von Resend einzuhalten. */
  pauseMs?: number;
  batchSize?: number;
  fallbackRecipient?: string | null;
}

export interface DispatchResult extends RunStats {
  runId: number;
  error: string | null;
}

const TRASH_RETENTION_DAYS = 30;

/**
 * Ein Durchlauf des Hintergrundprozesses:
 * 1. Fällige Einzel-Erinnerungen und Sammel-E-Mails als Auftrag in die Outbox schreiben.
 *    Jeder Auftrag hat einen eindeutigen Schlüssel, doppelte Läufe erzeugen also nichts doppelt.
 * 2. Offene Aufträge reservieren (SKIP LOCKED), Inhalt bauen, senden, Ergebnis protokollieren.
 * 3. Papierkorb nach 30 Tagen leeren.
 */
export async function runDispatcher(opts: DispatchOptions): Promise<DispatchResult> {
  const { store } = opts;
  const now = opts.now ?? (() => new Date());
  const stats: RunStats = { planned: 0, sent: 0, failed: 0, skipped: 0 };
  const runId = await store.startRun(opts.source);
  let error: string | null = null;

  try {
    const allSettings = await store.listSettings();
    const settingsByUser = new Map(allSettings.map((s) => [s.user_id, s]));

    stats.planned = await planAll(store, allSettings, now());
    await deliverAll(opts, settingsByUser, stats, now);

    const cutoff = DateTime.fromJSDate(now()).minus({ days: TRASH_RETENTION_DAYS }).toUTC().toISO()!;
    await store.purgeTrash(cutoff);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  await store.finishRun(runId, stats, error);
  return { runId, ...stats, error };
}

async function planAll(store: DispatchStore, allSettings: Settings[], now: Date): Promise<number> {
  const rows: NewOutboxRow[] = [];
  const nowIso = now.toISOString();
  for (const s of allSettings) {
    if (s.individual_enabled) {
      const today = DateTime.fromJSDate(now).setZone(zoneOf(s)).toISODate()!;
      // Suchfenster großzügig wählen, die genaue Entscheidung trifft planIndividual.
      const from = addDays(today, -2);
      const to = addDays(today, s.individual_lead_days + 2);
      const candidates = await store.listIndividualCandidates(s.user_id, from, to);
      for (const r of candidates) {
        if (r.person.deleted_at) continue;
        const p = planIndividual(r, s, now);
        if (p) {
          rows.push({
            user_id: s.user_id,
            kind: "individual",
            idempotency_key: p.key,
            reminder_id: r.id,
            scheduled_for: p.sendAt.toISO()!,
            next_attempt_at: nowIso,
          });
        }
      }
    }
    const d = planDigest(s, now);
    if (d) {
      rows.push({
        user_id: s.user_id,
        kind: "digest",
        idempotency_key: d.key,
        reminder_id: null,
        scheduled_for: d.scheduledFor.toISO()!,
        next_attempt_at: nowIso,
      });
    }
  }
  return rows.length ? store.insertOutbox(rows) : 0;
}

async function deliverAll(
  opts: DispatchOptions,
  settingsByUser: Map<string, Settings>,
  stats: RunStats,
  now: () => Date,
) {
  const claimed = await opts.store.claim(opts.batchSize ?? 20, now().toISOString());
  for (let i = 0; i < claimed.length; i++) {
    let outcome: Outcome;
    try {
      outcome = await deliverOne(opts, claimed[i], settingsByUser, now);
    } catch {
      // Datenbankfehler mitten im Versand: Auftrag bleibt reserviert und wird nach 15 Minuten
      // automatisch erneut aufgenommen (claim_outbox), der Idempotency-Key verhindert Doppelversand.
      outcome = "failed";
    }
    stats[outcome]++;
    if (outcome === "sent" && i < claimed.length - 1 && (opts.pauseMs ?? 0) > 0) {
      await new Promise((r) => setTimeout(r, opts.pauseMs));
    }
  }
}

type Outcome = "sent" | "failed" | "skipped";

/** Verarbeitet einen reservierten Outbox-Auftrag. Wird auch für die Test-E-Mail direkt benutzt. */
export async function deliverOne(
  opts: Pick<DispatchOptions, "store" | "send" | "appUrl" | "fallbackRecipient">,
  row: OutboxRow,
  settingsByUser: Map<string, Settings>,
  now: () => Date = () => new Date(),
): Promise<Outcome> {
  const { store } = opts;
  let settings = settingsByUser.get(row.user_id) ?? null;
  if (!settings) {
    settings = await store.getSettings(row.user_id);
    if (settings) settingsByUser.set(row.user_id, settings);
  }

  if (row.attempts > MAX_ATTEMPTS) {
    await store.markFailed(row.id, `Nach ${MAX_ATTEMPTS} Versuchen abgebrochen. ${row.last_error ?? ""}`.trim());
    return "failed";
  }

  const to = settings?.recipient_email || opts.fallbackRecipient || null;
  if (!to) {
    await store.markFailed(row.id, "Keine Empfängeradresse hinterlegt (Einstellungen)");
    return "failed";
  }

  // Bei Einzel-Erinnerungen vor jedem Versuch prüfen, ob der Auftrag noch gilt.
  let reminder: ReminderWithPerson | null = null;
  if (row.kind === "individual") {
    reminder = row.reminder_id ? await store.getReminder(row.reminder_id) : null;
    const reason = individualStillValid(
      row.idempotency_key,
      reminder ? { ...reminder, personDeleted: Boolean(reminder.person.deleted_at) } : null,
      settings,
    );
    if (reason) {
      await store.markSkipped(row.id, reason);
      return "skipped";
    }
  }

  // Inhalt beim ersten Versuch bauen und speichern. Wiederholungen senden exakt denselben Inhalt,
  // sonst würde Resend den Idempotency-Key als Konflikt ablehnen.
  let payload: EmailPayload | null = row.payload;
  if (!payload) {
    const built = await buildPayload(opts, row, settings, reminder, now);
    if ("skip" in built) {
      await store.markSkipped(row.id, built.skip);
      return "skipped";
    }
    payload = built;
    await store.savePayload(row.id, payload);
  }

  const result = await opts.send({ ...payload, to, idempotencyKey: row.idempotency_key });
  if (result.ok) {
    await store.markSent(row, result.id);
    return "sent";
  }

  const { retryable, message } = classifySendFailure(result);
  if (retryable && row.attempts < MAX_ATTEMPTS) {
    const next = DateTime.fromJSDate(now()).plus({ minutes: retryDelayMinutes(row.attempts) }).toUTC().toISO()!;
    await store.markRetry(row.id, next, message);
  } else {
    await store.markFailed(row.id, message);
  }
  return "failed";
}

async function buildPayload(
  opts: Pick<DispatchOptions, "store" | "appUrl">,
  row: OutboxRow,
  settings: Settings | null,
  reminder: ReminderWithPerson | null,
  now: () => Date,
): Promise<EmailPayload | { skip: string }> {
  const { store, appUrl } = opts;
  const tz = settings ? zoneOf(settings) : "Europe/Berlin";

  if (row.kind === "test") return buildTestEmail(appUrl, formatDateTime(now().toISOString(), tz));

  if (row.kind === "individual") {
    if (!reminder || !settings) return { skip: "Erinnerung nicht gefunden" };
    const last = settings.email_detail === "full" ? await store.getLastEncounter(reminder.person.id) : null;
    return buildIndividualEmail({
      appUrl,
      detail: settings.email_detail,
      person: reminder.person,
      reminder,
      lastEncounter: last,
    });
  }

  // Sammel-E-Mail: Inhalt zum Versandzeitpunkt bestimmen, damit Änderungen berücksichtigt werden.
  if (!settings) return { skip: "Keine Einstellungen gefunden" };
  if (!settings.digest_enabled) return { skip: "Sammel-E-Mail ist abgeschaltet" };
  const date = digestDateFromKey(row.idempotency_key);
  if (!date) return { skip: "Ungültiger Auftrag" };

  const open = (await store.getOpenRemindersUntil(row.user_id, date)).filter((r) => !r.person.deleted_at);
  const toItem = (r: ReminderWithPerson): DigestItem => ({ person: r.person, reminder: r });
  const today = open.filter((r) => r.due_date === date).map(toItem);
  const overdue = settings.digest_include_overdue ? open.filter((r) => r.due_date < date).map(toItem) : [];
  const since = DateTime.fromJSDate(now()).minus({ hours: 24 }).toUTC().toISO()!;
  const done = settings.digest_include_done
    ? (await store.getDoneSince(row.user_id, since)).filter((r) => !r.person.deleted_at).map(toItem)
    : [];

  if (today.length + overdue.length + done.length === 0) return { skip: "Nichts fällig" };
  return buildDigestEmail({ appUrl, date, today, overdue, done });
}

/** Prüft, ob der Datenbank-Scheduler (pg_cron) in letzter Zeit gelaufen ist. */
export async function schedulerIsStale(store: DispatchStore, now: Date, maxAgeHours = 3): Promise<boolean> {
  const last = await store.lastRunAt("pg_cron");
  if (!last) return true;
  return DateTime.fromJSDate(now).diff(DateTime.fromISO(last), "hours").hours > maxAgeHours;
}
