"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Input, Textarea, Label, Card, Badge } from "@handyseller/ui"
import {
  ArrowLeft,
  Image as ImageIcon,
  Palette,
  Tag,
  Package,
  Zap,
  Plus,
  X,
} from "lucide-react"
import { AlertBanner } from "@/components/mobile"

export default function AddProductPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  async function handleBack() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    router.push("/")
  }
  const [images, setImages] = useState<string[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [cost, setCost] = useState('')
  const [materials, setMaterials] = useState<{ name: string; amount: string }[]>([
    { name: 'Чешский бисер', amount: '50 г' },
    { name: 'Леска', amount: '2 м' },
  ])
  const [newMaterial, setNewMaterial] = useState('')

  const addImage = () => {
    // В реальном приложении: открыть камеру/галерею
    const placeholder = `/placeholder-${images.length + 1}.jpg`
    setImages([...images, placeholder])
  }

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index))
  }

  const addMaterial = () => {
    if (newMaterial.trim()) {
      setMaterials([...materials, { name: newMaterial.trim(), amount: '1 шт.' }])
      setNewMaterial('')
    }
  }

  const removeMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index))
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container flex items-center h-14 px-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 text-center font-bold text-lg">
            Шаг {step} из 4
          </div>
          <div className="w-10" />
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${step * 25}%` }}
        />
      </div>

      {/* Content */}
      <div className="container px-4 py-6">
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <ImageIcon className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Загрузите фото</h1>
              <p className="text-muted-foreground">
                Фотографируйте изделие с разных ракурсов. Можно до 5 фото.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {images.map((image, index) => (
                <div key={index} className="relative aspect-square rounded-lg overflow-hidden border border-dashed border-border">
                  <img
                    src={image}
                    alt={`Фото ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-md"
                    onClick={() => removeImage(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {images.length < 5 && (
                <button
                  onClick={addImage}
                  className="aspect-square rounded-lg border-2 border-dashed border-primary bg-primary/5 flex flex-col items-center justify-center text-primary"
                >
                  <Plus className="h-6 w-6 mb-1" />
                  <span className="text-xs font-medium">Добавить</span>
                </button>
              )}
            </div>

            <div className="bg-muted rounded-lg p-4 text-center text-sm text-muted-foreground">
              💡 Совет: Фотографируйте на светлом фоне без теней
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Tag className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Название и описание</h1>
              <p className="text-muted-foreground">
                Расскажите о своём изделии. Покупатели любят истории!
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Название изделия</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Бусины из чешского бисера ручной работы"
                  className="text-lg font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Расскажите о материале, размерах, особенностях изделия..."
                  className="min-h-[120px]"
                />
              </div>

              <div className="bg-muted rounded-lg p-4 space-y-3">
                <p className="font-medium">Готовые фразы:</p>
                <div className="flex flex-wrap gap-2">
                  {['Ручная работа', 'Уникальный дизайн', 'Подарочная упаковка'].map((phrase) => (
                    <Badge
                      key={phrase}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80 transition-colors"
                      onClick={() => setDescription(prev => prev + (prev ? ' ' : '') + phrase)}
                    >
                      {phrase}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Palette className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Материалы</h1>
              <p className="text-muted-foreground">
                Укажите материалы для расчёта себестоимости
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-3">
                {materials.map((material, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-card rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{material.name}</p>
                      <p className="text-sm text-muted-foreground">{material.amount}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMaterial(index)}
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={newMaterial}
                  onChange={(e) => setNewMaterial(e.target.value)}
                  placeholder="Название материала (бисер, леска...)"
                  className="flex-1"
                />
                <Button onClick={addMaterial} size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="bg-muted rounded-lg p-4 text-center text-sm text-muted-foreground">
                💡 Совет: Укажите точное количество — система сама посчитает себестоимость
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Себестоимость и площадки</h1>
              <p className="text-muted-foreground">
                Укажите себестоимость и выберите маркетплейсы для продажи
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cost">Себестоимость (₽)</Label>
                <div className="relative">
                  <Input
                    id="cost"
                    type="number"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="Для аналитики"
                    className="pl-8 text-2xl font-bold"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₽</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Рекомендуемая цена: {(Math.random() * 500 + 1000).toFixed(0)} ₽
                </p>
              </div>

              <div className="space-y-2">
                <Label>Маркетплейсы</Label>
                <div className="grid grid-cols-2 gap-3">
                  {['Wildberries', 'Ozon', 'Яндекс.Маркет', 'Ярмарка Мастеров'].map((marketplace) => (
                    <Card
                      key={marketplace}
                      className="p-4 flex flex-col items-center justify-center text-center border-2 border-muted-foreground/20 hover:border-primary/50 transition-colors cursor-pointer"
                    >
                      <div className="font-medium mb-1">{marketplace}</div>
                      <div className="text-xs text-muted-foreground">+5% к продажам</div>
                    </Card>
                  ))}
                </div>
              </div>

              <AlertBanner type="info">
                При публикации товар автоматически появится на всех выбранных площадках
              </AlertBanner>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="fixed bottom-16 left-0 right-0 bg-background/90 backdrop-blur-sm border-t border-border p-4 container mx-auto">
          <div className="flex gap-3">
            {step > 1 && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(step - 1)}
              >
                Назад
              </Button>
            )}
            <Button
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                if (step < 4) {
                  setStep(step + 1)
                } else {
                  alert('Товар опубликован! Он появится на маркетплейсах в течение 15 минут.')
                  // В реальном приложении: отправка на бэкенд
                }
              }}
            >
              {step < 4 ? 'Далее' : 'Опубликовать'}
              <Zap className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
