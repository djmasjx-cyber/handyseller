"use client"

import Link from "next/link"
import { reachGoal } from "@/lib/metrika"
import type { ComponentProps, ReactNode, AnchorHTMLAttributes } from "react"

interface TrackedLinkProps extends Omit<ComponentProps<typeof Link>, "onClick"> {
  /** Идентификатор цели для Яндекс.Метрики */
  goal?: string
  /** Дополнительные параметры цели */
  goalParams?: Record<string, unknown>
  children: ReactNode
}

/**
 * Link-компонент с отслеживанием целей в Яндекс.Метрике.
 * При клике отправляет цель и затем переходит по ссылке.
 */
export function TrackedLink({ goal, goalParams, children, ...props }: TrackedLinkProps) {
  const handleClick = () => {
    if (goal) {
      reachGoal(goal, goalParams)
    }
  }

  return (
    <Link {...props} onClick={handleClick}>
      {children}
    </Link>
  )
}

interface TrackedAnchorProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "onClick"> {
  /** Идентификатор цели для Яндекс.Метрики */
  goal?: string
  /** Дополнительные параметры цели */
  goalParams?: Record<string, unknown>
  children: ReactNode
}

/**
 * Anchor-компонент с отслеживанием целей в Яндекс.Метрике.
 * Для якорных ссылок (#section) и внешних URL.
 */
export function TrackedAnchor({ goal, goalParams, children, ...props }: TrackedAnchorProps) {
  const handleClick = () => {
    if (goal) {
      reachGoal(goal, goalParams)
    }
  }

  return (
    <a {...props} onClick={handleClick}>
      {children}
    </a>
  )
}
