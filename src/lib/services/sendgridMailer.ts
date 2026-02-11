import sgMail from "@sendgrid/mail";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@wheeltracker.app";

interface DigestData {
  userName: string;
  accounts: Array<{
    name: string;
    openInstances: number;
    reinvestReady: Prisma.Decimal;
    pendingSignals: number;
  }>;
}

/**
 * Send a daily digest email via SendGrid.
 */
export async function sendDailyDigest(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      accounts: {
        include: {
          strategyInstances: {
            where: { status: "OPEN" },
            select: { id: true },
          },
          reinvestSignals: {
            where: { status: { in: ["CREATED", "NOTIFIED"] } },
          },
        },
      },
    },
  });

  if (!user.email) return;

  const digestData: DigestData = {
    userName: user.name || "Trader",
    accounts: user.accounts.map((account) => ({
      name: account.name,
      openInstances: account.strategyInstances.length,
      reinvestReady: account.reinvestSignals
        .filter((s) => s.dueAt <= new Date())
        .reduce((sum, s) => sum.plus(s.amount), new Prisma.Decimal(0)),
      pendingSignals: account.reinvestSignals.length,
    })),
  };

  const html = buildDigestHtml(digestData);

  if (!process.env.SENDGRID_API_KEY) {
    console.log("[SendGrid] API key not configured. Digest email skipped.");
    console.log("[SendGrid] Would have sent to:", user.email);
    return;
  }

  try {
    await sgMail.send({
      to: user.email,
      from: FROM_EMAIL,
      subject: `WheelTracker Daily Digest - ${new Date().toLocaleDateString()}`,
      html,
    });

    // Create in-app notification
    await prisma.notification.create({
      data: {
        userId,
        title: "Daily Digest Sent",
        body: `Your daily digest has been emailed to ${user.email}`,
        sentAt: new Date(),
      },
    });

    // Mark signals as notified
    for (const account of user.accounts) {
      for (const signal of account.reinvestSignals) {
        if (signal.status === "CREATED") {
          await prisma.reinvestSignal.update({
            where: { id: signal.id },
            data: { status: "NOTIFIED" },
          });
        }
      }
    }
  } catch (error) {
    console.error("[SendGrid] Failed to send digest:", error);
    throw error;
  }
}

/**
 * Send an instant notification email.
 */
export async function sendInstantNotification(
  userId: string,
  subject: string,
  body: string
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
  });

  if (!process.env.SENDGRID_API_KEY) {
    console.log("[SendGrid] Instant notification skipped (no API key):", subject);
    return;
  }

  await sgMail.send({
    to: user.email,
    from: FROM_EMAIL,
    subject: `WheelTracker: ${subject}`,
    html: `<div style="font-family: sans-serif; padding: 20px;"><h2>${subject}</h2><p>${body}</p></div>`,
  });
}

function buildDigestHtml(data: DigestData): string {
  const accountRows = data.accounts
    .map(
      (a) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${a.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${a.openInstances}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">$${a.reinvestReady.toFixed(2)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${a.pendingSignals}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #1e293b; font-size: 24px;">WheelTracker Daily Digest</h1>
      <p style="color: #64748b;">Hello ${data.userName},</p>
      <p style="color: #64748b;">Here's your trading summary for today:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f8fafc;">
            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Account</th>
            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Open</th>
            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Reinvest $</th>
            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Signals</th>
          </tr>
        </thead>
        <tbody>
          ${accountRows}
        </tbody>
      </table>
      <p style="color: #94a3b8; font-size: 12px;">This email was sent by WheelTracker. Manage your preferences in the app.</p>
    </div>
  `;
}
