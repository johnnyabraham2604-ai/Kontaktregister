import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { getSettings, requireUser } from "@/lib/data";
import { formatDateTime, formatTime, hoursSince, TIME_ZONES } from "@/lib/dates";
import { appUrl, DEFAULT_EMAIL_FROM } from "@/lib/env";
import type { SchedulerRun } from "@/lib/types";
import { ActionForm, SubmitButton } from "@/components/client";
import { Checkbox, Field, Input, PageHeader, Panel, PanelHeader, Select } from "@/components/ui";
import { runSchedulerNow, saveSettings, sendTestEmail } from "@/app/actions/settings";

export const metadata: Metadata = { title: "Einstellungen" };

const SOURCE_LABEL: Record<string, string> = { pg_cron: "Datenbank-Scheduler", vercel: "Täglicher Kontrolllauf", manual: "Manuell" };

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const settings = await getSettings();
  const { data: runsData } = await supabase.from("scheduler_runs").select("*").order("started_at", { ascending: false }).limit(50);
  const runs = (runsData ?? []) as SchedulerRun[];
  const lastCron = runs.find((r) => r.source === "pg_cron");
  const lastAny = runs[0];
  const cronFresh = lastCron ? hoursSince(lastCron.started_at) < 3 : false;

  const checks = [
    { ok: Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY), label: "Supabase-Serverschlüssel", fix: "SUPABASE_SECRET_KEY in Vercel setzen" },
    { ok: Boolean(process.env.RESEND_API_KEY), label: "Resend-API-Key", fix: "RESEND_API_KEY in Vercel setzen" },
    { ok: (process.env.CRON_SECRET ?? "").length >= 16, label: "Scheduler-Geheimnis", fix: "CRON_SECRET mit mindestens 16 Zeichen setzen" },
    { ok: Boolean(process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL), label: "App-Adresse für Links", fix: "APP_URL setzen" },
    {
      ok: cronFresh,
      label: lastCron ? `Datenbank-Scheduler, zuletzt ${formatDateTime(lastCron.started_at, settings.timezone)}` : "Datenbank-Scheduler",
      fix: lastCron ? "Seit über 3 Stunden kein Lauf. cron.sql und pg_net-Antworten prüfen (Anleitung, Fehlersuche)" : "Noch nie gelaufen. supabase/cron.sql ausführen",
    },
  ];

  return (
    <>
      <PageHeader title="Einstellungen" description="Wann und wie dich Register an Kontaktaufnahmen erinnert." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel>
          <PanelHeader title="Erinnerungen" />
          <ActionForm action={saveSettings} resetOnSuccess={false} showSuccess className="space-y-6 px-4 py-5">
            <Field label="Empfänger" htmlFor="st-email" hint="Ohne eigene Domain bei Resend muss das die Adresse deines Resend-Kontos sein.">
              <Input id="st-email" name="recipient_email" type="email" required defaultValue={settings.recipient_email ?? ""} />
            </Field>
            <Field label="Zeitzone" htmlFor="st-tz" hint="Bestimmt Uhrzeiten, Sommerzeit und was als heute gilt.">
              <Select id="st-tz" name="timezone" defaultValue={settings.timezone}>
                {Array.from(new Set([settings.timezone, ...TIME_ZONES])).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>

            <fieldset className="space-y-3 rounded-lg border border-line p-4">
              <legend className="px-1 text-[14px] font-semibold">Tägliche Übersicht</legend>
              <Checkbox name="digest_enabled" label="Täglich eine Sammel-E-Mail schicken" hint="Nur an Tagen, an denen etwas fällig ist." defaultChecked={settings.digest_enabled} />
              <Field label="Uhrzeit" htmlFor="st-digest-time">
                <Input id="st-digest-time" name="digest_time" type="time" required defaultValue={formatTime(settings.digest_time)} className="w-36" />
              </Field>
              <Checkbox name="digest_include_overdue" label="Überfällige Erinnerungen täglich erneut aufführen" hint="Aus: nur heute fällige erscheinen. Überfällige bleiben in der App sichtbar." defaultChecked={settings.digest_include_overdue} />
              <Checkbox name="digest_include_done" label="Seit gestern erledigte Erinnerungen zeigen" defaultChecked={settings.digest_include_done} />
            </fieldset>

            <fieldset className="space-y-3 rounded-lg border border-line p-4">
              <legend className="px-1 text-[14px] font-semibold">Einzel-E-Mails</legend>
              <Checkbox name="individual_enabled" label="Einzel-E-Mails erlauben" hint="Gilt für Erinnerungen, bei denen du „Zusätzlich eine eigene E-Mail“ angehakt hast." defaultChecked={settings.individual_enabled} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Uhrzeit, wenn keine angegeben ist" htmlFor="st-def-time">
                  <Input id="st-def-time" name="default_reminder_time" type="time" required defaultValue={formatTime(settings.default_reminder_time)} />
                </Field>
                <Field label="Vorlauf in Tagen" htmlFor="st-lead" hint="0 heißt am Fälligkeitstag.">
                  <Input id="st-lead" name="individual_lead_days" type="number" min={0} max={30} required defaultValue={settings.individual_lead_days} />
                </Field>
              </div>
            </fieldset>

            <fieldset className="space-y-2 rounded-lg border border-line p-4">
              <legend className="px-1 text-[14px] font-semibold">Inhalt der E-Mails</legend>
              <label className="flex items-start gap-3 text-[15px]">
                <input type="radio" name="email_detail" value="full" defaultChecked={settings.email_detail === "full"} className="mt-1 accent-[var(--accent)]" />
                <span>
                  Ausführlich
                  <span className="block text-[13px] text-faint">Name, Anlass, Auszug aus der Notiz und letzte Begegnung.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-[15px]">
                <input type="radio" name="email_detail" value="minimal" defaultChecked={settings.email_detail === "minimal"} className="mt-1 accent-[var(--accent)]" />
                <span>
                  Datensparsam
                  <span className="block text-[13px] text-faint">Nur Name, Anlass und Link. Notizen verlassen das Register nicht.</span>
                </span>
              </label>
            </fieldset>

            <div className="flex justify-end">
              <SubmitButton pendingLabel="Speichert …">Einstellungen speichern</SubmitButton>
            </div>
          </ActionForm>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Status" />
            <ul className="space-y-2.5 px-4 py-4 text-[14px]">
              {checks.map((c) => (
                <li key={c.label} className="flex gap-2">
                  {c.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-ok" aria-label="In Ordnung" /> : <CircleAlert size={17} className="mt-0.5 shrink-0 text-warn" aria-label="Fehlt" />}
                  <span>
                    {c.label}
                    {!c.ok ? <span className="block text-[13px] text-warn">{c.fix}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-line px-4 py-3 text-[13px] text-muted">
              <div className="flex justify-between gap-3">
                <dt>Absender</dt>
                <dd className="truncate text-right">{process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Links zeigen auf</dt>
                <dd className="truncate text-right">{appUrl()}</dd>
              </div>
              {lastAny ? (
                <div className="flex justify-between gap-3">
                  <dt>Letzter Lauf</dt>
                  <dd className="text-right">
                    {formatDateTime(lastAny.started_at, settings.timezone)}, {SOURCE_LABEL[lastAny.source] ?? lastAny.source}
                    {lastAny.error ? <span className="block text-warn">mit Fehler</span> : null}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="space-y-3 border-t border-line px-4 py-4">
              <ActionForm action={sendTestEmail} resetOnSuccess={false} showSuccess>
                <SubmitButton variant="secondary" className="w-full" pendingLabel="Sendet …">
                  Test-E-Mail senden
                </SubmitButton>
              </ActionForm>
              <ActionForm action={runSchedulerNow} resetOnSuccess={false} showSuccess>
                <SubmitButton variant="ghost" className="w-full" pendingLabel="Läuft …">
                  Scheduler jetzt ausführen
                </SubmitButton>
              </ActionForm>
              <p className="text-[12px] text-faint">
                Zustellung im 10-Minuten-Raster, nicht sekundengenau. Details im{" "}
                <Link href="/einstellungen/versand" className="underline underline-offset-2">
                  Versandprotokoll
                </Link>
                .
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
