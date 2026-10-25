"use client";

import { savePerson } from "@/app/actions/people";
import type { FieldDefinition, Person } from "@/lib/types";
import { ActionForm, ChipPicker, SubmitButton } from "./client";
import { Field, Input, LinkButton, Textarea } from "./ui";

type Opt = { id: string; name: string };

function Section({ title, id, children, description }: { title: string; id?: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 grid gap-4 border-t border-line py-6 first:border-t-0 first:pt-0 md:grid-cols-[200px_minmax(0,1fr)]">
      <div>
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function PersonForm({
  person,
  categories,
  tags,
  interests,
  selectedCategories = [],
  selectedTags = [],
  fieldDefs,
  countries,
  cancelHref,
}: {
  person?: Person;
  categories: Opt[];
  tags: Opt[];
  interests: Opt[];
  selectedCategories?: string[];
  selectedTags?: string[];
  fieldDefs: FieldDefinition[];
  countries: string[];
  cancelHref: string;
}) {
  const p = person;
  const v = (k: keyof Person) => {
    const x = p?.[k];
    return typeof x === "string" ? x : "";
  };
  return (
    <ActionForm action={savePerson} resetOnSuccess={false} className="rounded-xl border border-line bg-surface p-5 sm:p-7">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <datalist id="pf-countries">
        {countries.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <Section title="Name">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vorname" htmlFor="pf-first">
            <Input id="pf-first" name="first_name" required maxLength={100} defaultValue={v("first_name")} autoComplete="off" />
          </Field>
          <Field label="Nachname" htmlFor="pf-last" hint="Optional">
            <Input id="pf-last" name="last_name" maxLength={100} defaultValue={v("last_name")} autoComplete="off" />
          </Field>
        </div>
        <Field label="Spitzname oder bevorzugte Anrede" htmlFor="pf-nick">
          <Input id="pf-nick" name="nickname" maxLength={100} defaultValue={v("nickname")} className="sm:max-w-xs" />
        </Field>
      </Section>

      <Section title="Woher ich sie kenne" description="Hilft am meisten, sich später zu erinnern.">
        <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <Field label="Datum" htmlFor="pf-meton">
            <Input id="pf-meton" name="met_on" type="date" defaultValue={v("met_on")} />
          </Field>
          <Field label="Ort oder Veranstaltung" htmlFor="pf-metplace">
            <Input id="pf-metplace" name="met_place" maxLength={300} defaultValue={v("met_place")} />
          </Field>
        </div>
        <Field label="Land des Kennenlernens" htmlFor="pf-metcountry">
          <Input id="pf-metcountry" name="met_country" list="pf-countries" maxLength={120} defaultValue={v("met_country")} className="sm:max-w-xs" />
        </Field>
        <Field label="Kontext" htmlFor="pf-metcontext">
          <Textarea id="pf-metcontext" name="met_context" rows={3} maxLength={2000} defaultValue={v("met_context")} />
        </Field>
      </Section>

      <Section title="Beruf">
        <Field label="Beruf oder Position" htmlFor="pf-occ">
          <Input id="pf-occ" name="occupation" maxLength={200} defaultValue={v("occupation")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unternehmen" htmlFor="pf-company">
            <Input id="pf-company" name="company" maxLength={200} defaultValue={v("company")} />
          </Field>
          <Field label="Universität oder Organisation" htmlFor="pf-org">
            <Input id="pf-org" name="organization" maxLength={200} defaultValue={v("organization")} />
          </Field>
        </div>
      </Section>

      <Section title="Kontakt und Orte">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-Mail" htmlFor="pf-email">
            <Input id="pf-email" name="email" type="email" maxLength={320} defaultValue={v("email")} />
          </Field>
          <Field label="Telefon" htmlFor="pf-phone">
            <Input id="pf-phone" name="phone" type="tel" maxLength={60} defaultValue={v("phone")} />
          </Field>
          <Field label="Wohnort" htmlFor="pf-city">
            <Input id="pf-city" name="city" maxLength={120} defaultValue={v("city")} />
          </Field>
          <Field label="Land" htmlFor="pf-country">
            <Input id="pf-country" name="country" list="pf-countries" maxLength={120} defaultValue={v("country")} />
          </Field>
        </div>
        <Field label="Herkunftsland" htmlFor="pf-origin" hint="Nur eintragen, wenn die Person es selbst erzählt hat.">
          <Input id="pf-origin" name="origin_country" list="pf-countries" maxLength={120} defaultValue={v("origin_country")} className="sm:max-w-xs" />
        </Field>
        <Field label="Sprachen" htmlFor="pf-lang" hint="Durch Komma getrennt">
          <Input id="pf-lang" name="languages" defaultValue={p?.languages.join(", ") ?? ""} />
        </Field>
        <Field label="Website und Profile" htmlFor="pf-links" hint="Ein Link pro Zeile">
          <Textarea id="pf-links" name="links" rows={2} className="min-h-0" defaultValue={p?.links.join("\n") ?? ""} />
        </Field>
      </Section>

      <Section title="Ordnung" id="ordnung" description="Kategorien ordnen ein, Tags markieren Themen, Interessen sind über das ganze Register suchbar.">
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">Kategorien</p>
          {categories.length ? (
            <ChipPicker name="categories" options={categories} selected={selectedCategories} allowCreate={false} />
          ) : (
            <p className="text-[13px] text-faint">Lege Kategorien unter Ordnung an.</p>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">Interessen</p>
          <ChipPicker name="interests" options={interests} selected={selectedTags.filter((id) => interests.some((i) => i.id === id))} placeholder="Neues Interesse, z. B. Robotik" />
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-muted">Tags</p>
          <ChipPicker name="tags" options={tags} selected={selectedTags.filter((id) => tags.some((t) => t.id === id))} placeholder="Neuer Tag, z. B. Automotive" />
        </div>
      </Section>

      <Section title="Was ich weiß">
        <Field label="Über die Person" htmlFor="pf-about" hint="Interessen, Hobbys, was sie begeistert, gemeinsame Erlebnisse">
          <Textarea id="pf-about" name="about" rows={6} defaultValue={v("about")} />
        </Field>
        <Field label="Ziele und Projekte" htmlFor="pf-goals">
          <Textarea id="pf-goals" name="goals" rows={3} defaultValue={v("goals")} />
        </Field>
        <Field label="Offene Fragen und nächste Schritte" htmlFor="pf-open">
          <Textarea id="pf-open" name="open_items" rows={3} defaultValue={v("open_items")} />
        </Field>
      </Section>

      {fieldDefs.length ? (
        <Section title="Eigene Felder">
          <div className="grid gap-4 sm:grid-cols-2">
            {fieldDefs.map((d) => (
              <Field key={d.id} label={d.label} htmlFor={`pf-cf-${d.key}`}>
                <Input
                  id={`pf-cf-${d.key}`}
                  name={`cf_${d.key}`}
                  type={d.field_type === "date" ? "date" : d.field_type === "url" ? "url" : "text"}
                  inputMode={d.field_type === "number" ? "decimal" : undefined}
                  defaultValue={p?.custom_fields?.[d.key] ?? ""}
                  maxLength={2000}
                />
              </Field>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="sticky bottom-16 -mx-5 -mb-5 flex justify-end gap-2 rounded-b-xl border-t border-line bg-surface/95 px-5 py-3 backdrop-blur sm:-mx-7 sm:-mb-7 sm:px-7 lg:bottom-0">
        <LinkButton href={cancelHref} variant="ghost">
          Abbrechen
        </LinkButton>
        <SubmitButton pendingLabel="Speichert …">{p ? "Änderungen speichern" : "Person anlegen"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
