"use server";

// Every admin mutation. Server Actions rather than route handlers for one concrete
// reason: Next.js gives actions built-in CSRF protection (it compares Origin against
// Host), and route handlers get none. The chat API stays a route handler because it has
// to be callable cross-origin by a widget.
//
// requireAdmin() is the first line of each one. A guard in layout.tsx is UX only.

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbRoot } from "@/db";
import { apiKeys, tenants, type Branding, type ToolConfig } from "@/db/schema";
import { login, logout, requireAdmin } from "@/lib/admin-auth";
import { MAX_PERSONA_CHARS } from "@/lib/prompt";
import { normalizeOrigin } from "@/lib/tenant";
import { TOOL_PACKS } from "@/lib/tools";

const lines = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * The one place a tenant-influenced URL enters the system. Only an operator can set it,
 * but validate anyway: this process can reach the host's unauthenticated Ollama, the
 * database, and the LiteLLM admin port.
 */
function validateBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error(`${raw}: must be https`);
  if (url.port) throw new Error(`${raw}: explicit ports are not allowed`);
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(":");
  if (blocked) throw new Error(`${raw}: host is not allowed`);
  return `${url.protocol}//${url.host}`;
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const ok = await login(String(formData.get("password") ?? ""));
  if (!ok) return { error: "Wrong password." };
  redirect("/admin");
}

export async function logoutAction() {
  await requireAdmin();
  await logout();
  redirect("/admin/login");
}

export async function createTenantAction(_prev: unknown, formData: FormData) {
  await requireAdmin();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
    return { error: "Slug must be lowercase letters, numbers and dashes." };
  }
  if (!name) return { error: "Name is required." };

  try {
    const [tenant] = await dbRoot
      .insert(tenants)
      .values({
        slug,
        name,
        persona: `You are the assistant for ${name}. Answer questions about the business warmly and briefly.`,
        allowedOrigins: ["http://localhost:3001"],
      })
      .returning({ id: tenants.id });

    // A tenant with no key cannot be visited, so mint one immediately.
    await dbRoot.insert(apiKeys).values({
      tenantId: tenant.id,
      kind: "public",
      name: "default",
      publicKey: `pk_${randomBytes(18).toString("base64url")}`,
    });
    revalidatePath("/admin");
    redirect(`/admin/tenants/${tenant.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error; // redirect
    return { error: "That slug is already taken." };
  }
}

export async function saveTenantAction(tenantId: string, _prev: unknown, formData: FormData) {
  await requireAdmin();

  const persona = String(formData.get("persona") ?? "").trim();
  if (persona.length > MAX_PERSONA_CHARS) {
    return { error: `Persona must be ${MAX_PERSONA_CHARS} characters or fewer.` };
  }

  const origins: string[] = [];
  for (const raw of lines(formData.get("allowedOrigins"))) {
    const normalized = normalizeOrigin(raw);
    if (!normalized) return { error: `Not a valid origin: ${raw}` };
    origins.push(normalized);
  }

  // Rebuild toolConfig from the packs, so a tenant can never hold config for a pack that
  // does not exist, and never enable one that was not offered in the form.
  const toolConfig: ToolConfig = {};
  try {
    for (const pack of Object.values(TOOL_PACKS)) {
      const enabled = formData.get(`tool.${pack.id}.enabled`) === "on";
      const config: Record<string, unknown> = { enabled };
      for (const field of pack.configFields) {
        const value = String(formData.get(`tool.${pack.id}.${field.key}`) ?? "").trim();
        if (!value) {
          if (enabled && field.required) throw new Error(`${pack.label}: ${field.label} is required`);
          continue;
        }
        config[field.key] = field.type === "url" ? validateBaseUrl(value) : value;
      }
      toolConfig[pack.id] = config as ToolConfig[string];
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid tool config." };
  }

  const branding: Branding = {
    title: String(formData.get("brand.title") ?? "").trim() || undefined,
    subtitle: String(formData.get("brand.subtitle") ?? "").trim() || undefined,
    greeting: String(formData.get("brand.greeting") ?? "").trim() || undefined,
    placeholder: String(formData.get("brand.placeholder") ?? "").trim() || undefined,
    accent: String(formData.get("brand.accent") ?? "").trim() || undefined,
    suggestions: lines(formData.get("brand.suggestions")),
  };

  await dbRoot
    .update(tenants)
    .set({
      name: String(formData.get("name") ?? "").trim(),
      status: formData.get("status") === "disabled" ? "disabled" : "active",
      model: String(formData.get("model") ?? "").trim() || null,
      dailyMessageCap: Math.max(1, Number(formData.get("dailyMessageCap")) || 500),
      persona,
      branding,
      toolConfig,
      allowedOrigins: origins,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function createKeyAction(tenantId: string, formData: FormData) {
  await requireAdmin();
  await dbRoot.insert(apiKeys).values({
    tenantId,
    kind: "public",
    name: String(formData.get("name") ?? "").trim() || "untitled",
    publicKey: `pk_${randomBytes(18).toString("base64url")}`,
  });
  revalidatePath(`/admin/tenants/${tenantId}/keys`);
}

export async function revokeKeyAction(tenantId: string, keyId: string) {
  await requireAdmin();
  // Soft revoke: conversations keep a valid foreign key, and traffic still arriving on a
  // dead key stays visible.
  await dbRoot
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)));
  revalidatePath(`/admin/tenants/${tenantId}/keys`);
}
