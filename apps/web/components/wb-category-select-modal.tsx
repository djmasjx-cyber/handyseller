"use client"

import { useState, useEffect, useMemo } from "react"
import { Input } from "@handyseller/ui"
import { Loader2, Search } from "lucide-react"

interface WbCategorySelectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (params: {
    wbSubjectId: number
    wbCategoryPath: string
  }) => void
  token: string | null
}

export function WbCategorySelectModal({
  open,
  onOpenChange,
  onSelect,
  token,
}: WbCategorySelectModalProps) {
  const [list, setList] = useState<Array<{ subjectId: number; subjectName: string }>>([])
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
        if (Array.isArray(data)) {
          setList(
            data.map((item: { subjectId?: number; subjectName?: string }) => ({
              subjectId: item.subjectId ?? 0,
              subjectName: item.subjectName ?? "",
            })).filter((x: { subjectId: number; subjectName: string }) => x.subjectId > 0)
          )
        } else {
          setList([])
        }
      })
      .catch(() => setError("Не удалось загрузить категории WB"))
      .finally(() => setLoading(false))
  }, [open, token])

  const filteredList = useMemo(() => {
    if (!search.trim()) return list
    const q = search.toLowerCase().trim()
    return list.filter(
      (item) =>
        item.subjectName.toLowerCase().includes(q) ||
        String(item.subjectId).includes(q)
    )
  }, [list, search])

  const handleSelect = (item: { subjectId: number; subjectName: string }) => {
    onSelect({
      wbSubjectId: item.subjectId,
      wbCategoryPath: item.subjectName,
    })
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
            Выберите предмет (subject) для товара на Wildberries.
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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Название категории или ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-lg overflow-y-auto min-h-[280px] max-h-[400px] mt-4">
                <ul className="p-2 space-y-1">
                  {filteredList.length === 0 ? (
                    <li className="py-4 text-center text-muted-foreground text-sm">
                      {list.length === 0 ? "Категории не загружены" : "Ничего не найдено"}
                    </li>
                  ) : (
                    filteredList.map((item) => (
                      <li key={item.subjectId}>
                        <button
                          type="button"
                          onClick={() => handleSelect(item)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-[#CB11AB]/10 text-[#CB11AB] text-sm"
                        >
                          {item.subjectName} <span className="text-muted-foreground">(ID: {item.subjectId})</span>
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
