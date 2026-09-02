// PDF → knowledge base triage. Pure text logic, deliberately separate from the PDF
// parser (unpdf, dynamically imported in the server action) so every rule here is
// unit-testable with plain strings.
//
// The philosophy, decided before the code: the model pass is the LAST step, not the
// first. Extraction is free, the mechanical junk (headers, page numbers, TOC dots) is
// removed deterministically for free, and the owner sees a token estimate plus targeted
// suggestions BEFORE any credit is spent. A dirty PDF's real cost is not tokens anyway:
// it is junk chunks that get retrieved instead of good facts, forever.

/** Upload cap for the PDF file itself. */
export const MAX_PDF_BYTES = 10_000_000;

/** One AI pass gets at most this much text (~30k input tokens). Bigger = split first. */
export const MAX_POLISH_CHARS = 120_000;

/** chars/4 is within ~20% of the real tokenizer for the languages this serves; the UI
 *  presents it as an estimate, never as a promise. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/** Input plus expected output: cleanup shrinks text, so output ≈ 0.6× input. */
export function estimateTotalTokens(chars: number): number {
  return Math.ceil(estimateTokens(chars) * 1.6);
}

export type Verdict = "green" | "yellow" | "red";

/** Green = about one busy conversation's worth; don't nag. Red = stop and trim. */
export function verdictFor(totalTokens: number): Verdict {
  if (totalTokens < 20_000) return "green";
  if (totalTokens < 100_000) return "yellow";
  return "red";
}

const PAGE_NUMBER = /^\s*(page\s+)?\d{1,4}(\s*(\/|of|\|)\s*\d{1,4})?\s*$/i;
const TOC_DOTS = /\.{5,}/;

const normalize = (line: string) => line.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Free, deterministic cleanup. Three rules, each safe enough to run unasked:
 *  - a line whose normalized form opens or closes 60%+ of pages is a running
 *    header/footer; drop every occurrence,
 *  - bare page numbers ("3", "Page 3 of 12") go,
 *  - dot-leader lines (tables of contents) go.
 * Everything else is kept verbatim; judgement calls belong to the owner or the model.
 */
export function cleanPages(pages: string[]): { text: string; removed: string[] } {
  const pageLines = pages.map((page) => page.split("\n").map((line) => line.trimEnd()));

  // Running headers/footers: look at the first and last two non-empty lines per page.
  const edgeCounts = new Map<string, number>();
  for (const lines of pageLines) {
    const nonEmpty = lines.filter((line) => line.trim() !== "");
    const edges = [...nonEmpty.slice(0, 2), ...nonEmpty.slice(-2)];
    for (const line of new Set(edges.map(normalize))) {
      if (line.length > 0 && line.length < 80) edgeCounts.set(line, (edgeCounts.get(line) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
  const headerFooters = new Set(
    [...edgeCounts.entries()]
      .filter(([line, count]) => count >= threshold && !PAGE_NUMBER.test(line))
      .map(([line]) => line),
  );

  const removed: string[] = [];
  let pageNumberLines = 0;
  let tocLines = 0;
  let headerFooterLines = 0;

  const cleanedPages = pageLines.map((lines) =>
    lines
      .filter((line) => {
        const trimmed = line.trim();
        if (trimmed === "") return true;
        if (headerFooters.has(normalize(line))) {
          headerFooterLines += 1;
          return false;
        }
        if (PAGE_NUMBER.test(trimmed)) {
          pageNumberLines += 1;
          return false;
        }
        if (TOC_DOTS.test(trimmed)) {
          tocLines += 1;
          return false;
        }
        return true;
      })
      .join("\n"),
  );

  if (headerFooterLines > 0) {
    const sample = [...headerFooters][0] ?? "";
    removed.push(
      `Removed a repeated header/footer (${headerFooterLines} lines, e.g. "${sample.slice(0, 50)}").`,
    );
  }
  if (pageNumberLines > 0) removed.push(`Removed ${pageNumberLines} page-number lines.`);
  if (tocLines > 0) removed.push(`Removed ${tocLines} table-of-contents dot lines.`);

  const text = cleanedPages
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, removed };
}

export interface PdfTriage {
  pages: number;
  charsRaw: number;
  charsClean: number;
  estTokensIn: number;
  estTokensTotal: number;
  verdict: Verdict;
  likelyScanned: boolean;
  suggestions: string[];
  removed: string[];
  text: string;
}

/** The whole free step: clean, measure, and say something USEFUL about this file. */
export function triagePdf(pages: string[]): PdfTriage {
  const charsRaw = pages.reduce((sum, page) => sum + page.length, 0);
  const emptyPages = pages.filter((page) => page.trim().length < 20).length;
  const likelyScanned = pages.length > 0 && emptyPages > pages.length / 2;

  const { text, removed } = cleanPages(pages);
  const estTokensIn = estimateTokens(text.length);
  const estTokensTotal = estimateTotalTokens(text.length);
  const verdict = verdictFor(estTokensTotal);

  const suggestions: string[] = [];
  if (likelyScanned) {
    suggestions.push(
      `${emptyPages} of ${pages.length} pages have no selectable text, so this PDF is probably scanned images. The bot cannot read pictures: re-export the file as text, or type the facts into a document instead.`,
    );
  }

  // Table-heavy content: prices and menus should come from the live tools, not the KB.
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const tableish = lines.filter(
    (line) => (line.match(/\s{2,}\S/g)?.length ?? 0) >= 3 || /(\d+[.,]\d{2}\s+){2,}/.test(line),
  ).length;
  if (lines.length > 0 && tableish / lines.length > 0.3) {
    suggestions.push(
      "A lot of this looks like tables or price lists. Prices and menu items should come from the live tools, not the knowledge base, so consider deleting those parts in the text box below.",
    );
  }

  if (verdict !== "green") {
    suggestions.push(
      "Long file: delete the sections customers never ask about (legal boilerplate, internal notes, old promos) in the text box below before running the AI tidy-up, or split it into one import per topic.",
    );
  }

  return {
    pages: pages.length,
    charsRaw,
    charsClean: text.length,
    estTokensIn,
    estTokensTotal,
    verdict,
    likelyScanned,
    suggestions,
    removed,
    text,
  };
}
