import { ArrowUpRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-8 sm:px-6 sm:pt-14">{children}</main>;
}

export function PageHeader({ title, description, aside }: { title: string; description?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{description}</p>}
      </div>
      {aside}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

/** Rows divided by hairlines: the layout for every list in the app. */
export function List({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3.5">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1.5 truncate text-lg font-medium tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5 text-sm">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums text-ink">{children}</dd>
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" };

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const look =
    variant === "primary"
      ? "bg-ink text-canvas hover:bg-white"
      : "border border-line-strong text-ink hover:bg-raised";
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${look} ${className}`}
    />
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "positive" | "caution" }) {
  const look = {
    neutral: "bg-raised text-ink-2",
    accent: "bg-accent-soft text-accent",
    positive: "bg-positive-soft text-positive",
    caution: "bg-caution-soft text-caution",
  }[tone];
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ${look}`}>{children}</span>;
}

export function LiveDot({ live = true }: { live?: boolean }) {
  return (
    <span className="relative flex h-1.5 w-1.5">
      {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-50" />}
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${live ? "bg-positive" : "bg-ink-3"}`} />
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`inline-block animate-pulse rounded-md bg-raised ${className}`} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-3">{children}</p>;
}

export function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-sm text-ink-2 transition-colors hover:text-ink"
    >
      {children}
      <ArrowUpRight size={14} aria-hidden />
    </a>
  );
}
