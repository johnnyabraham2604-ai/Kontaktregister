import { encounterLabel, fullName } from "@/lib/labels";
import { daysBetween, formatDate, formatDateLong, formatTime } from "@/lib/dates";
import type { EmailPayload, EncounterKind } from "@/lib/types";

/**
 * E-Mail-Vorlagen. Sie verwenden ausschließlich Daten, die im Register gespeichert sind,
 * und erzeugen immer eine HTML- und eine Textfassung.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

interface PersonRef {
  id: string;
  first_name: string;
  last_name: string;
}

export interface IndividualEmailInput {
  appUrl: string;
  detail: "full" | "minimal";
  person: PersonRef;
  reminder: { id: string; due_date: string; due_time: string | null; reason: string; note: string | null };
  lastEncounter: { occurred_on: string; kind: EncounterKind; topics: string | null; notes: string | null } | null;
}

export interface DigestItem {
  person: PersonRef;
  reminder: {
    id: string;
    due_date: string;
    due_time: string | null;
    reason: string;
    individual_sent_at: string | null;
  };
}

export interface DigestEmailInput {
  appUrl: string;
  date: string;
  today: DigestItem[];
  overdue: DigestItem[];
  done: DigestItem[];
}

const COLORS = { ink: "#1c2321", muted: "#5f6b66", line: "#dde2df", accent: "#2f5d50", paper: "#f6f7f5", warn: "#b4442f" };

function layout(title: string, bodyHtml: string, appUrl: string): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLORS.ink};">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
<div style="background:#ffffff;border:1px solid ${COLORS.line};border-radius:10px;padding:24px;">
${bodyHtml}
</div>
<p style="font-size:12px;color:${COLORS.muted};margin:16px 4px 0;line-height:1.5;">
Diese E-Mail kommt von deinem Register. Sie enthält nur Angaben, die du dort gespeichert hast.
<a href="${escapeHtml(appUrl)}/einstellungen" style="color:${COLORS.muted};">Einstellungen</a>
</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(label)}</a>`;
}

function dueText(due_date: string, due_time: string | null): string {
  return formatDateLong(due_date) + (due_time ? `, ${formatTime(due_time)} Uhr` : "");
}

export function profileUrl(appUrl: string, personId: string, reminderId?: string): string {
  const base = `${appUrl}/personen/${personId}`;
  return reminderId ? `${base}?erinnerung=${reminderId}#erinnerungen` : base;
}

export function buildIndividualEmail(input: IndividualEmailInput): EmailPayload {
  const { person, reminder, appUrl, detail } = input;
  const name = fullName(person);
  const subject = `Kontaktaufnahme mit ${name}`;
  const link = profileUrl(appUrl, person.id, reminder.id);
  const full = detail === "full";

  const rows: [string, string][] = [
    ["Fällig", dueText(reminder.due_date, reminder.due_time)],
    ["Anlass", reminder.reason],
  ];
  if (full && reminder.note) rows.push(["Notiz", truncate(reminder.note, 400)]);
  if (full && input.lastEncounter) {
    const e = input.lastEncounter;
    const about = e.topics ? truncate(e.topics, 200) : e.notes ? truncate(e.notes, 200) : "";
    rows.push([
      "Letzte Begegnung",
      `${formatDate(e.occurred_on)}, ${encounterLabel(e.kind)}${about ? `. ${about}` : ""}`,
    ]);
  } else if (full) {
    rows.push(["Letzte Begegnung", "Noch keine Begegnung dokumentiert"]);
  }

  const html = layout(
    subject,
    `<p style="margin:0 0 4px;font-size:13px;color:${COLORS.muted};">Kontakt-Erinnerung</p>
<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-family:Georgia,'Times New Roman',serif;font-weight:600;">${escapeHtml(name)}</h1>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5;">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:6px 12px 6px 0;color:${COLORS.muted};vertical-align:top;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:6px 0;vertical-align:top;">${escapeHtml(v)}</td></tr>`,
  )
  .join("\n")}
</table>
<p style="margin:24px 0 8px;">${button(link, "Profil öffnen")}</p>
<p style="margin:0;font-size:13px;color:${COLORS.muted};">Dort kannst du die Erinnerung als erledigt markieren, verschieben oder bearbeiten.</p>`,
    appUrl,
  );

  const text = [
    `Kontakt-Erinnerung: ${name}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `Profil öffnen, erledigen oder verschieben: ${link}`,
    "",
    "Diese E-Mail kommt von deinem Register und enthält nur Angaben, die du dort gespeichert hast.",
  ].join("\n");

  return { subject, html, text };
}

function digestSection(title: string, items: DigestItem[], appUrl: string, date: string, color?: string): string {
  if (items.length === 0) return "";
  return `<h2 style="margin:24px 0 8px;font-size:15px;${color ? `color:${color};` : ""}">${escapeHtml(title)} (${items.length})</h2>
<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.45;">
${items
  .map((it) => {
    const overdueDays = daysBetween(it.reminder.due_date, date);
    const meta = [
      overdueDays > 0 ? `seit ${formatDate(it.reminder.due_date)} fällig` : it.reminder.due_time ? `${formatTime(it.reminder.due_time)} Uhr` : "",
      it.reminder.individual_sent_at ? "Einzel-E-Mail bereits gesendet" : "",
    ]
      .filter(Boolean)
      .join(", ");
    return `<tr><td style="padding:8px 0;border-top:1px solid ${COLORS.line};">
<a href="${escapeHtml(profileUrl(appUrl, it.person.id, it.reminder.id))}" style="color:${COLORS.ink};font-weight:600;text-decoration:none;">${escapeHtml(fullName(it.person))}</a><br>
<span>${escapeHtml(it.reminder.reason)}</span>${meta ? `<br><span style="font-size:12px;color:${COLORS.muted};">${escapeHtml(meta)}</span>` : ""}
</td></tr>`;
  })
  .join("\n")}
</table>`;
}

function digestTextSection(title: string, items: DigestItem[], appUrl: string): string[] {
  if (items.length === 0) return [];
  return [
    `${title} (${items.length})`,
    ...items.map(
      (it) =>
        `* ${fullName(it.person)}: ${it.reminder.reason}${it.reminder.individual_sent_at ? " (Einzel-E-Mail bereits gesendet)" : ""}\n  ${profileUrl(appUrl, it.person.id, it.reminder.id)}`,
    ),
    "",
  ];
}

export function buildDigestEmail(input: DigestEmailInput): EmailPayload {
  const open = input.today.length + input.overdue.length;
  const subject =
    open === 0
      ? `Register: ${input.done.length} erledigte Kontaktaufnahmen`
      : open === 1
        ? "Register: 1 Kontaktaufnahme fällig"
        : `Register: ${open} Kontaktaufnahmen fällig`;

  const html = layout(
    subject,
    `<p style="margin:0 0 4px;font-size:13px;color:${COLORS.muted};">Tägliche Übersicht</p>
<h1 style="margin:0;font-size:22px;line-height:1.3;font-family:Georgia,'Times New Roman',serif;font-weight:600;">${escapeHtml(formatDateLong(input.date))}</h1>
${digestSection("Heute fällig", input.today, input.appUrl, input.date)}
${digestSection("Überfällig", input.overdue, input.appUrl, input.date, COLORS.warn)}
${digestSection("Seit gestern erledigt", input.done, input.appUrl, input.date)}
<p style="margin:24px 0 0;">${button(`${input.appUrl}/erinnerungen`, "Alle Erinnerungen öffnen")}</p>`,
    input.appUrl,
  );

  const text = [
    `Register, tägliche Übersicht für ${formatDateLong(input.date)}`,
    "",
    ...digestTextSection("Heute fällig", input.today, input.appUrl),
    ...digestTextSection("Überfällig", input.overdue, input.appUrl),
    ...digestTextSection("Seit gestern erledigt", input.done, input.appUrl),
    `Alle Erinnerungen: ${input.appUrl}/erinnerungen`,
  ].join("\n");

  return { subject, html, text };
}

export function buildTestEmail(appUrl: string, sentAtLabel: string): EmailPayload {
  const subject = "Register: Test-E-Mail";
  const html = layout(
    subject,
    `<h1 style="margin:0 0 12px;font-size:20px;font-family:Georgia,'Times New Roman',serif;font-weight:600;">Der E-Mail-Versand funktioniert.</h1>
<p style="margin:0;font-size:14px;line-height:1.5;">Ausgelöst am ${escapeHtml(sentAtLabel)}. Erinnerungen und die tägliche Übersicht kommen an diese Adresse.</p>`,
    appUrl,
  );
  const text = `Der E-Mail-Versand funktioniert.\nAusgelöst am ${sentAtLabel}.\n\n${appUrl}`;
  return { subject, html, text };
}

export function buildAlertEmail(appUrl: string, title: string, detail: string): EmailPayload {
  const subject = `Register: ${title}`;
  const html = layout(
    subject,
    `<h1 style="margin:0 0 12px;font-size:20px;color:${COLORS.warn};">${escapeHtml(title)}</h1>
<p style="margin:0;font-size:14px;line-height:1.5;">${escapeHtml(detail)}</p>`,
    appUrl,
  );
  return { subject, html, text: `${title}\n\n${detail}\n\n${appUrl}` };
}
