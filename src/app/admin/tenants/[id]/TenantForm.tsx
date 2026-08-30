"use client";

import { useActionState } from "react";
import type { tenants } from "@/db/schema";
import type { ToolConfigField } from "@/lib/tools";
import { saveTenantAction } from "../../actions";

interface PackSummary {
  id: string;
  label: string;
  configFields: ToolConfigField[];
}

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

        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={tenant.status}>
          <option value="active">active</option>
          <option value="disabled">disabled</option>
        </select>
        <small>Disabling is the only removal. Deleting a tenant cascades to every conversation.</small>

        <label htmlFor="model">Model alias</label>
        <input id="model" name="model" defaultValue={tenant.model ?? ""} placeholder="michi" />
        <small>A LiteLLM alias. Blank falls back to CHAT_MODEL.</small>

        <label htmlFor="dailyMessageCap">Daily message cap</label>
        <input
          id="dailyMessageCap"
          name="dailyMessageCap"
          type="number"
          min={1}
          defaultValue={tenant.dailyMessageCap}
        />
        <small>The only limit that holds against someone who has the public embed key.</small>
      </fieldset>

      <fieldset>
        <legend>Persona</legend>
        <label htmlFor="persona">System prompt, tenant layer</label>
        <textarea id="persona" name="persona" rows={8} defaultValue={tenant.persona} required />
        <small>
          Wrapped in delimiters and appended after a fixed platform preamble that it cannot
          override. Keep it to identity, hours, location and voice.
        </small>
      </fieldset>

      <fieldset>
        <legend>Branding</legend>
        <label htmlFor="brand-title">Title</label>
        <input id="brand-title" name="brand.title" defaultValue={branding.title ?? ""} />

        <label htmlFor="brand-greeting">Greeting heading</label>
        <input id="brand-greeting" name="brand.greeting" defaultValue={branding.greeting ?? ""} />

        <label htmlFor="brand-subtitle">Subtitle</label>
        <input id="brand-subtitle" name="brand.subtitle" defaultValue={branding.subtitle ?? ""} />

        <label htmlFor="brand-placeholder">Composer placeholder</label>
        <input
          id="brand-placeholder"
          name="brand.placeholder"
          defaultValue={branding.placeholder ?? ""}
        />

        <label htmlFor="brand-accent">Accent colour</label>
        <input id="brand-accent" name="brand.accent" defaultValue={branding.accent ?? ""} />

        <label htmlFor="brand-suggestions">Suggestion chips</label>
        <textarea
          id="brand-suggestions"
          name="brand.suggestions"
          rows={4}
          defaultValue={(branding.suggestions ?? []).join("\n")}
        />
        <small>One per line.</small>

        <label htmlFor="brand-disclaimer">Visitor notice</label>
        <textarea
          id="brand-disclaimer"
          name="brand.disclaimer"
          rows={3}
          defaultValue={branding.disclaimer ?? ""}
          placeholder="Please don't share personal or sensitive information here. I can only help with questions about our cafe."
        />
        <small>
          Shown under the message box on every visit: ask visitors not to share sensitive
          information and set expectations about what the bot answers. Blank hides it.
        </small>
      </fieldset>

      <fieldset>
        <legend>Tools</legend>
        <small>
          Tools are code packs. A tenant enables one and fills in its parameters; the URL is
          always built by the platform, never supplied here in full.
        </small>
        {packs.map((pack) => {
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
              {pack.configFields.map((field) => (
                <div key={field.key}>
                  <label htmlFor={`tool-${pack.id}-${field.key}`}>{field.label}</label>
                  <input
                    id={`tool-${pack.id}-${field.key}`}
                    name={`tool.${pack.id}.${field.key}`}
                    defaultValue={String(config[field.key] ?? "")}
                    placeholder={field.type === "url" ? "https://example.com" : ""}
                  />
                </div>
              ))}
            </div>
          );
        })}
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
          Notifies this tenant&apos;s Slack when a new conversation starts and when the daily
          cap is reached. Must be exactly a hooks.slack.com/services/ URL; nothing else is
          accepted. Leave blank to disable.
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
