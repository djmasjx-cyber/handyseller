"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@handyseller/ui"

const LINKS: { href: string; label: string; match: (p: string) => boolean }[] = [
  {
    href: "/dashboard/wms/sklad",
    label: "Склад",
    match: (p) => p === "/dashboard/wms/sklad" || p.startsWith("/dashboard/wms/sklad/"),
  },
  {
    href: "/dashboard/wms/operations",
    label: "Операции",
    match: (p) => p === "/dashboard/wms/operations" || p.startsWith("/dashboard/wms/operations/"),
  },
]

export function WmsSubnav() {
  const pathname = usePathname() ?? ""

  return (
    <div className="mb-6 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">WMS</p>
      <div className="flex flex-wrap gap-2">
        {LINKS.map((l) => {
          const active = l.match(pathname)
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[40px] inline-flex items-center",
                active
                  ? "bg-primary/12 text-primary ring-1 ring-primary/25"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
