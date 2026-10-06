import { Fragment, type ReactNode } from "react";

/**
 * Small, safe Markdown renderer for assistant replies (no HTML injection).
 * Supports headings, bold/italic/code, bullet and numbered lists, and pipe tables.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Table: header row + separator row
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows: string[][] = [];
      const split = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = split(line);
      i += 2;
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(split(lines[i]));
        i++;
      }
      blocks.push(
        <div key={blocks.length} className="overflow-x-auto my-2">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                {header.map((h, j) => (
                  <th key={j} className="text-left font-semibold px-2 py-1 border-b border-border">
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-border/50">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-1 num">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={blocks.length} className={`font-semibold mt-3 mb-1 ${heading[1].length <= 2 ? "text-[15px]" : "text-sm"}`}>
          {inline(heading[2])}
        </p>
      );
      i++;
      continue;
    }

    if (/^\s*([-*•]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+\.)\s+/, ""));
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={blocks.length} className={`${ordered ? "list-decimal" : "list-disc"} pl-5 my-1.5 space-y-0.5`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ListTag>
      );
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+\.)\s)/.test(lines[i]) && !lines[i].includes("|")) {
      para.push(lines[i]);
      i++;
    }
    if (para.length === 0) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={blocks.length} className="my-1.5">
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p)}
          </Fragment>
        ))}
      </p>
    );
  }

  return <div className="text-sm leading-relaxed">{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={m.index}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={m.index} className="num text-[0.85em] px-1 rounded bg-border/50">{tok.slice(1, -1)}</code>);
    else out.push(<em key={m.index}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
