import type { Metadata } from "next";
import Link from "next/link";
import { getSettings, requireUser } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { OUTBOX_KIND_LABEL, OUTBOX_STATUS_LABEL } from "@/lib/labels";
import type { OutboxRow, SchedulerRun } from "@/lib/types";
import { SubmitButton } from "@/components/client";
import { Badge, EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui";
import { retryEmail } from "@/app/actions/settings";

export const metadata: Metadata = { title: "Versandprotokoll" };

const TONE = { sent: "ok", failed: "warn", pending: "amber", sending: "amber", skipped: "neutral" } as const;
const SOURCE_LABEL: Record<string, string> = { pg_cron: "Datenbank", vercel: "Kontrolllauf", manual: "Manuell" };

export default async function DeliveryLogPage() {
  const { supabase } = await requireUser();
  const settings = await getSettings();
  const [{ data: outbox }, { data: runs }] = await Promise.all([
    supabase
      .from("email_outbox")
      .select("id, kind, status, attempts, subject, last_error, provider_message_id, scheduled_for, sent_at, created_at, reminder_id, next_attempt_at")
      .order("created_at", { ascending: false })
      .limit(150),
    supabase.from("scheduler_runs").select("*").order("started_at", { ascending: false }).limit(30),
  ]);
  const rows = (outbox ?? []) as OutboxRow[];
  const tz = settings.timezone;

  return (
    <>
      <PageHeader title="Versandprotokoll" description="Jede geplante E-Mail mit Status. Fehler bleiben hier sichtbar, bis du sie erneut versuchst." />
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="E-Mails" count={rows.length} />
          {rows.length === 0 ? (
            <EmptyState title="Noch keine E-Mails geplant oder verschickt." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <thead className="border-b border-line text-[12px] text-faint">
                  <tr>
                    <th className="px-4 py-2 font-medium">Geplant für</th>
                    <th className="px-2 py-2 font-medium">Art</th>
                    <th className="px-2 py-2 font-medium">Betreff</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular">{formatDateTime(r.scheduled_for, tz)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5">{OUTBOX_KIND_LABEL[r.kind]}</td>
                      <td className="px-2 py-2.5">{r.subject ?? <span className="text-faint">Wird beim Versand erzeugt</span>}</td>
                      <td className="whitespace-nowrap px-2 py-2.5">
                        <Badge tone={TONE[r.status]}>{OUTBOX_STATUS_LABEL[r.status]}</Badge>
                        {r.attempts > 1 ? <span className="ml-1 text-[12px] text-faint">{r.attempts} Versuche</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-muted">
                        {r.status === "sent" ? (
                          <>
                            Zugestellt an Resend {formatDateTime(r.sent_at, tz)}
                            <span className="block font-mono text-[11px] text-faint">{r.provider_message_id}</span>
                          </>
                        ) : r.status === "pending" && r.last_error ? (
                          <>
                            {r.last_error}
                            <span className="block text-faint">Nächster Versuch {formatDateTime(r.next_attempt_at, tz)}</span>
                          </>
                        ) : (
                          r.last_error
                        )}
                        {r.status === "failed" ? (
                          <form action={retryEmail} className="mt-1.5">
                            <input type="hidden" name="id" value={r.id} />
                            <SubmitButton variant="secondary" size="sm">
                              Erneut versuchen
                            </SubmitButton>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-line px-4 py-3 text-[12px] text-faint">
            „Zugestellt an Resend“ heißt: Resend hat die E-Mail angenommen. Ob sie im Posteingang landet, zeigt das{" "}
            <a href="https://resend.com/emails" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Resend-Dashboard
            </a>
            . „Erneut versuchen“ nutzt denselben Schlüssel, Resend verhindert dadurch Doppelversand.
          </p>
        </Panel>

        <Panel>
          <PanelHeader title="Scheduler-Läufe" count={(runs ?? []).length} />
          {(runs ?? []).length === 0 ? (
            <EmptyState title="Noch kein Lauf.">
              Der Scheduler wird mit <code className="rounded bg-paper px-1">supabase/cron.sql</code> eingerichtet. Siehe{" "}
              <Link href="/einstellungen" className="underline">
                Status
              </Link>
              .
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[14px]">
                <thead className="border-b border-line text-[12px] text-faint">
                  <tr>
                    <th className="px-4 py-2 font-medium">Start</th>
                    <th className="px-2 py-2 font-medium">Auslöser</th>
                    <th className="px-2 py-2 font-medium tabular">Neu geplant</th>
                    <th className="px-2 py-2 font-medium tabular">Gesendet</th>
                    <th className="px-2 py-2 font-medium tabular">Übersprungen</th>
                    <th className="px-4 py-2 font-medium tabular">Fehler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(runs as SchedulerRun[]).map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-4 py-2 tabular">{formatDateTime(r.started_at, tz)}</td>
                      <td className="px-2 py-2">{SOURCE_LABEL[r.source] ?? r.source}</td>
                      <td className="px-2 py-2 tabular">{r.planned}</td>
                      <td className="px-2 py-2 tabular">{r.sent}</td>
                      <td className="px-2 py-2 tabular">{r.skipped}</td>
                      <td className="px-4 py-2 tabular">
                        {r.failed}
                        {r.error ? <span className="ml-2 text-warn">{r.error}</span> : null}
                        {!r.finished_at ? <span className="ml-2 text-amber">nicht beendet</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
