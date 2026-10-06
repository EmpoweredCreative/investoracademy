import { BOLD_CLOSE, BOLD_OPEN, stripBold } from "./html";

/** Sections we keep from an annual report, keyed the same for 10-K and 20-F. */
export const SECTION_KEYS = ["business", "riskFactors", "mdna", "marketRisk"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, { "10-K": string; "20-F": string }> = {
  business: { "10-K": "Item 1 · Business", "20-F": "Item 4 · Information on the Company" },
  riskFactors: { "10-K": "Item 1A · Risk Factors", "20-F": "Item 3.D · Risk Factors" },
  mdna: { "10-K": "Item 7 · MD&A", "20-F": "Item 5 · Operating and Financial Review" },
  marketRisk: { "10-K": "Item 7A · Market Risk", "20-F": "Item 11 · Market Risk" },
};

export type AnnualForm = "10-K" | "20-F";

interface Heading {
  id: string;
  start: number;
}

// "Item 1A. Risk Factors", "ITEM 7—Management's…", "Part I, Item 1. Business", "Item 1." (TOC)
const ITEM_LINE = /^(?:part\s+[iv]+\s*[,.\-–—:]?\s*)?item\s+(\d{1,2}[a-k]?)\s*(?:[.:\-–—]|$)/i;

function itemHeadings(text: string): Heading[] {
  const out: Heading[] = [];
  let pos = 0;
  for (const line of text.split("\n")) {
    const clean = stripBold(line).trim();
    if (clean.length <= 300) {
      const m = ITEM_LINE.exec(clean);
      if (m) out.push({ id: m[1].toUpperCase(), start: pos });
    }
    pos += line.length + 1;
  }
  return out;
}

/**
 * The body of one Item. Filings mention each heading several times (table of
 * contents, cross-references), so take the occurrence with the longest body.
 */
function extractItem(text: string, headings: Heading[], id: string): string | null {
  let best: string | null = null;
  headings.forEach((h, i) => {
    if (h.id !== id) return;
    const next = headings.slice(i + 1).find((n) => n.id !== id);
    const body = text.slice(h.start, next ? next.start : text.length);
    if (!best || body.length > best.length) best = body;
  });
  return best;
}

/** 20-F risk factors live in Item 3 under "D. Risk Factors". */
function extract20FRisk(item3: string | null): string | null {
  if (!item3) return null;
  const m = /^\s*(?:\u0001)?\s*(?:item\s*3\.?\s*)?D\.\s*Risk Factors\s*(?:\u0002)?\s*$/im.exec(item3);
  return m ? item3.slice(m.index) : null;
}

export interface RiskHeading {
  category: string | null;
  title: string;
}

/**
 * Risk-factor headings: lines that are entirely bold. Short bold lines without a
 * full stop are category labels ("Business and Operating Risks"); longer ones are risks.
 */
export function riskHeadings(rawSection: string): RiskHeading[] {
  const out: RiskHeading[] = [];
  let category: string | null = null;
  let bold = false;
  for (const line of rawSection.split("\n")) {
    let allBold = true;
    let any = false;
    for (const ch of line) {
      if (ch === BOLD_OPEN) bold = true;
      else if (ch === BOLD_CLOSE) bold = false;
      else if (ch.trim()) {
        any = true;
        if (!bold) allBold = false;
      }
    }
    if (!any || !allBold) continue;
    const text = stripBold(line).replace(/\s+/g, " ").trim();
    if (/^(?:item\s|d\.\s*risk factors|summary of risk factors|risk factors$)/i.test(text)) continue;
    if (text.length < 70 && !/[.?]$/.test(text)) {
      category = text;
      continue;
    }
    if (text.length > 600) continue;
    out.push({ category, title: text });
  }
  // Summary lists repeat the detailed headings; keep the first of each.
  const seen = new Set<string>();
  return out.filter((h) => {
    const k = h.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface ExtractedSections {
  sections: Partial<Record<SectionKey, string>>;
  riskHeadings: RiskHeading[];
}

const tidy = (s: string | null) => (s ? stripBold(s).replace(/\n{3,}/g, "\n\n").trim() : undefined);

/** Pull the key sections out of an annual report converted with htmlToText (bold markers intact). */
export function extractSections(text: string, form: AnnualForm): ExtractedSections {
  const headings = itemHeadings(text);
  const ids =
    form === "20-F"
      ? { business: "4", mdna: "5", marketRisk: "11" }
      : { business: "1", mdna: "7", marketRisk: "7A" };
  const risk = form === "20-F" ? extract20FRisk(extractItem(text, headings, "3")) : extractItem(text, headings, "1A");

  return {
    sections: {
      business: tidy(extractItem(text, headings, ids.business)),
      riskFactors: tidy(risk),
      mdna: tidy(extractItem(text, headings, ids.mdna)),
      marketRisk: tidy(extractItem(text, headings, ids.marketRisk)),
    },
    riskHeadings: risk ? riskHeadings(risk) : [],
  };
}
