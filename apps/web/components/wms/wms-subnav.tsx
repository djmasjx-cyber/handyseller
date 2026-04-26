"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@handyseller/ui"

const LINKS: { href: string; label: string; match: (p: string) => boolean }[] = [
  {
    href: "/dashboard/wms/sklad",
    label: "Склад",
    match: (p) => p === "/dashboard/wms/sklad" || (p.startsWith("/dashboard/wms/sklad/") && !p.startsWith("/dashboard/wms/sklad/scan-label")),
  },
  {
    href: "/dashboard/wms/sklad/scan-label",
    label: "Скан",
    match: (p) => p === "/dashboard/wms/sklad/scan-label" || p.startsWith("/dashboard/wms/sklad/scan-label/"),
  },
  {
    href: "/dashboard/wms/operations",
    label: "Операции",
    match: (p) => p === "/dashboard/wms/operations" || p.startsWith("/dashboard/wms/operations/"),
  },
  {
    href: "/dashboard/wms/settings",
    label: "Настройки",
    match: (p) => p === "/dashboard/wms/settings" || p.startsWith("/dashboard/wms/settings/"),
  },
]

const linkClass = (active: boolean, toolbarCell: boolean) =>
  cn(
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-10 inline-flex items-center justify-center text-center",
    toolbarCell && "w-full min-w-0",
    !toolbarCell && "min-w-[6.5rem] sm:min-w-[7rem]",
    active
      ? "bg-primary/12 text-primary ring-1 ring-inset ring-primary/25"
      : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
  )

type WmsSubnavProps = {
  className?: string
  /** Родитель — CSS grid: три вкладки и селект складываются в одну сетку одинаковой ширины ячеек */
  asToolbarGrid?: boolean
}

export function WmsSubnav({ className, asToolbarGrid }: WmsSubnavProps) {
  const pathname = usePathname() ?? ""

  return (
    <nav
      className={cn(asToolbarGrid ? "contents" : "flex flex-wrap gap-2", className)}
      aria-label="Разделы WMS"
    >
      {LINKS.map((l) => {
        const active = l.match(pathname)
        return (
          <Link key={l.href} href={l.href} className={linkClass(active, Boolean(asToolbarGrid))}>
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
