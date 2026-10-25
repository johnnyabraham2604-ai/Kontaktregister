import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb } from "./db-helpers";
import { pgliteStore } from "./pglite-store";
import { runDispatcher } from "@/lib/reminders/dispatcher";
import type { SendFn, SendInput, SendResult } from "@/lib/reminders/resend";

const U = "11111111-1111-1111-1111-111111111111";
let db: PGlite;
let sent: SendInput[];
let nextResults: SendResult[];

const fakeSend: SendFn = async (input) => {
  const r = nextResults.shift();
  if (r && !r.ok) return r;
  sent.push(input);
  return { ok: true, id: `re_${sent.length}` };
};

async function sql<T = Record<string, unknown>>(s: string, p: unknown[] = []) {
  return (await db.query<T>(s, p)).rows;
}

function run(at: string, source = "pg_cron") {
  return runDispatcher({
    store: pgliteStore(db),
    send: fakeSend,
    appUrl: "https://register.example",
    source,
    now: () => new Date(at),
  });
}

async function outbox() {
  return sql<{ kind: string; status: string; attempts: number; last_error: string | null; idempotency_key: string; next_attempt_at: string }>(
    `select kind, status, attempts, last_error, idempotency_key, next_attempt_at::text from email_outbox order by created_at, idempotency_key`,
  );
}

async function person(first: string, last = "") {
  const [p] = await sql<{ id: string }>(`insert into people (user_id, first_name, last_name) values ($1,$2,$3) returning id`, [U, first, last]);
  return p.id;
}

async function reminder(personId: string, due: string, opts: { time?: string; individual?: boolean; reason?: string } = {}) {
  const [r] = await sql<{ id: string }>(
    `insert into reminders (user_id, person_id, due_date, due_time, reason, email_individual) values ($1,$2,$3,$4,$5,$6) returning id`,
    [U, personId, due, opts.time ?? null, opts.reason ?? "Melden", opts.individual ?? true],
  );
  return r.id;
}

beforeEach(async () => {
  db = await createTestDb();
  sent = [];
  nextResults = [];
  await sql(`insert into auth.users (id) values ($1)`, [U]);
  await sql(`insert into settings (user_id, recipient_email, digest_enabled, digest_time, default_reminder_time) values ($1, 'ich@example.org', false, '07:30', '09:00')`, [U]);
});

