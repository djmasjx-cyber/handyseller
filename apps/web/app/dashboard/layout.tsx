import { DashboardAuthGate } from "@/components/dashboard-auth-gate"
import { ReactNode } from "react"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardAuthGate>{children}</DashboardAuthGate>
}
