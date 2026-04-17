"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"

export function TmsPlaceholder({
  title,
  description,
  body,
}: {
  title: string
  description: string
  body: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  )
}
