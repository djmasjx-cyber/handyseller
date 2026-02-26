"use client"

import { useRouter } from "next/navigation"
import { Button } from "@handyseller/ui"
import { LogOut } from "lucide-react"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter()

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken)
    localStorage.removeItem(AUTH_STORAGE_KEYS.user)
    router.push("/")
  }

  return (
    <Button
      variant="ghost"
      className={className}
      onClick={handleLogout}
    >
      <LogOut className="mr-2 h-5 w-5" />
      Выйти
    </Button>
  )
}
