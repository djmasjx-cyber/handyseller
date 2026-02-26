"use client"

import { useState } from "react"
import { Button, Card } from "@handyseller/ui"
import {
  Zap,
  Palette,
  Package,
  Camera,
} from "lucide-react"
import {
  ProductCard,
  QuickActionButton,
  AlertBanner,
} from "@/components/mobile"

export default function MobileHomePage() {
  const [products] = useState([
    {
      id: '1',
      name: 'Бусины из чешского бисера',
      price: 1200,
      imageUrl: '/placeholder-businy-1.jpg',
      status: 'active' as const,
      marketplaceCount: 2,
      stock: 8,
    },
    {
      id: '2',
      name: 'Колье ручной работы',
      price: 2500,
      imageUrl: '/placeholder-kolye.jpg',
      status: 'active' as const,
      marketplaceCount: 2,
      stock: 3,
    },
    {
      id: '3',
      name: 'Серьги с бирюзой',
      price: 850,
      imageUrl: '/placeholder-sergi.jpg',
      status: 'out_of_stock' as const,
      marketplaceCount: 1,
      stock: 0,
    },
  ])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14 px-4">
          <div className="flex items-center space-x-2">
            <div className="rounded-lg bg-primary p-2">
              <Palette className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">HandySeller</span>
          </div>
          <Button variant="ghost" size="icon">
            <Zap className="h-5 w-5 text-primary" />
          </Button>
        </div>
      </header>

      {/* Alerts */}
      <div className="container px-4 py-3 space-y-3">
        <AlertBanner type="warning">
          У 2 товаров заканчиваются остатки. Пополните запасы!
        </AlertBanner>
      </div>

      {/* Quick Actions */}
      <div className="container px-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <QuickActionButton
            icon={Camera}
            label="Новое фото"
            onClick={() => alert('Открываем камеру...')}
            variant="primary"
          />
          <QuickActionButton
            icon={Package}
            label="Добавить товар"
            onClick={() => alert('Открываем форму добавления...')}
            variant="secondary"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="container px-4 py-4">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-primary mb-1">24</div>
            <div className="text-xs text-muted-foreground">товара</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-green-500 mb-1">15 400</div>
            <div className="text-xs text-muted-foreground">₽ за месяц</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-500 mb-1">8</div>
            <div className="text-xs text-muted-foreground">заказов</div>
          </Card>
        </div>
      </div>

      {/* Products Section */}
      <div className="container px-4 py-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Мои товары</h2>
          <Button variant="link" className="text-primary p-0 h-auto font-medium">
            Все товары →
          </Button>
        </div>
        
        <div className="space-y-4">
          {products.map((product) => (
            <ProductCard key={product.id} {...product} />
          ))}
        </div>
      </div>
    </div>
  )
}
