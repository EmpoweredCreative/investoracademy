import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { ADVISOR_MODEL, runAdvisorTurn, type AdvisorEvent, type Proposal } from "./advisor";
import { allowanceWindow, costUsd, type Usage } from "./advisorLimits";
import { loadFoundation } from "./store";

const PROVIDER = "anthropic";
const HISTORY_TURNS = 30;

export class AdvisorError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// ─── Own key (optional, unlimited) ───────────────────────────

export async function getOwnKey(userId: string): Promise<string | null> {
  const c = await prisma.apiCredential.findUnique({ where: { userId_provider: { userId, provider: PROVIDER } } });
  if (!c) return null;
  try {
    return decryptSecret(c.secret);
  } catch {
    return null;
  }
}

export async function ownKeyStatus(userId: string) {
  const c = await prisma.apiCredential.findUnique({ where: { userId_provider: { userId, provider: PROVIDER } } });
  return { connected: Boolean(c), hint: c?.hint ?? null };
}

/** Check the key with a free Models API call, then store it encrypted. */
export async function connectOwnKey(userId: string, key: string) {
  const k = key.trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) throw new AdvisorError("That doesn't look like a valid API key (it should start with sk-ant-).", 400);
  try {
    await new Anthropic({ apiKey: k }).models.retrieve(ADVISOR_MODEL);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AdvisorError("That key wasn't accepted. Check it and try again.", 400);
    }
    throw new AdvisorError("Couldn't check the key right now. Try again in a moment.", 502);
  }
  const data = { secret: encryptSecret(k), hint: k.slice(-4), verifiedAt: new Date() };
  await prisma.apiCredential.upsert({
    where: { userId_provider: { userId, provider: PROVIDER } },
    create: { userId, provider: PROVIDER, ...data },
    update: data,
  });
  return ownKeyStatus(userId);
}

export async function disconnectOwnKey(userId: string) {
  await prisma.apiCredential.deleteMany({ where: { userId, provider: PROVIDER } });
}

// ─── Allowance ───────────────────────────────────────────────

