import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, asUser } from "./db-helpers";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
let db: PGlite;

async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}');`);
});

describe("Schema und Row Level Security", () => {
  it("legt Personen mit Unicode-Namen an und berechnet den Suchtext", async () => {
    await asUser(db, A, async () => {
      await q(`insert into people (first_name, last_name, city, country, company, occupation, met_country, met_on, about)
               values ('Wěi', '李', 'Shanghai', 'China', 'NIO', 'Ingenieur Batteriesysteme', 'China', '2025-04-02', 'Interessiert an Robotik'),
                      ('Selam', 'ሰላም', 'Asmara', 'Eritrea', null, null, 'Deutschland', '2024-01-10', null),
                      ('Max', 'Müller', 'Stuttgart', 'Deutschland', 'Mercedes-Benz', 'Entwickler', 'Deutschland', '2026-10-01', 'Projekt Falke besprochen')`);
      const rows = await q<{ first_name: string; search_text: string }>(`select first_name, search_text from people order by first_name`);
      expect(rows).toHaveLength(3);
      expect(rows.find((r) => r.first_name === "Wěi")!.search_text).toContain("李");
      expect(rows.find((r) => r.first_name === "Max")!.search_text).toContain("müller");
    });
  });

  it("verbietet leere Vornamen", async () => {
    await asUser(db, A, async () => {
      await expect(q(`insert into people (first_name) values ('   ')`)).rejects.toThrow();
    });
  });

  it("isoliert Daten zwischen Nutzern", async () => {
    const seenByB = await asUser(db, B, () => q(`select id from people`));
    expect(seenByB).toHaveLength(0);
    const seenAnon = await asUser(db, null, async () => {
      try {
        return await q(`select id from people`);
      } catch (e) {
        return String(e);
      }
    });
    expect(String(seenAnon)).toMatch(/permission denied/);
  });

  it("verhindert, dass Nutzer B Daten von A referenziert", async () => {
    const [p] = await asUser(db, A, () => q<{ id: string }>(`select id from people where first_name = 'Max'`));
    await asUser(db, B, async () => {
      await expect(q(`insert into reminders (person_id, due_date, reason) values ($1, current_date, 'x')`, [p.id])).rejects.toThrow(/row-level security/);
      await expect(q(`insert into encounters (person_id, notes) values ($1, 'x')`, [p.id])).rejects.toThrow(/row-level security/);
      const updated = await q(`update people set first_name = 'Hacked' where id = $1 returning id`, [p.id]);
      expect(updated).toHaveLength(0);
    });
  });

  it("verbietet Clients das Schreiben in die Outbox", async () => {
    await asUser(db, A, async () => {
      await expect(q(`insert into email_outbox (user_id, kind, idempotency_key) values ($1, 'test', 'x')`, [A])).rejects.toThrow();
      await expect(q(`select * from claim_outbox(10)`)).rejects.toThrow(/permission denied/);
    });
  });
});

