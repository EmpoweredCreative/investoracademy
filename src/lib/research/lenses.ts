import { z } from "zod";
import { METRIC_KEYS, METRICS, type CriteriaProfile, type MetricKey } from "@/lib/fundamentals/criteria";

/**
 * Investor lenses: built-in research approaches inspired by publicly described
 * investing philosophies. A lens sets the Analyst's frame of mind, the criteria a
 * stock is scored against, the questions a report must answer, and a Finviz
 * screen to find candidates. Custom strategies (user-defined) share this shape.
 */
export const BUILTIN_LENS_KEYS = ["buffett", "lynch", "druckenmiller"] as const;
export type BuiltinLensKey = (typeof BUILTIN_LENS_KEYS)[number];

export interface Lens {
  key: string;
  /** Pill label. */
  name: string;
  inspiredBy: string;
  tagline: string;
  /** One paragraph shown on the lens card. */
  philosophy: string;
  example: string;
  criteria: CriteriaProfile;
  /** Finviz screener filter codes (see src/lib/finviz/filters.ts). */
  finvizFilters: string[];
  /** Questions every report under this lens must answer. */
  questions: string[];
  /** How the Analyst should think under this lens (system prompt block). */
  prompt: string;
  /** For saved strategies: the built-in lens they started from (sets score weights). */
  baseLens?: string | null;
}

type Overrides = Partial<Record<MetricKey, { good: number; ok: number; weight: number; required?: boolean } | false>>;

/** Build a criteria profile: listed metrics enabled with the given thresholds, everything else off. */
function profile(passScore: number, overrides: Overrides): CriteriaProfile {
  return {
    passScore,
    criteria: METRIC_KEYS.map((key) => {
      const o = overrides[key];
      if (!o) return { key, ...METRICS[key].defaults, enabled: false, required: false };
      return { key, enabled: true, good: o.good, ok: o.ok, weight: o.weight, required: o.required ?? false };
    }),
  };
}

const CORE_QUESTIONS = [
  "What does the company do, and how does it make money?",
  "What is its competitive advantage?",
  "Does it have a moat? What kind, and how durable is it?",
  "What is its greatest risk?",
];

