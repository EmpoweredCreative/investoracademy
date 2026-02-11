import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ParsedCsvRow } from "./csvParser";

export type DedupeStatus =
  | "NEW"
  | "DUPLICATE_FILE"
  | "DUPLICATE_EXTERNAL_REF"
  | "DUPLICATE_FINGERPRINT";

export interface DedupeResult {
  row: ParsedCsvRow;
  rowIndex: number;
  status: DedupeStatus;
  fingerprint: string;
  externalRef: string | null;
}

/**
 * Compute SHA-256 hash of file content.
 */
export function computeFileSha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Compute fingerprint for a parsed CSV row.
 * Normalized fields: accountId, occurredAt (rounded to 60s), symbol,
 * instrument_type, action, expiration, strike (2 dec), call_put,
 * quantity (4 dec), price (4 dec), fees (2 dec)
 */
export function computeFingerprint(accountId: string, row: ParsedCsvRow): string {
  const occurredAt = new Date(row.trade_datetime);
  const roundedTime = new Date(
    Math.round(occurredAt.getTime() / 60000) * 60000
  ).toISOString();

  const strike = row.strike ? new Prisma.Decimal(row.strike).toFixed(2) : "";
  const quantity = new Prisma.Decimal(row.quantity).toFixed(4);
  const price = new Prisma.Decimal(row.price).toFixed(4);
  const fees = new Prisma.Decimal(row.fees || "0").toFixed(2);

  const fingerPrintStr = [
    accountId,
    roundedTime,
    row.symbol.toUpperCase(),
    row.instrument_type,
    row.action.toUpperCase(),
    row.expiration || "",
    strike,
    row.call_put?.toUpperCase() || "",
    quantity,
    price,
    fees,
  ].join("|");

  return crypto.createHash("sha256").update(fingerPrintStr).digest("hex");
}

/**
 * Run 3-layer dedupe check on parsed CSV rows.
 */
export async function dedupeCheck(
  accountId: string,
  fileSha256: string,
  rows: ParsedCsvRow[]
): Promise<DedupeResult[]> {
  // Layer A: Check if this exact file was already committed
  const existingImport = await prisma.csvImport.findFirst({
    where: { accountId, fileSha256, committedAt: { not: null } },
  });

  if (existingImport) {
    return rows.map((row, index) => ({
      row,
      rowIndex: index,
      status: "DUPLICATE_FILE" as DedupeStatus,
      fingerprint: computeFingerprint(accountId, row),
      externalRef: row.external_trade_id || null,
    }));
  }

  const results: DedupeResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fingerprint = computeFingerprint(accountId, row);
    const externalRef = row.external_trade_id || null;

    // Layer B: Check external reference
    if (externalRef) {
      const existingByRef = await prisma.ledgerEntry.findFirst({
        where: { accountId, externalRef },
      });
      if (existingByRef) {
        results.push({ row, rowIndex: i, status: "DUPLICATE_EXTERNAL_REF", fingerprint, externalRef });
        continue;
      }
    }

    // Layer C: Check fingerprint
    const existingByFingerprint = await prisma.ledgerEntry.findFirst({
      where: { accountId, fingerprint },
    });
    if (existingByFingerprint) {
      results.push({ row, rowIndex: i, status: "DUPLICATE_FINGERPRINT", fingerprint, externalRef });
      continue;
    }

    results.push({ row, rowIndex: i, status: "NEW", fingerprint, externalRef });
  }

  return results;
}
