"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, Input, Label, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { User, Smartphone, Link2, Mail, Building2, Loader2 } from "lucide-react"

function userCookie(name: string) {
  return `user_name=${encodeURIComponent(name)}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`
}

// ---------------------------------------------------------------------------
// Справочники
// ---------------------------------------------------------------------------

const ENTITY_TYPES = ["ООО", "ИП", "АО", "ПАО", "НКО"]

const TAX_SYSTEMS = [
  { value: "ОСНО",                  label: "ОСНО — общая система налогообложения" },
  { value: "УСН_ДОХОДЫ",           label: "УСН «Доходы» (6%)" },
  { value: "УСН_ДОХОДЫ_РАСХОДЫ",   label: "УСН «Доходы минус расходы» (15%)" },
  { value: "ПСН",                   label: "ПСН — патентная система" },
  { value: "ЕСХН",                  label: "ЕСХН — единый сельскохозяйственный налог" },
  { value: "НПД",                   label: "НПД — налог на профессиональный доход (самозанятый)" },
  { value: "АУСН",                  label: "АУСН — автоматизированная УСН" },
]

const VAT_RATES = [
  { value: "БЕЗ_НДС", label: "Без НДС" },
  { value: "0",        label: "0%" },
  { value: "5",        label: "5%" },
  { value: "7",        label: "7%" },
  { value: "10",       label: "10%" },
  { value: "20",       label: "20% (основная ставка)" },
]

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

