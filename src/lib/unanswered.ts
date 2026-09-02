// Detector for "the bot punted": assistant turns that admitted not knowing. The
// Unanswered page is built on this - every hit is a fact the owner could add to the
// knowledge base. Heuristic by design (read-time scan, no schema change, works on all
// historical turns); precision matters more than recall, because every listed row asks
// the owner to do something.

import { FRIENDLY_ERROR } from "./moderation";

const PUNT_PATTERNS: RegExp[] = [
  /\bI(?:'|’)?m not sure\b/i,
  /\bI don(?:'|’)?t (?:know|have that (?:info|information))\b/i,
  /\bI can(?:'|’)?t (?:confirm|give you a (?:full |)(?:rating|definition|answer))\b/i,
  /\bnot something I can confirm\b/i,
  /\b(?:our|the|my) (?:current |)(?:info|menu|information|list|calendar)(?:rmation)? doesn(?:'|’)?t (?:list|include|mention|show)\b/i,
  /\bdoesn(?:'|’)?t list a specific\b/i,
  /\bno .{0,40}(?:scheduled|listed|on the (?:current |)(?:list|menu|calendar))\b/i,
];

// Deliberately NOT matched: polite scope refusals ("I can only help with questions
// about the business"), platform-help declines, and price deflections ("prices aren't
// published online") - those are the bot working as designed, not knowledge gaps.

/** True when an assistant turn admitted a knowledge gap (or was the friendly error). */
export function looksUnanswered(content: string): boolean {
  if (content === FRIENDLY_ERROR) return true;
  return PUNT_PATTERNS.some((pattern) => pattern.test(content));
}

/** The same patterns as one SQL regex, for filtering in the database instead of JS.
 *  Kept in lockstep with PUNT_PATTERNS by the unit test. */
export const UNANSWERED_SQL_REGEX = [
  "I['’]?m not sure",
  "I don['’]?t (know|have that (info|information))",
  "I can['’]?t (confirm|give you a (full )?(rating|definition|answer))",
  "not something I can confirm",
  "(our|the|my) (current )?(info|menu|information|list|calendar)(rmation)? doesn['’]?t (list|include|mention|show)",
  "doesn['’]?t list a specific",
  "no .{0,40}(scheduled|listed|on the (current )?(list|menu|calendar))",
].join("|");
