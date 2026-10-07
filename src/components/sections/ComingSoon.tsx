import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { Section, SectionTool } from "@/lib/sections";

/** Placeholder for a section tool that hasn't been built yet. */
export function ComingSoon({ section, tool }: { section: Section; tool: SectionTool }) {
  return (
    <div className="space-y-6">
      <Link href={section.href} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />
        {section.label}
      </Link>
      <div className="rise-in rounded-2xl border border-border bg-card p-10 text-center shadow-card">
        <span className="mx-auto grid place-items-center w-12 h-12 rounded-2xl bg-accent/10 text-accent">
          <tool.icon className="w-6 h-6" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight mt-4">{tool.label}</h1>
        <p className="text-muted text-sm mt-2 max-w-md mx-auto">{tool.description}</p>
        <Badge className="mt-4">Coming soon</Badge>
      </div>
    </div>
  );
}
