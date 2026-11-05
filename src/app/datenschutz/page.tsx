import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Datenschutz" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link href="/" className="text-[14px] text-muted hover:text-ink">
        Zurück zum Register
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold">Datenschutzhinweise</h1>
      <div className="mt-6 space-y-6 text-[15px] leading-relaxed text-ink/90">
        <section>
          <h2 className="mb-2 font-semibold">Wofür dieses System da ist</h2>
          <p>
            Register ist ein privates Notizsystem einer einzelnen Person, um sich an Menschen, Gespräche und vereinbarte nächste
            Schritte zu erinnern. Es gibt keine öffentlichen Profile, keine Registrierung und keine Weitergabe an Dritte zu Werbe- oder
            Analysezwecken.
          </p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Welche Daten gespeichert werden</h2>
          <p>
            Angaben, die der Nutzer selbst einträgt: Namen, Kontaktdaten, Herkunft des Kontakts, Notizen zu Gesprächen, Interessen,
            Kategorien und geplante Kontaktaufnahmen. Es werden keine Daten automatisch aus anderen Quellen ergänzt und keine
            Eigenschaften aus Land oder Herkunft abgeleitet. Eine KI-Verarbeitung findet nicht statt.
          </p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Wo die Daten liegen</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Datenbank, Anmeldung und Profilbilder: Supabase, Region Stockholm (EU). Zugriff ist per Row Level Security auf den Kontoinhaber beschränkt.</li>
            <li>Webanwendung: Vercel, Serverfunktionen in Stockholm (EU). Daten werden dort verarbeitet, aber nicht dauerhaft gespeichert.</li>
            <li>
              E-Mail-Erinnerungen: Resend. Der Inhalt einer Erinnerung (Name, Anlass, je nach Einstellung Notizauszug) passiert dabei
              die Infrastruktur von Resend. Resend speichert E-Mail-Metadaten und Protokolle in den USA. Mit der Einstellung
              &bdquo;Datensparsame E-Mails&ldquo; enthalten Erinnerungen nur Name, Anlass und Link.
            </li>
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Löschen und Export</h2>
          <p>
            Personen lassen sich in den Papierkorb legen und werden nach 30 Tagen endgültig gelöscht, inklusive Begegnungen,
            Erinnerungen, Verknüpfungen und Profilbild. Ein vollständiger Export (JSON und CSV) ist jederzeit möglich. Versandprotokolle
            enthalten keine Notizinhalte; der zwischengespeicherte E-Mail-Inhalt wird nach erfolgreichem Versand gelöscht.
          </p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Offene Punkte</h2>
          <p>
            Wer Informationen über andere Menschen speichert, sollte prüfen, welche datenschutzrechtlichen Pflichten gelten. Für rein
            persönliche Zwecke greift in der DSGVO die Ausnahme für ausschließlich persönliche oder familiäre Tätigkeiten
            (Art. 2 Abs. 2 lit. c). Bei beruflicher Nutzung können Informations- und Auskunftspflichten gegenüber den betroffenen
            Personen entstehen. Diese Seite ist keine Rechtsberatung und keine Konformitätsbestätigung.
          </p>
        </section>
      </div>
    </main>
  );
}