export const LENSES: Record<BuiltinLensKey, Lens> = {
  buffett: {
    key: "buffett",
    name: "Buffett",
    inspiredBy: "Warren Buffett",
    tagline: "Wonderful businesses at fair prices",
    philosophy:
      "Look for durable competitive advantages, high and consistent returns on capital, little debt, honest management that allocates capital well, and a price below a conservative estimate of intrinsic value.",
    example: "Research KO through the Buffett lens",
    criteria: profile(65, {
      returnOnEquity: { good: 20, ok: 15, weight: 3, required: true },
      profitMargin: { good: 20, ok: 12, weight: 2 },
      debtToEquity: { good: 0.5, ok: 1, weight: 2 },
      fcfYield: { good: 5, ok: 3.5, weight: 2 },
      trailingPe: { good: 18, ok: 25, weight: 1 },
      priceToBook: { good: 3, ok: 6, weight: 1 },
      revenueGrowth: { good: 6, ok: 2, weight: 1 },
      marginOfSafety: { good: 25, ok: 10, weight: 3 },
    }),
    finvizFilters: ["cap_midover", "fa_roe_o15", "fa_debteq_u0.5", "fa_opermargin_o15", "fa_eps5years_pos", "fa_pe_u25"],
    questions: [
      ...CORE_QUESTIONS,
      "Have returns on capital and margins been consistently high for a decade, or only recently?",
      "How well does management allocate capital (reinvestment, buybacks, dividends, acquisitions)? Are they candid?",
      "Is this business inside a reasonable circle of competence: simple enough to predict 10 years out?",
      "What are owner earnings, and what margin of safety does the price offer?",
    ],
    prompt: `Lens: BUFFETT-STYLE (inspired by Warren Buffett's publicly described approach; you are not Buffett and shouldn't claim to speak for him).
Think like a business owner buying the whole company for decades:
- The moat is the centre: name its source (brand, switching costs, network effects, cost advantage, efficient scale, intangibles/licences) and judge durability. No moat → say so plainly.
- Demand consistency: 10 years of high ROE/ROIC and stable margins beat one great year. Use long-term financials and filings when available; flag cyclical peaks.
- Prefer low debt and strong free-cash conversion. Estimate owner earnings (net income + D&A − maintenance capex) when the data allows.
- Judge management by capital allocation and candour (what the 10-K admits, how buybacks are priced, acquisitions).
- Value conservatively (DCF with modest growth); insist on a margin of safety. "A wonderful company at a fair price" beats "a fair company at a wonderful price".
- Say when a business is too complex or fast-changing to forecast (outside the circle of competence).`,
  },

  lynch: {
    key: "lynch",
    name: "Lynch",
    inspiredBy: "Peter Lynch",
    tagline: "Know what you own, and why",
    philosophy:
      "Classify the company (slow grower, stalwart, fast grower, cyclical, turnaround or asset play), tell its story in two minutes, and buy growth at a reasonable price: PEG near or below 1, a clean balance sheet and insiders buying.",
    example: "Research CMG through the Lynch lens",
    criteria: profile(60, {
      pegRatio: { good: 1, ok: 1.5, weight: 3, required: true },
      earningsGrowth: { good: 20, ok: 10, weight: 2 },
      revenueGrowth: { good: 15, ok: 8, weight: 2 },
      debtToEquity: { good: 0.35, ok: 0.8, weight: 2 },
      trailingPe: { good: 20, ok: 30, weight: 1 },
      forwardPe: { good: 18, ok: 25, weight: 1 },
      profitMargin: { good: 10, ok: 5, weight: 1 },
    }),
    // Insider buying is a plus, not a gate (it's rare); reports check it for every stock.
    finvizFilters: ["fa_peg_u1", "fa_debteq_u0.5", "fa_eps5years_o15", "sh_instown_u50"],
    questions: [
      ...CORE_QUESTIONS,
      "Which of the six categories is it (slow grower, stalwart, fast grower, cyclical, turnaround, asset play), and what does that imply?",
      "What is the two-minute story: why will earnings grow, and what has to go right?",
      "Is growth reasonably priced (PEG, and growth plus dividend yield relative to P/E)?",
      "Are insiders buying or selling? Is the stock still under-owned by institutions?",
      "Any warning signs: inventories growing faster than sales, diworsification, a hot story in a hot industry?",
    ],
    prompt: `Lens: LYNCH-STYLE (inspired by Peter Lynch's publicly described approach; you are not Lynch and shouldn't claim to speak for him).
- First, classify the company into one of six categories (slow grower, stalwart, fast grower, cyclical, turnaround, asset play) and judge it by that category's rules. A cyclical on a low P/E at peak earnings is a trap; a fast grower is judged by how long growth can last.
- Tell the two-minute story in plain language: what they sell, why earnings grow, what must go right. If you can't tell it simply, say so.
- Price growth: PEG ≤ 1 is attractive, ~2 is expensive; also (long-term growth + dividend yield) ÷ P/E (≥ 2 good, < 1 poor).
- Balance sheet: low debt; check cash vs debt.
- Look for insider buying, buybacks and low institutional ownership; warn about hot stories, diworsification, and inventories rising faster than sales.
- Prefer boring, understandable businesses; "know what you own".`,
  },

  druckenmiller: {
    key: "druckenmiller",
    name: "Druckenmiller",
    inspiredBy: "Stanley Druckenmiller",
    tagline: "Liquidity, earnings momentum, asymmetry",
    philosophy:
      "Start top-down: liquidity, rates and the economic cycle drive markets. Then find companies where earnings are inflecting up over the next 18–24 months, the price trend confirms it, and the upside is far larger than the downside.",
    example: "Research NVDA through the Druckenmiller lens",
    criteria: profile(55, {
      earningsGrowth: { good: 25, ok: 10, weight: 3 },
      revenueGrowth: { good: 15, ok: 8, weight: 3 },
      forwardPe: { good: 25, ok: 40, weight: 1 },
      pegRatio: { good: 1.5, ok: 2.5, weight: 1 },
      profitMargin: { good: 15, ok: 8, weight: 1 },
      returnOnEquity: { good: 15, ok: 10, weight: 1 },
    }),
    finvizFilters: ["cap_midover", "sh_avgvol_o500", "ta_sma50_pa", "ta_sma200_pa", "fa_epsqoq_o20", "fa_salesqoq_o10"],
    questions: [
      ...CORE_QUESTIONS,
      "What is the macro and liquidity backdrop (rates, Fed, dollar, cycle), and does it help or hurt this business?",
      "Are earnings accelerating or being revised up over the next 18–24 months? What is the catalyst?",
      "Does the price trend confirm the fundamental story?",
      "Is the risk/reward asymmetric: how much could be made if right versus lost if wrong, and what would prove the thesis wrong?",
    ],
    prompt: `Lens: DRUCKENMILLER-STYLE (inspired by Stanley Druckenmiller's publicly described approach; you are not Druckenmiller and shouldn't claim to speak for him).
- Go top-down first: liquidity (central bank policy, rates, credit), the economic cycle, the dollar. Earnings and liquidity, not valuation alone, move stocks. Use macro data when a tool provides it; otherwise say what you'd want to check.
- Look 18–24 months ahead: where will earnings be, and is that different from consensus? Focus on inflections, revisions and catalysts.
- Respect the price trend: it should confirm the story. Note when it doesn't.
- Frame risk/reward asymmetry: upside if right vs downside if wrong, and the specific evidence that would prove the thesis wrong.
- Concentration only follows conviction; be explicit about conviction level and what would change it. Still education, not trade instructions.`,
  },
};

export const lensKeySchema = z.enum(BUILTIN_LENS_KEYS);

export function getBuiltinLens(key: string | null | undefined): Lens | null {
  const parsed = lensKeySchema.safeParse(key);
  return parsed.success ? LENSES[parsed.data] : null;
}
