"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { ArrowLeft, PlusCircle, X, Info, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────
interface ResearchIdea {
  id: string;
  strategyType: string;
  dte: number | null;
  atr: string | null;
  netCredit: string | null;
  bpe: string | null;
  notes: string | null;
  underlying: { symbol: string };
  createdAt: string;
  price: string | null;
  month: string | null;
  shortStrike: string | null;
  shortDelta: string | null;
  longStrike: string | null;
  shortCallStrike: string | null;
  shortCallDelta: string | null;
  longCallStrike: string | null;
  shortPutStrike: string | null;
  shortPutDelta: string | null;
  longPutStrike: string | null;
  earningsDate: string | null;
  expectedGap: string | null;
  expiration: string | null;
  spreadSubType: string | null;
  longStrikeExp: string | null;
  longStrikeDebit: string | null;
  shortStrikeExp: string | null;
  shortStrikeCredit: string | null;
  wheelCategoryOverride: string | null;
}

// ─── Strategy Config ────────────────────────────────────────
const STRATEGY_LABELS: Record<string, string> = {
  COVERED_CALL: "Covered Call",
  SHORT_PUT: "Short Put",
  BULL_PUT_SPREAD: "Bull Put Spread",
  BEAR_CALL_SPREAD: "Bear Call Spread",
  IRON_CONDOR: "Iron Condor",
  SHORT_STRANGLE: "Short Strangle",
  TIME_SPREAD: "Time Spread",
};

