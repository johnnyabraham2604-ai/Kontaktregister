# Architektur

## Entscheidung

| Baustein | Wahl | Warum |
|:--|:--|:--|
| Oberfläche und Server | Next.js 16, TypeScript, Server Components und Server Actions | Ein Projekt für Seiten, Formulare, API und Scheduler-Endpunkt. Keine eigene Backend-API nötig. |
| Datenbank, Login | Supabase, Region Stockholm (eu-north-1) | Verwaltetes Postgres mit Row Level Security, Auth, Speicher und pg_cron in einem Dienst. Exportierbar, da Standard-Postgres. |
| Hosting | Vercel Hobby, Funktionen in `arn1` (Stockholm) | Automatisches Deployment aus GitHub, kein Server zu pflegen. |
| E-Mail | Resend | Einfache API, Idempotency-Keys, kostenloser Tarif reicht für eine Person. |
| Scheduler | `pg_cron` + `pg_net` in Supabase, alle 10 Minuten, plus täglicher Vercel-Cron als Kontrolllauf | Vercel-Cron allein läuft im Gratistarif nur einmal täglich. pg_cron läuft in der Datenbank und überlebt Neustarts und Deployments. |

Verworfen: reine Browser-Speicherung (keine Hintergrund-Erinnerungen, kein Mehrgerätebetrieb), Supabase Edge Functions für den Versand (zweite Laufzeitumgebung, Logik doppelt), eigener Server (Wartung).

## Datenfluss einer Erinnerung

```
pg_cron (alle 10 min) ──POST + Secret──▶ /api/cron/dispatch (Vercel, arn1)
Vercel-Cron (täglich) ──GET + Secret───▶        │
                                                ▼
                         1. Einplanen: fällige Einzel-Erinnerungen und Sammel-E-Mail
                            als Zeilen in email_outbox, eindeutiger Schlüssel
                            (ind:<id>:<Zeitpunkt>, dig:<user>:<Datum>), doppelte ignoriert
                         2. Reservieren: claim_outbox() mit FOR UPDATE SKIP LOCKED
                         3. Prüfen: Erinnerung noch offen, nicht verschoben, Person nicht gelöscht?
                         4. Inhalt bauen und in der Outbox ablegen (gleicher Inhalt bei Wiederholung)
                         5. Senden an Resend mit Idempotency-Key = Schlüssel
                         6. Ergebnis protokollieren: gesendet, Wiederholung geplant, fehlgeschlagen, übersprungen
                         7. Papierkorb älter als 30 Tage leeren, Lauf in scheduler_runs vermerken
```

**Doppelversand ist dreifach verhindert:** eindeutiger Schlüssel in der Datenbank, Reservierung mit `SKIP LOCKED`, Idempotency-Key bei Resend (24 Stunden). Ein Absturz zwischen Senden und Protokollieren führt zu einem erneuten Versuch mit identischem Inhalt und Schlüssel, Resend stellt dann nicht erneut zu.

**Zeitzonen:** Alle Zeitpunkte werden mit Luxon in der IANA-Zeitzone des Nutzers berechnet (Standard `Europe/Berlin`). 09:00 bleibt 09:00 Ortszeit, auch über Sommer- und Winterzeit hinweg. Uhrzeiten in der Lücke der Zeitumstellung werden nach vorn verschoben.

**Änderungen werden respektiert:** Wird eine Erinnerung verschoben, ändert sich der Schlüssel. Der alte Auftrag wird beim Versand als „Termin wurde verschoben“ übersprungen, der neue zum neuen Zeitpunkt geplant. Erledigte, abgebrochene, gelöschte Erinnerungen und Personen im Papierkorb werden übersprungen.

**Fehler bleiben sichtbar:** Vorübergehende Fehler (Netzwerk, 429, 5xx) werden nach 5, 15, 60, 180 Minuten wiederholt, Konfigurationsfehler (401, 403, 422) sofort als fehlgeschlagen markiert. Fehlgeschlagene Sendungen erscheinen als Hinweis oben in der App und im Versandprotokoll mit „Erneut versuchen“. Ist die Datenbank nicht erreichbar oder läuft pg_cron seit über 3 Stunden nicht, schickt der Endpunkt eine Warn-E-Mail direkt über Resend an `ALERT_EMAIL`.

## Datenmodell

```
people ─┬─< person_categories >── categories
        ├─< person_tags >───────── tags (kind: tag | interest)
        ├─< encounters ─< encounter_tags >── tags
        ├─< reminders ─< email_outbox
        └─< person_links >── people
field_definitions   (Werte in people.custom_fields, JSON, ohne Schemaänderung)
settings            (eine Zeile pro Nutzer)
scheduler_runs      (Herzschlag, keine personenbezogenen Daten)
```

- Jede Tabelle hat `user_id` mit Standardwert `auth.uid()`. Damit ist eine spätere Erweiterung auf mehrere Nutzer ohne Umbau möglich.
- „Fällig“ und „überfällig“ werden aus Datum und Zeitzone berechnet, nicht gespeichert. Gespeichert wird nur geplant, erledigt, abgebrochen.
- Der letzte Kontakt ist die jüngste Begegnung, die keine Notiz ist.
- Suche: `search_people()` in SQL, läuft mit den Rechten des Aufrufers. Jedes Suchwort muss im Profil oder in einer Begegnung vorkommen (Teilwort, Groß- und Kleinschreibung egal, alle Schriftsysteme). Filter werden immer UND-verknüpft, auch mehrere Tags derselben Art.

## Sicherheit

- Zugriff nur nach Anmeldung. Der Proxy leitet Unangemeldete um, jede Seite und Server-Aktion prüft die Sitzung erneut (`requireUser`), die Datenbank erzwingt zusätzlich Row Level Security.
- RLS prüft beim Schreiben auch, dass referenzierte Personen, Kategorien und Tags dem Nutzer gehören.
- Die Rolle `anon` hat keinerlei Tabellenrechte. Outbox und Scheduler-Läufe schreibt nur der Server mit dem Secret Key, Nutzer können sie lesen.
- Registrierung ist in Supabase abgeschaltet, zusätzlich lässt `ALLOWED_EMAIL` nur eine Adresse zu.
- Geheime Schlüssel nur in Vercel-Umgebungsvariablen und im Supabase Vault, nie im Browser-Bundle.
- Eingaben werden im Browser (HTML-Attribute) und auf dem Server (Zod und Prüfungen in den Server-Aktionen) validiert, zusätzlich Längenprüfungen in der Datenbank.
- Sicherheitsheader: Content-Security-Policy, `X-Frame-Options: DENY`, HSTS, `noindex`.
- Profilbilder liegen in einem privaten Bucket, nur über kurzlebige signierte URLs abrufbar.
- Protokolle: Der Scheduler loggt nur Zähler, keine Namen oder Inhalte. Der E-Mail-Inhalt wird nach erfolgreichem Versand aus der Outbox gelöscht.
- Es werden keine Daten an KI-Dienste gesendet.

## Bewusst nicht in Version 1

Zwei-Faktor-Anmeldung (Supabase unterstützt TOTP, Oberfläche fehlt noch), Netzwerkgrafik, Mehrbenutzerbetrieb, Offline-Modus, Kalender-Integration, KI.
