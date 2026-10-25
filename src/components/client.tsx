"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import type { ActionState } from "@/lib/types";
import { buttonClass, cx } from "./ui";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/** Status einer ActionForm. Ersetzt useFormStatus, weil ActionForm per onSubmit absendet. */
const PendingContext = createContext<boolean | null>(null);

/** Absende-Knopf, der während der Server-Aktion deaktiviert ist. */
export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  pendingLabel,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md"; pendingLabel?: string }) {
  const status = useFormStatus();
  const ctx = useContext(PendingContext);
  const pending = ctx ?? status.pending;
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Absende-Knopf mit Sicherheitsabfrage für folgenreiche Aktionen. */
export function ConfirmButton({
  children,
  confirm,
  variant = "danger",
  size = "sm",
  className,
  ...props
}: ComponentProps<"button"> & { confirm: string; variant?: Variant; size?: "sm" | "md" }) {
  const status = useFormStatus();
  const ctx = useContext(PendingContext);
  const pending = ctx ?? status.pending;
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(variant, size, className)}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
      {...props}
    >
      {children}
    </button>
  );
}

const DialogContext = createContext<{ close: () => void } | null>(null);

export function useDialog() {
  return useContext(DialogContext);
}

/** Modaler Dialog auf Basis des nativen dialog-Elements (Fokus, Escape und Barrierefreiheit inklusive). */
export function Dialog({
  label,
  title,
  children,
  variant = "secondary",
  size = "md",
  icon,
  wide,
  triggerClassName,
}: {
  label: string;
  title: string;
  children: ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
  icon?: ReactNode;
  wide?: boolean;
  triggerClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  const open = () => {
    setMounted(true);
    requestAnimationFrame(() => ref.current?.showModal());
  };
  const close = () => ref.current?.close();

  return (
    <>
      <button type="button" onClick={open} className={buttonClass(variant, size, triggerClassName)}>
        {icon}
        {label}
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className={cx(
          "m-auto max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        {mounted ? (
          <div>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-3">
              <h2 className="font-serif text-lg font-semibold">{title}</h2>
              <button type="button" onClick={close} className={buttonClass("ghost", "sm")} aria-label="Schließen">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4">
              <DialogContext.Provider value={{ close }}>{children}</DialogContext.Provider>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

/**
 * Formular für Server-Aktionen mit Rückmeldung. Schließt einen umgebenden Dialog nach Erfolg
 * und setzt sich auf Wunsch zurück. Sendet bewusst per onSubmit statt über das action-Attribut:
 * React setzt Formulare mit action-Attribut nach jedem Absenden zurück, auch bei Fehlern, und
 * Eingaben gingen verloren.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
  closeOnSuccess = true,
  showSuccess = false,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  closeOnSuccess?: boolean;
  showSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialog = useDialog();

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      if (closeOnSuccess) dialog?.close();
    }
  }, [state, resetOnSuccess, closeOnSuccess, dialog]);

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {state && !state.ok && state.message ? (
        <p role="alert" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[14px] text-warn">
          {state.message}
        </p>
      ) : null}
      {state?.ok && state.message && showSuccess ? (
        <p role="status" className="mt-3 rounded-lg bg-ok-soft px-3 py-2 text-[14px] text-ok">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Globale Suche. Taste "/" oder Strg+K setzt den Fokus. */
export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className={cx("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const q = inputRef.current?.value.trim() ?? "";
        router.push(q ? `/personen?q=${encodeURIComponent(q)}&sort=relevance` : "/personen");
        inputRef.current?.blur();
      }}
    >
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
      <input
        ref={inputRef}
        key={params.get("q") ?? ""}
        defaultValue={params.get("q") ?? ""}
        type="search"
        name="q"
        enterKeyHint="search"
        placeholder="Personen, Firmen, Gesprächsthemen suchen"
        aria-label="Suche"
        className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-12 text-[15px] placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-faint sm:block">
        /
      </kbd>
    </form>
  );
}

/** GET-Formular, das sich bei Änderungen selbst abschickt (Filter im Personenverzeichnis). */
export function AutoSubmitForm({ children, className, action }: { children: ReactNode; className?: string; action: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <form
      ref={ref}
      action={action}
      method="get"
      className={className}
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement;
        if (timer.current) clearTimeout(timer.current);
        const delay = t.type === "text" || t.type === "search" ? 500 : 0;
        timer.current = setTimeout(() => ref.current?.requestSubmit(), delay);
      }}
    >
      {children}
    </form>
  );
}

/**
 * Auswahl von Tags, Interessen oder Kategorien als Chips. Neue Einträge können direkt angelegt
 * werden. Schickt die gewählten IDs als `${name}` und neue Namen als `${name}_new`.
 */
export function ChipPicker({
  name,
  options,
  selected,
  allowCreate = true,
  placeholder = "Neu hinzufügen",
}: {
  name: string;
  options: { id: string; name: string }[];
  selected: string[];
  allowCreate?: boolean;
  placeholder?: string;
}) {
  const [chosen, setChosen] = useState<string[]>(selected);
  const [created, setCreated] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const addDraft = () => {
    const names = draft
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const next = [...created];
    for (const n of names) {
      const existing = options.find((o) => o.name.toLowerCase() === n.toLowerCase());
      if (existing) {
        if (!chosen.includes(existing.id)) setChosen((c) => [...c, existing.id]);
      } else if (!next.some((x) => x.toLowerCase() === n.toLowerCase())) {
        next.push(n);
      }
    }
    setCreated(next);
    setDraft("");
  };

  const visible = filter ? options.filter((o) => o.name.toLowerCase().includes(filter.toLowerCase())) : options;

  return (
    <div className="space-y-2">
      {chosen.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {created.map((n) => (
        <input key={n} type="hidden" name={`${name}_new`} value={n} />
      ))}
      {options.length > 12 ? (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Liste filtern"
          className="h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
        />
      ) : null}
      <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
        {visible.map((o) => {
          const on = chosen.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.id)}
              className={cx(
                "rounded-full border px-2.5 py-1 text-[13px] transition-colors",
                on ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-surface text-ink hover:border-accent",
              )}
            >
              {o.name}
            </button>
          );
        })}
        {created.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setCreated((c) => c.filter((x) => x !== n))}
            className="rounded-full border border-accent bg-accent px-2.5 py-1 text-[13px] text-on-accent"
            title="Entfernen"
          >
            {n} (neu)
          </button>
        ))}
        {options.length === 0 && created.length === 0 ? <span className="text-[13px] text-faint">Noch keine Einträge</span> : null}
      </div>
      {allowCreate ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
            placeholder={placeholder}
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 text-[13px] placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button type="button" onClick={addDraft} className={buttonClass("secondary", "sm")}>
            Hinzufügen
          </button>
        </div>
      ) : null}
    </div>
  );
}
