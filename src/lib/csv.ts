/** CSV für Excel (deutsch): Semikolon, CRLF, UTF-8 mit BOM, Formel-Injektion entschärft. */
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Zellen, die mit = + - @ beginnen, würde Excel als Formel ausführen
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(";"), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Felder, die beim CSV-Import erkannt werden, mit typischen Spaltennamen. */
export const IMPORT_FIELDS: { key: string; label: string; aliases: string[] }[] = [
  { key: "first_name", label: "Vorname", aliases: ["vorname", "first name", "firstname", "given name", "name"] },
  { key: "last_name", label: "Nachname", aliases: ["nachname", "last name", "lastname", "family name", "surname"] },
  { key: "nickname", label: "Spitzname", aliases: ["spitzname", "nickname", "anrede"] },
  { key: "email", label: "E-Mail", aliases: ["e-mail", "email", "e-mail address", "email address", "mail"] },
  { key: "phone", label: "Telefon", aliases: ["telefon", "phone", "mobile", "handy", "mobil", "phone number"] },
  { key: "occupation", label: "Beruf / Position", aliases: ["beruf", "position", "title", "job title", "rolle", "role", "occupation"] },
  { key: "company", label: "Unternehmen", aliases: ["unternehmen", "firma", "company", "organization name"] },
  { key: "organization", label: "Universität / Organisation", aliases: ["organisation", "organization", "universität", "university", "hochschule"] },
  { key: "city", label: "Wohnort", aliases: ["wohnort", "stadt", "city", "ort"] },
  { key: "country", label: "Land", aliases: ["land", "country"] },
  { key: "origin_country", label: "Herkunftsland", aliases: ["herkunftsland", "herkunft", "origin"] },
  { key: "languages", label: "Sprachen", aliases: ["sprachen", "languages"] },
  { key: "links", label: "Links", aliases: ["links", "website", "linkedin", "url", "web"] },
  { key: "met_on", label: "Kennengelernt am", aliases: ["kennengelernt am", "kennengelernt", "met on", "datum kennenlernen", "first met"] },
  { key: "met_country", label: "Land des Kennenlernens", aliases: ["land des kennenlernens", "met country"] },
  { key: "met_place", label: "Ort / Veranstaltung", aliases: ["ort des kennenlernens", "veranstaltung", "event", "met at", "ort / veranstaltung"] },
  { key: "met_context", label: "Kontext", aliases: ["kontext", "context", "woher", "how we met"] },
  { key: "about", label: "Notizen", aliases: ["notizen", "notes", "notiz", "über die person", "about"] },
  { key: "goals", label: "Ziele und Projekte", aliases: ["ziele", "projekte", "ziele und projekte", "goals"] },
  { key: "open_items", label: "Offene Punkte", aliases: ["offene punkte", "offene fragen", "next steps"] },
  { key: "categories", label: "Kategorien", aliases: ["kategorien", "kategorie", "categories", "category", "gruppe", "groups"] },
  { key: "tags", label: "Tags", aliases: ["tags", "tag", "labels", "schlagwörter"] },
  { key: "interests", label: "Interessen", aliases: ["interessen", "interests", "hobbys", "hobbies"] },
];

/** Akzeptiert 2026-10-25, 25.10.2026 und 25.10.26. */
export function parseDateLoose(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function normalizeName(first: string, last: string): string {
  return `${first} ${last}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
