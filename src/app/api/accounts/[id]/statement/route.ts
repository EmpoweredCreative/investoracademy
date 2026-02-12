import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { backfillJournalOptionFinancials } from "@/lib/services/manualEntry";

/**
 * GET /api/accounts/:id/statement
 *
 * Returns an account statement (Profit & Loss) for every symbol
 * that has ever had activity in the account, including symbols where
 * shares were sold or called away and never repurchased.
 *
 * Tracks cost basis over time so the user always has a historical record.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Auto-backfill: create financial records for any journal option trades
    // that are missing StrategyInstance / LedgerEntry / basis reduction.
    await backfillJournalOptionFinancials(accountId);

    // Fetch ALL underlyings — including ones with no remaining shares
    const underlyings = await prisma.underlying.findMany({
      where: { accountId },
      include: {
        stockLots: {
          orderBy: { acquiredAt: "asc" },
        },
        strategyInstances: {
          where: { instrumentType: "OPTION" },
          include: {
            ledgerEntries: true,
          },
        },
        journalTrades: {
          where: { callPut: null },
          orderBy: { entryDateTime: "asc" },
        },
      },
    });

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const symbols = underlyings
      .map((u) => {
        // ── Stock lot analysis ──────────────────────────────────
        let totalSharesBought = 0;
        let totalOriginalCost = 0;
        let totalPremiumReduction = 0;

        // Current (open) position
        let currentShares = 0;
        let currentOriginalCostBasis = 0;
        let currentPremiumReduction = 0;

        // Cost basis consumed by sales/assignments
        let soldSharesCostBasis = 0;

        for (const lot of u.stockLots) {
          const qty = parseFloat(lot.quantity.toString());
          const rem = parseFloat(lot.remaining.toString());
          const cost = parseFloat(lot.costBasis.toString());
          const premRed = parseFloat(lot.premiumReduction.toString());
          const costPerShare = qty > 0 ? cost / qty : 0;
          const premRedPerShare = qty > 0 ? premRed / qty : 0;

          totalSharesBought += qty;
          totalOriginalCost += cost;
          totalPremiumReduction += premRed;

          // Open portion
          if (rem > 0) {
            currentShares += rem;
            currentOriginalCostBasis += costPerShare * rem;
            currentPremiumReduction += premRedPerShare * rem;
          }

          // Sold portion
          const sold = qty - rem;
          if (sold > 0) {
            soldSharesCostBasis += costPerShare * sold;
          }
        }

        const currentAdjustedCostBasis =
          currentOriginalCostBasis - currentPremiumReduction;
        const adjustedCostPerShare =
          currentShares > 0 ? currentAdjustedCostBasis / currentShares : 0;
        const originalCostPerShare =
          currentShares > 0 ? currentOriginalCostBasis / currentShares : 0;

        // ── Option P/L + detailed trades ─────────────────────────
        let realizedOptionPnl = 0;
        let realizedOptionPnlYtd = 0;
        let openOptionCount = 0;
        let openOptionPremium = 0;

        interface OptionTradeDetail {
          id: string;
          callPut: string;
          strike: number | null;
          quantity: number;
          status: string;
          premiumReceived: number;
          premiumPaid: number;
          fees: number;
          netPremium: number;
          nrop: number | null;
          openedAt: string | null;
          closedAt: string | null;
          description: string;
        }

        const optionTrades: OptionTradeDetail[] = [];

        for (const inst of u.strategyInstances) {
          let premiumReceived = 0;
          let premiumPaid = 0;
          let fees = 0;
          let openedAt: string | null = null;
          let closedAt: string | null = null;

          for (const entry of inst.ledgerEntries) {
            const amt = parseFloat(entry.amount.toString());
            if (entry.type === "PREMIUM_CREDIT") {
              premiumReceived += amt;
              if (!openedAt) openedAt = entry.occurredAt.toISOString();
            } else if (entry.type === "PREMIUM_DEBIT") {
              premiumPaid += amt;
              closedAt = entry.occurredAt.toISOString();
            } else if (entry.type === "FEE") {
              fees += amt;
            }
          }

          const netPremium = premiumReceived - premiumPaid - fees;
          const nrop = inst.realizedOptionProfit !== null
            ? parseFloat(inst.realizedOptionProfit.toString())
            : null;

          const instQty = inst.quantity ? parseFloat(inst.quantity.toString()) : 1;
          const instStrike = inst.strike ? parseFloat(inst.strike.toString()) : null;

          optionTrades.push({
            id: inst.id,
            callPut: inst.callPut ?? "CALL",
            strike: instStrike,
            quantity: instQty,
            status: inst.status,
            premiumReceived: parseFloat(premiumReceived.toFixed(2)),
            premiumPaid: parseFloat(premiumPaid.toFixed(2)),
            fees: parseFloat(fees.toFixed(2)),
            netPremium: parseFloat(netPremium.toFixed(2)),
            nrop,
            openedAt,
            closedAt: inst.finalizedAt?.toISOString() ?? closedAt,
            description: inst.ledgerEntries[0]?.description ?? `${inst.optionAction} ${instQty}x ${u.symbol} $${instStrike ?? ""} ${inst.callPut}`,
          });

          if (inst.status === "FINALIZED" && inst.realizedOptionProfit !== null) {
            const profit = parseFloat(inst.realizedOptionProfit.toString());
            realizedOptionPnl += profit;

            // YTD: finalized this calendar year
            if (inst.finalizedAt && inst.finalizedAt >= yearStart) {
              realizedOptionPnlYtd += profit;
            }
          } else if (inst.status === "OPEN") {
            openOptionCount++;
            openOptionPremium += netPremium;
          }
        }

        // ── Stock trades + realized stock P/L ───────────────────
        interface StockTradeDetail {
          id: string;
          action: "BUY" | "SELL";
          quantity: number;
          entryPrice: number | null;
          exitPrice: number | null;
          entryDateTime: string | null;
          exitDateTime: string | null;
          realizedPnl: number | null;
          description: string;
        }

        const stockTrades: StockTradeDetail[] = [];
        let realizedStockPnl = 0;
        let realizedStockPnlYtd = 0;

        for (const jt of u.journalTrades ?? []) {
          const qty = jt.quantity ? parseFloat(jt.quantity.toString()) : 0;
          const entryPrice = jt.entryPrice ? parseFloat(jt.entryPrice.toString()) : null;
          const exitPrice = jt.exitPrice ? parseFloat(jt.exitPrice.toString()) : null;
          const isLong = jt.longShort === "LONG";
          const isClosed = exitPrice !== null && entryPrice !== null && qty > 0;

          // Only closed trades contribute to realized P/L and appear as statement line items
          if (!isClosed) continue;

          const realizedPnl = isLong
            ? (exitPrice - entryPrice) * qty
            : (entryPrice - exitPrice) * qty;
          realizedStockPnl += realizedPnl;
          const exitDt = jt.exitDateTime ?? jt.updatedAt;
          if (exitDt && new Date(exitDt) >= yearStart) {
            realizedStockPnlYtd += realizedPnl;
          }

          const desc = jt.thesisNotes ?? (isLong
            ? `Sold ${qty} ${u.symbol} @ $${exitPrice} (bought @ $${entryPrice})`
            : `Covered short ${qty} ${u.symbol} @ $${exitPrice}`);

          stockTrades.push({
            id: jt.id,
            action: "SELL",
            quantity: qty,
            entryPrice,
            exitPrice,
            entryDateTime: jt.entryDateTime?.toISOString() ?? null,
            exitDateTime: jt.exitDateTime?.toISOString() ?? null,
            realizedPnl,
            description: desc,
          });
        }

        // ── Market value & unrealized P/L ───────────────────────
        const currentPrice = u.currentPrice
          ? parseFloat(u.currentPrice.toString())
          : null;
        const marketValue =
          currentPrice !== null && currentShares > 0
            ? currentPrice * currentShares
            : null;
        const unrealizedStockPnl =
          marketValue !== null ? marketValue - currentAdjustedCostBasis : null;
        const unrealizedStockPnlPct =
          unrealizedStockPnl !== null && currentAdjustedCostBasis > 0
            ? (unrealizedStockPnl / currentAdjustedCostBasis) * 100
            : null;

        // ── Totals ──────────────────────────────────────────────
        // P/L Open = unrealized stock P/L on current position
        const plOpen = unrealizedStockPnl;

        // Total realized = option P/L + stock P/L
        const totalRealizedPnl = realizedOptionPnl + realizedStockPnl;

        // Close value = market value of current stock position
        const closeValue = marketValue;

        // Total P/L = realized option + unrealized stock + open option premium
        const totalPnl =
          unrealizedStockPnl !== null
            ? totalRealizedPnl + unrealizedStockPnl
            : currentShares === 0
              ? totalRealizedPnl
              : null;

        return {
          symbol: u.symbol,
          underlyingId: u.id,

          // Stock history
          totalSharesBought: round(totalSharesBought),
          totalOriginalCost: round(totalOriginalCost),
          totalPremiumReduction: round(totalPremiumReduction),
          soldSharesCostBasis: round(soldSharesCostBasis),

          // Current stock position
          currentShares: round(currentShares),
          currentOriginalCostBasis: round(currentOriginalCostBasis),
          currentPremiumReduction: round(currentPremiumReduction),
          currentAdjustedCostBasis: round(currentAdjustedCostBasis),
          originalCostPerShare: round(originalCostPerShare),
          adjustedCostPerShare: round(adjustedCostPerShare),
          currentPrice,
          marketValue: marketValue !== null ? round(marketValue) : null,

          // P/L
          plOpen: plOpen !== null ? round(plOpen) : null,
          plOpenPct: unrealizedStockPnlPct !== null ? round(unrealizedStockPnlPct) : null,
          realizedOptionPnl: round(realizedOptionPnl),
          realizedOptionPnlYtd: round(realizedOptionPnlYtd),
          realizedStockPnl: round(realizedStockPnl),
          realizedStockPnlYtd: round(realizedStockPnlYtd),
          totalRealizedPnl: round(totalRealizedPnl),
          totalPnl: totalPnl !== null ? round(totalPnl) : null,

          // Options summary
          openOptionCount,
          openOptionPremium: round(openOptionPremium),

          // Detailed trades for line-item display
          optionTrades,
          stockTrades,

          // Close value
          closeValue: closeValue !== null ? round(closeValue) : null,
        };
      })
      // Sort: symbols with current positions first, then alphabetical
      .sort((a, b) => {
        if (a.currentShares > 0 && b.currentShares <= 0) return -1;
        if (a.currentShares <= 0 && b.currentShares > 0) return 1;
        return a.symbol.localeCompare(b.symbol);
      });

    // ── Overall totals ────────────────────────────────────────────
    const totals = symbols.reduce(
      (acc, s) => {
        acc.totalOriginalCost += s.totalOriginalCost;
        acc.totalPremiumReduction += s.totalPremiumReduction;
        acc.currentCostBasis += s.currentAdjustedCostBasis;
        acc.marketValue += s.marketValue ?? 0;
        acc.hasAllPrices = acc.hasAllPrices && (s.currentShares === 0 || s.marketValue !== null);
        acc.plOpen += s.plOpen ?? 0;
        acc.realizedOptionPnl += s.realizedOptionPnl;
        acc.realizedOptionPnlYtd += s.realizedOptionPnlYtd;
        acc.realizedStockPnl += s.realizedStockPnl;
        acc.realizedStockPnlYtd += s.realizedStockPnlYtd;
        acc.totalRealizedPnl += s.totalRealizedPnl;
        if (s.totalPnl !== null) acc.totalPnl += s.totalPnl;
        acc.closeValue += s.closeValue ?? 0;
        return acc;
      },
      {
        totalOriginalCost: 0,
        totalPremiumReduction: 0,
        currentCostBasis: 0,
        marketValue: 0,
        hasAllPrices: true,
        plOpen: 0,
        realizedOptionPnl: 0,
        realizedOptionPnlYtd: 0,
        realizedStockPnl: 0,
        realizedStockPnlYtd: 0,
        totalRealizedPnl: 0,
        totalPnl: 0,
        closeValue: 0,
      }
    );

    return NextResponse.json({
      symbols,
      totals: {
        ...totals,
        totalOriginalCost: round(totals.totalOriginalCost),
        totalPremiumReduction: round(totals.totalPremiumReduction),
        currentCostBasis: round(totals.currentCostBasis),
        marketValue: totals.hasAllPrices ? round(totals.marketValue) : null,
        plOpen: totals.hasAllPrices ? round(totals.plOpen) : null,
        realizedOptionPnl: round(totals.realizedOptionPnl),
        realizedOptionPnlYtd: round(totals.realizedOptionPnlYtd),
        realizedStockPnl: round(totals.realizedStockPnl),
        realizedStockPnlYtd: round(totals.realizedStockPnlYtd),
        totalRealizedPnl: round(totals.totalRealizedPnl),
        totalPnl: round(totals.totalPnl),
        closeValue: totals.hasAllPrices ? round(totals.closeValue) : null,
      },
      cashBalance: parseFloat(account.cashBalance.toString()),
      cashflowReserve: parseFloat(account.cashflowReserve.toString()),
      equities: totals.hasAllPrices ? round(totals.marketValue) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function round(n: number): number {
  return parseFloat(n.toFixed(2));
}
