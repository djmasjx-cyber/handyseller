"use client"

import { useRef, useEffect, useState } from "react"
import { Button } from "@handyseller/ui"
import { X } from "lucide-react"
import { ReactBarcode, Renderer } from "react-jsbarcode"

export type LabelType = "product" | "order"
export type LabelSize = "40x25" | "60x40"

const LABEL_SIZES: { value: LabelSize; label: string }[] = [
  { value: "40x25", label: "40×25 мм" },
  { value: "60x40", label: "60×40 мм" },
]

interface PrintLabelsModalProps {
  open: boolean
  onClose: () => void
  order: {
    id: string
    marketplace: string
    externalId: string
    items: Array<{
      id: string
      quantity: number
      product?: {
        title?: string
        article?: string
        barcodeWb?: string | null
        barcodeOzon?: string | null
      }
      productBarcodeWb?: string | null
      productBarcodeOzon?: string | null
    }>
    wbStickerNumber?: string | null
    ozonPostingNumber?: string | null
  }
  labelType: LabelType
}

function getProductBarcode(
  item: PrintLabelsModalProps["order"]["items"][0],
  marketplace: string
): string | null {
  const wb = item.productBarcodeWb ?? item.product?.barcodeWb
  const ozon = item.productBarcodeOzon ?? item.product?.barcodeOzon
  return marketplace === "WILDBERRIES" ? (wb ?? null) : marketplace === "OZON" ? (ozon ?? null) : null
}

function getOrderLabelData(
  order: PrintLabelsModalProps["order"],
  marketplace: string
): string | null {
  // WB: номер стикера = id заказа (числовой), не externalId. Берём только из API.
  if (marketplace === "WILDBERRIES") return order.wbStickerNumber ?? null
  if (marketplace === "OZON") return order.ozonPostingNumber ?? order.externalId ?? null
  return null
}

function getBarcodeOptions(size: LabelSize) {
  return size === "40x25"
    ? { format: "CODE128" as const, width: 0.9, height: 22, displayValue: true, fontSize: 8 }
    : { format: "CODE128" as const, width: 1.4, height: 58, displayValue: true, fontSize: 10 }
}

const getLabelDimensions = (s: LabelSize) =>
  s === "40x25" ? { w: "40mm", h: "25mm", imgW: "38mm", imgH: "23mm" } : { w: "60mm", h: "40mm", imgW: "58mm", imgH: "38mm" }