describe("Einzel-Erinnerungen", () => {
  it("sendet zum Termin genau einmal, auch bei wiederholten und parallelen Läufen", async () => {
    await sql(`update settings set digest_enabled = true`);
    const p = await person("Max", "Müller");
    await sql(`insert into encounters (user_id, person_id, kind, occurred_on, topics) values ($1,$2,'call','2026-10-01','Projekt Falke')`, [U, p]);
    await reminder(p, "2026-11-02", { reason: "Paper schicken" });

    await run("2026-11-02T07:55:00Z");
    expect(sent.filter((m) => m.idempotencyKey.startsWith("ind:"))).toHaveLength(0);

    await Promise.all([run("2026-11-02T08:05:00Z"), run("2026-11-02T08:05:30Z", "vercel")]);
    await run("2026-11-02T08:15:00Z");
    await run("2026-11-03T08:15:00Z");

    const individual = sent.filter((m) => m.idempotencyKey.startsWith("ind:"));
    expect(individual).toHaveLength(1);
    expect(individual[0].subject).toBe("Kontaktaufnahme mit Max Müller");
    expect(individual[0].text).toContain("Paper schicken");
    expect(individual[0].text).toContain("Projekt Falke");
    expect(individual[0].to).toBe("ich@example.org");
    // Sammel-E-Mails: genau eine pro Tag (2.11. und 3.11.), die Einzel-E-Mail ist am Folgetag gekennzeichnet
    const digests = sent.filter((m) => m.idempotencyKey.startsWith("dig:"));
    expect(digests.map((d) => d.idempotencyKey)).toEqual([`dig:${U}:2026-11-02`, `dig:${U}:2026-11-03`]);
    expect(digests[1].text).toContain("Einzel-E-Mail bereits gesendet");
    const [r] = await sql<{ individual_sent_at: string | null }>(`select individual_sent_at from reminders`);
    expect(r.individual_sent_at).not.toBeNull();
  });

  it("respektiert Verschieben, Erledigen und Papierkorb zwischen Einplanung und Versand", async () => {
    const a = await person("Anna");
    const b = await person("Ben");
    const c = await person("Cleo");
    const ra = await reminder(a, "2026-11-02");
    const rb = await reminder(b, "2026-11-02");
    await reminder(c, "2026-11-02");

    // Aufträge entstehen, Versand schlägt vorübergehend fehl, damit sie offen bleiben
    nextResults = [
      { ok: false, status: 503, message: "down" },
      { ok: false, status: 503, message: "down" },
      { ok: false, status: 503, message: "down" },
    ];
    await run("2026-11-02T08:05:00Z");
    expect(sent).toHaveLength(0);

    await sql(`update reminders set due_date = '2026-11-09' where id = $1`, [ra]);
    await sql(`update reminders set status = 'done', completed_at = now() where id = $1`, [rb]);
    await sql(`update people set deleted_at = now() where id = $1`, [c]);

    await run("2026-11-02T08:30:00Z");
    expect(sent).toHaveLength(0);
    const rows = await outbox();
    expect(rows.map((r) => r.last_error).sort()).toEqual([
      "Erinnerung ist bereits erledigt",
      "Person liegt im Papierkorb",
      "Termin wurde verschoben",
    ]);
    expect(rows.every((r) => r.status === "skipped")).toBe(true);

    // Der verschobene Termin wird zum neuen Zeitpunkt versendet
    await run("2026-11-09T08:01:00Z");
    expect(sent.map((m) => m.subject)).toEqual(["Kontaktaufnahme mit Anna"]);
  });

  it("versendet keine Einzel-E-Mail für Termine, die schon lange vorbei sind", async () => {
    const p = await person("Alt");
    await reminder(p, "2026-10-01");
    await run("2026-11-02T06:00:00Z");
    expect(sent.filter((m) => m.idempotencyKey.startsWith("ind:"))).toHaveLength(0);
  });

  it("sendet bei Vorlauf entsprechend früher", async () => {
    await sql(`update settings set individual_lead_days = 2`);
    const p = await person("Vorlauf");
    await reminder(p, "2026-11-04", { time: "14:00" });
    await run("2026-11-02T12:59:00Z");
    expect(sent).toHaveLength(0);
    await run("2026-11-02T13:01:00Z");
    expect(sent).toHaveLength(1);
  });
});

describe("Sammel-E-Mail", () => {
  beforeEach(async () => {
    await sql(`update settings set digest_enabled = true`);
  });

  it("fasst heute fällige und überfällige Erinnerungen zusammen, einmal pro Tag", async () => {
    const a = await person("Anna", "Heute");
    const b = await person("Ben", "Überfällig");
    const c = await person("Cleo", "Später");
    await reminder(a, "2026-11-02", { individual: false, reason: "Glückwunsch" });
    const rb = await reminder(b, "2026-10-28", { individual: false, reason: "Antwort schuldig" });
    await reminder(c, "2026-11-20", { individual: false });
    await sql(`update reminders set individual_sent_at = now() where id = $1`, [rb]);

    await run("2026-11-02T06:29:00Z"); // 07:29 Ortszeit
    expect(sent).toHaveLength(0);
    await run("2026-11-02T06:31:00Z");
    await run("2026-11-02T06:41:00Z");
    await run("2026-11-02T12:00:00Z", "vercel");

    expect(sent).toHaveLength(1);
    const mail = sent[0];
    expect(mail.subject).toBe("Register: 2 Kontaktaufnahmen fällig");
    expect(mail.text).toContain("Heute fällig (1)");
    expect(mail.text).toContain("Überfällig (1)");
    expect(mail.text).toContain("Antwort schuldig (Einzel-E-Mail bereits gesendet)");
    expect(mail.text).not.toContain("Cleo");
  });

  it("lässt überfällige Erinnerungen weg, wenn so eingestellt, und überspringt leere Tage", async () => {
    await sql(`update settings set digest_include_overdue = false`);
    const b = await person("Ben");
    await reminder(b, "2026-10-28", { individual: false });
    await run("2026-11-02T07:00:00Z");
    expect(sent).toHaveLength(0);
    const [row] = await outbox();
    expect(row.status).toBe("skipped");
    expect(row.last_error).toBe("Nichts fällig");
  });

  it("zeigt optional seit gestern erledigte Erinnerungen", async () => {
    await sql(`update settings set digest_include_done = true`);
    const a = await person("Anna");
    const r = await reminder(a, "2026-11-01", { individual: false, reason: "Dankeschön" });
    await sql(`update reminders set status='done', completed_at = '2026-11-01T18:00:00Z' where id = $1`, [r]);
    await run("2026-11-02T07:00:00Z");
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("Seit gestern erledigt (1)");
  });

  it("verschickt die Sammel-E-Mail am Tag der Zeitumstellung zur richtigen Ortszeit", async () => {
    const a = await person("Anna");
    await reminder(a, "2026-10-25", { individual: false });
    await run("2026-10-25T05:35:00Z"); // 06:35 MEZ, noch zu früh
    expect(sent).toHaveLength(0);
    await run("2026-10-25T06:31:00Z"); // 07:31 MEZ
    expect(sent).toHaveLength(1);
  });
});

