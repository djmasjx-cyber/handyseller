/**
 * Печать внутренних этикеток WMS (40×27 мм) из браузера.
 *
 * Важно по ограничениям платформы: из веб-страницы нельзя «тихо» выбрать USB/сетевой
 * принтер без системного шага. Обычно это **один вызов `window.print()`** — система
 * предлагает принтер (достаточно один раз выбрать «принтер этикеток» по умолчанию).
 * Без диалога только: киоск/политика Chrome, отдельный агент (например QZ Tray) или
 * нативная оболочка — при необходимости подключаются отдельно.
 *
 * - Одна этикетка: HTML + `@page` 40mm×27mm, Code128 через {@link printWmsShelfLabelFromPayload}
 *   (сразу печать, без отдельного просмотрщика и без лишнего API-запроса, если данные уже в UI).
 * - Пакет: PDF с бэка — печать из скрытого кадра {@link printWmsLabelPdfBlob}.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export type WmsShelfLabelPayload = {
  /** Артикул (или SKU) для строки «Арт.» */
  article: string
  /** Название товара */
  title: string
  /** Зарезервированный штрихкод единицы (Code 128) */
  barcode: string
}

/**
 * Мгновенно открывает системный диалог печати: одна страница 40×27 мм, поля как на PDF.
 * Не обращается к серверу (удобно при клике по штрихкоду в таблице).
 */
export async function printWmsShelfLabelFromPayload(payload: WmsShelfLabelPayload): Promise<void> {
  if (typeof window === "undefined") return
  const bc = String(payload.barcode ?? "").trim()
  if (!bc) {
    throw new Error("Пустой штрихкод — нечего печатать.")
  }
  const { default: JsBarcode } = await import("jsbarcode")
  const canvas = document.createElement("canvas")
  JsBarcode(canvas, bc, {
    format: "code128",
    displayValue: false,
    lineColor: "#000000",
    background: "#ffffff",
    width: 1.1,
    height: 32,
    margin: 0,
  })
  const dataUrl = canvas.toDataURL("image/png")
  const art = (String(payload.article ?? "").trim() || "—") as string
  const rawTitle = String(payload.title ?? "").trim() || "—"
  const titleShort = rawTitle.length > 80 ? `${rawTitle.slice(0, 79)}…` : rawTitle

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Этикетка</title>
  <style>
    @page { size: 40mm 27mm; margin: 1.2mm; }
    html, body {
      width: 40mm;
      height: 27mm;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    * { box-sizing: border-box; }
    .root {
      width: 37.6mm;
      min-height: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.3mm;
      font-family: system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      color: #111;
    }
    .art { font-size: 6.5pt; font-weight: 600; line-height: 1.1; }
    .title { font-size: 5.2pt; line-height: 1.1; max-height: 5.5mm; overflow: hidden; }
    .bar { flex: 0 0 auto; margin-top: 0.2mm; }
    .bar img { width: 100%; max-height: 12mm; object-fit: contain; display: block; }
  </style>
</head>
<body>
  <div class="root">
    <div class="art">${escapeHtml(`Арт.: ${art}`)}</div>
    <div class="title">${escapeHtml(titleShort)}</div>
    <div class="bar"><img src="${dataUrl}" alt="" /></div>
  </div>
</body>
</html>`

  const w = window.open("", "_blank", "noopener,noreferrer")
  if (w) {
    w.document.write(html)
    w.document.close()
    w.setTimeout(() => {
      w.focus()
      w.print()
    }, 100)
    w.addEventListener(
      "afterprint",
      () => {
        w.close()
      },
      { once: true },
    )
    w.setTimeout(() => {
      try {
        if (w && !w.closed) w.close()
      } catch {
        /* empty */
      }
    }, 90_000)
  } else {
    await printHtmlInHiddenFrame(html)
  }
}

/**
 * Печать PDF, возвращённого с API (одна или несколько страниц 40×27 мм) — сразу диалог печати.
 */
export function printWmsLabelPdfBlob(blob: Blob): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    if (!blob || blob.size < 1) {
      reject(new Error("Пустой PDF."))
      return
    }
    const url = URL.createObjectURL(blob)
    const iframe = document.createElement("iframe")
    iframe.setAttribute(
      "title",
      "WMS print",
    )
    iframe.setAttribute(
      "style",
      "position:fixed;inset:0;opacity:0;pointer-events:none;border:0;width:1px;height:1px;visibility:hidden;",
    )
    let settled = false
    const cleanup = () => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        /* empty */
      }
      iframe.remove()
    }
    const endOk = () => {
      if (settled) return
      settled = true
      window.clearTimeout(longWait)
      cleanup()
      resolve()
    }
    const endErr = (e: unknown) => {
      if (settled) return
      settled = true
      window.clearTimeout(longWait)
      cleanup()
      reject(e instanceof Error ? e : new Error("Ошибка печати PDF"))
    }
    const longWait = window.setTimeout(() => endOk(), 120_000)

    const onAfterPrint = () => {
      window.removeEventListener("afterprint", onAfterPrint)
      const cw = iframe.contentWindow
      if (cw) {
        try {
          cw.removeEventListener("afterprint", onAfterPrint)
        } catch {
          /* empty */
        }
      }
      endOk()
    }

    iframe.addEventListener(
      "load",
      () => {
        const cw = iframe.contentWindow
        if (!cw) {
          window.clearTimeout(longWait)
          endErr(new Error("Не удалось открыть PDF в кадре печати."))
          return
        }
        cw.setTimeout(() => {
          try {
            cw.focus()
            cw.addEventListener("afterprint", onAfterPrint, { once: true })
            window.addEventListener("afterprint", onAfterPrint, { once: true })
            cw.print()
          } catch (e) {
            window.clearTimeout(longWait)
            endErr(e)
          }
        }, 200)
      },
      { once: true },
    )
    iframe.addEventListener("error", () => {
      window.clearTimeout(longWait)
      endErr(new Error("Ошибка загрузки PDF в кадр."))
    }, { once: true })
    document.body.appendChild(iframe)
    iframe.setAttribute("src", url)
  })
}

/**
 * URL локального печатного моста (тот же ПК, куда поставлен термопринтер).
 * Задаётся в .env: `NEXT_PUBLIC_WMS_PRINT_AGENT_URL=http://127.0.0.1:18777`
 */
export function getWmsLocalPrintAgentBase(): string | undefined {
  if (typeof process === "undefined") return undefined
  const u = process.env.NEXT_PUBLIC_WMS_PRINT_AGENT_URL?.trim()
  if (!u) return undefined
  return u.replace(/\/$/, "")
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = r.result as string
      const i = s.indexOf(",")
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    r.onerror = () => reject(new Error("Не удалось прочитать PDF."))
    r.readAsDataURL(blob)
  })
}

