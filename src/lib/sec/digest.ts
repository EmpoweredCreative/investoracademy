import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * One structured summary per annual report, generated once and cached forever
 * (filings never change). Reports and the Analyst build on these instead of
 * re-reading hundreds of pages each time.
 */
export const DIGEST_MODEL = "claude-sonnet-5-5";

export const MOAT_TYPES = [
  "brand",
  "switching_costs",
  "network_effects",
  "cost_advantage",
  "efficient_scale",
  "intangibles",
] as const;

export const filingDigestSchema = z.object({
  businessSummary: z.string().describe("What the company does and how it makes money, 3-5 plain-English sentences."),
  segments: z
    .array(z.object({ name: z.string(), description: z.string(), share: z.string().nullable().describe("Share of revenue/profit if stated, e.g. '62% of revenue'") }))
    .describe("Reportable segments or main business lines."),
  competitiveAdvantages: z
    .array(z.object({ claim: z.string(), evidence: z.string().describe("Short supporting quote or fact from the filing (under 40 words).") }))
    .describe("Advantages the company has or claims, with evidence."),
  moatSignals: z
    .array(z.object({ type: z.enum(MOAT_TYPES), evidence: z.string() }))
    .describe("Evidence of durable competitive advantage, by moat type. Empty if none."),
  topRisks: z
    .array(
      z.object({
        title: z.string(),
        whyItMatters: z.string().describe("One or two sentences, specific to this company."),
        severity: z.enum(["high", "medium", "low"]),
      })
    )
    .describe("The most material company-specific risks (not boilerplate), most severe first, at most 8."),
  capitalAllocation: z.string().describe("How cash is used: capex, buybacks, dividends, M&A, debt; anything notable."),
  keyMetrics: z.array(z.object({ name: z.string(), value: z.string() })).describe("Operating KPIs management highlights (e.g. renewal rate, parcel volume)."),
  notableChanges: z.array(z.string()).describe("What's new or different this year: strategy, segments, acquisitions, leadership, guidance."),
});
export type FilingDigest = z.infer<typeof filingDigestSchema>;

const CAPS = { business: 60_000, riskFactors: 70_000, mdna: 45_000 } as const;

const clip = (s: string | undefined, n: number) => (!s ? "(not found in this filing)" : s.length > n ? `${s.slice(0, n)}\n[…truncated]` : s);

export async function digestFiling(input: {
  companyName: string;
  symbol: string;
  form: string;
  fiscalYear: number;
  sections: Partial<Record<"business" | "riskFactors" | "mdna", string>>;
}): Promise<FilingDigest> {
  const client = new Anthropic();
  const { sections } = input;
  const response = await client.messages.parse({
    model: DIGEST_MODEL,
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(filingDigestSchema) },
    system:
      "You are an equity research analyst summarising one annual report for an investor. Be specific and factual: use only what the filing says, prefer concrete numbers, and skip legal boilerplate that applies to every company.",
    messages: [
      {
        role: "user",
        content: `${input.companyName} (${input.symbol}) — ${input.form} for fiscal ${input.fiscalYear}.

<business>
${clip(sections.business, CAPS.business)}
</business>

<risk_factors>
${clip(sections.riskFactors, CAPS.riskFactors)}
</risk_factors>

<mdna>
${clip(sections.mdna, CAPS.mdna)}
</mdna>

Summarise this filing.`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Couldn't summarise the ${input.form} for fiscal ${input.fiscalYear}.`);
  }
  return response.parsed_output;
}
