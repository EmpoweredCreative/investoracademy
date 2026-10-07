/**
 * Subset of the Schwab Trader API response shapes we consume.
 * Fields are optional where Schwab omits them for some account/instrument types.
 */

export interface SchwabAccountNumber {
  accountNumber: string;
  hashValue: string;
}

export interface SchwabInstrument {
  assetType: "EQUITY" | "OPTION" | "COLLECTIVE_INVESTMENT" | "CASH_EQUIVALENT" | "FIXED_INCOME" | "MUTUAL_FUND" | string;
  symbol: string;
  cusip?: string;
  description?: string;
  underlyingSymbol?: string;
  putCall?: "PUT" | "CALL" | "UNKNOWN";
  strikePrice?: number;
  expirationDate?: string;
  type?: string;
}

export interface SchwabPosition {
  longQuantity?: number;
  shortQuantity?: number;
  averagePrice?: number;
  averageLongPrice?: number;
  averageShortPrice?: number;
  marketValue?: number;
  currentDayProfitLoss?: number;
  currentDayProfitLossPercentage?: number;
  /** Margin the broker holds for this position (buying power effect). */
  maintenanceRequirement?: number;
  instrument: SchwabInstrument;
}

export interface SchwabBalances {
  cashBalance?: number;
  liquidationValue?: number;
  buyingPower?: number;
  availableFunds?: number;
  moneyMarketFund?: number;
  totalCash?: number;
  cashAvailableForTrading?: number;
}

export interface SchwabAccount {
  securitiesAccount: {
    type: string;
    accountNumber: string;
    positions?: SchwabPosition[];
    currentBalances?: SchwabBalances;
    initialBalances?: SchwabBalances;
  };
}

export interface SchwabTransferItem {
  instrument?: SchwabInstrument;
  amount?: number;
  cost?: number;
  price?: number;
  feeType?: string;
  positionEffect?: "OPENING" | "CLOSING" | "AUTOMATIC" | "UNKNOWN";
}

export interface SchwabTransaction {
  activityId: number;
  time: string;
  tradeDate?: string;
  type: string;
  status?: string;
  description?: string;
  netAmount?: number;
  transferItems?: SchwabTransferItem[];
}
