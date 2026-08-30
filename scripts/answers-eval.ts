// The ANSWERS eval: end-to-end turns through the real chat API, graded by a DIFFERENT
// model (the `judge` alias — never grade your own homework).
//
//   docker compose exec app npm run eval:answers -- mugshot [eval/answers-golden.json]
//
// Where recall@k (kb:eval) grades retrieval, this grades what the visitor actually
// reads: faithfulness (nothing claimed beyond the facts) and completeness (the required
// facts arrive). The semantic answer cache is deliberately IN the loop — visitors get
// cached answers, so cached answers are what gets graded.

import { readFile } from "node:fs/promises";
import { and, eq, isNull } from "drizzle-orm";
import OpenAI from "openai";
import { dbRoot } from "../src/db";
import { apiKeys, tenants } from "../src/db/schema";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "judge";

const openai = new OpenAI({
  baseURL: process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1",
  apiKey: process.env.LITELLM_API_KEY ?? "sk-michi-dev",
});

interface GoldenCase {
  question: string;
  requiredFacts: string[];
  forbidden: string[];
}

interface Verdict {
  pass: boolean;
  missing: string[];
  violations: string[];
  note?: string;
}

async function askBot(embedKey: string, question: string): Promise<{ answer: string; cached: boolean }> {
  const response = await fetch(`${APP_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-embed-key": embedKey },
    body: JSON.stringify({ message: question }),
  });
  if (!response.ok) throw new Error(`chat ${response.status}: ${await response.text()}`);
  const raw = await response.text();
  let answer = "";
  let cached = false;
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      const payload = JSON.parse(line.slice(6));
      if (typeof payload.text === "string") answer += payload.text;
      if (payload.cached === true) cached = true;
    } catch {
      /* keep-alive or partial line */
    }
  }
  return { answer, cached };
}

async function judge(testCase: GoldenCase, answer: string): Promise<Verdict> {
  const completion = await openai.chat.completions.create({
    model: JUDGE_MODEL,
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You grade a cafe chatbot's answer. Judge MEANING, not wording; currency symbols and " +
          "spellings are equivalent (\u20b199 = P99 = PHP 99). Reply with ONLY " +
          'a JSON object: {"pass": boolean, "missing": string[], "violations": string[], "note": string}. ' +
          '"missing" lists required facts the answer failed to convey. "violations" lists ' +
          "forbidden claims the answer made. pass is true only when missing and violations are both empty. /no_think",
      },
      {
        role: "user",
        content: JSON.stringify({
          visitor_question: testCase.question,
          bot_answer: answer,
          required_facts: testCase.requiredFacts,
          forbidden_claims: testCase.forbidden,
        }),
      },
    ],
  });
  const text = completion.choices[0].message.content ?? "";
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return { pass: false, missing: [], violations: [], note: `unparseable verdict: ${text.slice(0, 120)}` };
  try {
    const parsed = JSON.parse(match[0]) as Verdict;
    return {
      pass: Boolean(parsed.pass),
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      violations: Array.isArray(parsed.violations) ? parsed.violations : [],
      note: typeof parsed.note === "string" ? parsed.note : undefined,
    };
  } catch {
    return { pass: false, missing: [], violations: [], note: `bad JSON: ${match[0].slice(0, 120)}` };
  }
}

async function main() {
  const [slug, fileArg] = process.argv.slice(2);
  if (!slug) {
    console.error("usage: answers-eval <tenant-slug> [golden.json]");
    process.exit(1);
  }

  const [row] = await dbRoot
    .select({ key: apiKeys.publicKey })
    .from(apiKeys)
    .innerJoin(tenants, eq(tenants.id, apiKeys.tenantId))
    .where(and(eq(tenants.slug, slug), eq(apiKeys.kind, "public"), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row?.key) {
    console.error(`no active public key for tenant '${slug}'`);
    process.exit(1);
  }

  const { cases } = JSON.parse(await readFile(fileArg ?? "eval/answers-golden.json", "utf8")) as {
    cases: GoldenCase[];
  };

  let passed = 0;
  for (const testCase of cases) {
    const { answer, cached } = await askBot(row.key, testCase.question);
    const verdict = await judge(testCase, answer);
    if (verdict.pass) passed += 1;
    const tag = verdict.pass ? "PASS" : "FAIL";
    console.log(`${tag}${cached ? " (cached)" : ""}  "${testCase.question}"`);
    if (!verdict.pass) {
      for (const item of verdict.missing) console.log(`        missing: ${item}`);
      for (const item of verdict.violations) console.log(`        violated: ${item}`);
      if (verdict.note) console.log(`        note: ${verdict.note}`);
      console.log(`        answer: ${answer.replace(/\s+/g, " ").slice(0, 220)}`);
    }
  }

  console.log(`\nanswers: ${passed}/${cases.length} pass (${Math.round((100 * passed) / cases.length)}%)`);
  process.exit(passed === cases.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
