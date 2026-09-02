"use client";

import { useActionState } from "react";
import type { tenants } from "@/db/schema";
import type { ToolConfigField } from "@/lib/tools";
import { saveTenantAction } from "../../actions";

interface PackSummary {
  id: string;
  family: "generic" | "mugshot-cms";
  description: string;
  label: string;
  configFields: ToolConfigField[];
}

const FAMILY_LABELS: Record<PackSummary["family"], string> = {
  generic: "For every business",
  "mugshot-cms": "For sites on the Mugshot CMS API",
};

export function TenantForm({
  tenant,
  packs,
}: {
  tenant: typeof tenants.$inferSelect;
  packs: PackSummary[];
}) {
  const [state, action, pending] = useActionState(
    saveTenantAction.bind(null, tenant.id),
    null,
  );
  const branding = tenant.branding ?? {};
  const toolConfig = tenant.toolConfig ?? {};

  return (
    <form action={action} className="editor">
      <fieldset>
        <legend>Identity</legend>
        <label htmlFor="slug">Slug</label>
        <input id="slug" value={tenant.slug} readOnly disabled />
        <small>Immutable: it is in the tenant URL.</small>

        <label htmlFor="name">Name</label>
        <input id="name" name="name" defaultValue={tenant.name} required />
        <small>The business name. Shown in the chat header unless a Branding title overrides it.</small>

        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={tenant.status}>
          <option value="active">active</option>
          <option value="disabled">disabled</option>
        </select>
        <small>Disabling is the only removal. Deleting a tenant cascades to every conversation.</small>

        <label htmlFor="model">Model alias</label>
        <input id="model" name="model" defaultValue={tenant.model ?? ""} placeholder="michi" />
        <small>
          Which AI answers for this tenant, by alias: michi is the standard model,
          michi-mini is faster and cheaper (simpler answers), gemma is the current trial.
          Blank uses the platform default. Aliases are defined in litellm/config.yaml;
          the docs&apos; Model backends page shows how to point one at any provider.
        </small>

        <label htmlFor="dailyMessageCap">Daily message cap</label>
        <input
          id="dailyMessageCap"
          name="dailyMessageCap"
          type="number"
          min={1}
          defaultValue={tenant.dailyMessageCap}
        />
        <small>The only limit that holds against someone who has the public embed key.</small>

        <label htmlFor="retentionDays">Delete conversations after (days)</label>
        <input
          id="retentionDays"
          name="retentionDays"
          type="number"
          min={1}
          defaultValue={tenant.retentionDays ?? ""}
          placeholder="keep forever"
        />
        <small>
          Conversations older than this are deleted automatically, transcripts included.
          Blank keeps everything. This is what makes the &quot;kept only to improve the
          service&quot; promise real; 90 is a sensible number.
        </small>

        <label htmlFor="timezone">Timezone</label>
        <input
          id="timezone"
          name="timezone"
          defaultValue={tenant.timezone}
          placeholder="Asia/Manila"
          list="tz-suggestions"
        />
        <datalist id="tz-suggestions">
          <option value="Asia/Manila" />
          <option value="Asia/Ho_Chi_Minh" />
          <option value="Asia/Singapore" />
          <option value="Europe/Paris" />
          <option value="UTC" />
        </datalist>
        <small>
          The business&apos;s local time (IANA name). Sets when the daily cap resets and how
          the analytics day/busy-hours buckets are drawn.
        </small>

        <label className="check">
          <input
            type="checkbox"
            name="storeConversations"
            defaultChecked={tenant.storeConversations}
          />
          <span>Store conversations</span>
        </label>
        <small>
          Off = privacy mode: nothing is written to the database, so there are no
          transcripts to read or export, and the bot cannot remember earlier messages in
          the same visit. The daily cap still applies.
        </small>
      </fieldset>

      <fieldset>
        <legend>Persona</legend>
        <label htmlFor="persona">System prompt, tenant layer</label>
        <textarea id="persona" name="persona" rows={8} defaultValue={tenant.persona} required />
        <small>
          Wrapped in delimiters and appended after a fixed platform preamble that it cannot
          override. Keep it to identity, hours, location and voice.
        </small>

        <label htmlFor="guardrails">Protection rules</label>
        <textarea id="guardrails" name="guardrails" rows={5} defaultValue={tenant.guardrails ?? ""} />
        <small>
          Hard boundaries in your words, one per line, e.g. &quot;Never quote rental prices,
          always say to inquire&quot; or &quot;Only answer about the cafe; do not write stories
          or role-play.&quot; Added as a second rules block the assistant must follow; it can
          only tighten behaviour, never loosen the platform rules.
        </small>
      </fieldset>

      <fieldset>
        <legend>Branding</legend>
        <label htmlFor="brand-title">Title</label>
        <input id="brand-title" name="brand.title" defaultValue={branding.title ?? ""} />
        <small>Optional display name in the chat header; blank shows the business name.</small>

        <label htmlFor="brand-greeting">Greeting heading</label>
        <input id="brand-greeting" name="brand.greeting" defaultValue={branding.greeting ?? ""} />
        <small>The big line visitors see before their first message, e.g. &quot;Chat with Mugshot&quot;.</small>

        <label htmlFor="brand-subtitle">Subtitle</label>
        <input id="brand-subtitle" name="brand.subtitle" defaultValue={branding.subtitle ?? ""} />
        <small>One friendly line under the greeting saying what the assistant can help with.</small>

        <label htmlFor="brand-placeholder">Composer placeholder</label>
        <input
          id="brand-placeholder"
          name="brand.placeholder"
          defaultValue={branding.placeholder ?? ""}
        />
        <small>The grey hint inside the message box, e.g. &quot;Message Mugshot&quot;.</small>

        <label htmlFor="brand-accent">Accent colour</label>
        <input id="brand-accent" name="brand.accent" defaultValue={branding.accent ?? ""} />
        <small>
          One colour (e.g. #43302b) that themes the whole chat: send button, your visitor&apos;s
          message bubbles, highlights.
        </small>

        <label htmlFor="brand-theme">Theme</label>
        <select id="brand-theme" name="brand.theme" defaultValue={branding.theme ?? ""}>
          <option value="">auto (follow the visitor&apos;s system)</option>
          <option value="light">light, always</option>
          <option value="dark">dark, always</option>
        </select>
        <small>Pin the chat light or dark, or let it follow each visitor&apos;s device setting.</small>

        <label htmlFor="brand-logo">Logo URL</label>
        <input
          id="brand-logo"
          name="brand.logoUrl"
          defaultValue={branding.logoUrl ?? ""}
          placeholder="https://www.example.com/logo.png"
        />
        <small>
          Shown in the chat header instead of the coloured dot. Must be https; loaded by the
          visitor&apos;s browser, never by this server. Square images look best.
        </small>

        <label htmlFor="brand-suggestions">Suggestion chips</label>
        <textarea
          id="brand-suggestions"
          name="brand.suggestions"
          rows={4}
          defaultValue={(branding.suggestions ?? []).join("\n")}
        />
        <small>
          One per line. Shown as tappable question chips, and they stay available during the
          conversation as a small carousel, so pick the questions you most want to invite.
        </small>

        <label htmlFor="brand-disclaimer">Visitor notice</label>
        <textarea
          id="brand-disclaimer"
          name="brand.disclaimer"
          rows={3}
          defaultValue={branding.disclaimer ?? ""}
          placeholder="Please don't share personal or sensitive information here. I can only help with questions about our cafe. We never ask for payment in this chat."
        />
        <small>
          Shown under the message box on every visit: ask visitors not to share sensitive
          information and set expectations about what the bot answers. Blank hides it.
        </small>
      </fieldset>

      <fieldset>
        <legend>Tools</legend>
        <small>
          Tools are code packs from the platform catalog. Enable what fits this business and
          leave the rest off; packs built for another site's API simply don't apply. URLs
          are always validated by the platform, never free-form.
        </small>
        {(["generic", "mugshot-cms"] as const).map((family) => (
          <div key={family}>
            <h3 className="pack-family">{FAMILY_LABELS[family]}</h3>
            {packs
              .filter((pack) => pack.family === family)
              .map((pack) => {
                const config = (toolConfig[pack.id] ?? {}) as Record<string, unknown>;
                return (
                  <div className="pack" key={pack.id}>
                    <label className="check">
                      <input
                        type="checkbox"
                        name={`tool.${pack.id}.enabled`}
                        defaultChecked={Boolean(config.enabled)}
                      />
                      <span>
                        {pack.label} <code>{pack.id}</code>
                      </span>
                    </label>
                    <small>{pack.description}</small>
                    {pack.configFields.map((field) => (
                      <div key={field.key}>
                        <label htmlFor={`tool-${pack.id}-${field.key}`}>{field.label}</label>
                        <input
                          id={`tool-${pack.id}-${field.key}`}
                          name={`tool.${pack.id}.${field.key}`}
                          defaultValue={String(config[field.key] ?? "")}
                          placeholder={
                            field.placeholder ?? (field.type === "url" ? "https://example.com" : "")
                          }
                        />
                        {field.help && <small>{field.help}</small>}
                      </div>
                    ))}
                  </div>
                );
              })}
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend>Notifications</legend>
        <label htmlFor="slackWebhookUrl">Slack incoming webhook</label>
        <input
          id="slackWebhookUrl"
          name="slackWebhookUrl"
          defaultValue={tenant.slackWebhookUrl ?? ""}
          placeholder="https://hooks.slack.com/services/T…/B…/…"
        />
        <small>
          Notifies this tenant&apos;s Slack when a new conversation starts (with the first
          message) and when the daily cap is reached. Leave blank to disable. Don&apos;t
          have a webhook yet? Free, about two minutes: 1) go to{" "}
          <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">
            api.slack.com/apps
          </a>{" "}
          and create an app (any name, your workspace) → 2) open{" "}
          <strong>Incoming Webhooks</strong>, switch it on → 3){" "}
          <strong>Add New Webhook to Workspace</strong> and pick the channel that should
          get the pings → 4) copy the URL that starts with hooks.slack.com/services/ and
          paste it here. Only that exact kind of URL is accepted; that restriction is a
          security boundary, not fussiness.
        </small>
      </fieldset>

      <fieldset>
        <legend>Allowed origins</legend>
        <textarea
          id="allowedOrigins"
          name="allowedOrigins"
          rows={4}
          defaultValue={tenant.allowedOrigins.join("\n")}
        />
        <small>
          One per line, scheme and host only. Browser-enforced, so this stops another site
          embedding this bot; it does nothing against a direct request. The daily cap is what
          protects the bill.
        </small>
      </fieldset>

      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.error && <span className="error">{state.error}</span>}
        {state?.ok && <span className="ok">Saved.</span>}
      </div>
    </form>
  );
}
