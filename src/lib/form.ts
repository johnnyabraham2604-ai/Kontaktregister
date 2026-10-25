import { z } from "zod";

/** Hilfen zum Auslesen und Prüfen von Formulardaten auf dem Server. */

export function str(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export function strOrNull(fd: FormData, name: string): string | null {
  const v = str(fd, name);
  return v === "" ? null : v;
}

export function all(fd: FormData, name: string): string[] {
  return fd
    .getAll(name)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
}

export function list(value: string | null): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum");
export const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Ungültige Uhrzeit");

const opt = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label}: höchstens ${max} Zeichen`)
    .nullable();

export const personSchema = z.object({
  first_name: z.string().min(1, "Vorname fehlt").max(100, "Vorname ist zu lang"),
  last_name: z.string().max(100, "Nachname ist zu lang"),
  nickname: opt(100, "Spitzname"),
  email: z.string().email("E-Mail-Adresse ist ungültig").max(320).nullable(),
  phone: opt(60, "Telefon"),
  city: opt(120, "Wohnort"),
  country: opt(120, "Land"),
  origin_country: opt(120, "Herkunftsland"),
  occupation: opt(200, "Beruf"),
  company: opt(200, "Unternehmen"),
  organization: opt(200, "Organisation"),
  links: z.array(z.string().max(500)).max(20, "Höchstens 20 Links"),
  languages: z.array(z.string().max(60)).max(20, "Höchstens 20 Sprachen"),
  met_on: isoDate.nullable(),
  met_country: opt(120, "Land des Kennenlernens"),
  met_place: opt(300, "Ort des Kennenlernens"),
  met_context: opt(2000, "Kontext"),
  about: opt(50000, "Über die Person"),
  goals: opt(20000, "Ziele und Projekte"),
  open_items: opt(20000, "Offene Punkte"),
});

export function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Eingaben unvollständig";
}

/** Nimmt nur http(s)-Links an, ergänzt fehlendes https://. */
export function normalizeLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
