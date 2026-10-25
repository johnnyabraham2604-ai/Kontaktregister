import type { Metadata } from "next";
import { getFieldDefinitions, getTaxonomy } from "@/lib/data";
import { countryNames } from "@/lib/countries";
import { PersonForm } from "@/components/person-form";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Neue Person" };

export default async function NewPersonPage() {
  const [taxonomy, fieldDefs] = await Promise.all([getTaxonomy(), getFieldDefinitions()]);
  const active = <T extends { id: string; name: string; archived_at: string | null }>(list: T[]) =>
    list.filter((x) => !x.archived_at).map((x) => ({ id: x.id, name: x.name }));
  return (
    <>
      <PageHeader title="Neue Person" description="Nur der Vorname ist Pflicht. Alles andere kannst du später ergänzen." />
      <PersonForm
        categories={active(taxonomy.categories)}
        tags={active(taxonomy.tags)}
        interests={active(taxonomy.interests)}
        fieldDefs={fieldDefs.filter((d) => !d.archived_at)}
        countries={countryNames()}
        cancelHref="/personen"
      />
    </>
  );
}
