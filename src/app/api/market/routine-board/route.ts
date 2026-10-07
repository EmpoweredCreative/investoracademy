import { NextResponse } from "next/server";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { getLiveQuotes } from "@/lib/marketdata/liveQuotes";
import { getTechnicals } from "@/lib/marketdata/technicals";
import { ALL_ROUTINE_SYMBOLS, FUTURES, yahooSymbol } from "@/lib/marketRoutineSymbols";

/** Step 1 data: futures quotes plus technicals for every routine index and sector. */
export async function GET() {
  try {
    await requireAuth();
    const [quotes, technicals] = await Promise.all([
      getLiveQuotes(FUTURES.map((f) => f.symbol)),
      getTechnicals(ALL_ROUTINE_SYMBOLS.map((s) => yahooSymbol(s.symbol))),
    ]);
    return NextResponse.json({
      futures: FUTURES.map((f) => ({ ...f, quote: quotes[f.symbol.toUpperCase()] ?? null })),
      symbols: ALL_ROUTINE_SYMBOLS.map((s) => ({ ...s, technicals: technicals[yahooSymbol(s.symbol)] ?? null })),
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
