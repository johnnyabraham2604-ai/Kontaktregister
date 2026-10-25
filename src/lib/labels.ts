import type { EncounterKind, LinkKind, OutboxKind, OutboxStatus, FieldType } from "./types";

export const ENCOUNTER_KINDS: { value: EncounterKind; label: string }[] = [
  { value: "meeting", label: "Persönliches Treffen" },
  { value: "first_meeting", label: "Erstes Kennenlernen" },
  { value: "call", label: "Telefonat" },
  { value: "video", label: "Videocall" },
  { value: "message", label: "Nachricht oder E-Mail" },
  { value: "event", label: "Gemeinsame Veranstaltung" },
  { value: "trip", label: "Gemeinsame Reise" },
  { value: "other", label: "Sonstiges" },
  { value: "note", label: "Notiz" },
];

export const encounterLabel = (k: EncounterKind) => ENCOUNTER_KINDS.find((x) => x.value === k)?.label ?? k;

export const LINK_KINDS: { value: LinkKind; label: string }[] = [
  { value: "colleagues", label: "Kollegen" },
  { value: "friends", label: "Freunde" },
  { value: "acquaintances", label: "Gemeinsame Bekannte" },
  { value: "project", label: "Gemeinsames Projekt" },
  { value: "event", label: "Gemeinsame Veranstaltung" },
  { value: "family", label: "Familie" },
  { value: "introduced", label: "Hat vorgestellt" },
  { value: "other", label: "Sonstige Verbindung" },
];

/** Beschriftung einer Verknüpfung aus Sicht der Person, deren Profil gerade offen ist. */
export function linkLabel(kind: LinkKind, viewerIsA: boolean): string {
  if (kind === "introduced") return viewerIsA ? "hat mir vorgestellt" : "wurde mir vorgestellt von";
  return LINK_KINDS.find((x) => x.value === kind)?.label ?? kind;
}

export const OUTBOX_KIND_LABEL: Record<OutboxKind, string> = {
  individual: "Einzel-Erinnerung",
  digest: "Sammel-E-Mail",
  test: "Test-E-Mail",
};

export const OUTBOX_STATUS_LABEL: Record<OutboxStatus, string> = {
  pending: "Wartet",
  sending: "Wird gesendet",
  sent: "Gesendet",
  failed: "Fehlgeschlagen",
  skipped: "Übersprungen",
};

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Zahl" },
  { value: "date", label: "Datum" },
  { value: "url", label: "Link" },
];

export const DEFAULT_CATEGORIES = [
  "Arbeit und Karriere",
  "Freunde",
  "Familie",
  "Universität und Forschung",
  "Unternehmertum",
  "Start-ups und Venture Capital",
  "Reisen",
  "Länder und internationale Kontakte",
  "Veranstaltungen und Konferenzen",
  "Mentoren und wichtige Ansprechpartner",
];

export function fullName(p: { first_name: string; last_name: string }) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ");
}

export function initials(p: { first_name: string; last_name: string }) {
  const a = Array.from(p.first_name.trim())[0] ?? "";
  const b = Array.from(p.last_name.trim())[0] ?? "";
  return (a + b).toUpperCase() || "?";
}
