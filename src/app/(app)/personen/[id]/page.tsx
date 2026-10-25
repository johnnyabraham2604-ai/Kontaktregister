import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarPlus, Mail, NotebookPen, Pencil, Phone, Globe, Users } from "lucide-react";
import { getFieldDefinitions, getSettings, getTaxonomy, getToday, photoUrls, requireUser } from "@/lib/data";
import { addDays, formatDate, formatTime, relativeDay } from "@/lib/dates";
import { encounterLabel, fullName, linkLabel } from "@/lib/labels";
import type { Encounter, LinkKind, Person, Reminder } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { ActionForm, ConfirmButton, Dialog, SubmitButton } from "@/components/client";
import { EncounterForm } from "@/components/encounter-form";
import { NotesEditor } from "@/components/notes-editor";
import { PhotoUpload } from "@/components/photo-upload";
import { LinkForm } from "@/components/link-form";
import { ReminderForm } from "@/components/reminder-form";
import { ReminderItem, type ReminderWithPerson } from "@/components/reminder-item";
import { Badge, EmptyState, LinkButton, Notice, Panel, PanelHeader, Textarea } from "@/components/ui";
import { addNote, trashPerson } from "@/app/actions/people";
import { deleteEncounter } from "@/app/actions/timeline";
import { deleteLink } from "@/app/actions/organize";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Person" };
  const { supabase } = await requireUser();
  const { data } = await supabase.from("people").select("first_name, last_name").eq("id", id).maybeSingle();
  return { title: data ? fullName(data) : "Person" };
}

