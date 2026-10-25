/**
 * Zentrale, typisierte Umgebungsvariablen.
 * Öffentliche Werte (NEXT_PUBLIC_*) dürfen im Browser landen, alle anderen nur auf dem Server.
 */
export function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase ist nicht konfiguriert: NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen.",
    );
  }
  return { supabaseUrl: url, supabaseKey: key };
}

export function appUrl(): string {
  const explicit = process.env.APP_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const DEFAULT_EMAIL_FROM = "Register <onboarding@resend.dev>";
