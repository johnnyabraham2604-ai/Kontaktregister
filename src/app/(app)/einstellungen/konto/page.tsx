import type { Metadata } from "next";
import { requireUser } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input, PageHeader, Panel, PanelHeader, buttonClass } from "@/components/ui";
import { changePassword } from "@/app/actions/settings";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Konto" };

export default async function AccountPage() {
  const { user } = await requireUser();
  return (
    <>
      <PageHeader title="Konto" description={`Angemeldet als ${user.email}`} />
      <div className="grid max-w-3xl gap-6">
        <Panel id="passwort">
          <PanelHeader title="Passwort ändern" />
          <ActionForm action={changePassword} showSuccess className="space-y-4 px-4 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Neues Passwort" htmlFor="pw" hint="Mindestens 12 Zeichen">
                <Input id="pw" name="password" type="password" autoComplete="new-password" minLength={12} required />
              </Field>
              <Field label="Wiederholen" htmlFor="pw2">
                <Input id="pw2" name="password_confirm" type="password" autoComplete="new-password" minLength={12} required />
              </Field>
            </div>
            <div className="flex justify-end">
              <SubmitButton pendingLabel="Speichert …">Passwort ändern</SubmitButton>
            </div>
          </ActionForm>
        </Panel>
        <Panel>
          <PanelHeader title="Abmelden" />
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-[14px] text-muted">
            <p>Beendet die Sitzung auf diesem Gerät.</p>
            <form action={signOut}>
              <button className={buttonClass("secondary")}>Abmelden</button>
            </form>
          </div>
        </Panel>
      </div>
    </>
  );
}