const STRATEGY_OPTIONS = Object.entries(STRATEGY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const TIME_SPREAD_SUBTYPES = [
  { value: "Diag Call Clnd Spr", label: "Diagonal Call Calendar Spread" },
  { value: "Diag Put Clnd Spr", label: "Diagonal Put Calendar Spread" },
  { value: "Horiz Call Clnd Spr", label: "Horizontal Call Calendar Spread" },
  { value: "Horiz Put Clnd Spr", label: "Horizontal Put Calendar Spread" },
];

// ─── Info Tooltips ──────────────────────────────────────────
const FIELD_TOOLTIPS: Record<string, Record<string, string>> = {
  COVERED_CALL: {
    price: "Current stock price. For covered calls, typically look for stocks under $100 per share.",
    month: "Expiration month for the call option being sold.",
    dte: "Days to expiration. For best time decay, sell front month expirations (1-2 months).",
    shortStrike: "The call strike you are selling. Should be 1-2 strikes OTM (out-of-the-money).",
    shortDelta: "Delta of the call sold. Measures directional exposure per contract.",
    netCredit: "Per-share credit received from selling the call option.",
    notes: "Any additional notes, setup conditions, or thesis for this idea.",
  },
  SHORT_PUT: {
    price: "Current stock price of the underlying.",
    atr: "Average True Range — measures the stock's average daily price movement.",
    month: "Expiration month for the put option being sold.",
    dte: "Days to expiration. Sell the put 1-3 months out; weeklies are available.",
    shortStrike: "Strike price where you sell the put. Choose delta .05-.25 range.",
    shortDelta: "Delta of the put sold. Sell between .05 ~ .25 (exception: higher if willing to take assignment).",
    netCredit: "Net credit received per contract for selling the put.",
    bpe: "Buying Power Effect — margin or capital required to hold this position.",
    notes: "Any additional notes, setup conditions, or thesis for this idea.",
  },
  BULL_PUT_SPREAD: {
    price: "Current stock price of the underlying.",
    atr: "Average True Range — measures the stock's average daily price movement.",
    month: "Expiration month. Back testing shows 4-6 weeks is optimal.",
    dte: "Days to expiration. Sell less than 3 months of time.",
    shortStrike: "The put strike you are selling. Sell delta .25 or lower, below support.",
    shortDelta: "Delta of the short put. Lower deltas = higher probability, less ROI.",
    longStrike: "The put strike you are buying (protection). Buy the next strike lower; consider widening if <5 point spreads.",
    netCredit: "Net credit received for the spread.",
    bpe: "Buying Power Effect — width of spread minus credit received.",
    notes: "Any additional notes, setup conditions, or thesis for this idea.",
  },
  BEAR_CALL_SPREAD: {
    price: "Current stock price of the underlying.",
    atr: "Average True Range — measures the stock's average daily price movement.",
    month: "Expiration month. Back testing shows 4-6 weeks is optimal.",
    dte: "Days to expiration. Sell less than 3 months of time.",
    shortStrike: "The call strike you are selling. Sell delta .25 or lower, above resistance.",
    shortDelta: "Delta of the short call. Lower deltas = higher probability, less ROI.",
    longStrike: "The call strike you are buying (protection). Buy the next strike higher; consider widening if <5 point spreads.",
    netCredit: "Net credit received for the spread.",
    bpe: "Buying Power Effect — width of spread minus credit received.",
    notes: "Any additional notes, setup conditions, or thesis for this idea.",
  },
  IRON_CONDOR: {
    price: "Current stock price of the underlying.",
    atr: "Average True Range — measures the stock's average daily price movement.",
    month: "Expiration month. Sell less than 2 months; front month or weekly is best.",
    dte: "Days to expiration. 4-6 weeks is optimal for theta decay + range.",
    shortCallStrike: "Short call strike (bear call side). Sell delta .15 or lower, above resistance.",
    shortCallDelta: "Delta of the short call leg.",
    longCallStrike: "Long call strike (protection). Buy next strike higher; widen if <5 pts.",
    shortPutStrike: "Short put strike (bull put side). Sell delta .15 or lower, below support.",
    shortPutDelta: "Delta of the short put leg.",
    longPutStrike: "Long put strike (protection). Buy next strike lower; widen if <5 pts.",
    netCredit: "Total net credit received for the Iron Condor.",
    bpe: "Buying Power Effect — widest spread width minus credit received.",
    notes: "Any additional notes, setup conditions, or thesis for this idea.",
  },
  SHORT_STRANGLE: {
    price: "Current stock price of the underlying.",
    earningsDate: "The date of the earnings announcement.",
    atr: "Average True Range — measures the stock's average daily price movement.",
    expectedGap: "Expected price gap — from ATM straddle, MMM, or avg gap over last 4 earnings.",
    expiration: "Option expiration. Earnings trade: 1 week to 1 month. Normal theta: 1-3 months.",
    dte: "Days to expiration.",
    shortCallStrike: "Short call strike. Use delta under .20; sell at twice the expected move.",
    shortCallDelta: "Delta of the short call leg.",
    shortPutStrike: "Short put strike. Use delta under .20; sell at twice the expected move.",
    shortPutDelta: "Delta of the short put leg.",
    netCredit: "Total net credit received for the strangle.",
    bpe: "Buying Power Effect — margin required (similar to naked put).",
    notes: "Any additional notes, setup conditions, or thesis for this idea.",
  },
  TIME_SPREAD: {
    spreadSubType: "Type of calendar spread: Diagonal or Horizontal, Call or Put.",
    price: "Current stock price of the underlying.",
    longStrike: "Strike price for the long (further out) option.",
    longStrikeExp: "Expiration date/month for the long option.",
    longStrikeDebit: "Debit paid for the long option.",
    shortStrike: "Strike price for the short (near term) option. For horizontal spreads, must match long strike.",
    shortStrikeExp: "Expiration date/month for the short option.",
    shortStrikeCredit: "Credit received for the short option.",
    notes: "Any additional notes, setup conditions, or thesis for this idea.",
  },
};

// ─── Trade Rules ────────────────────────────────────────────
interface RuleItem {
  label: string;
  items: string[];
}

const TRADE_RULES: Record<string, RuleItem[]> = {
  COVERED_CALL: [
    {
      label: "① Theory",
      items: [
        "A covered call is a combination strategy: buy stock in 100-share increments, then sell a call option for each 100 shares.",
        "Used to produce monthly cash flow. Great for passive income in traditional retirement accounts.",
      ],
    },
    { label: "② Technical Bias", items: ["0 to a +2 Bullish Bias"] },
    { label: "③ Strategy Type", items: ["Delta and Theta"] },
    {
      label: "④ Delta Rule",
      items: [
        "Two-leg trade",
        "Long Stock: Buy a stock typically under $100. For stocks above $100 there are better cash flow methods. Stock must be neutral to bullish.",
        "Sell a call option that is 1-2 strikes OTM.",
      ],
    },
    { label: "⑤ Theta Rule", items: ["Sell 1-2 months of time. For best time decay sell front month expirations."] },
    { label: "⑥ Vega Rule", items: ["Decreasing volatility aids this trade. Sell when volatility is expected to fall."] },
    {
      label: "⑦ Position Size",
      items: ["Position size according to personal rules for position or investment trades. Typically 1%-10% of portfolio allocation."],
    },
    {
      label: "⑧ Stop Loss",
      items: [
        "Breakeven: Place stop at your breakeven (stock price minus credit received). Sell stock and buy back option at reduced value.",
        "Investors: Place stop under a major level of support — typically 1 ATR under the weekly support level.",
      ],
    },
    {
      label: "⑨ Target",
      items: ["Expiration.", "80% net liquidation value — buy back option for 20% of original value and sell again."],
    },
  ],
  SHORT_PUT: [
    {
      label: "① Theory",
      items: [
        "Selling puts is a bullish cash flow strategy. You benefit as time passes, IV falls, and stock goes up.",
        "Use when: stock has strong fundamentals, stock has gapped down (advanced), stock has high IV, stock is severely oversold, or you think it's bullish.",
      ],
    },
    { label: "② Technical Bias", items: ["0 to a +2 Bullish Bias"] },
    { label: "③ Strategy Type", items: ["Theta"] },
    { label: "④ Delta", items: ["Sell put at delta .05 ~ .25 (exception: higher delta if willing to take assignment at the strike)."] },
    { label: "⑤ Theta", items: ["Sell 1-3 months out in expiration time. Weeklies are available."] },
    { label: "⑥ Vega", items: ["Decreasing volatility aids this trade. Sell when volatility is expected to fall."] },
    { label: "⑦ Position Size", items: ["According to personal risk level."] },
    { label: "⑧ ROI Target", items: ["8-15% of margin used."] },
    {
      label: "⑨ Stop Loss",
      items: [
        "Exit if delta ever exceeds .40.",
        "Exit if stock gets within ½ ATR of strike sold.",
        "Exit if stock ever breaks resistance levels.",
      ],
    },
    { label: "⑩ Target", items: ["Expiration.", "75% net liquidation value (credit received)."] },
  ],
  BULL_PUT_SPREAD: [
    {
      label: "① Philosophy",
      items: [
        "Selling a put + buying a lower put in the same expiration = bull put vertical spread.",
        "Bullish cash-flow strategy, bearish on IV. Spreads diminish directional/volatility speculation but provide structured risk and margin.",
      ],
    },
    { label: "② Technical ID", items: ["0 to a +2 Bullish Bias."] },
    { label: "③ Strategy Type", items: ["Theta"] },
    {
      label: "④ Delta Rule",
      items: [
        "Lower deltas = higher probability, less ROI.",
        "Sell delta .25 or lower, below support.",
        "Buy next strike lower. Consider widening if <5 point spreads.",
      ],
    },
    {
      label: "⑤ Theta Rule",
      items: [
        "Sell less than 3 months. 4-6 weeks is best for theta decay + range.",
        "Sell less time → capture higher decay. Sell more time → maximize ROI and range.",
      ],
    },
    { label: "⑥ Vega Rule", items: ["Decreasing volatility aids. Sell when volatility is expected to fall."] },
    { label: "⑦ Position Size", items: ["According to personal risk level."] },
    { label: "⑧ ROI Target", items: ["70% ROID or higher.", "10% of spread sold."] },
    {
      label: "⑨ Stop Loss",
      items: [
        "Exit if delta ever exceeds .40.",
        "Exit if stock gets within ½ ATR of strike sold.",
        "Exit if stock ever breaks support levels.",
      ],
    },
    { label: "⑩ Target", items: ["Expiration.", "75% net liquidation value (credit received)."] },
  ],
  BEAR_CALL_SPREAD: [
    {
      label: "① Philosophy",
      items: [
        "Selling a call + buying a higher call in the same expiration = bear call vertical spread.",
        "Bearish cash-flow strategy, bearish on IV. Provides structured risk and margin.",
      ],
    },
    { label: "② Technical ID", items: ["0 to a -2 Bearish Bias."] },
    { label: "③ Strategy Type", items: ["Theta"] },
    {
      label: "④ Delta Rule",
      items: [
        "Lower deltas = higher probability, less ROI.",
        "Sell delta .25 or lower, above resistance.",
        "Buy next strike higher. Consider widening if <5 point spreads.",
      ],
    },
    {
      label: "⑤ Theta Rule",
      items: [
        "Sell less than 3 months. 4-6 weeks is best for theta decay + range.",
        "Sell less time → capture higher decay. Sell more time → maximize ROI and range.",
      ],
    },
    { label: "⑥ Vega Rule", items: ["Decreasing volatility aids. Sell when volatility is expected to fall."] },
    { label: "⑦ Position Size", items: ["According to personal risk level."] },
    { label: "⑧ ROI Target", items: ["70% ROID or higher.", "10% of spread sold."] },
    {
      label: "⑨ Stop Loss",
      items: [
        "Exit if delta ever exceeds .40.",
        "Exit if stock gets within ½ ATR of strike sold.",
        "Exit if stock ever breaks resistance levels.",
      ],
    },
    { label: "⑩ Target", items: ["Expiration.", "75% net liquidation value (credit received)."] },
  ],
  IRON_CONDOR: [
    {
      label: "① Philosophy",
      items: [
        "Selling both a bull put and a bear call on the same stock/expiration = Iron Condor.",
        "Neutral cash-flow strategy, bearish on IV. Structured risk and margin.",
      ],
    },
    { label: "② Technical ID", items: ["-1 to a +1 Neutral Bias."] },
    { label: "③ Strategy Type", items: ["Theta"] },
    {
      label: "④ Delta Rule",
      items: [
        "Lower deltas = higher probability, less ROI.",
        "Bull Put: Sell delta .15 or lower, below support. Buy next strike lower.",
        "Bear Call: Sell delta .15 or lower, above resistance. Buy next strike higher.",
        "Widen spreads if less than 5 point spreads.",
      ],
    },
    {
      label: "⑤ Theta Rule",
      items: [
        "Sell less than 2 months. 4-6 weeks is optimal.",
        "Consider selling front month or weekly to maximize time decay.",
      ],
    },
    {
      label: "⑥ Vega Rule",
      items: [
        "Decreasing volatility aids. Can be used as an earnings strategy.",
        "Earnings Play: Enter 1-2 days before earnings to capture vol crush.",
        "Assess the MMM or expected gap — sell twice the expectation.",
        "Consider closing if market moves more than expectation, or at 75% NLV.",
      ],
    },
    { label: "⑦ Position Size", items: ["According to personal risk level."] },
    { label: "⑧ ROI Target", items: ["140 ROID or higher.", "15% of spread sold."] },
    {
      label: "⑨ Stop Loss",
      items: [
        "Exit if delta ever exceeds .40.",
        "Exit if stock gets within ½ ATR of strikes sold.",
        "Exit if stock ever breaks support/resistance levels.",
      ],
    },
    { label: "⑩ Target", items: ["Expiration.", "75% net liquidation value (credit received)."] },
  ],
  SHORT_STRANGLE: [
    {
      label: "① Philosophy",
      items: [
        "Sell both a call and a put on the same stock at low delta strikes to collect credit.",
        "Mostly IV-based: options are overpriced pre-earnings. After earnings, IV drops making them cheaper.",
        "A basic trade on time passing, volatility falling, and stock acting normal directionally.",
      ],
    },
    { label: "② Technical Bias", items: ["Earnings-based — no technical bias."] },
    { label: "③ Strategy Type", items: ["Vega and Theta"] },
    {
      label: "④ Delta Rule",
      items: [
        "Use strike prices under .20 delta.",
        "Sell delta on call and put that is twice the expected move (typically .10-.15 delta).",
        "ID one of: ATM front straddle, Market Maker Move (MMM), or avg gap % over last 4 earnings.",
      ],
    },
    {
      label: "⑤ Theta Rule",
      items: [
        "Unlike Iron Condor, nothing is mitigated in a strangle.",
        "Earnings trade: 1 week to 1 month depending on range.",
        "Normal theta trade: 1-3 months of time.",
      ],
    },
    {
      label: "⑥ Vega Rule",
      items: [
        "All earnings are volatility-based. Highest IV is immediately before earnings — vol crush follows.",
        "Sell the strangle immediately before earnings to be as neutral as possible.",
      ],
    },
    {
      label: "⑦ Position Size",
      items: [
        "According to risk. Typically only trade on low-dollar stocks (high margin requirement like naked put).",
        "On higher-dollar stocks, consider using the Iron Condor instead.",
      ],
    },
    {
      label: "⑧ Stop Loss",
      items: [
        "Exit if delta on either leg goes beyond .40 per contract.",
        "Exit if there is significant risk in the market, sector, or stock.",
      ],
    },
    {
      label: "⑨ Target",
      items: [
        "50% net liquidation 1-2 days after announcement.",
        "80% net liquidation 3 weeks after.",
        "Expiration.",
      ],
    },
  ],
  TIME_SPREAD: [
    {
      label: "Diagonal Call: ① Philosophy",
      items: [
        "BTO a longer-term call while STO a shorter-term call at a higher strike (different expirations).",
        "Used when anticipating stagnation or small rise in stock price.",
      ],
    },
    { label: "Diagonal Call: ② Bias", items: ["0 to +1 Neutral to Slightly Bullish."] },
    {
      label: "Diagonal Call: ④ Delta",
      items: ["Long Call: BTO slightly ITM, delta .60+.", "Short Call: STO slightly OTM. Result should be ≥10% return on ITM call bought."],
    },
    {
      label: "Diagonal Call: ⑤ Theta",
      items: ["Long Call: Buy 3-9 months of time.", "Short Call: Sell less than 1 month of time."],
    },
    {
      label: "Diagonal Call: ⑥ Vega",
      items: ["Positive — increased IV aids this trade. Enter 4-6 weeks before earnings. Never hold through earnings."],
    },
    {
      label: "Diagonal Put: ① Philosophy",
      items: [
        "BTO a longer-term put while STO a shorter-term put at a lower strike (different expirations).",
        "Used when anticipating stagnation or small decrease in stock price.",
      ],
    },
    { label: "Diagonal Put: ② Bias", items: ["0 to -1 Neutral to Slightly Bearish."] },
    {
      label: "Diagonal Put: ④ Delta",
      items: ["Long Put: BTO slightly ITM, delta .60+.", "Short Put: STO slightly OTM. Result should be ≥10% return on ITM put bought."],
    },
    {
      label: "Horizontal Call: ① Philosophy",
      items: [
        "BTO longer-term calls while STO equal near-term calls at the same strike (different expirations).",
        "Used when anticipating stagnation; same strike prices required.",
      ],
    },
    { label: "Horizontal Call: ② Bias", items: ["0 to +1 Neutral to Bullish."] },
    {
      label: "Horizontal Call: ④ Delta",
      items: ["BTO ATM or slightly OTM call.", "STO ATM or slightly OTM call."],
    },
    {
      label: "Horizontal Call: ⑤ Theta",
      items: ["Long Call: Buy 4+ months of time.", "Short Call: Sell 1 month or less."],
    },
    {
      label: "Horizontal Put: ① Philosophy",
      items: [
        "BTO longer-term puts while STO equal near-term puts at the same strike (different expirations).",
        "Used when anticipating stagnation; same strike prices required.",
      ],
    },
    { label: "Horizontal Put: ② Bias", items: ["0 to -1 Neutral to Bearish."] },
    {
      label: "Horizontal Put: ④ Delta",
      items: ["BTO ATM or slightly OTM put.", "STO ATM or slightly OTM put."],
    },
    {
      label: "All Time Spreads: ⑦ Position Size",
      items: ["According to personal risk level. Typically 1-4% of portfolio."],
    },
    {
      label: "All Time Spreads: ⑧ Stop Loss",
      items: [
        "No specific stop loss as risk is structured and allocation is small (1-2%).",
        "Consider exiting if trade moves outside breakeven on the risk graph.",
      ],
    },
    {
      label: "All Time Spreads: ⑨ Target",
      items: [
        "Expiration: If short option is OTM, let it expire and sell next month if long has 4+ months remaining.",
        "Net Liquidation: Consider closing if NLV of short option is 50% or more.",
      ],
    },
  ],
};

// ─── Calculation Helpers ────────────────────────────────────
function pf(v: string | null | undefined): number {
  if (!v || v === "") return NaN;
  const n = parseFloat(v);
  return n;
}

function fmt(n: number, decimals = 4): string {
  if (!isFinite(n)) return "—";
  return n.toFixed(decimals);
}

function fmtPct(n: number, decimals = 2): string {
  if (!isFinite(n)) return "—";
  return (n * 100).toFixed(decimals) + "%";
}

function fmtDollar(n: number, decimals = 2): string {
  if (!isFinite(n)) return "—";
  return "$" + n.toFixed(decimals);
}

type MetricSignal = "good" | "average" | "bad" | null;

interface ComputedMetrics {
  label: string;
  value: string;
  error?: boolean;
  signal?: MetricSignal;
}

// Evaluate a metric value against good/average/bad thresholds (all in decimal, e.g. 0.04 = 4%)
function rate(val: number, goodMin: number, avgMin: number): MetricSignal {
  if (!isFinite(val)) return null;
  if (val >= goodMin) return "good";
  if (val >= avgMin) return "average";
  return "bad";
}

function computeMetrics(idea: ResearchIdea): ComputedMetrics[] {
  const st = idea.strategyType;

  if (st === "COVERED_CALL") {
    const price = pf(idea.price);
    const strike = pf(idea.shortStrike);
    const delta = pf(idea.shortDelta);
    const credit = pf(idea.netCredit);
    const dte = idea.dte ?? NaN;

    if (isNaN(price) || isNaN(credit) || isNaN(strike)) return [];
    if (price > strike) return [{ label: "Error", value: "Price > Call Strike!", error: true }];
    if (delta < 0 || credit < 0) return [{ label: "Error", value: "Negative delta or credit!", error: true }];

    const maxProfit = credit + (strike - price);
    const creditROI = credit / price;
    const stdCrROI = dte > 0 ? (creditROI / dte) * 30 : NaN;
    const maxROI = maxProfit / price;
    const creditROID = !isNaN(delta) && delta > 0 ? creditROI / delta : NaN;
    const stdCrROID = !isNaN(delta) && delta > 0 && dte > 0 ? (creditROID / dte) * 30 : NaN;
    const maxROID = !isNaN(delta) && delta > 0 ? maxROI / delta : NaN;

    return [
      { label: "Max Profit", value: fmtDollar(maxProfit) },
      { label: "Credit ROI", value: fmtPct(creditROI) },
      { label: "Std Credit ROI", value: fmtPct(stdCrROI), signal: rate(stdCrROI, 0.04, 0.02) },
      { label: "Max ROI", value: fmtPct(maxROI) },
      { label: "Credit ROID", value: fmtPct(creditROID) },
      { label: "Std Cr. ROID", value: fmtPct(stdCrROID), signal: rate(stdCrROID, 0.07, 0.05) },
      { label: "Max ROID", value: fmtPct(maxROID) },
    ];
  }

  if (st === "SHORT_PUT") {
    const price = pf(idea.price);
    const atr = pf(idea.atr);
    const strike = pf(idea.shortStrike);
    const delta = pf(idea.shortDelta);
    const credit = pf(idea.netCredit);
    const bpe = pf(idea.bpe);
    const dte = idea.dte ?? NaN;

    const metrics: ComputedMetrics[] = [];
    if (!isNaN(price) && !isNaN(atr) && !isNaN(strike) && atr > 0) {
      const atrBuf = (price - strike) / atr;
      metrics.push({ label: "ATR Buffer", value: fmt(atrBuf, 2) });
      if (dte > 0) metrics.push({ label: "Std ATR Buffer", value: fmt((atrBuf / dte) * 30, 2) });
      metrics.push({ label: "Alert Price", value: fmtDollar(atr * 0.5 + strike) });
    }
    if (!isNaN(credit) && !isNaN(bpe) && bpe > 0) {
      const roi = credit / bpe;
      metrics.push({ label: "ROI", value: fmtPct(roi) });
      if (dte > 0) {
        const stdROI = (roi / dte) * 30;
        metrics.push({ label: "Std ROI", value: fmtPct(stdROI), signal: rate(stdROI, 0.15, 0.05) });
      }
      if (!isNaN(delta) && delta > 0) {
        const roid = roi / delta;
        metrics.push({ label: "ROID", value: fmtPct(roid) });
        if (dte > 0) {
          const stdROID = (roid / dte) * 30;
          metrics.push({ label: "Std ROID", value: fmtPct(stdROID), signal: rate(stdROID, 0.50, 0.25) });
        }
      }
    }
    return metrics;
  }

  if (st === "BULL_PUT_SPREAD") {
    const price = pf(idea.price);
    const atr = pf(idea.atr);
    const strike = pf(idea.shortStrike);
    const delta = pf(idea.shortDelta);
    const credit = pf(idea.netCredit);
    const bpe = pf(idea.bpe);
    const dte = idea.dte ?? NaN;

    const metrics: ComputedMetrics[] = [];
    if (!isNaN(price) && !isNaN(atr) && !isNaN(strike) && atr > 0) {
      const atrBuf = (price - strike) / atr;
      metrics.push({ label: "ATR Buffer", value: fmt(atrBuf, 2) });
      if (dte > 0) metrics.push({ label: "Std ATR Buffer", value: fmt((atrBuf / dte) * 30, 2) });
      metrics.push({ label: "Alert Price", value: fmtDollar(atr * 0.5 + strike) });
    }
    if (!isNaN(credit) && !isNaN(bpe) && bpe > 0) {
      const roi = credit / bpe;
      metrics.push({ label: "ROI", value: fmtPct(roi) });
      if (dte > 0) {
        const stdROI = (roi / dte) * 30;
        metrics.push({ label: "Std ROI", value: fmtPct(stdROI), signal: rate(stdROI, 0.10, 0.05) });
      }
      if (!isNaN(delta) && delta > 0) {
        const roid = roi / delta;
        metrics.push({ label: "ROID", value: fmtPct(roid) });
        if (dte > 0) {
          const stdROID = (roid / dte) * 30;
          metrics.push({ label: "Std ROID", value: fmtPct(stdROID), signal: rate(stdROID, 0.80, 0.60) });
        }
      }
    }
    return metrics;
  }

  if (st === "BEAR_CALL_SPREAD") {
    const price = pf(idea.price);
    const atr = pf(idea.atr);
    const strike = pf(idea.shortStrike);
    const delta = pf(idea.shortDelta);
    const credit = pf(idea.netCredit);
    const bpe = pf(idea.bpe);
    const dte = idea.dte ?? NaN;

    const metrics: ComputedMetrics[] = [];
    if (!isNaN(price) && !isNaN(atr) && !isNaN(strike) && atr > 0) {
      const atrBuf = (strike - price) / atr; // reversed for bear call
      metrics.push({ label: "ATR Buffer", value: fmt(atrBuf, 2) });
      if (dte > 0) metrics.push({ label: "Std ATR Buffer", value: fmt((atrBuf / dte) * 30, 2) });
      metrics.push({ label: "Alert Price", value: fmtDollar(strike - atr * 0.5) });
    }
    if (!isNaN(credit) && !isNaN(bpe) && bpe > 0) {
      const roi = credit / bpe;
      metrics.push({ label: "ROI", value: fmtPct(roi) });
      if (dte > 0) {
        const stdROI = (roi / dte) * 30;
        metrics.push({ label: "Std ROI", value: fmtPct(stdROI), signal: rate(stdROI, 0.10, 0.05) });
      }
      if (!isNaN(delta) && delta > 0) {
        const roid = roi / delta;
        metrics.push({ label: "ROID", value: fmtPct(roid) });
        if (dte > 0) {
          const stdROID = (roid / dte) * 30;
          metrics.push({ label: "Std ROID", value: fmtPct(stdROID), signal: rate(stdROID, 0.70, 0.50) });
        }
      }
    }
    return metrics;
  }

  if (st === "IRON_CONDOR") {
    const price = pf(idea.price);
    const atr = pf(idea.atr);
    const scStrike = pf(idea.shortCallStrike);
    const scDelta = pf(idea.shortCallDelta);
    const spStrike = pf(idea.shortPutStrike);
    const spDelta = pf(idea.shortPutDelta);
    const credit = pf(idea.netCredit);
    const bpe = pf(idea.bpe);
    const dte = idea.dte ?? NaN;

    const metrics: ComputedMetrics[] = [];
    if (!isNaN(price) && !isNaN(atr) && atr > 0) {
      if (!isNaN(scStrike)) {
        const callBuf = (scStrike - price) / atr;
        metrics.push({ label: "Call ATR Buffer", value: fmt(callBuf, 2) });
        if (dte > 0) metrics.push({ label: "Std Call ATR Buf", value: fmt((callBuf / dte) * 30, 2) });
        metrics.push({ label: "BC Alert", value: fmtDollar(scStrike - atr * 0.5) });
      }
      if (!isNaN(spStrike)) {
        const putBuf = (price - spStrike) / atr;
        metrics.push({ label: "Put ATR Buffer", value: fmt(putBuf, 2) });
        if (dte > 0) metrics.push({ label: "Std Put ATR Buf", value: fmt((putBuf / dte) * 30, 2) });
        metrics.push({ label: "BP Alert", value: fmtDollar(atr * 0.5 + spStrike) });
      }
    }
    if (!isNaN(scDelta) && !isNaN(spDelta)) {
      metrics.push({ label: "Net Delta", value: fmt((scDelta + spDelta) / 2, 4) });
    }
    if (!isNaN(credit) && !isNaN(bpe) && bpe > 0) {
      const roi = credit / bpe;
      metrics.push({ label: "ROI", value: fmtPct(roi) });
      if (dte > 0) {
        const stdROI = (roi / dte) * 30;
        metrics.push({ label: "Std ROI", value: fmtPct(stdROI), signal: rate(stdROI, 0.15, 0.10) });
      }
      const avgDelta = (!isNaN(scDelta) && !isNaN(spDelta)) ? (scDelta + spDelta) / 2 : NaN;
      if (!isNaN(avgDelta) && avgDelta > 0) {
        const roid = roi / avgDelta;
        metrics.push({ label: "ROID", value: fmtPct(roid) });
        if (dte > 0) {
          const stdROID = (roid / dte) * 30;
          metrics.push({ label: "Std ROID", value: fmtPct(stdROID), signal: rate(stdROID, 1.50, 1.20) });
        }
      }
    }
    return metrics;
  }

  if (st === "SHORT_STRANGLE") {
    const price = pf(idea.price);
    const atr = pf(idea.atr);
    const scStrike = pf(idea.shortCallStrike);
    const scDelta = pf(idea.shortCallDelta);
    const spStrike = pf(idea.shortPutStrike);
    const spDelta = pf(idea.shortPutDelta);
    const credit = pf(idea.netCredit);
    const bpe = pf(idea.bpe);
    const dte = idea.dte ?? NaN;

    const metrics: ComputedMetrics[] = [];
    if (!isNaN(price) && !isNaN(atr) && atr > 0) {
      if (!isNaN(scStrike)) {
        const callBuf = (scStrike - price) / atr;
        metrics.push({ label: "Call ATR Buffer", value: fmt(callBuf, 2) });
        if (dte > 0) metrics.push({ label: "Std Call ATR Buf", value: fmt((callBuf / dte) * 30, 2) });
      }
      if (!isNaN(spStrike)) {
        const putBuf = (price - spStrike) / atr;
        metrics.push({ label: "Put ATR Buffer", value: fmt(putBuf, 2) });
        if (dte > 0) metrics.push({ label: "Std Put ATR Buf", value: fmt((putBuf / dte) * 30, 2) });
      }
    }
    if (!isNaN(scDelta) && !isNaN(spDelta)) {
      metrics.push({ label: "Net Delta", value: fmt((scDelta + spDelta) / 2, 4) });
    }
    if (!isNaN(credit) && !isNaN(bpe) && bpe > 0) {
      const roi = credit / bpe;
      metrics.push({ label: "ROI", value: fmtPct(roi) });
      if (dte > 0) metrics.push({ label: "Std ROI", value: fmtPct((roi / dte) * 30) });
      const avgDelta = (!isNaN(scDelta) && !isNaN(spDelta)) ? (scDelta + spDelta) / 2 : NaN;
      if (!isNaN(avgDelta) && avgDelta > 0) {
        const roid = roi / avgDelta;
        metrics.push({ label: "ROID", value: fmtPct(roid) });
        if (dte > 0) metrics.push({ label: "Std ROID", value: fmtPct((roid / dte) * 30) });
      }
    }
    return metrics;
  }

  if (st === "TIME_SPREAD") {
    const longDebit = pf(idea.longStrikeDebit);
    const shortCredit = pf(idea.shortStrikeCredit);
    const lStrike = pf(idea.longStrike);
    const sStrike = pf(idea.shortStrike);
    const subType = idea.spreadSubType || "";
    const isHoriz = subType.startsWith("Horiz");

    if (isHoriz && !isNaN(lStrike) && !isNaN(sStrike) && lStrike !== sStrike) {
      return [{ label: "Error", value: "Horizontal spread: strikes must match!", error: true }];
    }

    const metrics: ComputedMetrics[] = [];
    if (!isNaN(longDebit) && !isNaN(shortCredit)) {
      metrics.push({ label: "Spread Debit", value: fmtDollar(longDebit - shortCredit) });
      if (longDebit > 0) {
        metrics.push({ label: "ROI", value: fmtPct(shortCredit / longDebit) });
      }
    }
    return metrics;
  }

  return [];
}

// ─── Signal Indicator ───────────────────────────────────────
const SIGNAL_CONFIG: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  good: { dot: "bg-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-500", label: "GOOD" },
  average: { dot: "bg-amber-500", bg: "bg-amber-500/10", text: "text-amber-500", label: "AVG" },
  bad: { dot: "bg-red-500", bg: "bg-red-500/10", text: "text-red-500", label: "NO GO" },
};

