import type { Metadata } from "next";
import Link from "next/link";
import { getSettings, getToday, photoUrls, requireUser } from "@/lib/data";
import { addDays, formatTime } from "@/lib/dates";
import { ReminderItem, type ReminderWithPerson } from "@/components/reminder-item";
import { EmptyState, PageHeader, Panel, PanelHeader, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Erinnerungen" };

const TABS = [
  { key: "offen", label: "Offen" },
  { key: "erledigt", label: "Erledigt" },
  { key: "abgebrochen", label: "Abgebrochen" },
];

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  const { ansicht = "offen" } = await searchParams;
  const tab = TABS.some((t) => t.key === ansicht) ? ansicht : "offen";
  const { supabase } = await requireUser();
  const [settings, today] = await Promise.all([getSettings(), getToday()]);

  let query = supabase
    .from("reminders")
    .select("*, person:people!inner(id, first_name, last_name, photo_path, deleted_at)")
    .is("person.deleted_at", null);
  if (tab === "offen") query = query.eq("status", "planned").order("due_date").order("due_time", { nullsFirst: false }).limit(500);
  else query = query.eq("status", tab === "erledigt" ? "done" : "cancelled").order("updated_at", { ascending: false }).limit(100);
  const { data } = await query;
  const rows = (data ?? []) as ReminderWithPerson[];
  const photos = await photoUrls(rows.map((r) => r.person.photo_path));

  const week = addDays(today, 7);
  const groups =
    tab === "offen"
      ? [
          { title: "Überfällig", items: rows.filter((r) => r.due_date < today) },
          { title: "Heute", items: rows.filter((r) => r.due_date === today) },
          { title: "Nächste 7 Tage", items: rows.filter((r) => r.due_date > today && r.due_date <= week) },
          { title: "Später", items: rows.filter((r) => r.due_date > week) },
        ].filter((g) => g.items.length)
      : [{ title: tab === "erledigt" ? "Zuletzt erledigt" : "Zuletzt abgebrochen", items: rows }];

  const digestInfo = settings.digest_enabled
    ? `Tägliche Übersicht um ${formatTime(settings.digest_time)} Uhr`
    : "Tägliche Übersicht ist aus";
  const individualInfo = settings.individual_enabled
    ? `Einzel-E-Mails ohne Uhrzeit um ${formatTime(settings.default_reminder_time)} Uhr${settings.individual_lead_days ? `, ${settings.individual_lead_days} Tage vorher` : ""}`
    : "Einzel-E-Mails sind aus";

  return (
    <>
      <PageHeader
        title="Erinnerungen"
        description={
          <>
            {digestInfo}. {individualInfo}.{" "}
            <Link href="/einstellungen" className="underline underline-offset-2 hover:text-ink">
              Ändern
            </Link>
          </>
        }
      />
      <nav aria-label="Ansicht" className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "offen" ? "/erinnerungen" : `/erinnerungen?ansicht=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-[14px]",
              tab === t.key ? "border-accent font-semibold text-accent" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {groups.length === 0 || rows.length === 0 ? (
        <Panel>
          <EmptyState title={tab === "offen" ? "Keine offenen Kontakttermine." : "Noch nichts hier."}>
            {tab === "offen" ? "Einen Kontakttermin legst du im Profil einer Person fest, auch direkt beim Festhalten einer Begegnung." : null}
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <Panel key={g.title}>
              <PanelHeader title={g.title} count={g.items.length} />
              <ul className="divide-y divide-line">
                {g.items.map((r) => (
                  <ReminderItem key={r.id} r={r} today={today} defaultTime={settings.default_reminder_time} photoUrl={photos.get(r.person.photo_path ?? "")} />
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
