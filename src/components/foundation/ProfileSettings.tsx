"use client";

import { useEffect, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { PROFILE_OPTIONS } from "@/lib/foundation/labels";
import { PROFILE_EVENT } from "./useFoundation";

/** Settings card: how the person earns (shapes Foundation's tools). */
export function ProfileSettings() {
  const [profile, setProfile] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((r) => r.json())
      .then((j) => setProfile(j.profileType ?? null))
      .catch(() => setProfile(null));
  }, []);

  const choose = async (value: string) => {
    setSaving(true);
    setProfile(value);
    await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileType: value }),
    })
      .then(() => window.dispatchEvent(new Event(PROFILE_EVENT)))
      .finally(() => setSaving(false));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foundation profile</CardTitle>
        <CardDescription>How you earn your money. Business owners also get business tools and a tax-reserve estimate.</CardDescription>
      </CardHeader>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Foundation profile">
        {PROFILE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={profile === o.value}
            disabled={saving || profile === undefined}
            onClick={() => choose(o.value)}
            className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
              profile === o.value ? "border-accent bg-accent/5" : "border-border hover:bg-card-hover"
            }`}
          >
            <span className="block text-sm font-semibold">{o.label}</span>
            <span className="block text-xs text-muted mt-0.5">{o.description}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
