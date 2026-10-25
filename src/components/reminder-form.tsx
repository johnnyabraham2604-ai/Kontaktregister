"use client";

import { saveReminder } from "@/app/actions/timeline";
import { ActionForm, SubmitButton } from "./client";
import { Checkbox, Field, Input, Textarea } from "./ui";
import type { Reminder } from "@/lib/types";

/** Felder einer Wiedervorlage. Wird auch im kombinierten Formular "Treffen festhalten" benutzt. */
export function ReminderFields({
  prefix = "",
  defaults,
  defaultDate,
  defaultTime,
}: {
  prefix?: string;
  defaults?: Partial<Reminder>;
  defaultDate: string;
  defaultTime: string;
}) {
  const id = (n: string) => `${prefix || "rem-"}${n}${defaults?.id ?? ""}`;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Field label="Fällig am" htmlFor={id("date")}>
          <Input id={id("date")} name={`${prefix}due_date`} type="date" required defaultValue={defaults?.due_date ?? defaultDate} />
        </Field>
        <Field label="Uhrzeit" htmlFor={id("time")} hint={`Ohne Angabe ${defaultTime.slice(0, 5)} Uhr`}>
          <Input id={id("time")} name={`${prefix}due_time`} type="time" defaultValue={defaults?.due_time?.slice(0, 5) ?? ""} />
        </Field>
      </div>
      <Field label="Anlass" htmlFor={id("reason")}>
        <Input
          id={id("reason")}
          name={`${prefix}reason`}
          required
          maxLength={200}
          placeholder="Zum Beispiel: nach dem Ergebnis der Bewerbung fragen"
          defaultValue={defaults?.reason ?? ""}
        />
      </Field>
      <Field label="Notiz oder Gesprächskontext" htmlFor={id("note")} hint="Optional">
        <Textarea id={id("note")} name={`${prefix}note`} rows={2} className="min-h-0" maxLength={5000} defaultValue={defaults?.note ?? ""} />
      </Field>
      <Checkbox
        name={`${prefix}email_individual`}
        label="Zusätzlich eine eigene E-Mail schicken"
        hint="Sonst erscheint die Erinnerung nur in der täglichen Übersicht und im Register."
        defaultChecked={defaults?.email_individual ?? false}
      />
    </div>
  );
}

export function ReminderForm({
  personId,
  reminder,
  defaultDate,
  defaultTime,
}: {
  personId: string;
  reminder?: Reminder;
  defaultDate: string;
  defaultTime: string;
}) {
  return (
    <ActionForm action={saveReminder} className="space-y-4" resetOnSuccess={!reminder}>
      <input type="hidden" name="person_id" value={personId} />
      {reminder ? <input type="hidden" name="id" value={reminder.id} /> : null}
      <ReminderFields defaults={reminder} defaultDate={defaultDate} defaultTime={defaultTime} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Speichert …">{reminder ? "Änderungen speichern" : "Kontakttermin festlegen"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
