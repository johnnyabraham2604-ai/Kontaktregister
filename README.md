# Register

Persönliches Gedächtnis für die Menschen, die du kennenlernst. Profile, Gesprächshistorie, Kategorien, Tags und Interessen, kombinierbare Suche und Erinnerungen per E-Mail, die zuverlässig im Hintergrund verschickt werden, auch wenn kein Browser offen ist.

**Stack:** Next.js 16 (TypeScript) auf Vercel, Supabase in Frankfurt (Postgres, Auth, Row Level Security, privater Bildspeicher, pg_cron), Resend für E-Mails.

## Stand

| Bereich | Implementiert | Getestet | Produktiv eingerichtet |
|:--|:--|:--|:--|
| Anmeldung, Zugriffsschutz, RLS | ja | ja, lokal gegen echtes Supabase Auth, PostgREST und Postgres 16 | ausstehend (deine Einrichtung) |
| Personen, Profile, Notizen, eigene Felder | ja | ja, im Browser | ausstehend |
| Kategorien, Tags, Interessen | ja | ja, im Browser | ausstehend |
| Suche und kombinierte Filter | ja | ja, SQL-Tests und Browser | ausstehend |
| Begegnungen und Verlauf | ja | ja, im Browser | ausstehend |
| Wiedervorlagen | ja | ja, im Browser | ausstehend |
| Einzel- und Sammel-E-Mails, Scheduler | ja | ja, gegen einen Resend-Nachbau und mit simulierten Uhrzeiten | ausstehend: echter Versand über Resend und pg_cron in Supabase |
| Export, Import, Wiederherstellung | ja | ja, im Browser | ausstehend |
| Profilbilder | ja | nein (Supabase Storage lokal nicht verfügbar) | ausstehend |
| Passwort zurücksetzen per E-Mail | ja | nein (braucht echtes Supabase Auth mit E-Mail-Versand) | ausstehend |

Details in [docs/TESTPROTOKOLL.md](docs/TESTPROTOKOLL.md). Ein echter E-Mail-Versand und eine Produktionsbereitstellung wurden **nicht** getestet, weil dafür deine Konten nötig sind.

## Einrichtung

Reihenfolge einhalten, sie vermeidet die typischen Fehler. Dauer etwa 45 Minuten. Du brauchst vier kostenlose Konten: GitHub, Supabase, Vercel, Resend.

### 1. Code in ein privates GitHub-Repository

1. Auf github.com ein neues **privates** Repository anlegen, Name zum Beispiel `register`, ohne README.
2. Der entpackte Ordner ist bereits ein Git-Repository mit einem ersten Commit. Im Projektordner:
   ```bash
   git remote add origin https://github.com/<dein-name>/register.git
   git push -u origin main
   ```
   `.env.local` ist durch `.gitignore` ausgeschlossen. Lege dort niemals Schlüssel in Dateien ab, die committet werden.

### 2. Supabase-Projekt

1. supabase.com, **New project**. Region **Central EU (Frankfurt)**. Ein langes Datenbankpasswort aus dem Passwortmanager.
2. **SQL Editor**, neue Abfrage: Inhalt von `supabase/migrations/20261025000001_schema.sql` einfügen, **Run**. Dann genauso `supabase/migrations/20261025000002_storage.sql`.
3. **Authentication, Sign In / Providers, Email**: aktiv lassen. **Allow new users to sign up** ausschalten.
4. **Authentication, Users, Add user, Create new user**: deine E-Mail-Adresse und ein starkes Passwort (mindestens 12 Zeichen), **Auto Confirm User** an.
5. **Project Settings, API Keys**: den **Publishable key** und den **Secret key** notieren. (Die älteren Schlüssel `anon` und `service_role` funktionieren ebenfalls.)
6. Die Projekt-URL steht unter **Project Settings, Data API** und hat die Form `https://xxxx.supabase.co`.

### 3. Resend

1. resend.com, Konto **mit der Adresse anlegen, an die Erinnerungen gehen sollen.** Ohne eigene Domain verschickt Resend über `onboarding@resend.dev` ausschließlich an diese Kontoadresse. Für dich als einzigen Nutzer reicht das.
2. **API Keys, Create API key**, Berechtigung **Sending access**. Schlüssel notieren.
3. Optional später: eigene Domain unter **Domains** hinzufügen (Region Ireland, eu-west-1), DNS-Einträge bei deinem Domain-Anbieter setzen, danach `EMAIL_FROM` auf eine Adresse dieser Domain ändern.

