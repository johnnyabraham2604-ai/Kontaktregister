import Link from "next/link";
import { Check, Mail } from "lucide-react";
import { cancelReminder, completeReminder, deleteReminder, postponeReminder, reopenReminder } from "@/app/actions/timeline";
import { ConfirmButton, Dialog, SubmitButton } from "./client";
import { ReminderForm } from "./reminder-form";
import { Avatar } from "./avatar";
import { Badge, buttonClass, cx } from "./ui";
import { dueState, formatDate, formatTime, relativeDay } from "@/lib/dates";
import { fullName } from "@/lib/labels";
import type { Reminder } from "@/lib/types";

export type ReminderWithPerson = Reminder & {
  person: { id: string; first_name: string; last_name: string; photo_path: string | null };
};

export function DueBadge({ due, today, status }: { due: string; today: string; status: Reminder["status"] }) {
  if (status === "done") return <Badge tone="ok">Erledigt</Badge>;
  if (status === "cancelled") return <Badge>Abgebrochen</Badge>;
  const s = dueState(due, today);
  if (s === "overdue") return <Badge tone="warn">Überfällig, {relativeDay(due, today)}</Badge>;
  if (s === "today") return <Badge tone="amber">Heute fällig</Badge>;
  return <Badge tone="accent">Geplant, {relativeDay(due, today)}</Badge>;
}

/**
 * Eine Wiedervorlage mit den direkten Aktionen Erledigt, Verschieben, Bearbeiten, Abbrechen.
 * `showPerson` blendet Name und Bild ein (Übersicht, Erinnerungsliste).
 */
export function ReminderItem({
  r,
  today,
  defaultTime,
  showPerson = true,
  photoUrl,
  highlight,
  compact,
}: {
  r: ReminderWithPerson;
  today: string;
  defaultTime: string;
  showPerson?: boolean;
  photoUrl?: string | null;
  highlight?: boolean;
  compact?: boolean;
}) {
  const open = r.status === "planned";
  return (
    <li
      id={`erinnerung-${r.id}`}
      className={cx("flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start", highlight && "bg-accent-soft/60 ring-1 ring-accent/30")}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        {showPerson ? (
          <Link href={`/personen/${r.person.id}`} className="shrink-0">
            <Avatar person={r.person} url={photoUrl} size={36} />
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          {showPerson ? (
            <Link href={`/personen/${r.person.id}`} className="font-semibold hover:underline">
              {fullName(r.person)}
            </Link>
          ) : null}
          <p className={cx("text-[15px]", !showPerson && "font-medium")}>{r.reason}</p>
          {r.note && !compact ? <p className="prose-notes mt-0.5 text-[14px] text-muted">{r.note}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-faint">
            <DueBadge due={r.due_date} today={today} status={r.status} />
            <span className="tabular">
              {formatDate(r.due_date)}
              {r.due_time ? `, ${formatTime(r.due_time)} Uhr` : ""}
            </span>
            {r.email_individual ? (
              <span className="inline-flex items-center gap-1" title="Mit eigener E-Mail">
                <Mail size={13} aria-hidden />
                {r.individual_sent_at ? "E-Mail gesendet" : "Eigene E-Mail"}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {open ? (
          <>
            <form action={completeReminder}>
              <input type="hidden" name="id" value={r.id} />
              <SubmitButton variant="secondary" size="sm">
                <Check size={15} aria-hidden />
                Erledigt
              </SubmitButton>
            </form>
            <details className="group relative">
              <summary className={cx(buttonClass("ghost", "sm"), "cursor-pointer list-none")}>Verschieben</summary>
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-line bg-surface p-2 shadow-lg">
                {[
                  ["1d", "Auf morgen"],
                  ["1w", "In einer Woche"],
                  ["1m", "In einem Monat"],
                  ["3m", "In drei Monaten"],
                ].map(([by, label]) => (
                  <form key={by} action={postponeReminder}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="by" value={by} />
                    <button className="w-full rounded-md px-2 py-1.5 text-left text-[14px] hover:bg-paper">{label}</button>
                  </form>
                ))}
                <form action={postponeReminder} className="mt-1 flex gap-1.5 border-t border-line pt-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input
                    type="date"
                    name="date"
                    required
                    min={today}
                    className="h-8 min-w-0 flex-1 rounded-md border border-line px-2 text-[13px]"
                    aria-label="Neues Datum"
                  />
                  <button className={buttonClass("secondary", "sm")}>OK</button>
                </form>
              </div>
            </details>
            {!compact ? (
              <>
                <Dialog label="Bearbeiten" title="Erinnerung bearbeiten" variant="ghost" size="sm">
                  <ReminderForm personId={r.person.id} reminder={r} defaultDate={today} defaultTime={defaultTime} />
                </Dialog>
                <form action={cancelReminder}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmButton variant="ghost" confirm="Diese Erinnerung abbrechen? Sie bleibt im Verlauf sichtbar.">
                    Abbrechen
                  </ConfirmButton>
                </form>
              </>
            ) : null}
          </>
        ) : (
          <>
            <form action={reopenReminder}>
              <input type="hidden" name="id" value={r.id} />
              <SubmitButton variant="ghost" size="sm">
                Wieder öffnen
              </SubmitButton>
            </form>
            <form action={deleteReminder}>
              <input type="hidden" name="id" value={r.id} />
              <ConfirmButton variant="ghost" confirm="Diese Erinnerung endgültig löschen?">
                Löschen
              </ConfirmButton>
            </form>
          </>
        )}
      </div>
    </li>
  );
}
