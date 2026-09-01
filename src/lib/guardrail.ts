// A strike-based circuit breaker for prompt-injection bait.
//
// Honest scope: this does NOT make the model injection-proof (nothing does; the real
// invariant is that nothing sensitive ever enters the context - see prompt.ts). What it
// does is stop PERSISTENT baiting cheaply: each message matching an explicit bait
// pattern earns the session a strike, and past the threshold the session is refused for
// the rest of the window. The patterns are deliberately narrow - phrases with no honest
// reason to appear in a cafe chat - because a false positive here blocks a customer.

const BAIT_PATTERNS: RegExp[] = [
  /ignore (all|any|your|previous|prior|the) (instructions|rules|prompts?)/i,
  /disregard (your|all|the|previous) (instructions|rules|guidelines)/i,
  /(reveal|show|print|repeat|output) (your|the) (system )?(prompt|instructions|rules)/i,
  /system prompt/i,
  /you are (now|no longer)\s.{0,40}(dan|jailbroken|unrestricted|developer mode)/i,
  /jailbreak/i,
  /developer mode/i,
  /pretend (you have no|there are no) (rules|restrictions|guidelines)/i,
  /act as (an? )?(unrestricted|uncensored|unfiltered)/i,
  /\bdo anything now\b/i,
];

export function looksLikeBait(message: string): boolean {
  return BAIT_PATTERNS.some((pattern) => pattern.test(message));
}

// A bare slash command ("/context", "/reset", "/system prompt"). Real customers do not
// speak CLI; these come from people probing whether the widget is a thin wrapper around
// some agent with commands. There are no commands, and the honest, boring answer is a
// fixed line that never reaches the model, so there is nothing to talk around. Only a
// message that IS a command matches - a slash mid-sentence ("open 24/7?") never does.
const COMMAND_PATTERN = /^\/[a-z][\w-]{0,31}(\s+[\w./-]{1,40}){0,2}$/i;

export function looksLikeCommand(message: string): boolean {
  return COMMAND_PATTERN.test(message.trim());
}

export const COMMAND_REFUSAL =
  "I don't run commands like that, so that message may have been a typo. I'm happy to answer questions about the business, like the menu, hours, or events.";

/** Strikes allowed per session per window before the session is cut off. */
export const BAIT_STRIKES_PER_HOUR = 3;
export const BAIT_WINDOW_SECONDS = 3600;