interface OrgProfile {
  entityType?: string
  taxSystem?: string
  vatRate?: string
  inn?: string
  kpp?: string
  ogrn?: string
  okpo?: string
  okved?: string
  fullName?: string
  shortName?: string
  legalAddress?: string
  actualAddress?: string
  bik?: string
  bankName?: string
  settlementAccount?: string
  corrAccount?: string
  orgPhone?: string
  directorName?: string
  chiefAccountant?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SelectField({
  value, onChange, options, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function TextField({
  value, onChange, placeholder, maxLength,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
    />
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<"profile" | "organization">("profile")

  // Profile
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [linkedToUserEmail, setLinkedToUserEmail] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Organization
  const [org, setOrg] = useState<OrgProfile>({})
  const [orgSaving, setOrgSaving] = useState(false)
  const [orgLoading, setOrgLoading] = useState(false)
  const [orgMsg, setOrgMsg] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null

  useEffect(() => {
    if (!token) { router.push("/login"); return }
    fetch("/api/users/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.email) {
          setName(data.name ?? "")
          setPhone(data.phone ?? "")
          setEmail(data.email ?? "")
          setLinkedToUserEmail(data.linkedToUserEmail ?? "")
        }
      })
      .catch(() => {})
  }, [router, token])

  useEffect(() => {
    if (!token || activeTab !== "organization") return
    setOrgLoading(true)
    fetch("/api/users/me/organization", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setOrg(data ?? {}))
      .catch(() => {})
      .finally(() => setOrgLoading(false))
  }, [activeTab, token])

  function setOrgField(field: keyof OrgProfile, value: string) {
    setOrg((prev) => ({ ...prev, [field]: value }))
  }

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) { router.push("/login"); return }
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          linkedToUserEmail: linkedToUserEmail.trim() ? linkedToUserEmail.trim() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Ошибка сохранения")
      document.cookie = userCookie(data.name || name.trim())
      setProfileMsg({ type: "success", text: "Профиль сохранён" })
    } catch (err) {
      setProfileMsg({ type: "error", text: err instanceof Error ? err.message : "Ошибка сохранения" })
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleOrgSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) { router.push("/login"); return }
    setOrgSaving(true)
    setOrgMsg(null)
    try {
      const res = await fetch("/api/users/me/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(org),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Ошибка сохранения")
      setOrg(data)
      setOrgMsg({ type: "success", text: "Реквизиты сохранены" })
    } catch (err) {
      setOrgMsg({ type: "error", text: err instanceof Error ? err.message : "Ошибка сохранения" })
    } finally {
      setOrgSaving(false)
    }
  }

  const showKpp = org.entityType !== "ИП"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Настройки</h1>
        <p className="text-muted-foreground">Профиль и реквизиты организации</p>
      </div>

      {/* Вкладки */}
      <div className="flex gap-0 border-b">
        {([
          { key: "profile",      label: "Профиль",      icon: <User className="h-4 w-4" /> },
          { key: "organization", label: "Реквизиты",    icon: <Building2 className="h-4 w-4" /> },
        ] as { key: "profile" | "organization"; label: string; icon: React.ReactNode }[]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Профиль ── */}
      {activeTab === "profile" && (
        <Card>
          <CardHeader>
            <CardTitle>Личные данные</CardTitle>
            <CardDescription>
              Имя отображается на главной странице дашборда.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileSubmit} className="space-y-4 max-w-md">
              {profileMsg && (
                <div className={`rounded-md p-3 text-sm ${
                  profileMsg.type === "success"
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : "bg-destructive/10 text-destructive"
                }`}>
                  {profileMsg.text}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">ФИО</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванов Иван Иванович" className="pl-10" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Телефон</Label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 (999) 123-45-67" className="pl-10" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Почта</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="email" value={email} readOnly className="pl-10 bg-muted cursor-default" />
                </div>
                <p className="text-xs text-muted-foreground">Email используется для входа — изменить можно через обращение в поддержку.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedToUserEmail">Привязка к другому аккаунту</Label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="linkedToUserEmail"
                    type="email"
                    value={linkedToUserEmail}
                    onChange={(e) => setLinkedToUserEmail(e.target.value)}
                    placeholder="email@example.com — доступ к маркетплейсам этого аккаунта"
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Укажите email основного аккаунта, чтобы использовать его Ozon и Wildberries. Оставьте пустым для отвязки.
                </p>
              </div>

              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? "Сохранение…" : "Сохранить профиль"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Реквизиты организации ── */}
      {activeTab === "organization" && (
        <Card>
          <CardHeader>
            <CardTitle>Реквизиты организации</CardTitle>
            <CardDescription>
              Используются для выставления счетов, актов выполненных работ и договоров.
              В дальнейшем по ИНН можно будет автозаполнять поля, по БИК — подтягивать банк.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orgLoading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Загрузка…
              </div>
            ) : (
              <form onSubmit={handleOrgSubmit} className="space-y-8">
                {orgMsg && (
                  <div className={`rounded-md p-3 text-sm ${
                    orgMsg.type === "success"
                      ? "bg-green-500/10 text-green-700 dark:text-green-400"
                      : "bg-destructive/10 text-destructive"
                  }`}>
                    {orgMsg.text}
                  </div>
                )}

                {/* ── Тип и налогообложение ── */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Организационно-правовая форма</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FieldRow label="Форма организации">
                      <SelectField
                        value={org.entityType ?? ""}
                        onChange={(v) => setOrgField("entityType", v)}
                        options={ENTITY_TYPES.map((t) => ({ value: t, label: t }))}
                        placeholder="Выберите…"
                      />
                    </FieldRow>
                    <FieldRow label="Система налогообложения">
                      <SelectField
                        value={org.taxSystem ?? ""}
                        onChange={(v) => setOrgField("taxSystem", v)}
                        options={TAX_SYSTEMS}
                        placeholder="Выберите…"
                      />
                    </FieldRow>
                    <FieldRow label="Ставка НДС">
                      <SelectField
                        value={org.vatRate ?? ""}
                        onChange={(v) => setOrgField("vatRate", v)}
                        options={VAT_RATES}
                        placeholder="Выберите…"
                      />
                    </FieldRow>
                  </div>
                </section>

                {/* ── Идентификаторы ── */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Идентификаторы</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FieldRow label="ИНН" hint="10 цифр (ООО/АО) или 12 цифр (ИП)">
                      <TextField value={org.inn ?? ""} onChange={(v) => setOrgField("inn", v)} placeholder="7701234567" maxLength={12} />
                    </FieldRow>
                    {showKpp && (
                      <FieldRow label="КПП" hint="9 цифр — только для ООО/АО">
                        <TextField value={org.kpp ?? ""} onChange={(v) => setOrgField("kpp", v)} placeholder="770101001" maxLength={9} />
                      </FieldRow>
                    )}
                    <FieldRow label={org.entityType === "ИП" ? "ОГРНИП" : "ОГРН"} hint={org.entityType === "ИП" ? "15 цифр" : "13 цифр"}>
                      <TextField value={org.ogrn ?? ""} onChange={(v) => setOrgField("ogrn", v)} placeholder={org.entityType === "ИП" ? "315770000123456" : "1027700123456"} maxLength={15} />
                    </FieldRow>
                    <FieldRow label="ОКПО">
                      <TextField value={org.okpo ?? ""} onChange={(v) => setOrgField("okpo", v)} placeholder="12345678" maxLength={10} />
                    </FieldRow>
                    <FieldRow label="ОКВЭД" hint="Основной код деятельности">
                      <TextField value={org.okved ?? ""} onChange={(v) => setOrgField("okved", v)} placeholder="47.91" maxLength={10} />
                    </FieldRow>
                  </div>
                </section>

                {/* ── Наименования ── */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Наименование</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <FieldRow label="Полное наименование" hint='Например: Общество с ограниченной ответственностью «Ромашка»'>
                      <TextField value={org.fullName ?? ""} onChange={(v) => setOrgField("fullName", v)} placeholder='ООО "Ромашка"' />
                    </FieldRow>
                    <FieldRow label="Сокращённое наименование">
                      <TextField value={org.shortName ?? ""} onChange={(v) => setOrgField("shortName", v)} placeholder='ООО "Ромашка"' />
                    </FieldRow>
                  </div>
                </section>

                {/* ── Адреса ── */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Адреса</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <FieldRow label="Юридический адрес">
                      <TextField value={org.legalAddress ?? ""} onChange={(v) => setOrgField("legalAddress", v)} placeholder="123456, г. Москва, ул. Примерная, д. 1, оф. 1" />
                    </FieldRow>
                    <FieldRow label="Фактический адрес" hint="Оставьте пустым, если совпадает с юридическим">
                      <TextField value={org.actualAddress ?? ""} onChange={(v) => setOrgField("actualAddress", v)} placeholder="Совпадает с юридическим" />
                    </FieldRow>
                  </div>
                </section>

                {/* ── Банковские реквизиты ── */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Банковские реквизиты</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FieldRow label="БИК" hint="9 цифр — по БИК автоматически подтягивается банк (в разработке)">
                      <TextField value={org.bik ?? ""} onChange={(v) => setOrgField("bik", v)} placeholder="044525225" maxLength={9} />
                    </FieldRow>
                    <FieldRow label="Банк">
                      <TextField value={org.bankName ?? ""} onChange={(v) => setOrgField("bankName", v)} placeholder="ПАО Сбербанк" />
                    </FieldRow>
                    <FieldRow label="Расчётный счёт" hint="20 цифр">
                      <TextField value={org.settlementAccount ?? ""} onChange={(v) => setOrgField("settlementAccount", v)} placeholder="40702810123456789012" maxLength={20} />
                    </FieldRow>
                    <FieldRow label="Корреспондентский счёт" hint="20 цифр">
                      <TextField value={org.corrAccount ?? ""} onChange={(v) => setOrgField("corrAccount", v)} placeholder="30101810400000000225" maxLength={20} />
                    </FieldRow>
                  </div>
                </section>

                {/* ── Контакты и подписанты ── */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Контакты и подписанты</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FieldRow label="Телефон организации">
                      <TextField value={org.orgPhone ?? ""} onChange={(v) => setOrgField("orgPhone", v)} placeholder="+7 (495) 123-45-67" />
                    </FieldRow>
                    <FieldRow
                      label={org.entityType === "ИП" ? "ИП (ФИО)" : "Генеральный директор"}
                      hint="ФИО в именительном падеже — для подписи в документах"
                    >
                      <TextField value={org.directorName ?? ""} onChange={(v) => setOrgField("directorName", v)} placeholder="Иванов Иван Иванович" />
                    </FieldRow>
                    {showKpp && (
                      <FieldRow label="Главный бухгалтер" hint="ФИО — для подписи в документах">
                        <TextField value={org.chiefAccountant ?? ""} onChange={(v) => setOrgField("chiefAccountant", v)} placeholder="Петрова Мария Ивановна" />
                      </FieldRow>
                    )}
                  </div>
                </section>

                <Button type="submit" disabled={orgSaving}>
                  {orgSaving ? "Сохранение…" : "Сохранить реквизиты"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
