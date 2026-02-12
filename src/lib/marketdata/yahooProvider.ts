import YahooFinance from "yahoo-finance2";
import type {
  QuoteSnapshot,
  MarketDataProvider,
  OptionGreekSnapshot,
  PortfolioRiskSnapshot,
} from "./provider";

/**
 * Yahoo Finance implementation of MarketDataProvider.
 * Used for portfolio snapshot current prices (wealth wheel planning, not execution).
 * Option chain and portfolio risk remain Phase II (e.g. Schwab).
 */
export class YahooMarketDataProvider implements MarketDataProvider {
  private client = new YahooFinance();

  async getQuote(symbol: string): Promise<QuoteSnapshot> {
    const q = await this.client.quote(symbol);
    const last = typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : 0;
    const bid = typeof q.bid === "number" ? q.bid : 0;
    const ask = typeof q.ask === "number" ? q.ask : 0;
    const volume = typeof q.regularMarketVolume === "number" ? q.regularMarketVolume : 0;
    const timestamp = q.regularMarketTime
      ? new Date((q.regularMarketTime as number) * 1000)
      : new Date();
    return {
      symbol: q.symbol ?? symbol,
      last,
      bid,
      ask,
      volume,
      timestamp,
    };
  }

  async getOptionChain(
    _symbol: string,
    _expiration?: Date
  ): Promise<OptionGreekSnapshot[]> {
    throw new Error(
      "Option chain requires Phase II (e.g. Schwab). Use Yahoo for stock quotes only."
    );
  }

  async getPortfolioRisk(_accountId: string): Promise<PortfolioRiskSnapshot> {
    throw new Error(
      "Portfolio risk requires Phase II (e.g. Schwab). Use Yahoo for stock quotes only."
    );
  }
}

export const yahooMarketDataProvider = new YahooMarketDataProvider();
