import { ComingSoon } from "@/components/sections/ComingSoon";
import { FOUNDATION, sectionTools } from "@/lib/sections";

export default function Page() {
  const tool = sectionTools(FOUNDATION).find((t) => t.slug === "budget")!;
  return <ComingSoon section={FOUNDATION} tool={tool} />;
}