export async function getAllowance(userId: string, now = new Date()) {
  const first = await prisma.financeChatMessage.findFirst({
    where: { userId, role: "user" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const w = allowanceWindow(first?.createdAt ?? null, now);
  const used = await prisma.financeChatMessage.count({
    where: { userId, role: "user", usedOwnKey: false, createdAt: { gte: w.start, lt: w.end } },
  });
  return { limit: w.limit, used, remaining: Math.max(0, w.limit - used), resetsAt: w.end.toISOString(), intro: w.intro };
}

/** Pick the key for this request, or explain why the advisor can't run. */
async function resolveKey(userId: string): Promise<{ apiKey: string | null; ownKey: boolean }> {
  const own = await getOwnKey(userId);
  if (own) return { apiKey: own, ownKey: true };
  if (!process.env.ANTHROPIC_API_KEY) throw new AdvisorError("The advisor isn't set up on this server yet.", 503);
  const a = await getAllowance(userId);
  if (a.remaining <= 0) {
    throw new AdvisorError(
      `You've used your ${a.limit} included advisor messages ${a.intro ? "for your first month" : "for this month"}. They reset ${new Date(a.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, or add your own API key in Settings to keep going.`,
      429
    );
  }
  return { apiKey: null, ownKey: false };
}

// ─── Conversation ────────────────────────────────────────────

export async function getAdvisorState(userId: string) {
  const [messages, allowance, key] = await Promise.all([
    prisma.financeChatMessage.findMany({ where: { userId, archived: false }, orderBy: { createdAt: "asc" }, take: 200 }),
    getAllowance(userId),
    ownKeyStatus(userId),
  ]);
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY) || key.connected,
    ownKey: key,
    allowance,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      kind: m.kind,
      content: m.content,
      toolEvents: m.toolEvents ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** "Start over": hide the conversation but keep it for the cap count. */
export async function archiveConversation(userId: string) {
  await prisma.financeChatMessage.updateMany({ where: { userId, archived: false }, data: { archived: true } });
}

async function saveAssistant(userId: string, content: string, usage: Usage, ownKey: boolean, extra: { kind?: string; toolEvents?: unknown } = {}) {
  await prisma.financeChatMessage.create({
    data: {
      userId,
      role: "assistant",
      kind: extra.kind ?? "chat",
      content,
      toolEvents: extra.toolEvents ? (extra.toolEvents as Prisma.InputJsonValue) : undefined,
      usedOwnKey: ownKey,
      model: ADVISOR_MODEL,
      ...usage,
      costUsd: new Prisma.Decimal(costUsd(usage).toFixed(5)),
    },
  });
}

/** One advisor turn as a newline-delimited JSON stream of AdvisorEvents. */
export async function streamAdvisorTurn(userId: string, message: string): Promise<Response> {
  const { apiKey, ownKey } = await resolveKey(userId);

  const prior = (
    await prisma.financeChatMessage.findMany({
      where: { userId, archived: false, kind: "chat" },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
    })
  ).reverse();
  const userMessage = await prisma.financeChatMessage.create({ data: { userId, role: "user", content: message, usedOwnKey: ownKey } });

  // The API needs the conversation to start with a user turn and alternate roles.
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of prior) {
    const role = m.role === "assistant" ? "assistant" : "user";
    if (!m.content.trim() || (history.length === 0 && role === "assistant")) continue;
    const last = history[history.length - 1];
    if (last && last.role === role) last.content += `\n\n${m.content}`;
    else history.push({ role, content: m.content });
  }
  if (history.length && history[history.length - 1].role === "user") {
    history.push({ role: "assistant", content: "(No reply was recorded for the previous message.)" });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const emit = (e: AdvisorEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // Browser left mid-answer; finish so the reply and its cost are still saved.
        }
      };
      try {
        const { text, toolLog, usage } = await runAdvisorTurn({ userId, apiKey, history, message, emit });
        await saveAssistant(userId, text, usage, ownKey, { toolEvents: toolLog.length ? toolLog : undefined });
        if (!ownKey) {
          const a = await getAllowance(userId);
          emit({ t: "allowance", remaining: a.remaining, limit: a.limit });
        }
        emit({ t: "done" });
      } catch (err) {
        console.error("[foundation advisor]", err);
        // Claude never answered, so don't count this attempt against the person's allowance.
        await prisma.financeChatMessage.delete({ where: { id: userMessage.id } }).catch(() => {});
        emit({
          t: "error",
          message:
            err instanceof Anthropic.AuthenticationError
              ? ownKey
                ? "Your API key was rejected. Update it in Settings."
                : "The advisor isn't available right now. Please try again later."
              : err instanceof Anthropic.RateLimitError
                ? "The advisor is busy right now. Try again in a minute."
                : "Something went wrong. Please try again.",
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}

// ─── Statement reading ───────────────────────────────────────

export const STATEMENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"] as const;
export const STATEMENT_MAX_BYTES = 10 * 1024 * 1024;

const StatementSchema = z.object({
  document_type: z.enum(["credit_card", "loan", "mortgage", "bank_account", "investment_account", "retirement_account", "bill", "other"]),
  institution: z.string().nullable().describe("Lender, bank or company name. Never an account number."),
  balance: z.number().nullable().describe("Statement/current balance owed, or account value for bank and investment accounts"),
  statement_date: z.string().nullable().describe("YYYY-MM-DD"),
  apr_pct: z.number().nullable().describe("Purchase APR as a percent, if shown"),
  minimum_payment: z.number().nullable(),
  credit_limit: z.number().nullable(),
  amount_due: z.number().nullable().describe("For a bill: the amount due"),
  summary: z.string().describe("One or two sentences on what this statement shows, with no account numbers"),
});

const STATEMENT_PROMPT = `Read this financial statement and extract the fields. Use null for anything not shown. Never include account numbers, card numbers, or personal identifiers anywhere in your output, including the summary.`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const sameName = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return x.length > 2 && y.length > 2 && (x.includes(y) || y.includes(x));
};

/** Read a statement image/PDF with Claude and turn it into update proposals the person confirms. */
export async function readStatement(userId: string, file: { type: string; size: number; data: Buffer; name: string }) {
  if (!STATEMENT_TYPES.includes(file.type as (typeof STATEMENT_TYPES)[number])) {
    throw new AdvisorError("Upload a PNG, JPG, WebP or PDF of the statement.", 400);
  }
  if (file.size > STATEMENT_MAX_BYTES) throw new AdvisorError("That file is over 10 MB. Try a screenshot of just the summary area.", 400);
  const { apiKey, ownKey } = await resolveKey(userId);
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();

  await prisma.financeChatMessage.create({
    data: { userId, role: "user", kind: "statement", content: `Uploaded a statement (${file.name})`, usedOwnKey: ownKey },
  });

  const data = file.data.toString("base64");
  const source =
    file.type === "application/pdf"
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: file.type as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data },
        };

  const response = await client.messages.parse({
    model: ADVISOR_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(StatementSchema) },
    messages: [{ role: "user", content: [source, { type: "text", text: STATEMENT_PROMPT }] }],
  });
  const usage: Usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    await saveAssistant(userId, "I couldn't read that statement.", usage, ownKey, { kind: "statement" });
    throw new AdvisorError("We couldn't read that statement. Try a clearer screenshot of the summary section.", 422);
  }
  const s = response.parsed_output;
  const proposals = await statementProposals(userId, s);
  const text = `**Statement read:** ${s.summary}${proposals.length ? "\n\nConfirm the update below to save it." : "\n\nThere wasn't anything I could match to your records."}`;
  await saveAssistant(userId, text, usage, ownKey, { kind: "statement" });
  return { text, proposals, allowance: ownKey ? null : await getAllowance(userId) };
}

