"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant" | "operator";
  content: string;
}

function generateSessionId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getSessionId(): string {
  const KEY = "hs_assistant_sid";
  if (typeof window === "undefined") return generateSessionId();
  let sid = sessionStorage.getItem(KEY);
  if (!sid) {
    sid = generateSessionId();
    sessionStorage.setItem(KEY, sid);
  }
  return sid;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationStatus, setConversationStatus] = useState("active");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string>("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const pollHistory = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      const res = await fetch(
        `/api/assistant/history?sessionId=${encodeURIComponent(sessionIdRef.current)}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: Array<{ role: string; content: string }>;
        status: string;
      };
      setConversationStatus(data.status);

      const serverMessages: Message[] = data.messages.map((m) => ({
        role: m.role as Message["role"],
        content: m.content,
      }));
      setMessages(serverMessages);

      if (data.status === "operator_replied" || data.status === "active") {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    if (open && conversationStatus === "awaiting_operator") {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(pollHistory, 3000);
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [open, conversationStatus, pollHistory]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/assistant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, message: text }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { reply: string };
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);

      setTimeout(pollHistory, 500);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Не удалось получить ответ. Попробуйте позже или напишите нам в Telegram: @Handyseller_bot",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, pollHistory]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Закрыть чат" : "Открыть чат-ассистент"}
        className="fixed bottom-5 right-5 z-[9999] flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
        style={{ background: "hsl(346.8, 77.2%, 49.8%)" }}
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div
          className="fixed bottom-24 right-5 z-[9998] flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
          style={{
            width: "min(380px, calc(100vw - 2.5rem))",
            height: "min(520px, calc(100vh - 8rem))",
            background: "hsl(var(--background))",
            borderColor: "hsl(var(--border))",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ background: "hsl(346.8, 77.2%, 49.8%)" }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">HandySeller Ассистент</p>
              <p className="text-xs text-white/70">Помощь по продаже хендмейда</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollBehavior: "smooth" }}>
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "hsl(346.8, 77.2%, 49.8%, 0.1)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(346.8, 77.2%, 49.8%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                  Привет! Я ассистент HandySeller
                </p>
                <p className="mt-1 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Задайте вопрос о продаже хендмейда на маркетплейсах
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    "Как начать продавать?",
                    "Нужен ли сертификат?",
                    "WB или Ozon?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setInput(q);
                        setTimeout(() => {
                          inputRef.current?.focus();
                        }, 0);
                      }}
                      className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-[hsl(346.8,77.2%,49.8%)] hover:text-[hsl(346.8,77.2%,49.8%)]"
                      style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "operator" && (
                  <div className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "#2563eb" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                )}
                <div>
                  {msg.role === "operator" && (
                    <p className="mb-1 text-xs font-medium" style={{ color: "#2563eb" }}>
                      Оператор поддержки
                    </p>
                  )}
                  <div
                    className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                    style={
                      msg.role === "user"
                        ? { background: "hsl(346.8, 77.2%, 49.8%)", color: "white", borderBottomRightRadius: "4px" }
                        : msg.role === "operator"
                          ? { background: "#dbeafe", color: "#1e3a5f", borderBottomLeftRadius: "4px", border: "1px solid #93c5fd" }
                          : { background: "hsl(var(--muted))", color: "hsl(var(--foreground))", borderBottomLeftRadius: "4px" }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {conversationStatus === "awaiting_operator" && !loading && (
              <div className="mb-3 flex justify-start">
                <div
                  className="rounded-2xl px-3.5 py-2.5 text-xs italic"
                  style={{ background: "#fef3c7", color: "#92400e", borderBottomLeftRadius: "4px" }}
                >
                  Ваш вопрос передан оператору. Ожидайте ответа...
                </div>
              </div>
            )}

            {loading && (
              <div className="mb-3 flex justify-start">
                <div
                  className="flex gap-1 rounded-2xl px-4 py-3"
                  style={{ background: "hsl(var(--muted))", borderBottomLeftRadius: "4px" }}
                >
                  <span className="h-2 w-2 animate-bounce rounded-full" style={{ background: "hsl(var(--muted-foreground))", animationDelay: "0ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full" style={{ background: "hsl(var(--muted-foreground))", animationDelay: "150ms" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full" style={{ background: "hsl(var(--muted-foreground))", animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t px-3 py-2.5" style={{ borderColor: "hsl(var(--border))" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Введите вопрос..."
                disabled={loading}
                className="flex-1 rounded-xl border-0 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))]"
                style={{ color: "hsl(var(--foreground))" }}
                maxLength={1000}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-opacity disabled:opacity-30"
                style={{ background: "hsl(346.8, 77.2%, 49.8%)" }}
                aria-label="Отправить"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
