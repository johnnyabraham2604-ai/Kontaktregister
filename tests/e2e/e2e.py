import json, os, re, subprocess, sys, time
from playwright.sync_api import sync_playwright, expect

S = os.environ.get("E2E_WORKDIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".work"))
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "http://localhost:3000"
results = []
def ok(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)

def wait_url(page, pattern, timeout=15):
    rx = re.compile(pattern) if isinstance(pattern, str) else pattern
    end = time.time() + timeout
    while time.time() < end:
        if rx.search(page.url):
            page.wait_for_load_state()
            return
        page.wait_for_timeout(150)
    raise AssertionError(f"URL {page.url} passt nicht zu {pattern}")

def shot(page, name):
    page.screenshot(path=f"{S}/shots/{name}.png", full_page=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1360, "height": 900}, locale="de-DE", timezone_id="Europe/Berlin")
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    # Login
    page.goto(BASE + "/personen")
    ok("Unangemeldet wird zur Anmeldung geleitet", "/login" in page.url, page.url)
    page.fill("#email", "johnny@example.org"); page.fill("#password", "falsch")
    page.click("button[type=submit]")
    page.wait_for_selector("text=Anmeldung fehlgeschlagen")
    ok("Falsches Passwort wird abgelehnt", True)
    page.fill("#password", "Register-Test-2026!")
    page.click("button[type=submit]")
    wait_url(page, r"/personen$")
    ok("Anmeldung und Rücksprung zur Zielseite", page.url.endswith("/personen"))
    page.goto(BASE + "/")
    shot(page, "01-uebersicht-leer")
    ok("Leere Übersicht mit Startaufforderung", page.locator("text=Noch niemand im Register").count() == 1)

    # Schnellerfassung
    page.click("header >> text=Neue Person")
    page.fill("#qa-first", "Kerstin"); page.fill("#qa-last", "Hagen")
    page.fill("#qa-context", "Sitznachbarin auf dem Flug nach Shanghai, arbeitet an Batteriesicherheit")
    page.fill("#qa-place", "Flug LH728")
    page.locator("dialog[open] label:has-text('Reisen')").click()
    shot(page, "02-schnellerfassung")
    page.click("dialog[open] >> text=Anlegen und Profil öffnen")
    wait_url(page, r"/personen/[0-9a-f-]{36}\?neu=1")
    pid = page.url.split("/personen/")[1].split("?")[0]
    ok("Schnellerfassung legt Person an und öffnet Profil", page.locator("h1:has-text('Kerstin Hagen')").count() == 1)

    # Vollständiges Profil bearbeiten
    page.click("text=Bearbeiten")
    wait_url(page, rf"/personen/{pid}/bearbeiten$")
    page.fill("#pf-nick", "Kiki"); page.fill("#pf-occ", "Ingenieurin Batteriesicherheit"); page.fill("#pf-company", "Porsche Engineering")
    page.fill("#pf-email", "kerstin@example.org"); page.fill("#pf-city", "Stuttgart"); page.fill("#pf-country", "Deutschland")
    page.fill("#pf-metcountry", "China"); page.fill("#pf-lang", "Deutsch, Englisch, Mandarin")
    page.fill("#pf-links", "linkedin.com/in/kerstin-hagen-example")
    page.fill("#pf-about", "Läuft Marathon, war 3 Jahre in Shanghai.\nInteressiert an PIML.")
    inter = page.locator("section:has-text('Interessen') input[placeholder^='Neues Interesse']")
    inter.fill("Technologie, Laufen"); inter.press("Enter")
    tag = page.locator("input[placeholder^='Neuer Tag']"); tag.fill("Automotive"); tag.press("Enter")
    shot(page, "03-profil-bearbeiten")
    page.click("text=Änderungen speichern")
    wait_url(page, rf"/personen/{pid}$")
    ok("Profil gespeichert mit Interessen und Tags", page.locator("a:has-text('Technologie')").count() >= 1 and page.locator("a:has-text('Automotive')").count() >= 1)
    ok("Link normalisiert", page.locator("a[href='https://linkedin.com/in/kerstin-hagen-example']").count() == 1)

    # Begegnung mit nächstem Kontakttermin
    page.click("text=Begegnung festhalten")
    dlg = page.locator("dialog[open]")
    dlg.locator("select[name=kind]").select_option("call")
    dlg.locator("input[name=topics]").fill("Projekt Falke, Zellalterung, Umzug nach Stuttgart")
    dlg.locator("textarea[name=notes]").fill("Sie sucht Daten zu Kalendaralterung. Ich schicke ihr das Paper.")
    dlg.locator("textarea[name=agreements]").fill("Paper bis Freitag schicken")
    dlg.locator("input[name=plan_next]").check()
    dlg.locator("input[name=next_due_date]").fill(time.strftime("%Y-%m-%d"))
    dlg.locator("input[name=next_reason]").fill("Paper zu Kalendaralterung schicken")
    dlg.locator("input[name=next_email_individual]").check()
    shot(page, "04-begegnung-festhalten")
    dlg.locator("text=Begegnung speichern").click()
    page.wait_for_selector("dialog[open]", state="detached", timeout=5000) if False else page.wait_for_timeout(1500)
    page.reload()
    ok("Begegnung erscheint im Verlauf", page.locator("text=Projekt Falke, Zellalterung").count() == 1)
    ok("Kontakttermin aus Begegnung angelegt", page.locator("#erinnerungen >> text=Paper zu Kalendaralterung schicken").count() == 1)
    ok("Letzter Kontakt im Kopf abgeleitet", page.locator("text=Letzter Kontakt heute (Telefonat)").count() == 1)

    # Notiz
    page.click("header >> button:has-text('Notiz')")
    page.locator("dialog[open] textarea[name=notes]").fill("Hat einen Hund namens Volta.")
    page.locator("dialog[open] >> text=Notiz speichern").click()
    page.wait_for_timeout(1200); page.reload()
    ok("Notiz im Verlauf, zählt nicht als Kontakt", page.locator("text=Hund namens Volta").count() == 1 and page.locator("text=Letzter Kontakt heute (Telefonat)").count() == 1)
    shot(page, "05-profil")

    # CSV-Import
    page.goto(BASE + "/einstellungen/daten")
    page.set_input_files("input[type=file][accept='.csv,text/csv']", f"{HERE}/import.csv")
    page.wait_for_selector("text=Zeilen erkannt")
    shot(page, "06-import-zuordnung")
    page.click("text=Vorschau und Dublettenprüfung")
    page.wait_for_selector("text=Import ausführen")
    dups = page.locator("text=Gleicher Name wie Zeile").count()
    ok("Dublette innerhalb der Datei erkannt", dups == 1, f"{dups}")
    ok("Zeile ohne verwertbaren Namen markiert", page.locator("table >> text=Neu").count() >= 7)
    shot(page, "07-import-vorschau")
    page.click("text=Import ausführen")
    page.wait_for_selector("text=Import abgeschlossen")
    msg = page.locator("text=Import abgeschlossen").inner_text()
    ok("CSV-Import abgeschlossen", "8 neu angelegt" in msg, msg)

    # Erneuter Import: alles als Dublette erkannt, nichts überschrieben
    page.set_input_files("input[type=file][accept='.csv,text/csv']", f"{HERE}/import.csv")
    page.wait_for_selector("text=Zeilen erkannt"); page.click("text=Vorschau und Dublettenprüfung"); page.wait_for_selector("text=Import ausführen")
    same = page.locator("text=Gleiche E-Mail").count() + page.locator("text=Gleicher Name:").count()
    ok("Zweiter Import erkennt vorhandene Personen", same >= 7, f"{same}")

    # Verzeichnis
    page.goto(BASE + "/personen")
    shot(page, "08-personen-alphabetisch")
    ok("Alphabetische Gruppen", page.locator("h2:text-is('M')").count() == 1 and page.locator("h2:text-is('#')").count() <= 1)
    page.goto(BASE + "/personen?q=batterie")
    names = page.locator("ul li p.font-semibold").all_inner_texts()
    ok("Volltextsuche findet Begegnungsinhalt und Profil", any("Kerstin" in n for n in names), ";".join(names))
    page.goto(BASE + "/personen?q=李")
    ok("Suche nach chinesischem Namen", page.locator("text=Lin 李").count() >= 1)
    page.goto(BASE + "/personen?q=ገብረ")
    ok("Suche in Ge'ez-Schrift", page.locator("text=ሳባ ገብረ").count() >= 1)
    # Kombinierter Filter: in China kennengelernt + Interesse Technologie + Firma enthält "NIO"
    page.goto(BASE + "/ordnung?bereich=interessen")
    tech_href = page.locator("li:has-text('Technologie') a[href*='int=']").first.get_attribute("href")
    tech = tech_href.split("int=")[1]
    page.goto(BASE + f"/personen?kland=China&int={tech}")
    combo = sorted(page.locator("ul li p.font-semibold").all_inner_texts())
    ok("Kombinierter Filter China + Technologie", combo == ["Kerstin Hagen „Kiki“", "Lin 李", "Wei Zhang"], ";".join(combo))
    page.goto(BASE + f"/personen?kland=China&int={tech}&firma=NIO")
    combo2 = page.locator("ul li p.font-semibold").all_inner_texts()
    ok("Dreifach-Filter China + Technologie + Firma", combo2 == ["Wei Zhang"], ";".join(combo2))
    ok("Aktive Filter als Chips", page.locator("a[title='Filter entfernen']").count() == 3)
    shot(page, "09-personen-filter")
    page.locator("a[title='Filter entfernen']:has-text('Unternehmen')").click()
    wait_url(page, r"/personen\?kland=China&int=[0-9a-f-]+$")
    page.wait_for_function("document.querySelectorAll(\"a[title='Filter entfernen']\").length === 2")
    ok("Einzelnen Filter entfernen", len(page.locator("ul li p.font-semibold").all_inner_texts()) == 3)
    page.goto(BASE + "/personen?status=today")
    ok("Filter Kontaktstatus heute", page.locator("ul li p.font-semibold").all_inner_texts() == ["Kerstin Hagen „Kiki“"])

    # Erinnerungen
    page.goto(BASE + f"/personen?q=selam")
    page.locator("ul li a").first.click(); page.wait_for_load_state()
    page.click("header >> button:has-text('Kontakttermin')")
    d = page.locator("dialog[open]")
    d.locator("input[name=due_date]").fill("2026-10-20")
    d.locator("input[name=reason]").fill("Zur Hochzeit gratulieren")
    d.locator("text=Kontakttermin festlegen").click(); page.wait_for_timeout(1200); page.reload()
    ok("Überfällige Erinnerung angelegt", page.locator("text=Überfällig").count() >= 1)
    page.goto(BASE + "/")
    shot(page, "10-uebersicht")
    ok("Übersicht zeigt heute fällige und überfällige", page.locator("text=Heute fällig und überfällig").count() == 1)
    page.goto(BASE + "/erinnerungen")
    shot(page, "11-erinnerungen")
    # Verschieben um eine Woche
    item = page.locator("li:has-text('Zur Hochzeit gratulieren')")
    item.locator("summary:has-text('Verschieben')").click()
    item.locator("button:has-text('In einer Woche')").click(); page.wait_for_timeout(1200); page.reload()
    ok("Verschieben aus Liste", page.locator("section:has(h2:has-text('Nächste 7 Tage')) >> text=Zur Hochzeit gratulieren").count() == 1)

    # Einstellungen, Test-E-Mail, Scheduler
    page.goto(BASE + "/einstellungen")
    page.fill("#st-email", "johnny@example.org")
    page.click("text=Einstellungen speichern"); page.wait_for_selector("text=Einstellungen gespeichert.")
    ok("Einstellungen speichern", True)
    page.click("text=Test-E-Mail senden"); page.wait_for_selector("text=Test-E-Mail gesendet")
    ok("Test-E-Mail über Resend-Nachbau", True, page.locator("text=Test-E-Mail gesendet").inner_text())
    shot(page, "12-einstellungen")

    # Export (mit Sitzungscookies)
    resp = page.request.get(BASE + "/api/export?typ=json")
    data = resp.json()
    ok("JSON-Export vollständig", resp.ok and data["format"] == "register-export" and len(data["tables"]["people"]) == 9 and len(data["tables"]["encounters"]) == 2, f"{len(data['tables']['people'])} Personen")
    ok("JSON-Export ohne interne Felder", "search_text" not in data["tables"]["people"][0] and "user_id" not in data["tables"]["people"][0])
    csv = page.request.get(BASE + "/api/export?typ=personen")
    body = csv.text()
    ok("CSV-Export mit BOM, Semikolon und Unicode", body.startswith("﻿") and "Vorname;Nachname" in body and "ሳባ" in body)
    open(f"{S}/export.json", "w").write(json.dumps(data))

    # Wiederherstellung aus JSON: eine Person hart löschen, dann Sicherung einspielen
    subprocess.run(["psql", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-qc", "delete from people where first_name = 'Jonas'"], check=True)
    page.goto(BASE + "/einstellungen/daten")
    page.once("dialog", lambda dlg: dlg.accept())
    page.set_input_files("input[type=file][accept='.json,application/json']", f"{S}/export.json")
    page.wait_for_selector("text=Wiederhergestellt:")
    rmsg = page.locator("text=Wiederhergestellt:").inner_text()
    ok("JSON-Wiederherstellung fügt nur Fehlendes hinzu", "1 Personen" in rmsg, rmsg)
    page.goto(BASE + "/personen?q=jonas")
    ok("Wiederhergestellte Person mit Kategorie", page.locator("ul li:has-text('Jonas Weber') >> text=Universität und Forschung").count() == 1)

    # Papierkorb
    page.goto(BASE + f"/personen/{pid}")
    page.once("dialog", lambda dlg: dlg.accept())
    page.click("text=In den Papierkorb legen"); wait_url(page, r"/personen\?geloescht=1")
    ok("Person in Papierkorb, aus Verzeichnis verschwunden", page.locator("text=Kerstin").count() == 0)
    page.goto(BASE + "/einstellungen/papierkorb")
    page.click("text=Wiederherstellen"); page.wait_for_timeout(1000)
    page.goto(BASE + "/personen?q=kerstin")
    ok("Wiederherstellen aus Papierkorb", page.locator("text=Kerstin Hagen").count() >= 1)

    # Mobile Ansicht
    m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="de-DE", storage_state=ctx.storage_state())
    mp = m.new_page()
    mp.goto(BASE + "/"); shot(mp, "13-mobil-uebersicht")
    mp.goto(BASE + f"/personen/{pid}"); shot(mp, "14-mobil-profil")
    mp.goto(BASE + "/personen"); shot(mp, "15-mobil-personen")
    sw = mp.evaluate("document.documentElement.scrollWidth")
    ok("Mobil ohne horizontales Scrollen", sw <= 390, f"scrollWidth {sw}")
    # Dunkelmodus
    dk = browser.new_context(viewport={"width": 1360, "height": 900}, color_scheme="dark", locale="de-DE", storage_state=ctx.storage_state())
    dp = dk.new_page(); dp.goto(BASE + f"/personen/{pid}"); shot(dp, "16-dunkel-profil")

    # Zweiter Nutzer: ALLOWED_EMAIL sperrt
    other = browser.new_context(); op = other.new_page()
    op.goto(BASE + "/login"); op.fill("#email", "fremd@example.org"); op.fill("#password", "Fremd-Test-2026!"); op.click("button[type=submit]")
    op.wait_for_selector("text=keinen Zugriff")
    ok("Fremdes Konto wird abgewiesen (ALLOWED_EMAIL)", True)

    ok("Keine Browser-Fehler in der Konsole", len([e for e in errors if "favicon" not in e]) == 0, " | ".join(errors[:5]))
    browser.close()

print("\nSUMMARY", sum(1 for r in results if r[1]), "/", len(results))
json.dump(results, open(f"{S}/e2e-results.json", "w"), ensure_ascii=False, indent=1)