async function statementProposals(userId: string, s: z.infer<typeof StatementSchema>): Promise<Proposal[]> {
  const d = await loadFoundation(userId);
  const name = s.institution ?? "Statement";
  const asOf = s.statement_date && /^\d{4}-\d{2}-\d{2}$/.test(s.statement_date) && s.statement_date <= d.today ? s.statement_date : d.today;
  const debtType = { credit_card: "CREDIT_CARD", loan: "PERSONAL", mortgage: "MORTGAGE" } as const;

  if (s.document_type in debtType && s.balance != null) {
    const match = d.debts.find((x) => !x.paidOffAt && sameName(x.lender, name));
    const fields: Proposal["fields"] = { balance: s.balance, balanceAsOf: asOf };
    if (s.apr_pct != null) Object.assign(fields, { apr: s.apr_pct, aprIsEstimate: false });
    if (s.credit_limit != null) fields.creditLimit = s.credit_limit;
    if (match) {
      return [{ action: "update_debt", id: match.id, fields, label: `Update ${match.lender}: balance ${fmt(s.balance)}`, reason: s.summary }];
    }
    return [
      {
        action: "add_debt",
        fields: {
          lender: name,
          type: debtType[s.document_type as keyof typeof debtType],
          monthlyPayment: s.minimum_payment ?? 0,
          ...fields,
        },
        label: `Add ${name} (${fmt(s.balance)})`,
        reason: s.summary,
      },
    ];
  }

  const assetType = { bank_account: "CHECKING", investment_account: "INVESTMENT", retirement_account: "RETIREMENT" } as const;
  if (s.document_type in assetType && s.balance != null) {
    const match = d.assets.find((a) => sameName(a.name, name));
    if (match) {
      return [{ action: "update_asset", id: match.id, fields: { value: s.balance, asOf, valueIsEstimate: false }, label: `Update ${match.name}: ${fmt(s.balance)}`, reason: s.summary }];
    }
    return [
      {
        action: "add_asset",
        fields: { name, type: assetType[s.document_type as keyof typeof assetType], value: s.balance, asOf, valueIsEstimate: false },
        label: `Add ${name} (${fmt(s.balance)})`,
        reason: s.summary,
      },
    ];
  }

  if (s.document_type === "bill" && s.amount_due != null) {
    const match = d.bills.find((b) => sameName(b.name, name));
    if (match) return [{ action: "update_bill", id: match.id, fields: { amount: s.amount_due }, label: `Update ${match.name} to ${fmt(s.amount_due)}`, reason: s.summary }];
    return [
      { action: "add_bill", fields: { name, category: "OTHER", amount: s.amount_due, frequency: "MONTHLY" }, label: `Add bill: ${name} (${fmt(s.amount_due)})`, reason: s.summary },
    ];
  }
  return [];
}

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// ─── Spend reporting (admins) ────────────────────────────────

export function isAdmin(email: string | null | undefined) {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && list.includes(email.toLowerCase()));
}

/** Advisor spend on the app's key this calendar month, across everyone. */
export async function monthlySpend(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await prisma.financeChatMessage.findMany({
    where: { role: "assistant", usedOwnKey: false, createdAt: { gte: start } },
    select: { userId: true, costUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true },
  });
  const total = rows.reduce((s, r) => s + (r.costUsd?.toNumber() ?? 0), 0);
  const people = new Set(rows.map((r) => r.userId)).size;
  return {
    month: start.toISOString().slice(0, 7),
    replies: rows.length,
    people,
    totalUsd: Number(total.toFixed(2)),
    perPersonUsd: people ? Number((total / people).toFixed(2)) : 0,
    perReplyUsd: rows.length ? Number((total / rows.length).toFixed(4)) : 0,
    tokens: {
      input: rows.reduce((s, r) => s + r.inputTokens, 0),
      output: rows.reduce((s, r) => s + r.outputTokens, 0),
      cacheRead: rows.reduce((s, r) => s + r.cacheReadTokens, 0),
      cacheWrite: rows.reduce((s, r) => s + r.cacheWriteTokens, 0),
    },
  };
}
