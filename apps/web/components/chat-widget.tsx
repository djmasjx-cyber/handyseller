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
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string>("");
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingRef = useRef(false);
  // Track previous message count to detect new incoming messages
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setUnreadCount(0);
    setIsNearBottom(true);
  }, []);

  // Detect whether user is near the bottom of the scroll container
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 80; // px from bottom considered "near bottom"
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsNearBottom(near);
    if (near) setUnreadCount(0);
  }, []);

  // Smart auto-scroll: only scroll if user is already near the bottom
  useEffect(() => {
    const newCount = messages.length;
    const prev = prevMessageCountRef.current;
    prevMessageCountRef.current = newCount;

    if (newCount <= prev) return; // no new messages (e.g. initial load handled separately)

    if (isNearBottom) {
      scrollToBottom("smooth");
    } else {
      // User scrolled up — count incoming messages (not sent by user)
      const newMessages = messages.slice(prev);
      const incomingCount = newMessages.filter((m) => m.role !== "user").length;
      if (incomingCount > 0) {
        setUnreadCount((c) => c + incomingCount);
      }
    }
  }, [messages, isNearBottom, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Server is the single source of truth for messages
  const syncMessages = useCallback(async () => {
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
      setMessages(
        data.messages.map((m) => ({
          role: m.role as Message["role"],
          content: m.content,
        }))
      );
    } catch {
      // ignore transient errors
    }
  }, []);

  // Load history immediately on open; poll every 3s while chat is open
  useEffect(() => {
    if (!open) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // On open: load history then jump straight to bottom (instant, no animation)
    syncMessages().then(() => {
      setTimeout(() => scrollToBottom("instant" as ScrollBehavior), 50);
    });

    pollingIntervalRef.current = setInterval(() => {
      // Skip poll while a send is in flight to avoid overwriting optimistic message
      if (!loadingRef.current) {
        syncMessages();
      }
    }, 3000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [open, syncMessages, scrollToBottom]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    // Optimistic: show user message immediately
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsNearBottom(true);
    setUnreadCount(0);
    setLoading(true);
    setTimeout(() => scrollToBottom("smooth"), 30);

    try {
      // Send to backend (GPT runs server-side)
      const res = await fetch("/api/assistant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, message: text }),
      });
      const data = await res.json();
      const replyLength: number = typeof data.reply === "string" ? data.reply.length : 120;

      // Simulate typing time proportional to reply length:
      // ~22 ms per character, min 900 ms, max 2800 ms.
      // Keeps the "typing" dots visible just long enough to feel human.
      const typingDelay = Math.min(Math.max(replyLength * 22, 900), 2800);
      await new Promise<void>((resolve) => setTimeout(resolve, typingDelay));

      // Now reveal the reply from server (single source of truth — no duplicates)
      await syncMessages();
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Не удалось получить ответ. Попробуйте позже." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, syncMessages]);

  return (
    <>
      {/* ── Toggle button — floating agent card ── */}
      <div className="fixed bottom-5 right-5 z-[9999]">
        {open ? (
          /* Close button — compact circle */
          <button
            onClick={() => setOpen(false)}
            aria-label="Закрыть чат"
            className="flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ background: "hsl(346.8, 77.2%, 49.8%)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : (
          /* Agent card — Intercom-style */
          <button
            onClick={() => setOpen(true)}
            aria-label="Открыть чат с Лерой"
            className="group flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-95"
            style={{ borderColor: "rgba(0,0,0,0.08)" }}
          >
            {/* Avatar with online indicator */}
            <div className="relative shrink-0">
              <img
                src="/lera-avatar.jpg"
                alt="Лера"
                className="h-11 w-11 rounded-full object-cover object-top ring-2 ring-white"
              />
              {/* Green online dot */}
              <span
                className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white"
                style={{ background: "#22c55e" }}
              />
            </div>

            {/* Text */}
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900 leading-tight">Лера</p>
              <p className="text-xs text-gray-500 leading-tight mt-0.5">Поддержка · обычно онлайн</p>
            </div>

            {/* Chat bubble icon */}
            <div
              className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110"
              style={{ background: "hsl(346.8, 77.2%, 49.8%)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
          </button>
        )}
      </div>

      {/* ── Chat window ── */}
      {open && (
        <div
          className="fixed bottom-24 right-5 z-[9998] flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
          style={{
            width: "min(380px, calc(100vw - 2.5rem))",
            height: "min(520px, calc(100vh - 8rem))",
            background: "hsl(var(--background))",
            borderColor: "hsl(var(--border))",
            position: "fixed",
          }}
        >
          {/* Scroll-to-bottom button — shown when user has scrolled up */}
          {!isNearBottom && (
            <button
              onClick={() => scrollToBottom("smooth")}
              className="absolute bottom-[60px] right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110"
              style={{ background: "hsl(346.8, 77.2%, 49.8%)" }}
              aria-label="Прокрутить вниз"
            >
              {unreadCount > 0 && (
                <span
                  className="absolute -top-2 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                  style={{ background: "#16a34a" }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}

          {/* Header — with Lera's avatar */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ background: "hsl(346.8, 77.2%, 49.8%)" }}
          >
            <div className="relative shrink-0">
              <img
                src="/lera-avatar.jpg"
                alt="Лера"
                className="h-10 w-10 rounded-full object-cover object-top ring-2 ring-white/40"
              />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[hsl(346.8,77.2%,49.8%)]" style={{ background: "#4ade80" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">Лера</p>
              <p className="text-xs text-white/80 leading-tight mt-0.5">HandySeller · Поддержка</p>
            </div>
            {/* Close button inside header */}
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
              aria-label="Закрыть"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="relative flex-1 overflow-y-auto px-4 py-3"
          >
            {messages.length === 0 && !loading && (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-2">
                <img
                  src="/lera-avatar.jpg"
                  alt="Лера"
                  className="h-16 w-16 rounded-full object-cover object-top shadow-lg"
                  style={{ boxShadow: "0 0 0 4px hsl(346.8,77.2%,49.8%,0.18)" }}
                />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                    Привет! Я Лера 👋
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Напишите — и я сразу отвечу
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 mt-1">
                  {["Как начать продавать?", "Как подключить WB?", "WB или Ozon?"].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 0); }}
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
                <div className={msg.role === "user" ? "" : "max-w-[85%]"}>
                  {msg.role === "operator" && (
                    <p className="mb-1 text-xs font-medium" style={{ color: "#2563eb" }}>
                      Оператор поддержки
                    </p>
                  )}
                  <div
                    className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                    style={
                      msg.role === "user"
                        ? { background: "hsl(346.8, 77.2%, 49.8%)", color: "white", borderBottomRightRadius: "4px", maxWidth: "85%" }
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
              <div className="mb-3 flex items-end gap-2 justify-start">
                {/* Lera avatar next to typing indicator */}
                <img
                  src="/lera-avatar.jpg"
                  alt="Лера"
                  className="h-6 w-6 rounded-full object-cover object-top shrink-0"
                />
                <div
                  className="flex items-center gap-1.5 rounded-2xl px-4 py-3"
                  style={{ background: "hsl(var(--muted))", borderBottomLeftRadius: "4px" }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--muted-foreground))", animation: "leraBounce 1.2s ease-in-out infinite", animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--muted-foreground))", animation: "leraBounce 1.2s ease-in-out infinite", animationDelay: "200ms" }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: "hsl(var(--muted-foreground))", animation: "leraBounce 1.2s ease-in-out infinite", animationDelay: "400ms" }} />
                </div>
                <style>{`
                  @keyframes leraBounce {
                    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                    30% { transform: translateY(-5px); opacity: 1; }
                  }
                `}</style>
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
