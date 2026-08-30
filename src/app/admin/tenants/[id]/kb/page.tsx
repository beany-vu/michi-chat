// The knowledge base editor for one tenant. Documents are markdown, chunked and
// embedded on save; the table shows the chunk count so a bad chunking outcome (one
// giant chunk, or fifty tiny ones) is visible immediately.

import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { kbDocuments, tenants } from "@/db/schema";
import { isAuthenticated } from "@/lib/admin-auth";
import { deleteKbDocumentAction } from "../../../actions";
import { KbImport } from "./KbImport";
import { KbForm } from "./KbForm";

export default async function KbPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const { id } = await params;
  const { doc } = await searchParams;

  const [tenant] = await dbRoot.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) notFound();

  const documents = await dbRoot
    .select({
      id: kbDocuments.id,
      title: kbDocuments.title,
      updatedAt: kbDocuments.updatedAt,
      // Raw table/column names on purpose: interpolating the drizzle objects here
      // produced a subquery that silently counted zero rows.
      chunkCount: sql<number>`(select count(*)::int from kb_chunks c where c.document_id = kb_documents.id)`,
    })
    .from(kbDocuments)
    .where(eq(kbDocuments.tenantId, id))
    .orderBy(desc(kbDocuments.updatedAt));

  // "Edit" prefills the form with the stored markdown; saving under the same title
  // replaces the document, so this needs no separate update path.
  const editing = doc
    ? (
        await dbRoot
          .select({ title: kbDocuments.title, content: kbDocuments.content })
          .from(kbDocuments)
          .where(and(eq(kbDocuments.id, doc), eq(kbDocuments.tenantId, id)))
          .limit(1)
      )[0]
    : undefined;

  return (
    <>
      <div className="head">
        <h1>{tenant.name}: knowledge base</h1>
        <div className="head-links">
          <a href={`/admin/kb-csv?tenant=${id}`}>Export CSV</a>
          <Link href={`/admin/tenants/${id}`}>Back to tenant</Link>
        </div>
      </div>

      <p className="note">
        This is where the facts live: every <code>##</code> heading section in a document is
        one retrievable fact, and the <code>search_kb</code> tool answers from them. Enable
        that pack on the tenant page or none of this reaches the bot. Facts follow the same
        rule as the persona: nothing you would not say to a customer at the counter.
      </p>

      {documents.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Chunks</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id}>
                <td>{document.title}</td>
                <td>{document.chunkCount}</td>
                <td>{document.updatedAt.toLocaleString()}</td>
                <td>
                  <Link className="row-action" href={`/admin/tenants/${id}/kb?doc=${document.id}#kb-editor`}>Edit</Link>{" "}
                  <form
                    action={deleteKbDocumentAction.bind(null, id, document.id)}
                    style={{ display: "inline" }}
                  >
                    <button type="submit" className="ghost">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <KbImport tenantId={id} />

      <div id="kb-editor">
        <KbForm
          key={doc ?? "new"}
          tenantId={id}
          initialTitle={editing?.title}
          initialContent={editing?.content}
        />
      </div>
    </>
  );
}