describe("Fehler und Wiederholungen", () => {
  it("wiederholt vorübergehende Fehler mit demselben Schlüssel und Inhalt", async () => {
    const p = await person("Retry");
    await reminder(p, "2026-11-02");
    nextResults = [{ ok: false, status: 500, message: "boom" }];
    await run("2026-11-02T08:01:00Z");
    let [row] = await outbox();
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.last_error).toMatch(/Serverfehler 500/);
    const stored = await sql<{ payload: { subject: string } }>(`select payload from email_outbox`);
    expect(stored[0].payload.subject).toBe("Kontaktaufnahme mit Retry");

    await run("2026-11-02T08:03:00Z"); // noch in der Wartezeit
    expect(sent).toHaveLength(0);
    await run("2026-11-02T08:07:00Z");
    expect(sent).toHaveLength(1);
    [row] = await outbox();
    expect(row.status).toBe("sent");
    expect(sent[0].idempotencyKey).toBe(row.idempotency_key);
    const after = await sql<{ payload: unknown }>(`select payload from email_outbox`);
    expect(after[0].payload).toBeNull();
  });

  it("bricht bei Konfigurationsfehlern sofort ab und macht den Fehler sichtbar", async () => {
    const p = await person("Forbidden");
    await reminder(p, "2026-11-02");
    nextResults = [{ ok: false, status: 403, message: "You can only send testing emails to your own email address" }];
    await run("2026-11-02T08:01:00Z");
    const [row] = await outbox();
    expect(row.status).toBe("failed");
    expect(row.last_error).toMatch(/Resend-Kontos/);
    const [runRow] = await sql<{ failed: number }>(`select failed from scheduler_runs order by id desc limit 1`);
    expect(runRow.failed).toBe(1);
  });

  it("gibt nach fünf Versuchen auf", async () => {
    const p = await person("Dauerfehler");
    await reminder(p, "2026-11-02");
    nextResults = Array.from({ length: 10 }, () => ({ ok: false as const, status: 503, message: "down" }));
    const times = ["08:01", "08:07", "08:23", "09:24", "12:25", "15:30"];
    for (const t of times) await run(`2026-11-02T${t}:00Z`);
    const [row] = await outbox();
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(5);
    expect(sent).toHaveLength(0);
  });

  it("meldet fehlende Empfängeradresse als Fehler statt still zu scheitern", async () => {
    await sql(`update settings set recipient_email = null`);
    const p = await person("Niemand");
    await reminder(p, "2026-11-02");
    await run("2026-11-02T08:01:00Z");
    const [row] = await outbox();
    expect(row.status).toBe("failed");
    expect(row.last_error).toMatch(/Empfängeradresse/);
  });
});

describe("Betrieb", () => {
  it("protokolliert jeden Lauf und leert den Papierkorb nach 30 Tagen", async () => {
    const p = await person("Alt");
    const q = await person("Neu");
    await sql(`update people set deleted_at = '2026-09-01T00:00:00Z' where id = $1`, [p]);
    await sql(`update people set deleted_at = '2026-10-30T00:00:00Z' where id = $1`, [q]);
    const res = await run("2026-11-02T08:00:00Z");
    expect(res.error).toBeNull();
    const left = await sql<{ first_name: string }>(`select first_name from people`);
    expect(left.map((x) => x.first_name)).toEqual(["Neu"]);
    const runs = await sql<{ source: string; finished_at: string | null }>(`select source, finished_at from scheduler_runs`);
    expect(runs).toHaveLength(1);
    expect(runs[0].finished_at).not.toBeNull();
  });
});