function SignalBadge({ signal }: { signal: MetricSignal }) {
  if (!signal) return null;
  const cfg = SIGNAL_CONFIG[signal];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function metricValueClass(m: ComputedMetrics): string {
  if (m.error) return "text-danger font-semibold";
  if (m.signal === "good") return "font-semibold text-emerald-500";
  if (m.signal === "average") return "font-semibold text-amber-500";
  if (m.signal === "bad") return "font-semibold text-red-500";
  return "font-medium";
}

// ─── InfoIcon Component ─────────────────────────────────────
function InfoIcon({ tooltip }: { tooltip: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const above = spaceAbove > 120; // enough room to show above
    setPos({
      top: above ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140),
      above,
    });
  }, []);

  const handleShow = useCallback(() => {
    updatePos();
    setShow(true);
  }, [updatePos]);

  return (
    <span className="inline-block ml-1">
      <button
        ref={btnRef}
        type="button"
        className="text-muted hover:text-foreground transition-colors"
        onMouseEnter={handleShow}
        onMouseLeave={() => setShow(false)}
        onClick={() => {
          if (show) {
            setShow(false);
          } else {
            handleShow();
          }
        }}
        aria-label="Info"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {show &&
        pos &&
        createPortal(
          <div
            className="fixed z-[9999] w-64 p-2 rounded-lg bg-card border border-border text-xs text-foreground shadow-lg whitespace-normal pointer-events-none"
            style={{
              top: pos.above ? undefined : pos.top,
              bottom: pos.above ? `${window.innerHeight - pos.top}px` : undefined,
              left: pos.left,
              transform: "translateX(-50%)",
            }}
          >
            {tooltip}
          </div>,
          document.body
        )}
    </span>
  );
}

