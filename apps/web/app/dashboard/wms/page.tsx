"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@handyseller/ui"
import {
  ChevronRight,
  ClipboardList,
  MapPinned,
  PackageCheck,
  PackagePlus,
  Ruler,
  ScanLine,
  UserRound,
  Warehouse,
} from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS, getStoredUser } from "@/lib/auth-storage"

type WarehouseRecord = {
  id: string
  code: string
  name: string
  kind: "PHYSICAL" | "VIRTUAL"
  status: string
}

type LocationRecord = {
  id: string
  warehouseId: string
  code: string
  name: string
  type: string
  path: string
  status: string
}

type EventRecord = {
  id: string
  type: string
  occurredAt: string
  payload: Record<string, unknown>
}

type ReceiptLine = {
  id: string
  itemId: string
  expectedQty: number
  reservedQty: number
  receivedQty: number
  unitPrice?: number | null
  sku?: string | null
  lineTitle?: string | null
}

const AGX_FIELD_RU: Record<string, string> = {
  weightGrams: "вес",
  lengthMm: "длина",
  widthMm: "ширина",
  heightMm: "высота",
}

function formatWmsAcceptError(data: unknown): string {
  if (!data || typeof data !== "object") return "Приемка отклонена (проверьте АГХ)."
  const d = data as Record<string, unknown>
  if (d.code === "AGX_INCOMPLETE" && Array.isArray(d.lines)) {
    return (d.lines as Array<{ sku?: string; lineTitle?: string | null; missing?: string[] }>)
      .map((ln) => {
        const label = [ln.sku, ln.lineTitle].filter(Boolean).join(" — ") || "позиция"
        const miss = (ln.missing ?? []).map((k) => AGX_FIELD_RU[k] ?? k).join(", ")
        return `${label}: не заполнено — ${miss}`
      })
      .join("; ")
  }
  const msg = d.message
  if (typeof msg === "string") return msg
  if (Array.isArray(msg)) return msg.join(", ")
  if (msg && typeof msg === "object" && !Array.isArray(msg)) {
    const o = msg as Record<string, unknown>
    if (o.code === "AGX_INCOMPLETE" && Array.isArray(o.lines)) {
      return formatWmsAcceptError(o)
    }
  }
  return "Приемка отклонена (проверьте АГХ)."
}

type ReceiptRecord = {
  id: string
  number: string
  status: string
  warehouseId: string
  lines: ReceiptLine[]
}

type InvRow = { article: string; title: string; quantity: number; price: number }

function parseUnitBarcodes(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

type MeProfile = { id: string; label: string }

function meFromUnknown(u: Record<string, unknown> | null | undefined): MeProfile | null {
  if (!u) return null
  const id = typeof u.id === "string" ? u.id.trim() : ""
  if (!id) return null
  const name = typeof u.name === "string" ? u.name.trim() : ""
  const email = typeof u.email === "string" ? u.email.trim() : ""
  return { id, label: name || email || id }
}

function formatHttpError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback
  const d = data as Record<string, unknown>
  const m = d.message
  if (typeof m === "string" && m.trim()) return m.trim()
  if (Array.isArray(m) && m.every((x) => typeof x === "string")) return m.join("; ")
  return fallback
}

const TASK_STATUS_LABEL: Record<string, string> = {
  OPEN: "В очереди",
  ASSIGNED: "Назначено",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
  CANCELLED: "Отменено",
}

function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABEL[status] ?? status
}

function taskStatusBadgeClass(status: string): string {
  switch (status) {
    case "OPEN":
      return "border-sky-200 bg-sky-50 text-sky-900"
    case "ASSIGNED":
      return "border-violet-200 bg-violet-50 text-violet-900"
    case "IN_PROGRESS":
      return "border-amber-200 bg-amber-50 text-amber-900"
    case "DONE":
      return "border-emerald-200 bg-emerald-50 text-emerald-900"
    case "CANCELLED":
      return "border-neutral-200 bg-neutral-100 text-neutral-700"
    default:
      return "border-border bg-muted text-muted-foreground"
  }
}

function sortTasksForDisplay<T extends { status: string; id: string }>(list: T[]): T[] {
  const w: Record<string, number> = { IN_PROGRESS: 0, ASSIGNED: 1, OPEN: 2, DONE: 8, CANCELLED: 9 }
  return [...list].sort((a, b) => (w[a.status] ?? 5) - (w[b.status] ?? 5) || b.id.localeCompare(a.id))
}

const EVENT_TYPE_RU: Record<string, string> = {
  WAREHOUSE_CREATED: "Склад создан",
  LOCATION_CREATED: "Ячейка создана",
  ITEM_CREATED: "Товар создан",
  RECEIPT_CREATED: "Накладная создана",
  RECEIPT_COMPLETED: "Приёмка завершена",
  BARCODE_RESERVED: "Штрихкод выдан",
  UNIT_RECEIVED: "Единица принята",
  LPN_CREATED: "Тара создана",
  CONTAINER_PACKED: "Упаковали в тару",
  CONTAINER_UNPACKED: "Достали из тары",
  MOVED: "Перемещение",
  TASK_CREATED: "Задание создано",
  TASK_STATUS_CHANGED: "Статус задания",
  TASK_COMPLETED: "Задание сделано",
  ALLOCATED: "Резерв",
  PICKED: "Отбор",
  PACKED: "Упаковка заказа",
  COUNTED: "Инвентаризация",
  ADJUSTED: "Корректировка",
  SHIPPED: "Отгрузка",
}

