import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { parseCsv } from "@/lib/services/csvParser";
import { computeFileSha256, dedupeCheck } from "@/lib/services/dedupeEngine";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const accountId = formData.get("accountId") as string;

    if (!file || !accountId) {
      return NextResponse.json(
        { error: "file and accountId are required" },
        { status: 400 }
      );
    }

    // Verify account ownership
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const content = await file.text();
    const fileSha256 = computeFileSha256(content);

    // Parse CSV
    const { rows, errors } = parseCsv(content);

    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: "CSV parsing errors",
          parseErrors: errors,
          validRows: rows.length,
        },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid rows found" }, { status: 400 });
    }

    // Run dedupe check
    const dedupeResults = await dedupeCheck(accountId, fileSha256, rows);

    // Create CSV import record (not committed yet)
    const csvImport = await prisma.csvImport.create({
      data: {
        accountId,
        fileName: file.name,
        fileSha256,
        rowCount: rows.length,
        newCount: dedupeResults.filter((r) => r.status === "NEW").length,
        dupCount: dedupeResults.filter((r) => r.status !== "NEW").length,
      },
    });

    return NextResponse.json({
      importId: csvImport.id,
      fileName: file.name,
      totalRows: rows.length,
      preview: dedupeResults.map((r) => ({
        rowIndex: r.rowIndex,
        status: r.status,
        symbol: r.row.symbol,
        action: r.row.action,
        quantity: r.row.quantity,
        price: r.row.price,
        instrument_type: r.row.instrument_type,
        trade_datetime: r.row.trade_datetime,
      })),
      summary: {
        new: dedupeResults.filter((r) => r.status === "NEW").length,
        duplicateFile: dedupeResults.filter((r) => r.status === "DUPLICATE_FILE").length,
        duplicateRef: dedupeResults.filter((r) => r.status === "DUPLICATE_EXTERNAL_REF").length,
        duplicateFingerprint: dedupeResults.filter((r) => r.status === "DUPLICATE_FINGERPRINT").length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
