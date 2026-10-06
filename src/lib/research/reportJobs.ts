import { after } from "next/server";
import { Prisma, type CompanyReportJob } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateCompanyReport } from "./report";
import { resolveLens } from "./strategies";
import { computeCompanyScore } from "./scoreService";

/**
 * Company Reports run as background jobs: the page (or the Screener) starts one
 * and polls its status, so generation carries on when the user switches tabs or
 * leaves the page. Progress stages are stored on the job row.
 */

// Route maxDuration is 300s; anything older than this was cut off.
const STALE_MS = 6 * 60_000;

export interface JobView {
  id: string;
  status: "RUNNING" | "DONE" | "ERROR";
  stages: string[];
  error: string | null;
  reportId: string | null;
  startedAt: string;
}

export function viewJob(job: CompanyReportJob): JobView {
  const stale = job.status === "RUNNING" && Date.now() - job.startedAt.getTime() > STALE_MS;
  return {
    id: job.id,
    status: stale ? "ERROR" : (job.status as JobView["status"]),
    stages: (job.stages as string[]) ?? [],
    error: stale ? "The report took too long and was stopped. Try generating it again." : job.error,
    reportId: job.reportId,
    startedAt: job.startedAt.toISOString(),
  };
}

const liveRunning = (accountId: string, symbol: string, lensKey: string) =>
  prisma.companyReportJob.findFirst({
    where: { accountId, symbol, lensKey, status: "RUNNING", startedAt: { gt: new Date(Date.now() - STALE_MS) } },
    orderBy: { startedAt: "desc" },
  });

/** The most recent job for this stock and lens, if any. */
export async function latestJob(accountId: string, symbol: string, lensKey: string) {
  const job = await prisma.companyReportJob.findFirst({ where: { accountId, symbol, lensKey }, orderBy: { startedAt: "desc" } });
  return job ? viewJob(job) : null;
}

/** Do the work for a job, recording stages and the outcome. */
export async function runReportJob(job: CompanyReportJob, userId: string) {
  const stages: string[] = [];
  try {
    const report = await generateCompanyReport({
      userId,
      accountId: job.accountId,
      symbol: job.symbol,
      lensKey: job.lensKey,
      onStage: (label) => {
        stages.push(label);
        void prisma.companyReportJob
          .update({ where: { id: job.id }, data: { stages: stages as unknown as Prisma.InputJsonValue } })
          .catch(() => {});
      },
    });
    await prisma.companyReportJob.update({
      where: { id: job.id },
      data: { status: "DONE", reportId: report.id, finishedAt: new Date(), stages: stages as unknown as Prisma.InputJsonValue },
    });
    await computeCompanyScore({ userId, accountId: job.accountId, symbol: job.symbol, lensKey: job.lensKey }).catch((err) =>
      console.error("[score after report]", err)
    );
    return report;
  } catch (err) {
    console.error("[company report job]", err);
    await prisma.companyReportJob.update({
      where: { id: job.id },
      data: { status: "ERROR", error: err instanceof Error ? err.message : "Report failed", finishedAt: new Date() },
    });
    throw err;
  }
}

/** Create a job row (or return the one already running for this stock and lens). */
export async function createReportJob(opts: { userId: string; accountId: string; symbol: string; lensKey: string | null }) {
  const lens = await resolveLens(opts.userId, opts.lensKey);
  const existing = await liveRunning(opts.accountId, opts.symbol, lens.key);
  if (existing) return { job: existing, created: false };
  const job = await prisma.companyReportJob.create({
    data: { accountId: opts.accountId, symbol: opts.symbol, lensKey: lens.key, status: "RUNNING", stages: ["Queued"] },
  });
  return { job, created: true };
}

/**
 * Start a report in the background from a route handler. Returns immediately;
 * the work continues after the response is sent.
 */
export async function startReportJob(opts: { userId: string; accountId: string; symbol: string; lensKey: string | null }): Promise<JobView> {
  const { job, created } = await createReportJob(opts);
  if (created) after(() => runReportJob(job, opts.userId).catch(() => {}));
  return viewJob(job);
}
