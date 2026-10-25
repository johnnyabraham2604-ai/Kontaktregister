# Testprotokoll

Durchgeführt am 25. Oktober 2026 mit dieser Version des Codes. Es beschreibt nicht die spätere Produktionsumgebung.

## Überblick

| Ebene | Umgebung | Ergebnis |
|:--|:--|:--|
| Zeitlogik, Sommerzeit, Fehlerklassen | Vitest, reine Funktionen | 15 von 15 bestanden |
| Datenbankschema, RLS, Suche, Outbox | Vitest mit PGlite (Postgres in WebAssembly) und dem echten Migrationsskript | 17 von 17 bestanden |
| Scheduler Ende zu Ende mit simulierter Uhrzeit | Vitest, echter Dispatcher gegen PGlite mit echtem Schema, Versand an eine Testfunktion | 13 von 13 bestanden |
| Browser, alle Kernfunktionen | Produktions-Build der App gegen einen lokalen Supabase-Nachbau (PostgreSQL 16, Supabase Auth v2.177, PostgREST v12.2) und einen Resend-Nachbau; Chromium über Playwright, Desktop, Mobil 390 px, Dunkelmodus | 39 von 39 bestanden |
| Scheduler-Endpunkt, Idempotenz, Warnungen, RLS über HTTP | Gleicher lokaler Stack, Aufrufe per curl | alle bestanden, siehe unten |
| Build, Typprüfung, Lint | `next build`, `tsc`, `eslint` | fehlerfrei |

## Nicht getestet

- **Echter E-Mail-Versand über Resend.** Getestet wurde gegen einen Nachbau der Resend-API mit derselben Schnittstelle, inklusive Idempotency-Key. Der echte Versand ist Schritt 6 der Einrichtung.
- **pg_cron und pg_net in Supabase.** Lokal nicht verfügbar. `supabase/cron.sql` folgt dem von Supabase dokumentierten Muster; der Endpunkt, den es aufruft, ist getestet. Nach der Einrichtung prüfen über `net._http_response` und den Status in der App.
- **Vercel-Bereitstellung, Region und Vercel-Cron.** Lokal mit `next start` getestet.
- **Profilbild-Upload.** Supabase Storage gibt es lokal nicht. Die Speicherregeln wurden gegen nachgebaute Tabellen eingespielt, aber nicht funktional getestet.
- **Passwort zurücksetzen** per E-Mail-Link.
- **Safari und Firefox.** Getestet wurde Chromium.

## Browsertest

Skript `tests/e2e/e2e.py`, Testdaten `tests/e2e/import.csv` mit Namen in lateinischer, chinesischer und äthiopischer Schrift, einer Dublette und einer Zeile ohne Nachnamen.

