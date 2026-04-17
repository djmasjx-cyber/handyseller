"use client"

import { TmsPlaceholder } from "@/components/tms/tms-placeholder"

export default function TmsSettingsPage() {
  return (
    <TmsPlaceholder
      title="Настройки TMS"
      description="Отдельный продуктовый контур требует собственные настройки, а не смешивание с настройками core."
      body="Здесь будут tenant-level настройки: учетные данные перевозчиков, лимиты, auth между core и TMS, правила маршрутизации, webhook endpoints и конфигурация SLA."
    />
  )
}
