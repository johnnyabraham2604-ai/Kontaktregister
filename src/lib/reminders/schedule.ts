import { DateTime } from "luxon";
import { DEFAULT_TZ, isValidTimeZone } from "@/lib/dates";

/**
 * Reine Zeitlogik der Erinnerungen, ohne Datenbank und ohne Netzwerk.
 * Alle Berechnungen laufen in der Zeitzone des Nutzers (IANA, z.B. Europe/Berlin),
 * damit Sommer- und Winterzeit korrekt berücksichtigt werden.
 */

/** Einzel-Erinnerungen werden höchstens so lange nach ihrem Termin noch nachgeholt. */
export const INDIVIDUAL_CATCH_UP_HOURS = 36;
/** Eine verpasste Sammel-E-Mail wird am selben Tag höchstens so lange nachgeholt. */
export const DIGEST_CATCH_UP_HOURS = 12;
/** Maximale Zustellversuche pro E-Mail. */
export const MAX_ATTEMPTS = 5;

export interface ScheduleSettings {
  user_id: string;
  timezone: string;
  digest_enabled: boolean;
  digest_time: string;
  individual_enabled: boolean;
  default_reminder_time: string;
  individual_lead_days: number;
}

export interface ScheduleReminder {
  id: string;
  due_date: string;
  due_time: string | null;
  status: "planned" | "done" | "cancelled";
  email_individual: boolean;
}

export function zoneOf(s: { timezone: string }): string {
  return isValidTimeZone(s.timezone) ? s.timezone : DEFAULT_TZ;
}

function hhmm(t: string): string {
  return t.slice(0, 5);
}

/** Versandzeitpunkt einer Einzel-Erinnerung (UTC). Ohne Uhrzeit gilt die Standarduhrzeit. */
export function individualSendAt(rem: Pick<ScheduleReminder, "due_date" | "due_time">, s: ScheduleSettings): DateTime {
  const time = hhmm(rem.due_time ?? s.default_reminder_time);
  const local = DateTime.fromISO(`${rem.due_date}T${time}`, { zone: zoneOf(s) });
  // minus({ days }) arbeitet in Ortszeit: 09:00 bleibt 09:00, auch über eine Zeitumstellung hinweg.
  return local.minus({ days: Math.max(0, s.individual_lead_days) }).toUTC();
}

export function individualKey(reminderId: string, sendAt: DateTime): string {
  return `ind:${reminderId}:${sendAt.toUTC().toFormat("yyyyMMdd'T'HHmm'Z'")}`;
}

export interface PlannedIndividual {
  key: string;
  sendAt: DateTime;
}

/** Soll für diese Erinnerung jetzt eine Einzel-E-Mail eingeplant werden? */
export function planIndividual(rem: ScheduleReminder, s: ScheduleSettings, now: Date): PlannedIndividual | null {
  if (!s.individual_enabled || !rem.email_individual || rem.status !== "planned") return null;
  const sendAt = individualSendAt(rem, s);
  const nowDt = DateTime.fromJSDate(now).toUTC();
  if (sendAt > nowDt) return null;
  if (nowDt.diff(sendAt, "hours").hours > INDIVIDUAL_CATCH_UP_HOURS) return null;
  return { key: individualKey(rem.id, sendAt), sendAt };
}

/**
 * Prüft beim Versand, ob eine eingeplante Einzel-E-Mail noch gilt. Liefert einen Grund zum
 * Überspringen oder null. Damit respektiert der Versand Änderungen und Löschungen.
 */
export function individualStillValid(
  key: string,
  rem: (ScheduleReminder & { personDeleted: boolean }) | null,
  s: ScheduleSettings | null,
): string | null {
  if (!rem) return "Erinnerung wurde gelöscht";
  if (rem.personDeleted) return "Person liegt im Papierkorb";
  if (rem.status === "done") return "Erinnerung ist bereits erledigt";
  if (rem.status === "cancelled") return "Erinnerung wurde abgebrochen";
  if (!rem.email_individual) return "Einzel-E-Mail wurde für diese Erinnerung abgeschaltet";
  if (!s) return "Keine Einstellungen gefunden";
  if (!s.individual_enabled) return "Einzel-E-Mails sind in den Einstellungen abgeschaltet";
  if (individualKey(rem.id, individualSendAt(rem, s)) !== key) return "Termin wurde verschoben";
  return null;
}

export interface PlannedDigest {
  key: string;
  localDate: string;
  scheduledFor: DateTime;
}

export function digestKey(userId: string, localDate: string): string {
  return `dig:${userId}:${localDate}`;
}

/** Ist die tägliche Sammel-E-Mail jetzt fällig? */
export function planDigest(s: ScheduleSettings, now: Date): PlannedDigest | null {
  if (!s.digest_enabled) return null;
  const zone = zoneOf(s);
  const localNow = DateTime.fromJSDate(now).setZone(zone);
  const localDate = localNow.toISODate()!;
  const target = DateTime.fromISO(`${localDate}T${hhmm(s.digest_time)}`, { zone });
  if (localNow < target) return null;
  if (localNow.diff(target, "hours").hours > DIGEST_CATCH_UP_HOURS) return null;
  return { key: digestKey(s.user_id, localDate), localDate, scheduledFor: target.toUTC() };
}

export function digestDateFromKey(key: string): string | null {
  const m = /^dig:[^:]+:(\d{4}-\d{2}-\d{2})$/.exec(key);
  return m ? m[1] : null;
}

/** Wartezeit bis zum nächsten Versuch: 5 min, 15 min, 1 h, 3 h. */
export function retryDelayMinutes(attempts: number): number {
  const steps = [5, 15, 60, 180];
  return steps[Math.min(Math.max(attempts, 1), steps.length) - 1];
}

export interface SendFailure {
  status: number | null;
  name?: string;
  message: string;
}

/** Entscheidet, ob ein Versandfehler vorübergehend ist und erneut versucht werden soll. */
export function classifySendFailure(f: SendFailure): { retryable: boolean; message: string } {
  if (f.status === null) return { retryable: true, message: `Netzwerkfehler: ${f.message}` };
  if (f.status === 429) return { retryable: true, message: "Resend-Ratenlimit erreicht" };
  if (f.status >= 500) return { retryable: true, message: `Resend-Serverfehler ${f.status}: ${f.message}` };
  if (f.status === 409 && f.name === "concurrent_idempotent_requests") {
    return { retryable: true, message: "Gleichzeitige Anfrage mit demselben Schlüssel" };
  }
  if (f.status === 401) return { retryable: false, message: "Resend-API-Key fehlt oder ist ungültig" };
  if (f.status === 403) {
    return {
      retryable: false,
      message: `Versand abgelehnt (${f.message}). Ohne eigene Domain darf onboarding@resend.dev nur an die E-Mail-Adresse deines Resend-Kontos senden.`,
    };
  }
  return { retryable: false, message: `Resend-Fehler ${f.status}: ${f.message}` };
}
