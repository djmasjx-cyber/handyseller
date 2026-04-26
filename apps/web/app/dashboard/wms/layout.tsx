import type { ReactNode } from "react"
import { WmsSubnav } from "@/components/wms/wms-subnav"

export default function WmsSectionLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <WmsSubnav />
      {children}
    </div>
  )
}
