/**
 * Minimal HTML → text for SEC filings (no DOM needed). Keeps paragraph breaks,
 * flattens tables to " | "-separated rows, drops inline-XBRL headers, and wraps
 * bold runs in BOLD_OPEN/BOLD_CLOSE so headings (e.g. risk factors) can be found.
 */
export const BOLD_OPEN = "\u0001";
export const BOLD_CLOSE = "\u0002";

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  bull: "•",
  middot: "·",
  reg: "®",
  trade: "™",
  copy: "©",
  sect: "§",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n)) return m;
      return n === 160 ? " " : String.fromCodePoint(n);
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

const BLOCK = /^(p|div|br|tr|li|h[1-6]|table|ul|ol|section|article|header|footer|blockquote|hr|title)$/;

function isBoldTag(tag: string, attrs: string) {
  if (tag === "b" || tag === "strong") return true;
  const style = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i.exec(attrs);
  const css = (style?.[1] ?? style?.[2] ?? "").toLowerCase();
  return /font-weight\s*:\s*(bold|[6-9]00)/.test(css);
}

function isHidden(attrs: string) {
  return /display\s*:\s*none/i.test(attrs);
}

export function htmlToText(html: string): string {
  // Drop things that never carry readable text.
  const src = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<ix:header\b[\s\S]*?<\/ix:header>/gi, "");

  const out: string[] = [];
  // Stack of open elements that matter: bold runs and hidden blocks.
  const stack: { tag: string; bold: boolean; hidden: boolean }[] = [];
  let hiddenDepth = 0;
  let boldDepth = 0;
  const tagRe = /<\/?([a-zA-Z][\w:.-]*)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(src))) {
    if (m[3] !== undefined) {
      if (hiddenDepth > 0) continue;
      const text = decodeEntities(m[3]).replace(/[\s ]+/g, " ");
      if (!text.trim()) {
        if (text) out.push(" ");
        continue;
      }
      out.push(boldDepth > 0 ? `${BOLD_OPEN}${text}${BOLD_CLOSE}` : text);
      continue;
    }
    const tag = m[1].toLowerCase();
    const attrs = m[2] ?? "";
    const closing = m[0][1] === "/";
    const selfClosing = /\/\s*$/.test(attrs) || tag === "br" || tag === "hr" || tag === "img";

    if (closing) {
      // Pop to the matching open tag (HTML in filings is mostly well-formed).
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          const [el] = stack.splice(i, 1);
          if (el.bold) boldDepth--;
          if (el.hidden) hiddenDepth--;
          break;
        }
      }
      if (hiddenDepth === 0) {
        if (BLOCK.test(tag)) out.push("\n");
        else if (tag === "td" || tag === "th") out.push(" | ");
      }
      continue;
    }

    if (hiddenDepth === 0 && BLOCK.test(tag)) out.push("\n");
    if (!selfClosing) {
      const bold = isBoldTag(tag, attrs);
      const hidden = isHidden(attrs);
      if (bold) boldDepth++;
      if (hidden) hiddenDepth++;
      stack.push({ tag, bold, hidden });
    }
  }

  return out
    .join("")
    .replace(new RegExp(`${BOLD_CLOSE}(\\s*)${BOLD_OPEN}`, "g"), "$1") // merge adjacent bold runs
    .replace(/[ \t]+/g, " ")
    .replace(/ *\| *(\| *)+/g, " | ")
    .replace(/^[ |]+|[ |]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const stripBold = (s: string) => s.replace(/[\u0001\u0002]/g, "");
