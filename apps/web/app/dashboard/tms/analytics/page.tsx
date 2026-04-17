"use client"

import { TmsPlaceholder } from "@/components/tms/tms-placeholder"

export default function TmsAnalyticsPage() {
  return (
    <TmsPlaceholder
      title="Аналитика доставки"
      description="Будущая зона cost analytics, SLA analytics и carrier performance."
      body="Контур TMS уже собирает заявки, тарифы, выбранного перевозчика и бронирования. На следующем этапе сюда добавятся promised vs actual SLA, стоимость доставки по маршрутам и сравнительная эффективность ТК."
    />
  )
}
