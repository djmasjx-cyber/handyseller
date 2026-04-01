"use client"

import { FinanceTable } from "@/components/finance-table"
import { DollarSign } from "lucide-react"

export default function FinanceFboPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <DollarSign className="h-7 w-7 text-primary" />
          Финансы · FBO
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          FBO — товар хранится на складе маркетплейса. Комиссии, логистика и приёмка.
        </p>
      </div>
      <FinanceTable scheme="FBO" />
    </div>
  )
}
