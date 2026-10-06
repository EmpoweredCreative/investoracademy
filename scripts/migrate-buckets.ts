/**
 * One-time data migration: 4 wealth-wheel categories → 3 buckets.
 *
 *   MAD_MONEY    → SPECULATION
 *   FREE_CAPITAL → RISK_FREE_MONEY
 *   RISK_MGMT    → RISK_FREE_MONEY (targets merged into one row per account)
 *
 * Run BEFORE `prisma db push` (db push then drops the unused RISK_MGMT value).
 *
 *   npx tsx scripts/migrate-buckets.ts           # dry run: prints what would change
 *   npx tsx scripts/migrate-buckets.ts --apply   # applies in a single transaction
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

const CATEGORY_COLUMNS: [table: string, column: string][] = [
  ["WealthWheelClassification", "category"],
  ["StrategyInstance", "wheelCategoryOverride"],
  ["JournalTrade", "wheelCategoryOverride"],
  ["ResearchIdea", "wheelCategoryOverride"],
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: enumRows } = await client.query<{ enumlabel: string }>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'WheelCategory'`
  );
  const labels = new Set(enumRows.map((r) => r.enumlabel));
  console.log("Current WheelCategory values:", [...labels].join(", "));

  if (!labels.has("MAD_MONEY") && !labels.has("FREE_CAPITAL") && !labels.has("RISK_MGMT")) {
    console.log("Already migrated. Nothing to do.");
    await client.end();
    return;
  }

  // Report affected rows
  for (const [table, column] of [["WealthWheelTarget", "category"], ...CATEGORY_COLUMNS]) {
    const { rows } = await client.query(
      `SELECT "${column}"::text AS v, count(*)::int AS n FROM "${table}" WHERE "${column}" IS NOT NULL GROUP BY 1 ORDER BY 1`
    );
    console.log(`${table}.${column}:`, rows.map((r) => `${r.v}=${r.n}`).join(", ") || "(empty)");
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to migrate.");
    await client.end();
    return;
  }

  try {
    await client.query("BEGIN");

    if (labels.has("MAD_MONEY")) {
      await client.query(`ALTER TYPE "WheelCategory" RENAME VALUE 'MAD_MONEY' TO 'SPECULATION'`);
    }
    if (labels.has("FREE_CAPITAL")) {
      await client.query(`ALTER TYPE "WheelCategory" RENAME VALUE 'FREE_CAPITAL' TO 'RISK_FREE_MONEY'`);
    }

    if (labels.has("RISK_MGMT")) {
      // Merge RISK_MGMT targets into RISK_FREE_MONEY where both exist (unique per account+category)
      await client.query(`
        UPDATE "WealthWheelTarget" t
        SET "targetPct" = t."targetPct" + r."targetPct", "updatedAt" = now()
        FROM "WealthWheelTarget" r
        WHERE r."accountId" = t."accountId"
          AND t.category = 'RISK_FREE_MONEY'
          AND r.category = 'RISK_MGMT'
      `);
      await client.query(`
        DELETE FROM "WealthWheelTarget" r
        WHERE r.category = 'RISK_MGMT'
          AND EXISTS (
            SELECT 1 FROM "WealthWheelTarget" t
            WHERE t."accountId" = r."accountId" AND t.category = 'RISK_FREE_MONEY'
          )
      `);
      await client.query(`UPDATE "WealthWheelTarget" SET category = 'RISK_FREE_MONEY' WHERE category = 'RISK_MGMT'`);

      for (const [table, column] of CATEGORY_COLUMNS) {
        const res = await client.query(
          `UPDATE "${table}" SET "${column}" = 'RISK_FREE_MONEY' WHERE "${column}" = 'RISK_MGMT'`
        );
        console.log(`${table}.${column}: ${res.rowCount} RISK_MGMT rows → RISK_FREE_MONEY`);
      }
    }

    await client.query("COMMIT");
    console.log("\nMigrated. Now run: npx prisma db push");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
