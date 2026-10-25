import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { getTaxonomy, getToday, photoUrls, requireUser } from "@/lib/data";
import { formatDate, relativeDay } from "@/lib/dates";
import { fullName } from "@/lib/labels";
import { countryNames } from "@/lib/countries";
import type { PersonListRow } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { AutoSubmitForm } from "@/components/client";
import { DueBadge } from "@/components/reminder-item";
import { EmptyState, Input, LinkButton, Notice, PageHeader, Panel, Select, buttonClass, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Personen" };

const PAGE_SIZE = 200;

type SP = Record<string, string | string[] | undefined>;

const arr = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const STATUS: Record<string, string> = {
  overdue: "Überfällig",
  today: "Heute fällig",
  upcoming: "Termin geplant",
  open: "Irgendein offener Termin",
  none: "Kein Termin geplant",
};

const SORTS: Record<string, string> = {
  name: "Name",
  relevance: "Beste Treffer",
  created: "Zuletzt angelegt",
  updated: "Zuletzt bearbeitet",
  last_contact: "Letzte Begegnung",
  next_contact: "Nächster Kontakttermin",
  met: "Kennengelernt",
};

function letterOf(p: { first_name: string; last_name: string }): string {
  const base = (p.last_name || p.first_name).trim();
  const ch = base.normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const [taxonomy, today] = await Promise.all([getTaxonomy(), getToday()]);

  const q = one(sp.q).trim();
  const kat = arr(sp.kat);
  const tag = arr(sp.tag);
  const int = arr(sp.int);
  const land = one(sp.land);
  const herkunft = one(sp.herkunft);
  const kland = one(sp.kland);
  const ort = one(sp.ort);
  const firma = one(sp.firma);
  const beruf = one(sp.beruf);
  const von = one(sp.von);
  const bis = one(sp.bis);
  const status = one(sp.status);
  const sort = SORTS[one(sp.sort)] ? one(sp.sort) : q ? "relevance" : "name";
  const page = Math.max(1, Number(one(sp.seite)) || 1);

  const [{ data, error }, { data: values }] = await Promise.all([
    supabase.rpc("search_people", {
      p_today: today,
      p_q: q || null,
      p_category_ids: kat.length ? kat : null,
      p_tag_ids: [...tag, ...int].length ? [...tag, ...int] : null,
      p_country: land || null,
      p_origin_country: herkunft || null,
      p_met_country: kland || null,
      p_city: ort || null,
      p_company: firma || null,
      p_occupation: beruf || null,
      p_met_from: /^\d{4}-\d{2}-\d{2}$/.test(von) ? von : null,
      p_met_to: /^\d{4}-\d{2}-\d{2}$/.test(bis) ? bis : null,
      p_reminder: STATUS[status] ? status : null,
      p_sort: sort,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.rpc("filter_values"),
  ]);

  const rows = (data ?? []) as PersonListRow[];
  const total = rows[0]?.total_count ?? 0;
  const photos = await photoUrls(rows.map((r) => r.photo_path));
  const fv = (values ?? {}) as Record<string, string[]>;
  const countries = Array.from(new Set([...(fv.countries ?? []), ...(fv.met_countries ?? []), ...(fv.origin_countries ?? []), ...countryNames()]));

  // Aktive Filter als entfernbare Chips
  const current = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of arr(v)) if (k !== "seite") current.append(k, x);
  const without = (key: string, value?: string) => {
    const next = new URLSearchParams();
    current.forEach((v, k) => {
      if (k === key && (value === undefined || v === value)) return;
      next.append(k, v);
    });
    const s = next.toString();
    return s ? `/personen?${s}` : "/personen";
  };
  const name = (id: string) => taxonomy.byId.get(id)?.name ?? "Unbekannt";
  const pageHref = (n: number) => {
    const next = new URLSearchParams(current);
    if (n > 1) next.set("seite", String(n));
    const s = next.toString();
    return s ? `/personen?${s}` : "/personen";
  };
  const chips: { label: string; href: string }[] = [
    ...(q ? [{ label: `Suche: ${q}`, href: without("q") }] : []),
    ...kat.map((id) => ({ label: `Kategorie: ${name(id)}`, href: without("kat", id) })),
    ...tag.map((id) => ({ label: `Tag: ${name(id)}`, href: without("tag", id) })),
    ...int.map((id) => ({ label: `Interesse: ${name(id)}`, href: without("int", id) })),
    ...(land ? [{ label: `Wohnt in: ${land}`, href: without("land") }] : []),
    ...(kland ? [{ label: `Kennengelernt in: ${kland}`, href: without("kland") }] : []),
    ...(herkunft ? [{ label: `Herkunft: ${herkunft}`, href: without("herkunft") }] : []),
    ...(ort ? [{ label: `Ort: ${ort}`, href: without("ort") }] : []),
    ...(firma ? [{ label: `Unternehmen: ${firma}`, href: without("firma") }] : []),
    ...(beruf ? [{ label: `Beruf: ${beruf}`, href: without("beruf") }] : []),
    ...(von ? [{ label: `Kennengelernt ab ${formatDate(von)}`, href: without("von") }] : []),
    ...(bis ? [{ label: `Kennengelernt bis ${formatDate(bis)}`, href: without("bis") }] : []),
    ...(STATUS[status] ? [{ label: STATUS[status], href: without("status") }] : []),
  ];

  const grouped = sort === "name";
  const groups: { letter: string; items: PersonListRow[] }[] = [];
  if (grouped) {
    for (const r of rows) {
      const l = letterOf(r);
      const last = groups[groups.length - 1];
      if (last && last.letter === l) last.items.push(r);
      else groups.push({ letter: l, items: [r] });
    }
  }
  const letters = groups.map((g) => g.letter);
  const activeTags = taxonomy.tags.filter((t) => !t.archived_at || tag.includes(t.id));
  const activeInterests = taxonomy.interests.filter((t) => !t.archived_at || int.includes(t.id));
  const activeCats = taxonomy.categories.filter((c) => !c.archived_at || kat.includes(c.id));

  return (
    <>
      <PageHeader
        title="Personen"
        description={chips.length ? `${total} ${total === 1 ? "Person passt" : "Personen passen"} zu den Filtern` : `${total} im Register`}
        actions={
          <LinkButton href="/einstellungen/daten" variant="ghost" size="sm">
            Import und Export
          </LinkButton>
        }
      />

      {one(sp.geloescht) ? (
        <div className="mb-4">
          <Notice tone="accent">
            In den Papierkorb gelegt. Du kannst die Person dort 30 Tage lang wiederherstellen.{" "}
            <Link href="/einstellungen/papierkorb" className="font-semibold underline underline-offset-2">
              Papierkorb öffnen
            </Link>
          </Notice>
        </div>
      ) : null}

      <AutoSubmitForm action="/personen" className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input name="q" type="search" defaultValue={q} placeholder="Name, Firma, Notiz oder Gesprächsthema" className="h-9 min-w-56 flex-1" aria-label="Suche" />
          <Select name="sort" defaultValue={sort} className="h-9 w-auto" aria-label="Sortierung">
            {Object.entries(SORTS).map(([v, l]) => (
              <option key={v} value={v}>
                Sortieren: {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <CheckboxMenu label="Kategorien" name="kat" options={activeCats} selected={kat} />
          <CheckboxMenu label="Tags" name="tag" options={activeTags} selected={tag} />
          <CheckboxMenu label="Interessen" name="int" options={activeInterests} selected={int} />
          <Menu label="Länder und Orte" active={Boolean(land || kland || herkunft || ort)}>
            <datalist id="countries">
              {countries.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <datalist id="cities">
              {(fv.cities ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <MenuField label="Wohnt in (Land)">
              <Input name="land" list="countries" defaultValue={land} className="h-9" />
            </MenuField>
            <MenuField label="Wohnort">
              <Input name="ort" list="cities" defaultValue={ort} className="h-9" />
            </MenuField>
            <MenuField label="Kennengelernt in (Land)">
              <Input name="kland" list="countries" defaultValue={kland} className="h-9" />
            </MenuField>
            <MenuField label="Herkunftsland">
              <Input name="herkunft" list="countries" defaultValue={herkunft} className="h-9" />
            </MenuField>
          </Menu>
          <Menu label="Beruf und Firma" active={Boolean(firma || beruf)}>
            <datalist id="companies">
              {(fv.companies ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <MenuField label="Unternehmen oder Organisation">
              <Input name="firma" list="companies" defaultValue={firma} className="h-9" />
            </MenuField>
            <MenuField label="Beruf oder Position enthält">
              <Input name="beruf" defaultValue={beruf} className="h-9" />
            </MenuField>
          </Menu>
          <Menu label="Kennengelernt" active={Boolean(von || bis)}>
            <MenuField label="Von">
              <Input name="von" type="date" defaultValue={von} className="h-9" />
            </MenuField>
            <MenuField label="Bis">
              <Input name="bis" type="date" defaultValue={bis} className="h-9" />
            </MenuField>
          </Menu>
          <Select name="status" defaultValue={status} className={cx("h-9 w-auto", status && "border-accent text-accent")} aria-label="Kontaktstatus">
            <option value="">Kontaktstatus: alle</option>
            {Object.entries(STATUS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <noscript>
            <button className={buttonClass("primary", "sm")}>Filtern</button>
          </noscript>
        </div>
      </AutoSubmitForm>

      {chips.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-1.5" aria-label="Aktive Filter">
          {chips.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-2.5 pr-1.5 text-[13px] text-accent hover:bg-accent hover:text-on-accent"
              title="Filter entfernen"
            >
              {c.label}
              <X size={14} aria-hidden />
              <span className="sr-only">entfernen</span>
            </Link>
          ))}
          <Link href="/personen" className="ml-1 text-[13px] text-muted underline underline-offset-2 hover:text-ink">
            Alle Filter entfernen
          </Link>
        </div>
      ) : null}

      {error ? (
        <Notice tone="warn">Die Suche ist fehlgeschlagen. Bitte die Seite neu laden.</Notice>
      ) : rows.length === 0 ? (
        <Panel>
          {chips.length ? (
            <EmptyState title="Niemand passt zu diesen Filtern." action={<LinkButton href="/personen">Filter zurücksetzen</LinkButton>}>
              Entferne einzelne Filter oben, um die Auswahl zu erweitern.
            </EmptyState>
          ) : (
            <EmptyState title="Noch keine Personen.">Lege oben rechts die erste Person an oder importiere eine CSV-Datei.</EmptyState>
          )}
        </Panel>
      ) : grouped ? (
        <div className="relative lg:pr-10">
          {letters.length > 3 ? (
            <nav aria-label="Alphabet" className="fixed right-3 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-center gap-0.5 lg:flex">
              {letters.map((l) => (
                <a key={l} href={`#buchstabe-${l === "#" ? "andere" : l}`} className="w-6 rounded py-0.5 text-center font-serif text-[13px] font-semibold text-muted hover:bg-accent-soft hover:text-accent">
                  {l}
                </a>
              ))}
            </nav>
          ) : null}
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.letter} id={`buchstabe-${g.letter === "#" ? "andere" : g.letter}`} className="scroll-mt-20">
                <div className="mb-2 flex items-baseline gap-3 px-1">
                  <h2 className="font-serif text-[34px] font-semibold leading-none text-accent">{g.letter}</h2>
                  <span className="h-px flex-1 bg-line" aria-hidden />
                  <span className="text-[12px] text-faint tabular">{g.items.length}</span>
                </div>
                <Panel>
                  <PeopleRows rows={g.items} photos={photos} today={today} byId={taxonomy.byId} />
                </Panel>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <Panel>
          <PeopleRows rows={rows} photos={photos} today={today} byId={taxonomy.byId} showMatch={sort === "relevance" && Boolean(q)} />
        </Panel>
      )}

      {total > PAGE_SIZE ? (
        <div className="mt-6 flex items-center justify-center gap-3 text-[14px] text-muted">
          {page > 1 ? (
            <LinkButton href={pageHref(page - 1)} size="sm">
              Zurück
            </LinkButton>
          ) : null}
          <span className="tabular">
            {(page - 1) * PAGE_SIZE + 1} bis {Math.min(page * PAGE_SIZE, total)} von {total}
          </span>
          {page * PAGE_SIZE < total ? (
            <LinkButton href={pageHref(page + 1)} size="sm">
              Weiter
            </LinkButton>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function PeopleRows({
  rows,
  photos,
  today,
  byId,
  showMatch,
}: {
  rows: PersonListRow[];
  photos: Map<string, string>;
  today: string;
  byId: Map<string, { name: string; kind: string }>;
  showMatch?: boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((p) => {
        const work = [p.occupation, p.company || p.organization].filter(Boolean).join(", ");
        const place = [p.city, p.country].filter(Boolean).join(", ");
        const cats = p.category_ids.map((id) => byId.get(id)?.name).filter(Boolean).slice(0, 3);
        return (
          <li key={p.id}>
            <Link href={`/personen/${p.id}`} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-paper md:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,220px)]">
              <Avatar person={p} url={photos.get(p.photo_path ?? "")} size={38} className="row-span-2 md:row-span-1" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">
                  {fullName(p)}
                  {p.nickname ? <span className="font-normal text-muted"> „{p.nickname}“</span> : null}
                </p>
                <p className="truncate text-[13px] text-muted">{work || p.met_place || " "}</p>
              </div>
              <div className="col-start-2 min-w-0 text-[13px] text-muted md:col-start-auto">
                <p className="truncate">{place}</p>
                {cats.length ? <p className="truncate text-faint">{cats.join(", ")}</p> : null}
              </div>
              <div className="col-start-2 flex flex-wrap items-center gap-2 text-[12px] text-faint md:col-start-auto md:justify-end">
                {showMatch && p.match_rank === 2 ? <span>Treffer in Begegnung</span> : null}
                {p.last_contact_on ? <span>Kontakt {relativeDay(p.last_contact_on, today)}</span> : null}
                {p.next_due_date ? <DueBadge due={p.next_due_date} today={today} status="planned" /> : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Menu({ label, active, children }: { label: string; active?: boolean; children: React.ReactNode }) {
  return (
    <details className="group relative">
      <summary className={cx(buttonClass("secondary", "sm", "h-9 cursor-pointer list-none"), active && "border-accent text-accent")}>
        {label}
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-72 space-y-3 rounded-lg border border-line bg-surface p-3 shadow-lg">{children}</div>
    </details>
  );
}

function MenuField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function CheckboxMenu({
  label,
  name,
  options,
  selected,
}: {
  label: string;
  name: string;
  options: { id: string; name: string }[];
  selected: string[];
}) {
  return (
    <Menu label={selected.length ? `${label} (${selected.length})` : label} active={selected.length > 0}>
      {options.length === 0 ? (
        <p className="text-[13px] text-faint">
          Noch keine Einträge.{" "}
          <Link href="/ordnung" className="underline">
            Anlegen
          </Link>
        </p>
      ) : (
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[14px] hover:bg-paper">
              <input type="checkbox" name={name} value={o.id} defaultChecked={selected.includes(o.id)} className="size-4 accent-[var(--accent)]" />
              {o.name}
            </label>
          ))}
        </div>
      )}
      {options.length > 1 ? <p className="text-[12px] text-faint">Mehrere Einträge: Personen müssen alle haben.</p> : null}
    </Menu>
  );
}
