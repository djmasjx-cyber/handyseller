/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

const MM_TO_PT = 72 / 25.4;
export const LABEL_W_MM = 40;
export const LABEL_H_MM = 27;
const LABEL_W_PT = LABEL_W_MM * MM_TO_PT;
const LABEL_H_PT = LABEL_H_MM * MM_TO_PT;

/** Защита от OOM / зависаний на экстремальных накладных. */
export const MAX_LABELS_IN_ONE_PDF = 2_000;

type PdfMakeInstance = {
  virtualfs: { writeFileSync: (name: string, content: Buffer) => void };
  setFonts: (fonts: Record<string, Record<string, string>>) => void;
  setUrlAccessPolicy: (fn: (url: string) => boolean) => void;
  createPdf: (docDefinition: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
};

type BwipToBuffer = (opts: Record<string, unknown>) => Promise<Buffer>;

let pdfMakePrimed = false;

function primePdfMake(): void {
  if (pdfMakePrimed) return;
  const pdfMake = require('pdfmake') as PdfMakeInstance;
  const vfsFonts = require('pdfmake/build/vfs_fonts') as Record<string, string>;
  for (const fn of Object.keys(vfsFonts)) {
    pdfMake.virtualfs.writeFileSync(fn, Buffer.from(vfsFonts[fn], 'base64'));
  }
  pdfMake.setFonts({
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  });
  pdfMake.setUrlAccessPolicy(() => false);
  pdfMakePrimed = true;
}

function clampOneLine(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= maxChars) return t;
  if (maxChars < 2) return '…';
  return `${t.slice(0, maxChars - 1)}…`;
}

export type UnitShelfLabelInput = {
  article: string;
  title: string;
  barcode: string;
};

/**
 * Одна или несколько этикеток 40×27 мм на отдельных страницах (арт., название, Code128).
 */
export async function renderUnitShelfLabelsPdf(inputs: UnitShelfLabelInput[]): Promise<Buffer> {
  if (inputs.length === 0) {
    throw new Error('No labels to print.');
  }
  if (inputs.length > MAX_LABELS_IN_ONE_PDF) {
    throw new Error(`Too many labels (max ${MAX_LABELS_IN_ONE_PDF}).`);
  }

  primePdfMake();
  const pdfMake = require('pdfmake') as PdfMakeInstance;
  const bwipjs = require('bwip-js') as { toBuffer: BwipToBuffer };

  const marginPt = 1.8;
  const innerW = LABEL_W_PT - marginPt * 2;
  const images: Record<string, string> = {};
  const content: Array<Record<string, unknown>> = [];

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    const bc = input.barcode.trim();
    if (!bc) {
      throw new Error('Barcode is required for each label.');
    }
    const imgKey = `bc${i}`;
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: bc,
      scale: 1,
      height: 6,
      includetext: false,
    });
    images[imgKey] = `data:image/png;base64,${png.toString('base64')}`;

    const articleLine = clampOneLine(`Арт.: ${input.article}`, 28);
    const titleLine = clampOneLine(input.title, 42);

    const page: Record<string, unknown> = {
      stack: [
        { text: articleLine, fontSize: 6.5, bold: true, lineHeight: 1.05 },
        { text: titleLine, fontSize: 5.2, lineHeight: 1.05, margin: [0, 0.8, 0, 0] },
        { image: imgKey, width: innerW, margin: [0, 1.2, 0, 0], alignment: 'center' },
      ],
    };
    if (i < inputs.length - 1) {
      page.pageBreak = 'after';
    }
    content.push(page);
  }

  const docDefinition: Record<string, unknown> = {
    pageSize: { width: LABEL_W_PT, height: LABEL_H_PT },
    pageMargins: [marginPt, marginPt, marginPt, marginPt],
    defaultStyle: { font: 'Roboto', color: '#111' },
    content,
    images,
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBuffer();
}

export async function renderUnitShelfLabelPdf(input: UnitShelfLabelInput): Promise<Buffer> {
  return renderUnitShelfLabelsPdf([input]);
}
