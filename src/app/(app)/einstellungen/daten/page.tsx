import type { Metadata } from "next";
import { Download } from "lucide-react";
import { CsvImport, RestoreBackup } from "@/components/csv-import";
import { PageHeader, Panel, PanelHeader, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Import und Export" };

const EXPORTS = [
  { typ: "json", label: "Vollständige Sicherung (JSON)", hint: "Alle Personen, Notizen, Begegnungen, Erinnerungen, Kategorien, Tags, Verbindungen und eigenen Felder. Format dokumentiert in docs/EXPORTFORMAT.md." },
  { typ: "personen", label: "Personen (CSV)", hint: "Eine Zeile pro Person, mit Kategorien, Tags, Interessen und eigenen Feldern. Öffnet direkt in Excel." },
  { typ: "begegnungen", label: "Gesprächshistorie (CSV)", hint: "Alle Begegnungen und Notizen." },
  { typ: "erinnerungen", label: "Erinnerungen (CSV)", hint: "Alle Wiedervorlagen mit Status." },
  { typ: "ordnung", label: "Kategorien und Tags (CSV)", hint: "Kategorien, Tags und Interessen." },
  { typ: "verbindungen", label: "Verbindungen (CSV)", hint: "Verknüpfungen zwischen Personen." },
];

export default function DataPage() {
  return (
    <>
      <PageHeader title="Import und Export" description="Deine Daten gehören dir. Exportiere sie regelmäßig, besonders im kostenlosen Supabase-Tarif ohne automatische Backups." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Export" />
          <ul className="divide-y divide-line">
            {EXPORTS.map((e) => (
              <li key={e.typ} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">{e.label}</p>
                  <p className="text-[13px] text-muted">{e.hint}</p>
                </div>
                <a href={`/api/export?typ=${e.typ}`} className={buttonClass(e.typ === "json" ? "primary" : "secondary", "sm")} download>
                  <Download size={14} aria-hidden />
                  Laden
                </a>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-3 text-[12px] text-faint">Profilbilder sind nicht im Export enthalten. Sie liegen im Supabase-Speicher unter „avatars“.</p>
        </Panel>
        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Kontakte importieren (CSV)" />
            <div className="px-4 py-4">
              <CsvImport />
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Sicherung wiederherstellen" />
            <div className="space-y-3 px-4 py-4 text-[14px] text-muted">
              <p>
                Fügt Datensätze aus einer JSON-Sicherung hinzu, die hier fehlen, zum Beispiel nach einem Umzug in ein neues Supabase-Projekt. Einträge mit gleicher ID werden
                übersprungen, nichts wird überschrieben.
              </p>
              <RestoreBackup />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