describe("search_people", () => {
  let ids: Record<string, string> = {};
  beforeAll(async () => {
    await asUser(db, A, async () => {
      const people = await q<{ id: string; first_name: string }>(`select id, first_name from people`);
      ids = Object.fromEntries(people.map((p) => [p.first_name, p.id]));
      const [cat] = await q<{ id: string }>(`insert into categories (name) values ('Reisen') returning id`);
      const [cat2] = await q<{ id: string }>(`insert into categories (name) values ('Arbeit und Karriere') returning id`);
      const [ki] = await q<{ id: string }>(`insert into tags (name, kind) values ('Technologie', 'interest') returning id`);
      const [auto] = await q<{ id: string }>(`insert into tags (name, kind) values ('Automotive', 'tag') returning id`);
      await q(`insert into person_categories (person_id, category_id) values ($1, $2), ($3, $2), ($3, $4)`, [ids["Wěi"], cat.id, ids["Max"], cat2.id]);
      await q(`insert into person_tags (person_id, tag_id) values ($1, $2), ($1, $3), ($4, $3)`, [ids["Wěi"], ki.id, auto.id, ids["Max"]]);
      await q(`insert into encounters (person_id, kind, occurred_on, notes, topics) values ($1, 'meeting', '2026-10-20', 'Über Batteriealterung gesprochen', 'PIML'),
               ($1, 'note', '2026-10-22', 'Nur eine Notiz', null)`, [ids["Wěi"]]);
      await q(`insert into reminders (person_id, due_date, reason) values ($1, '2026-10-20', 'Paper schicken'), ($2, '2026-10-25', 'Anrufen'), ($3, '2026-11-30', 'Treffen')`,
        [ids["Wěi"], ids["Max"], ids["Selam"]]);
    });
  });

  const run = (args: string) =>
    asUser(db, A, () => q<{ first_name: string; total_count: number; last_contact_on: string | null; next_due_date: string | null }>(
      `select * from search_people(p_today => '2026-10-25'::date ${args ? ", " + args : ""})`));

  it("findet Teilnamen und Unicode", async () => {
    expect((await run(`p_q => 'mül'`)).map((r) => r.first_name)).toEqual(["Max"]);
    expect((await run(`p_q => '李'`)).map((r) => r.first_name)).toEqual(["Wěi"]);
    expect((await run(`p_q => 'ሰላም'`)).map((r) => r.first_name)).toEqual(["Selam"]);
  });

  it("durchsucht Begegnungen (Mit wem habe ich über X gesprochen?)", async () => {
    expect((await run(`p_q => 'batteriealterung'`)).map((r) => r.first_name)).toEqual(["Wěi"]);
    expect((await run(`p_q => 'falke'`)).map((r) => r.first_name)).toEqual(["Max"]);
  });

  it("kombiniert Filter (Land des Kennenlernens + Interesse + Tag)", async () => {
    const tagIds = await asUser(db, A, () => q<{ id: string }>(`select id from tags order by name`));
    const res = await run(`p_met_country => 'china', p_tag_ids => array['${tagIds.map((t) => t.id).join("','")}']::uuid[]`);
    expect(res.map((r) => r.first_name)).toEqual(["Wěi"]);
    const none = await run(`p_met_country => 'deutschland', p_tag_ids => array['${tagIds.map((t) => t.id).join("','")}']::uuid[]`);
    expect(none).toHaveLength(0);
  });

  it("filtert Kategorien mit UND-Verknüpfung", async () => {
    const cats = await asUser(db, A, () => q<{ id: string }>(`select id from categories`));
    const both = await run(`p_category_ids => array['${cats.map((c) => c.id).join("','")}']::uuid[]`);
    expect(both.map((r) => r.first_name)).toEqual(["Max"]);
  });

  it("filtert nach Erinnerungsstatus und berechnet letzten Kontakt ohne Notizen", async () => {
    expect((await run(`p_reminder => 'overdue'`)).map((r) => r.first_name)).toEqual(["Wěi"]);
    expect((await run(`p_reminder => 'today'`)).map((r) => r.first_name)).toEqual(["Max"]);
    expect((await run(`p_reminder => 'upcoming'`)).map((r) => r.first_name)).toEqual(["Selam"]);
    const [wei] = await asUser(db, A, () => q<{ d: string }>(`select last_contact_on::text as d from search_people(p_today => '2026-10-25'::date, p_q => 'wěi')`));
    expect(wei.d).toBe("2026-10-20");
  });

  it("filtert Kennenlern-Zeitraum, sortiert und zählt", async () => {
    const res = await run(`p_met_from => '2025-01-01', p_met_to => '2026-12-31', p_sort => 'met'`);
    expect(res.map((r) => r.first_name)).toEqual(["Max", "Wěi"]);
    expect(Number(res[0].total_count)).toBe(2);
    const paged = await run(`p_limit => 1, p_offset => 1`);
    expect(paged).toHaveLength(1);
    expect(Number(paged[0].total_count)).toBe(3);
  });

  it("blendet Papierkorb aus und zeigt ihn separat", async () => {
    await asUser(db, A, () => q(`update people set deleted_at = now() where first_name = 'Selam'`));
    expect((await run(``)).map((r) => r.first_name)).not.toContain("Selam");
    expect((await run(`p_deleted => true`)).map((r) => r.first_name)).toEqual(["Selam"]);
  });

  it("liefert für andere Nutzer nichts", async () => {
    const res = await asUser(db, B, () => q(`select * from search_people(p_today => '2026-10-25'::date)`));
    expect(res).toHaveLength(0);
  });
});

describe("Outbox und Idempotenz", () => {
  it("lässt jeden Idempotenzschlüssel nur einmal zu", async () => {
    await db.exec("set role service_role");
    await q(`insert into email_outbox (user_id, kind, idempotency_key) values ($1, 'digest', 'dig:a:2026-10-25') on conflict (idempotency_key) do nothing`, [A]);
    await q(`insert into email_outbox (user_id, kind, idempotency_key) values ($1, 'digest', 'dig:a:2026-10-25') on conflict (idempotency_key) do nothing`, [A]);
    const rows = await q(`select * from email_outbox where idempotency_key = 'dig:a:2026-10-25'`);
    expect(rows).toHaveLength(1);
    await db.exec("reset role");
  });

  it("claim_outbox reserviert einen Auftrag genau einmal und holt hängengebliebene zurück", async () => {
    await db.exec("set role service_role");
    const first = await q<{ id: string; attempts: number }>(`select * from claim_outbox(10)`);
    expect(first).toHaveLength(1);
    expect(first[0].attempts).toBe(1);
    const second = await q(`select * from claim_outbox(10)`);
    expect(second).toHaveLength(0);
    await q(`update email_outbox set locked_at = now() - interval '20 minutes'`);
    const reclaimed = await q<{ attempts: number }>(`select * from claim_outbox(10)`);
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0].attempts).toBe(2);
    await q(`update email_outbox set status = 'failed', locked_at = null`);
    await db.exec("reset role");
  });

  it("retry_email plant nur eigene fehlgeschlagene Sendungen neu ein", async () => {
    const [row] = await q<{ id: string }>(`select id from email_outbox limit 1`);
    await asUser(db, B, () => q(`select retry_email($1)`, [row.id]));
    expect((await q<{ status: string }>(`select status from email_outbox`))[0].status).toBe("failed");
    await asUser(db, A, () => q(`select retry_email($1)`, [row.id]));
    const [after] = await q<{ status: string; attempts: number }>(`select status, attempts from email_outbox`);
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(0);
  });

  it("Personen löschen entfernt abhängige Daten vollständig", async () => {
    await asUser(db, A, async () => {
      await q(`delete from people where first_name = 'Wěi'`);
      const left = await q(`select 1 from encounters union all select 1 from reminders r join people p on p.id = r.person_id where p.first_name = 'Wěi'`);
      expect(left).toHaveLength(0);
    });
  });
});