### 4. Vercel

1. vercel.com, **Add New, Project**, das GitHub-Repository importieren. Framework wird erkannt.
2. Vor dem ersten Deploy unter **Environment Variables** setzen (Werte siehe `.env.example`):

   | Variable | Wert |
   |:--|:--|
   | `NEXT_PUBLIC_SUPABASE_URL` | Projekt-URL aus Supabase |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |
   | `SUPABASE_SECRET_KEY` | Secret key (geheim) |
   | `RESEND_API_KEY` | Resend-Schlüssel (geheim) |
   | `EMAIL_FROM` | `Register <onboarding@resend.dev>` |
   | `CRON_SECRET` | Zufallswert, mindestens 32 Zeichen, z. B. `openssl rand -hex 32` |
   | `ALLOWED_EMAIL` | deine Anmeldeadresse |
   | `ALERT_EMAIL` | deine Resend-Kontoadresse (für Systemwarnungen) |
   | `APP_URL` | zunächst leer lassen |

3. **Deploy**. Danach die Produktionsadresse kopieren (z. B. `https://register-abc.vercel.app`), als `APP_URL` eintragen und unter **Deployments** neu deployen.
4. `vercel.json` legt die Funktionen nach Frankfurt (`fra1`) und richtet einen täglichen Kontrolllauf ein (05:00 UTC).

### 5. Supabase mit der App verbinden

1. **Authentication, URL Configuration**: **Site URL** = deine `APP_URL`. Unter **Redirect URLs** `APP_URL/auth/callback` hinzufügen. (Nötig für „Passwort vergessen“.)
2. **SQL Editor**: `supabase/cron.sql` öffnen, `<APP_URL>` und `<CRON_SECRET>` ersetzen (genau dieselben Werte wie in Vercel), ausführen. Das richtet den Scheduler alle 10 Minuten ein. Das Geheimnis liegt verschlüsselt im Supabase Vault.
3. Prüfen nach 10 Minuten im SQL Editor:
   ```sql
   select id, status_code, error_msg, created from net._http_response order by created desc limit 5;
   ```
   Erwartet: `status_code` 200. Bei 401 stimmt das Secret nicht, bei 404 die URL.

### 6. Abnahmetest

1. Anmelden. **Einstellungen**: Empfänger prüfen, speichern. Im Statuskasten müssen alle Punkte grün sein (der Datenbank-Scheduler wird grün, sobald er einmal gelaufen ist).
2. **Test-E-Mail senden**. Sie muss ankommen, im **Versandprotokoll** steht „Gesendet“ mit Resend-ID.
3. Eine Testperson anlegen, **Kontakttermin** auf heute mit einer Uhrzeit in 15 Minuten, „Zusätzlich eine eigene E-Mail“ an. Nach spätestens 25 Minuten kommt die Einzel-Erinnerung.
4. In den Einstellungen die Uhrzeit der täglichen Übersicht auf in 15 Minuten setzen. Die Sammel-E-Mail kommt, einmal.
5. **Scheduler jetzt ausführen** zweimal hintereinander klicken: Es darf keine zweite E-Mail kommen.
6. Unter **Import und Export** eine JSON-Sicherung laden und lokal aufbewahren.
7. Auf dem Smartphone anmelden und zum Startbildschirm hinzufügen.

## Kosten

Stand der Recherche: 25. Oktober 2026. Preise können sich ändern, vor einer Entscheidung auf den Anbieterseiten prüfen.

| Dienst | Pflicht | Kostenlos | Grenzen im Gratistarif | Bezahlt |
|:--|:--|:--|:--|:--|
| Supabase | ja | 0 $ | Pausiert nach 7 Tagen Inaktivität, **keine automatischen Backups**, 500 MB Datenbank | Pro 25 $ pro Monat: tägliche Backups (7 Tage), keine Pausierung |
| Vercel | ja | 0 $ (Hobby) | nur private, nicht kommerzielle Nutzung, Cron höchstens täglich | nicht nötig |
| Resend | ja | 0 $ | 3.000 E-Mails im Monat, 100 pro Tag, ohne Domain nur an die eigene Adresse | nicht nötig |
| Eigene Domain | nein | | | ab ca. 10 € pro Jahr |

