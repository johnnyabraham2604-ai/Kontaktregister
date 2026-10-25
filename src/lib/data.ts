import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CATEGORIES } from "@/lib/labels";
import { todayIn } from "@/lib/dates";
import type { Category, FieldDefinition, Settings, Tag } from "@/lib/types";

/**
 * Prüft die Sitzung serverseitig gegen Supabase Auth. Jede Seite und jede Server-Aktion
 * ruft das auf, bevor sie Daten liest oder schreibt. RLS schützt zusätzlich in der Datenbank.
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (allowed && data.user.email?.toLowerCase() !== allowed) {
    await supabase.auth.signOut();
    redirect("/login?fehler=zugriff");
  }
  return { supabase, user: data.user };
});

/** Einstellungen lesen. Beim allerersten Aufruf werden Standardwerte und Startkategorien angelegt. */
export const getSettings = cache(async (): Promise<Settings> => {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle();
  if (data) return data as Settings;

  const { data: created, error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, recipient_email: user.email ?? null }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  const { count } = await supabase.from("categories").select("id", { count: "exact", head: true });
  if (!count) {
    await supabase.from("categories").insert(DEFAULT_CATEGORIES.map((name, i) => ({ name, sort_order: i })));
  }
  if (error || !created) {
    const { data: again } = await supabase.from("settings").select("*").eq("user_id", user.id).single();
    return again as Settings;
  }
  return created as Settings;
});

export const getToday = cache(async () => todayIn((await getSettings()).timezone));

export const getTaxonomy = cache(async () => {
  const { supabase } = await requireUser();
  const [cats, tags] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order").order("name"),
    supabase.from("tags").select("*").order("name"),
  ]);
  const categories = (cats.data ?? []) as Category[];
  const allTags = (tags.data ?? []) as Tag[];
  return {
    categories,
    tags: allTags.filter((t) => t.kind === "tag"),
    interests: allTags.filter((t) => t.kind === "interest"),
    byId: new Map<string, { name: string; kind: "category" | "tag" | "interest" }>([
      ...categories.map((c) => [c.id, { name: c.name, kind: "category" as const }] as const),
      ...allTags.map((t) => [t.id, { name: t.name, kind: t.kind }] as const),
    ]),
  };
});

export const getFieldDefinitions = cache(async () => {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("field_definitions").select("*").order("sort_order").order("label");
  return (data ?? []) as FieldDefinition[];
});

/** Kurzlebige, signierte Bild-URLs (1 Stunde) für private Profilbilder. */
export async function photoUrls(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  const map = new Map<string, string>();
  if (list.length === 0) return map;
  const { supabase } = await requireUser();
  const { data } = await supabase.storage.from("avatars").createSignedUrls(list, 3600);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}

export async function getSchedulerHealth() {
  const { supabase } = await requireUser();
  const [runs, failed] = await Promise.all([
    supabase.from("scheduler_runs").select("*").order("started_at", { ascending: false }).limit(1),
    supabase.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  const lastRun = (runs.data?.[0] ?? null) as { started_at: string; source: string; error: string | null } | null;
  return { lastRun, failedCount: failed.count ?? 0 };
}
