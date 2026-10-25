import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseStore } from "@/lib/reminders/store-supabase";
import { runDispatcher, schedulerIsStale } from "@/lib/reminders/dispatcher";
import { sendViaResend } from "@/lib/reminders/resend";
import { buildAlertEmail } from "@/lib/reminders/templates";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOURCES = new Set(["pg_cron", "vercel", "manual"]);

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Systemwarnung direkt über Resend, ohne Datenbank. Höchstens einmal pro Tag und Thema. */
async function alert(topic: string, title: string, detail: string) {
  const to = process.env.ALERT_EMAIL;
  if (!to) {
    console.error(`[register] Warnung ohne ALERT_EMAIL: ${title}`);
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  const payload = buildAlertEmail(appUrl(), title, detail);
  const res = await sendViaResend({ ...payload, to, idempotencyKey: `alert:${topic}:${day}` });
  if (!res.ok) console.error(`[register] Warnung konnte nicht gesendet werden (${res.status})`);
}

async function handle(req: Request, source: string) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!SOURCES.has(source)) source = "manual";

  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ ok: false, error: "missing_configuration" }, { status: 500 });
  }
  const store = supabaseStore(db);

  try {
    const result = await runDispatcher({
      store,
      send: sendViaResend,
      appUrl: appUrl(),
      source,
      pauseMs: 600,
      fallbackRecipient: process.env.ALERT_EMAIL ?? null,
    });
    if (source === "vercel" && (await schedulerIsStale(store, new Date()))) {
      await alert(
        "stale",
        "Der Datenbank-Scheduler läuft nicht",
        "Der tägliche Kontrolllauf hat in den letzten 3 Stunden keinen Lauf von pg_cron gefunden. Erinnerungen werden nur noch einmal täglich verschickt. Bitte cron.sql und die Einstellungen in Supabase prüfen (siehe Anleitung, Abschnitt Fehlersuche).",
      );
    }
    console.log(
      `[register] dispatch source=${source} planned=${result.planned} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}${result.error ? " error" : ""}`,
    );
    return NextResponse.json({
      ok: !result.error,
      planned: result.planned,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
    });
  } catch (e) {
    console.error("[register] Datenbank nicht erreichbar", e instanceof Error ? e.message : "");
    await alert(
      "database",
      "Datenbank nicht erreichbar",
      "Der Scheduler konnte Supabase nicht erreichen. Häufigste Ursache im kostenlosen Tarif: Das Projekt wurde wegen Inaktivität pausiert. Bitte im Supabase-Dashboard prüfen und das Projekt fortsetzen.",
    );
    return NextResponse.json({ ok: false, error: "database_unreachable" }, { status: 503 });
  }
}

export async function GET(req: Request) {
  // Vercel Cron ruft per GET auf
  return handle(req, "vercel");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { source?: string };
  return handle(req, body.source ?? "manual");
}
