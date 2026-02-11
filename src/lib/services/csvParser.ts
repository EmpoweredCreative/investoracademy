import { parse } from "csv-parse/sync";
import { csvRowSchema } from "@/lib/validations";
import { z } from "zod";

export interface ParsedCsvRow {
  account_name: string;
  trade_datetime: string;
  symbol: string;
  instrument_type: "STOCK" | "OPTION";
  action: string;
  quantity: string;
  price: string;
  fees: string;
  expiration?: string;
  strike?: string;
  call_put?: string;
  external_trade_id?: string;
  notes?: string;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  errors: Array<{ row: number; message: string }>;
}

/**
 * Parse a CSV string into validated rows.
 */
export function parseCsv(content: string): CsvParseResult {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const rows: ParsedCsvRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  records.forEach((record, index) => {
    try {
      const validated = csvRowSchema.parse(record);
      rows.push(validated as ParsedCsvRow);
    } catch (err) {
      if (err instanceof z.ZodError) {
        errors.push({
          row: index + 2, // +2 for 1-indexed + header row
          message: err.issues.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`).join("; "),
        });
      }
    }
  });

  return { rows, errors };
}

/**
 * Generate the canonical CSV template.
 */
export function generateCsvTemplate(): string {
  const headers = [
    "account_name",
    "trade_datetime",
    "symbol",
    "instrument_type",
    "action",
    "quantity",
    "price",
    "fees",
    "expiration",
    "strike",
    "call_put",
    "external_trade_id",
    "notes",
  ];

  const exampleRow = [
    "My Account",
    "2025-01-15T10:30:00Z",
    "AAPL",
    "OPTION",
    "STO",
    "1",
    "2.50",
    "0.65",
    "2025-02-21T00:00:00Z",
    "175.00",
    "PUT",
    "TRD-001",
    "Short put on AAPL",
  ];

  return [headers.join(","), exampleRow.join(",")].join("\n");
}
