/**
 * Advisor message allowance on the app's Claude key. Change the numbers here.
 * People who add their own Anthropic key aren't limited (they pay their own usage).
 */

/** Messages in a person's first 30 days with the advisor. */
export const FIRST_MONTH_LIMIT = 50;
/** Messages per calendar month after that. */
export const MONTHLY_LIMIT = 20;
/** Length of the introductory window, from the first advisor message. */
export const INTRO_DAYS = 30;

/** Claude Sonnet 5.5 pricing, USD per million tokens (cache writes are 1.25× input for the 5-minute cache). */
export const PRICING = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } as const;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function costUsd(u: Usage): number {
  return (
    (u.inputTokens * PRICING.input +
      u.outputTokens * PRICING.output +
      u.cacheReadTokens * PRICING.cacheRead +
      u.cacheWriteTokens * PRICING.cacheWrite) /
    1_000_000
  );
}

export interface AllowanceWindow {
  start: Date;
  end: Date;
  limit: number;
  intro: boolean;
}

/**
 * The window a message counts against: the first 30 days from the person's first
 * advisor message (50 messages), then each calendar month (20). The month the
 * intro ends in only counts messages sent after the intro.
 */
export function allowanceWindow(firstMessageAt: Date | null, now: Date): AllowanceWindow {
  const introStart = firstMessageAt ?? now;
  const introEnd = new Date(introStart.getTime() + INTRO_DAYS * 86_400_000);
  if (now < introEnd) return { start: introStart, end: introEnd, limit: FIRST_MONTH_LIMIT, intro: true };
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: monthStart > introEnd ? monthStart : introEnd, end: monthEnd, limit: MONTHLY_LIMIT, intro: false };
}
