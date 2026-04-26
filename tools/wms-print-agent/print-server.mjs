#!/usr/bin/env node
/**
 * Локальный печатный мост: браузер шлёт PDF (Base64) → CUPS `lp` на той же машине.
 *   node tools/wms-print-agent/print-server.mjs
 *   WMS_PRINT_AGENT_PORT=18777
 *   WMS_PRINT_PRINTER=имя_опционально_из_lpstat_-p
 * Web: NEXT_PUBLIC_WMS_PRINT_AGENT_URL=http://127.0.0.1:18777
 * Для тихой печати в Windows часто подключают QZ Tray (https://qz.io) вместо `lp`.
 */
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const PORT = Number(process.env.WMS_PRINT_AGENT_PORT || 18777)
const PRINTER = (process.env.WMS_PRINT_PRINTER || "").trim()

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type",
}

function runLp(pdfPath, cb) {
  const args = PRINTER ? ["-d", PRINTER, pdfPath] : [pdfPath]
  const lp = spawn("lp", args, { stdio: ["ignore", "pipe", "pipe"] })
  let err = ""
  lp.stderr?.on("data", (d) => {
    err += d.toString()
  })
  lp.on("error", (e) => {
    err += e.message
  })
  lp.on("close", (code) => {
    cb(code ?? 0, err)
  })
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors)
    res.end()
    return
  }
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...cors })
    res.end("WMS print agent. POST /v1/print-pdf { pdfBase64 }\n")
    return
  }
  if (req.url !== "/v1/print-pdf" && !req.url?.startsWith("/v1/print-pdf?")) {
    res.writeHead(404, { "Content-Type": "text/plain", ...cors })
    res.end("not found")
    return
  }
  if (req.method !== "POST") {
    res.writeHead(405, cors)
    res.end()
    return
  }
  const chunks = []
  req.on("data", (c) => chunks.push(c))
  req.on("end", () => {
    let dir
    let pdfPath
    try {
      const body = Buffer.concat(chunks).toString("utf8")
      const j = JSON.parse(body)
      if (!j.pdfBase64) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8", ...cors })
        res.end(JSON.stringify({ message: "pdfBase64 required" }))
        return
      }
      const buf = Buffer.from(String(j.pdfBase64), "base64")
      if (buf.length < 30) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8", ...cors })
        res.end(JSON.stringify({ message: "empty pdf" }))
        return
      }
      dir = mkdtempSync(join(tmpdir(), "wms-lbl-"))
      pdfPath = join(dir, "l.pdf")
      writeFileSync(pdfPath, buf)
    } catch (e) {
      if (dir) {
        try {
          rmSync(dir, { recursive: true })
        } catch {
          /* */
        }
      }
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8", ...cors })
      res.end(JSON.stringify({ message: e instanceof Error ? e.message : String(e) }))
      return
    }
    runLp(pdfPath, (code, err) => {
      try {
        if (pdfPath) unlinkSync(pdfPath)
      } catch {
        /* */
      }
      if (dir) {
        try {
          rmSync(dir, { recursive: true })
        } catch {
          /* */
        }
      }
      if (code !== 0) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8", ...cors })
        res.end(
          JSON.stringify({
            message: err || `lp завершился с кодом ${code} (CUPS/lp в PATH?)`,
          }),
        )
        return
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...cors })
      res.end(JSON.stringify({ ok: true }))
    })
  })
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`WMS print agent: http://127.0.0.1:${PORT}  (POST /v1/print-pdf)`)
})
