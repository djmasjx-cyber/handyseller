"use client"

import type { CSSProperties } from "react"
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Input, Label } from "@handyseller/ui"

type Suggestion = { label: string; value: string }

type Props = {
  id?: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  hint?: string
}

const DEBOUNCE_MS = 220
const MIN_CHARS = 1

export function AddressSuggestInput({
  id: externalId,
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
}: Props) {
  const genId = useId()
  const id = externalId ?? genId
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Suggestion[]>([])
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [apiHint, setApiHint] = useState<string | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLUListElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)

  useEffect(() => setMounted(true), [])

  const updatePanelPosition = useCallback(() => {
    const el = inputWrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const maxH = Math.min(280, window.innerHeight - r.bottom - 12)
    setPanelStyle({
      position: "fixed",
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 260),
      maxHeight: Math.max(120, maxH),
      zIndex: 10050,
    })
  }, [])

  const fetchSuggest = useCallback(async (q: string) => {
    const t = q.trim()
    if (t.length < MIN_CHARS) {
      setItems([])
      setApiHint(null)
      return
    }
    setLoading(true)
    setApiHint(null)
    try {
      const res = await fetch("/api/address-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: t }),
      })
      const data = await res.json().catch(() => ({}))
      setItems(Array.isArray(data.suggestions) ? data.suggestions : [])
      if (typeof data.configured === "boolean") setConfigured(data.configured)
      if (data.detail && typeof data.detail === "string") {
        setApiHint(data.detail)
      } else if (data.error === "dadata_http" && data.status === 401) {
        setApiHint("DaData: неверный или просроченный API-ключ (проверьте DADATA_TOKEN).")
      } else if (data.error === "dadata_http") {
        setApiHint("DaData временно недоступен или отказала в доступе.")
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useLayoutEffect(() => {
    if (!open || items.length === 0 || !mounted) {
      setPanelStyle(null)
      return
    }
    updatePanelPosition()
    const onScroll = () => updatePanelPosition()
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [open, items.length, mounted, updatePanelPosition])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const dropdown =
    mounted &&
    open &&
    items.length > 0 &&
    panelStyle &&
    createPortal(
      <ul
        ref={panelRef}
        role="listbox"
        className="overflow-auto rounded-md border bg-background py-1 shadow-lg"
        style={panelStyle}
      >
        {items.map((s, i) => (
          <li key={`${s.value}-${i}`} role="option">
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.value)
                setOpen(false)
                setItems([])
              }}
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>,
      document.body,
    )

  return (
    <div className="space-y-2" ref={wrapRef}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative" ref={inputWrapRef}>
        <Input
          id={id}
          value={value}
          autoComplete="off"
          placeholder={placeholder}
          required={required}
          aria-autocomplete="list"
          aria-expanded={open && items.length > 0}
          onChange={(e) => {
            const v = e.target.value
            onChange(v)
            setOpen(true)
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => fetchSuggest(v), DEBOUNCE_MS)
          }}
          onFocus={() => {
            setOpen(true)
            if (value.trim().length >= MIN_CHARS) void fetchSuggest(value)
          }}
        />
        {loading ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            …
          </span>
        ) : null}
      </div>
      {dropdown}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {configured === false ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Подсказки отключены: задайте DADATA_TOKEN (или DADATA_API_KEY) в окружении контейнера web.
        </p>
      ) : null}
      {apiHint ? <p className="text-xs text-destructive/90">{apiHint}</p> : null}
    </div>
  )
}
