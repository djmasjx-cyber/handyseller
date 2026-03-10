"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Loader2, ChevronDown, X } from "lucide-react"

export interface CategoryItem {
  id: number
  label: string
  path?: string
  /** For Ozon: typeId is required */
  typeId?: number
}

interface CategoryAutocompleteProps {
  items: CategoryItem[]
  value: string
  onSelect: (item: CategoryItem) => void
  onClear?: () => void
  placeholder?: string
  accentColor: string
  loading?: boolean
  error?: string | null
  disabled?: boolean
  label?: string
  required?: boolean
  hint?: string
}

export function CategoryAutocomplete({
  items,
  value,
  onSelect,
  onClear,
  placeholder = "Выберите категорию",
  accentColor,
  loading = false,
  error,
  disabled = false,
  label,
  required,
  hint,
}: CategoryAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase().trim()
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.path?.toLowerCase().includes(q) ||
        String(item.id).includes(q)
    )
  }, [items, search])

  const handleSelect = (item: CategoryItem) => {
    onSelect(item)
    setOpen(false)
    setSearch("")
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClear?.()
    setSearch("")
  }

  const handleInputClick = () => {
    if (!disabled && !loading) {
      setOpen(true)
      inputRef.current?.focus()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    if (!open) setOpen(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false)
      setSearch("")
    }
  }

  // Dynamic styles based on accent color
  const borderStyle = { borderColor: accentColor }
  const hoverBgClass = `hover:bg-[${accentColor}]/10`

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {label} {required && <span style={{ color: accentColor }}>*</span>}
        </label>
      )}
      <div ref={containerRef} className="relative">
        <div
          onClick={handleInputClick}
          className={`flex items-center gap-2 min-h-[40px] px-3 py-2 rounded-md border-2 bg-background text-sm cursor-pointer transition-colors ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
          style={borderStyle}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin shrink-0" style={{ color: accentColor }} />
          ) : null}
          
          {open ? (
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={value || placeholder}
              className="flex-1 bg-transparent outline-none min-w-0"
              style={{ color: value && !search ? undefined : accentColor }}
              autoFocus
            />
          ) : (
            <span
              className={`flex-1 truncate ${!value ? "opacity-70" : ""}`}
              style={{ color: !value ? accentColor : undefined }}
            >
              {value || placeholder}
            </span>
          )}

          {value && onClear && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="shrink-0 p-0.5 rounded hover:bg-muted"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            style={{ color: accentColor }}
          />
        </div>

        {/* Dropdown */}
        {open && !disabled && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[300px] overflow-y-auto rounded-md border bg-popover shadow-lg">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: accentColor }} />
              </div>
            ) : error ? (
              <div className="p-3 text-sm text-destructive">{error}</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">
                {search.trim() ? "Ничего не найдено" : "Нет доступных категорий"}
              </div>
            ) : (
              <ul className="py-1">
                {filteredItems.map((item) => (
                  <li key={`${item.id}-${item.typeId ?? 0}`}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors"
                      style={{
                        // Highlight on hover with accent color
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = `${accentColor}15`
                        e.currentTarget.style.color = accentColor
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = ""
                        e.currentTarget.style.color = ""
                      }}
                    >
                      <span className="block truncate">{item.path || item.label}</span>
                      {item.path && item.path !== item.label && (
                        <span className="block text-xs text-muted-foreground truncate">
                          ID: {item.id}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
