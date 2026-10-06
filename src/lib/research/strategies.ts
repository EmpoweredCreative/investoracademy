import { z } from "zod";
import { prisma } from "@/lib/db";
import { criteriaProfileSchema, normalizeProfile } from "@/lib/fundamentals/criteria";
import { getUserCriteria } from "@/lib/fundamentals/research";
import { getBuiltinLens, LENSES, type Lens } from "./lenses";

/** A user-defined strategy, as stored (ResearchStrategy) and edited in the Screener. */
export const strategyInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  baseLens: z.enum(["buffett", "lynch", "druckenmiller"]).nullable().optional(),
  finvizFilters: z.array(z.string().regex(/^[a-z0-9_.]+$/i).max(40)).max(40),
  criteria: criteriaProfileSchema,
  questions: z.array(z.string().trim().min(3).max(300)).max(12),
});
export type StrategyInput = z.infer<typeof strategyInputSchema>;

export const strategyLensKey = (id: string) => `strategy:${id}`;

const GENERIC_QUESTIONS = [
  "What does the company do, and how does it make money?",
  "What is its competitive advantage?",
  "Does it have a moat? What kind, and how durable is it?",
  "What is its greatest risk?",
];

/**
 * Resolve a lens key to the full lens: built-in (buffett/lynch/druckenmiller),
 * a saved strategy ("strategy:<id>", owned by the user), or null/"none" for the
 * user's own criteria with the core questions.
 */
export async function resolveLens(userId: string, key: string | null | undefined): Promise<Lens> {
  const builtin = getBuiltinLens(key);
  if (builtin) return builtin;

  if (key?.startsWith("strategy:")) {
    const s = await prisma.researchStrategy.findFirst({ where: { id: key.slice(9), userId } });
    if (s) {
      const base = getBuiltinLens(s.baseLens);
      const own = (s.questions as string[]) ?? [];
      return {
        key,
        name: s.name,
        inspiredBy: base ? base.inspiredBy : "your own rules",
        tagline: base ? `Based on the ${base.name} lens` : "Your strategy",
        philosophy: base?.philosophy ?? "Your own screening filters, scoring thresholds and research questions.",
        example: `Research a stock with ${s.name}`,
        criteria: normalizeProfile(s.criteria),
        finvizFilters: (s.finvizFilters as string[]) ?? [],
        questions: [...GENERIC_QUESTIONS, ...own],
        baseLens: s.baseLens,
        prompt: `${base ? `${base.prompt}\n\n` : ""}Lens: the user's own strategy "${s.name}". Judge the company against their criteria, and answer each of their own research questions explicitly:\n${own.map((q) => `- ${q}`).join("\n") || "- (none)"}`,
      };
    }
  }

  return {
    key: "none",
    name: "General",
    inspiredBy: "your own criteria",
    tagline: "Balanced fundamental analysis",
    philosophy: "A balanced fundamental review scored against your own research criteria.",
    example: "Research COST",
    criteria: await getUserCriteria(userId),
    finvizFilters: [],
    questions: GENERIC_QUESTIONS,
    prompt: "Lens: balanced fundamental analysis, scored against the user's own research criteria. Weigh business quality, durability, financial strength and valuation evenly.",
  };
}

export const BUILTIN_LENS_LIST = Object.values(LENSES);
