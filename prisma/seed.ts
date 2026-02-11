import "dotenv/config";
import { PrismaClient, WheelCategory, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for seeding.");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // ─── Create Demo User ─────────────────────────────────────
  const hashedPassword = await bcrypt.hash("demo1234", 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@wheeltracker.app" },
    update: {},
    create: {
      name: "Demo Trader",
      email: "demo@wheeltracker.app",
      hashedPassword,
      timezone: "America/New_York",
      digestHour: 16,
      digestMinute: 30,
      notifyChannel: "IN_APP",
      notifyFreq: "DAILY_DIGEST",
    },
  });

  console.log(`User: ${user.email}`);

  // ─── Create Accounts ──────────────────────────────────────
  const simAccount = await prisma.account.upsert({
    where: { userId_name: { userId: user.id, name: "Paper Trading" } },
    update: {},
    create: {
      userId: user.id,
      name: "Paper Trading",
      mode: "SIMULATED",
      defaultPolicy: "CASHFLOW",
      notes: "Simulated account for testing strategies",
    },
  });

  const liveAccount = await prisma.account.upsert({
    where: { userId_name: { userId: user.id, name: "Schwab IRA" } },
    update: {},
    create: {
      userId: user.id,
      name: "Schwab IRA",
      mode: "LIVE_SCHWAB",
      defaultPolicy: "REINVEST_ON_CLOSE",
      notes: "IRA account - Schwab integration coming Phase II",
    },
  });

  console.log(`Accounts: ${simAccount.name}, ${liveAccount.name}`);

  // ─── Create Wheel Targets ─────────────────────────────────
  for (const account of [simAccount, liveAccount]) {
    const targets = [
      { category: "CORE" as WheelCategory, targetPct: 40 },
      { category: "MAD_MONEY" as WheelCategory, targetPct: 30 },
      { category: "FREE_CAPITAL" as WheelCategory, targetPct: 20 },
      { category: "RISK_MGMT" as WheelCategory, targetPct: 10 },
    ];

    for (const t of targets) {
      await prisma.wealthWheelTarget.upsert({
        where: {
          accountId_category: { accountId: account.id, category: t.category },
        },
        update: { targetPct: t.targetPct },
        create: {
          accountId: account.id,
          category: t.category,
          targetPct: t.targetPct,
        },
      });
    }
  }

  // ─── Create Underlyings ───────────────────────────────────
  const symbols = ["AAPL", "MSFT", "NVDA", "AMZN", "SPY"];
  const underlyings: Record<string, { id: string }> = {};

  for (const symbol of symbols) {
    const underlying = await prisma.underlying.upsert({
      where: {
        accountId_symbol: { accountId: simAccount.id, symbol },
      },
      update: {},
      create: {
        accountId: simAccount.id,
        symbol,
        premiumPolicy: symbol === "AAPL" ? "REINVEST_ON_CLOSE" : null,
      },
    });
    underlyings[symbol] = underlying;
  }

  // ─── Classify Underlyings ─────────────────────────────────
  const classifications: Record<string, WheelCategory> = {
    AAPL: "CORE",
    MSFT: "CORE",
    NVDA: "MAD_MONEY",
    AMZN: "MAD_MONEY",
    SPY: "CORE",
  };

  for (const [symbol, category] of Object.entries(classifications)) {
    await prisma.wealthWheelClassification.upsert({
      where: {
        accountId_underlyingId: {
          accountId: simAccount.id,
          underlyingId: underlyings[symbol].id,
        },
      },
      update: { category },
      create: {
        accountId: simAccount.id,
        underlyingId: underlyings[symbol].id,
        category,
      },
    });
  }

  // ─── Create Stock Lots (BUY) ──────────────────────────────
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // AAPL: 100 shares @ $175
  await prisma.stockLot.create({
    data: {
      accountId: simAccount.id,
      underlyingId: underlyings.AAPL.id,
      acquiredAt: sixtyDaysAgo,
      quantity: 100,
      remaining: 100,
      costBasis: 17500,
    },
  });

  // MSFT: 50 shares @ $410
  await prisma.stockLot.create({
    data: {
      accountId: simAccount.id,
      underlyingId: underlyings.MSFT.id,
      acquiredAt: sixtyDaysAgo,
      quantity: 50,
      remaining: 50,
      costBasis: 20500,
    },
  });

  // Ledger entries for stock buys
  await prisma.ledgerEntry.create({
    data: {
      accountId: simAccount.id,
      type: "STOCK_BUY",
      amount: 17500,
      occurredAt: sixtyDaysAgo,
      description: "BUY 100 AAPL @ $175.00",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      accountId: simAccount.id,
      type: "STOCK_BUY",
      amount: 20500,
      occurredAt: sixtyDaysAgo,
      description: "BUY 50 MSFT @ $410.00",
    },
  });

  // ─── Create Option Strategy Instances ─────────────────────

  // 1. OPEN: STO AAPL $180 CALL (covered call)
  const aaplCC = await prisma.strategyInstance.create({
    data: {
      accountId: simAccount.id,
      underlyingId: underlyings.AAPL.id,
      instrumentType: "OPTION",
      optionAction: "STO",
      callPut: "CALL",
      longShort: "SHORT",
      strike: 180,
      expiration: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000),
      quantity: 1,
      status: "OPEN",
      premiumPolicyOverride: "REINVEST_ON_CLOSE",
      wheelCategoryOverride: "CORE",
      notes: "Covered call on AAPL position",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      accountId: simAccount.id,
      strategyInstanceId: aaplCC.id,
      type: "PREMIUM_CREDIT",
      amount: 350,
      occurredAt: thirtyDaysAgo,
      description: "STO 1x AAPL $180 CALL @ $3.50",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      accountId: simAccount.id,
      strategyInstanceId: aaplCC.id,
      type: "FEE",
      amount: new Prisma.Decimal("0.65"),
      occurredAt: thirtyDaysAgo,
      description: "Fee for STO AAPL",
    },
  });

  // 2. OPEN: STO NVDA $800 PUT
  const nvdaPut = await prisma.strategyInstance.create({
    data: {
      accountId: simAccount.id,
      underlyingId: underlyings.NVDA.id,
      instrumentType: "OPTION",
      optionAction: "STO",
      callPut: "PUT",
      longShort: "SHORT",
      strike: 800,
      expiration: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      quantity: 1,
      status: "OPEN",
      notes: "Short put on NVDA support level",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      accountId: simAccount.id,
      strategyInstanceId: nvdaPut.id,
      type: "PREMIUM_CREDIT",
      amount: 520,
      occurredAt: thirtyDaysAgo,
      description: "STO 1x NVDA $800 PUT @ $5.20",
    },
  });

  // 3. FINALIZED: AAPL $170 PUT (expired worthless - profit)
  const aaplPut = await prisma.strategyInstance.create({
    data: {
      accountId: simAccount.id,
      underlyingId: underlyings.AAPL.id,
      instrumentType: "OPTION",
      optionAction: "STO",
      callPut: "PUT",
      longShort: "SHORT",
      strike: 170,
      expiration: thirtyDaysAgo,
      quantity: 1,
      status: "FINALIZED",
      finalizationReason: "EXPIRED",
      finalizedAt: thirtyDaysAgo,
      realizedOptionProfit: new Prisma.Decimal("279.35"),
      premiumPolicyOverride: "REINVEST_ON_CLOSE",
      notes: "Expired worthless - full premium profit",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      accountId: simAccount.id,
      strategyInstanceId: aaplPut.id,
      type: "PREMIUM_CREDIT",
      amount: 280,
      occurredAt: sixtyDaysAgo,
      description: "STO 1x AAPL $170 PUT @ $2.80",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      accountId: simAccount.id,
      strategyInstanceId: aaplPut.id,
      type: "FEE",
      amount: new Prisma.Decimal("0.65"),
      occurredAt: sixtyDaysAgo,
      description: "Fee for STO AAPL $170 PUT",
    },
  });

  // Create reinvest signal for the finalized instance
  await prisma.reinvestSignal.create({
    data: {
      accountId: simAccount.id,
      underlyingId: underlyings.AAPL.id,
      instanceId: aaplPut.id,
      amount: new Prisma.Decimal("279.35"),
      dueAt: new Date(thirtyDaysAgo.getTime() + 48 * 60 * 60 * 1000),
      status: "CREATED",
    },
  });

  // 4. FINALIZED: MSFT $400 PUT (closed early)
  const msftPut = await prisma.strategyInstance.create({
    data: {
      accountId: simAccount.id,
      underlyingId: underlyings.MSFT.id,
      instrumentType: "OPTION",
      optionAction: "STO",
      callPut: "PUT",
      longShort: "SHORT",
      strike: 400,
      expiration: thirtyDaysAgo,
      quantity: 1,
      status: "FINALIZED",
      finalizationReason: "CLOSED",
      finalizedAt: new Date(thirtyDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000),
      realizedOptionProfit: new Prisma.Decimal("198.70"),
      notes: "Closed at 50% profit target",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      accountId: simAccount.id,
      strategyInstanceId: msftPut.id,
      type: "PREMIUM_CREDIT",
      amount: 310,
      occurredAt: sixtyDaysAgo,
      description: "STO 1x MSFT $400 PUT @ $3.10",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      accountId: simAccount.id,
      strategyInstanceId: msftPut.id,
      type: "PREMIUM_DEBIT",
      amount: 110,
      occurredAt: new Date(thirtyDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000),
      description: "BTC 1x MSFT $400 PUT @ $1.10",
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      accountId: simAccount.id,
      strategyInstanceId: msftPut.id,
      type: "FEE",
      amount: new Prisma.Decimal("1.30"),
      occurredAt: new Date(thirtyDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000),
      description: "Fees for MSFT trades",
    },
  });

  // ─── Journal Trades ───────────────────────────────────────
  await prisma.journalTrade.create({
    data: {
      accountId: simAccount.id,
      strategyInstanceId: aaplPut.id,
      underlyingId: underlyings.AAPL.id,
      strike: 170,
      callPut: "PUT",
      longShort: "SHORT",
      quantity: 1,
      entryPrice: new Prisma.Decimal("2.80"),
      entryDateTime: sixtyDaysAgo,
      exitPrice: new Prisma.Decimal("0"),
      exitDateTime: thirtyDaysAgo,
      thesisNotes:
        "AAPL support at $170, 30-day DTE short put. Expecting range-bound to slightly bullish action. IV elevated after earnings.",
      outcomeRating: "EXCELLENT",
      wheelCategoryOverride: "CORE",
    },
  });

  await prisma.journalTrade.create({
    data: {
      accountId: simAccount.id,
      strategyInstanceId: msftPut.id,
      underlyingId: underlyings.MSFT.id,
      strike: 400,
      callPut: "PUT",
      longShort: "SHORT",
      quantity: 1,
      entryPrice: new Prisma.Decimal("3.10"),
      entryDateTime: sixtyDaysAgo,
      targetPrice: new Prisma.Decimal("1.55"),
      exitPrice: new Prisma.Decimal("1.10"),
      exitDateTime: new Date(thirtyDaysAgo.getTime() + 7 * 24 * 60 * 60 * 1000),
      rewardRatio: new Prisma.Decimal("1.8"),
      riskPct: new Prisma.Decimal("2.5"),
      thesisNotes:
        "MSFT support at $400 round number. Selling 45-DTE put with 50% profit target. Strong earnings backdrop.",
      outcomeRating: "GOOD",
      wheelCategoryOverride: "CORE",
    },
  });

  // ─── Research Ideas ───────────────────────────────────────
  await prisma.researchIdea.create({
    data: {
      accountId: simAccount.id,
      underlyingId: underlyings.NVDA.id,
      strategyType: "SHORT_PUT",
      dte: 30,
      strikes: "780/750",
      deltas: "-0.20/-0.10",
      netCredit: new Prisma.Decimal("4.20"),
      bpe: new Prisma.Decimal("8000"),
      roi: new Prisma.Decimal("0.0525"),
      roid: new Prisma.Decimal("0.00175"),
      notes:
        "NVDA pullback to $800 support area. Looking at 30-DTE short put or bull put spread. ATR indicates $25-30 daily range.",
    },
  });

  await prisma.researchIdea.create({
    data: {
      accountId: simAccount.id,
      underlyingId: underlyings.AMZN.id,
      strategyType: "IRON_CONDOR",
      dte: 45,
      strikes: "175/170/200/205",
      deltas: "-0.15/0.10/-0.15/0.10",
      netCredit: new Prisma.Decimal("1.80"),
      bpe: new Prisma.Decimal("5000"),
      netDelta: new Prisma.Decimal("0.02"),
      roi: new Prisma.Decimal("0.036"),
      roid: new Prisma.Decimal("0.0008"),
      notes:
        "AMZN in consolidation range $175-$200. Iron condor to capture time decay. Low IV rank suggests wings should be tight.",
      wheelCategoryOverride: "MAD_MONEY",
    },
  });

  await prisma.researchIdea.create({
    data: {
      accountId: simAccount.id,
      underlyingId: underlyings.SPY.id,
      strategyType: "COVERED_CALL",
      dte: 21,
      strikes: "585",
      deltas: "-0.25",
      netCredit: new Prisma.Decimal("3.50"),
      bpe: new Prisma.Decimal("0"),
      roi: new Prisma.Decimal("0.006"),
      roid: new Prisma.Decimal("0.00029"),
      notes:
        "SPY covered call at 25-delta. Generating income on existing position. Monthly expiration cycle.",
      wheelCategoryOverride: "CORE",
    },
  });

  // ─── Notifications ────────────────────────────────────────
  await prisma.notification.create({
    data: {
      userId: user.id,
      accountId: simAccount.id,
      title: "Reinvest Signal: AAPL",
      body: "Your AAPL $170 PUT expired with $279.35 profit. Reinvest signal created.",
      read: false,
    },
  });

  await prisma.notification.create({
    data: {
      userId: user.id,
      title: "Welcome to WheelTracker",
      body: "Your account has been created. Start by adding a trading account and entering your first trade.",
      read: true,
    },
  });

  console.log("Seed completed successfully!");
  console.log("");
  console.log("Demo credentials:");
  console.log("  Email: demo@wheeltracker.app");
  console.log("  Password: demo1234");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
