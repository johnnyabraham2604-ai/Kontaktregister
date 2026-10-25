"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BookUser, History, LayoutGrid, Settings2, Tags } from "lucide-react";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Übersicht", icon: LayoutGrid, mobile: true },
  { href: "/personen", label: "Personen", icon: BookUser, mobile: true },
  { href: "/erinnerungen", label: "Erinnerungen", icon: Bell, mobile: true, badge: true },
  { href: "/verlauf", label: "Verlauf", icon: History, mobile: true },
  { href: "/ordnung", label: "Ordnung", icon: Tags, mobile: false },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings2, mobile: true },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hauptnavigation" className="space-y-0.5">
      {ITEMS.map(({ href, label, icon: Icon, badge }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition-colors",
              active ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-line/50 hover:text-ink",
            )}
          >
            <Icon size={17} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
            <span className="flex-1">{label}</span>
            {badge && dueCount > 0 ? (
              <span className="rounded-full bg-warn px-1.5 text-[11px] font-semibold leading-[18px] text-white tabular">{dueCount}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ dueCount }: { dueCount: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.filter((i) => i.mobile).map(({ href, label, icon: Icon, badge }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-accent" : "text-muted")}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                <span className={active ? "font-semibold" : ""}>{label === "Einstellungen" ? "Mehr" : label}</span>
                {badge && dueCount > 0 ? (
                  <span className="absolute left-1/2 top-1.5 ml-2 rounded-full bg-warn px-1 text-[10px] font-semibold leading-4 text-white tabular">
                    {dueCount}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
