import { NextResponse } from "next/server";
import { generateCsvTemplate } from "@/lib/services/csvParser";

export async function GET() {
  const csv = generateCsvTemplate();

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="wheeltracker-import-template.csv"',
    },
  });
}
