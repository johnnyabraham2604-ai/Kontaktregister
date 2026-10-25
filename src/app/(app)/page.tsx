import Link from "next/link";
import { getSchedulerHealth, getSettings, getTaxonomy, getToday, photoUrls, requireUser } from "@/lib/data";
import { addDays, formatDateLong, hoursSince, relativeDay } from "@/lib/dates";
import { fullName } from "@/lib/labels";
import { Avatar } from "@/components/avatar";
import { ReminderItem, type ReminderWithPerson } from "@/components/reminder-item";
import { QuickAdd } from "@/components/quick-add";
import { EmptyState, LinkButton, Notice, PageHeader, Panel, PanelHeader } from "@/components/ui";

export default async function Dashboard() {
  const { supabase } = await requireUser();
  const [settings, today, taxonomy, health] = await Promise.all([getSettings(), getToday(), getTaxonomy(), getSchedulerHealth()]);
  const horizon = addDays(today, 14);

  const [peopleCount, reminders, recent, updated] = await Promise.all([
    supabase.from("people").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("reminders")
      .select("*, person:people!inner(id, first_name, last_name, photo_path, deleted_at)")
      .eq("status", "planned")
      .lte("due_date", horizon)
      .is("person.deleted_at", null)
      .order("due_date")
      .order("due_time", { nullsFirst: false })
      .limit(60),
    supabase
      .from("people")
      .select("id, first_name, last_name, photo_path, met_place, met_context, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("people")
      .select("id, first_name, last_name, photo_path, updated_at, created_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  const rems = (reminders.data ?? []) as ReminderWithPerson[];
  const dueNow = rems.filter((r) => r.due_date <= today);
  const overdueCount = dueNow.filter((r) => r.due_date < today).length;
  const upcoming = rems.filter((r) => r.due_date > today);
  const recentPeople = recent.data ?? [];
  const updatedPeople = (updated.data ?? []).filter((p) => p.updated_at !== p.created_at).slice(0, 5);
  const photos = await photoUrls([...rems.map((r) => r.person.photo_path), ...recentPeople.map((p) => p.photo_path), ...updatedPeople.map((p) => p.photo_path)]);
  const total = peopleCount.count ?? 0;
  const activeCategories = taxonomy.categories.filter((c) => !c.archived_at);

  const lastRunAge = health.lastRun ? hoursSince(health.lastRun.started_at) : null;

  return (
    <>
      <PageHeader
        title="Übersicht"
        description={
          <>
            {formatDateLong(today)}
            {total > 0 ? (
              <>
                .{" "}
                <Link href="/personen" className="hover:text-ink">
                  {total === 1 ? "1 Person" : `${total} Personen`} im Register
                </Link>
              </>
            ) : null}
          </>
        }
      />

      {lastRunAge === null ? (
        <div className="mb-5">
          <Notice tone="amber">
            Der Hintergrundprozess ist noch nicht gelaufen. E-Mail-Erinnerungen werden erst verschickt, wenn der Scheduler
            eingerichtet ist.{" "}
            <Link href="/einstellungen" className="font-semibold underline underline-offset-2">
              Zu den Einstellungen
            </Link>
          </Notice>
        </div>
      ) : lastRunAge > 3 ? (
        <div className="mb-5">
          <Notice tone="warn">
            Der Hintergrundprozess ist seit {Math.round(lastRunAge)} Stunden nicht gelaufen. Erinnerungen kommen gerade nicht
            zuverlässig an.{" "}
            <Link href="/einstellungen" className="font-semibold underline underline-offset-2">
              Status prüfen
            </Link>
          </Notice>
        </div>
      ) : null}

      {total === 0 ? (
        <Panel>
          <EmptyState
            title="Noch niemand im Register"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <QuickAdd categories={activeCategories} today={today} />
                <LinkButton href="/einstellungen/daten" variant="secondary">
                  Kontakte importieren
                </LinkButton>
              </div>
            }
          >
            Lege die erste Person an. Name und ein Satz, woher du sie kennst, reichen. Alles Weitere kannst du später ergänzen.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel>
              <PanelHeader
                title={overdueCount > 0 ? "Heute fällig und überfällig" : "Heute fällig"}
                count={dueNow.length}
                action={
                  <Link href="/erinnerungen" className="text-[13px] text-muted hover:text-ink">
                    Alle Erinnerungen
                  </Link>
                }
              />
              {dueNow.length ? (
                <ul className="divide-y divide-line">
                  {dueNow.map((r) => (
                    <ReminderItem key={r.id} r={r} today={today} defaultTime={settings.default_reminder_time} photoUrl={photos.get(r.person.photo_path ?? "")} compact />
                  ))}
                </ul>
              ) : (
                <EmptyState title="Heute steht nichts an.">Neue Kontakttermine legst du im Profil einer Person fest.</EmptyState>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Die nächsten zwei Wochen" count={upcoming.length} />
              {upcoming.length ? (
                <ul className="divide-y divide-line">
                  {upcoming.map((r) => (
                    <li key={r.id}>
                      <Link href={`/personen/${r.person.id}?erinnerung=${r.id}#erinnerungen`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-paper">
                        <Avatar person={r.person} url={photos.get(r.person.photo_path ?? "")} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium">{fullName(r.person)}</span>
                          <span className="block truncate text-[13px] text-muted">{r.reason}</span>
                        </span>
                        <span className="shrink-0 text-[13px] text-faint tabular">{relativeDay(r.due_date, today)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Keine geplanten Kontaktaufnahmen in den nächsten 14 Tagen." />
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <PeopleList title="Neu im Register" people={recentPeople} photos={photos} today={today} dateKey="created_at" />
            {updatedPeople.length ? (
              <PeopleList title="Zuletzt bearbeitet" people={updatedPeople} photos={photos} today={today} dateKey="updated_at" />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function PeopleList({
  title,
  people,
  photos,
  today,
  dateKey,
}: {
  title: string;
  people: { id: string; first_name: string; last_name: string; photo_path: string | null; created_at: string; updated_at?: string; met_place?: string | null }[];
  photos: Map<string, string>;
  today: string;
  dateKey: "created_at" | "updated_at";
}) {
  return (
    <Panel>
      <PanelHeader title={title} />
      <ul className="divide-y divide-line">
        {people.map((p) => {
          const ts = (dateKey === "updated_at" ? p.updated_at : p.created_at) ?? p.created_at;
          return (
            <li key={p.id}>
              <Link href={`/personen/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-paper">
                <Avatar person={p} url={photos.get(p.photo_path ?? "")} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{fullName(p)}</span>
                  {p.met_place ? <span className="block truncate text-[13px] text-muted">{p.met_place}</span> : null}
                </span>
                <span className="shrink-0 text-[13px] text-faint">{relativeDay(ts.slice(0, 10), today)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