export function PrintLabelsModal({ open, onClose, order, labelType }: PrintLabelsModalProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const [labelSize, setLabelSize] = useState<LabelSize>("40x25")
  const [wbStickerImg, setWbStickerImg] = useState<string | null>(null)
  const [wbStickerError, setWbStickerError] = useState<string | null>(null)
  const [wbStickerLoading, setWbStickerLoading] = useState(false)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  // WB: загружаем стикер с API при открытии этикетки заказа
  useEffect(() => {
    if (!open || labelType !== "order" || order.marketplace !== "WILDBERRIES" || !order.wbStickerNumber) {
      setWbStickerImg(null)
      setWbStickerError(null)
      setWbStickerLoading(false)
      return
    }
    setWbStickerLoading(true)
    setWbStickerError(null)
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null
    if (!token) {
      setWbStickerError("Нет доступа")
      setWbStickerLoading(false)
      return
    }
    fetch(`/api/orders/${order.id}/wb-sticker`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.file) {
          setWbStickerImg(`data:image/png;base64,${data.file}`)
          setWbStickerError(null)
        } else {
          setWbStickerImg(null)
          setWbStickerError(data.error ?? "Стикер недоступен")
        }
      })
      .catch(() => {
        setWbStickerImg(null)
        setWbStickerError("Ошибка загрузки")
      })
      .finally(() => setWbStickerLoading(false))
  }, [open, labelType, order.id, order.marketplace, order.wbStickerNumber])

  const handlePrint = () => {
    if (!printRef.current) return
    const printWindow = window.open("", "_blank")
    if (!printWindow) return
    const dim = getLabelDimensions(labelSize)
    const labelHtml = printRef.current.innerHTML.replace(/class="label /g, 'class="label print-label ')
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Печать этикеток</title>
          <style>
            @page { size: ${dim.w} ${dim.h}; margin: 0; }
            body { font-family: system-ui; margin: 0; padding: 0; }
            .print-label { width: ${dim.w}; height: ${dim.h}; box-sizing: border-box; page-break-after: always;
              padding: 0.5mm; border: none; display: flex; flex-direction: column;
              justify-content: flex-start; overflow: hidden; page-break-inside: avoid; }
            .print-label:last-child { page-break-after: auto; }
            .label-title { font-size: ${labelSize === "40x25" ? "7px" : "9px"}; margin-bottom: 0.3mm; line-height: 1.15; overflow: hidden;
              display: -webkit-box; -webkit-box-orient: vertical; }
            .print-label.order-label .label-title { -webkit-line-clamp: 1; }
            .print-label:not(.order-label) .label-title { -webkit-line-clamp: 3; }
            .barcode-wrap { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; }
            .barcode-wrap svg { width: 100% !important; height: auto !important; max-height: 100%; }
            .qr-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
            .qr-wrap svg { max-width: 85%; max-height: 85%; }
            .qr-wrap p { font-size: ${labelSize === "40x25" ? "8px" : "10px"}; margin: 1mm 0 0; }
            .sticker-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 0; overflow: hidden; }
            .sticker-wrap img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
            .print-label.order-label { min-width: unset !important; min-height: unset !important; width: ${dim.w} !important; height: ${dim.h} !important; }
            .print-label.order-label .order-label-inner { width: 100% !important; height: 100% !important; box-sizing: border-box; overflow: hidden !important; }
            .print-label.order-label .order-label-inner .sticker-wrap img { max-width: ${dim.imgW} !important; max-height: ${dim.imgH} !important; width: auto !important; height: auto !important; object-fit: contain !important; }
            @media print { .print-label { width: ${dim.w} !important; height: ${dim.h} !important; overflow: hidden !important; } }
          </style>
        </head>
        <body>
          ${labelHtml}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
  }

  if (!open) return null

  const isWb = order.marketplace === "WILDBERRIES"
  const isOzon = order.marketplace === "OZON"
  const marketplaceLabel = isWb ? "WB" : isOzon ? "Ozon" : order.marketplace

  const productLabels =
    labelType === "product"
      ? order.items.flatMap((item) => {
          const barcode = getProductBarcode(item, order.marketplace)
          const title = item.product?.title ?? item.product?.article ?? "Товар"
          const dim = getLabelDimensions(labelSize)
          if (!barcode) return []
          return Array.from({ length: item.quantity }, (_, i) => (
            <div
              key={`${item.id}-${i}`}
              className="label rounded p-1.5 flex flex-col justify-center overflow-hidden bg-white"
              style={{
                width: dim.w,
                height: dim.h,
                minWidth: labelSize === "40x25" ? 120 : 180,
                minHeight: labelSize === "40x25" ? 75 : 120,
              }}
            >
              <div className="label-title text-xs line-clamp-3 break-words">
                {marketplaceLabel} · {title}
              </div>
              <div className="barcode-wrap flex-1 flex items-center justify-center min-h-0">
                <ReactBarcode
                  value={barcode}
                  options={getBarcodeOptions(labelSize)}
                  renderer={Renderer.SVG}
                />
              </div>
            </div>
          ))
        })
      : []

  const orderLabelData = labelType === "order" ? getOrderLabelData(order, order.marketplace) : null
  const isWbOrderLabel = labelType === "order" && isWb
  const wbOrderHasStickerNumber = isWbOrderLabel && !!order.wbStickerNumber

  const hasContent =
    (labelType === "product" && productLabels.length > 0) ||
    (labelType === "order" && (isWb ? wbOrderHasStickerNumber : !!orderLabelData))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">
            {labelType === "product"
              ? `Этикетка товара (${marketplaceLabel})`
              : `Этикетка заказа (${marketplaceLabel})`}
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-4 pt-2 pb-4 border-b flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Размер этикетки:</span>
          <div className="flex gap-2">
            {LABEL_SIZES.map(({ value, label }) => (
              <Button
                key={value}
                variant={labelSize === value ? "default" : "outline"}
                size="sm"
                onClick={() => setLabelSize(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="p-4 overflow-auto flex-1" data-label-type={labelType}>
          {labelType === "order" && hasContent && (
            <style>{`
              [data-label-type="order"] .order-label .label-title {
                position: relative;
                z-index: 1;
                background: white;
                padding-bottom: 2px;
                margin-bottom: 2px;
              }
            `}</style>
          )}
          {!hasContent ? (
            <p className="text-muted-foreground text-sm py-6 text-center">
              {labelType === "product"
                ? "Нет штрих-кода товара. Заполните штрих-код в карточке товара."
                : labelType === "order" && order.marketplace === "WILDBERRIES"
                  ? "Нет номера стикера. Запустите синхронизацию заказов."
                  : "Нет данных для этикетки заказа."}
            </p>
          ) : (
            <div
              ref={printRef}
              className="space-y-3 print:block"
              style={
                {
                  "--label-w": labelSize === "40x25" ? "40mm" : "60mm",
                  "--label-h": labelSize === "40x25" ? "25mm" : "40mm",
                } as React.CSSProperties
              }
            >
              {labelType === "product" && productLabels}
              {labelType === "order" && (orderLabelData || wbOrderHasStickerNumber) && (() => {
                const dim = getLabelDimensions(labelSize)
                return (
                  <div
                    className="label order-label rounded p-1.5 flex flex-col justify-center overflow-hidden bg-white"
                    style={{
                      width: dim.w,
                      height: dim.h,
                      minWidth: labelSize === "40x25" ? 120 : 180,
                      minHeight: labelSize === "40x25" ? 75 : 120,
                    }}
                  >
                    <div className="order-label-inner flex flex-col flex-1 min-h-0 w-full items-center overflow-hidden">
                      {!isWb && (
                        <div className="label-title text-xs line-clamp-1 break-words shrink-0">
                          {marketplaceLabel} · Заказ {order.externalId}
                        </div>
                      )}
                      {isWb ? (
                        <div className="sticker-wrap flex-1 flex flex-col items-center justify-center min-h-0">
                          {wbStickerLoading && (
                            <p className="text-sm text-muted-foreground py-4">Загрузка стикера...</p>
                          )}
                          {wbStickerError && !wbStickerLoading && (
                            <p className="text-sm text-destructive/80 px-2 py-4 text-center">
                              {wbStickerError}
                            </p>
                          )}
                          {wbStickerImg && (
                            <img
                              src={wbStickerImg}
                              alt="Стикер заказа WB"
                              className="max-w-full max-h-full object-contain"
                              style={{ maxWidth: dim.imgW, maxHeight: dim.imgH }}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="barcode-wrap flex-1 flex items-center justify-center min-h-0">
                          <ReactBarcode
                            value={orderLabelData!}
                            options={getBarcodeOptions(labelSize)}
                            renderer={Renderer.SVG}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
        {hasContent && (
          <div className="p-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Закрыть
            </Button>
            <Button onClick={handlePrint}>Печать</Button>
          </div>
        )}
      </div>
    </div>
  )
}
