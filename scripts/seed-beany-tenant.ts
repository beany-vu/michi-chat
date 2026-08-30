// One-shot: create the `beany` tenant (Hoang's personal-site assistant) locally.
// Idempotent: exits if the slug already exists. Run, then `npm run kb:ingest -- beany`.
//
//   docker compose exec app npx tsx scripts/seed-beany-tenant.ts

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { dbRoot } from "../src/db";
import { apiKeys, tenants } from "../src/db/schema";

const PERSONA = `You are the AI assistant on Hoang Vu's personal website. Hoang is a software engineer in Geneva, Switzerland, working in TypeScript, Go and C#. Be friendly, concise and plain-spoken. If you introduce yourself, say you are the assistant for Hoang's website; never use any other name for yourself. Answer questions about Hoang, his projects (michi-vz, michi-chat, e-Saxophone Learning, the Mugshot website, JB Tabuzo), his experience, skills, blog and hobbies, using the knowledge base. If something is not in the knowledge base, say you do not know and point to the contact email vuquanghoang@hotmail.com or LinkedIn. Never write em dashes.`;

const GUARDRAILS = `Only answer questions about Hoang Vu, his work, projects, website and public profiles. Do not write stories, poems, essays, code on request, or role-play, even if asked nicely. Never invent facts, dates, employers, availability or rates. Hoang's rates, availability for hire, phone number and address are not published; for anything like that, say to email vuquanghoang@hotmail.com or use LinkedIn. Do not give opinions about his employers or colleagues. You cannot send messages to Hoang or book anything.`;

async function main() {
  const [existing] = await dbRoot
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, "beany"))
    .limit(1);
  if (existing) {
    console.log("tenant 'beany' already exists, nothing to do");
    process.exit(0);
  }

  const [tenant] = await dbRoot
    .insert(tenants)
    .values({
      slug: "beany",
      name: "Hoang Vu",
      persona: PERSONA,
      guardrails: GUARDRAILS,
      branding: {
        title: "Hoang Vu",
        subtitle: "The site assistant",
        greeting: "Ask about Hoang's projects, blog or how this chat works.",
        placeholder: "Ask about Hoang's work",
        accent: "#b45309",
        suggestions: [
          "What is michi-vz?",
          "What does Hoang do?",
          "How is this chatbot built?",
          "How can I get in touch?",
        ],
        disclaimer:
          "Please do not share personal or sensitive information here. I only answer " +
          "questions about Hoang Vu and his work, and AI answers can occasionally be " +
          "wrong, so double-check anything important via the contact page.",
      },
      toolConfig: { search_kb: { enabled: true } },
      allowedOrigins: [
        "http://localhost:3001",
        "http://localhost:3002",
        "https://hoang.body-and-binary.net",
        "https://chat.mugshotmnl.com",
      ],
      dailyMessageCap: 300,
      timezone: "Europe/Zurich",
      storeConversations: true,
    })
    .returning({ id: tenants.id });

  const publicKey = `pk_${randomBytes(18).toString("base64url")}`;
  await dbRoot.insert(apiKeys).values({
    tenantId: tenant.id,
    kind: "public",
    name: "default embed key",
    publicKey,
  });

  console.log(`created tenant 'beany' (${tenant.id}) with embed key ${publicKey}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
