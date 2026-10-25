"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field, Input } from "@/components/ui";
import { requestPasswordReset, signIn } from "@/app/actions/auth";

export function LoginForms({ next }: { next: string }) {
  const [reset, setReset] = useState(false);
  if (reset) {
    return (
      <ActionForm action={requestPasswordReset} className="space-y-4" showSuccess resetOnSuccess={false}>
        <p className="text-[14px] text-muted">Du bekommst einen Link, mit dem du ein neues Passwort setzen kannst.</p>
        <Field label="E-Mail-Adresse" htmlFor="reset-email">
          <Input id="reset-email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton className="w-full" pendingLabel="Wird gesendet …">
          Link anfordern
        </SubmitButton>
        <button type="button" onClick={() => setReset(false)} className="w-full text-center text-[13px] text-muted hover:text-ink">
          Zurück zur Anmeldung
        </button>
      </ActionForm>
    );
  }
  return (
    <ActionForm action={signIn} className="space-y-4" resetOnSuccess={false}>
      <input type="hidden" name="next" value={next} />
      <Field label="E-Mail-Adresse" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Passwort" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Anmelden …">
        Anmelden
      </SubmitButton>
      <button type="button" onClick={() => setReset(true)} className="w-full text-center text-[13px] text-muted hover:text-ink">
        Passwort vergessen
      </button>
    </ActionForm>
  );
}
