import type { Metadata } from "next";
import Link from "next/link";
import { LoginForms } from "./forms";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const error =
    sp.fehler === "zugriff"
      ? "Dieses Konto hat keinen Zugriff auf dieses Register."
      : sp.fehler === "link"
        ? "Der Link ist abgelaufen oder ungültig. Bitte einen neuen anfordern."
        : null;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-lg bg-accent font-serif text-xl font-bold text-on-accent">
            R
          </span>
          <div>
            <h1 className="font-serif text-2xl font-semibold leading-tight">Register</h1>
            <p className="text-[14px] text-muted">Dein Gedächtnis für Menschen</p>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6">
          {error ? <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-[14px] text-warn">{error}</p> : null}
          <LoginForms next={sp.next ?? "/"} />
        </div>
        <p className="mt-6 text-center text-[13px] text-faint">
          Privates System, keine Registrierung.{" "}
          <Link href="/datenschutz" className="underline underline-offset-2 hover:text-ink">
            Datenschutz
          </Link>
        </p>
      </div>
    </main>
  );
}
