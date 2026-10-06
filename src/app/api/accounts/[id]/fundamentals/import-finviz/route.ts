import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { requireAccountForUser } from "@/lib/fundamentals/accountAccess";
import { parseFinvizCsv } from "@/lib/fundamentals/finvizCsvParser";
import { refreshFundamentalsBatch } from "@/lib/fundamentals/yahooFundamentals";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    await requireAccountForUser(accountId, userId);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "CSV file required" }, { status: 400 });
    }

    const content = await file.text();
    const rows = parseFinvizCsv(content);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid tickers found in CSV" }, { status: 400 });
    }

    const importRecord = await prisma.finvizCsvImport.create({
      data: {
        accountId,
        filename: file.name,
        rowCount: rows.length,
      },
    });

    const existing = await prisma.fundamentalWatchlistItem.findMany({
      where: { accountId },
      select: { symbol: true },
    });
    const existingSet = new Set(existing.map((e) => e.symbol));

    const newSymbols: string[] = [];
    let duplicatesSkipped = 0;

    for (const row of rows) {
      if (existingSet.has(row.symbol)) {
        duplicatesSkipped++;
        continue;
      }
      existingSet.add(row.symbol);
      newSymbols.push(row.symbol);
      await prisma.fundamentalWatchlistItem.create({
        data: {
          accountId,
          symbol: row.symbol,
          source: "FINVIZ_CSV",
          finvizImportId: importRecord.id,
          importMetadata: row.metadata,
          yahooFetchStatus: "PENDING",
        },
      });
    }

    if (newSymbols.length > 0) {
      void refreshFundamentalsBatch(accountId, newSymbols).catch((err) =>
        console.error("[fundamentals] batch fetch after import failed", err)
      );
    }

    return NextResponse.json({
      imported: newSymbols.length,
      duplicatesSkipped,
      symbols: newSymbols,
      fetching: newSymbols.length,
      importId: importRecord.id,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
