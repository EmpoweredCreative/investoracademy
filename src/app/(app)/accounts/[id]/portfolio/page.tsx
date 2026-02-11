"use client";

import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Lock, BarChart3 } from "lucide-react";
import Link from "next/link";

export default function PortfolioPage() {
  const params = useParams();
  const accountId = params.id as string;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link href={`/accounts/${accountId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="text-muted text-sm">Live portfolio view with Greeks</p>
        </div>
      </div>

      <Card className="text-center py-16">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-accent/5 border border-accent/20">
            <Lock className="w-12 h-12 text-accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Phase II: Live Portfolio</h2>
            <p className="text-muted mt-2 max-w-md mx-auto">
              Connect Schwab to enable live pricing, portfolio Greeks, and real-time position tracking.
              This feature will be available in Phase II.
            </p>
          </div>
          <div className="flex gap-6 mt-6">
            {[
              { label: "Live Quotes", desc: "Real-time stock & option pricing" },
              { label: "Greeks", desc: "Delta, Gamma, Theta, Vega" },
              { label: "Risk Metrics", desc: "Portfolio-level risk analysis" },
            ].map((feature) => (
              <div key={feature.label} className="text-center">
                <BarChart3 className="w-6 h-6 text-muted mx-auto mb-2" />
                <p className="text-sm font-medium">{feature.label}</p>
                <p className="text-xs text-muted">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
