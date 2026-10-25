import Link from "next/link";
import { Suspense } from "react";
import { getSchedulerHealth, getSettings, getTaxonomy, getToday, requireUser } from "@/lib/data";
import { SideNav, BottomNav } from "@/components/nav";
import { SearchBox } from "@/components/client";
import { QuickAdd } from "@/components/quick-add";
import { Notice } from "@/components/ui";
import { signOut } from "@/app/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  await getSettings();
  const [today, taxonomy, health] = await Promise.all([getToday(), getTaxonomy(), getSchedulerHealth()]);
  const { count: dueCount } = await supabase
    .from("reminders")
    .select("id, people!inner(deleted_at)", { count: "exact", head: true })
    .eq("status", "planned")
    .lte("due_date", today)
    .is("people.deleted_at", null);
  const activeCategories = taxonomy.categories.filter((c) => !c.archived_at);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:h-dvh lg:flex-col lg:sticky lg:top-0">
        <Link href="/" className="flex h-16 items-center gap-2.5 px-5">
          <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-md bg-accent font-serif text-[15px] font-bold text-on-accent">
            R
          </span>
          <span className="font-serif text-xl font-semibold tracking-tight">Register</span>
        </Link>
        <div className="flex-1 px-3 py-2">
          <SideNav dueCount={dueCount ?? 0} />
        </div>
        <div className="border-t border-line px-5 py-4 text-[12px] text-faint">
          <p className="truncate" title={user.email ?? ""}>
            {user.email}
          </p>
          <div className="mt-1 flex gap-3">
            <form action={signOut}>
              <button className="hover:text-ink">Abmelden</button>
            </form>
            <Link href="/datenschutz" className="hover:text-ink">
              Datenschutz
            </Link>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="font-serif text-lg font-semibold lg:hidden" aria-label="Register, Übersicht">
              R<span className="sr-only">egister</span>
            </Link>
            <Suspense fallback={<div className="h-10 flex-1" />}>
              <SearchBox className="flex-1" />
            </Suspense>
            <div className="hidden sm:block">
              <QuickAdd categories={activeCategories} today={today} />
            </div>
            <div className="sm:hidden">
              <QuickAdd categories={activeCategories} today={today} compact />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          {health.failedCount > 0 ? (
            <div className="mb-5">
              <Notice tone="warn">
                {health.failedCount === 1 ? "Eine E-Mail konnte" : `${health.failedCount} E-Mails konnten`} nicht gesendet werden.{" "}
                <Link href="/einstellungen/versand" className="font-semibold underline underline-offset-2">
                  Versandprotokoll öffnen
                </Link>
              </Notice>
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <BottomNav dueCount={dueCount ?? 0} />
    </div>
  );
}
