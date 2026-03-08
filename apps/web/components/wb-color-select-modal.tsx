"use client"

import { useState, useEffect, useMemo } from "react"
import { Button, Input } from "@handyseller/ui"
import { Loader2, Search } from "lucide-react"

interface WbColor {
  id: number
  name: string
}

interface WbColorSelectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (params: {
    wbColorId: number
    wbColorName: string
  }) => void
  token: string | null
}

export function WbColorSelectModal({
  open,
  onOpenChange,
  onSelect,
  token,
}: WbColorSelectModalProps) {
  const [colors, setColors] = useState<WbColor[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!open || !token) return
    setLoading(true)
    setError(null)
    fetch("/api/marketplaces/wb-colors", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setColors(data)
        else setColors([])
      })
      .catch(() => setError("Не удалось загрузить цвета"))
      .finally(() => setLoading(false))
  }, [open, token])

  const filteredColors = useMemo(() => {
    if (!search.trim()) return colors
    const q = search.toLowerCase().trim()
    return colors.filter(
      (color) =>
        color.name.toLowerCase().includes(q)
    )
  }, [colors, search])

  const handleSelect = (color: WbColor) => {
    onSelect({
      wbColorId: color.id,
      wbColorName: color.name,
    })
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-md max-h-[85vh] flex flex-col rounded-lg border bg-background shadow-lg overflow-hidden">
        <div className="p-4 border-b shrink-0">
          <h2 className="font-semibold text-lg">Выберите цвет</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Выберите цвет из справочника Wildberries
          </p>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-destructive py-4">{error}</p>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск цвета..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-lg overflow-y-auto max-h-[400px]">
                <ul className="p-2 space-y-1">
                  {filteredColors.length === 0 ? (
                    <li className="py-4 text-center text-muted-foreground text-sm">
                      Ничего не найдено
                    </li>
                  ) : (
                    filteredColors.map((color) => (
                      <li key={color.id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(color)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm"
                        >
                          {color.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
