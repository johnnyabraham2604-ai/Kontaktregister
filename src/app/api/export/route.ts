import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { encounterLabel, LINK_KINDS } from "@/lib/labels";
import type { EncounterKind } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Liest eine Tabelle vollständig, auch über das PostgREST-Limit von 1000 Zeilen hinaus. */
async function fetchAll(supabase: SupabaseClient, table: string, select = "*", order = "created_at") {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (order) q = q.order(order);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const TABLES: [string, string][] = [
  ["people", "created_at"],
  ["categories", "created_at"],
  ["tags", "created_at"],
  ["person_categories", "person_id"],
  ["person_tags", "person_id"],
  ["encounters", "created_at"],
  ["encounter_tags", "encounter_id"],
  ["reminders", "created_at"],
  ["person_links", "created_at"],
  ["field_definitions", "created_at"],
  ["settings", ""],
];

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const typ = new URL(request.url).searchParams.get("typ") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);
  const file = (name: string, body: string, type: string) =>
    new NextResponse(body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });

  try {
    if (typ === "json") {
      const tables: Record<string, Record<string, unknown>[]> = {};
      for (const [t, order] of TABLES) {
        const rows = await fetchAll(supabase, t, "*", order);
        tables[t] = rows.map((r) => {
          const { user_id: _u, search_text: _s, ...rest } = r;
          void _u;
          void _s;
          return rest;
        });
      }
      const body = JSON.stringify(
        { format: "register-export", version: 1, exported_at: new Date().toISOString(), tables },
        null,
        2,
      );
      return file(`register-export-${stamp}.json`, body, "application/json; charset=utf-8");
    }

    const [cats, tags] = await Promise.all([fetchAll(supabase, "categories"), fetchAll(supabase, "tags")]);
    const name = new Map<string, string>([...cats, ...tags].map((x) => [String(x.id), String(x.name)]));
    const tagKind = new Map(tags.map((t) => [String(t.id), String(t.kind)]));

    if (typ === "personen") {
      const [people, pc, pt, defs] = await Promise.all([
        fetchAll(supabase, "people", "*", "created_at"),
        fetchAll(supabase, "person_categories", "*", "person_id"),
        fetchAll(supabase, "person_tags", "*", "person_id"),
        fetchAll(supabase, "field_definitions"),
      ]);
      const by = (rows: Record<string, unknown>[], key: string) => {
        const m = new Map<string, string[]>();
        for (const r of rows) m.set(String(r.person_id), [...(m.get(String(r.person_id)) ?? []), String(r[key])]);
        return m;
      };
      const catsOf = by(pc, "category_id");
      const tagsOf = by(pt, "tag_id");
      const rows = people
        .filter((p) => !p.deleted_at)
        .map((p) => {
          const t = tagsOf.get(String(p.id)) ?? [];
          const custom = (p.custom_fields ?? {}) as Record<string, string>;
          return {
            ...p,
            categories: (catsOf.get(String(p.id)) ?? []).map((id) => name.get(id)).join(", "),
            tags: t.filter((id) => tagKind.get(id) === "tag").map((id) => name.get(id)).join(", "),
            interests: t.filter((id) => tagKind.get(id) === "interest").map((id) => name.get(id)).join(", "),
            ...Object.fromEntries(defs.map((d) => [`cf_${d.key}`, custom[String(d.key)] ?? ""])),
          };
        });
      const columns = [
        ["id", "ID"], ["first_name", "Vorname"], ["last_name", "Nachname"], ["nickname", "Spitzname"], ["email", "E-Mail"],
        ["phone", "Telefon"], ["occupation", "Beruf / Position"], ["company", "Unternehmen"], ["organization", "Universität / Organisation"],
        ["city", "Wohnort"], ["country", "Land"], ["origin_country", "Herkunftsland"], ["languages", "Sprachen"], ["links", "Links"],
        ["met_on", "Kennengelernt am"], ["met_country", "Land des Kennenlernens"], ["met_place", "Ort / Veranstaltung"], ["met_context", "Kontext"],
        ["categories", "Kategorien"], ["tags", "Tags"], ["interests", "Interessen"], ["about", "Notizen"], ["goals", "Ziele und Projekte"],
        ["open_items", "Offene Punkte"], ...defs.map((d) => [`cf_${d.key}`, String(d.label)]), ["created_at", "Angelegt"], ["updated_at", "Geändert"],
      ].map(([key, label]) => ({ key, label }));
      return file(`register-personen-${stamp}.csv`, toCsv(rows, columns), "text/csv; charset=utf-8");
    }

    const people = await fetchAll(supabase, "people", "id, first_name, last_name", "created_at");
    const personName = new Map(people.map((p) => [String(p.id), `${p.first_name} ${p.last_name}`.trim()]));

    if (typ === "begegnungen") {
      const [enc, et] = await Promise.all([fetchAll(supabase, "encounters", "*", "occurred_on"), fetchAll(supabase, "encounter_tags", "*", "encounter_id")]);
      const tagsOf = new Map<string, string[]>();
      for (const r of et) tagsOf.set(String(r.encounter_id), [...(tagsOf.get(String(r.encounter_id)) ?? []), name.get(String(r.tag_id)) ?? ""]);
      const rows = enc.map((e) => ({
        ...e,
        person: personName.get(String(e.person_id)),
        kind_label: encounterLabel(e.kind as EncounterKind),
        tags: (tagsOf.get(String(e.id)) ?? []).join(", "),
      }));
      const columns = [
        ["person", "Person"], ["person_id", "Personen-ID"], ["occurred_on", "Datum"], ["occurred_time", "Uhrzeit"], ["kind_label", "Art"],
        ["location", "Ort"], ["topics", "Themen"], ["notes", "Notizen"], ["agreements", "Vereinbarungen"], ["tags", "Tags"],
      ].map(([key, label]) => ({ key, label }));
      return file(`register-begegnungen-${stamp}.csv`, toCsv(rows, columns), "text/csv; charset=utf-8");
    }

    if (typ === "erinnerungen") {
      const rems = await fetchAll(supabase, "reminders", "*", "due_date");
      const status: Record<string, string> = { planned: "Geplant", done: "Erledigt", cancelled: "Abgebrochen" };
      const rows = rems.map((r) => ({ ...r, person: personName.get(String(r.person_id)), status_label: status[String(r.status)], email: r.email_individual ? "ja" : "nein" }));
      const columns = [
        ["person", "Person"], ["person_id", "Personen-ID"], ["due_date", "Fällig am"], ["due_time", "Uhrzeit"], ["reason", "Anlass"],
        ["note", "Notiz"], ["status_label", "Status"], ["email", "Einzel-E-Mail"], ["individual_sent_at", "Einzel-E-Mail gesendet"], ["completed_at", "Erledigt am"],
      ].map(([key, label]) => ({ key, label }));
      return file(`register-erinnerungen-${stamp}.csv`, toCsv(rows, columns), "text/csv; charset=utf-8");
    }

    if (typ === "ordnung") {
      const rows = [
        ...cats.map((c) => ({ type: "Kategorie", name: c.name, archived: c.archived_at ? "ja" : "nein" })),
        ...tags.map((t) => ({ type: t.kind === "interest" ? "Interesse" : "Tag", name: t.name, archived: t.archived_at ? "ja" : "nein" })),
      ];
      const columns = [
        { key: "type", label: "Typ" },
        { key: "name", label: "Name" },
        { key: "archived", label: "Archiviert" },
      ];
      return file(`register-kategorien-tags-${stamp}.csv`, toCsv(rows, columns), "text/csv; charset=utf-8");
    }

    if (typ === "verbindungen") {
      const links = await fetchAll(supabase, "person_links");
      const rows = links.map((l) => ({
        ...l,
        a: personName.get(String(l.person_a)),
        b: personName.get(String(l.person_b)),
        kind_label: LINK_KINDS.find((k) => k.value === l.kind)?.label,
      }));
      const columns = [
        ["a", "Person A"], ["kind_label", "Verbindung"], ["b", "Person B"], ["description", "Beschreibung"], ["note", "Notiz"],
      ].map(([key, label]) => ({ key, label }));
      return file(`register-verbindungen-${stamp}.csv`, toCsv(rows, columns), "text/csv; charset=utf-8");
    }

    return NextResponse.json({ error: "unknown_type" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "export_failed" }, { status: 500 });
  }
}
