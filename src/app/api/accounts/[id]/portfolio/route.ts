import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { backfillJournalOptionFinancials } from "@/lib/services/manualEntry";
import { z } from "zod";

/**
 * GET /api/accounts/:id/portfolio
 * Returns aggregated portfolio positions (stock lots grouped by symbol).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Auto-backfill: create financial records for any journal option trades
    // that are missing StrategyInstance / LedgerEntry / basis reduction.
    await backfillJournalOptionFinancials(accountId);

    // Get all underlyings for this account that have remaining stock lots
    const underlyings = await prisma.underlying.findMany({
      where: { accountId },
      include: {
        stockLots: {
          where: { remaining: { not: 0 } },
          orderBy: { acquiredAt: "asc" },
        },
        journalTrades: {
          where: { strategyInstanceId: null },
        },
        strategyInstances: {
          where: { instrumentType: "OPTION" },
          include: { ledgerEntries: true, journalTrade: true },
        },
      },
    });

    // Backfill: create journal trades for stock lots that don't have one yet
    const underlyingsWithLots = underlyings.filter((u) => u.stockLots.length > 0);
    for (const u of underlyingsWithLots) {
      if (u.journalTrades.length === 0 && u.stockLots.length > 0) {
        const lot = u.stockLots[0];
        const quantity = parseFloat(lot.quantity.toString());
        const costBasis = parseFloat(lot.costBasis.toString());
        const absQuantity = Math.abs(quantity);
        const pricePerShare = absQuantity > 0 ? Math.abs(costBasis) / absQuantity : 0;
        const isShortLot = quantity < 0;
        await prisma.journalTrade.create({
          data: {
            accountId,
            underlyingId: u.id,
            longShort: isShortLot ? "SHORT" : "LONG",
            quantity: absQuantity,
            entryPrice: pricePerShare,
            entryDateTime: lot.acquiredAt,
            thesisNotes: isShortLot
              ? `SELL SHORT ${absQuantity} ${u.symbol} @ $${pricePerShare.toFixed(2)}`
              : `BUY ${absQuantity} ${u.symbol} @ $${pricePerShare.toFixed(2)}`,
          },
        });
      }
    }

    const positions = underlyings
      .filter((u) => {
        const hasStock = u.stockLots.length > 0;
        const hasOptions = (u.strategyInstances ?? []).length > 0;
        return hasStock || hasOptions;
      })
      .map((u) => {
        let totalShares = 0;
        let totalOriginalCostBasis = 0;
        let totalPremiumReduction = 0;

        for (const lot of u.stockLots) {
          const remaining = parseFloat(lot.remaining.toString());
          const costBasis = parseFloat(lot.costBasis.toString());
          const quantity = parseFloat(lot.quantity.toString());
          const premRed = lot.premiumReduction ? parseFloat(lot.premiumReduction.toString()) : 0;
          const absQuantity = Math.abs(quantity);
          const costPerShare = absQuantity > 0 ? costBasis / quantity : 0;
          const reductionPerShare = absQuantity > 0 ? premRed / absQuantity : 0;
          totalShares += remaining;
          totalOriginalCostBasis += costPerShare * remaining;
          totalPremiumReduction += reductionPerShare * Math.abs(remaining);
        }

        const isShort = totalShares < 0;

        // Adjusted cost basis = original - premium reductions
        const totalCostBasis = totalOriginalCostBasis - (isShort ? 0 : totalPremiumReduction);
        const absShares = Math.abs(totalShares);
        const avgCostPerShare = absShares > 0 ? Math.abs(totalOriginalCostBasis) / absShares : 0;
        const adjustedCostPerShare = absShares > 0 ? Math.abs(totalCostBasis) / absShares : 0;
        const currentPrice = u.currentPrice ? parseFloat(u.currentPrice.toString()) : null;
        const marketValue = currentPrice !== null ? currentPrice * totalShares : null;

        // P/L calculations — for shorts the sign is flipped:
        // Short P/L = (entry price - current price) * abs(shares)
        let unrealizedPnl: number | null = null;
        let unrealizedPnlPct: number | null = null;
        let originalPnl: number | null = null;
        let originalPnlPct: number | null = null;

        if (currentPrice !== null) {
          if (isShort) {
            // Short position: profit when price falls below entry
            originalPnl = (avgCostPerShare - currentPrice) * absShares;
            originalPnlPct = avgCostPerShare > 0
              ? (originalPnl / (avgCostPerShare * absShares)) * 100
              : null;
            unrealizedPnl = originalPnl; // no premium reduction on shorts
            unrealizedPnlPct = originalPnlPct;
          } else {
            // Long position: profit when price rises above entry
            unrealizedPnl = marketValue! - totalCostBasis;
            unrealizedPnlPct = totalCostBasis > 0
              ? (unrealizedPnl / totalCostBasis) * 100
              : null;
            originalPnl = marketValue! - totalOriginalCostBasis;
            originalPnlPct = totalOriginalCostBasis > 0
              ? (originalPnl / totalOriginalCostBasis) * 100
              : null;
          }
        }

        // Build option trade details
        const optionTrades = (u.strategyInstances ?? []).map((inst) => {
          let premiumReceived = 0;
          let premiumPaid = 0;
          let fees = 0;

          for (const entry of inst.ledgerEntries) {
            const amt = parseFloat(entry.amount.toString());
            if (entry.type === "PREMIUM_CREDIT") premiumReceived += amt;
            else if (entry.type === "PREMIUM_DEBIT") premiumPaid += amt;
            else if (entry.type === "FEE") fees += amt;
          }

          const instQty = inst.quantity ? parseFloat(inst.quantity.toString()) : 1;
          const instStrike = inst.strike ? parseFloat(inst.strike.toString()) : null;
          const nrop = inst.realizedOptionProfit !== null
            ? parseFloat(inst.realizedOptionProfit!.toString())
            : null;

          // Include journal trade details for inline editing
          const jt = inst.journalTrade;
          const journalTradeId = jt?.id ?? null;
          const entryPrice = jt?.entryPrice ? parseFloat(jt.entryPrice.toString()) : null;
          const exitPrice = jt?.exitPrice ? parseFloat(jt.exitPrice.toString()) : null;
          const entryDateTime = jt?.entryDateTime?.toISOString() ?? null;
          const exitDateTime = jt?.exitDateTime?.toISOString() ?? null;

          return {
            id: inst.id,
            journalTradeId,
            callPut: inst.callPut ?? "CALL",
            strike: instStrike,
            quantity: instQty,
            status: inst.status,
            premiumReceived: parseFloat(premiumReceived.toFixed(2)),
            premiumPaid: parseFloat(premiumPaid.toFixed(2)),
            fees: parseFloat(fees.toFixed(2)),
            netPremium: parseFloat((premiumReceived - premiumPaid - fees).toFixed(2)),
            nrop,
            entryPrice,
            exitPrice,
            entryDateTime,
            exitDateTime,
          };
        });

        return {
          underlyingId: u.id,
          symbol: u.symbol,
          premiumPolicy: u.premiumPolicy,
          shares: parseFloat(totalShares.toFixed(4)),
          avgCostPerShare: parseFloat(avgCostPerShare.toFixed(4)),
          adjustedCostPerShare: parseFloat(adjustedCostPerShare.toFixed(4)),
          totalCostBasis: parseFloat(totalCostBasis.toFixed(2)),
          originalCostBasis: parseFloat(totalOriginalCostBasis.toFixed(2)),
          totalPremiumReduction: parseFloat(totalPremiumReduction.toFixed(2)),
          currentPrice,
          marketValue: marketValue !== null ? parseFloat(marketValue.toFixed(2)) : null,
          unrealizedPnl: unrealizedPnl !== null ? parseFloat(unrealizedPnl.toFixed(2)) : null,
          unrealizedPnlPct: unrealizedPnlPct !== null ? parseFloat(unrealizedPnlPct.toFixed(2)) : null,
          originalPnl: originalPnl !== null ? parseFloat(originalPnl.toFixed(2)) : null,
          originalPnlPct: originalPnlPct !== null ? parseFloat(originalPnlPct.toFixed(2)) : null,
          lotCount: u.stockLots.length,
          optionTrades,
        };
      })
      .sort((a, b) => b.totalCostBasis - a.totalCostBasis); // Largest position first

    // Summary totals
    const totalCostBasis = positions.reduce((sum, p) => sum + p.totalCostBasis, 0);
    const totalOriginalCostBasis = positions.reduce((sum, p) => sum + p.originalCostBasis, 0);
    const totalMarketValue = positions.every((p) => p.marketValue !== null)
      ? positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0)
      : null;

    return NextResponse.json({
      positions,
      summary: {
        positionCount: positions.length,
        totalCostBasis: parseFloat(totalCostBasis.toFixed(2)),
        totalOriginalCostBasis: parseFloat(totalOriginalCostBasis.toFixed(2)),
        totalMarketValue: totalMarketValue !== null ? parseFloat(totalMarketValue.toFixed(2)) : null,
        cashBalance: parseFloat(account.cashBalance.toString()),
        cashflowReserve: parseFloat(account.cashflowReserve.toString()),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const updateUnderlyingSchema = z.object({
  underlyingId: z.string().min(1),
  currentPrice: z.number().positive().optional(),
  premiumPolicy: z.enum(["CASHFLOW", "BASIS_REDUCTION", "REINVEST_ON_CLOSE"]).nullable().optional(),
});

/**
 * DELETE /api/accounts/:id/portfolio?underlyingId=xxx
 * Remove a stock position by deleting all its stock lots and related ledger entries.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const underlyingId = searchParams.get("underlyingId");
    if (!underlyingId) {
      return NextResponse.json({ error: "underlyingId is required" }, { status: 400 });
    }

    const underlying = await prisma.underlying.findFirst({
      where: { id: underlyingId, accountId },
    });
    if (!underlying) {
      return NextResponse.json({ error: "Underlying not found" }, { status: 404 });
    }

    // Delete stock lots, related journal trades, and ledger entries for this underlying
    await prisma.$transaction(async (tx) => {
      // Delete stock lots
      await tx.stockLot.deleteMany({
        where: { accountId, underlyingId },
      });

      // Delete journal trades linked to this underlying that have no strategy instance
      // (i.e. auto-created from stock entries)
      await tx.journalTrade.deleteMany({
        where: { accountId, underlyingId, strategyInstanceId: null },
      });
    });

    return NextResponse.json({ success: true, symbol: underlying.symbol });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/accounts/:id/portfolio
 * Update the current price for an underlying symbol.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const body = await req.json();
    const data = updateUnderlyingSchema.parse(body);

    const underlying = await prisma.underlying.findFirst({
      where: { id: data.underlyingId, accountId },
    });
    if (!underlying) {
      return NextResponse.json({ error: "Underlying not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (data.currentPrice !== undefined) updateData.currentPrice = data.currentPrice;
    if (data.premiumPolicy !== undefined) updateData.premiumPolicy = data.premiumPolicy;

    const updated = await prisma.underlying.update({
      where: { id: data.underlyingId },
      data: updateData,
    });

    return NextResponse.json({
      underlyingId: updated.id,
      symbol: updated.symbol,
      currentPrice: updated.currentPrice ? parseFloat(updated.currentPrice.toString()) : null,
      premiumPolicy: updated.premiumPolicy,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
