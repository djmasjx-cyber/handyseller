"use client"

import * as React from "react"
import { cn, Button, Badge } from "@handyseller/ui"
import { X, Check, Plus, Palette, Zap, AlertCircle } from "lucide-react"

// Bottom Navigation Bar (мобильная навигация одной рукой)
export function BottomNav({ active = 'home' }: { active?: 'home' | 'products' | 'orders' | 'analytics' | 'profile' }) {
  const items = [
    { id: 'home', icon: Zap, label: 'Главная' },
    { id: 'products', icon: Palette, label: 'Товары' },
    { id: 'orders', icon: '➕', label: '' }, // Центральная кнопка добавления
    { id: 'analytics', icon: '📈', label: 'Аналитика' },
    { id: 'profile', icon: '👤', label: 'Профиль' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 md:hidden">
      <div className="flex h-16 items-center justify-around px-2">
        {items.map((item) => {
          if (item.id === 'orders') {
            // Центральная большая кнопка
            return (
              <Button
                key={item.id}
                size="icon"
                className="h-14 w-14 rounded-full shadow-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-6 w-6" />
              </Button>
            )
          }

          const isActive = active === item.id
          const Icon = item.icon as React.ElementType

          return (
            <Button
              key={item.id}
              variant="ghost"
              className={cn(
                "flex flex-col items-center h-auto py-1 px-0.5",
                isActive && "text-primary"
              )}
            >
              {typeof item.icon === 'string' ? (
                <span className={cn("text-xl", isActive && "text-primary")}>{item.icon}</span>
              ) : (
                <Icon className={cn("h-6 w-6", isActive && "text-primary")} />
              )}
              <span className={cn("text-xs mt-0.5", isActive ? "font-medium text-primary" : "text-muted-foreground")}>
                {item.label}
              </span>
            </Button>
          )
        })}
      </div>
    </nav>
  )
}

// Product Card (для списка товаров)
export function ProductCard({
  id,
  name,
  price,
  imageUrl,
  status = 'active',
  marketplaceCount = 2,
  stock = 12,
}: {
  id: string
  name: string
  price: number
  imageUrl?: string
  status?: 'active' | 'draft' | 'out_of_stock'
  marketplaceCount?: number
  stock?: number
}) {
  const statusMap = {
    active: { label: 'Активно', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    draft: { label: 'Черновик', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
    out_of_stock: { label: 'Нет в наличии', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="relative h-48 w-full">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-muted flex items-center justify-center">
            <Palette className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
            {marketplaceCount} площадки
          </Badge>
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-lg line-clamp-1">{name}</h3>
            <p className="text-primary font-bold mt-1">{price.toLocaleString('ru-RU')} ₽</p>
          </div>
          <Badge variant="outline" className={cn("px-2 py-1", statusMap[status].color)}>
            {statusMap[status].label}
          </Badge>
        </div>
        
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center">
            <div className="h-2 w-2 rounded-full bg-green-500 mr-2" />
            <span>Остаток: {stock} шт.</span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// Quick Action Button (большая кнопка для частых действий)
export function QuickActionButton({
  icon: Icon,
  label,
  onClick,
  variant = 'primary',
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'outline'
}) {
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
    outline: 'border border-primary text-primary hover:bg-primary/5',
  }

  return (
    <Button
      onClick={onClick}
      className={cn(
        "w-full flex flex-col items-center justify-center h-24 rounded-2xl shadow-md transition-all hover:shadow-lg",
        variants[variant]
      )}
    >
      <div className={cn(
        "h-12 w-12 rounded-full flex items-center justify-center mb-2",
        variant === 'primary' && "bg-primary-foreground/20",
        variant === 'secondary' && "bg-secondary-foreground/20",
        variant === 'outline' && "bg-transparent border-2 border-current"
      )}>
        <Icon className={cn(
          "h-6 w-6",
          variant === 'primary' && "text-primary-foreground",
          variant === 'secondary' && "text-secondary-foreground",
          variant === 'outline' && "text-primary"
        )} />
      </div>
      <span className="font-medium text-lg">{label}</span>
    </Button>
  )
}

// Materials Chip (для отображения материалов)
export function MaterialsChip({
  materials,
}: {
  materials: { name: string; amount: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {materials.map((material, index) => (
        <div
          key={index}
          className="flex items-center bg-muted rounded-full px-3 py-1 text-sm"
        >
          <span>{material.name}</span>
          <span className="text-muted-foreground ml-1">({material.amount})</span>
        </div>
      ))}
    </div>
  )
}

// Alert Banner (для важных уведомлений)
export function AlertBanner({
  type = 'info',
  children,
}: {
  type?: 'info' | 'warning' | 'success' | 'error'
  children: React.ReactNode
}) {
  const config = {
    info: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-800 dark:text-blue-300', icon: AlertCircle },
    warning: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', text: 'text-yellow-800 dark:text-yellow-300', icon: AlertCircle },
    success: { bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-800 dark:text-green-300', icon: Check },
    error: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-800 dark:text-red-300', icon: AlertCircle },
  }

  const { bg, text, icon: Icon } = config[type]

  return (
    <div className={cn("rounded-lg p-4 flex items-start space-x-3", bg, text)}>
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div className="text-sm">{children}</div>
    </div>
  )
}
