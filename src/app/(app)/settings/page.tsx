"use client";

import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";
import { CriteriaEditor } from "@/components/fundamentals/CriteriaEditor";
import { FinvizConnect } from "@/components/research/FinvizConnect";
import { ProfileSettings } from "@/components/foundation/ProfileSettings";
import { AdvisorKeySettings } from "@/components/foundation/AdvisorKeySettings";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted text-sm mt-1">Manage your account preferences</p>
      </div>

      <ProfileSettings />

      <AdvisorKeySettings />

      <div className="space-y-2">
        <CriteriaEditor />
        <p className="text-xs text-muted px-1">
          These are your default criteria, used when no investor lens is selected. To save named strategies with their own
          Finviz filters and research questions, use Research → Screener.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Configure how and when you receive notifications.
          </CardDescription>
        </CardHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
            <div>
              <p className="text-sm font-medium">Daily Digest Email</p>
              <p className="text-xs text-muted">Sent at 4:30 PM local time via SendGrid</p>
            </div>
            <Badge variant="success">Active</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
            <div>
              <p className="text-sm font-medium">In-App Notifications</p>
              <p className="text-xs text-muted">Always enabled for reinvest signals and trade updates</p>
            </div>
            <Badge variant="success">Active</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
            <div>
              <p className="text-sm font-medium">Instant Email Alerts</p>
              <p className="text-xs text-muted">Get immediate email for urgent reinvest signals</p>
            </div>
            <Badge variant="default">Optional</Badge>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integration Status</CardTitle>
          <CardDescription>
            Connected services and integrations.
          </CardDescription>
        </CardHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-background border border-border">
            <div>
              <p className="text-sm font-medium">SendGrid</p>
              <p className="text-xs text-muted">Email delivery service</p>
            </div>
            <Badge variant={process.env.NEXT_PUBLIC_HAS_SENDGRID ? "success" : "warning"}>
              {process.env.NEXT_PUBLIC_HAS_SENDGRID ? "Connected" : "Not Configured"}
            </Badge>
          </div>
          <Link
            href="/connect/schwab"
            className="flex items-center justify-between p-3 rounded-lg bg-background border border-border hover:border-accent/40 transition-colors"
          >
            <div>
              <p className="text-sm font-medium">Charles Schwab</p>
              <p className="text-xs text-muted">Read-only sync of positions, trades and fees</p>
            </div>
            <span className="text-xs text-accent">Manage connection →</span>
          </Link>
          <div className="space-y-2 p-3 rounded-lg bg-background border border-border">
            <div>
              <p className="text-sm font-medium">Finviz Elite</p>
              <p className="text-xs text-muted">Powers the Research screener with your own Finviz subscription</p>
            </div>
            <FinvizConnect compact />
          </div>
        </div>
      </Card>
    </div>
  );
}
