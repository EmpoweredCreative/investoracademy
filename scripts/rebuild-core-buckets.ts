/**
 * Rebuild core premium buckets from closed option trades, and report duplicate ledger rows.
 *
 *   npx tsx scripts/rebuild-core-buckets.ts                      # dry run (rolled back)
 *   npx tsx scripts/rebuild-core-buckets.ts --apply              # write changes
 *   npx tsx scripts/rebuild-core-buckets.ts --mode=ACCUMULATE    # plan for core holdings without one
 *   npx tsx scripts/rebuild-core-buckets.ts --account=<id>       # one account only
 *
 * What it does, per account:
 *   1. Reports duplicate opening ledger rows (old processOptionEntry double-booking). Report only.
 *   2. Creates a CorePlan for each CORE holding that has none (default REDUCE_BASIS = previous behavior).
 *   3. Resets StockLot.premiumReduction, clears PremiumBucketEntry, and replays every finalized
 *      option instance through settleOptionInstance in close order.
 *   4. Prints adjusted cost basis per CORE symbol before and after.
 *
 * Note: replay applies basis reduction to lots open *now*, not lots open on the close date.
 */
import "dotenv/config";
import { CorePlanMode, Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { settleOptionInstance } from "../src/lib/services/premiumSettlement";

const APPLY = process.argv.includes("--apply");
const modeArg = process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] as CorePlanMode | undefined;
const DEFAULT_MODE: CorePlanMode = modeArg ?? "REDUCE_BASIS";
const accountArg = process.argv.find((a) => a.startsWith("--account="))?.split("=")[1];

class DryRunRollback extends Error {}

async function adjustedBasisBySymbol(tx: Prisma.TransactionClient, accountId: string) {
  const lots = await tx.stockLot.findMany({
    where: { accountId, remaining: { gt: 0 }, underlying: { wheelClassification: { category: "CORE" } } },
    include: { underlying: { select: { symbol: true } } },
  });
  const out = new Map<string, number>();
  for (const lot of lots) {
    const perShare = lot.costBasis.div(lot.quantity);
    const reductionPerShare = lot.quantity.gt(0) ? lot.premiumReduction.div(lot.quantity) : new Prisma.Decimal(0);
    const value = perShare.minus(reductionPerShare).mul(lot.remaining).toNumber();
    out.set(lot.underlying.symbol, (out.get(lot.underlying.symbol) ?? 0) + value);
  }
  return out;
}

async function reportDuplicates(accountId: string) {
  const rows = await prisma.$queryRaw<
    { strategyInstanceId: string; type: string; amount: string; description: string | null; n: number }[]
  >`
    SELECT "strategyInstanceId", type::text AS type, amount::text AS amount, description, count(*)::int AS n
    FROM "LedgerEntry"
    WHERE "accountId" = ${accountId} AND "strategyInstanceId" IS NOT NULL AND "csvImportId" IS NULL
    GROUP BY "strategyInstanceId", type, amount, description, "occurredAt"
    HAVING count(*) > 1
  `;
  if (rows.length === 0) {
    console.log("  No duplicate ledger rows.");
    return;
  }
  console.log(`  ${rows.length} duplicated ledger row group(s) (likely double-booked opens):`);
  for (const r of rows) {
    console.log(`    ${r.type} $${r.amount} ×${r.n}  ${r.description ?? ""}  [instance ${r.strategyInstanceId}]`);
  }
  console.log("  These are reported only. Review before deleting; cash balance may also need a correction.");
}

async function rebuildAccount(accountId: string, name: string) {
  console.log(`\n=== ${name} (${accountId})`);
  await reportDuplicates(accountId);

  try {
    await prisma.$transaction(
      async (tx) => {
        const before = await adjustedBasisBySymbol(tx, accountId);

        const coreUnderlyings = await tx.underlying.findMany({
          where: { accountId, wheelClassification: { category: "CORE" }, corePlan: null },
          select: { id: true, symbol: true },
        });
        for (const u of coreUnderlyings) {
          await tx.corePlan.create({ data: { underlyingId: u.id, mode: DEFAULT_MODE } });
        }
        if (coreUnderlyings.length) {
          console.log(`  Created ${DEFAULT_MODE} plans: ${coreUnderlyings.map((u) => u.symbol).join(", ")}`);
        }

        await tx.stockLot.updateMany({ where: { accountId }, data: { premiumReduction: 0 } });
        await tx.premiumBucketEntry.deleteMany({ where: { accountId } });

        const finalized = await tx.strategyInstance.findMany({
          where: { accountId, instrumentType: "OPTION", status: "FINALIZED" },
          orderBy: { finalizedAt: "asc" },
          select: { id: true, finalizationReason: true, finalizedAt: true },
        });
        let routed = 0;
        for (const inst of finalized) {
          const result = await settleOptionInstance(tx, {
            instanceId: inst.id,
            reason: inst.finalizationReason ?? "CLOSED",
            finalizedAt: inst.finalizedAt ?? new Date(),
          });
          if (result.coreMode) routed++;
        }
        console.log(`  Replayed ${finalized.length} closed option(s); ${routed} routed to a core bucket.`);

        const after = await adjustedBasisBySymbol(tx, accountId);
        const symbols = new Set([...before.keys(), ...after.keys()]);
        for (const sym of symbols) {
          const b = before.get(sym) ?? 0;
          const a = after.get(sym) ?? 0;
          const flag = Math.abs(a - b) > 0.01 ? "  ← changed" : "";
          console.log(`  ${sym.padEnd(6)} adjusted basis $${b.toFixed(2)} → $${a.toFixed(2)}${flag}`);
        }
        const buckets = await tx.premiumBucketEntry.groupBy({
          by: ["underlyingId"],
          where: { accountId },
          _sum: { amount: true },
        });
        for (const bucket of buckets) {
          const u = await tx.underlying.findUnique({ where: { id: bucket.underlyingId }, select: { symbol: true } });
          console.log(`  ${u?.symbol.padEnd(6)} bucket balance $${(bucket._sum.amount ?? new Prisma.Decimal(0)).toFixed(2)}`);
        }

        if (!APPLY) throw new DryRunRollback();
      },
      { timeout: 120_000, maxWait: 10_000 }
    );
    console.log("  Applied.");
  } catch (err) {
    if (err instanceof DryRunRollback) console.log("  (dry run, rolled back)");
    else throw err;
  }
}

async function main() {
  const accounts = await prisma.account.findMany({
    where: accountArg ? { id: accountArg } : { archivedAt: null },
    select: { id: true, name: true },
  });
  for (const a of accounts) await rebuildAccount(a.id, a.name);
  if (!APPLY) console.log("\nDry run complete. Re-run with --apply to write changes.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
