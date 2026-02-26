import { BottomNav } from "@/components/mobile"
import { ReactNode } from "react"

export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      {children}
      <BottomNav active="home" />
    </div>
  )
}
