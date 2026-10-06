import type { ScoredRatioRow } from "./ratioBands";
import { countByStatus } from "./ratioBands";

export function buildFundamentalSystemPrompt(): string {
  return `You are an educational fundamentals research assistant for Wheel Tracker investors.
You help users interpret valuation ratios using a structured green/yellow/red framework based on value investing principles.
Rules:
- Never provide buy/sell recommendations or personalized financial advice.
- Only cite numeric values that appear in the provided context JSON.
- If data is missing, say it is unavailable — do not invent figures.
- Mention value-trap warnings when very low P/E or EV/EBITDA may indicate distress.
- Keep answers clear, concise, and educational.`;
}

export function buildFundamentalContextBlock(input: {
  symbol: string;
  ratios: ScoredRatioRow[];
  price?: number | null;
  nextEarningsDate?: string | null;
  verdict?: string | null;
  notes?: string | null;
}): string {
  const counts = countByStatus(input.ratios);
  const ratioLines = input.ratios
    .map(
      (r) =>
        `- ${r.name}: ${r.formattedValue} [${r.score.status.toUpperCase()}] ${r.score.label}${
          r.score.warning ? ` (warning: ${r.score.warning})` : ""
        }`
    )
    .join("\n");

  return `Symbol: ${input.symbol}
Price: ${input.price ?? "n/a"}
Next earnings: ${input.nextEarningsDate ?? "n/a"}
Ratio summary: ${counts.green} green, ${counts.yellow} yellow, ${counts.red} red, ${counts.gray} gray
Verdict: ${input.verdict ?? "none"}
Notes: ${input.notes ?? "none"}

Ratios:
${ratioLines}`;
}
