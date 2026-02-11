"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { ArrowLeft, PlusCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface ResearchIdea {
  id: string;
  strategyType: string;
  dte: number | null;
  strikes: string | null;
  deltas: string | null;
  netCredit: string | null;
  bpe: string | null;
  roi: string | null;
  roid: string | null;
  notes: string | null;
  underlying: { symbol: string };
  createdAt: string;
}

const STRATEGY_LABELS: Record<string, string> = {
  COVERED_CALL: "Covered Call",
  SHORT_PUT: "Short Put",
  BULL_PUT_SPREAD: "Bull Put Spread",
  BEAR_CALL_SPREAD: "Bear Call Spread",
  IRON_CONDOR: "Iron Condor",
  SHORT_STRANGLE: "Short Strangle",
  TIME_SPREAD: "Time Spread",
};

export default function ResearchPage() {
  const params = useParams();
  const accountId = params.id as string;
  const [ideas, setIdeas] = useState<ResearchIdea[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchIdeas = (strategyType?: string) => {
    const url = strategyType
      ? `/api/accounts/${accountId}/research?strategyType=${strategyType}`
      : `/api/accounts/${accountId}/research`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setIdeas(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchIdeas();
  }, [accountId]);

  const tabs = [
    { id: "all", label: "All Strategies" },
    ...Object.entries(STRATEGY_LABELS).map(([id, label]) => ({ id, label })),
  ];

  const handleTabChange = (tabId: string) => {
    setLoading(true);
    fetchIdeas(tabId === "all" ? undefined : tabId);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/accounts/${accountId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Theta Research</h1>
            <p className="text-muted text-sm">Research and plan options strategies</p>
          </div>
        </div>
        <Button size="sm">
          <PlusCircle className="w-4 h-4" />
          New Idea
        </Button>
      </div>

      <Tabs tabs={tabs} onChange={handleTabChange}>
        {() =>
          loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-card rounded-lg" />
              ))}
            </div>
          ) : ideas.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-muted">No research ideas yet. Start by adding a new idea.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ideas.map((idea) => (
                <Card key={idea.id} className="!p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg">{idea.underlying.symbol}</span>
                        <Badge variant="core">
                          {STRATEGY_LABELS[idea.strategyType] || idea.strategyType}
                        </Badge>
                      </div>
                      {idea.dte && <p className="text-xs text-muted">{idea.dte} DTE</p>}
                    </div>
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="w-4 h-4" />
                      Journal
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {idea.strikes && (
                      <div>
                        <p className="text-xs text-muted">Strikes</p>
                        <p className="font-medium">{idea.strikes}</p>
                      </div>
                    )}
                    {idea.netCredit && (
                      <div>
                        <p className="text-xs text-muted">Net Credit</p>
                        <p className="font-medium text-success">${parseFloat(idea.netCredit).toFixed(2)}</p>
                      </div>
                    )}
                    {idea.bpe && (
                      <div>
                        <p className="text-xs text-muted">BPE</p>
                        <p className="font-medium">${parseFloat(idea.bpe).toFixed(2)}</p>
                      </div>
                    )}
                    {idea.roi && (
                      <div>
                        <p className="text-xs text-muted">ROI</p>
                        <p className="font-medium">{(parseFloat(idea.roi) * 100).toFixed(2)}%</p>
                      </div>
                    )}
                    {idea.roid && (
                      <div>
                        <p className="text-xs text-muted">ROID</p>
                        <p className="font-medium">{(parseFloat(idea.roid) * 100).toFixed(4)}%</p>
                      </div>
                    )}
                    {idea.deltas && (
                      <div>
                        <p className="text-xs text-muted">Deltas</p>
                        <p className="font-medium">{idea.deltas}</p>
                      </div>
                    )}
                  </div>

                  {idea.notes && (
                    <p className="text-sm text-muted mt-3 line-clamp-2">{idea.notes}</p>
                  )}

                  <p className="text-xs text-muted mt-3">
                    {new Date(idea.createdAt).toLocaleDateString()}
                  </p>
                </Card>
              ))}
            </div>
          )
        }
      </Tabs>
    </div>
  );
}