**Empfehlung:** kostenlos starten, auf Supabase Pro wechseln, sobald echte Daten drinstehen. Der Scheduler erzeugt zwar alle 10 Minuten Datenbankaktivität, Supabase garantiert aber nicht, dass das gegen das Pausieren reicht. Pausiert das Projekt, schickt der tägliche Kontrolllauf eine Warn-E-Mail an `ALERT_EMAIL`.

Laufende Kosten prüfen: Supabase unter **Organization, Billing, Usage**, Vercel unter **Usage**, Resend unter **Usage**.

## Betrieb

### Sicherungen und Wiederherstellung

- **Gratistarif:** keine automatischen Backups. Lade regelmäßig die JSON-Sicherung unter **Import und Export** (z. B. monatlich, als Erinnerung im Register selbst angelegt).
- **Supabase Pro:** tägliche Backups, 7 Tage aufbewahrt. Wiederherstellen unter **Database, Backups**. Das setzt die ganze Datenbank auf den Stand zurück, spätere Änderungen gehen verloren.
- **Aus der JSON-Sicherung:** **Import und Export, Sicherung wiederherstellen**. Fügt nur fehlende Datensätze hinzu, überschreibt nichts. Funktioniert auch in einem neuen Supabase-Projekt (erst Schritt 2 der Einrichtung, dann einspielen).
- **Profilbilder** sind nicht im JSON enthalten. Sie liegen im Supabase-Speicher im Bucket `avatars`.
- **Papierkorb:** gelöschte Personen bleiben 30 Tage wiederherstellbar.

### Grenzen der Infrastruktur

- Erinnerungen werden im **10-Minuten-Raster** verschickt, nicht sekundengenau. Eine Einzel-Erinnerung für 09:00 kommt zwischen 09:00 und etwa 09:10.
- Ist der Scheduler länger ausgefallen, holt er Einzel-Erinnerungen bis 36 Stunden und die Sammel-E-Mail bis 12 Stunden nach dem geplanten Zeitpunkt nach. Ältere fallen nicht als Einzel-E-Mail nach, erscheinen aber in der nächsten Übersicht als überfällig.
- Fehlgeschlagene Sendungen werden nach 5, 15, 60 und 180 Minuten erneut versucht, danach als „Fehlgeschlagen“ markiert und oben in der App angezeigt.
- „Gesendet“ bedeutet, dass Resend die E-Mail angenommen hat. Ob sie im Posteingang ankam, zeigt das Resend-Dashboard.
- Kein Offline-Modus.

### Fehlersuche

| Symptom | Ursache und Lösung |
|:--|:--|
| Status „Datenbank-Scheduler noch nie gelaufen“ | `cron.sql` nicht ausgeführt oder Platzhalter nicht ersetzt. `select * from cron.job;` prüfen. |
| `net._http_response` zeigt 401 | `CRON_SECRET` in Vercel und im Vault unterschiedlich. Vault-Werte löschen und neu anlegen (siehe Ende von `cron.sql`). |
| Test-E-Mail: „Versand abgelehnt … Resend-Kontos“ | Empfänger ist nicht die Adresse deines Resend-Kontos. Empfänger ändern oder eigene Domain verifizieren. |
| Warn-E-Mail „Datenbank nicht erreichbar“ | Supabase-Projekt pausiert. Im Dashboard fortsetzen, Upgrade auf Pro erwägen. |
| Anmeldung: „kein Zugriff“ | Anmeldeadresse entspricht nicht `ALLOWED_EMAIL`. |

## Entwicklung

```bash
cp .env.example .env.local   # ausfüllen
npm install
npm run dev                  # http://localhost:3000
npm test                     # Unit- und Datenbanktests (PGlite, kein Server nötig)
npm run typecheck && npm run lint
```

Vollständiger Browsertest gegen einen lokalen Supabase-Nachbau (Linux mit PostgreSQL 16, Python-Playwright): `bash tests/e2e/start-stack.sh`, danach `npm run test:e2e`.

Weitere Dokumentation: [Architektur](docs/ARCHITEKTUR.md), [Exportformat](docs/EXPORTFORMAT.md), [Testprotokoll](docs/TESTPROTOKOLL.md).
