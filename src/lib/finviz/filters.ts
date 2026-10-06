/**
 * Finviz screener filters in plain English. Finviz uses fixed buckets (e.g.
 * "P/E under 15" is `fa_pe_u15`), so each filter offers its buckets as options.
 * A strategy stores the chosen option codes; at most one option per filter.
 */
export interface FilterOption {
  code: string;
  label: string;
}
export interface FilterDef {
  id: string;
  label: string;
  group: "Descriptive" | "Valuation" | "Growth" | "Profitability" | "Balance sheet" | "Ownership" | "Technical";
  hint?: string;
  options: FilterOption[];
}

const under = (prefix: string, values: number[], fmt: (v: number) => string) =>
  values.map((v) => ({ code: `${prefix}_u${v}`, label: `Under ${fmt(v)}` }));
const over = (prefix: string, values: number[], fmt: (v: number) => string) =>
  values.map((v) => ({ code: `${prefix}_o${v}`, label: `Over ${fmt(v)}` }));
const x = (v: number) => `${v}`;
const pct = (v: number) => `${v}%`;

export const FILTERS: FilterDef[] = [
  {
    id: "cap",
    label: "Market cap",
    group: "Descriptive",
    options: [
      { code: "cap_mega", label: "Mega ($200B+)" },
      { code: "cap_largeover", label: "Large and up ($10B+)" },
      { code: "cap_midover", label: "Mid and up ($2B+)" },
      { code: "cap_smallover", label: "Small and up ($300M+)" },
      { code: "cap_mid", label: "Mid only ($2–10B)" },
      { code: "cap_small", label: "Small only ($300M–2B)" },
    ],
  },
  {
    id: "sec",
    label: "Sector",
    group: "Descriptive",
    options: [
      { code: "sec_basicmaterials", label: "Basic materials" },
      { code: "sec_communicationservices", label: "Communication services" },
      { code: "sec_consumercyclical", label: "Consumer cyclical" },
      { code: "sec_consumerdefensive", label: "Consumer defensive" },
      { code: "sec_energy", label: "Energy" },
      { code: "sec_financial", label: "Financial" },
      { code: "sec_healthcare", label: "Healthcare" },
      { code: "sec_industrials", label: "Industrials" },
      { code: "sec_realestate", label: "Real estate" },
      { code: "sec_technology", label: "Technology" },
      { code: "sec_utilities", label: "Utilities" },
    ],
  },
  {
    id: "geo",
    label: "Country",
    group: "Descriptive",
    options: [
      { code: "geo_usa", label: "USA" },
      { code: "geo_notusa", label: "Outside USA" },
    ],
  },
  { id: "fa_pe", label: "P/E", group: "Valuation", options: [{ code: "fa_pe_profitable", label: "Profitable (P/E > 0)" }, ...under("fa_pe", [10, 15, 20, 25, 30, 40], x)] },
  { id: "fa_fpe", label: "Forward P/E", group: "Valuation", options: [{ code: "fa_fpe_profitable", label: "Profitable" }, ...under("fa_fpe", [10, 15, 20, 25, 30], x)] },
  { id: "fa_peg", label: "PEG", group: "Valuation", hint: "P/E divided by expected growth", options: under("fa_peg", [1, 2, 3], x) },
  { id: "fa_ps", label: "Price/Sales", group: "Valuation", options: under("fa_ps", [1, 2, 3, 5, 10], x) },
  { id: "fa_pb", label: "Price/Book", group: "Valuation", options: under("fa_pb", [1, 2, 3, 5, 10], x) },
  { id: "fa_pfcf", label: "Price/Free cash flow", group: "Valuation", options: under("fa_pfcf", [10, 15, 20, 25, 30, 50], x) },
  {
    id: "fa_div",
    label: "Dividend yield",
    group: "Valuation",
    options: [{ code: "fa_div_pos", label: "Pays a dividend" }, ...over("fa_div", [1, 2, 3, 4, 5], pct), { code: "fa_div_none", label: "No dividend" }],
  },
  { id: "fa_eps5years", label: "EPS growth, past 5 yrs", group: "Growth", options: [{ code: "fa_eps5years_pos", label: "Positive" }, ...over("fa_eps5years", [5, 10, 15, 20, 25], pct)] },
  { id: "fa_estltgrowth", label: "EPS growth, next 5 yrs (est.)", group: "Growth", options: [{ code: "fa_estltgrowth_pos", label: "Positive" }, ...over("fa_estltgrowth", [5, 10, 15, 20, 25], pct)] },
  { id: "fa_sales5years", label: "Sales growth, past 5 yrs", group: "Growth", options: [{ code: "fa_sales5years_pos", label: "Positive" }, ...over("fa_sales5years", [5, 10, 15, 20, 25], pct)] },
  { id: "fa_epsqoq", label: "EPS growth, qtr over qtr", group: "Growth", options: [{ code: "fa_epsqoq_pos", label: "Positive" }, ...over("fa_epsqoq", [10, 15, 20, 25, 30], pct)] },
  { id: "fa_salesqoq", label: "Sales growth, qtr over qtr", group: "Growth", options: [{ code: "fa_salesqoq_pos", label: "Positive" }, ...over("fa_salesqoq", [5, 10, 15, 20, 25], pct)] },
  { id: "fa_roe", label: "Return on equity", group: "Profitability", options: [{ code: "fa_roe_pos", label: "Positive" }, ...over("fa_roe", [10, 15, 20, 25, 30], pct)] },
  { id: "fa_roi", label: "Return on investment", group: "Profitability", options: [{ code: "fa_roi_pos", label: "Positive" }, ...over("fa_roi", [10, 15, 20, 25], pct)] },
  { id: "fa_grossmargin", label: "Gross margin", group: "Profitability", options: [{ code: "fa_grossmargin_pos", label: "Positive" }, ...over("fa_grossmargin", [20, 30, 40, 50, 60], pct)] },
  { id: "fa_opermargin", label: "Operating margin", group: "Profitability", options: [{ code: "fa_opermargin_pos", label: "Positive" }, ...over("fa_opermargin", [10, 15, 20, 25, 30], pct)] },
  { id: "fa_netmargin", label: "Net margin", group: "Profitability", options: [{ code: "fa_netmargin_pos", label: "Positive" }, ...over("fa_netmargin", [5, 10, 15, 20, 25], pct)] },
  { id: "fa_debteq", label: "Debt/Equity", group: "Balance sheet", options: under("fa_debteq", [0.1, 0.3, 0.5, 0.7, 1], x) },
  { id: "fa_curratio", label: "Current ratio", group: "Balance sheet", options: over("fa_curratio", [1, 1.5, 2, 3], x) },
  {
    id: "sh_insidertrans",
    label: "Insider transactions (6 mo.)",
    group: "Ownership",
    options: [
      { code: "sh_insidertrans_pos", label: "Net buying" },
      { code: "sh_insidertrans_verypos", label: "Heavy buying (>20%)" },
      { code: "sh_insidertrans_neg", label: "Net selling" },
    ],
  },
  { id: "sh_insiderown", label: "Insider ownership", group: "Ownership", options: over("sh_insiderown", [10, 20, 30, 50], pct) },
  { id: "sh_instown", label: "Institutional ownership", group: "Ownership", options: [...under("sh_instown", [30, 50, 70], pct), ...over("sh_instown", [50, 70], pct)] },
  {
    id: "sh_avgvol",
    label: "Average volume",
    group: "Ownership",
    options: [
      { code: "sh_avgvol_o100", label: "Over 100K" },
      { code: "sh_avgvol_o500", label: "Over 500K" },
      { code: "sh_avgvol_o1000", label: "Over 1M" },
    ],
  },
  {
    id: "ta_sma50",
    label: "Price vs 50-day average",
    group: "Technical",
    options: [
      { code: "ta_sma50_pa", label: "Price above" },
      { code: "ta_sma50_pb", label: "Price below" },
    ],
  },
  {
    id: "ta_sma200",
    label: "Price vs 200-day average",
    group: "Technical",
    options: [
      { code: "ta_sma200_pa", label: "Price above" },
      { code: "ta_sma200_pb", label: "Price below" },
      { code: "ta_sma200_sb50", label: "50-day above 200-day" },
    ],
  },
];

const BY_CODE = new Map(FILTERS.flatMap((f) => f.options.map((o) => [o.code, { filter: f, option: o }] as const)));

export function describeFilter(code: string): { filter: string; option: string } | null {
  const hit = BY_CODE.get(code);
  return hit ? { filter: hit.filter.label, option: hit.option.label } : null;
}

export function filterIdFor(code: string): string | null {
  return BY_CODE.get(code)?.filter.id ?? null;
}

/** Keep only known codes, one per filter (later choices win). */
export function normalizeFilters(codes: string[]): string[] {
  const byFilter = new Map<string, string>();
  for (const c of codes) {
    const id = filterIdFor(c);
    if (id) byFilter.set(id, c);
  }
  return [...byFilter.values()];
}

export const FILTER_GROUPS = ["Descriptive", "Valuation", "Growth", "Profitability", "Balance sheet", "Ownership", "Technical"] as const;
