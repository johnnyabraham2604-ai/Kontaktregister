import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Server-Client mit Service-Schlüssel. Umgeht RLS und darf deshalb nur im Scheduler
 * und in klar abgegrenzten Server-Aktionen benutzt werden, nie im Browser.
 */
export function createAdminClient() {
  const { supabaseUrl } = publicEnv();
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY fehlt.");
  return createClient(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
