"use client"

import { useState, useEffect } from "react"
import { Button, Input } from "@handyseller/ui"
import { Loader2, Search } from "lucide-react"

interface WbCategorySelectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (params: { wbSubjectId: number; wbCategoryPath: string }) => void
  token: string | null
}

/** Модальное окно выбора категории WB. WB возвращает плоский список предметов (subject) из /content/v2/object/all. */
export function WbCategorySelectModal({
  open,
  onOpenChange,
  onSelect,
  token,
}: WbCategorySelectModalProps) {
  const [categories, setCategories] = useState<Array<{ subjectId: number; subjectName: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!open || !token) return
    setLoading(true)
    setError(null)
    fetch("/api/marketplaces/wb/categories", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCategories(data)
        else setCategories([])
      })
      .catch(() => setError("Не удалось загрузить категории WB"))
      .finally(() => setLoading(false))
  }, [open, token])

  const filteredList = search.trim()
    ? categories.filter(
        (c) =>
          c.subjectName.toLowerCase().includes(search.toLowerCase()) ||
          String(c.subjectId).includes(search)
      )
    : categories

  const handleSelect = (item: { subjectId: number; subjectName: string }) => {
    onSelect({ wbSubjectId: item.subjectId, wbCategoryPath: item.subjectName })
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg border bg-background shadow-lg overflow-hidden">
        <div className="p-4 border-b shrink-0">
          <h2 className="font-semibold text-lg">Выберите категорию WB</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Предмет (subject) — обязательное поле для выгрузки на Wildberries.
          </p>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-destructive py-4">{error}</p>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по названию или ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-lg overflow-y-auto min-h-[280px] max-h-[400px]">
                {filteredList.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    {search.trim() ? "Ничего не найдено" : "Категории не загружены"}
                  </div>
                ) : (
                  <ul className="p-2 space-y-1">
                    {filteredList.map((item) => (
                      <li key={item.subjectId}>
                        <button
                          type="button"
                          onClick={() => handleSelect(item)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-[#CB11AB]/10 text-[#CB11AB] hover:text-[#CB11AB] text-sm"
                        >
                          {item.subjectName} <span className="text-muted-foreground">(ID: {item.subjectId})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
