// Two ways a tool-using model can hand back a non-answer, both seen on prod (2026-09-07):
//
//   1. It ANNOUNCES a tool call instead of making one: "Let me check the Helpdesk's coverage
//      for Austria." with no tool_calls. The loop took that as the final answer.
//   2. It never stops searching (a product the nomenclature does not name), burns every
//      round on tools, and the loop falls out with nothing to say.
//
// Both get one more chance instead of a shrug: a nudge to act now, without tools for case 2.

const PREAMBLE = /^\s*(let me|i(?:'ll| will| am going to| can) (?:check|look|search|find|see|get|verify)|one (?:moment|second)|checking|looking (?:up|into)|searching)\b/i;

/** A short answer that only promises to look something up, without having done it. */
export function isPreambleOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 200) return false;
  // A real answer that starts with "Let me explain" carries content after the first clause;
  // a preamble is one short sentence, often ending with the thing it was going to check.
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.length <= 2 && PREAMBLE.test(t);
}

/** The nudge appended when the model announced work instead of doing it. */
export const DO_IT_NOW =
  "Do that now: call the tool if you need it, then give the answer in full. Do not describe what you are about to do.";

/** The nudge for the last round: answer from what is already in the conversation. */
export const ANSWER_FROM_WHAT_YOU_HAVE =
  "You have searched enough. Answer now from the results already above. If nothing fits, say the knowledge base has no matching entry and give the closest general guidance. Do not search again.";
