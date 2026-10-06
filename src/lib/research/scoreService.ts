import { Prisma, type CompanyScore, type FundamentalSnapshot } from "@prisma/client";
import { prisma } from "@/lib/db";
import { evaluateCriteria, metricValuesFromSnapshot, type CriteriaProfile, type MetricValues } from "@/lib/fundamentals/criteria";
import { statementFx } from "@/lib/marketdata/fx";
import type { ScreenRow } from "@/lib/finviz/client";
import type { FinancialKind } from "@/lib/sec/xbrl";
import { getCompanyFinancials } from "./company";
import { getOwnershipAndMomentum, getPriceTrend } from "./marketContext";
import { freshSnapshot, type CompanyReportBody } from "./report";
import { resolveLens } from "./strategies";
import { computeScore, weightsForLens, type PillarWeights, type ScoreResult } from "./score";

const FRESH_MS = 24 * 3600_000;

export interface ScoreView extends ScoreResult {
  lensKey: string;
  lensName: string;
  computedAt: string;
}

const view = (row: CompanyScore, lensName: string): ScoreView => ({
  ...(row.result as unknown as ScoreResult),
  lensKey: row.lensKey,
  lensName,
  computedAt: row.computedAt.toISOString(),
});

async function latestMos(accountId: string, symbol: string) {
  const m = await prisma.dcfModel.findFirst({ where: { accountId, symbol }, orderBy: { createdAt: "desc" }, select: { outputs: true, createdAt: true } });
  const o = m?.outputs as { marginOfSafety?: number | null; terminalShare?: number | null } | undefined;
  return m ? { marginOfSafety: o?.marginOfSafety ?? null, terminalShare: o?.terminalShare ?? null, at: m.createdAt } : null;
}

/** Calculate the full score for one stock and lens, and save it. */
export async function computeCompanyScore(opts: { userId: string; accountId: string; symbol: string; lensKey: string | null }): Promise<ScoreView> {
  const { userId, accountId, symbol } = opts;
  const lens = await resolveLens(userId, opts.lensKey);
  const weights = weightsForLens(lens.key, lens.baseLens);

  const [snapshot, dcf, financials, report] = await Promise.all([
    freshSnapshot(accountId, symbol),
    latestMos(accountId, symbol),
    getCompanyFinancials(accountId, symbol).catch(() => null),
    // The lens's own report, else the latest report under any lens (moat and risks don't depend on the lens).
    prisma.companyReport
      .findFirst({ where: { accountId, symbol, lensKey: lens.key }, orderBy: { createdAt: "desc" } })
      .then((r) => r ?? prisma.companyReport.findFirst({ where: { accountId, symbol }, orderBy: { createdAt: "desc" } })),
  ]);

  const fx = snapshot ? await statementFx(snapshot.raw) : 1;
  const metrics = snapshot ? metricValuesFromSnapshot(snapshot, { marginOfSafety: dcf?.marginOfSafety ?? null, fx }) : {};
  const criteria = snapshot ? evaluateCriteria(metrics, lens.criteria) : null;

  let momentum: Parameters<typeof computeScore>[0]["momentum"] = null;
  if (weights.momentum > 0) {
    const [trend, own] = await Promise.all([getPriceTrend(symbol).catch(() => null), getOwnershipAndMomentum(symbol).catch(() => null)]);
    const year = own?.momentum.periods.find((p) => p.period === "0y");
    momentum = {
      aboveSma200: trend?.aboveSma200 ?? null,
      change12mPct: trend?.change12mPct ?? null,
      revisionsUp30d: year?.revisionsUp30d ?? null,
      revisionsDown30d: year?.revisionsDown30d ?? null,
    };
  }

  const body = report?.report as unknown as CompanyReportBody | undefined;
  const result = computeScore({
    weights,
    financialKind: financials?.kind ?? null,
    metrics,
    criteria,
    years: financials?.years ?? null,
    dcf: dcf ? { marginOfSafety: dcf.marginOfSafety, terminalShare: dcf.terminalShare } : null,
    report: body ? { moat: body.moat.rating, risks: body.greatestRisks.map((r) => ({ severity: r.severity, trend: r.trend })) } : null,
    momentum,
  });

  const row = await prisma.companyScore.upsert({
    where: { accountId_symbol_lensKey: { accountId, symbol, lensKey: lens.key } },
    create: { accountId, symbol, lensKey: lens.key, score: result.score, confidence: result.confidence, result: result as unknown as Prisma.InputJsonValue },
    update: { score: result.score, confidence: result.confidence, result: result as unknown as Prisma.InputJsonValue, computedAt: new Date() },
  });
  return view(row, lens.name);
}

