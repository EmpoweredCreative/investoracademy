import type { FundamentalSnapshot, FundamentalWatchlistItem } from "@prisma/client";
import { DEFAULT_PROFILE, type CriteriaProfile } from "./criteria";
import { evaluateSnapshot } from "./research";

export function buildWatchlistEntry(
  item: FundamentalWatchlistItem,
  snapshot: FundamentalSnapshot | null,
  profile: CriteriaProfile = DEFAULT_PROFILE,
  fx: number | null = 1
) {
  const { evaluation, ryg } = evaluateSnapshot(snapshot, profile, null, fx);

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
    score: evaluation.score,
    verdict: evaluation.verdict,
    price: snapshot?.price ? parseFloat(snapshot.price.toString()) : null,
  };
}
