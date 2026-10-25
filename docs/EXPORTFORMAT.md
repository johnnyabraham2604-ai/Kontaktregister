# Exportformat (JSON, Version 1)

Datei `register-export-JJJJ-MM-TT.json`, UTF-8.

```json
{
  "format": "register-export",
  "version": 1,
  "exported_at": "2026-10-25T20:15:00.000Z",
  "tables": {
    "people": [],
    "categories": [],
    "tags": [],
    "person_categories": [],
    "person_tags": [],
    "encounters": [],
    "encounter_tags": [],
    "reminders": [],
    "person_links": [],
    "field_definitions": [],
    "settings": []
  }
}
```

Jede Tabelle ist eine Liste von Zeilen mit denselben Spalten wie in der Datenbank (`supabase/migrations/20261025000001_schema.sql`), ohne `user_id` und ohne den intern berechneten `search_text`. Personen im Papierkorb sind enthalten (`deleted_at` gesetzt).

| Tabelle | Inhalt | Wichtige Felder |
|:--|:--|:--|
| `people` | Personen | `id`, `first_name`, `last_name`, Kontakt- und Ortsfelder, `met_on`, `met_place`, `met_country`, `met_context`, `about`, `goals`, `open_items`, `links[]`, `languages[]`, `custom_fields{}`, `deleted_at` |
| `categories` | Kategorien | `id`, `name`, `archived_at` |
| `tags` | Tags und Interessen | `id`, `kind` (`tag` oder `interest`), `name` |
| `person_categories`, `person_tags` | Zuordnungen | `person_id`, `category_id` bzw. `tag_id` |
| `encounters` | Begegnungen und Notizen | `person_id`, `kind`, `occurred_on`, `occurred_time`, `location`, `notes`, `topics`, `agreements` |
| `encounter_tags` | Tags einer Begegnung | `encounter_id`, `tag_id` |
| `reminders` | Wiedervorlagen | `person_id`, `due_date`, `due_time`, `reason`, `note`, `email_individual`, `status` |
| `person_links` | Verbindungen | `person_a`, `person_b`, `kind`, `description`, `note`. Bei `introduced` gilt: A hat mir B vorgestellt. |
| `field_definitions` | Eigene Felder | `key`, `label`, `field_type`. Werte stehen in `people.custom_fields[key]`. |
| `settings` | Erinnerungseinstellungen | Wird beim Wiederherstellen nicht übernommen. |

Begegnungsarten (`kind`): `first_meeting`, `meeting`, `call`, `video`, `message`, `event`, `trip`, `other`, `note`.
Verbindungsarten: `colleagues`, `friends`, `acquaintances`, `project`, `event`, `family`, `introduced`, `other`.

Nicht enthalten: Profilbilder (Bucket `avatars` in Supabase), Versandprotokoll, Scheduler-Läufe.

## CSV-Exporte

Semikolon als Trennzeichen, UTF-8 mit BOM (öffnet direkt in Excel), Zeilenende CRLF. Zellen, die mit `=`, `+`, `-` oder `@` beginnen, werden mit einem Apostroph versehen, damit Excel sie nicht als Formel ausführt.