/**
 * The saved score if it's still current (under a day old and nothing it depends on
 * has changed since), otherwise recalculate.
 */
export async function getCompanyScore(opts: { userId: string; accountId: string; symbol: string; lensKey: string | null; force?: boolean }) {
  const lens = await resolveLens(opts.userId, opts.lensKey);
  if (!opts.force) {
    const row = await prisma.companyScore.findUnique({
      where: { accountId_symbol_lensKey: { accountId: opts.accountId, symbol: opts.symbol, lensKey: lens.key } },
    });
    if (row && Date.now() - row.computedAt.getTime() < FRESH_MS) {
      const since = { gt: row.computedAt };
      const [report, dcf] = await Promise.all([
        prisma.companyReport.count({ where: { accountId: opts.accountId, symbol: opts.symbol, createdAt: since } }),
        prisma.dcfModel.count({ where: { accountId: opts.accountId, symbol: opts.symbol, createdAt: since } }),
      ]);
      if (!report && !dcf) return view(row, lens.name);
    }
  }
  return computeCompanyScore({ ...opts, lensKey: lens.key });
}

// ── Quick scores (no SEC history, report or DCF) ─────────────────────────────

const FINANCIAL_INDUSTRY = /insurance|bank|mortgage finance|credit services/i;

/** From a stored snapshot alone, for watchlist rows without a full score. */
export function quickScoreFromSnapshot(
  snapshot: FundamentalSnapshot,
  profile: CriteriaProfile,
  weights: PillarWeights,
  fx: number | null
): ScoreResult {
  const metrics = metricValuesFromSnapshot(snapshot, { fx });
  return computeScore({
    weights,
    financialKind: null,
    metrics,
    criteria: evaluateCriteria(metrics, profile),
    years: null,
    dcf: null,
    report: null,
    momentum: null,
    quick: true,
  });
}

/** From a Finviz screener row, for ranking screen results. */
export function quickScoreFromScreen(row: ScreenRow, profile: CriteriaProfile, weights: PillarWeights): ScoreResult {
  const m = row.metrics;
  const metrics: MetricValues = {
    trailingPe: m.pe ?? null,
    forwardPe: m.forwardPe ?? null,
    pegRatio: m.peg ?? null,
    priceToSales: m.ps ?? null,
    priceToBook: m.pb ?? null,
    fcfYield: m.pfcf && m.pfcf > 0 ? 100 / m.pfcf : null,
    debtToEquity: m.debtToEquity ?? null,
    returnOnEquity: m.roe ?? null,
    profitMargin: m.profitMargin ?? null,
  };
  const financialKind: FinancialKind = row.industry && FINANCIAL_INDUSTRY.test(row.industry) ? (/bank/i.test(row.industry) ? "bank" : "insurer") : null;
  const momentum =
    weights.momentum > 0
      ? {
          aboveSma200: m.vsSma200 == null ? null : m.vsSma200 > 0,
          change12mPct: m.perfYear ?? null,
          revisionsUp30d: null,
          revisionsDown30d: null,
        }
      : null;
  return computeScore({
    weights,
    financialKind,
    metrics,
    criteria: evaluateCriteria(metrics, profile),
    years: null,
    dcf: null,
    report: null,
    momentum,
    extra: { epsGrowth5y: m.epsGrowth5y, salesGrowth5y: m.salesGrowth5y, roic: m.roic, operatingMargin: m.operatingMargin },
    quick: true,
  });
}
