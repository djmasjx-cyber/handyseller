"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@handyseller/ui"

const LINKS: { href: string; label: string; match: (p: string) => boolean; wide?: boolean }[] = [
  {
    href: "/dashboard/wms/sklad",
    label: "Склад",
    wide: true,
    match: (p) => p === "/dashboard/wms/sklad" || p.startsWith("/dashboard/wms/sklad/"),
  },
  {
    href: "/dashboard/wms/operations",
    label: "Операции",
    match: (p) => p === "/dashboard/wms/operations" || p.startsWith("/dashboard/wms/operations/"),
  },
]

export function WmsSubnav({ className }: { className?: string }) {
  const pathname = usePathname() ?? ""

  return (
    <nav className={cn("flex flex-wrap gap-2", className)} aria-label="Разделы WMS">
      {LINKS.map((l) => {
        const active = l.match(pathname)
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[40px] inline-flex items-center justify-center",
              l.wide && "min-w-[6.5rem] sm:min-w-[7.75rem] px-4 sm:px-5",
              active
                ? "bg-primary/12 text-primary ring-1 ring-primary/25"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
