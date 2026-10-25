"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { saveNotes } from "@/app/actions/people";
import { ActionForm, SubmitButton } from "./client";
import { Field, Textarea, buttonClass } from "./ui";

const FIELDS = [
  { name: "about", label: "Über die Person", hint: "Interessen, Hobbys, was sie begeistert, Familie, gemeinsame Erlebnisse" },
  { name: "goals", label: "Ziele und Projekte", hint: "Woran sie arbeitet, wohin sie will" },
  { name: "open_items", label: "Offene Fragen und nächste Schritte", hint: "Was ich noch wissen oder tun wollte" },
] as const;

type Notes = { about: string | null; goals: string | null; open_items: string | null };

/** Notizen direkt auf der Profilseite lesen und bearbeiten. */
export function NotesEditor({ personId, notes, firstName }: { personId: string; notes: Notes; firstName: string }) {
  const empty = !notes.about && !notes.goals && !notes.open_items;
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditForm
        personId={personId}
        notes={notes}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="px-4 py-4">
      {empty ? (
        <div className="text-[15px] text-muted">
          <p>Noch nichts notiert. Was weißt du über {firstName}?</p>
          <button type="button" onClick={() => setEditing(true)} className={buttonClass("secondary", "sm", "mt-3")}>
            <Pencil size={14} aria-hidden />
            Notizen schreiben
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {FIELDS.map((f) =>
            notes[f.name] ? (
              <div key={f.name}>
                <h3 className="mb-1 text-[13px] font-medium text-muted">{f.label}</h3>
                <p className="prose-notes text-[15px] leading-relaxed">{notes[f.name]}</p>
              </div>
            ) : null,
          )}
          <button type="button" onClick={() => setEditing(true)} className={buttonClass("ghost", "sm", "-ml-2")}>
            <Pencil size={14} aria-hidden />
            Bearbeiten
          </button>
        </div>
      )}
    </div>
  );
}

function EditForm({ personId, notes, onDone }: { personId: string; notes: Notes; onDone: () => void }) {
  return (
    <ActionForm
      action={async (prev, fd) => {
        const res = await saveNotes(prev, fd);
        if (res?.ok) onDone();
        return res;
      }}
      className="space-y-4 px-4 py-4"
      resetOnSuccess={false}
    >
      <input type="hidden" name="id" value={personId} />
      {FIELDS.map((f, i) => (
        <Field key={f.name} label={f.label} htmlFor={`notes-${f.name}`} hint={f.hint}>
          <Textarea id={`notes-${f.name}`} name={f.name} rows={i === 0 ? 7 : 3} defaultValue={notes[f.name] ?? ""} autoFocus={i === 0} />
        </Field>
      ))}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={buttonClass("ghost")}>
          Abbrechen
        </button>
        <SubmitButton pendingLabel="Speichert …">Notizen speichern</SubmitButton>
      </div>
    </ActionForm>
  );
}
