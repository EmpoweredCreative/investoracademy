import { CallPut, LedgerType, Prisma, StrategyType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { consumeStockLots, createStockLot } from "@/lib/services/fifoLots";
import { settleOptionInstance } from "@/lib/services/premiumSettlement";
import { schwab } from "./client";
import type { SchwabInstrument, SchwabPosition, SchwabTransaction, SchwabTransferItem } from "./types";

type Tx = Prisma.TransactionClient;

const DAY = 24 * 3600_000;
const FIRST_SYNC_LOOKBACK_DAYS = 365;
const INCREMENTAL_OVERLAP_DAYS = 3;
const TX_TYPES = ["TRADE", "RECEIVE_AND_DELIVER"];

export interface SyncResult {
  accountId: string;
  transactionsImported: number;
  transactionsSkipped: number;
  optionsOpened: number;
  optionsClosed: number;
  positionsReconciled: number;
  netLiq: number | null;
  warnings: string[];
}

// ─── Helpers ─────────────────────────────────────────────────

/** Parse an OCC option symbol, e.g. "AAPL  250718C00210000". */
export function parseOccSymbol(symbol: string) {
  const m = symbol.replace(/\s+/g, " ").match(/^([A-Z.$/]+)\s*(\d{6})([CP])(\d{8})$/);
  if (!m) return null;
  const [, root, yymmdd, cp, strike] = m;
  return {
    underlying: root,
    expiration: new Date(Date.UTC(2000 + +yymmdd.slice(0, 2), +yymmdd.slice(2, 4) - 1, +yymmdd.slice(4, 6), 20)),
    callPut: (cp === "C" ? "CALL" : "PUT") as CallPut,
    strike: parseInt(strike, 10) / 1000,
  };
}

function optionDetails(inst: SchwabInstrument) {
  const parsed = parseOccSymbol(inst.symbol);
  const callPut = inst.putCall === "CALL" || inst.putCall === "PUT" ? (inst.putCall as CallPut) : parsed?.callPut;
  return {
    underlying: (inst.underlyingSymbol ?? parsed?.underlying ?? inst.symbol).trim().toUpperCase(),
    callPut: callPut ?? "CALL",
    strike: inst.strikePrice ?? parsed?.strike ?? 0,
    expiration: inst.expirationDate ? new Date(inst.expirationDate) : parsed?.expiration ?? null,
  };
}

const isFee = (item: SchwabTransferItem) => Boolean(item.feeType);
const isOption = (item: SchwabTransferItem) => !isFee(item) && item.instrument?.assetType === "OPTION";
const isEquity = (item: SchwabTransferItem) =>
  !isFee(item) && (item.instrument?.assetType === "EQUITY" || item.instrument?.assetType === "COLLECTIVE_INVESTMENT");

/** Cash amount of a trade item; Schwab's `cost` is signed (+ credit, − debit). */
function itemCash(item: SchwabTransferItem, multiplier: number) {
  if (typeof item.cost === "number" && item.cost !== 0) return item.cost;
  const qty = item.amount ?? 0;
  return -(qty * (item.price ?? 0) * multiplier);
}

async function upsertUnderlying(tx: Tx, accountId: string, symbol: string, defaultBucket: "CORE" | "SPECULATION") {
  const underlying = await tx.underlying.upsert({
    where: { accountId_symbol: { accountId, symbol } },
    create: { accountId, symbol },
    update: {},
    include: { wheelClassification: true },
  });
  if (!underlying.wheelClassification) {
    await tx.wealthWheelClassification.create({
      data: { accountId, underlyingId: underlying.id, category: defaultBucket },
    });
  }
  return underlying;
}

interface LegInfo {
  callPut: CallPut;
  strike: number;
  short: boolean;
}

/** Best-effort strategy label from the legs opened in one order. */
export function inferStrategy(legs: LegInfo[], expiration: Date | null, sharesHeld: number): StrategyType | null {
  if (legs.length === 1) {
    const [leg] = legs;
    if (leg.short) return leg.callPut === "CALL" ? (sharesHeld >= 100 ? "COVERED_CALL" : null) : "SHORT_PUT";
    const longDated = expiration ? expiration.getTime() - Date.now() > 270 * DAY : false;
    if (longDated) return leg.callPut === "CALL" ? "LEAP_CALL" : "LEAP_PUT";
    return null;
  }
  const puts = legs.filter((l) => l.callPut === "PUT");
  const calls = legs.filter((l) => l.callPut === "CALL");
  if (legs.length === 2 && puts.length === 2) {
    const short = puts.find((l) => l.short);
    const long = puts.find((l) => !l.short);
    if (short && long) return short.strike > long.strike ? "BULL_PUT_SPREAD" : "BEAR_PUT_SPREAD";
  }
  if (legs.length === 2 && calls.length === 2) {
    const short = calls.find((l) => l.short);
    const long = calls.find((l) => !l.short);
    if (short && long) return short.strike < long.strike ? "BEAR_CALL_SPREAD" : "BULL_CALL_SPREAD";
  }
  if (legs.length === 2 && puts.length === 1 && calls.length === 1 && legs.every((l) => l.short)) return "SHORT_STRANGLE";
  if (legs.length === 4 && puts.length === 2 && calls.length === 2) {
    const shortPut = puts.find((l) => l.short);
    const shortCall = calls.find((l) => l.short);
    if (shortPut && shortCall) return shortPut.strike === shortCall.strike ? "IRON_BUTTERFLY" : "IRON_CONDOR";
  }
  return null;
}

// ─── Transactions ────────────────────────────────────────────

async function importTransaction(
  tx: Tx,
  accountId: string,
  t: SchwabTransaction,
  result: SyncResult
): Promise<boolean> {
  const refBase = `schwab:${t.activityId}`;
  const exists = await tx.ledgerEntry.findFirst({
    where: { accountId, externalRef: { startsWith: `${refBase}:` } },
    select: { id: true },
  });
  if (exists) return false;

  const occurredAt = new Date(t.time ?? t.tradeDate ?? Date.now());
  const items = t.transferItems ?? [];
  const optionItems = items.filter(isOption);
  const equityItems = items.filter(isEquity);
  const feeTotal = items.filter(isFee).reduce((s, i) => s + Math.abs(i.cost ?? 0), 0);

  const openingLegs = optionItems.filter((i) => i.positionEffect === "OPENING");
  const multiLeg = openingLegs.length > 1;
  const groupId = multiLeg ? `schwab-${t.activityId}` : null;
  let strategyType: StrategyType | null = null;
  if (openingLegs.length > 0) {
    const first = optionDetails(openingLegs[0].instrument!);
    const und = await tx.underlying.findUnique({
      where: { accountId_symbol: { accountId, symbol: first.underlying } },
      include: { stockLots: { where: { remaining: { gt: 0 } } } },
    });
    const shares = und?.stockLots.reduce((s, l) => s + l.remaining.toNumber(), 0) ?? 0;
    strategyType = inferStrategy(
      openingLegs.map((i) => {
        const d = optionDetails(i.instrument!);
        return { callPut: d.callPut, strike: d.strike, short: itemCash(i, 100) > 0 };
      }),
      first.expiration,
      shares
    );
  }

  let firstInstanceId: string | null = null;
  const assignedOrExercised = equityItems.length > 0 && optionItems.some((i) => i.positionEffect !== "OPENING");

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (!item.instrument || isFee(item)) continue;
    const ref = `${refBase}:${idx}`;

    if (isOption(item)) {
      const d = optionDetails(item.instrument);
      const qty = Math.abs(item.amount ?? 0);
      const cash = itemCash(item, 100);
      const credit = cash > 0;
      const premium = new Prisma.Decimal(Math.abs(cash));
      const brokerSymbol = item.instrument.symbol;
      const underlying = await upsertUnderlying(tx, accountId, d.underlying, "SPECULATION");
      const describe = `${credit ? "Sold" : "Bought"} ${qty} ${d.underlying} ${d.strike} ${d.callPut} @ ${item.price ?? 0}`;

      if (item.positionEffect === "OPENING") {
        const short = credit;
        const instance = await tx.strategyInstance.create({
          data: {
            accountId,
            underlyingId: underlying.id,
            instrumentType: "OPTION",
            strategyType,
            strategyGroupId: groupId,
            optionAction: short ? "STO" : "BTO",
            callPut: d.callPut,
            longShort: short ? "SHORT" : "LONG",
            strike: new Prisma.Decimal(d.strike),
            expiration: d.expiration,
            quantity: new Prisma.Decimal(qty),
            brokerSymbol,
            // Spreads are speculation even on a core symbol.
            wheelCategoryOverride: multiLeg ? "SPECULATION" : null,
          },
        });
        firstInstanceId ??= instance.id;
        await tx.ledgerEntry.create({
          data: {
            accountId,
            strategyInstanceId: instance.id,
            type: credit ? LedgerType.PREMIUM_CREDIT : LedgerType.PREMIUM_DEBIT,
            amount: premium,
            occurredAt,
            externalRef: ref,
            description: describe,
          },
        });
        await tx.journalTrade.create({
          data: {
            accountId,
            underlyingId: underlying.id,
            strategyInstanceId: instance.id,
            strike: new Prisma.Decimal(d.strike),
            callPut: d.callPut,
            longShort: short ? "SHORT" : "LONG",
            quantity: qty,
            entryPrice: item.price ?? 0,
            entryDateTime: occurredAt,
            wheelCategoryOverride: multiLeg ? "SPECULATION" : null,
            thesisNotes: `Imported from Schwab: ${t.description ?? describe}`,
          },
        });
        result.optionsOpened++;
      } else {
        // CLOSING / AUTOMATIC: match FIFO against open instances of the same contract.
        const open = await tx.strategyInstance.findMany({
          where: { accountId, brokerSymbol, status: "OPEN" },
          orderBy: { createdAt: "asc" },
        });
        const target = open[0] ?? null;
        await tx.ledgerEntry.create({
          data: {
            accountId,
            strategyInstanceId: target?.id ?? null,
            type: premium.isZero() ? LedgerType.ADJUSTMENT : credit ? LedgerType.PREMIUM_CREDIT : LedgerType.PREMIUM_DEBIT,
            amount: premium,
            occurredAt,
            externalRef: ref,
            description: premium.isZero() ? `${d.underlying} ${d.strike} ${d.callPut} ${t.description ?? "removed"}` : describe,
          },
        });
        let remaining = qty;
        for (const inst of open) {
          if (remaining <= 0) break;
          const openQty = inst.quantity.minus(inst.closedQuantity).toNumber();
          const take = Math.min(openQty, remaining);
          remaining -= take;
          const closedQuantity = inst.closedQuantity.plus(take);
          await tx.strategyInstance.update({ where: { id: inst.id }, data: { closedQuantity } });
          if (closedQuantity.gte(inst.quantity)) {
            const reason =
              assignedOrExercised ? (inst.longShort === "SHORT" ? "ASSIGNED" : "EXERCISED") : premium.isZero() ? "EXPIRED" : "CLOSED";
            await settleOptionInstance(tx, { instanceId: inst.id, reason, finalizedAt: occurredAt });
            await tx.journalTrade.updateMany({
              where: { strategyInstanceId: inst.id },
              data: { exitPrice: item.price ?? 0, exitDateTime: occurredAt },
            });
            result.optionsClosed++;
          }
        }
        firstInstanceId ??= target?.id ?? null;
      }
    } else if (isEquity(item)) {
      const cash = itemCash(item, 1);
      await upsertUnderlying(tx, accountId, item.instrument.symbol.toUpperCase(), "CORE");
      await tx.ledgerEntry.create({
        data: {
          accountId,
          type: cash < 0 ? LedgerType.STOCK_BUY : LedgerType.STOCK_SELL,
          amount: new Prisma.Decimal(Math.abs(cash)),
          occurredAt,
          externalRef: ref,
          description: `${cash < 0 ? "Bought" : "Sold"} ${Math.abs(item.amount ?? 0)} ${item.instrument.symbol} @ ${item.price ?? 0}`,
        },
      });
    }
  }

  if (feeTotal > 0) {
    await tx.ledgerEntry.create({
      data: {
        accountId,
        strategyInstanceId: firstInstanceId,
        type: LedgerType.FEE,
        amount: new Prisma.Decimal(feeTotal.toFixed(4)),
        occurredAt,
        externalRef: `${refBase}:fee`,
        description: `Commissions & fees · ${t.description ?? t.type}`,
      },
    });
  }

  // Guarantees idempotency even for transactions with nothing we book (e.g. cash sweeps).
  if (items.length === 0 || (optionItems.length === 0 && equityItems.length === 0 && feeTotal === 0)) {
    return false;
  }
  return true;
}