export default async function PersonPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const { supabase, user } = await requireUser();

  const [personRes, encRes, remRes, linksRes, settings, today, taxonomy, fieldDefs] = await Promise.all([
    supabase.from("people").select("*, person_categories(category_id), person_tags(tag_id)").eq("id", id).maybeSingle(),
    supabase.from("encounters").select("*, encounter_tags(tag_id)").eq("person_id", id).order("occurred_on", { ascending: false }).order("occurred_time", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    supabase.from("reminders").select("*").eq("person_id", id).order("due_date"),
    supabase
      .from("person_links")
      .select("*, a:people!person_links_person_a_fkey(id, first_name, last_name, photo_path, deleted_at), b:people!person_links_person_b_fkey(id, first_name, last_name, photo_path, deleted_at)")
      .or(`person_a.eq.${id},person_b.eq.${id}`),
    getSettings(),
    getToday(),
    getTaxonomy(),
    getFieldDefinitions(),
  ]);

  const raw = personRes.data as (Person & { person_categories: { category_id: string }[]; person_tags: { tag_id: string }[] }) | null;
  if (!raw) notFound();
  const person = raw;

  const encounters = (encRes.data ?? []) as (Encounter & { encounter_tags: { tag_id: string }[] })[];
  const reminders = ((remRes.data ?? []) as Reminder[]).map((r) => ({
    ...r,
    person: { id: person.id, first_name: person.first_name, last_name: person.last_name, photo_path: person.photo_path },
  })) as ReminderWithPerson[];
  const openReminders = reminders.filter((r) => r.status === "planned");
  const closedReminders = reminders.filter((r) => r.status !== "planned").sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  type LinkedPerson = { id: string; first_name: string; last_name: string; photo_path: string | null; deleted_at: string | null };
  const links = ((linksRes.data ?? []) as { id: string; kind: LinkKind; description: string | null; note: string | null; person_a: string; a: LinkedPerson; b: LinkedPerson }[])
    .map((l) => {
      const viewerIsA = l.person_a === person.id;
      return { ...l, viewerIsA, other: viewerIsA ? l.b : l.a };
    })
    .filter((l) => !l.other.deleted_at);

  const lastContact = encounters.find((e) => e.kind !== "note");
  const categoryNames = person.person_categories.map((c) => taxonomy.byId.get(c.category_id)).filter(Boolean) as { name: string }[];
  const tagIds = new Set(person.person_tags.map((t) => t.tag_id));
  const personTags = taxonomy.tags.filter((t) => tagIds.has(t.id));
  const personInterests = taxonomy.interests.filter((t) => tagIds.has(t.id));
  const activeTags = taxonomy.tags.filter((t) => !t.archived_at).map((t) => ({ id: t.id, name: t.name }));
  const photos = await photoUrls([person.photo_path, ...links.map((l) => l.other.photo_path)]);
  const highlight = sp.erinnerung;
  const nextDefault = addDays(today, 28);

  const { data: everyone } = await supabase
    .from("people")
    .select("id, first_name, last_name")
    .is("deleted_at", null)
    .neq("id", person.id)
    .order("last_name")
    .order("first_name")
    .limit(5000);
  const linkCandidates = (everyone ?? []).map((p) => ({ id: p.id, name: fullName(p) }));

  const roleLine = [person.occupation, person.company || person.organization].filter(Boolean).join(", ");
  const place = [person.city, person.country].filter(Boolean).join(", ");
  const customValues = fieldDefs
    .filter((d) => person.custom_fields?.[d.key])
    .map((d) => ({ ...d, value: person.custom_fields[d.key] }));

  return (
    <>
      {person.deleted_at ? (
        <div className="mb-5">
          <Notice tone="warn">
            Diese Person liegt im Papierkorb.{" "}
            <Link href="/einstellungen/papierkorb" className="font-semibold underline underline-offset-2">
              Zum Papierkorb
            </Link>
          </Notice>
        </div>
      ) : sp.neu ? (
        <div className="mb-5">
          <Notice tone="ok">
            {person.first_name} ist im Register. Ergänze jetzt, was du weißt, oder halte die erste Begegnung fest.
          </Notice>
        </div>
      ) : null}

      {/* Kopf: Wer ist das, woher kenne ich die Person, wann zuletzt */}
      <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar person={person} url={photos.get(person.photo_path ?? "")} size={84} />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[30px] font-semibold leading-tight tracking-tight sm:text-[36px]">
            {fullName(person)}
            {person.nickname ? <span className="ml-2 align-middle font-sans text-[16px] font-normal text-muted">„{person.nickname}“</span> : null}
          </h1>
          {roleLine ? <p className="mt-1 text-[16px]">{roleLine}</p> : null}
          <p className="mt-1 text-[14px] text-muted">
            {[place, lastContact ? `Letzter Kontakt ${relativeDay(lastContact.occurred_on, today)} (${encounterLabel(lastContact.kind)})` : "Noch keine Begegnung dokumentiert"]
              .filter(Boolean)
              .join(". ")}
          </p>
          {person.met_on || person.met_place || person.met_context ? (
            <p className="mt-1 text-[14px] text-muted lg:hidden">
              Kennengelernt {[person.met_on ? formatDate(person.met_on) : null, person.met_place].filter(Boolean).join(", ")}
              {person.met_context ? `. ${person.met_context}` : ""}
            </p>
          ) : null}
          {categoryNames.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {person.person_categories.map((c) => (
                <Link key={c.category_id} href={`/personen?kat=${c.category_id}`}>
                  <Badge tone="accent">{taxonomy.byId.get(c.category_id)?.name}</Badge>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[320px] sm:justify-end">
          <Dialog label="Begegnung festhalten" title={`Begegnung mit ${person.first_name}`} variant="primary" icon={<Users size={16} aria-hidden />} wide>
            <EncounterForm personId={person.id} tags={activeTags} today={today} nextDefaultDate={nextDefault} defaultTime={settings.default_reminder_time} />
          </Dialog>
          <Dialog label="Kontakttermin" title={`Wann meldest du dich bei ${person.first_name}?`} icon={<CalendarPlus size={16} aria-hidden />}>
            <ReminderForm personId={person.id} defaultDate={nextDefault} defaultTime={settings.default_reminder_time} />
          </Dialog>
          <Dialog label="Notiz" title="Notiz hinzufügen" icon={<NotebookPen size={16} aria-hidden />}>
            <ActionForm action={addNote} className="space-y-3">
              <input type="hidden" name="person_id" value={person.id} />
              <Textarea name="notes" rows={5} required autoFocus placeholder={`Was möchtest du über ${person.first_name} festhalten?`} aria-label="Notiz" />
              <p className="text-[13px] text-faint">Erscheint mit heutigem Datum im Verlauf. Zählt nicht als Kontakt.</p>
              <div className="flex justify-end">
                <SubmitButton pendingLabel="Speichert …">Notiz speichern</SubmitButton>
              </div>
            </ActionForm>
          </Dialog>
          <LinkButton href={`/personen/${person.id}/bearbeiten`} variant="ghost" aria-label="Profil bearbeiten">
            <Pencil size={16} aria-hidden />
            Bearbeiten
          </LinkButton>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* Wann melde ich mich wieder */}
          <Panel id="erinnerungen" className="scroll-mt-24">
            <PanelHeader
              title="Nächster Kontakt"
              count={openReminders.length}
            />
            {openReminders.length ? (
              <ul className="divide-y divide-line">
                {openReminders.map((r) => (
                  <ReminderItem key={r.id} r={r} today={today} defaultTime={settings.default_reminder_time} showPerson={false} highlight={highlight === r.id} />
                ))}
              </ul>
            ) : (
              <EmptyState title="Kein Kontakttermin geplant." />
            )}
            {closedReminders.length ? (
              <details className="border-t border-line" open={closedReminders.some((r) => r.id === highlight)}>
                <summary className="cursor-pointer px-4 py-2.5 text-[13px] text-muted hover:text-ink">
                  Erledigt und abgebrochen ({closedReminders.length})
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {closedReminders.map((r) => (
                    <ReminderItem key={r.id} r={r} today={today} defaultTime={settings.default_reminder_time} showPerson={false} highlight={highlight === r.id} />
                  ))}
                </ul>
              </details>
            ) : null}
          </Panel>

          {/* Was ich weiß */}
          <Panel>
            <PanelHeader title="Was ich weiß" />
            <NotesEditor personId={person.id} firstName={person.first_name} notes={{ about: person.about, goals: person.goals, open_items: person.open_items }} />
          </Panel>

          {/* Verlauf */}
          <Panel>
            <PanelHeader title="Verlauf" count={encounters.length} />
            {encounters.length ? (
              <ol className="relative px-4 py-2">
                {encounters.map((e) => {
                  const eTags = e.encounter_tags.map((t) => taxonomy.byId.get(t.tag_id)?.name).filter(Boolean);
                  const isNote = e.kind === "note";
                  return (
                    <li key={e.id} className="relative border-l border-line py-3 pl-5">
                      <span aria-hidden className={`absolute -left-[5px] top-[18px] size-[9px] rounded-full ${isNote ? "border border-line-strong bg-surface" : "bg-accent"}`} />
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-[14px]">
                          <span className="font-semibold tabular">{formatDate(e.occurred_on)}</span>
                          {e.occurred_time ? <span className="text-muted tabular">, {formatTime(e.occurred_time)}</span> : null}
                          <span className="text-muted">. {encounterLabel(e.kind)}</span>
                          {e.location ? <span className="text-muted">, {e.location}</span> : null}
                        </p>
                        <div className="flex gap-1">
                          <Dialog label="Bearbeiten" title="Eintrag bearbeiten" variant="ghost" size="sm" wide>
                            <EncounterForm
                              personId={person.id}
                              encounter={e}
                              tagIds={e.encounter_tags.map((t) => t.tag_id)}
                              tags={activeTags}
                              today={today}
                              nextDefaultDate={nextDefault}
                              defaultTime={settings.default_reminder_time}
                            />
                          </Dialog>
                          <form action={deleteEncounter}>
                            <input type="hidden" name="id" value={e.id} />
                            <ConfirmButton variant="ghost" confirm="Diesen Eintrag endgültig löschen?">
                              Löschen
                            </ConfirmButton>
                          </form>
                        </div>
                      </div>
                      {e.topics ? <p className="mt-1 text-[15px] font-medium">{e.topics}</p> : null}
                      {e.notes ? <p className="prose-notes mt-1 text-[15px] leading-relaxed">{e.notes}</p> : null}
                      {e.agreements ? (
                        <p className="mt-2 rounded-md bg-amber-soft px-2.5 py-1.5 text-[14px] text-amber">
                          <span className="font-semibold">Vereinbart: </span>
                          <span className="prose-notes">{e.agreements}</span>
                        </p>
                      ) : null}
                      {eTags.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {eTags.map((t) => (
                            <Badge key={t}>{t}</Badge>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState title="Noch keine Begegnung festgehalten.">Halte nach dem nächsten Treffen fest, worüber ihr gesprochen habt.</EmptyState>
            )}
          </Panel>
        </div>

        {/* Steckbrief */}
        <aside className="space-y-6">
          <Panel>
            <PanelHeader title="Woher ich sie kenne" />
            <dl className="space-y-3 px-4 py-4 text-[14px]">
              <Fact label="Kennengelernt">
                {[person.met_on ? formatDate(person.met_on) : null, person.met_place, person.met_country].filter(Boolean).join(", ") || <Missing />}
              </Fact>
              {person.met_context ? <Fact label="Kontext"><span className="prose-notes">{person.met_context}</span></Fact> : null}
            </dl>
          </Panel>

          <Panel>
            <PanelHeader title="Steckbrief" />
            <dl className="space-y-3 px-4 py-4 text-[14px]">
              {person.email ? (
                <Fact label="E-Mail">
                  <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1.5 break-all text-accent hover:underline">
                    <Mail size={14} aria-hidden />
                    {person.email}
                  </a>
                </Fact>
              ) : null}
              {person.phone ? (
                <Fact label="Telefon">
                  <a href={`tel:${person.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-accent hover:underline">
                    <Phone size={14} aria-hidden />
                    {person.phone}
                  </a>
                </Fact>
              ) : null}
              {place ? <Fact label="Wohnort">{place}</Fact> : null}
              {person.origin_country ? <Fact label="Herkunftsland">{person.origin_country}</Fact> : null}
              {person.organization && person.company ? <Fact label="Organisation">{person.organization}</Fact> : null}
              {person.languages.length ? <Fact label="Sprachen">{person.languages.join(", ")}</Fact> : null}
              {person.links.length ? (
                <Fact label="Links">
                  <ul className="space-y-1">
                    {person.links.map((l) => (
                      <li key={l}>
                        <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 break-all text-accent hover:underline">
                          <Globe size={14} aria-hidden />
                          {l.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Fact>
              ) : null}
              {customValues.map((d) => (
                <Fact key={d.key} label={d.label}>
                  {d.field_type === "url" ? (
                    <a href={d.value} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent hover:underline">
                      {d.value}
                    </a>
                  ) : d.field_type === "date" ? (
                    formatDate(d.value)
                  ) : (
                    d.value
                  )}
                </Fact>
              ))}
              {!person.email && !person.phone && !place && !person.languages.length && !person.links.length && !customValues.length ? (
                <p className="text-muted">
                  Noch keine Angaben.{" "}
                  <Link href={`/personen/${person.id}/bearbeiten`} className="text-accent underline underline-offset-2">
                    Ergänzen
                  </Link>
                </p>
              ) : null}
            </dl>
            <div className="border-t border-line px-3 py-2">
              <PhotoUpload personId={person.id} userId={user.id} hasPhoto={Boolean(person.photo_path)} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Interessen und Tags" />
            <div className="space-y-3 px-4 py-4">
              {personInterests.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {personInterests.map((t) => (
                    <Link key={t.id} href={`/personen?int=${t.id}`} title="Alle mit diesem Interesse">
                      <Badge tone="ok">{t.name}</Badge>
                    </Link>
                  ))}
                </div>
              ) : null}
              {personTags.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {personTags.map((t) => (
                    <Link key={t.id} href={`/personen?tag=${t.id}`} title="Alle mit diesem Tag">
                      <Badge>{t.name}</Badge>
                    </Link>
                  ))}
                </div>
              ) : null}
              {!personInterests.length && !personTags.length ? (
                <p className="text-[14px] text-muted">
                  Keine.{" "}
                  <Link href={`/personen/${person.id}/bearbeiten#ordnung`} className="text-accent underline underline-offset-2">
                    Zuordnen
                  </Link>
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Verbindungen"
              count={links.length}
              action={
                linkCandidates.length ? (
                  <Dialog label="Hinzufügen" title={`Verbindung von ${person.first_name}`} variant="ghost" size="sm">
                    <LinkForm personId={person.id} firstName={person.first_name} people={linkCandidates} />
                  </Dialog>
                ) : null
              }
            />
            {links.length ? (
              <ul className="divide-y divide-line">
                {links.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 px-4 py-2.5">
                    <Avatar person={l.other} url={photos.get(l.other.photo_path ?? "")} size={30} />
                    <div className="min-w-0 flex-1 text-[14px]">
                      <p className="text-[12px] text-faint">{linkLabel(l.kind, l.viewerIsA)}</p>
                      <Link href={`/personen/${l.other.id}`} className="font-medium hover:underline">
                        {fullName(l.other)}
                      </Link>
                      {l.description ? <p className="text-muted">{l.description}</p> : null}
                      {l.note ? <p className="prose-notes text-[13px] text-faint">{l.note}</p> : null}
                    </div>
                    <form action={deleteLink}>
                      <input type="hidden" name="id" value={l.id} />
                      <ConfirmButton variant="ghost" confirm="Verbindung entfernen?" aria-label="Verbindung entfernen">
                        Entfernen
                      </ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-[14px] text-muted">Keine Verbindungen eingetragen.</p>
            )}
          </Panel>

          {!person.deleted_at ? (
            <form action={trashPerson} className="px-1">
              <input type="hidden" name="id" value={person.id} />
              <ConfirmButton variant="ghost" confirm={`${fullName(person)} in den Papierkorb legen? Du kannst die Person dort 30 Tage lang wiederherstellen.`}>
                In den Papierkorb legen
              </ConfirmButton>
            </form>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-faint">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Missing() {
  return <span className="text-faint">Nicht eingetragen</span>;
}
