// recall@k over the golden set: did the expected DOCUMENT appear in the top k chunks?
//
//   docker compose exec app npm run kb:eval -- mugshot [eval/kb-golden.json]
//
// Document-level recall is the honest metric at this KB size: chunk boundaries move
// every time content is edited, but "the hours question must hit the hours document"
// stays true. A miss prints what WAS retrieved, because that is the debugging you would
// do anyway.

import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { dbRoot } from "../src/db";
import { tenants } from "../src/db/schema";
import { searchKb } from "../src/lib/rag";

const K = 5;

interface GoldenCase {
  question: string;
  /** One title, or several when the fact legitimately lives in more than one document. */
  expectDoc: string | string[];
}

async function main() {
  const [slug, fileArg] = process.argv.slice(2);
  if (!slug) {
    console.error("usage: kb-eval <tenant-slug> [golden.json]");
    process.exit(1);
  }
  const file = fileArg ?? "eval/kb-golden.json";

  const [tenant] = await dbRoot
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!tenant) {
    console.error(`no tenant with slug '${slug}'`);
    process.exit(1);
  }

  const { cases } = JSON.parse(await readFile(file, "utf8")) as { cases: GoldenCase[] };
  const ranks: number[] = []; // 1-based rank of the first correct hit; Infinity = miss

  for (const testCase of cases) {
    const hits = await searchKb(tenant.id, testCase.question, K);
    const expected = Array.isArray(testCase.expectDoc) ? testCase.expectDoc : [testCase.expectDoc];
    // path[0] of the heading breadcrumb is always the document title.
    const rank = hits.findIndex((hit) => expected.includes(hit.heading.split(" > ")[0]));
    ranks.push(rank === -1 ? Infinity : rank + 1);

    if (rank === -1) {
      console.log(`MISS  "${testCase.question}" wanted [${expected.join(" | ")}]`);
      for (const hit of hits) {
        console.log(`        ${hit.distance.toFixed(3)}  ${hit.heading}`);
      }
    } else {
      console.log(`  @${rank + 1}  "${testCase.question}"`);
    }
  }

  const recallAt = (k: number) =>
    ((100 * ranks.filter((rank) => rank <= k).length) / ranks.length).toFixed(0);
  console.log(
    `\nrecall@1 ${recallAt(1)}%   recall@3 ${recallAt(3)}%   recall@${K} ${recallAt(K)}%   (${ranks.length} cases)`,
  );
  // A regression gate for CI later: fail when the top-k answer is missing outright.
  process.exit(ranks.every((rank) => rank <= K) ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
