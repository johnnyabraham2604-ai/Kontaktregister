import type { Metadata } from "next";
import Link from "next/link";
import { getToday, photoUrls, requireUser } from "@/lib/data";
import { formatDate, formatTime } from "@/lib/dates";
import { ENCOUNTER_KINDS, encounterLabel, fullName } from "@/lib/labels";
import type { Encounter } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { AutoSubmitForm } from "@/components/client";
import { EmptyState, Input, LinkButton, PageHeader, Panel, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Verlauf" };

const PAGE = 50;
const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  await getToday();
  const q = (sp.q ?? "").trim().toLowerCase();
  const art = ENCOUNTER_KINDS.some((k) => k.value === sp.art) ? sp.art! : "";
  const von = /^\d{4}-\d{2}-\d{2}$/.test(sp.von ?? "") ? sp.von! : "";
  const bis = /^\d{4}-\d{2}-\d{2}$/.test(sp.bis ?? "") ? sp.bis! : "";
  const page = Math.max(1, Number(sp.seite) || 1);

  let query = supabase
    .from("encounters")
    .select("*, person:people!inner(id, first_name, last_name, photo_path, deleted_at)", { count: "exact" })
    .is("person.deleted_at", null)
    .order("occurred_on", { ascending: false })
    .order("occurred_time", { ascending: false, nullsFirst: false })
    .limit(PAGE * page);
  if (art) query = query.eq("kind", art);
  if (von) query = query.gte("occurred_on", von);
  if (bis) query = query.lte("occurred_on", bis);
  // search_text ist bereits kleingeschrieben; Sonderzeichen für ilike werden maskiert
  if (q) query = query.ilike("search_text", `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  const { data, count } = await query;

  type Row = Encounter & { person: { id: string; first_name: string; last_name: string; photo_path: string | null } };
  const rows = (data ?? []) as Row[];
  const photos = await photoUrls(rows.map((r) => r.person.photo_path));
  const months: { label: string; items: Row[] }[] = [];
  for (const r of rows) {
    const label = monthFmt.format(new Date(`${r.occurred_on.slice(0, 7)}-01T00:00:00Z`));
    const last = months[months.length - 1];
    if (last?.label === label) last.items.push(r);
    else months.push({ label, items: [r] });
  }
  const more = (count ?? 0) > rows.length;
  const nextParams = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  nextParams.set("seite", String(page + 1));

  return (
    <>
      <PageHeader title="Verlauf" description="Alle Begegnungen und Notizen, die neuesten zuerst." />
      <AutoSubmitForm action="/verlauf" className="mb-5 flex flex-wrap gap-2">
        <Input name="q" type="search" defaultValue={sp.q ?? ""} placeholder="In Notizen, Themen und Orten suchen" className="h-9 min-w-56 flex-1" aria-label="Verlauf durchsuchen" />
        <Select name="art" defaultValue={art} className="h-9 w-auto" aria-label="Art">
          <option value="">Alle Arten</option>
          {ENCOUNTER_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        <Input name="von" type="date" defaultValue={von} className="h-9 w-auto" aria-label="Von" />
        <Input name="bis" type="date" defaultValue={bis} className="h-9 w-auto" aria-label="Bis" />
      </AutoSubmitForm>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState title={q || art || von || bis ? "Keine Einträge für diese Suche." : "Noch keine Begegnungen festgehalten."}>
            {q || art || von || bis ? null : "Öffne eine Person und wähle „Begegnung festhalten“."}
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-8">
          {months.map((m) => (
            <section key={m.label}>
              <h2 className="mb-2 px-1 font-serif text-xl font-semibold">{m.label}</h2>
              <Panel>
                <ul className="divide-y divide-line">
                  {m.items.map((e) => (
                    <li key={e.id}>
                      <Link href={`/personen/${e.person.id}`} className="flex gap-3 px-4 py-3 hover:bg-paper">
                        <Avatar person={e.person} url={photos.get(e.person.photo_path ?? "")} size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px]">
                            <span className="font-semibold">{fullName(e.person)}</span>
                            <span className="text-muted">
                              {" "}
                              {formatDate(e.occurred_on)}
                              {e.occurred_time ? `, ${formatTime(e.occurred_time)}` : ""}. {encounterLabel(e.kind)}
                              {e.location ? `, ${e.location}` : ""}
                            </span>
                          </p>
                          {e.topics ? <p className="mt-0.5 text-[15px] font-medium">{e.topics}</p> : null}
                          {e.notes ? <p className="mt-0.5 line-clamp-2 text-[14px] text-muted">{e.notes}</p> : null}
                          {e.agreements ? <p className="mt-1 line-clamp-1 text-[13px] text-amber">Vereinbart: {e.agreements}</p> : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            </section>
          ))}
          {more ? (
            <div className="flex justify-center">
              <LinkButton href={`/verlauf?${nextParams.toString()}`} scroll={false}>
                Ältere Einträge anzeigen
              </LinkButton>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
