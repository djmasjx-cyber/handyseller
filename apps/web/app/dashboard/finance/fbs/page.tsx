"use client"

import { FinanceTable } from "@/components/finance-table"
import { DollarSign } from "lucide-react"

export default function FinanceFbsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <DollarSign className="h-7 w-7 text-primary" />
          Юнит-экономика · FBS
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          FBS — товар хранится у вас, вы доставляете до сортировочного центра. Комиссии и логистика.
        </p>
      </div>
      <FinanceTable scheme="FBS" />
    </div>
  )
}
