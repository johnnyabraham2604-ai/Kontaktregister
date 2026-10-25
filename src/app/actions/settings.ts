"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/data";
import { bool, isoTime, str, uuid } from "@/lib/form";
import { isValidTimeZone } from "@/lib/dates";
import { appUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseStore } from "@/lib/reminders/store-supabase";
import { deliverOne, runDispatcher } from "@/lib/reminders/dispatcher";
import { sendViaResend } from "@/lib/reminders/resend";
import type { ActionState, OutboxRow } from "@/lib/types";
import { dbError } from "./helpers";

export async function saveSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const recipient_email = str(fd, "recipient_email");
  const timezone = str(fd, "timezone");
  const digest_time = str(fd, "digest_time");
  const default_reminder_time = str(fd, "default_reminder_time");
  const lead = Number(str(fd, "individual_lead_days"));
  const email_detail = str(fd, "email_detail");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient_email)) return { ok: false, message: "Bitte eine gültige Empfängeradresse eingeben." };
  if (!isValidTimeZone(timezone)) return { ok: false, message: "Unbekannte Zeitzone." };
  if (!isoTime.safeParse(digest_time).success || !isoTime.safeParse(default_reminder_time).success) {
    return { ok: false, message: "Bitte gültige Uhrzeiten eingeben." };
  }
  if (!Number.isInteger(lead) || lead < 0 || lead > 30) return { ok: false, message: "Vorlauf muss zwischen 0 und 30 Tagen liegen." };
  if (email_detail !== "full" && email_detail !== "minimal") return { ok: false, message: "Ungültiger E-Mail-Umfang." };

  const { error } = await supabase
    .from("settings")
    .update({
      recipient_email,
      timezone,
      digest_time,
      default_reminder_time,
      individual_lead_days: lead,
      email_detail,
      digest_enabled: bool(fd, "digest_enabled"),
      digest_include_overdue: bool(fd, "digest_include_overdue"),
      digest_include_done: bool(fd, "digest_include_done"),
      individual_enabled: bool(fd, "individual_enabled"),
    })
    .eq("user_id", user.id);
  if (error) return { ok: false, message: dbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Einstellungen gespeichert." };
}

/** Sendet sofort eine echte Test-E-Mail über denselben Weg wie die Erinnerungen und protokolliert sie. */
export async function sendTestEmail(): Promise<ActionState> {
  const { user } = await requireUser();
  let db;
  try {
    db = createAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SECRET_KEY fehlt in den Umgebungsvariablen." };
  }
  if (!process.env.RESEND_API_KEY) return { ok: false, message: "RESEND_API_KEY fehlt in den Umgebungsvariablen." };

  const { data, error } = await db
    .from("email_outbox")
    .insert({
      user_id: user.id,
      kind: "test",
      idempotency_key: `test:${randomUUID()}`,
      status: "sending",
      attempts: 1,
      locked_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, message: "Test-Auftrag konnte nicht angelegt werden." };

  const store = supabaseStore(db);
  const outcome = await deliverOne(
    { store, send: sendViaResend, appUrl: appUrl(), fallbackRecipient: null },
    data as OutboxRow,
    new Map(),
  );
  revalidatePath("/einstellungen", "layout");
  if (outcome === "sent") {
    const { data: row } = await db.from("email_outbox").select("provider_message_id").eq("id", data.id).single();
    return { ok: true, message: `Test-E-Mail gesendet. Resend-ID ${row?.provider_message_id ?? "unbekannt"}. Bitte Posteingang und Spam prüfen.` };
  }
  const { data: row } = await db.from("email_outbox").select("last_error").eq("id", data.id).single();
  return { ok: false, message: `Versand fehlgeschlagen: ${row?.last_error ?? "unbekannter Fehler"}` };
}

/** Scheduler sofort laufen lassen (für die Abnahme und zur Fehlersuche). */
export async function runSchedulerNow(): Promise<ActionState> {
  await requireUser();
  let db;
  try {
    db = createAdminClient();
  } catch {
    return { ok: false, message: "SUPABASE_SECRET_KEY fehlt in den Umgebungsvariablen." };
  }
  const res = await runDispatcher({
    store: supabaseStore(db),
    send: sendViaResend,
    appUrl: appUrl(),
    source: "manual",
    pauseMs: 600,
    fallbackRecipient: process.env.ALERT_EMAIL ?? null,
  });
  revalidatePath("/", "layout");
  if (res.error) return { ok: false, message: `Lauf mit Fehler beendet: ${res.error}` };
  return {
    ok: true,
    message: `Lauf beendet: ${res.planned} neu eingeplant, ${res.sent} gesendet, ${res.skipped} übersprungen, ${res.failed} fehlgeschlagen.`,
  };
}

export async function retryEmail(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  if (!uuid.safeParse(id).success) return;
  await supabase.rpc("retry_email", { p_id: id });
  revalidatePath("/einstellungen", "layout");
}

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireUser();
  const pw = str(fd, "password");
  const confirm = str(fd, "password_confirm");
  if (pw.length < 12) return { ok: false, message: "Das Passwort braucht mindestens 12 Zeichen." };
  if (pw !== confirm) return { ok: false, message: "Die beiden Passwörter stimmen nicht überein." };
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) return { ok: false, message: `Passwort nicht geändert: ${error.message}` };
  return { ok: true, message: "Passwort geändert." };
}