| Ergebnis | Prüfung |
|:--|:--|
| bestanden | Unangemeldet wird zur Anmeldung geleitet  [http://localhost:3000/login?next=%2Fpersonen] |
| bestanden | Falsches Passwort wird abgelehnt |
| bestanden | Anmeldung und Rücksprung zur Zielseite |
| bestanden | Leere Übersicht mit Startaufforderung |
| bestanden | Schnellerfassung legt Person an und öffnet Profil |
| bestanden | Profil gespeichert mit Interessen und Tags |
| bestanden | Link normalisiert |
| bestanden | Begegnung erscheint im Verlauf |
| bestanden | Kontakttermin aus Begegnung angelegt |
| bestanden | Letzter Kontakt im Kopf abgeleitet |
| bestanden | Notiz im Verlauf, zählt nicht als Kontakt |
| bestanden | Dublette innerhalb der Datei erkannt  [1] |
| bestanden | Zeile ohne verwertbaren Namen markiert |
| bestanden | CSV-Import abgeschlossen  [Import abgeschlossen: 8 neu angelegt, 0 ergänzt, 1 übersprungen.] |
| bestanden | Zweiter Import erkennt vorhandene Personen  [9] |
| bestanden | Alphabetische Gruppen |
| bestanden | Volltextsuche findet Begegnungsinhalt und Profil  [Kerstin Hagen „Kiki“] |
| bestanden | Suche nach chinesischem Namen |
| bestanden | Suche in Ge'ez-Schrift |
| bestanden | Kombinierter Filter China + Technologie  [Kerstin Hagen „Kiki“;Lin 李;Wei Zhang] |
| bestanden | Dreifach-Filter China + Technologie + Firma  [Wei Zhang] |
| bestanden | Aktive Filter als Chips |
| bestanden | Einzelnen Filter entfernen |
| bestanden | Filter Kontaktstatus heute |
| bestanden | Überfällige Erinnerung angelegt |
| bestanden | Übersicht zeigt heute fällige und überfällige |
| bestanden | Verschieben aus Liste |
| bestanden | Einstellungen speichern |
| bestanden | Test-E-Mail über Resend-Nachbau  [Test-E-Mail gesendet. Resend-ID fake_7. Bitte Posteingang und Spam prüfen.] |
| bestanden | JSON-Export vollständig  [9 Personen] |
| bestanden | JSON-Export ohne interne Felder |
| bestanden | CSV-Export mit BOM, Semikolon und Unicode |
| bestanden | JSON-Wiederherstellung fügt nur Fehlendes hinzu  [Wiederhergestellt: 1 Personen, 0 Begegnungen, 0 Erinnerungen, 0 Kategorien und Tags. Vorhandene Datensätze wurden nicht verändert.] |
| bestanden | Wiederhergestellte Person mit Kategorie |
| bestanden | Person in Papierkorb, aus Verzeichnis verschwunden |
| bestanden | Wiederherstellen aus Papierkorb |
| bestanden | Mobil ohne horizontales Scrollen  [scrollWidth 390] |
| bestanden | Fremdes Konto wird abgewiesen (ALLOWED_EMAIL) |
| bestanden | Keine Browser-Fehler in der Konsole |

## Scheduler-Endpunkt und Sicherheit über HTTP

| Ergebnis | Prüfung | Beobachtung |
|:--|:--|:--|
| bestanden | Zwei gleichzeitige Läufe (pg_cron und Kontrolllauf), danach ein dritter | 1 Einzel-Erinnerung und 1 Sammel-E-Mail bei Resend angekommen, keine Duplikate |
| bestanden | Outbox nach Versand | Status „sent“, Resend-ID gespeichert, zwischengespeicherter Inhalt gelöscht |
| bestanden | Inhalt der Einzel-Erinnerung | Name, Fälligkeit, Anlass, letzte Begegnung mit Themen, Link mit Sprung zur Erinnerung, nur gespeicherte Angaben |
| bestanden | Endpunkt ohne oder mit falschem Secret | HTTP 401 |
| bestanden | Kontrolllauf ohne pg_cron-Läufe | Warn-E-Mail „Der Datenbank-Scheduler läuft nicht“ an ALERT_EMAIL |
| bestanden | Datenbank-API gestoppt | HTTP 503 und Warn-E-Mail „Datenbank nicht erreichbar“ |
| bestanden | Fremder Nutzer liest Personen über REST | leere Liste |
| bestanden | Fremder Nutzer legt Erinnerung für fremde Person an | HTTP 403, RLS-Verletzung |
| bestanden | Fremder Nutzer ändert fremde Person | 0 Zeilen geändert |
| bestanden | Angemeldeter Nutzer schreibt in die Outbox oder ruft claim_outbox | HTTP 403 |
| bestanden | Anonymer Aufruf der Suche | HTTP 401 |
| bestanden | Export-Download ohne Anmeldung | Umleitung zur Anmeldung |

## Während der Tests gefundene und behobene Fehler

- Nach einer fehlgeschlagenen Anmeldung oder einer Validierungsmeldung leerte React 19 alle Formularfelder. Formulare senden jetzt so ab, dass Eingaben bei Fehlern erhalten bleiben.
- Content-Security-Policy erzwang `https` für die Supabase-Adresse. Jetzt wird der tatsächliche Ursprung übernommen.
- Auswahlfelder im Filterbereich nahmen die volle Breite ein, Spalten der Personenliste waren je Zeile unterschiedlich ausgerichtet.

## Unit- und Datenbanktests

`npm test`

| Ergebnis | Datei | Prüfung |
|:--|:--|:--|
| bestanden | dispatcher.test.ts | Einzel-Erinnerungen / sendet zum Termin genau einmal, auch bei wiederholten und parallelen Läufen |
| bestanden | dispatcher.test.ts | Einzel-Erinnerungen / respektiert Verschieben, Erledigen und Papierkorb zwischen Einplanung und Versand |
| bestanden | dispatcher.test.ts | Einzel-Erinnerungen / versendet keine Einzel-E-Mail für Termine, die schon lange vorbei sind |
| bestanden | dispatcher.test.ts | Einzel-Erinnerungen / sendet bei Vorlauf entsprechend früher |
| bestanden | dispatcher.test.ts | Sammel-E-Mail / fasst heute fällige und überfällige Erinnerungen zusammen, einmal pro Tag |
| bestanden | dispatcher.test.ts | Sammel-E-Mail / lässt überfällige Erinnerungen weg, wenn so eingestellt, und überspringt leere Tage |
| bestanden | dispatcher.test.ts | Sammel-E-Mail / zeigt optional seit gestern erledigte Erinnerungen |
| bestanden | dispatcher.test.ts | Sammel-E-Mail / verschickt die Sammel-E-Mail am Tag der Zeitumstellung zur richtigen Ortszeit |
| bestanden | dispatcher.test.ts | Fehler und Wiederholungen / wiederholt vorübergehende Fehler mit demselben Schlüssel und Inhalt |
| bestanden | dispatcher.test.ts | Fehler und Wiederholungen / bricht bei Konfigurationsfehlern sofort ab und macht den Fehler sichtbar |
| bestanden | dispatcher.test.ts | Fehler und Wiederholungen / gibt nach fünf Versuchen auf |
| bestanden | dispatcher.test.ts | Fehler und Wiederholungen / meldet fehlende Empfängeradresse als Fehler statt still zu scheitern |
| bestanden | dispatcher.test.ts | Betrieb / protokolliert jeden Lauf und leert den Papierkorb nach 30 Tagen |
| bestanden | db.test.ts | Schema und Row Level Security / legt Personen mit Unicode-Namen an und berechnet den Suchtext |
| bestanden | db.test.ts | Schema und Row Level Security / verbietet leere Vornamen |
| bestanden | db.test.ts | Schema und Row Level Security / isoliert Daten zwischen Nutzern |
| bestanden | db.test.ts | Schema und Row Level Security / verhindert, dass Nutzer B Daten von A referenziert |
| bestanden | db.test.ts | Schema und Row Level Security / verbietet Clients das Schreiben in die Outbox |
| bestanden | db.test.ts | search_people / findet Teilnamen und Unicode |
| bestanden | db.test.ts | search_people / durchsucht Begegnungen (Mit wem habe ich über X gesprochen?) |
| bestanden | db.test.ts | search_people / kombiniert Filter (Land des Kennenlernens + Interesse + Tag) |
| bestanden | db.test.ts | search_people / filtert Kategorien mit UND-Verknüpfung |
| bestanden | db.test.ts | search_people / filtert nach Erinnerungsstatus und berechnet letzten Kontakt ohne Notizen |
| bestanden | db.test.ts | search_people / filtert Kennenlern-Zeitraum, sortiert und zählt |
| bestanden | db.test.ts | search_people / blendet Papierkorb aus und zeigt ihn separat |
| bestanden | db.test.ts | search_people / liefert für andere Nutzer nichts |
| bestanden | db.test.ts | Outbox und Idempotenz / lässt jeden Idempotenzschlüssel nur einmal zu |
| bestanden | db.test.ts | Outbox und Idempotenz / claim_outbox reserviert einen Auftrag genau einmal und holt hängengebliebene zurück |
| bestanden | db.test.ts | Outbox und Idempotenz / retry_email plant nur eigene fehlgeschlagene Sendungen neu ein |
| bestanden | db.test.ts | Outbox und Idempotenz / Personen löschen entfernt abhängige Daten vollständig |
| bestanden | schedule.test.ts | Zeitzonen und Sommerzeit / rechnet 09:00 Berlin im Winter als 08:00 UTC |
| bestanden | schedule.test.ts | Zeitzonen und Sommerzeit / rechnet 09:00 Berlin im Sommer als 07:00 UTC |
| bestanden | schedule.test.ts | Zeitzonen und Sommerzeit / berücksichtigt den Tag der Zeitumstellung (25.10.2026, Ende der Sommerzeit) |
| bestanden | schedule.test.ts | Zeitzonen und Sommerzeit / behält die Ortszeit bei Vorlauf über die Zeitumstellung hinweg |
| bestanden | schedule.test.ts | Zeitzonen und Sommerzeit / verschiebt eine Uhrzeit in der Sommerzeit-Lücke (29.03.2026, 02:30) sinnvoll nach vorn |
| bestanden | schedule.test.ts | Zeitzonen und Sommerzeit / nutzt andere Zeitzonen und fällt bei ungültiger Zone auf Berlin zurück |
| bestanden | schedule.test.ts | Zeitzonen und Sommerzeit / bestimmt das heutige Datum in der Zeitzone des Nutzers |
| bestanden | schedule.test.ts | Einplanung / plant Einzel-E-Mails erst ab dem Versandzeitpunkt |
| bestanden | schedule.test.ts | Einplanung / holt verpasste Einzel-E-Mails höchstens 36 Stunden nach |
| bestanden | schedule.test.ts | Einplanung / plant nichts, wenn Einzel-E-Mail aus oder Erinnerung nicht offen ist |
| bestanden | schedule.test.ts | Einplanung / plant die Sammel-E-Mail einmal pro Ortstag ab der eingestellten Uhrzeit |
| bestanden | schedule.test.ts | Einplanung / erkennt verschobene, erledigte und gelöschte Erinnerungen beim Versand |
| bestanden | schedule.test.ts | Fehlerbehandlung / wiederholt nur vorübergehende Fehler |
| bestanden | schedule.test.ts | Fehlerbehandlung / wartet zunehmend länger zwischen Versuchen |
| bestanden | schedule.test.ts | Anzeige / formuliert relative Tage verständlich |