// ─── Form Field with Info Icon ──────────────────────────────
function FieldWithInfo({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-0.5 mb-1">
        <label className="block text-sm font-medium text-foreground">{label}</label>
        {tooltip && <InfoIcon tooltip={tooltip} />}
      </div>
      {children}
    </div>
  );
}

// ─── Strategy-Specific Form Fields ──────────────────────────
function StrategyFields({
  strategy,
  form,
  setField,
}: {
  strategy: string;
  form: Record<string, string>;
  setField: (key: string, value: string) => void;
}) {
  const tips = FIELD_TOOLTIPS[strategy] || {};

  if (strategy === "COVERED_CALL") {
    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <FieldWithInfo label="Stock Price" tooltip={tips.price}>
            <Input type="number" step="0.01" placeholder="e.g. 85.00" value={form.price || ""} onChange={(e) => setField("price", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Month" tooltip={tips.month}>
            <Input placeholder="e.g. MAR" value={form.month || ""} onChange={(e) => setField("month", e.target.value)} />
          </FieldWithInfo>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="DTE" tooltip={tips.dte}>
            <Input type="number" min="1" placeholder="e.g. 30" value={form.dte || ""} onChange={(e) => setField("dte", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Call Sold (Strike)" tooltip={tips.shortStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 90" value={form.shortStrike || ""} onChange={(e) => setField("shortStrike", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Delta" tooltip={tips.shortDelta}>
            <Input type="number" step="0.01" placeholder="e.g. 0.30" value={form.shortDelta || ""} onChange={(e) => setField("shortDelta", e.target.value)} />
          </FieldWithInfo>
        </div>
        <FieldWithInfo label="Credit (per share)" tooltip={tips.netCredit}>
          <Input type="number" step="0.01" placeholder="e.g. 1.50" value={form.netCredit || ""} onChange={(e) => setField("netCredit", e.target.value)} />
        </FieldWithInfo>
      </>
    );
  }

  if (strategy === "SHORT_PUT") {
    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <FieldWithInfo label="Stock Price" tooltip={tips.price}>
            <Input type="number" step="0.01" placeholder="e.g. 150.00" value={form.price || ""} onChange={(e) => setField("price", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="ATR" tooltip={tips.atr}>
            <Input type="number" step="0.01" placeholder="e.g. 3.50" value={form.atr || ""} onChange={(e) => setField("atr", e.target.value)} />
          </FieldWithInfo>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="Month" tooltip={tips.month}>
            <Input placeholder="e.g. MAR" value={form.month || ""} onChange={(e) => setField("month", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="DTE" tooltip={tips.dte}>
            <Input type="number" min="1" placeholder="e.g. 45" value={form.dte || ""} onChange={(e) => setField("dte", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Strike" tooltip={tips.shortStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 140" value={form.shortStrike || ""} onChange={(e) => setField("shortStrike", e.target.value)} />
          </FieldWithInfo>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="Delta" tooltip={tips.shortDelta}>
            <Input type="number" step="0.01" placeholder="e.g. 0.15" value={form.shortDelta || ""} onChange={(e) => setField("shortDelta", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Net Credit" tooltip={tips.netCredit}>
            <Input type="number" step="0.01" placeholder="e.g. 2.50" value={form.netCredit || ""} onChange={(e) => setField("netCredit", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="BPE ($)" tooltip={tips.bpe}>
            <Input type="number" step="0.01" placeholder="e.g. 5000" value={form.bpe || ""} onChange={(e) => setField("bpe", e.target.value)} />
          </FieldWithInfo>
        </div>
      </>
    );
  }

  if (strategy === "BULL_PUT_SPREAD" || strategy === "BEAR_CALL_SPREAD") {
    const isCall = strategy === "BEAR_CALL_SPREAD";
    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <FieldWithInfo label="Stock Price" tooltip={tips.price}>
            <Input type="number" step="0.01" placeholder="e.g. 140.00" value={form.price || ""} onChange={(e) => setField("price", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="ATR" tooltip={tips.atr}>
            <Input type="number" step="0.01" placeholder="e.g. 2.80" value={form.atr || ""} onChange={(e) => setField("atr", e.target.value)} />
          </FieldWithInfo>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="Month" tooltip={tips.month}>
            <Input placeholder="e.g. MAR" value={form.month || ""} onChange={(e) => setField("month", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="DTE" tooltip={tips.dte}>
            <Input type="number" min="1" placeholder="e.g. 46" value={form.dte || ""} onChange={(e) => setField("dte", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label={`Short ${isCall ? "Call" : "Put"} Strike`} tooltip={tips.shortStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 125" value={form.shortStrike || ""} onChange={(e) => setField("shortStrike", e.target.value)} />
          </FieldWithInfo>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="Short Opt Delta" tooltip={tips.shortDelta}>
            <Input type="number" step="0.01" placeholder="e.g. 0.17" value={form.shortDelta || ""} onChange={(e) => setField("shortDelta", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label={`Long ${isCall ? "Call" : "Put"} Strike`} tooltip={tips.longStrike}>
            <Input type="number" step="0.01" placeholder={isCall ? "e.g. 135" : "e.g. 120"} value={form.longStrike || ""} onChange={(e) => setField("longStrike", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Net Credit" tooltip={tips.netCredit}>
            <Input type="number" step="0.01" placeholder="e.g. 0.54" value={form.netCredit || ""} onChange={(e) => setField("netCredit", e.target.value)} />
          </FieldWithInfo>
        </div>
        <FieldWithInfo label="BPE ($)" tooltip={tips.bpe}>
          <Input type="number" step="0.01" placeholder="e.g. 446" value={form.bpe || ""} onChange={(e) => setField("bpe", e.target.value)} />
        </FieldWithInfo>
      </>
    );
  }

  if (strategy === "IRON_CONDOR") {
    return (
      <>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="Stock Price" tooltip={tips.price}>
            <Input type="number" step="0.01" placeholder="e.g. 450" value={form.price || ""} onChange={(e) => setField("price", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="ATR" tooltip={tips.atr}>
            <Input type="number" step="0.01" placeholder="e.g. 8.50" value={form.atr || ""} onChange={(e) => setField("atr", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Month" tooltip={tips.month}>
            <Input placeholder="e.g. MAR" value={form.month || ""} onChange={(e) => setField("month", e.target.value)} />
          </FieldWithInfo>
        </div>
        <FieldWithInfo label="DTE" tooltip={tips.dte}>
          <Input type="number" min="1" placeholder="e.g. 30" value={form.dte || ""} onChange={(e) => setField("dte", e.target.value)} />
        </FieldWithInfo>

        <p className="text-xs font-semibold text-muted uppercase tracking-wider mt-2">Bear Call Side</p>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="Short Call Strike" tooltip={tips.shortCallStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 470" value={form.shortCallStrike || ""} onChange={(e) => setField("shortCallStrike", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Short Call Delta" tooltip={tips.shortCallDelta}>
            <Input type="number" step="0.01" placeholder="e.g. 0.12" value={form.shortCallDelta || ""} onChange={(e) => setField("shortCallDelta", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Long Call Strike" tooltip={tips.longCallStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 475" value={form.longCallStrike || ""} onChange={(e) => setField("longCallStrike", e.target.value)} />
          </FieldWithInfo>
        </div>

        <p className="text-xs font-semibold text-muted uppercase tracking-wider mt-2">Bull Put Side</p>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="Short Put Strike" tooltip={tips.shortPutStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 430" value={form.shortPutStrike || ""} onChange={(e) => setField("shortPutStrike", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Short Put Delta" tooltip={tips.shortPutDelta}>
            <Input type="number" step="0.01" placeholder="e.g. 0.12" value={form.shortPutDelta || ""} onChange={(e) => setField("shortPutDelta", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Long Put Strike" tooltip={tips.longPutStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 425" value={form.longPutStrike || ""} onChange={(e) => setField("longPutStrike", e.target.value)} />
          </FieldWithInfo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FieldWithInfo label="Net Credit" tooltip={tips.netCredit}>
            <Input type="number" step="0.01" placeholder="e.g. 1.20" value={form.netCredit || ""} onChange={(e) => setField("netCredit", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="BPE ($)" tooltip={tips.bpe}>
            <Input type="number" step="0.01" placeholder="e.g. 380" value={form.bpe || ""} onChange={(e) => setField("bpe", e.target.value)} />
          </FieldWithInfo>
        </div>
      </>
    );
  }

  if (strategy === "SHORT_STRANGLE") {
    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <FieldWithInfo label="Stock Price" tooltip={tips.price}>
            <Input type="number" step="0.01" placeholder="e.g. 180" value={form.price || ""} onChange={(e) => setField("price", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Earnings Date" tooltip={tips.earningsDate}>
            <Input placeholder="e.g. 2/15" value={form.earningsDate || ""} onChange={(e) => setField("earningsDate", e.target.value)} />
          </FieldWithInfo>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="ATR" tooltip={tips.atr}>
            <Input type="number" step="0.01" placeholder="e.g. 5.20" value={form.atr || ""} onChange={(e) => setField("atr", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Expected Gap" tooltip={tips.expectedGap}>
            <Input type="number" step="0.01" placeholder="e.g. 12.50" value={form.expectedGap || ""} onChange={(e) => setField("expectedGap", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Expiration" tooltip={tips.expiration}>
            <Input placeholder="e.g. MAR 21" value={form.expiration || ""} onChange={(e) => setField("expiration", e.target.value)} />
          </FieldWithInfo>
        </div>
        <FieldWithInfo label="DTE" tooltip={tips.dte}>
          <Input type="number" min="1" placeholder="e.g. 14" value={form.dte || ""} onChange={(e) => setField("dte", e.target.value)} />
        </FieldWithInfo>

        <p className="text-xs font-semibold text-muted uppercase tracking-wider mt-2">Call Side</p>
        <div className="grid grid-cols-2 gap-4">
          <FieldWithInfo label="Short Call Strike" tooltip={tips.shortCallStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 195" value={form.shortCallStrike || ""} onChange={(e) => setField("shortCallStrike", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Short Call Delta" tooltip={tips.shortCallDelta}>
            <Input type="number" step="0.01" placeholder="e.g. 0.12" value={form.shortCallDelta || ""} onChange={(e) => setField("shortCallDelta", e.target.value)} />
          </FieldWithInfo>
        </div>

        <p className="text-xs font-semibold text-muted uppercase tracking-wider mt-2">Put Side</p>
        <div className="grid grid-cols-2 gap-4">
          <FieldWithInfo label="Short Put Strike" tooltip={tips.shortPutStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 165" value={form.shortPutStrike || ""} onChange={(e) => setField("shortPutStrike", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Short Put Delta" tooltip={tips.shortPutDelta}>
            <Input type="number" step="0.01" placeholder="e.g. 0.12" value={form.shortPutDelta || ""} onChange={(e) => setField("shortPutDelta", e.target.value)} />
          </FieldWithInfo>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FieldWithInfo label="Net Credit" tooltip={tips.netCredit}>
            <Input type="number" step="0.01" placeholder="e.g. 3.20" value={form.netCredit || ""} onChange={(e) => setField("netCredit", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="BPE ($)" tooltip={tips.bpe}>
            <Input type="number" step="0.01" placeholder="e.g. 8000" value={form.bpe || ""} onChange={(e) => setField("bpe", e.target.value)} />
          </FieldWithInfo>
        </div>
      </>
    );
  }

  if (strategy === "TIME_SPREAD") {
    return (
      <>
        <FieldWithInfo label="Spread Type" tooltip={tips.spreadSubType}>
          <Select
            value={form.spreadSubType || ""}
            onChange={(e) => setField("spreadSubType", e.target.value)}
            options={[
              { value: "", label: "Select type..." },
              ...TIME_SPREAD_SUBTYPES,
            ]}
          />
        </FieldWithInfo>
        <FieldWithInfo label="Stock Price" tooltip={tips.price}>
          <Input type="number" step="0.01" placeholder="e.g. 250" value={form.price || ""} onChange={(e) => setField("price", e.target.value)} />
        </FieldWithInfo>

        <p className="text-xs font-semibold text-muted uppercase tracking-wider mt-2">Long Option (Further Out)</p>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="Long Strike" tooltip={tips.longStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 250" value={form.longStrike || ""} onChange={(e) => setField("longStrike", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Long Expiration" tooltip={tips.longStrikeExp}>
            <Input placeholder="e.g. JUN" value={form.longStrikeExp || ""} onChange={(e) => setField("longStrikeExp", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Long Debit ($)" tooltip={tips.longStrikeDebit}>
            <Input type="number" step="0.01" placeholder="e.g. 12.50" value={form.longStrikeDebit || ""} onChange={(e) => setField("longStrikeDebit", e.target.value)} />
          </FieldWithInfo>
        </div>

        <p className="text-xs font-semibold text-muted uppercase tracking-wider mt-2">Short Option (Near Term)</p>
        <div className="grid grid-cols-3 gap-4">
          <FieldWithInfo label="Short Strike" tooltip={tips.shortStrike}>
            <Input type="number" step="0.01" placeholder="e.g. 255" value={form.shortStrike || ""} onChange={(e) => setField("shortStrike", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Short Expiration" tooltip={tips.shortStrikeExp}>
            <Input placeholder="e.g. MAR" value={form.shortStrikeExp || ""} onChange={(e) => setField("shortStrikeExp", e.target.value)} />
          </FieldWithInfo>
          <FieldWithInfo label="Short Credit ($)" tooltip={tips.shortStrikeCredit}>
            <Input type="number" step="0.01" placeholder="e.g. 3.00" value={form.shortStrikeCredit || ""} onChange={(e) => setField("shortStrikeCredit", e.target.value)} />
          </FieldWithInfo>
        </div>
      </>
    );
  }

  return null;
}

// ─── Computed Metrics Display (inline in form) ──────────────
function LiveMetrics({ form, strategy }: { form: Record<string, string>; strategy: string }) {
  const idea = useMemo(() => {
    const mapped: ResearchIdea = {
      id: "",
      strategyType: strategy,
      dte: form.dte ? parseInt(form.dte) : null,
      atr: form.atr || null,
      netCredit: form.netCredit || null,
      bpe: form.bpe || null,
      notes: null,
      underlying: { symbol: "" },
      createdAt: "",
      price: form.price || null,
      month: form.month || null,
      shortStrike: form.shortStrike || null,
      shortDelta: form.shortDelta || null,
      longStrike: form.longStrike || null,
      shortCallStrike: form.shortCallStrike || null,
      shortCallDelta: form.shortCallDelta || null,
      longCallStrike: form.longCallStrike || null,
      shortPutStrike: form.shortPutStrike || null,
      shortPutDelta: form.shortPutDelta || null,
      longPutStrike: form.longPutStrike || null,
      earningsDate: form.earningsDate || null,
      expectedGap: form.expectedGap || null,
      expiration: form.expiration || null,
      spreadSubType: form.spreadSubType || null,
      longStrikeExp: form.longStrikeExp || null,
      longStrikeDebit: form.longStrikeDebit || null,
      shortStrikeExp: form.shortStrikeExp || null,
      shortStrikeCredit: form.shortStrikeCredit || null,
      wheelCategoryOverride: null,
    };
    return mapped;
  }, [form, strategy]);

  const metrics = useMemo(() => computeMetrics(idea), [idea]);

  if (metrics.length === 0) return null;

  return (
    <div className="p-3 rounded-lg bg-surface border border-border">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Performance Metrics (auto-calculated)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between text-sm gap-2">
            <span className="text-muted whitespace-nowrap">{m.label}</span>
            <div className="flex items-center gap-1.5">
              <span className={metricValueClass(m)}>{m.value}</span>
              {m.signal && <SignalBadge signal={m.signal} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Trade Rules Collapsible ────────────────────────────────
function TradeRules({ strategy }: { strategy: string }) {
  const [open, setOpen] = useState(false);
  const rules = TRADE_RULES[strategy];
  if (!rules) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground bg-surface hover:bg-muted/10 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span>Trade Identification / Rules</span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3 text-sm border-t border-border">
          {rules.map((rule) => (
            <div key={rule.label}>
              <p className="font-semibold text-foreground">{rule.label}</p>
              <ul className="ml-4 mt-1 space-y-0.5 list-disc list-outside text-muted">
                {rule.items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Idea Card Display ──────────────────────────────────────
function IdeaCard({ idea, onDelete }: { idea: ResearchIdea; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const metrics = useMemo(() => computeMetrics(idea), [idea]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const rules = TRADE_RULES[idea.strategyType];

  // Build a summary of key inputs
  const inputSummary: { label: string; value: string }[] = [];
  if (idea.price) inputSummary.push({ label: "Price", value: `$${parseFloat(idea.price).toFixed(2)}` });
  if (idea.atr) inputSummary.push({ label: "ATR", value: parseFloat(idea.atr).toFixed(2) });
  if (idea.month) inputSummary.push({ label: "Month", value: idea.month });
  if (idea.dte) inputSummary.push({ label: "DTE", value: String(idea.dte) });

  // Strategy-specific input display
  const st = idea.strategyType;
  if (st === "COVERED_CALL") {
    if (idea.shortStrike) inputSummary.push({ label: "Call Sold", value: `$${parseFloat(idea.shortStrike).toFixed(2)}` });
    if (idea.shortDelta) inputSummary.push({ label: "Delta", value: parseFloat(idea.shortDelta).toFixed(2) });
    if (idea.netCredit) inputSummary.push({ label: "Credit", value: `$${parseFloat(idea.netCredit).toFixed(2)}` });
  } else if (st === "SHORT_PUT") {
    if (idea.shortStrike) inputSummary.push({ label: "Strike", value: `$${parseFloat(idea.shortStrike).toFixed(2)}` });
    if (idea.shortDelta) inputSummary.push({ label: "Delta", value: parseFloat(idea.shortDelta).toFixed(2) });
    if (idea.netCredit) inputSummary.push({ label: "Credit", value: `$${parseFloat(idea.netCredit).toFixed(2)}` });
    if (idea.bpe) inputSummary.push({ label: "BPE", value: `$${parseFloat(idea.bpe).toFixed(2)}` });
  } else if (st === "BULL_PUT_SPREAD" || st === "BEAR_CALL_SPREAD") {
    if (idea.shortStrike) inputSummary.push({ label: "Short Strike", value: `$${parseFloat(idea.shortStrike).toFixed(2)}` });
    if (idea.shortDelta) inputSummary.push({ label: "Delta", value: parseFloat(idea.shortDelta).toFixed(2) });
    if (idea.longStrike) inputSummary.push({ label: "Long Strike", value: `$${parseFloat(idea.longStrike).toFixed(2)}` });
    if (idea.netCredit) inputSummary.push({ label: "Credit", value: `$${parseFloat(idea.netCredit).toFixed(2)}` });
    if (idea.bpe) inputSummary.push({ label: "BPE", value: `$${parseFloat(idea.bpe).toFixed(2)}` });
  } else if (st === "IRON_CONDOR") {
    if (idea.shortCallStrike) inputSummary.push({ label: "SC Strike", value: `$${parseFloat(idea.shortCallStrike).toFixed(2)}` });
    if (idea.shortPutStrike) inputSummary.push({ label: "SP Strike", value: `$${parseFloat(idea.shortPutStrike).toFixed(2)}` });
    if (idea.netCredit) inputSummary.push({ label: "Credit", value: `$${parseFloat(idea.netCredit).toFixed(2)}` });
    if (idea.bpe) inputSummary.push({ label: "BPE", value: `$${parseFloat(idea.bpe).toFixed(2)}` });
  } else if (st === "SHORT_STRANGLE") {
    if (idea.shortCallStrike) inputSummary.push({ label: "SC Strike", value: `$${parseFloat(idea.shortCallStrike).toFixed(2)}` });
    if (idea.shortPutStrike) inputSummary.push({ label: "SP Strike", value: `$${parseFloat(idea.shortPutStrike).toFixed(2)}` });
    if (idea.netCredit) inputSummary.push({ label: "Credit", value: `$${parseFloat(idea.netCredit).toFixed(2)}` });
    if (idea.bpe) inputSummary.push({ label: "BPE", value: `$${parseFloat(idea.bpe).toFixed(2)}` });
  } else if (st === "TIME_SPREAD") {
    if (idea.spreadSubType) inputSummary.push({ label: "Type", value: idea.spreadSubType });
    if (idea.longStrikeDebit) inputSummary.push({ label: "Long Debit", value: `$${parseFloat(idea.longStrikeDebit).toFixed(2)}` });
    if (idea.shortStrikeCredit) inputSummary.push({ label: "Short Credit", value: `$${parseFloat(idea.shortStrikeCredit).toFixed(2)}` });
  }

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg">{idea.underlying.symbol}</span>
              <Badge variant="core">{STRATEGY_LABELS[idea.strategyType] || idea.strategyType}</Badge>
            </div>
            <p className="text-xs text-muted">{new Date(idea.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-muted hover:text-foreground p-1 transition-colors"
              title="Toggle details"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <button
              onClick={() => onDelete(idea.id)}
              className="text-muted hover:text-danger p-1 transition-colors"
              title="Delete idea"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick summary */}
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
          {inputSummary.slice(0, 6).map((s) => (
            <div key={s.label} className="flex justify-between">
              <span className="text-muted">{s.label}</span>
              <span className="font-medium">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Computed metrics */}
        {metrics.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {metrics.slice(0, expanded ? undefined : 4).map((m) => (
                <div key={m.label} className="flex items-center justify-between gap-2">
                  <span className="text-muted whitespace-nowrap">{m.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={metricValueClass(m)}>{m.value}</span>
                    {m.signal && <SignalBadge signal={m.signal} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {idea.notes && (
          <p className="text-sm text-muted mt-3 line-clamp-2">{idea.notes}</p>
        )}
      </div>

      {/* Expanded: trade rules */}
      {expanded && rules && (
        <div className="border-t border-border">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-muted bg-surface hover:bg-muted/10 transition-colors"
            onClick={() => setRulesOpen((o) => !o)}
          >
            <span>Trade Rules</span>
            {rulesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {rulesOpen && (
            <div className="px-4 py-3 space-y-2 text-xs border-t border-border">
              {rules.map((rule) => (
                <div key={rule.label}>
                  <p className="font-semibold">{rule.label}</p>
                  <ul className="ml-4 mt-0.5 space-y-0.5 list-disc list-outside text-muted">
                    {rule.items.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main Page Component ────────────────────────────────────
export default function ResearchPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [ideas, setIdeas] = useState<ResearchIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const emptyForm: Record<string, string> = {
    symbol: "",
    strategyType: "COVERED_CALL",
    dte: "",
    notes: "",
    wheelCategoryOverride: "CORE",
    price: "",
    month: "",
    atr: "",
    shortStrike: "",
    shortDelta: "",
    longStrike: "",
    netCredit: "",
    bpe: "",
    shortCallStrike: "",
    shortCallDelta: "",
    longCallStrike: "",
    shortPutStrike: "",
    shortPutDelta: "",
    longPutStrike: "",
    earningsDate: "",
    expectedGap: "",
    expiration: "",
    spreadSubType: "",
    longStrikeExp: "",
    longStrikeDebit: "",
    shortStrikeExp: "",
    shortStrikeCredit: "",
  };

  const [form, setForm] = useState<Record<string, string>>(emptyForm);

  const setField = useCallback((key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const fetchIdeas = useCallback(
    (strategyType?: string) => {
      const url = strategyType
        ? `/api/accounts/${accountId}/research?strategyType=${strategyType}`
        : `/api/accounts/${accountId}/research`;
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          setIdeas(Array.isArray(data) ? data : []);
          setLoading(false);
        });
    },
    [accountId]
  );

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const openNewModal = () => {
    setSubmitError("");
    setForm({ ...emptyForm });
    setShowNewModal(true);
  };

  const handleNewIdeaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const body: Record<string, unknown> = {
        symbol: form.symbol,
        strategyType: form.strategyType,
        wheelCategoryOverride: form.wheelCategoryOverride || undefined,
      };

      // Numeric fields
      const numFields = [
        "price",
        "atr",
        "shortStrike",
        "shortDelta",
        "longStrike",
        "netCredit",
        "bpe",
        "shortCallStrike",
        "shortCallDelta",
        "longCallStrike",
        "shortPutStrike",
        "shortPutDelta",
        "longPutStrike",
        "expectedGap",
        "longStrikeDebit",
        "shortStrikeCredit",
      ];
      for (const key of numFields) {
        if (form[key]) body[key] = parseFloat(form[key]);
      }
      if (form.dte) body.dte = parseInt(form.dte, 10);

      // String fields
      const strFields = [
        "month",
        "notes",
        "earningsDate",
        "expiration",
        "spreadSubType",
        "longStrikeExp",
        "shortStrikeExp",
      ];
      for (const key of strFields) {
        if (form[key]) body[key] = form[key];
      }

      const res = await fetch(`/api/accounts/${accountId}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to create trade idea");
        setSubmitting(false);
        return;
      }
      setShowNewModal(false);
      fetchIdeas();
    } catch {
      setSubmitError("Something went wrong");
    }
    setSubmitting(false);
  };

  const handleDelete = async (ideaId: string) => {
    if (!confirm("Delete this research idea?")) return;
    await fetch(`/api/accounts/${accountId}/research?ideaId=${ideaId}`, { method: "DELETE" });
    fetchIdeas();
  };

  const tabs = [
    { id: "all", label: "All Strategies" },
    ...Object.entries(STRATEGY_LABELS).map(([id, label]) => ({ id, label })),
  ];

  const handleTabChange = (tabId: string) => {
    setLoading(true);
    fetchIdeas(tabId === "all" ? undefined : tabId);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/accounts/${accountId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Theta Research</h1>
            <p className="text-muted text-sm">Research and plan options strategies</p>
          </div>
        </div>
        <Button size="sm" onClick={openNewModal}>
          <PlusCircle className="w-4 h-4" />
          New Trade
        </Button>
      </div>

      {/* New Trade modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">New Trade Idea</h2>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-muted hover:text-foreground p-1"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleNewIdeaSubmit} className="p-4 space-y-4">
              {submitError && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                  {submitError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Symbol"
                  placeholder="e.g. AAPL"
                  value={form.symbol || ""}
                  onChange={(e) => setField("symbol", e.target.value.toUpperCase())}
                  required
                />
                <Select
                  label="Strategy Type"
                  value={form.strategyType}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...emptyForm,
                      symbol: f.symbol,
                      wheelCategoryOverride: f.wheelCategoryOverride,
                      strategyType: e.target.value,
                    }));
                  }}
                  options={STRATEGY_OPTIONS}
                  required
                />
              </div>

              {/* Strategy-specific fields */}
              <StrategyFields strategy={form.strategyType} form={form} setField={setField} />

              {/* Live metrics */}
              <LiveMetrics form={form} strategy={form.strategyType} />

              {/* Trade rules */}
              <TradeRules strategy={form.strategyType} />

              {/* Wheel category + Notes */}
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Wheel Category"
                  value={form.wheelCategoryOverride}
                  onChange={(e) => setField("wheelCategoryOverride", e.target.value)}
                  options={[
                    { value: "CORE", label: "Core" },
                    { value: "MAD_MONEY", label: "Mad Money" },
                    { value: "FREE_CAPITAL", label: "Free Capital" },
                    { value: "RISK_MGMT", label: "Risk Mgmt" },
                  ]}
                />
                <div />
              </div>
              <FieldWithInfo label="Notes" tooltip={FIELD_TOOLTIPS[form.strategyType]?.notes}>
                <textarea
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[60px]"
                  placeholder="Strategy notes, setup, thesis..."
                  value={form.notes || ""}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </FieldWithInfo>

              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={submitting}>
                  Create Idea
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowNewModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <Tabs tabs={tabs} onChange={handleTabChange}>
        {() =>
          loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-card rounded-lg" />
              ))}
            </div>
          ) : ideas.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-muted">No trade ideas yet. Start by adding a new trade.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ideas.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} onDelete={handleDelete} />
              ))}
            </div>
          )
        }
      </Tabs>
    </div>
  );
}
