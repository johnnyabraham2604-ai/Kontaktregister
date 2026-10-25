"use client";

import { useState } from "react";
import { createLink } from "@/app/actions/organize";
import { LINK_KINDS } from "@/lib/labels";
import { ActionForm, SubmitButton } from "./client";
import { Field, Input, Select, Textarea } from "./ui";

export function LinkForm({ personId, firstName, people }: { personId: string; firstName: string; people: { id: string; name: string }[] }) {
  const [kind, setKind] = useState("acquaintances");
  const [filter, setFilter] = useState("");
  const visible = filter ? people.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase())) : people;
  return (
    <ActionForm action={createLink} className="space-y-4">
      <input type="hidden" name="person_a" value={personId} />
      <Field label="Person" htmlFor="link-person">
        <Input type="search" placeholder="Namen filtern" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-2 h-9" aria-label="Personen filtern" />
        <Select id="link-person" name="person_b" required size={Math.min(8, Math.max(3, visible.length))} className="h-auto py-1">
          {visible.map((p) => (
            <option key={p.id} value={p.id} className="px-1 py-0.5">
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Art der Verbindung" htmlFor="link-kind">
        <Select id="link-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {LINK_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      {kind === "introduced" ? (
        <Field label="Wer hat wen vorgestellt?" htmlFor="link-dir">
          <Select id="link-dir" name="direction" defaultValue="a_introduced_b">
            <option value="a_introduced_b">{firstName} hat mir die gewählte Person vorgestellt</option>
            <option value="b_introduced_a">Die gewählte Person hat mir {firstName} vorgestellt</option>
          </Select>
        </Field>
      ) : null}
      <Field label="Beschreibung" htmlFor="link-desc" hint="Optional, zum Beispiel: beide im Team von Prof. X">
        <Input id="link-desc" name="description" maxLength={300} />
      </Field>
      <Field label="Notiz" htmlFor="link-note" hint="Optional">
        <Textarea id="link-note" name="note" rows={2} className="min-h-0" maxLength={5000} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Speichert …">Verbindung speichern</SubmitButton>
      </div>
    </ActionForm>
  );
}
