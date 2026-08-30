// Ingest a directory of markdown files into a tenant's knowledge base.
//
//   docker compose exec app npm run kb:ingest -- mugshot [dir]
//
// The directory defaults to kb/<slug>. The document title is the file's first H1, or
// the filename without extension. Unchanged files (same content hash) are skipped, so
// re-running after editing one file re-embeds only that file.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { dbRoot } from "../src/db";
import { tenants } from "../src/db/schema";
import { ingestDocument } from "../src/lib/rag";

async function main() {
  const [slug, dirArg] = process.argv.slice(2);
  if (!slug) {
    console.error("usage: kb-ingest <tenant-slug> [dir]");
    process.exit(1);
  }
  const dir = dirArg ?? join("kb", slug);

  const [tenant] = await dbRoot
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!tenant) {
    console.error(`no tenant with slug '${slug}'`);
    process.exit(1);
  }

  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) {
    console.error(`no .md files in ${dir}`);
    process.exit(1);
  }

  for (const file of files) {
    const content = await readFile(join(dir, file), "utf8");
    const title = content.match(/^#\s+(.+?)\s*$/m)?.[1] ?? file.replace(/\.md$/, "");
    const chunks = await ingestDocument({ tenantId: tenant.id, title, content });
    console.log(
      chunks === -1 ? `  = ${title} (unchanged)` : `  + ${title} (${chunks} chunks)`,
    );
  }
  console.log(`done: ${files.length} files for ${tenant.name}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
