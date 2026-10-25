"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/einstellungen", label: "Erinnerungen und E-Mail" },
  { href: "/einstellungen/versand", label: "Versandprotokoll" },
  { href: "/einstellungen/daten", label: "Import und Export" },
  { href: "/einstellungen/papierkorb", label: "Papierkorb" },
  { href: "/einstellungen/konto", label: "Konto" },
  { href: "/ordnung", label: "Ordnung", mobileOnly: true },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Einstellungen" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {ITEMS.map((i) => {
        const active = pathname === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[14px]",
              active ? "border-accent font-semibold text-accent" : "border-transparent text-muted hover:text-ink",
              i.mobileOnly && "lg:hidden",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
