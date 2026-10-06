import type { RiskHeading } from "./sections";

/**
 * Compare risk-factor headings between two annual reports. Companies tweak wording
 * every year, so headings are matched by word overlap rather than exact text.
 */
export interface RiskDiff {
  added: RiskHeading[];
  removed: RiskHeading[];
  /** Same risk, wording changed meaningfully. */
  reworded: { from: string; to: string; similarity: number }[];
  unchangedCount: number;
}

const STOP = new Set(
  "a an and are as at be been by can could for from has have if in into is it its may might of on or our such that the their these this to we which will with would adversely affect affected affects business results operations financial condition".split(
    " "
  )
);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map((w) => w.replace(/(ies|es|s|ing|ed)$/, ""))
  );
}

export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

const MATCH = 0.45;
const SAME = 0.85;

/** What changed from `previous` (older filing) to `current` (newer filing). */
export function diffRiskHeadings(previous: RiskHeading[], current: RiskHeading[]): RiskDiff {
  const pairs: { i: number; j: number; s: number }[] = [];
  previous.forEach((p, i) =>
    current.forEach((c, j) => {
      const s = similarity(p.title, c.title);
      if (s >= MATCH) pairs.push({ i, j, s });
    })
  );
  // Greedy best-first matching.
  pairs.sort((a, b) => b.s - a.s);
  const usedPrev = new Set<number>();
  const usedCur = new Set<number>();
  const reworded: RiskDiff["reworded"] = [];
  let unchangedCount = 0;
  for (const { i, j, s } of pairs) {
    if (usedPrev.has(i) || usedCur.has(j)) continue;
    usedPrev.add(i);
    usedCur.add(j);
    if (s >= SAME) unchangedCount++;
    else reworded.push({ from: previous[i].title, to: current[j].title, similarity: Math.round(s * 100) / 100 });
  }
  return {
    added: current.filter((_, j) => !usedCur.has(j)),
    removed: previous.filter((_, i) => !usedPrev.has(i)),
    reworded,
    unchangedCount,
  };
}
