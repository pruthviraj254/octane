import { ArrowUpRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 md:pb-20 md:pt-14">{children}</main>;
}

export function PageHeader({ title, description, aside }: { title: ReactNode; description?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0 max-w-3xl">
        <h1 className="headline text-[44px] sm:text-6xl lg:text-7xl">{title}</h1>
        {description && <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-2 sm:text-base">{description}</p>}
      </div>
      {aside}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-sm font-medium text-ink-2">{children}</h2>
      {aside}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`spot rounded-2xl border border-line bg-surface ${className}`}>{children}</div>;
}

/** Rows divided by hairlines: the layout for every list in the app. */
export function List({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>;
}

export function Stat({ label, value, hint, large = false }: { label: string; value: ReactNode; hint?: ReactNode; large?: boolean }) {
  return (
    <div className="spot min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-xs text-ink-3 sm:text-[13px]">{label}</p>
      <div className={`figure mt-2 truncate ${large ? "text-[27px] sm:text-5xl" : "text-xl sm:text-[28px]"}`}>{value}</div>
      {hint && <p className="mt-1.5 truncate text-xs text-ink-3">{hint}</p>}
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
      ? "shine bg-accent font-semibold text-canvas shadow-[0_10px_34px_-12px_rgb(255_107_44/0.75)] hover:bg-accent-bright"
      : "border border-line-strong text-ink hover:bg-raised";
  return (
    <button
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-[background-color,transform,opacity] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${look} ${className}`}
    />
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "positive" | "caution" }) {
  const look = {
    neutral: "bg-raised text-ink-2",
    accent: "bg-accent-soft text-accent-bright",
    positive: "bg-positive-soft text-positive",
    caution: "bg-caution-soft text-caution",
  }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ${look}`}>{children}</span>;
}

export function LiveDot({ live = true }: { live?: boolean }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-accent" : "bg-ink-3"}`} />
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`inline-block animate-pulse rounded-lg bg-raised ${className}`} />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-3">{children}</p>;
}

export function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-0.5 text-sm text-ink-2 transition-colors hover:text-ink"
    >
      {children}
      <ArrowUpRight size={14} className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
    </a>
  );
}
