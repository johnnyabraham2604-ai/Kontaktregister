"use client";

import { useMemo, useState } from "react";
import Papa from "papaparse";
import { previewImport, restoreBackup, runImport, type Decision, type DuplicateInfo, type ImportRow } from "@/app/actions/data";
import { IMPORT_FIELDS } from "@/lib/csv";
import { Badge, Select, buttonClass, cx } from "./ui";

type Step = "file" | "map" | "preview" | "done";

function guess(header: string): string {
  const h = header.trim().toLowerCase();
  return IMPORT_FIELDS.find((f) => f.key === h || f.aliases.includes(h) || f.label.toLowerCase() === h)?.key ?? "";
}

/** CSV-Import in drei Schritten: Datei, Spalten zuordnen, Vorschau mit Dublettenprüfung. */
export function CsvImport() {
  const [step, setStep] = useState<Step>("file");
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<DuplicateInfo[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const rows: ImportRow[] = useMemo(
    () =>
      raw.map((r) => {
        const out: ImportRow = {};
        for (const [col, field] of Object.entries(mapping)) if (field) out[field] = (out[field] ? `${out[field]}, ` : "") + (r[col] ?? "");
        return out;
      }),
    [raw, mapping],
  );

  function onFile(file: File) {
    setMessage(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.replace(/^﻿/, "").trim(),
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        if (!hs.length || !res.data.length) return setMessage({ ok: false, text: "Die Datei enthält keine Zeilen mit Überschriften." });
        if (res.data.length > 3000) return setMessage({ ok: false, text: "Höchstens 3000 Zeilen pro Import. Bitte die Datei aufteilen." });
        setHeaders(hs);
        setRaw(res.data);
        setMapping(Object.fromEntries(hs.map((h) => [h, guess(h)])));
        setStep("map");
      },
      error: () => setMessage({ ok: false, text: "Die Datei konnte nicht gelesen werden." }),
    });
  }

  async function toPreview() {
    if (!Object.values(mapping).includes("first_name") && !Object.values(mapping).includes("last_name")) {
      return setMessage({ ok: false, text: "Bitte mindestens eine Spalte dem Vornamen zuordnen." });
    }
    setBusy(true);
    setMessage(null);
    const res = await previewImport(rows);
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: res.message ?? "Vorschau fehlgeschlagen." });
    setChecks(res.results);
    setDecisions(res.results.map((r) => (r.problem === "Name fehlt" ? "skip" : r.matchId || r.reason ? "skip" : "create")));
    setStep("preview");
  }

  async function doImport() {
    setBusy(true);
    const res = await runImport(rows, decisions, checks.map((c) => c.matchId));
    setBusy(false);
    setMessage({ ok: res.ok, text: res.message });
    setStep("done");
  }

  const counts = {
    create: decisions.filter((d) => d === "create").length,
    merge: decisions.filter((d) => d === "merge").length,
    skip: decisions.filter((d) => d === "skip").length,
  };

  return (
    <div className="space-y-4">
      {message ? (
        <p role="status" className={cx("rounded-lg px-3 py-2 text-[14px]", message.ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
          {message.text}
        </p>
      ) : null}

      {step === "file" || step === "done" ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong px-4 py-8 text-center hover:border-accent">
          <span className="font-medium">CSV-Datei wählen</span>
          <span className="text-[13px] text-muted">Komma oder Semikolon, erste Zeile mit Spaltennamen. Nichts wird gespeichert, bevor du die Vorschau bestätigst.</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      ) : null}

      {step === "map" ? (
        <div className="space-y-3">
          <p className="text-[14px] text-muted">{raw.length} Zeilen erkannt. Ordne die Spalten den Feldern im Register zu. Nicht zugeordnete Spalten werden ignoriert.</p>
          <div className="divide-y divide-line rounded-lg border border-line">
            {headers.map((h) => (
              <div key={h} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{h}</p>
                  <p className="truncate text-[12px] text-faint">{raw.slice(0, 3).map((r) => r[h]).filter(Boolean).join(", ")}</p>
                </div>
                <Select value={mapping[h] ?? ""} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })} className="h-9" aria-label={`Feld für Spalte ${h}`}>
                  <option value="">Nicht importieren</option>
                  {IMPORT_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("ghost")} onClick={() => setStep("file")}>
              Andere Datei
            </button>
            <button type="button" className={buttonClass("primary")} disabled={busy} onClick={toPreview}>
              {busy ? "Prüft …" : "Vorschau und Dublettenprüfung"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "preview" ? (
        <div className="space-y-3">
          <p className="text-[14px] text-muted">
            Prüfe jede Zeile. Mögliche Dubletten sind auf „Überspringen“ gesetzt. „Ergänzen“ füllt nur leere Felder der vorhandenen Person und fügt Kategorien und Tags hinzu,
            vorhandene Angaben bleiben unverändert.
          </p>
          <div className="max-h-[480px] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[640px] text-left text-[14px]">
              <thead className="sticky top-0 border-b border-line bg-surface text-[12px] text-faint">
                <tr>
                  <th className="px-3 py-2 font-medium">Zeile</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Firma, E-Mail</th>
                  <th className="px-3 py-2 font-medium">Prüfung</th>
                  <th className="px-3 py-2 font-medium">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => {
                  const c = checks[i];
                  return (
                    <tr key={i} className="align-top">
                      <td className="px-3 py-2 text-faint tabular">{i + 2}</td>
                      <td className="px-3 py-2 font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || <span className="text-faint">leer</span>}</td>
                      <td className="px-3 py-2 text-muted">{[r.company, r.email].filter(Boolean).join(", ")}</td>
                      <td className="px-3 py-2">
                        {c?.matchName ? (
                          <Badge tone="amber">
                            {c.reason}: {c.matchName}
                          </Badge>
                        ) : c?.reason ? (
                          <Badge tone="amber">{c.reason}</Badge>
                        ) : (
                          <Badge tone="ok">Neu</Badge>
                        )}
                        {c?.problem ? <p className="mt-1 text-[12px] text-warn">{c.problem}</p> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={decisions[i]}
                          onChange={(e) => setDecisions(decisions.map((d, j) => (j === i ? (e.target.value as Decision) : d)))}
                          className="h-8 w-36 text-[13px]"
                          aria-label={`Aktion für Zeile ${i + 2}`}
                          disabled={c?.problem === "Name fehlt"}
                        >
                          <option value="create">Neu anlegen</option>
                          {c?.matchId ? <option value="merge">Ergänzen</option> : null}
                          <option value="skip">Überspringen</option>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-muted">
              {counts.create} neu, {counts.merge} ergänzen, {counts.skip} überspringen
            </p>
            <div className="flex gap-2">
              <button type="button" className={buttonClass("ghost")} onClick={() => setStep("map")}>
                Zurück
              </button>
              <button type="button" className={buttonClass("primary")} disabled={busy || counts.create + counts.merge === 0} onClick={doImport}>
                {busy ? "Importiert …" : "Import ausführen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RestoreBackup() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function onFile(file: File) {
    if (!window.confirm("Datensätze aus dieser Sicherung hinzufügen? Vorhandene Einträge werden nicht verändert.")) return;
    setBusy(true);
    setMessage(null);
    const text = await file.text();
    const res = await restoreBackup(text);
    setBusy(false);
    setMessage({ ok: res.ok, text: res.message });
  }
  return (
    <div className="space-y-3">
      {message ? (
        <p role="status" className={cx("rounded-lg px-3 py-2 text-[14px]", message.ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
          {message.text}
        </p>
      ) : null}
      <label className={cx(buttonClass("secondary"), "cursor-pointer", busy && "pointer-events-none opacity-50")}>
        {busy ? "Stellt wieder her …" : "JSON-Sicherung wählen"}
        <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
    </div>
  );
}

