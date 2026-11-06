import type { MetadataRoute } from "next";

/** Macht Register auf dem Handy installierbar (eigenes Fenster, eigenes Symbol, kein Browser-Rahmen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Register",
    short_name: "Register",
    description: "Persönliches Gedächtnis für die Menschen, die ich kenne.",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f5",
    theme_color: "#f6f7f5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Erinnerungen", url: "/erinnerungen" },
      { name: "Personen", url: "/personen" },
    ],
  };
}
