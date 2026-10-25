import type { Metadata } from "next";
import { getToday, requireUser } from "@/lib/data";
import { addDays, formatDate } from "@/lib/dates";
import { fullName } from "@/lib/labels";
import type { PersonListRow } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui";
import { deletePersonForever, emptyTrash, restorePerson } from "@/app/actions/people";

export const metadata: Metadata = { title: "Papierkorb" };

export default async function TrashPage() {
  const { supabase } = await requireUser();
  const today = await getToday();
  const { data } = await supabase.rpc("search_people", { p_today: today, p_deleted: true, p_sort: "deleted", p_limit: 500 });
  const rows = (data ?? []) as PersonListRow[];
  return (
    <>
      <PageHeader title="Papierkorb" description="Gelöschte Personen bleiben 30 Tage hier und werden dann mit allen Begegnungen, Erinnerungen und Bildern endgültig entfernt." />
      <Panel>
        <PanelHeader
          title="Gelöschte Personen"
          count={rows.length}
          action={
            rows.length ? (
              <form action={emptyTrash}>
                <ConfirmButton confirm={`Alle ${rows.length} Personen endgültig löschen? Das kann nicht rückgängig gemacht werden.`}>Papierkorb leeren</ConfirmButton>
              </form>
            ) : null
          }
        />
        {rows.length === 0 ? (
          <EmptyState title="Der Papierkorb ist leer." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar person={p} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{fullName(p)}</p>
                  <p className="text-[13px] text-muted">
                    Gelöscht am {formatDate(p.deleted_at)}, endgültig ab {formatDate(addDays(p.deleted_at!.slice(0, 10), 30))}
                  </p>
                </div>
                <form action={restorePerson}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton variant="secondary" size="sm">
                    Wiederherstellen
                  </SubmitButton>
                </form>
                <form action={deletePersonForever}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmButton confirm={`${fullName(p)} endgültig löschen? Das kann nicht rückgängig gemacht werden.`}>Endgültig löschen</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
