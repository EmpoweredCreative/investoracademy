import type { ChecklistItem } from "./StepCard";

/** Checklists from the Mentor Club Top Down Market Routine. */

export const CHART_CHECKLIST: ChecklistItem[] = [
  { label: "Start with the S&P, then work through the Nasdaq, Dow and Russell 2000" },
  { label: "Price & volume" },
  { label: "Trend direction and price momentum" },
  {
    label: "Moving averages",
    children: [
      { label: "9 EMA — short-term buy/sell signals, average swing cycle" },
      { label: "20 SMA — monthly" },
      { label: "50 SMA — quarterly" },
      { label: "100 SMA — two quarters" },
      { label: "200 SMA — yearly" },
    ],
  },
  { label: "Market volatility — historic and implied" },
  { label: "Pivot points, price/chart patterns, candlestick patterns" },
  { label: "Multiple time frames — daily, weekly, monthly" },
  { label: "Intermarket analysis — dollar, oil, gold, silver, yields" },
  { label: "Sectors" },
];

export const PULSE_CHECKLIST: ChecklistItem[] = [
  { label: "Spend 15–20 minutes on your favorite sites" },
  { label: "Check the economic calendar for reports and policy decisions" },
  {
    label: "Most headlines are noise based on post hoc commentary",
    children: [{ label: "Watch for pending news, reports, and major economic policy or company news" }],
  },
  { label: "Use any time-saving tools or services you find valuable" },
  { label: "Don't forget to watch the Mentor Club" },
];

export const BUSINESS_CHECKLIST: ChecklistItem[] = [
  { label: "Identify overall portfolio profits/losses" },
  {
    label: "Triage each position — sickest patients first",
    children: [
      {
        label: "Stop any bleeding with your risk management tools",
        children: [
          { label: "Position size" },
          { label: "Stop loss" },
          { label: "Hedges and adjustments — protective puts, covered calls, collars" },
        ],
      },
    ],
  },
  {
    label: "Portfolio risk management",
    children: [
      { label: "Asset allocation" },
      { label: "Position size" },
      { label: "Diversification" },
      { label: "Beta-weighted portfolio delta hedge" },
    ],
  },
];

export const OPPORTUNITIES_CHECKLIST: ChecklistItem[] = [
  { label: "Check your watchlists" },
  { label: "Run your favorite scans — fundamental and technical" },
  { label: "Filter your results" },
  {
    label: "Analyze all four pillars",
    children: [
      { label: "Fundamentals — earnings date, balance sheet, dividends" },
      { label: "Technical — trend, momentum, support/resistance, moving averages, patterns" },
      { label: "Cash flow — options volume & liquidity, implied volatility, strategy fit" },
      { label: "Risk management — position size, stop loss, adjustments, hedges" },
    ],
  },
  { label: "Qualify candidates, build a watchlist, be patient, take action" },
];

export const JOURNAL_CHECKLIST: ChecklistItem[] = [
  { label: "Update your trading journal" },
  { label: "Measure your performance and track record" },
  { label: "Take good notes" },
  { label: "Periodically review, identify problems, take corrective action" },
  { label: "Rinse and repeat" },
];

export const BLUEPRINT_CHECKLIST: ChecklistItem[] = [
  {
    label: "Core investments — long-term asset acquisition",
    children: [
      { label: "Dividend-paying stocks yielding 4–5%+ annually" },
      {
        label: "Cash flow strategies",
        children: [
          { label: "Cash-secured puts" },
          { label: "Collect quarterly dividends" },
          { label: "Sell OTM covered calls" },
        ],
      },
      {
        label: "Wealth Wheel / cash flow cycle",
        children: [
          { label: "Sell puts to acquire stock / take assignment" },
          { label: "Collect dividends" },
          { label: "Sell covered calls — allow assignment, or roll up and out on a breakout" },
          { label: "Rinse and repeat" },
        ],
      },
    ],
  },
  { label: "Allocate capital to what is sustainable and working for you" },
  { label: "Review your preferred core and non-core strategies" },
];

export const FAVORITE_SITES = [
  { label: "Finviz", href: "https://finviz.com" },
  { label: "Forex Factory", href: "https://www.forexfactory.com/calendar" },
  { label: "Yahoo Finance", href: "https://finance.yahoo.com" },
  { label: "Briefing.com", href: "https://www.briefing.com" },
  { label: "TradingView", href: "https://www.tradingview.com" },
  { label: "StockCharts", href: "https://stockcharts.com" },
];
