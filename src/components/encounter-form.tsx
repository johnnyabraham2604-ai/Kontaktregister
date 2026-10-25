"use client";

import { useState } from "react";
import { saveEncounter } from "@/app/actions/timeline";
import { ENCOUNTER_KINDS } from "@/lib/labels";
import type { Encounter } from "@/lib/types";
import { ActionForm, ChipPicker, SubmitButton } from "./client";
import { ReminderFields } from "./reminder-form";
import { Field, Input, Select, Textarea } from "./ui";

/**
 * Begegnung festhalten. Mit "Nächsten Kontakt planen" entsteht im selben Schritt eine Wiedervorlage.
 */
export function EncounterForm({
  personId,
  encounter,
  tagIds = [],
  tags,
  today,
  nextDefaultDate,
  defaultTime,
}: {
  personId: string;
  encounter?: Encounter;
  tagIds?: string[];
  tags: { id: string; name: string }[];
  today: string;
  nextDefaultDate: string;
  defaultTime: string;
}) {
  const [planNext, setPlanNext] = useState(false);
  const uid = encounter?.id ?? "new";
  return (
    <ActionForm action={saveEncounter} className="space-y-4" resetOnSuccess={!encounter}>
      <input type="hidden" name="person_id" value={personId} />
      {encounter ? <input type="hidden" name="id" value={encounter.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_150px_120px]">
        <Field label="Art" htmlFor={`enc-kind-${uid}`}>
          <Select id={`enc-kind-${uid}`} name="kind" defaultValue={encounter?.kind ?? "meeting"}>
            {ENCOUNTER_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Datum" htmlFor={`enc-date-${uid}`}>
          <Input id={`enc-date-${uid}`} name="occurred_on" type="date" required defaultValue={encounter?.occurred_on ?? today} />
        </Field>
        <Field label="Uhrzeit" htmlFor={`enc-time-${uid}`}>
          <Input id={`enc-time-${uid}`} name="occurred_time" type="time" defaultValue={encounter?.occurred_time?.slice(0, 5) ?? ""} />
        </Field>
      </div>
      <Field label="Ort oder Veranstaltung" htmlFor={`enc-loc-${uid}`}>
        <Input id={`enc-loc-${uid}`} name="location" maxLength={300} defaultValue={encounter?.location ?? ""} />
      </Field>
      <Field label="Besprochene Themen" htmlFor={`enc-topics-${uid}`} hint="Kurz und durchsuchbar, zum Beispiel: Promotion, Umzug nach Stuttgart, Laufen">
        <Input id={`enc-topics-${uid}`} name="topics" maxLength={2000} defaultValue={encounter?.topics ?? ""} />
      </Field>
      <Field label="Notizen zum Gespräch" htmlFor={`enc-notes-${uid}`}>
        <Textarea id={`enc-notes-${uid}`} name="notes" rows={5} maxLength={50000} defaultValue={encounter?.notes ?? ""} />
      </Field>
      <Field label="Vereinbarungen und offene Punkte" htmlFor={`enc-agree-${uid}`}>
        <Textarea id={`enc-agree-${uid}`} name="agreements" rows={2} className="min-h-0" maxLength={5000} defaultValue={encounter?.agreements ?? ""} />
      </Field>
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-muted">Tags</p>
        <ChipPicker name="tags" options={tags} selected={tagIds} placeholder="Neuen Tag hinzufügen" />
      </div>
      {!encounter ? (
        <div className="rounded-lg border border-line bg-paper p-3">
          <label className="flex items-center gap-2 text-[15px] font-medium">
            <input type="checkbox" name="plan_next" checked={planNext} onChange={(e) => setPlanNext(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Nächsten Kontakt planen
          </label>
          {planNext ? (
            <div className="mt-3">
              <ReminderFields prefix="next_" defaultDate={nextDefaultDate} defaultTime={defaultTime} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Speichert …">{encounter ? "Änderungen speichern" : "Begegnung speichern"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
