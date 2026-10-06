import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Prisma 7 requires a driver adapter; ensure DATABASE_URL is available at runtime."
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });
}

/** Dev hot-reload can keep an old PrismaClient missing new models — recreate when stale. */
function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached && "finvizCsvImport" in cached && "premiumBucketEntry" in cached && "brokerConnection" in cached && "dcfModel" in cached && "secFiling" in cached && "researchStrategy" in cached && "apiCredential" in cached && "companyReportJob" in cached && "companyScore" in cached) {
    return cached;
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient();

export default prisma;
