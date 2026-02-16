import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { yahooMarketDataProvider } from "@/lib/marketdata/yahooProvider";

/**
 * POST /api/accounts/:id/portfolio/refresh-prices
 * Fetches current prices from Yahoo Finance for all portfolio symbols (stock and option positions)
 * and persists them to Underlying.currentPrice so they are still there on the next visit.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const underlyings = await prisma.underlying.findMany({
      where: { accountId },
      include: {
        stockLots: {
          where: { remaining: { not: 0 } },
        },
        strategyInstances: {
          where: { instrumentType: "OPTION" },
          select: { id: true },
        },
      },
    });

    // Refresh prices for every symbol that appears in the portfolio (has stock lots or options)
    const inPortfolio = underlyings.filter((u) => {
      const hasStock = u.stockLots.length > 0;
      const hasOptions = (u.strategyInstances?.length ?? 0) > 0;
      return hasStock || hasOptions;
    });

    if (inPortfolio.length === 0) {
      return NextResponse.json({
        updated: 0,
        message: "No positions to refresh.",
      });
    }

    const results: { symbol: string; underlyingId: string; price: number | null; error?: string }[] = [];

    for (const u of inPortfolio) {
      try {
        const quote = await yahooMarketDataProvider.getQuote(u.symbol);
        const price = quote.last;
        if (price > 0) {
          await prisma.underlying.update({
            where: { id: u.id },
            data: { currentPrice: price },
          });
          results.push({ symbol: u.symbol, underlyingId: u.id, price });
        } else {
          results.push({
            symbol: u.symbol,
            underlyingId: u.id,
            price: null,
            error: "No valid price returned",
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        results.push({
          symbol: u.symbol,
          underlyingId: u.id,
          price: null,
          error: message,
        });
      }
    }

    const updated = results.filter((r) => r.price !== null).length;
    return NextResponse.json({
      updated,
      total: inPortfolio.length,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