// ─── Positions reconcile ─────────────────────────────────────

async function reconcileEquities(tx: Tx, accountId: string, positions: SchwabPosition[], result: SyncResult) {
  const equities = new Map<string, SchwabPosition>();
  for (const p of positions) {
    if (p.instrument.assetType === "EQUITY" || p.instrument.assetType === "COLLECTIVE_INVESTMENT") {
      equities.set(p.instrument.symbol.toUpperCase(), p);
    }
  }

  const underlyings = await tx.underlying.findMany({
    where: { accountId },
    include: { stockLots: { where: { remaining: { gt: 0 } } } },
  });
  const symbols = new Set([...underlyings.map((u) => u.symbol.toUpperCase()), ...equities.keys()]);

  for (const symbol of symbols) {
    const pos = equities.get(symbol);
    const target = pos ? (pos.longQuantity ?? 0) : 0;
    let underlying = underlyings.find((u) => u.symbol.toUpperCase() === symbol);
    if (!underlying && pos) {
      const created = await upsertUnderlying(tx, accountId, symbol, "CORE");
      underlying = { ...created, stockLots: [] };
    }
    if (!underlying) continue;

    const current = underlying.stockLots.reduce((s, l) => s + l.remaining.toNumber(), 0);
    const avg = pos?.averageLongPrice ?? pos?.averagePrice ?? 0;
    const price = pos && target > 0 && pos.marketValue != null ? pos.marketValue / target : avg;

    if (Math.abs(target - current) > 1e-6) {
      if (target > current) {
        const currentCost = underlying.stockLots.reduce((s, l) => s + l.costBasis.div(l.quantity).mul(l.remaining).toNumber(), 0);
        const delta = target - current;
        const lotCost = Math.max(avg * target - currentCost, 0) || delta * avg;
        await createStockLot(
          { accountId, underlyingId: underlying.id, quantity: delta, costBasis: lotCost, acquiredAt: new Date() },
          tx
        );
      } else {
        await consumeStockLots({ accountId, underlyingId: underlying.id, quantity: current - target, sellPrice: price }, tx);
      }
      result.positionsReconciled++;
    }

    if (pos && price > 0) {
      await tx.underlying.update({ where: { id: underlying.id }, data: { currentPrice: new Prisma.Decimal(price) } });
    }
  }
}

