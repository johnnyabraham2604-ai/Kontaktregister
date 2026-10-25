import { DateTime } from "luxon";

export const DEFAULT_TZ = "Europe/Berlin";

export function isValidTimeZone(tz: string): boolean {
  return DateTime.now().setZone(tz).isValid;
}

/** Heutiges Datum (YYYY-MM-DD) in der Zeitzone des Nutzers. */
export function todayIn(tz: string, now: Date = new Date()): string {
  return DateTime.fromJSDate(now).setZone(isValidTimeZone(tz) ? tz : DEFAULT_TZ).toISODate()!;
}

export function addDays(isoDate: string, days: number): string {
  return DateTime.fromISO(isoDate, { zone: "utc" }).plus({ days }).toISODate()!;
}

export function addMonths(isoDate: string, months: number): string {
  return DateTime.fromISO(isoDate, { zone: "utc" }).plus({ months }).toISODate()!;
}

/** Ganze Tage zwischen zwei Kalenderdaten (b minus a). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    DateTime.fromISO(b, { zone: "utc" }).diff(DateTime.fromISO(a, { zone: "utc" }), "days").days,
  );
}

const fmtDate = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDateLong = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const d = DateTime.fromISO(isoDate.slice(0, 10), { zone: "utc" });
  return d.isValid ? fmtDate.format(d.toJSDate()) : isoDate;
}

export function formatDateLong(isoDate: string): string {
  const d = DateTime.fromISO(isoDate.slice(0, 10), { zone: "utc" });
  return d.isValid ? fmtDateLong.format(d.toJSDate()) : isoDate;
}

export function formatTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

export function formatDateTime(ts: string | null | undefined, tz: string): string {
  if (!ts) return "";
  const d = DateTime.fromISO(ts).setZone(isValidTimeZone(tz) ? tz : DEFAULT_TZ);
  return d.isValid ? d.setLocale("de").toFormat("d. LLL yyyy, HH:mm") : ts;
}

/** Relative Angabe wie "heute", "morgen", "in 5 Tagen", "vor 3 Wochen". */
export function relativeDay(isoDate: string, today: string): string {
  const diff = daysBetween(today, isoDate.slice(0, 10));
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  if (diff === -1) return "gestern";
  const abs = Math.abs(diff);
  let text: string;
  if (abs < 14) text = `${abs} Tagen`;
  else if (abs < 60) text = `${Math.round(abs / 7)} Wochen`;
  else if (abs < 730) text = `${Math.round(abs / 30.44)} Monaten`;
  else text = `${Math.round(abs / 365.25)} Jahren`;
  return diff > 0 ? `in ${text}` : `vor ${text}`;
}

export type DueState = "overdue" | "today" | "soon" | "later";

export function dueState(dueDate: string, today: string): DueState {
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 7) return "soon";
  return "later";
}

export const TIME_ZONES = [
  "Europe/Berlin",
  "Europe/London",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Paris",
  "Africa/Addis_Ababa",
  "Africa/Asmara",
  "Africa/Nairobi",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

/** Stunden seit einem Zeitstempel (für Statusanzeigen). */
export function hoursSince(ts: string): number {
  return DateTime.now().diff(DateTime.fromISO(ts), "hours").hours;
}
