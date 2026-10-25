import type { Metadata } from "next";
import Link from "next/link";
import { getFieldDefinitions, getTaxonomy, requireUser } from "@/lib/data";
import { FIELD_TYPES } from "@/lib/labels";
import { ActionForm, ConfirmButton, Dialog, SubmitButton } from "@/components/client";
import { Badge, EmptyState, Field, Input, PageHeader, Panel, PanelHeader, Select, cx } from "@/components/ui";
import { archiveField, archiveLabel, createField, createLabel, deleteLabel, mergeTags, renameField, renameLabel } from "@/app/actions/organize";

export const metadata: Metadata = { title: "Ordnung" };

const TABS = [
  { key: "kategorien", label: "Kategorien", type: "category" as const, help: "Kategorien ordnen Personen ein, zum Beispiel Arbeit, Freunde, Reisen. Eine Person kann in mehreren sein." },
  { key: "interessen", label: "Interessen", type: "interest" as const, help: "Interessen der Person selbst. Über das ganze Register filterbar, unabhängig von Kategorien." },
  { key: "tags", label: "Tags", type: "tag" as const, help: "Freie Schlagwörter für Themen und Eigenschaften, zum Beispiel Automotive, China, gemeinsames Projekt." },
  { key: "felder", label: "Eigene Felder", type: null, help: "Zusätzliche Felder im Profil, zum Beispiel Branche oder Fachgebiet. Die Datenbank muss dafür nicht geändert werden." },
];

