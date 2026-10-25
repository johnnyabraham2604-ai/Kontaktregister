import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFieldDefinitions, getTaxonomy, requireUser } from "@/lib/data";
import { countryNames } from "@/lib/countries";
import { fullName } from "@/lib/labels";
import type { Person } from "@/lib/types";
import { PersonForm } from "@/components/person-form";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Profil bearbeiten" };

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireUser();
  const [{ data }, taxonomy, fieldDefs] = await Promise.all([
    supabase.from("people").select("*, person_categories(category_id), person_tags(tag_id)").eq("id", id).maybeSingle(),
    getTaxonomy(),
    getFieldDefinitions(),
  ]);
  if (!data) notFound();
  const person = data as Person & { person_categories: { category_id: string }[]; person_tags: { tag_id: string }[] };
  const selectedCategories = person.person_categories.map((c) => c.category_id);
  const selectedTags = person.person_tags.map((t) => t.tag_id);
  const keep = <T extends { id: string; name: string; archived_at: string | null }>(list: T[], selected: string[]) =>
    list.filter((x) => !x.archived_at || selected.includes(x.id)).map((x) => ({ id: x.id, name: x.name }));

  return (
    <>
      <PageHeader title={fullName(person)} description="Profil bearbeiten. Alles außer dem Vornamen ist freiwillig." />
      <PersonForm
        person={person}
        categories={keep(taxonomy.categories, selectedCategories)}
        tags={keep(taxonomy.tags, selectedTags)}
        interests={keep(taxonomy.interests, selectedTags)}
        selectedCategories={selectedCategories}
        selectedTags={selectedTags}
        fieldDefs={fieldDefs.filter((d) => !d.archived_at)}
        countries={countryNames()}
        cancelHref={`/personen/${person.id}`}
      />
    </>
  );
}
