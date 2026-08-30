// Append-only audit writes. Fire-and-forget on purpose: the trail must never be the
// reason an action fails, so errors are logged and swallowed. Reading happens on the
// owner-only /admin/audit page.

import { dbRoot } from "@/db";
import { auditLog } from "@/db/schema";
import type { AdminSession } from "./admin-auth";

export function logAudit(session: AdminSession, action: string, subject: string): void {
  void dbRoot
    .insert(auditLog)
    .values({
      actorUserId: session.userId,
      actorLabel: session.label,
      action,
      subject: subject.slice(0, 300),
    })
    .catch((error) => console.warn("audit write failed", error));
}
