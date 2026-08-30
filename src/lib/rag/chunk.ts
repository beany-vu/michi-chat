// Heading-aware markdown chunking. The unit of retrieval is a heading section, not a
// fixed character window: a menu section or an FAQ answer is a natural, self-contained
// fact, and slicing across a heading boundary is how a chunk ends up half question,
// half unrelated answer.
//
// Deliberately dependency-free and deterministic: same input, same chunks, so the
// contentHash on kb_documents is a reliable "nothing to re-embed" check.

export interface Chunk {
  /** Breadcrumb of the heading path, e.g. "Menu > Espresso drinks". */
  heading: string;
  content: string;
}

// Sections longer than this get split on paragraph boundaries. ~1500 chars is roughly
// 350 tokens: small enough that five results fit a 4B model's context comfortably.
export const MAX_CHUNK_CHARS = 1500;
// Sections shorter than this are merged into the following sibling rather than embedded
// alone; a two-line chunk carries too little signal to ever win a similarity search.
const MIN_CHUNK_CHARS = 80;

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

interface Section {
  path: string[];
  lines: string[];
}

/** Split markdown into heading-scoped sections, keeping the heading path of each. */
function sections(markdown: string, docTitle: string): Section[] {
  const out: Section[] = [{ path: [docTitle], lines: [] }];
  // path[0] is always the document title; index i holds the last heading of level i.
  const stack: string[] = [docTitle];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const match = inFence ? null : line.match(HEADING);
    if (!match) {
      out[out.length - 1].lines.push(line);
      continue;
    }
    const level = match[1].length;
    stack.length = Math.min(stack.length, level);
    stack[level] = match[2];
    // Materialize the path without holes (a doc can open with ### under nothing).
    out.push({ path: stack.filter((part) => part !== undefined), lines: [] });
  }
  return out;
}

/** Pack paragraphs into pieces of at most MAX_CHUNK_CHARS, never splitting a paragraph
 *  unless the paragraph alone is oversized (then it splits on line boundaries). */
function pack(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length <= MAX_CHUNK_CHARS ? [p] : splitLong(p)));

  const pieces: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > MAX_CHUNK_CHARS && current) {
      pieces.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function splitLong(paragraph: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const line of paragraph.split("\n")) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > MAX_CHUNK_CHARS && current) {
      out.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) out.push(current);
  return out;
}

export function chunkMarkdown(markdown: string, docTitle: string): Chunk[] {
  const chunks: Chunk[] = [];
  let pendingShort: Chunk | null = null;

  for (const section of sections(markdown, docTitle)) {
    const text = section.lines.join("\n").trim();
    if (!text) continue;
    // Dedupe consecutive parts: a doc whose H1 repeats the title reads "X > X" otherwise.
    const heading = section.path
      .filter((part, i, path) => i === 0 || part !== path[i - 1])
      .join(" > ");

    for (const piece of pack(text)) {
      if (pendingShort) {
        // Fold the too-short previous section in, keeping ITS heading visible in the
        // content so the fact stays attributed.
        chunks.push({
          heading,
          content: `${pendingShort.heading}: ${pendingShort.content}\n\n${piece}`,
        });
        pendingShort = null;
      } else if (piece.length < MIN_CHUNK_CHARS) {
        pendingShort = { heading, content: piece };
      } else {
        chunks.push({ heading, content: piece });
      }
    }
  }
  if (pendingShort) chunks.push(pendingShort);
  return chunks;
}
