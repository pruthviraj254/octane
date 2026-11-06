"use client";

import { AnimatePresence, motion } from "motion/react";
import { EASE } from "./providers";

/**
 * A number whose changed digits roll into place. Digits are keyed from the right, so the decimal
 * point holds still when a value grows. Only the live digit stays in the page's text.
 */
export function Ticker({ value, dimFrom }: { value: string; dimFrom?: number }) {
  const characters = [...value];
  return (
    <span role="img" aria-label={value} className="inline-flex tabular-nums">
      {characters.map((character, index) => (
        <span
          key={characters.length - index}
          className={`relative inline-block overflow-hidden ${dimFrom !== undefined && index >= dimFrom ? "text-ink-3" : ""}`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={character}
              className="inline-block"
              initial={{ y: "80%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-80%", opacity: 0 }}
              transition={{ duration: 0.38, ease: EASE }}
            >
              {character}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
