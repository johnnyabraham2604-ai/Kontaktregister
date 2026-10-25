"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/env";
import { str } from "@/lib/form";
import type { ActionState } from "@/lib/types";

function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!email || !password) return { ok: false, message: "Bitte E-Mail-Adresse und Passwort eingeben." };
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: "Anmeldung fehlgeschlagen. E-Mail-Adresse oder Passwort stimmen nicht." };
  if (allowed && email !== allowed) {
    await supabase.auth.signOut();
    return { ok: false, message: "Dieses Konto hat keinen Zugriff auf dieses Register." };
  }
  redirect(safeNext(str(fd, "next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  if (!email) return { ok: false, message: "Bitte die E-Mail-Adresse eingeben." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/callback?next=/einstellungen/konto`,
  });
  // Immer dieselbe Antwort, damit nicht erkennbar ist, ob ein Konto existiert.
  return { ok: true, message: "Falls ein Konto existiert, ist ein Link zum Zurücksetzen unterwegs." };
}
