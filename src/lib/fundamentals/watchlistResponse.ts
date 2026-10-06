import { scoreAllRatios, countByStatus } from "@/lib/fundamentals/ratioBands";
import { snapshotToMetrics } from "@/lib/fundamentals/yahooFundamentals";
import type { FundamentalSnapshot, FundamentalWatchlistItem } from "@prisma/client";

export function buildWatchlistEntry(
  item: FundamentalWatchlistItem,
  snapshot: FundamentalSnapshot | null
) {
  const metrics = snapshotToMetrics(snapshot);
  const ratios = scoreAllRatios(metrics);
  const ryg = countByStatus(ratios);

  return {
    id: item.id,
    symbol: item.symbol,
    status: item.status,
    source: item.source,
    yahooFetchStatus: item.yahooFetchStatus,
    yahooFetchError: item.yahooFetchError,
    yahooFetchedAt: item.yahooFetchedAt?.toISOString() ?? null,
    importedAt: item.importedAt.toISOString(),
    ryg,
    price: snapshot?.price ? parseFloat(snapshot.price.toString()) : null,
  };
}
