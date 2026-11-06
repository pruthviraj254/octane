const DAY_MS = 86_400_000;

export interface AiLimitOptions {
  perVisitor: number;
  windowMs: number;
  perDay: number;
  now?: () => number;
}

/**
 * Caps how often strangers on a public site can spend AI credit. It lives in memory, so a
 * restart clears it. The daily total still holds when someone varies their address.
 */
export function createAiLimit(options: AiLimitOptions) {
  const now = options.now ?? Date.now;
  const visitors = new Map<string, number[]>();
  let day = Math.floor(now() / DAY_MS);
  let today = 0;

  return {
    allow(visitor: string): boolean {
      const time = now();
      const thisDay = Math.floor(time / DAY_MS);
      if (thisDay !== day) {
        day = thisDay;
        today = 0;
        visitors.clear();
      }
      if (today >= options.perDay) return false;
      const recent = (visitors.get(visitor) ?? []).filter((at) => time - at < options.windowMs);
      if (recent.length >= options.perVisitor) return false;
      visitors.set(visitor, [...recent, time]);
      today += 1;
      return true;
    },
  };
}
