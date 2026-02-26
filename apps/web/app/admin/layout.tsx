import { AdminLayoutShell } from "@/components/admin-layout-shell"
import { ReactNode } from "react"

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminLayoutShell>{children}</AdminLayoutShell>
}
