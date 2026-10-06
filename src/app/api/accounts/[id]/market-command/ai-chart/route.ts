import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/api-helpers";
import { aiChartInsightSchema } from "@/lib/validations";
import { upsertMarketEnvironment } from "@/lib/services/marketEnvironmentService";

const CHART_ANALYSIS_PROMPT = `You are a technical analysis assistant. Analyze this trading chart image and return a JSON object only (no markdown, no explanation) with these exact keys:
- trendDirection: "BULLISH" | "BEARISH" | "NEUTRAL"
- maPositioning: "ABOVE_200" | "BELOW_200" | "MIXED" (price vs 200 MA if visible)
- momentumState: short string describing momentum (e.g. "Strong", "Weak", "Diverging")
- volumeBehavior: "ACCUMULATION" | "DISTRIBUTION" | "NEUTRAL"
- breakoutConsolidation: short string (e.g. "Breakout above resistance", "Consolidating")
- keyLevelZones: short string or array of approximate levels
- suggestedEnvironmentLabel: one of "Trending Risk-On", "Mild Risk-On", "Mixed / Transitional", "Mild Risk-Off", "High Vol Risk-Off"
- confidenceScore: number 0-100
- evidenceSummary: 2-3 sentence summary of what you see`;

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

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "AI chart analysis is not configured (OPENAI_API_KEY)" },
          { status: 503 }
        );
      }

      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      const mimeType = file.type || "image/png";

      const openai = new OpenAI({ apiKey });
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 800,
        messages: [
          { role: "system", content: CHART_ANALYSIS_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
      });

      const rawContent = response.choices[0]?.message?.content?.trim() ?? "{}";
      let parsed: unknown;
      try {
        const jsonStr = rawContent.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
        parsed = JSON.parse(jsonStr);
      } catch {
        return NextResponse.json(
          { error: "AI returned invalid JSON", raw: rawContent.slice(0, 200) },
          { status: 502 }
        );
      }

      const validated = z
        .object({
          trendDirection: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]).nullable(),
          maPositioning: z.enum(["ABOVE_200", "BELOW_200", "MIXED"]).nullable(),
          momentumState: z.string().nullable().optional(),
          volumeBehavior: z.enum(["ACCUMULATION", "DISTRIBUTION", "NEUTRAL"]).nullable(),
          breakoutConsolidation: z.string().optional(),
          keyLevelZones: z.unknown().optional(),
          suggestedEnvironmentLabel: z.string().optional(),
          confidenceScore: z.number().min(0).max(100),
          evidenceSummary: z.string().optional(),
        })
        .parse(parsed);

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
            aiConfidenceScore: validated.confidenceScore,
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
