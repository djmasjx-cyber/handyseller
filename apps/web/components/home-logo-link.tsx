"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export function HomeLogoLink({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const pathname = usePathname()

  return (
    <Link
      href="/"
      className={className}
      onClick={(e) => {
        if (pathname === "/") {
          e.preventDefault()
          window.scrollTo({ top: 0, behavior: "smooth" })
        }
      }}
    >
      {children}
    </Link>
  )
}