/**
 * Если настроен локальный агент — отправка PDF в ОС (часто без лишнего UI в браузере, см. CUPS/lp);
 * иначе печать через кадр в браузере, как в {@link printWmsLabelPdfBlob}.
 */
export async function printWmsLabelPdfWithBridge(blob: Blob): Promise<void> {
  const base = getWmsLocalPrintAgentBase()
  if (base) {
    const pdfBase64 = await blobToBase64(blob)
    const r = await fetch(`${base}/v1/print-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64 }),
    })
    if (!r.ok) {
      const t = await r.text()
      throw new Error(t && t.length < 200 ? t : `Печатный агент ответил ${r.status}.`)
    }
    return
  }
  return printWmsLabelPdfBlob(blob)
}

/** Разобрать ответ BFF: ошибка → текст; иначе печать PDF (с учётом локального агента). */
export async function printWmsLabelFromPdfResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as { message?: string }))
    const msg = typeof (data as { message?: string }).message === "string" ? (data as { message: string }).message : "Не удалось сформировать PDF этикеток"
    throw new Error(msg)
  }
  const blob = await res.blob()
  if (!blob || blob.size < 1) {
    throw new Error("Пустой PDF.")
  }
  await printWmsLabelPdfWithBridge(blob)
}

function printHtmlInHiddenFrame(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ifr = document.createElement("iframe")
    ifr.setAttribute("title", "print")
    ifr.setAttribute("style", "position:fixed;inset:0;opacity:0;pointer-events:none;border:0;width:1px;height:1px;")
    document.body.appendChild(ifr)
    const d = ifr.contentDocument
    if (!d) {
      ifr.remove()
      reject(new Error("frame"))
      return
    }
    d.open()
    d.write(html)
    d.close()
    const w = ifr.contentWindow
    if (!w) {
      ifr.remove()
      reject(new Error("frame"))
      return
    }
    let done = false
    const end = () => {
      if (done) return
      done = true
      ifr.remove()
      resolve()
    }
    w.setTimeout(() => {
      try {
        w.focus()
        w.addEventListener("afterprint", end, { once: true })
        w.setTimeout(end, 5_000)
        w.print()
      } catch (e) {
        ifr.remove()
        reject(e)
      }
    }, 50)
  })
}
