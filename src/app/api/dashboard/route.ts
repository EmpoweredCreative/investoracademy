import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { loadFoundation, netWorthHistory } from "@/lib/foundation/store";
import { getLiveQuotes } from "@/lib/marketdata/liveQuotes";
import { getForwardDividends } from "@/lib/marketdata/dividends";
import { getEconomicCalendar, weekStartET } from "@/lib/marketdata/econCalendar";
import { ACCOUNT_SNAPSHOT_INCLUDE, buildAccountSnapshot, holdingSymbols } from "@/lib/services/accountSnapshot";
import { getRoutine } from "@/lib/services/marketRoutine";
import { attentionItems, type HoldingSignal } from "@/lib/dashboard/attention";
import { investingYear, type LotRow } from "@/lib/dashboard/investing";
import { ROUTINE_STEP_KEYS } from "@/lib/routineSteps";
import { capitalItems, type OptionPosition, type StockPosition } from "@/lib/dashboard/capital";
import { scoreboard } from "@/lib/dashboard/scoreboard";

export const dynamic = "force-dynamic";

const MAIN_INDICES = ["SPY", "QQQ", "DIA", "IWM"];

/** GET ?date=YYYY-MM-DD (the person's local date) — everything the dashboard shows. */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const param = req.nextUrl.searchParams.get("date");
    const foundationData = await loadFoundation(userId);
    const today = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : foundationData.today;
    const year = Number(today.slice(0, 4));

    // ── Investment accounts (live, valued with live quotes) ──
    const accounts = await prisma.account.findMany({
      where: { userId, archivedAt: null },
      include: ACCOUNT_SNAPSHOT_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    const quotes = await getLiveQuotes(accounts.flatMap(holdingSymbols));
    const snapshots = accounts.map((a) => ({ account: a, snap: buildAccountSnapshot(a, quotes) }));
    const live = snapshots.filter((s) => s.account.mode !== "SIMULATED");
    const invested = live.reduce((s, x) => s + x.snap.netLiq, 0);
    const dayChange = live.reduce((s, x) => s + x.snap.dayChange, 0);
    const holdings: HoldingSignal[] = live.flatMap((x) =>
      x.snap.holdings.map((h) => ({
        symbol: h.symbol,
        accountId: x.account.id,
        unrealizedPct: h.unrealized != null && h.costBasis > 0 ? (h.unrealized / h.costBasis) * 100 : null,
        dayPct: h.changePct,
      }))
    );

    // ── Investing year (live accounts) ──
    const liveIds = live.map((x) => x.account.id);
    const from = new Date(Date.UTC(year - 1, 9, 1)); // Oct 1 last year: 3 months of run-rate before January
    const [ledgerRows, lotRows] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { accountId: { in: liveIds }, occurredAt: { gte: from } },
        select: { accountId: true, type: true, amount: true, occurredAt: true, description: true, strategyInstance: { select: { strategyType: true } } },
      }),
      prisma.stockLot.findMany({
        where: { accountId: { in: liveIds }, acquiredAt: { gte: new Date(Date.UTC(year, 0, 1)) } },
        select: { accountId: true, acquiredAt: true, quantity: true, costBasis: true, fundedBy: true, premiumFundedQty: true, underlying: { select: { symbol: true } } },
      }),
    ]);
    const shares = new Map<string, number>();
    for (const x of live) for (const h of x.snap.holdings) if (h.shares > 0) shares.set(h.symbol, (shares.get(h.symbol) ?? 0) + h.shares);
    const rates = await getForwardDividends([...shares.keys()]);
    const investing = investingYear({
      year,
      today,
      ledger: ledgerRows.map((e) => ({
        accountId: e.accountId,
        type: e.type,
        amount: e.amount.toNumber(),
        occurredAt: e.occurredAt.toISOString(),
        strategyType: e.strategyInstance?.strategyType ?? null,
        description: e.description,
      })),
      lots: lotRows.map<LotRow>((l) => ({
        accountId: l.accountId,
        symbol: l.underlying.symbol,
        acquiredAt: l.acquiredAt.toISOString(),
        quantity: l.quantity.toNumber(),
        costBasis: l.costBasis.toNumber(),
        fundedBy: l.fundedBy,
        premiumFundedQty: l.premiumFundedQty.toNumber(),
      })),
      dividendHoldings: [...shares.entries()].map(([symbol, n]) => ({ symbol, shares: n, annualDividend: rates[symbol] ?? null })),
    });

    // ── Capital used (buying power) for ROI ──
    const [instances, heldLots] = await Promise.all([
      prisma.strategyInstance.findMany({
        where: {
          accountId: { in: liveIds },
          instrumentType: "OPTION",
          OR: [{ status: "OPEN" }, { finalizedAt: { gte: from } }, { updatedAt: { gte: from } }],
        },
        select: {
          id: true,
          strategyGroupId: true,
          strategyType: true,
          callPut: true,
          longShort: true,
          strike: true,
          quantity: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          finalizedAt: true,
          buyingPowerEffect: true,
          ledgerEntries: { orderBy: { occurredAt: "asc" }, take: 1, select: { type: true, amount: true, occurredAt: true } },
        },
      }),
      prisma.stockLot.findMany({
        where: { accountId: { in: liveIds }, remaining: { gt: 0 } },
        select: { acquiredAt: true, remaining: true, quantity: true, costBasis: true, underlying: { select: { marginRequirement: true, stockLots: { where: { remaining: { gt: 0 } }, select: { remaining: true } } } } },
      }),
    ]);
    const options: OptionPosition[] = instances.map((i) => {
      const first = i.ledgerEntries[0];
      return {
        id: i.id,
        groupId: i.strategyGroupId,
        strategyType: i.strategyType,
        callPut: i.callPut,
        longShort: i.longShort,
        strike: i.strike?.toNumber() ?? null,
        quantity: i.quantity.toNumber(),
        openedAt: (first?.occurredAt ?? i.createdAt).toISOString(),
        closedAt: i.status === "OPEN" ? null : (i.finalizedAt ?? i.updatedAt).toISOString(),
        bpe: i.buyingPowerEffect?.toNumber() ?? null,
        premium: first ? (first.type === "PREMIUM_CREDIT" ? 1 : first.type === "PREMIUM_DEBIT" ? -1 : 0) * first.amount.toNumber() : 0,
      };
    });
    const stocks: StockPosition[] = heldLots.map((l) => {
      const remaining = l.remaining.toNumber();
      const totalShares = l.underlying.stockLots.reduce((t, x) => t + x.remaining.toNumber(), 0);
      const req = l.underlying.marginRequirement?.toNumber();
      return {
        openedAt: l.acquiredAt.toISOString(),
        shares: remaining,
        cost: (l.costBasis.toNumber() * remaining) / (l.quantity.toNumber() || 1),
        marginRequirement: req != null && totalShares > 0 ? (req * remaining) / totalShares : null,
      };
    });

    // ── Routine, events ──
    const [routine, environment, calendar] = await Promise.all([
      getRoutine(userId, today),
      prisma.marketEnvironment.findUnique({ where: { userId_date: { userId, date: new Date(today + "T00:00:00.000Z") } } }),
      getEconomicCalendar(weekStartET(), 14).catch(() => []),
    ]);
    const biases = (routine.routine?.symbolBiases ?? []).filter((b) => MAIN_INDICES.includes(b.symbol) && b.bias);
    const bulls = biases.filter((b) => b.bias === "BULLISH").length;
    const bears = biases.filter((b) => b.bias === "BEARISH").length;
    const bias = biases.length ? (bulls > bears ? "BULLISH" : bears > bulls ? "BEARISH" : "NEUTRAL") : null;
    const upcoming = calendar.filter((e) => e.date >= today);

    // ── Foundation ──
    const s = foundationData.summary;
    const history = await netWorthHistory(userId, foundationData.today, { assets: s.assets.total, liabilities: s.debt.total, liquid: s.assets.liquid });
    const foundationReady = foundationData.profile.type != null;

    return NextResponse.json({
      today,
      foundation: {
        ready: foundationReady,
        profileType: foundationData.profile.type,
        summary: s,
        history,
        assets: [
          ...foundationData.assets.map((a) => ({ type: a.type, value: a.value })),
          ...foundationData.tradingAssets.map((t) => ({ type: "INVESTMENT", value: t.value })),
        ],
        businessNet: foundationData.business?.pnl.monthsWithData ? foundationData.business.pnl.average.recurringNet : null,
      },
      investing: {
        invested,
        dayChange,
        dayChangePct: invested - dayChange > 0 ? (dayChange / (invested - dayChange)) * 100 : 0,
        accounts: snapshots.map(({ account, snap }) => ({ id: account.id, name: account.name, mode: account.mode, value: snap.netLiq, dayChange: snap.dayChange })),
        year: investing,
      },
      routine: {
        done: routine.routine?.stepsCompleted.length ?? 0,
        total: ROUTINE_STEP_KEYS.length,
        bias,
        environment: environment?.environmentLabel ?? null,
      },
      nextEvent: upcoming.find((e) => e.high) ?? null,
      scoreboard: scoreboard({
        today,
        year: investing,
        personalMonthly: foundationReady ? s.cashFlow.monthly : null,
        netWorth: s.netWorth,
        history,
        capital: capitalItems(options, stocks),
        debts: s.debt.items.map((a) => ({
          balance: a.balance,
          apr: a.apr,
          payment: foundationData.debts.find((x) => x.id === a.id)?.monthlyPayment ?? a.payment,
        })),
      }),
      attention: attentionItems({
        today,
        foundation: foundationReady ? s : null,
        debts: foundationData.debts.map((d) => ({ lender: d.lender, balanceAsOf: d.balanceAsOf, paidOffAt: d.paidOffAt })),
        holdings,
        events: upcoming,
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