async function reconcileOptions(tx: Tx, accountId: string, positions: SchwabPosition[], result: SyncResult) {
  const held = new Map<string, { pos: SchwabPosition; qty: number; short: boolean }>();
  for (const p of positions) {
    if (p.instrument.assetType !== "OPTION") continue;
    const short = (p.shortQuantity ?? 0) > 0;
    held.set(p.instrument.symbol, { pos: p, qty: short ? p.shortQuantity! : p.longQuantity ?? 0, short });
  }

  const open = await tx.strategyInstance.findMany({
    where: { accountId, instrumentType: "OPTION", status: "OPEN", brokerSymbol: { not: null } },
    orderBy: { createdAt: "asc" },
  });

  // Options we hold that predate the transaction window: open them at Schwab's average price.
  for (const [symbol, h] of held) {
    const tracked = open
      .filter((i) => i.brokerSymbol === symbol)
      .reduce((s, i) => s + i.quantity.minus(i.closedQuantity).toNumber(), 0);
    const missing = h.qty - tracked;
    if (missing <= 1e-6) continue;

    const d = optionDetails(h.pos.instrument);
    const underlying = await upsertUnderlying(tx, accountId, d.underlying, "SPECULATION");
    const avg = (h.short ? h.pos.averageShortPrice : h.pos.averageLongPrice) ?? h.pos.averagePrice ?? 0;
    const instance = await tx.strategyInstance.create({
      data: {
        accountId,
        underlyingId: underlying.id,
        instrumentType: "OPTION",
        optionAction: h.short ? "STO" : "BTO",
        callPut: d.callPut,
        longShort: h.short ? "SHORT" : "LONG",
        strike: new Prisma.Decimal(d.strike),
        expiration: d.expiration,
        quantity: new Prisma.Decimal(missing),
        brokerSymbol: symbol,
        notes: "Opened from Schwab position snapshot (trade predates sync window)",
      },
    });
    await tx.ledgerEntry.create({
      data: {
        accountId,
        strategyInstanceId: instance.id,
        type: h.short ? LedgerType.PREMIUM_CREDIT : LedgerType.PREMIUM_DEBIT,
        amount: new Prisma.Decimal((avg * missing * 100).toFixed(4)),
        occurredAt: new Date(),
        externalRef: `schwab:pos:${symbol.replace(/\s+/g, "")}:${instance.id}`,
        description: `${h.short ? "Short" : "Long"} ${missing} ${d.underlying} ${d.strike} ${d.callPut} (position snapshot @ ${avg.toFixed(2)})`,
      },
    });
    await tx.journalTrade.create({
      data: {
        accountId,
        underlyingId: underlying.id,
        strategyInstanceId: instance.id,
        strike: new Prisma.Decimal(d.strike),
        callPut: d.callPut,
        longShort: h.short ? "SHORT" : "LONG",
        quantity: missing,
        entryPrice: avg,
        entryDateTime: new Date(),
        thesisNotes: "Imported from Schwab position snapshot",
      },
    });
    result.optionsOpened++;
  }

  // Open instances Schwab no longer shows were closed without a trade we saw (usually expiry).
  for (const inst of open) {
    if (held.has(inst.brokerSymbol!)) continue;
    await tx.strategyInstance.update({ where: { id: inst.id }, data: { closedQuantity: inst.quantity } });
    const reason = inst.expiration && inst.expiration.getTime() < Date.now() ? "EXPIRED" : "CLOSED";
    await settleOptionInstance(tx, { instanceId: inst.id, reason, finalizedAt: new Date() });
    result.optionsClosed++;
  }
}