export default async function OrganizePage({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  const { bereich = "kategorien" } = await searchParams;
  const tab = TABS.find((t) => t.key === bereich) ?? TABS[0];
  const { supabase } = await requireUser();
  const [taxonomy, fields] = await Promise.all([getTaxonomy(), getFieldDefinitions()]);

  const counts = new Map<string, number>();
  if (tab.type === "category") {
    const { data } = await supabase.from("person_categories").select("category_id, people!inner(deleted_at)").is("people.deleted_at", null);
    for (const r of data ?? []) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1);
  } else if (tab.type) {
    const { data } = await supabase.from("person_tags").select("tag_id, people!inner(deleted_at)").is("people.deleted_at", null);
    for (const r of data ?? []) counts.set(r.tag_id, (counts.get(r.tag_id) ?? 0) + 1);
  }

  const items =
    tab.type === "category" ? taxonomy.categories : tab.type === "interest" ? taxonomy.interests : tab.type === "tag" ? taxonomy.tags : [];
  const filterKey = tab.type === "category" ? "kat" : tab.type === "interest" ? "int" : "tag";

  return (
    <>
      <PageHeader title="Ordnung" description="Kategorien, Interessen, Tags und eigene Felder verwalten." />
      <nav aria-label="Bereich" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/ordnung?bereich=${t.key}`}
            aria-current={tab.key === t.key ? "page" : undefined}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[14px]",
              tab.key === t.key ? "border-accent font-semibold text-accent" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <p className="mb-4 max-w-2xl text-[14px] text-muted">{tab.help}</p>

      {tab.type ? (
        <Panel>
          <PanelHeader title={tab.label} count={items.filter((i) => !i.archived_at).length} />
          <div className="border-b border-line px-4 py-3">
            <ActionForm action={createLabel} className="flex gap-2">
              <input type="hidden" name="type" value={tab.type} />
              <Input name="name" required maxLength={60} placeholder={tab.type === "category" ? "Neue Kategorie" : tab.type === "interest" ? "Neues Interesse" : "Neuer Tag"} className="h-9" aria-label="Name" />
              <SubmitButton size="sm" className="h-9">
                Anlegen
              </SubmitButton>
            </ActionForm>
          </div>
          {items.length === 0 ? (
            <EmptyState title="Noch keine Einträge." />
          ) : (
            <ul className="divide-y divide-line">
              {items.map((it) => {
                const n = counts.get(it.id) ?? 0;
                return (
                  <li key={it.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <span className={cx("text-[15px]", it.archived_at && "text-faint line-through")}>{it.name}</span>{" "}
                      {it.archived_at ? <Badge>Archiviert</Badge> : null}
                    </div>
                    <Link href={`/personen?${filterKey}=${it.id}`} className="text-[13px] text-muted hover:text-ink tabular">
                      {n === 1 ? "1 Person" : `${n} Personen`}
                    </Link>
                    <Dialog label="Umbenennen" title="Umbenennen" variant="ghost" size="sm">
                      <ActionForm action={renameLabel} className="space-y-3">
                        <input type="hidden" name="type" value={tab.type!} />
                        <input type="hidden" name="id" value={it.id} />
                        <Input name="name" defaultValue={it.name} required maxLength={60} aria-label="Neuer Name" />
                        <div className="flex justify-end">
                          <SubmitButton>Speichern</SubmitButton>
                        </div>
                      </ActionForm>
                    </Dialog>
                    {tab.type !== "category" && items.length > 1 ? (
                      <Dialog label="Zusammenführen" title={`„${it.name}“ zusammenführen`} variant="ghost" size="sm">
                        <ActionForm action={mergeTags} className="space-y-3">
                          <input type="hidden" name="id" value={it.id} />
                          <Field label="Alle Zuordnungen übertragen auf" htmlFor={`merge-${it.id}`}>
                            <Select id={`merge-${it.id}`} name="into" required>
                              {items
                                .filter((o) => o.id !== it.id)
                                .map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.name}
                                  </option>
                                ))}
                            </Select>
                          </Field>
                          <p className="text-[13px] text-muted">„{it.name}“ wird danach gelöscht. Nützlich bei doppelten Schreibweisen.</p>
                          <div className="flex justify-end">
                            <SubmitButton>Zusammenführen</SubmitButton>
                          </div>
                        </ActionForm>
                      </Dialog>
                    ) : null}
                    <form action={archiveLabel}>
                      <input type="hidden" name="type" value={tab.type!} />
                      <input type="hidden" name="id" value={it.id} />
                      <input type="hidden" name="archived" value={it.archived_at ? "0" : "1"} />
                      <SubmitButton variant="ghost" size="sm">
                        {it.archived_at ? "Wiederherstellen" : "Archivieren"}
                      </SubmitButton>
                    </form>
                    <form action={deleteLabel}>
                      <input type="hidden" name="type" value={tab.type!} />
                      <input type="hidden" name="id" value={it.id} />
                      <ConfirmButton
                        variant="ghost"
                        confirm={n ? `„${it.name}“ löschen? Die Zuordnung bei ${n} ${n === 1 ? "Person" : "Personen"} geht verloren. Archivieren behält sie.` : `„${it.name}“ löschen?`}
                      >
                        Löschen
                      </ConfirmButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ) : (
        <Panel>
          <PanelHeader title="Eigene Felder" count={fields.filter((f) => !f.archived_at).length} />
          <div className="border-b border-line px-4 py-3">
            <ActionForm action={createField} className="flex flex-wrap gap-2">
              <Input name="label" required maxLength={60} placeholder="Bezeichnung, z. B. Branche" className="h-9 min-w-48 flex-1" aria-label="Bezeichnung" />
              <Select name="field_type" defaultValue="text" className="h-9 w-auto" aria-label="Feldtyp">
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <SubmitButton size="sm" className="h-9">
                Anlegen
              </SubmitButton>
            </ActionForm>
          </div>
          {fields.length === 0 ? (
            <EmptyState title="Noch keine eigenen Felder.">Felder erscheinen danach im Bearbeitungsformular jeder Person und werden in der Suche berücksichtigt.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {fields.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className={cx("text-[15px]", f.archived_at && "text-faint line-through")}>{f.label}</span>{" "}
                    <Badge>{FIELD_TYPES.find((t) => t.value === f.field_type)?.label}</Badge> {f.archived_at ? <Badge>Archiviert</Badge> : null}
                  </div>
                  <Dialog label="Umbenennen" title="Feld umbenennen" variant="ghost" size="sm">
                    <ActionForm action={renameField} className="space-y-3">
                      <input type="hidden" name="id" value={f.id} />
                      <Input name="label" defaultValue={f.label} required maxLength={60} aria-label="Neue Bezeichnung" />
                      <div className="flex justify-end">
                        <SubmitButton>Speichern</SubmitButton>
                      </div>
                    </ActionForm>
                  </Dialog>
                  <form action={archiveField}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="archived" value={f.archived_at ? "0" : "1"} />
                    <SubmitButton variant="ghost" size="sm">
                      {f.archived_at ? "Wiederherstellen" : "Archivieren"}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-4 py-3 text-[13px] text-faint">
            Archivierte Felder verschwinden aus dem Formular, ihre Werte bleiben erhalten und erscheinen im Export.
          </p>
        </Panel>
      )}
    </>
  );
}
