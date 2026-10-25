"use client";

import { UserPlus } from "lucide-react";
import { quickCreatePerson } from "@/app/actions/people";
import { ActionForm, Dialog, SubmitButton } from "./client";
import { Field, Input, Textarea } from "./ui";

/** Neue Person mit wenigen Angaben. Alles Weitere ergänzt man später im Profil. */
export function QuickAdd({
  categories,
  today,
  compact,
}: {
  categories: { id: string; name: string }[];
  today: string;
  compact?: boolean;
}) {
  return (
    <Dialog
      label={compact ? "" : "Neue Person"}
      title="Neue Person"
      variant="primary"
      icon={<UserPlus size={16} aria-hidden />}
      triggerClassName={compact ? "w-10 px-0" : undefined}
    >
      <ActionForm action={quickCreatePerson} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vorname" htmlFor="qa-first">
            <Input id="qa-first" name="first_name" required autoComplete="off" autoFocus maxLength={100} />
          </Field>
          <Field label="Nachname" htmlFor="qa-last" hint="Optional">
            <Input id="qa-last" name="last_name" autoComplete="off" maxLength={100} />
          </Field>
        </div>
        <Field label="Woher kenne ich die Person?" htmlFor="qa-context" hint="Zum Beispiel: Sitznachbar im Zug nach Shanghai, Vortrag über Batteriealterung">
          <Textarea id="qa-context" name="met_context" rows={2} className="min-h-0" maxLength={2000} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ort oder Veranstaltung" htmlFor="qa-place">
            <Input id="qa-place" name="met_place" maxLength={300} />
          </Field>
          <Field label="Kennengelernt am" htmlFor="qa-date">
            <Input id="qa-date" name="met_on" type="date" defaultValue={today} max="2100-12-31" />
          </Field>
        </div>
        {categories.length ? (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-muted">Kategorien</legend>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <label key={c.id} className="cursor-pointer">
                  <input type="checkbox" name="categories" value={c.id} className="peer sr-only" />
                  <span className="inline-block rounded-full border border-line-strong px-2.5 py-1 text-[13px] peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                    {c.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <SubmitButton pendingLabel="Speichert …">Anlegen und Profil öffnen</SubmitButton>
        </div>
      </ActionForm>
    </Dialog>
  );
}
