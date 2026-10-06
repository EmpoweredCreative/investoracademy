import { prisma } from "@/lib/db";

export type AlignmentMetrics = {
  alignedWinRate: number;
  misalignedWinRate: number;
  alignedTradeCount: number;
  misalignedTradeCount: number;
  alignedAvgRoi: number | null;
  misalignedAvgRoi: number | null;
  emotionalDriftCount: number;
  emotionalDriftPct: number;
};

/**
 * Compute Human vs AI alignment metrics for a user over a date range.
 * Uses JournalTrades that have humanAIAlignmentAtEntry and exitPrice.
 */
export async function computeAlignmentMetrics(
  userId: string,
  fromDate: Date,
  toDate: Date
): Promise<AlignmentMetrics> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);

  const trades = await prisma.journalTrade.findMany({
    where: {
      accountId: { in: accountIds },
      entryDateTime: { gte: fromDate, lte: toDate },
      exitPrice: { not: null },
      humanAIAlignmentAtEntry: { not: null },
    },
    include: {
      strategyInstance: { include: { ledgerEntries: true } },
    },
  });

  const aligned: typeof trades = [];
  const misaligned: typeof trades = [];
  const conflict: typeof trades = [];

  for (const t of trades) {
    const alignment = t.humanAIAlignmentAtEntry != null ? Number(t.humanAIAlignmentAtEntry) : 0;
    if (alignment >= 70) aligned.push(t);
    else if (alignment < 50) conflict.push(t);
    else misaligned.push(t);
  }

  const computeRoi = (t: (typeof trades)[0]): number | null => {
    if (!t.strategyInstance?.ledgerEntries) return null;
    let nrop = 0;
    for (const e of t.strategyInstance.ledgerEntries) {
      const amt = Number(e.amount);
      if (e.type === "PREMIUM_CREDIT") nrop += amt;
      else if (e.type === "PREMIUM_DEBIT" || e.type === "FEE") nrop -= amt;
    }
    return nrop;
  };

  const rois = (list: typeof trades) => list.map(computeRoi).filter((r): r is number => r != null);
  const winners = (list: typeof trades) => list.filter((t) => (computeRoi(t) ?? 0) > 0).length;

  const alignedRois = rois(aligned);
  const misalignedRois = rois([...misaligned, ...conflict]);

  return {
    alignedWinRate: aligned.length > 0 ? winners(aligned) / aligned.length : 0,
    misalignedWinRate: misaligned.length + conflict.length > 0 ? winners([...misaligned, ...conflict]) / (misaligned.length + conflict.length) : 0,
    alignedTradeCount: aligned.length,
    misalignedTradeCount: misaligned.length + conflict.length,
    alignedAvgRoi: alignedRois.length > 0 ? alignedRois.reduce((a, b) => a + b, 0) / alignedRois.length : null,
    misalignedAvgRoi: misalignedRois.length > 0 ? misalignedRois.reduce((a, b) => a + b, 0) / misalignedRois.length : null,
    emotionalDriftCount: conflict.length,
    emotionalDriftPct: trades.length > 0 ? (conflict.length / trades.length) * 100 : 0,
  };
}
