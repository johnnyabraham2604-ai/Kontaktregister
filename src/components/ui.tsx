import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Gemeinsame, rein darstellende Bausteine. Keine Hooks, nutzbar in Server- und Client-Komponenten. */

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none",
    size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-10 px-3.5 text-sm",
    variant === "primary" && "bg-accent text-on-accent hover:bg-accent-hover",
    variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-paper",
    variant === "ghost" && "text-muted hover:text-ink hover:bg-line/50",
    variant === "danger" && "border border-warn/40 bg-surface text-warn hover:bg-warn-soft",
    extra,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export const inputClass =
  "block rounded-lg border border-line-strong bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

/** Volle Breite, außer die Aufrufstelle setzt selbst eine Breite (w-auto, w-36, …). */
const width = (className?: string) => (/(^|\s)(w-|min-w-|flex-1)/.test(className ?? "") ? "" : "w-full");

const height = (className?: string) => (/(^|\s)h-/.test(className ?? "") ? "" : "h-10");

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputClass, height(className), width(className), className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputClass, "min-h-24 w-full leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputClass, "pr-8", height(className), width(className), className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-warn">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 py-1 text-[15px]">
      <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--accent)]" {...props} />
      <span>
        {label}
        {hint ? <span className="block text-[13px] text-faint">{hint}</span> : null}
      </span>
    </label>
  );
}

type Tone = "neutral" | "accent" | "warn" | "amber" | "ok";

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium leading-4",
        tone === "neutral" && "bg-line/60 text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "amber" && "bg-amber-soft text-amber",
        tone === "ok" && "bg-ok-soft text-ok",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("rounded-xl border border-line bg-surface", className)}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, action, count }: { title: string; action?: ReactNode; count?: number }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2">
      <h2 className="text-[15px] font-semibold">
        {title}
        {typeof count === "number" ? <span className="ml-1.5 font-normal text-faint tabular">{count}</span> : null}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        {description ? <p className="mt-1 text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-sm text-[14px] text-muted">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "warn", children }: { tone?: "warn" | "amber" | "ok" | "accent"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={cx(
        "rounded-lg border px-3.5 py-2.5 text-[14px]",
        tone === "warn" && "border-warn/30 bg-warn-soft text-warn",
        tone === "amber" && "border-amber/30 bg-amber-soft text-amber",
        tone === "ok" && "border-ok/30 bg-ok-soft text-ok",
        tone === "accent" && "border-accent/30 bg-accent-soft text-accent",
      )}
    >
      {children}
    </div>
  );
}
