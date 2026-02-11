/**
 * Phase II: Market Data Provider Interface
 *
 * This will be implemented when Schwab API integration is added.
 * For now, these are placeholder types and interfaces.
 */

export interface QuoteSnapshot {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: Date;
}

export interface OptionGreekSnapshot {
  symbol: string;
  strike: number;
  expiration: Date;
  callPut: "CALL" | "PUT";
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  impliedVolatility: number;
  timestamp: Date;
}

export interface PortfolioRiskSnapshot {
  accountId: string;
  totalDelta: number;
  totalGamma: number;
  totalTheta: number;
  totalVega: number;
  betaWeightedDelta: number;
  maxLoss: number;
  timestamp: Date;
}

export interface MarketDataProvider {
  getQuote(symbol: string): Promise<QuoteSnapshot>;
  getOptionChain(
    symbol: string,
    expiration?: Date
  ): Promise<OptionGreekSnapshot[]>;
  getPortfolioRisk(accountId: string): Promise<PortfolioRiskSnapshot>;
}

/**
 * Stub implementation that throws errors indicating Phase II is needed.
 */
export class StubMarketDataProvider implements MarketDataProvider {
  async getQuote(_symbol: string): Promise<QuoteSnapshot> {
    throw new Error(
      "Phase II: Connect Schwab to enable live pricing. Market data not yet available."
    );
  }

  async getOptionChain(
    _symbol: string,
    _expiration?: Date
  ): Promise<OptionGreekSnapshot[]> {
    throw new Error(
      "Phase II: Connect Schwab to enable option chain data."
    );
  }

  async getPortfolioRisk(_accountId: string): Promise<PortfolioRiskSnapshot> {
    throw new Error(
      "Phase II: Connect Schwab to enable portfolio risk metrics."
    );
  }
}
