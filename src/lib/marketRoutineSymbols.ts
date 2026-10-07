/**
 * Fixed lists of indices and sectors for the top-down market routine.
 * Volatility is derived from the VIX symbol.
 */

export type SymbolCategory = "INDICES" | "SECTORS";

export type RoutineSymbol = {
  symbol: string;
  name: string;
  category: SymbolCategory;
};

/** Indices from the top-down routine (Image 1) */
export const INDICES: RoutineSymbol[] = [
  { symbol: "SPY", name: "S&P", category: "INDICES" },
  { symbol: "RSP", name: "S&P Equal Weight", category: "INDICES" },
  { symbol: "DIA", name: "Dow Jones", category: "INDICES" },
  { symbol: "QQQ", name: "NASDAQ", category: "INDICES" },
  { symbol: "IWM", name: "Russell 2000", category: "INDICES" },
  { symbol: "UUP", name: "US Dollar", category: "INDICES" },
  { symbol: "USO", name: "Oil", category: "INDICES" },
  { symbol: "GLD", name: "Gold", category: "INDICES" },
  { symbol: "SLV", name: "Silver", category: "INDICES" },
  { symbol: "VIX", name: "VIX", category: "INDICES" },
];

/** Sectors from the top-down routine (Image 2) */
export const SECTORS: RoutineSymbol[] = [
  { symbol: "XLB", name: "Basic Materials", category: "SECTORS" },
  { symbol: "XLC", name: "Communications", category: "SECTORS" },
  { symbol: "XLE", name: "Energy", category: "SECTORS" },
  { symbol: "XLF", name: "Financial", category: "SECTORS" },
  { symbol: "XLI", name: "Industrials", category: "SECTORS" },
  { symbol: "XLK", name: "Technology", category: "SECTORS" },
  { symbol: "XLP", name: "Staples", category: "SECTORS" },
  { symbol: "XLU", name: "Utilities", category: "SECTORS" },
  { symbol: "XLV", name: "Healthcare", category: "SECTORS" },
  { symbol: "XLY", name: "Cyclicals", category: "SECTORS" },
  { symbol: "XLRE", name: "Real Estate", category: "SECTORS" },
];

export const ALL_ROUTINE_SYMBOLS = [...INDICES, ...SECTORS];

export const VIX_SYMBOL = "VIX";

export function getSymbolByName(name: string): RoutineSymbol | undefined {
  return ALL_ROUTINE_SYMBOLS.find((s) => s.name === name);
}

export function getSymbolBySymbol(symbol: string): RoutineSymbol | undefined {
  return ALL_ROUTINE_SYMBOLS.find((s) => s.symbol === symbol.toUpperCase());
}

/** Yahoo ticker for a routine symbol (VIX is an index, not an ETF). */
export function yahooSymbol(symbol: string): string {
  return symbol === VIX_SYMBOL ? "^VIX" : symbol;
}

/** Futures board for Step 1 — professionals start with the futures market. */
export const FUTURES: { symbol: string; label: string; name: string }[] = [
  { symbol: "ES=F", label: "/ES", name: "S&P 500" },
  { symbol: "NQ=F", label: "/NQ", name: "Nasdaq 100" },
  { symbol: "YM=F", label: "/YM", name: "Dow" },
  { symbol: "RTY=F", label: "/RTY", name: "Russell 2000" },
  { symbol: "DX-Y.NYB", label: "DXY", name: "US Dollar" },
  { symbol: "CL=F", label: "/CL", name: "Crude Oil" },
  { symbol: "GC=F", label: "/GC", name: "Gold" },
  { symbol: "SI=F", label: "/SI", name: "Silver" },
  { symbol: "^VIX", label: "VIX", name: "Volatility" },
];
