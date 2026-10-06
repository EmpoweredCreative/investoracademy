import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { aiChartInsightSchema } from "@/lib/validations";
import { upsertMarketEnvironment } from "@/lib/services/marketEnvironmentService";

const CHART_ANALYSIS_PROMPT = `You are a technical analysis assistant. Analyze the trading chart image and fill in these fields (use null when something isn't visible on the chart):
- trendDirection: "BULLISH" | "BEARISH" | "NEUTRAL"
- maPositioning: "ABOVE_200" | "BELOW_200" | "MIXED" (price vs 200 MA if visible)
- momentumState: short string describing momentum (e.g. "Strong", "Weak", "Diverging")
- volumeBehavior: "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL"
- breakoutConsolidation: short string (e.g. "Breakout above resistance", "Consolidating")
- keyLevelZones: short string or array of approximate levels
- suggestedEnvironmentLabel: one of "Trending Risk-On", "Mild Risk-On", "Mixed / Transitional", "Mild Risk-Off", "High Vol Risk-Off"
- confidenceScore: number 0-100
- evidenceSummary: 2-3 sentence summary of what you see`;

const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

const ChartAnalysisSchema = z.object({
  trendDirection: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]).nullable(),
  maPositioning: z.enum(["ABOVE_200", "BELOW_200", "MIXED"]).nullable(),
  momentumState: z.string().nullable(),
  volumeBehavior: z.enum(["ACCUMULATION", "DISTRIBUTION", "NEUTRAL"]).nullable(),
  breakoutConsolidation: z.string(),
  keyLevelZones: z.string(),
  suggestedEnvironmentLabel: z.enum([
    "Trending Risk-On",
    "Mild Risk-On",
    "Mixed / Transitional",
    "Mild Risk-Off",
    "High Vol Risk-Off",
  ]),
  confidenceScore: z.number(),
  evidenceSummary: z.string(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "Query param date (YYYY-MM-DD) required" }, { status: 400 });
    }

    const date = new Date(dateStr + "T00:00:00.000Z");
    const insights = await prisma.aIChartInsight.findMany({
      where: { userId, date },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      insights.map((a) => ({
        ...a,
        date: a.date.toISOString().slice(0, 10),
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: accountId } = await params;

    const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("chart") as File | null;
      const dateStr = formData.get("date") as string | null;
      const symbol = (formData.get("symbol") as string | null) ?? "SPY";
      const timeframe = (formData.get("timeframe") as string | null) ?? null;

      if (!file || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return NextResponse.json(
          { error: "Form fields required: chart (file), date (YYYY-MM-DD)" },
          { status: 400 }
        );
      }

      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          { error: "AI chart analysis is not configured (ANTHROPIC_API_KEY)" },
          { status: 503 }
        );
      }

      const mimeType = file.type || "image/png";
      if (!SUPPORTED_IMAGE_TYPES.includes(mimeType as (typeof SUPPORTED_IMAGE_TYPES)[number])) {
        return NextResponse.json({ error: "Upload a PNG, JPEG, GIF or WebP chart image." }, { status: 400 });
      }
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

      const client = new Anthropic();
      const response = await client.messages.parse({
        model: "claude-opus-5-5",
        max_tokens: 4000,
        output_config: { effort: "low", format: zodOutputFormat(ChartAnalysisSchema) },
        system: CHART_ANALYSIS_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType as (typeof SUPPORTED_IMAGE_TYPES)[number], data: base64 },
              },
              { type: "text", text: `Analyze this ${symbol.toUpperCase()}${timeframe ? ` ${timeframe}` : ""} chart.` },
            ],
          },
        ],
      });

      if (response.stop_reason === "refusal" || !response.parsed_output) {
        return NextResponse.json({ error: "Claude could not analyze that image. Try a clearer chart screenshot." }, { status: 502 });
      }
      const validated = response.parsed_output;
      const parsed = validated;

      const date = new Date(dateStr + "T00:00:00.000Z");

      const insight = await prisma.$transaction(async (tx) => {
        const created = await tx.aIChartInsight.create({
          data: {
            userId,
            date,
            symbol: symbol.toUpperCase(),
            timeframe,
            aiTrendAssessment: validated.trendDirection,
            aiMomentumAssessment: validated.momentumState ?? null,
            aiMAStatus: validated.maPositioning,
            aiVolumeCondition: validated.volumeBehavior,
            aiStructureNotes: validated.evidenceSummary ?? null,
            aiConfidenceScore: Math.max(0, Math.min(100, validated.confidenceScore)),
            sourceType: "CHART_UPLOAD",
            rawAIResponse: parsed as object,
          },
        });
        await upsertMarketEnvironment(userId, dateStr, tx);
        return created;
      });

      return NextResponse.json({
        ...insight,
        date: insight.date.toISOString().slice(0, 10),
      });
    }

    const body = await req.json();
    const data = aiChartInsightSchema.parse(body);
    const date = new Date(data.date + "T00:00:00.000Z");

    const insight = await prisma.$transaction(async (tx) => {
      const created = await tx.aIChartInsight.create({
        data: {
          userId,
          date,
          symbol: data.symbol,
          timeframe: data.timeframe ?? null,
          aiTrendAssessment: data.aiTrendAssessment ?? undefined,
          aiMomentumAssessment: data.aiMomentumAssessment ?? null,
          aiMAStatus: data.aiMAStatus ?? undefined,
          aiVolumeCondition: data.aiVolumeCondition ?? undefined,
          aiStructureNotes: data.aiStructureNotes ?? null,
          aiConfidenceScore: data.aiConfidenceScore ?? undefined,
          sourceType: data.sourceType ?? "CHART_UPLOAD",
          rawAIResponse: (data.rawAIResponse ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      await upsertMarketEnvironment(userId, data.date, tx);
      return created;
    });

    return NextResponse.json({
      ...insight,
      date: insight.date.toISOString().slice(0, 10),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
