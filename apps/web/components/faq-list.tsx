import { Plus } from "lucide-react";
import type { Faq } from "@/lib/site";

/** Native disclosure rows, so answers open with no script and are found by in-page search. */
export function FaqList({ items }: { items: Faq[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {items.map((item) => (
        <details key={item.question} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-[15px] font-medium transition-colors hover:bg-raised/60 sm:px-5 [&::-webkit-details-marker]:hidden">
            {item.question}
            <Plus size={16} className="shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-45 group-open:text-accent" aria-hidden />
          </summary>
          <p className="max-w-3xl animate-rise px-4 pb-4 text-sm leading-relaxed text-ink-2 sm:px-5">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
