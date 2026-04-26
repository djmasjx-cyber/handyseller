export type WmsAgxIncompleteLine = {
  lineId: string
  itemId: string
  sku: string
  lineTitle: string | null
  missing: Array<'weightGrams' | 'lengthMm' | 'widthMm' | 'heightMm'>
}

/** Выбрасывается из store при приёмке без полного АГХ по позициям. */
export class WmsAgxIncompleteError extends Error {
  readonly lines: WmsAgxIncompleteLine[]

  constructor(lines: WmsAgxIncompleteLine[]) {
    super('WMS_AGX_INCOMPLETE')
    this.name = 'WmsAgxIncompleteError'
    this.lines = lines
  }
}
