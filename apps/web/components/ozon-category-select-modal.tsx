"use client"

import { useState, useEffect, useMemo } from "react"
import { Button, Input } from "@handyseller/ui"
import { ChevronRight, ChevronDown, Loader2, Search } from "lucide-react"

interface OzonCategoryNode {
  description_category_id?: number
  category_name?: string
  disabled?: boolean
  type_id?: number
  type_name?: string
  children?: OzonCategoryNode[]
}

interface OzonCategorySelectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (params: {
    ozonCategoryId: number
    ozonTypeId: number
    ozonCategoryPath: string
  }) => void
  token: string | null
}

/** Собрать все узлы с type_id (выбираемые). У листьев type_id может быть без description_category_id — берём от родителя */
function collectSelectableNodes(
  nodes: OzonCategoryNode[],
  path: string[] = [],
  parentCatId?: number
): Array<{ node: OzonCategoryNode; path: string; descriptionCategoryId: number }> {
  const result: Array<{ node: OzonCategoryNode; path: string; descriptionCategoryId: number }> = []
  for (const n of nodes) {
    const name = n.category_name || n.type_name || ""
    const currentPath = [...path, name].filter(Boolean)
    const catId = n.description_category_id ?? parentCatId
    if (n.type_id != null && n.type_id > 0 && catId) {
      result.push({ node: n, path: currentPath.join(" > "), descriptionCategoryId: catId })
    }
    if (n.children?.length) {
      result.push(...collectSelectableNodes(n.children, currentPath, catId ?? parentCatId))
    }
  }
  return result
}

export function OzonCategorySelectModal({
  open,
  onOpenChange,
  onSelect,
  token,
}: OzonCategorySelectModalProps) {
  const [tree, setTree] = useState<OzonCategoryNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!open || !token) return
    setLoading(true)
    setError(null)
    fetch("/api/marketplaces/ozon/categories", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTree(data)
        else setTree([])
      })
      .catch(() => setError("Не удалось загрузить категории"))
      .finally(() => setLoading(false))
  }, [open, token])

  const selectableList = useMemo(
    () => collectSelectableNodes(tree),
    [tree]
  )

  const filteredList = useMemo(() => {
    if (!search.trim()) return selectableList
    const q = search.toLowerCase().trim()
    return selectableList.filter(
      (item) =>
        item.path.toLowerCase().includes(q) ||
        item.node.category_name?.toLowerCase().includes(q) ||
        item.node.type_name?.toLowerCase().includes(q)
    )
  }, [selectableList, search])

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelect = (item: { node: OzonCategoryNode; path: string; descriptionCategoryId: number }) => {
    const { node, descriptionCategoryId } = item
    if (node.type_id && descriptionCategoryId) {
      onSelect({
        ozonCategoryId: descriptionCategoryId,
        ozonTypeId: node.type_id,
        ozonCategoryPath: item.path,
      })
      onOpenChange(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg border bg-background shadow-lg overflow-hidden">
        <div className="p-4 border-b shrink-0">
          <h2 className="font-semibold text-lg">Выберите категорию</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Выберите конечный пункт в дереве (третий уровень).
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
                placeholder="Название категории или типа..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="border rounded-lg overflow-y-auto min-h-[280px] max-h-[400px]">
              {search.trim() ? (
                <ul className="p-2 space-y-1">
                  {filteredList.length === 0 ? (
                    <li className="py-4 text-center text-muted-foreground text-sm">
                      Ничего не найдено
                    </li>
                  ) : (
                    filteredList.map((item) => (
                      <li key={`${item.node.description_category_id}-${item.node.type_id}`}>
                        <button
                          type="button"
                          onClick={() => handleSelect(item)}
                          className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm"
                        >
                          {item.path}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                <CategoryTree
                  nodes={tree}
                  path={[]}
                  parentCatId={undefined}
                  expandedIds={expandedIds}
                  onToggle={toggleExpand}
                  onSelect={handleSelect}
                />
              )}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  )
}

function CategoryTree({
  nodes,
  path,
  parentCatId,
  expandedIds,
  onToggle,
  onSelect,
}: {
  nodes: OzonCategoryNode[]
  path: string[]
  parentCatId?: number
  expandedIds: Set<number>
  onToggle: (id: number) => void
  onSelect: (item: { node: OzonCategoryNode; path: string; descriptionCategoryId: number }) => void
}) {
  return (
    <ul className="py-2">
      {nodes.map((n) => {
        const id = n.description_category_id ?? n.type_id ?? 0
        const name = n.category_name || n.type_name || ""
        const currentPath = [...path, name].filter(Boolean)
        const hasChildren = n.children && n.children.length > 0
        const isSelectable = n.type_id != null && n.type_id > 0
        const isExpanded = expandedIds.has(id)
        const catId = n.description_category_id ?? parentCatId

        return (
          <li key={`${id}-${n.type_id ?? 0}`}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => hasChildren && onToggle(id)}
                className="p-1 shrink-0"
              >
                {hasChildren ? (
                  isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )
                ) : (
                  <span className="w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() =>
                  isSelectable && catId
                    ? onSelect({ node: n, path: currentPath.join(" > "), descriptionCategoryId: catId })
                    : hasChildren && onToggle(id)
                }
                className={`flex-1 text-left px-2 py-1.5 rounded text-sm ${
                  isSelectable
                    ? "hover:bg-[#005BFF]/10 text-[#005BFF]"
                    : "hover:bg-accent"
                }`}
              >
                {name}
              </button>
            </div>
            {hasChildren && isExpanded && (
              <div className="pl-6 border-l border-muted ml-2">
                <CategoryTree
                  nodes={n.children!}
                  path={currentPath}
                  parentCatId={catId ?? parentCatId}
                  expandedIds={expandedIds}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
