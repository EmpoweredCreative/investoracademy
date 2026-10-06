import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CompanyReport } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/api-helpers";
import { companyContext, type CompanyParams } from "@/lib/research/routeContext";
import { AI_NOT_CONFIGURED } from "@/lib/fundamentals/chatThread";
import { latestJob, startReportJob } from "@/lib/research/reportJobs";
import { resolveLens } from "@/lib/research/strategies";

// The background job (after()) shares this budget; the first report on a company also reads its filings.
export const maxDuration = 300;

const serialize = (r: CompanyReport) => ({
  id: r.id,
  symbol: r.symbol,
  lensKey: r.lensKey,
  report: r.report,
  sources: r.sources,
  model: r.model,
  createdAt: r.createdAt.toISOString(),
});

/** GET ?lens=buffett — latest report for this lens, any running/failed job, and which lenses have reports. */
export async function GET(req: NextRequest, { params }: CompanyParams) {
  try {
    const { userId, accountId, symbol } = await companyContext(params);
    const lens = await resolveLens(userId, req.nextUrl.searchParams.get("lens"));
    const [report, job, all] = await Promise.all([
      prisma.companyReport.findFirst({ where: { accountId, symbol, lensKey: lens.key }, orderBy: { createdAt: "desc" } }),
      latestJob(accountId, symbol, lens.key),
      prisma.companyReport.findMany({
        where: { accountId, symbol },
        orderBy: { createdAt: "desc" },
        select: { lensKey: true, createdAt: true },
      }),
    ]);
    const latestByLens = new Map<string, string>();
    for (const r of all) if (!latestByLens.has(r.lensKey)) latestByLens.set(r.lensKey, r.createdAt.toISOString());
    // Only surface a job that's newer than the report shown (running, or a failed retry).
    const showJob = job && job.status !== "DONE" && (!report || new Date(job.startedAt) > report.createdAt) ? job : null;
    return NextResponse.json({
      lens: { key: lens.key, name: lens.name, questions: lens.questions },
      report: report ? serialize(report) : null,
      job: showJob,
      available: Object.fromEntries(latestByLens),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const postSchema = z.object({ lens: z.string().max(64).nullish() });

/** POST { lens } — start generating a report in the background (or join the one already running). Returns the job. */
export async function POST(req: NextRequest, { params }: CompanyParams) {
  try {
    const { userId, accountId, symbol } = await companyContext(params);
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });
    const { lens } = postSchema.parse(await req.json().catch(() => ({})));
    const job = await startReportJob({ userId, accountId, symbol, lensKey: lens ?? null });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}
