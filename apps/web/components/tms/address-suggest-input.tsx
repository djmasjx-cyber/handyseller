"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
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
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Suggestion[]>([])
  const [configured, setConfigured] = useState<boolean | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggest = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setItems([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/address-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json().catch(() => ({}))
      setItems(Array.isArray(data.suggestions) ? data.suggestions : [])
      if (typeof data.configured === "boolean") setConfigured(data.configured)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  return (
    <div className="space-y-2" ref={wrapRef}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          autoComplete="off"
          placeholder={placeholder}
          required={required}
          aria-autocomplete="list"
          aria-expanded={open}
          onChange={(e) => {
            const v = e.target.value
            onChange(v)
            setOpen(true)
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => fetchSuggest(v), 280)
          }}
          onFocus={() => {
            if (value.trim().length >= 2) setOpen(true)
          }}
        />
        {open && items.length > 0 ? (
          <ul
            role="listbox"
            className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-background shadow-md"
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
          </ul>
        ) : null}
        {loading ? (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            …
          </span>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {configured === false ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Подсказки адресов отключены: добавьте DADATA_TOKEN для сервера приложения.
        </p>
      ) : null}
    </div>
  )
}