// ─── Entry point ─────────────────────────────────────────────

const inFlight = new Map<string, Promise<SyncResult>>();

export function syncSchwabAccount(accountId: string, opts: { full?: boolean } = {}): Promise<SyncResult> {
  const running = inFlight.get(accountId);
  if (running) return running;
  const job = runSync(accountId, opts).finally(() => inFlight.delete(accountId));
  inFlight.set(accountId, job);
  return job;
}

async function runSync(accountId: string, opts: { full?: boolean }): Promise<SyncResult> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  if (!account.brokerAccountHash) throw new Error("Account is not linked to Schwab");

  const result: SyncResult = {
    accountId,
    transactionsImported: 0,
    transactionsSkipped: 0,
    optionsOpened: 0,
    optionsClosed: 0,
    positionsReconciled: 0,
    netLiq: null,
    warnings: [],
  };

  try {
    const userId = account.userId;
    const hash = account.brokerAccountHash;
    const end = new Date();
    const start =
      opts.full || !account.lastSyncedAt
        ? new Date(end.getTime() - FIRST_SYNC_LOOKBACK_DAYS * DAY)
        : new Date(account.lastSyncedAt.getTime() - INCREMENTAL_OVERLAP_DAYS * DAY);

    const snapshot = await schwab.account(userId, hash);
    const txLists = await Promise.all(
      TX_TYPES.map((type) =>
        schwab.transactions(userId, hash, start, end, type).catch((err) => {
          result.warnings.push(`${type} transactions: ${err instanceof Error ? err.message : err}`);
          return [];
        })
      )
    );
    const transactions = txLists
      .flat()
      .filter((t) => !t.status || t.status === "VALID")
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime() || a.activityId - b.activityId);

    for (const t of transactions) {
      const imported = await prisma.$transaction((tx) => importTransaction(tx, accountId, t, result), { timeout: 30_000 });
      if (imported) result.transactionsImported++;
      else result.transactionsSkipped++;
    }

    const sa = snapshot.securitiesAccount;
    const positions = sa.positions ?? [];
    await prisma.$transaction(
      async (tx) => {
        await reconcileEquities(tx, accountId, positions, result);
        await reconcileOptions(tx, accountId, positions, result);
      },
      { timeout: 60_000 }
    );

    const bal = sa.currentBalances ?? {};
    const cash = bal.cashBalance ?? bal.totalCash ?? bal.cashAvailableForTrading ?? 0;
    const dayPnl = positions.reduce((s, p) => s + (p.currentDayProfitLoss ?? 0), 0);
    const optionValue = positions
      .filter((p) => p.instrument.assetType === "OPTION")
      .reduce((s, p) => s + (p.marketValue ?? 0), 0);
    result.netLiq = bal.liquidationValue ?? null;

    await prisma.account.update({
      where: { id: accountId },
      data: {
        cashBalance: new Prisma.Decimal(cash + (bal.moneyMarketFund ?? 0)),
        syncedNetLiq: bal.liquidationValue != null ? new Prisma.Decimal(bal.liquidationValue) : null,
        syncedBuyingPower: bal.buyingPower != null ? new Prisma.Decimal(bal.buyingPower) : null,
        syncedDayPnl: new Prisma.Decimal(dayPnl),
        syncedOptionValue: new Prisma.Decimal(optionValue),
        brokerAccountType: sa.type,
        lastSyncedAt: end,
        lastSyncError: result.warnings.length ? result.warnings.join("; ") : null,
        onboardingCompletedAt: account.onboardingCompletedAt ?? end,
      },
    });
    if (account.brokerConnectionId) {
      await prisma.brokerConnection.update({
        where: { id: account.brokerConnectionId },
        data: { lastSyncAt: end },
      });
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.account.update({ where: { id: accountId }, data: { lastSyncError: message } });
    throw err;
  }
}
