"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { setPhoto } from "@/app/actions/people";
import { buttonClass } from "./ui";

/** Verkleinert ein Bild im Browser auf höchstens 512 px und speichert es als JPEG. */
async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht verarbeitet werden"))), "image/jpeg", 0.85));
}

export function PhotoUpload({ personId, userId, hasPhoto }: { personId: string; userId: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Bitte eine Bilddatei wählen.");
    setBusy(true);
    try {
      const blob = await resize(file);
      const path = `${userId}/${personId}-${Date.now()}.jpg`;
      const supabase = createBrowserSupabase();
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const res = await setPhoto(personId, path);
      if (!res?.ok) throw new Error(res?.message ?? "Speichern fehlgeschlagen");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hochladen fehlgeschlagen");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} aria-label="Profilbild wählen" />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={buttonClass("ghost", "sm")}>
        <Camera size={14} aria-hidden />
        {busy ? "Lädt hoch …" : hasPhoto ? "Bild ändern" : "Bild hinzufügen"}
      </button>
      {hasPhoto ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm("Profilbild entfernen?")) return;
            setBusy(true);
            await setPhoto(personId, null);
            setBusy(false);
          }}
          className={buttonClass("ghost", "sm")}
        >
          Entfernen
        </button>
      ) : null}
      {error ? <p className="w-full text-[13px] text-warn">{error}</p> : null}
    </div>
  );
}
