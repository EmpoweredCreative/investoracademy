/**
 * Map app symbols (Yahoo tickers and routine symbols) to TradingView symbols
 * for the free embed widget. Free embeds can't show CME futures, DXY or the
 * spot VIX, so those use the closest symbols the widget allows.
 */

interface TvSymbol {
  /** Symbol the embed can display. */
  symbol: string;
  /** The real instrument, for opening on tradingview.com (where your own subscription applies). */
  full?: string;
  /** Explains the substitute when it isn't the exact instrument. */
  note?: string;
}

const CFD_NOTE =
  "TradingView doesn't license CME data to embedded charts (even with a subscription), so this shows a CFD that tracks the futures. Open in TradingView for the real contract.";

const MAP: Record<string, TvSymbol> = {
  // Futures board
  "ES=F": { full: "CME_MINI:ES1!", symbol: "FOREXCOM:SPXUSD", note: CFD_NOTE },
  "NQ=F": { full: "CME_MINI:NQ1!", symbol: "FOREXCOM:NSXUSD", note: CFD_NOTE },
  "YM=F": { full: "CBOT_MINI:YM1!", symbol: "FOREXCOM:DJI", note: CFD_NOTE },
  "RTY=F": { full: "CME_MINI:RTY1!", symbol: "FOREXCOM:US2000", note: CFD_NOTE },
  "DX-Y.NYB": { full: "TVC:DXY", symbol: "CAPITALCOM:DXY", note: "Embeds can't show the DXY itself, so this is a CFD that tracks it. Open in TradingView for the real index." },
  "CL=F": { full: "NYMEX:CL1!", symbol: "TVC:USOIL", note: CFD_NOTE },
  "GC=F": { full: "COMEX:GC1!", symbol: "OANDA:XAUUSD", note: "Shown as spot gold (XAU/USD) — embeds can't show COMEX futures. Open in TradingView for /GC." },
  "SI=F": { full: "COMEX:SI1!", symbol: "OANDA:XAGUSD", note: "Shown as spot silver (XAG/USD) — embeds can't show COMEX futures. Open in TradingView for /SI." },
  "^VIX": { full: "CBOE:VIX", symbol: "PEPPERSTONE:VIX", note: "Embeds can't show the spot VIX, so this is a CFD that tracks VIX futures and can differ. Open in TradingView for the real VIX." },
  VIX: { full: "CBOE:VIX", symbol: "PEPPERSTONE:VIX", note: "Embeds can't show the spot VIX, so this is a CFD that tracks VIX futures and can differ. Open in TradingView for the real VIX." },
  // Index ETFs
  SPY: { symbol: "AMEX:SPY" },
  RSP: { symbol: "AMEX:RSP" },
  DIA: { symbol: "AMEX:DIA" },
  QQQ: { symbol: "NASDAQ:QQQ" },
  IWM: { symbol: "AMEX:IWM" },
  UUP: { symbol: "AMEX:UUP" },
  USO: { symbol: "AMEX:USO" },
  GLD: { symbol: "AMEX:GLD" },
  SLV: { symbol: "AMEX:SLV" },
};

export function tradingViewSymbol(symbol: string): TvSymbol {
  const s = symbol.toUpperCase();
  if (MAP[s]) return MAP[s];
  // Select Sector SPDRs trade on NYSE Arca (AMEX on TradingView).
  if (/^XL[A-Z]{1,2}$/.test(s)) return { symbol: `AMEX:${s}` };
  return { symbol: s };
}

export const tradingViewUrl = (tvSymbol: string) =>
  `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