const FLOW_CHIPS = [
  { label: "Накладная", icon: ClipboardList },
  { label: "Тара", icon: PackagePlus },
  { label: "Ячейка", icon: MapPinned },
  { label: "На полку", icon: PackageCheck },
] as const

export default function WmsDashboardPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([])
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [events, setEvents] = useState<EventRecord[]>([])
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [whId, setWhId] = useState("")
  const [invRows, setInvRows] = useState<InvRow[]>([{ article: "", title: "", quantity: 1, price: 0 }])
  const [invBusy, setInvBusy] = useState(false)
  const [agx, setAgx] = useState<{ itemId: string; sku: string; title: string } | null>(null)
  const [agxW, setAgxW] = useState("")
  const [agxL, setAgxL] = useState("")
  const [agxWi, setAgxWi] = useState("")
  const [agxH, setAgxH] = useState("")
  const [agxBusy, setAgxBusy] = useState(false)
  const [unitSheet, setUnitSheet] = useState<{
    receiptNumber: string
    units: Array<{ barcode: string; status: string; itemId: string; declaredUnitPrice?: number | null }>
  } | null>(null)
  const [unitSheetBusy, setUnitSheetBusy] = useState(false)
  const [moveToLoc, setMoveToLoc] = useState("")
  const [moveToteBc, setMoveToteBc] = useState("")
  const [moveUnitsRaw, setMoveUnitsRaw] = useState("")
  const [moveArchiveTote, setMoveArchiveTote] = useState(false)
  const [moveBusy, setMoveBusy] = useState(false)
  const [toteBusy, setToteBusy] = useState(false)
  const [lastToteBc, setLastToteBc] = useState<string | null>(null)
  const [lpnContents, setLpnContents] = useState<{
    container: { id: string; barcode: string; type: string; status: string; warehouseId: string }
    units: Array<{ barcode: string; status: string; itemId: string; declaredUnitPrice?: number | null }>
    nestedContainers: Array<{ id: string; barcode: string; type: string; status: string }>
  } | null>(null)
  const [contentsBusy, setContentsBusy] = useState(false)
  const [locContents, setLocContents] = useState<{
    location: { id: string; path: string; code: string; warehouseId: string }
    units: Array<{ barcode: string; status: string; containerId: string | null; itemId: string }>
    containers: Array<{ id: string; barcode: string; type: string; status: string }>
  } | null>(null)
  const [locContentsBusy, setLocContentsBusy] = useState(false)
  const [nestParentBc, setNestParentBc] = useState("")
  const [nestChildBc, setNestChildBc] = useState("")
  const [unnestChildBc, setUnnestChildBc] = useState("")
  const [nestBusy, setNestBusy] = useState(false)
  const [unnestBusy, setUnnestBusy] = useState(false)
  const [tasks, setTasks] = useState<
    Array<{ id: string; status: string; type: string; assigneeUserId?: string | null }>
  >([])
  const [putawayBusy, setPutawayBusy] = useState(false)
  const [taskActionId, setTaskActionId] = useState<string | null>(null)
  const [taskAssigneeUserId, setTaskAssigneeUserId] = useState("")
  const [me, setMe] = useState<MeProfile | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    const u = getStoredUser()
    if (u?.id) {
      const label = (u.name || u.email || u.id).trim()
      setMe({ id: u.id, label })
      setTaskAssigneeUserId((prev) => (prev.trim() ? prev : u.id))
    }
  }, [])

  useEffect(() => {
    if (!successMessage) return
    const t = window.setTimeout(() => setSuccessMessage(null), 4500)
    return () => window.clearTimeout(t)
  }, [successMessage])

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [wRes, lRes, eRes, rRes, tRes, meRes] = await Promise.all([
        authFetch("/api/wms/v1/warehouses", { headers }),
        authFetch("/api/wms/v1/locations", { headers }),
        authFetch("/api/wms/v1/events?limit=10", { headers }),
        authFetch("/api/wms/v1/receipts", { headers }),
        authFetch("/api/wms/v1/tasks", { headers }),
        authFetch("/api/users/me", { headers }),
      ])
      if (!wRes.ok || !lRes.ok || !eRes.ok) {
        throw new Error("WMS API пока недоступен или пользователь не авторизован.")
      }
      const wh = (await wRes.json()) as WarehouseRecord[]
      setWarehouses(wh)
      setLocations(await lRes.json())
      setEvents(await eRes.json())
      if (meRes.ok) {
        const raw = (await meRes.json().catch(() => null)) as Record<string, unknown> | null
        const parsed = meFromUnknown(raw)
        if (parsed) {
          setMe(parsed)
          setTaskAssigneeUserId((prev) => (prev.trim() ? prev : parsed.id))
        }
      }
      if (tRes.ok) {
        const tl = (await tRes.json()) as Array<{
          id: string
          status: string
          type: string
          assigneeUserId?: string | null
        }>
        setTasks(Array.isArray(tl) ? sortTasksForDisplay(tl) : [])
      } else {
        setTasks([])
      }
      if (rRes.ok) {
        const list = (await rRes.json()) as ReceiptRecord[]
        setReceipts(Array.isArray(list) ? list : [])
      } else {
        setReceipts([])
      }
      setWhId((prev) => prev || wh[0]?.id || "")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить WMS.")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const postInvoice = async () => {
    if (!token || !whId) {
      setError("Выберите склад.")
      return
    }
    const lines = invRows
      .map((r) => ({
        article: r.article.trim(),
        title: r.title.trim(),
        quantity: Math.max(1, Math.floor(r.quantity)),
        price: Math.max(0, r.price),
      }))
      .filter((r) => r.article && r.title)
    if (!lines.length) {
      setError("Добавьте строки накладной (артикул, название).")
      return
    }
    setInvBusy(true)
    setError(null)
    try {
      const res = await authFetch("/api/wms/v1/receipts/invoice", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: whId, lines }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось создать накладную."))
        return
      }
      setInvRows([{ article: "", title: "", quantity: 1, price: 0 }])
      setSuccessMessage("Накладная создана, штрихкоды зарезервированы.")
      await loadData()
    } finally {
      setInvBusy(false)
    }
  }

  const saveAgx = async () => {
    if (!token || !agx) return
    const wg = Number(agxW)
    const lCm = Number(agxL)
    const wiCm = Number(agxWi)
    const hCm = Number(agxH)
    if (![wg, lCm, wiCm, hCm].every((n) => Number.isFinite(n) && n > 0)) {
      setError("Заполните вес (г) и габариты (см) — все поля обязательны.")
      return
    }
    setAgxBusy(true)
    setError(null)
    try {
      const res = await authFetch(`/api/wms/v1/items/${encodeURIComponent(agx.itemId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          weightGrams: Math.round(wg),
          lengthMm: Math.round(lCm * 10),
          widthMm: Math.round(wiCm * 10),
          heightMm: Math.round(hCm * 10),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось сохранить вес и размеры."))
        return
      }
      setAgx(null)
      await loadData()
    } finally {
      setAgxBusy(false)
    }
  }

  const acceptRcpt = async (id: string) => {
    if (!token) return
    setError(null)
    const res = await authFetch(`/api/wms/v1/receipts/${encodeURIComponent(id)}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(formatWmsAcceptError(data))
      return
    }
    await loadData()
  }

  const locsForWh = locations.filter((l) => l.warehouseId === whId)

  const createReceivingTote = async () => {
    if (!token || !whId) {
      setError("Выберите склад.")
      return
    }
    setToteBusy(true)
    setError(null)
    try {
      const res = await authFetch("/api/wms/v1/containers", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: whId, type: "RECEIVING_TOTE" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось создать тару."))
        return
      }
      const bc = typeof data?.barcode === "string" ? data.barcode : null
      setLastToteBc(bc)
      if (bc) setMoveToteBc(bc)
    } finally {
      setToteBusy(false)
    }
  }

  const submitMove = async () => {
    if (!token) return
    if (!moveToLoc) {
      setError("Выберите ячейку назначения.")
      return
    }
    const unitBarcodes = parseUnitBarcodes(moveUnitsRaw)
    const tote = moveToteBc.trim()
    if (!tote && !unitBarcodes.length) {
      setError("Укажите штрихкод тары и/или штрихкоды единиц.")
      return
    }
    setMoveBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        toLocationId: moveToLoc,
        archiveTemporaryContainer: moveArchiveTote,
      }
      if (tote) body.containerBarcode = tote
      if (unitBarcodes.length) body.unitBarcodes = unitBarcodes
      const res = await authFetch("/api/wms/v1/moves", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Перемещение не выполнено."))
        return
      }
      setSuccessMessage("Перемещение выполнено.")
      setLpnContents(null)
      setLocContents(null)
      setMoveUnitsRaw("")
      if (moveArchiveTote) {
        setMoveToteBc("")
        setMoveArchiveTote(false)
      }
      await loadData()
    } finally {
      setMoveBusy(false)
    }
  }

  const fetchLocationContents = async () => {
    if (!token || !moveToLoc) {
      setError("Выберите ячейку назначения.")
      return
    }
    setLocContentsBusy(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ locationId: moveToLoc })
      const res = await authFetch(`/api/wms/v1/locations/contents?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLocContents(null)
        setError(formatHttpError(data, "Не удалось загрузить состав ячейки."))
        return
      }
      const loc = data?.location as Record<string, unknown> | undefined
      const units = Array.isArray(data?.units) ? data.units : []
      const containers = Array.isArray(data?.containers) ? data.containers : []
      if (!loc || typeof loc.path !== "string") {
        setLocContents(null)
        setError("Некорректный ответ API.")
        return
      }
      setLocContents({
        location: {
          id: String(loc.id ?? ""),
          path: String(loc.path),
          code: String(loc.code ?? ""),
          warehouseId: String(loc.warehouseId ?? ""),
        },
        units: units.map((u: Record<string, unknown>) => ({
          barcode: String(u.barcode ?? ""),
          status: String(u.status ?? ""),
          containerId: (u.containerId as string | null) ?? null,
          itemId: String(u.itemId ?? ""),
        })),
        containers: containers.map((c: Record<string, unknown>) => ({
          id: String(c.id ?? ""),
          barcode: String(c.barcode ?? ""),
          type: String(c.type ?? ""),
          status: String(c.status ?? ""),
        })),
      })
    } finally {
      setLocContentsBusy(false)
    }
  }

  const fetchLpnContents = async () => {
    const bc = moveToteBc.trim()
    if (!token || !bc) {
      setError("Введите штрихкод тары, чтобы посмотреть состав.")
      return
    }
    setContentsBusy(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ barcode: bc })
      const res = await authFetch(`/api/wms/v1/containers/contents?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLpnContents(null)
        setError(formatHttpError(data, "Тара с таким штрихкодом не найдена."))
        return
      }
      const c = data?.container as Record<string, unknown> | undefined
      const units = Array.isArray(data?.units) ? data.units : []
      const nested = Array.isArray(data?.nestedContainers) ? data.nestedContainers : []
      if (!c || typeof c.barcode !== "string") {
        setLpnContents(null)
        setError("Некорректный ответ API.")
        return
      }
      setLpnContents({
        container: {
          id: String(c.id ?? ""),
          barcode: String(c.barcode),
          type: String(c.type ?? ""),
          status: String(c.status ?? ""),
          warehouseId: String(c.warehouseId ?? ""),
        },
        units: units.map((u: Record<string, unknown>) => ({
          barcode: String(u.barcode ?? ""),
          status: String(u.status ?? ""),
          itemId: String(u.itemId ?? ""),
          declaredUnitPrice: u.declaredUnitPrice as number | null | undefined,
        })),
        nestedContainers: nested.map((x: Record<string, unknown>) => ({
          id: String(x.id ?? ""),
          barcode: String(x.barcode ?? ""),
          type: String(x.type ?? ""),
          status: String(x.status ?? ""),
        })),
      })
    } finally {
      setContentsBusy(false)
    }
  }

  const submitNest = async () => {
    if (!token) return
    const p = nestParentBc.trim()
    const ch = nestChildBc.trim()
    if (!p || !ch) {
      setError("Нужны два штрихкода: большая тара и маленькая, которую кладём внутрь.")
      return
    }
    setNestBusy(true)
    setError(null)
    try {
      const res = await authFetch("/api/wms/v1/containers/nest", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ parentBarcode: p, childBarcode: ch }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Вложение не выполнено."))
        return
      }
      setNestChildBc("")
      setSuccessMessage("Тара вложена.")
      await loadData()
    } finally {
      setNestBusy(false)
    }
  }

  const createPutawayTask = async () => {
    if (!token || !whId || !moveToLoc) {
      setError("Нужны склад, ячейка назначения и хотя бы тара или единицы.")
      return
    }
    const ubs = parseUnitBarcodes(moveUnitsRaw)
    const tote = moveToteBc.trim()
    if (!tote && !ubs.length) {
      setError("Для задания PUTAWAY укажите штрихкод тары и/или единицы.")
      return
    }
    setPutawayBusy(true)
    setError(null)
    try {
      const res = await authFetch("/api/wms/v1/tasks/putaway", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseId: whId,
          targetLocationId: moveToLoc,
          unitBarcodes: ubs.length ? ubs : undefined,
          containerBarcode: tote || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось создать задание."))
        return
      }
      setSuccessMessage("Задание на размещение создано.")
      await loadData()
    } finally {
      setPutawayBusy(false)
    }
  }

  const startTask = async (taskId: string) => {
    if (!token) return
    setTaskActionId(taskId)
    setError(null)
    try {
      const res = await authFetch(`/api/wms/v1/tasks/${encodeURIComponent(taskId)}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось взять задание в работу."))
        return
      }
      setSuccessMessage("Задание в работе — можно ставить в ячейку.")
      await loadData()
    } finally {
      setTaskActionId(null)
    }
  }

  const assignTask = async (taskId: string) => {
    if (!token) return
    const aid = taskAssigneeUserId.trim()
    if (!aid) {
      setError("Укажите ID коллеги в поле ниже или нажмите «На меня».")
      return
    }
    setTaskActionId(taskId)
    setError(null)
    try {
      const res = await authFetch(`/api/wms/v1/tasks/${encodeURIComponent(taskId)}/assign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeUserId: aid }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Назначение не выполнено."))
        return
      }
      setSuccessMessage("Задание закреплено за исполнителем.")
      await loadData()
    } finally {
      setTaskActionId(null)
    }
  }

  const assignTaskToMe = async (taskId: string) => {
    if (!token) return
    if (!me?.id) {
      setError("Не удалось узнать ваш аккаунт. Обновите страницу или войдите снова.")
      return
    }
    setTaskActionId(taskId)
    setError(null)
    try {
      const res = await authFetch(`/api/wms/v1/tasks/${encodeURIComponent(taskId)}/assign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeUserId: me.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось закрепить задание за вами."))
        return
      }
      setSuccessMessage("Задание ваше — дальше «В работу» и «Поставить в ячейку».")
      await loadData()
    } finally {
      setTaskActionId(null)
    }
  }

  const completeTask = async (taskId: string) => {
    if (!token) return
    setTaskActionId(taskId)
    setError(null)
    try {
      const res = await authFetch(`/api/wms/v1/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось поставить в ячейку."))
        return
      }
      setSuccessMessage("Готово — товар в ячейке назначения.")
      await loadData()
    } finally {
      setTaskActionId(null)
    }
  }

  const submitUnnest = async () => {
    if (!token) return
    const ch = unnestChildBc.trim()
    if (!ch) {
      setError("Отсканируйте штрихкод маленькой тары, которую нужно достать из большой.")
      return
    }
    setUnnestBusy(true)
    setError(null)
    try {
      const res = await authFetch("/api/wms/v1/containers/unnest", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ childBarcode: ch }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось достать тару из вложения."))
        return
      }
      setUnnestChildBc("")
      setSuccessMessage("Маленькая тара снова отдельно.")
      await loadData()
    } finally {
      setUnnestBusy(false)
    }
  }

  const loadReceiptUnits = async (receiptId: string, receiptNumber: string) => {
    if (!token) return
    setUnitSheetBusy(true)
    setError(null)
    try {
      const res = await authFetch(`/api/wms/v1/receipts/${encodeURIComponent(receiptId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось загрузить штрихкоды прихода."))
        return
      }
      const units = Array.isArray(data?.units) ? data.units : []
      setUnitSheet({
        receiptNumber,
        units: units.map((u: Record<string, unknown>) => ({
          barcode: String(u.barcode ?? ""),
          status: String(u.status ?? ""),
          itemId: String(u.itemId ?? ""),
          declaredUnitPrice: u.declaredUnitPrice as number | null | undefined,
        })),
      })
    } finally {
      setUnitSheetBusy(false)
    }
  }

  const activeWarehouse = warehouses.find((w) => w.id === whId)

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Warehouse className="h-7 w-7 text-primary shrink-0" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight">Склад</h1>
            <Badge variant="secondary" className="font-normal">
              учёт и перемещения
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground leading-relaxed">
            Сканируйте штрихкоды, выбирайте ячейку — система сама ведёт историю. Ошибки показываем прямо здесь, без «технички».
          </p>
          {me ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserRound className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span>
                Вы вошли как <span className="font-medium text-foreground">{me.label}</span>
              </span>
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="lg"
          className="min-h-11 shrink-0"
          onClick={() => void loadData()}
          disabled={loading}
        >
          {loading ? "Загрузка…" : "Обновить данные"}
        </Button>
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5 sm:gap-2 rounded-xl border border-dashed bg-muted/25 px-3 py-2.5 text-xs sm:text-sm"
        role="navigation"
        aria-label="Порядок работы на смене"
      >
        <span className="text-muted-foreground shrink-0 mr-1">Порядок:</span>
        {FLOW_CHIPS.map((chip, i) => {
          const Icon = chip.icon
          return (
            <span key={chip.label} className="inline-flex items-center gap-1">
              {i > 0 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" aria-hidden /> : null}
              <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 font-medium">
                <Icon className="h-3.5 w-3.5 opacity-80" aria-hidden />
                {chip.label}
              </span>
            </span>
          )
        })}
      </div>

      {successMessage && !error ? (
        <Card className="border-emerald-200 bg-emerald-50/90">
          <CardContent className="pt-4 pb-4 text-sm text-emerald-950 font-medium">{successMessage}</CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-amber-200 bg-amber-50" role="alert">
          <CardContent className="pt-4 pb-4 text-sm text-amber-950">{error}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Накладная</CardTitle>
          <CardDescription>
            Строки прихода → внутренние штрихкоды на каждую единицу. Без веса и размеров товара приёмку не включим — кнопка
            «АГХ» у строки.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>Склад</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={whId}
              onChange={(e) => setWhId(e.target.value)}
            >
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>
          {invRows.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-12 sm:items-end">
              <div className="sm:col-span-2">
                <Label>Артикул</Label>
                <Input value={row.article} onChange={(e) => setInvRows((p) => p.map((x, j) => (j === i ? { ...x, article: e.target.value } : x)))} />
              </div>
              <div className="sm:col-span-4">
                <Label>Название</Label>
                <Input value={row.title} onChange={(e) => setInvRows((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              </div>
              <div className="sm:col-span-2">
                <Label>Кол-во</Label>
                <Input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) =>
                    setInvRows((p) => p.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Цена</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.price}
                  onChange={(e) =>
                    setInvRows((p) => p.map((x, j) => (j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x)))
                  }
                />
              </div>
              <div className="sm:col-span-2 flex gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setInvRows((p) => [...p, { article: "", title: "", quantity: 1, price: 0 }])}>
                  +
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={invRows.length < 2} onClick={() => setInvRows((p) => p.filter((_, j) => j !== i))}>
                  −
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" size="lg" className="min-h-11" onClick={() => void postInvoice()} disabled={invBusy || !whId}>
            {invBusy ? "Создаём…" : "Создать накладную и штрихкоды"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <PackagePlus className="h-5 w-5 shrink-0" aria-hidden />
            Тара и перемещение
          </CardTitle>
          <CardDescription>
            Сначала склад и ячейку куда везём. Потом штрихкод тары и/или единиц — одна большая кнопка «Переместить». Состав
            тары и ячейки можно посмотреть до отправки.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {activeWarehouse ? (
            <p className="text-sm rounded-lg bg-muted/50 border px-3 py-2">
              <span className="text-muted-foreground">Сейчас склад:</span>{" "}
              <span className="font-medium">{activeWarehouse.name}</span>
              <span className="text-muted-foreground"> ({activeWarehouse.code})</span>
            </p>
          ) : (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Выберите склад в блоке «Накладная» выше — без этого ячейки не подгрузятся.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11"
              onClick={() => void createReceivingTote()}
              disabled={toteBusy || !whId}
            >
              {toteBusy ? "Создаём…" : "Новая приёмочная тара"}
            </Button>
            {lastToteBc ? (
              <span className="text-xs text-muted-foreground self-center">
                Последний LPN: <code className="rounded bg-muted px-1">{lastToteBc}</code>
              </span>
            ) : null}
          </div>
          <div className="grid gap-4 max-w-xl">
            <div className="space-y-2">
              <Label className="text-base font-medium">Куда везём</Label>
              <p className="text-xs text-muted-foreground">Ячейка на том же складе, что и в накладной.</p>
              <select
                className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={moveToLoc}
                onChange={(e) => setMoveToLoc(e.target.value)}
                disabled={!whId}
              >
                <option value="">Выберите ячейку…</option>
                {locsForWh.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.path} ({l.code})
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                className="min-h-10 w-full sm:w-auto"
                disabled={locContentsBusy || !moveToLoc}
                onClick={() => void fetchLocationContents()}
              >
                {locContentsBusy ? "Смотрим…" : "Что уже лежит в этой ячейке"}
              </Button>
            </div>
            {locContents ? (
              <div className="rounded-md border p-3 text-sm space-y-3 max-w-2xl">
                <div className="font-medium text-xs text-muted-foreground">
                  {locContents.location.path} · {locContents.location.code}
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Тара в ячейке</div>
                  {locContents.containers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Нет LPN с location_id этой ячейки.</p>
                  ) : (
                    <ul className="text-xs space-y-1 font-mono">
                      {locContents.containers.map((c) => (
                        <li key={c.id}>
                          {c.barcode} · {c.type} · {c.status}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Единицы (по location_id)</div>
                  {locContents.units.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Нет единиц с этой ячейкой.</p>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-1 pr-2">Штрихкод</th>
                          <th className="py-1 pr-2">Статус</th>
                          <th className="py-1 pr-2">Тара</th>
                        </tr>
                      </thead>
                      <tbody>
                        {locContents.units.map((u) => (
                          <tr key={u.barcode} className="border-b border-muted/30">
                            <td className="py-1 pr-2 font-mono">{u.barcode}</td>
                            <td className="py-1 pr-2">{u.status}</td>
                            <td className="py-1 pr-2 truncate max-w-[100px]" title={u.containerId ?? ""}>
                              {u.containerId ? `${u.containerId.slice(0, 8)}…` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label className="inline-flex items-center gap-2 text-base font-medium">
                <ScanLine className="h-4 w-4 text-muted-foreground" aria-hidden />
                Штрихкод тары
              </Label>
              <Input
                value={moveToteBc}
                onChange={(e) => setMoveToteBc(e.target.value)}
                placeholder="Сканер или вставка из буфера"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="min-h-11 font-mono text-base"
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-10 w-full sm:w-auto"
                disabled={contentsBusy}
                onClick={() => void fetchLpnContents()}
              >
                {contentsBusy ? "Загрузка…" : "Что внутри этой тары"}
              </Button>
            </div>
            {lpnContents ? (
              <div className="rounded-md border p-3 text-sm space-y-2 max-w-xl">
                <div className="font-medium">
                  {lpnContents.container.barcode} · {lpnContents.container.type} · {lpnContents.container.status}
                </div>
                {lpnContents.units.length === 0 ? (
                  <p className="text-muted-foreground text-xs">В составе по БД нет единиц (загрузите через перемещение с той же тары).</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-1 pr-2">Штрихкод</th>
                        <th className="py-1 pr-2">Статус</th>
                        <th className="py-1 pr-2">itemId</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lpnContents.units.map((u) => (
                        <tr key={u.barcode} className="border-b border-muted/30">
                          <td className="py-1 pr-2 font-mono">{u.barcode}</td>
                          <td className="py-1 pr-2">{u.status}</td>
                          <td className="py-1 pr-2 truncate max-w-[140px]" title={u.itemId}>
                            {u.itemId.slice(0, 12)}…
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {lpnContents.nestedContainers.length > 0 ? (
                  <div className="text-xs">
                    <div className="font-medium text-muted-foreground mb-1">Вложенные LPN</div>
                    <ul className="space-y-0.5 font-mono">
                      {lpnContents.nestedContainers.map((n) => (
                        <li key={n.id}>
                          {n.barcode} · {n.type} · {n.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label className="inline-flex items-center gap-2 text-base font-medium">
                <ScanLine className="h-4 w-4 text-muted-foreground" aria-hidden />
                Штрихкоды единиц (если везём штучно)
              </Label>
              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed"
                value={moveUnitsRaw}
                onChange={(e) => setMoveUnitsRaw(e.target.value)}
                placeholder="Каждый с новой строки или через запятую"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <label className="flex items-start gap-3 text-sm leading-snug cursor-pointer rounded-lg border p-3 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0"
                checked={moveArchiveTote}
                onChange={(e) => setMoveArchiveTote(e.target.checked)}
              />
              <span>
                <span className="font-medium">После перемещения убрать приёмочную тару</span>
                <span className="block text-muted-foreground text-xs mt-0.5">
                  Единицы останутся без этой тары — для финиша приёмки.
                </span>
              </span>
            </label>
            <Button type="button" size="lg" className="min-h-12 w-full sm:max-w-md font-semibold" onClick={() => void submitMove()} disabled={moveBusy || !moveToLoc}>
              {moveBusy ? "Перемещаем…" : "Переместить сюда"}
            </Button>
            <div className="border-t pt-6 space-y-5 max-w-xl">
              <div>
                <div className="text-base font-semibold">Тара внутри тары</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Обе коробки должны стоять в одной ячейке. Сначала большая (снаружи), потом маленькая (внутрь).
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Большая тара</Label>
                  <Input
                    value={nestParentBc}
                    onChange={(e) => setNestParentBc(e.target.value)}
                    placeholder="Штрихкод"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-h-11 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Маленькая внутрь</Label>
                  <Input
                    value={nestChildBc}
                    onChange={(e) => setNestChildBc(e.target.value)}
                    placeholder="Штрихкод"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-h-11 font-mono"
                  />
                </div>
              </div>
              <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" disabled={nestBusy} onClick={() => void submitNest()}>
                {nestBusy ? "Складываем…" : "Положить маленькую в большую"}
              </Button>
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <Label className="text-sm font-medium">Достать маленькую из большой</Label>
                <p className="text-xs text-muted-foreground">Отсканируйте штрихкод той тары, которую вынимаете.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={unnestChildBc}
                    onChange={(e) => setUnnestChildBc(e.target.value)}
                    placeholder="Штрихкод маленькой тары"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-h-11 font-mono sm:flex-1"
                  />
                  <Button type="button" variant="secondary" className="min-h-11 shrink-0" disabled={unnestBusy} onClick={() => void submitUnnest()}>
                    {unnestBusy ? "…" : "Достать"}
                  </Button>
                </div>
              </div>
            </div>
            <div className="border-t pt-6 space-y-4 max-w-2xl">
              <div>
                <div className="text-base font-semibold">Задание «положить на полку»</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Берёт ту же ячейку, тару и единицы, что выше. Можно сразу нажать «Поставить в ячейку» — или сначала «На меня» /
                  «В работу», если так принято на смене.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11 w-full sm:w-auto"
                disabled={putawayBusy || !whId || !moveToLoc}
                onClick={() => void createPutawayTask()}
              >
                {putawayBusy ? "Создаём…" : "Создать задание на эту ячейку"}
              </Button>
              <details className="rounded-lg border bg-muted/15 px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-muted-foreground select-none py-1">
                  Назначить другого сотрудника (редко)
                </summary>
                <div className="pt-2 pb-1 space-y-2">
                  <Label className="text-xs">Его ID в системе</Label>
                  <Input
                    value={taskAssigneeUserId}
                    onChange={(e) => setTaskAssigneeUserId(e.target.value)}
                    placeholder="Вставьте из админки или профиля"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-sm min-h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Обычно не нужно: есть кнопка «На меня». Поле подставляется из вашего профиля автоматически.
                  </p>
                </div>
              </details>
              {tasks.length > 0 ? (
                <div className="rounded-xl border overflow-hidden">
                  <div className="border-b px-3 py-2.5 font-medium text-sm bg-muted/50">Сейчас в работе</div>
                  <ul className="divide-y max-h-[min(60vh,28rem)] overflow-y-auto">
                    {tasks.map((t) => {
                      const lively = t.type === "PUTAWAY" && ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(t.status)
                      const assigneeIsMe = me?.id && t.assigneeUserId === me.id
                      return (
                        <li key={t.id} className="flex flex-col gap-3 p-3 sm:p-4 bg-background">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono bg-muted/40">
                                {t.id.length > 18 ? `${t.id.slice(0, 10)}…${t.id.slice(-6)}` : t.id}
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${taskStatusBadgeClass(t.status)}`}
                                >
                                  {taskStatusLabel(t.status)}
                                </span>
                                {t.type === "PUTAWAY" ? (
                                  <span className="text-xs text-muted-foreground">Размещение</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{t.type}</span>
                                )}
                              </div>
                              {t.assigneeUserId ? (
                                <p className="text-xs text-muted-foreground">
                                  Исполнитель:{" "}
                                  <span className="font-medium text-foreground">
                                    {assigneeIsMe ? "вы" : `${t.assigneeUserId.slice(0, 8)}…`}
                                  </span>
                                </p>
                              ) : null}
                            </div>
                          </div>
                          {t.type === "PUTAWAY" ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                              {t.status === "OPEN" ? (
                                <>
                                  <Button
                                    type="button"
                                    size="lg"
                                    variant="default"
                                    className="min-h-11 w-full sm:w-auto sm:min-w-[9rem]"
                                    disabled={taskActionId === t.id || !me?.id}
                                    onClick={() => void assignTaskToMe(t.id)}
                                  >
                                    {taskActionId === t.id ? "…" : "На меня"}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="lg"
                                    variant="outline"
                                    className="min-h-11 w-full sm:w-auto"
                                    disabled={taskActionId === t.id}
                                    onClick={() => void assignTask(t.id)}
                                  >
                                    {taskActionId === t.id ? "…" : "На ID из поля"}
                                  </Button>
                                </>
                              ) : null}
                              {t.status === "OPEN" || t.status === "ASSIGNED" ? (
                                <Button
                                  type="button"
                                  size="lg"
                                  variant="secondary"
                                  className="min-h-11 w-full sm:w-auto"
                                  disabled={taskActionId === t.id}
                                  onClick={() => void startTask(t.id)}
                                >
                                  {taskActionId === t.id ? "…" : "В работу"}
                                </Button>
                              ) : null}
                              {lively ? (
                                <Button
                                  type="button"
                                  size="lg"
                                  className="min-h-11 w-full sm:flex-1 font-semibold"
                                  disabled={taskActionId === t.id}
                                  onClick={() => void completeTask(t.id)}
                                >
                                  {taskActionId === t.id ? "…" : "Поставить в ячейку"}
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center">
                  Заданий нет. Создайте — когда уже выбрали ячейку и что везёте.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Склады</CardTitle>
            <CardDescription>Физические и виртуальные склады WMS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {warehouses.length ? (
              warehouses.map((warehouse) => (
                <div key={warehouse.id} className="rounded-lg border p-3">
                  <div className="font-medium">{warehouse.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {warehouse.code} · {warehouse.kind} · {warehouse.status}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Склады еще не заведены.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Топология</CardTitle>
            <CardDescription>Дерево адресного хранения без жестко зашитых уровней.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {locations.slice(0, 8).map((location) => (
              <div key={location.id} className="rounded-lg border p-3">
                <div className="font-medium">{location.path}</div>
                <div className="text-xs text-muted-foreground">
                  {location.name} · {location.type} · {location.status}
                </div>
              </div>
            ))}
            {!locations.length ? <p className="text-sm text-muted-foreground">Ячейки еще не заведены.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>История</CardTitle>
            <CardDescription>Свежие события движения и сканирования.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border p-3">
                <div className="font-medium">{EVENT_TYPE_RU[event.type] ?? event.type}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(event.occurredAt).toLocaleString("ru-RU")} ·{" "}
                  {String(event.payload?.reason ?? event.payload?.title ?? event.payload?.number ?? "")}
                </div>
              </div>
            ))}
            {!events.length ? <p className="text-sm text-muted-foreground">История пока пустая.</p> : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Накладные</CardTitle>
          <CardDescription>
            «Штрихкоды» — распечатать или отсканировать. «Принять» — только когда у каждой позиции заполнены вес и размеры
            (кнопка «АГХ»).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!receipts.length ? <p className="text-sm text-muted-foreground">Пока нет накладных.</p> : null}
          {receipts.map((r) => (
            <div key={r.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{r.number}</div>
                  <div className="text-xs text-muted-foreground">{r.status}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={unitSheetBusy} onClick={() => void loadReceiptUnits(r.id, r.number)}>
                    Штрихкоды
                  </Button>
                  {r.status !== "RECEIVED" && r.status !== "CLOSED" ? (
                    <Button type="button" size="sm" onClick={() => void acceptRcpt(r.id)}>
                      Принять
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="text-sm space-y-1">
                {r.lines.map((ln) => (
                  <div key={ln.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 first:border-0 first:pt-0">
                    <span className="min-w-0">
                      <span className="font-medium">{ln.sku ?? ln.itemId.slice(0, 10)}</span>
                      {ln.lineTitle ? <span className="text-muted-foreground"> — {ln.lineTitle}</span> : null}
                      <span className="text-muted-foreground"> ×{ln.expectedQty}</span>
                      {ln.unitPrice != null ? <span className="text-muted-foreground"> · {ln.unitPrice} ₽</span> : null}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAgx({
                          itemId: ln.itemId,
                          sku: ln.sku ?? ln.itemId.slice(0, 12),
                          title: ln.lineTitle ?? "",
                        })
                      }
                    >
                      <Ruler className="h-3.5 w-3.5 mr-1" />
                      АГХ
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {agx ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !agxBusy && setAgx(null)}>
          <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">
              АГХ: {agx.sku}
              {agx.title ? <span className="font-normal text-muted-foreground"> — {agx.title}</span> : null}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">Вес в граммах, габариты в сантиметрах (в API уходят как мм).</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Вес, г</Label>
                <Input type="number" min={1} value={agxW} onChange={(e) => setAgxW(e.target.value)} />
              </div>
              <div>
                <Label>Длина, см</Label>
                <Input type="number" min={1} value={agxL} onChange={(e) => setAgxL(e.target.value)} />
              </div>
              <div>
                <Label>Ширина, см</Label>
                <Input type="number" min={1} value={agxWi} onChange={(e) => setAgxWi(e.target.value)} />
              </div>
              <div>
                <Label>Высота, см</Label>
                <Input type="number" min={1} value={agxH} onChange={(e) => setAgxH(e.target.value)} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAgx(null)} disabled={agxBusy}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void saveAgx()} disabled={agxBusy}>
                {agxBusy ? "…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {unitSheet ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !unitSheetBusy && setUnitSheet(null)}>
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">Единицы прихода {unitSheet.receiptNumber}</h3>
                <p className="text-xs text-muted-foreground">Внутренние штрихкоды для сканирования и учёта.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setUnitSheet(null)}>
                Закрыть
              </Button>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-2">Штрихкод</th>
                  <th className="py-2 pr-2">Статус</th>
                  <th className="py-2 pr-2">Цена ед.</th>
                </tr>
              </thead>
              <tbody>
                {unitSheet.units.map((u) => (
                  <tr key={u.barcode} className="border-b border-muted/40">
                    <td className="py-2 pr-2 font-mono">{u.barcode}</td>
                    <td className="py-2 pr-2">{u.status}</td>
                    <td className="py-2 pr-2">{u.declaredUnitPrice != null ? `${u.declaredUnitPrice} ₽` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unitSheet.units.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Нет единиц по этой накладной.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
