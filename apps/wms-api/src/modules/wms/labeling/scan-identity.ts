/**
 * Сопоставление ввода со сканера (EAN-13, UPC-A, шум, ведущие нули) с учётом GS1-практик.
 * @see https://www.gs1.org/standards/barcodes-standards
 */

const MAX_CANDIDATES = 32;

/**
 * Множество вариантов одного и того же визуального кода: как отдал сканер, только цифры,
 * GTIN-14 с ведущими нулями (для EAN-13, UPC-A, EAN-8).
 */
export function buildProductScanCandidates(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const s = new Set<string>();
  const add = (x: string) => {
    if (x && s.size < MAX_CANDIDATES) s.add(x);
  };
  add(t);
  add(t.replace(/\s+/g, ''));
  const d = t.replace(/\D/g, '');
  if (d) {
    add(d);
    if (d.length <= 14) add(d.padStart(14, '0'));
    if (d.length === 13) add(`0${d}`);
    if (d.length === 8) add(d.padStart(14, '0'));
    if (d.length === 12) add(d.padStart(14, '0'));
    if (d.length === 6 && /^\d+$/.test(d)) {
      const p = d.padStart(14, '0');
      add(p);
    }
  }
  return [...s].filter((x) => x.length > 0);
}

/** Сравнение по GTIN: цифры, выравнивание до 14. */
export function gsinComparableKey(digitOrRaw: string): string | null {
  const d = digitOrRaw.replace(/\D/g, '');
  if (!d || d.length < 4) return null;
  if (d.length > 14) return d;
  return d.padStart(14, '0');
}
