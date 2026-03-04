// lib/printnode.ts — Client-side PrintNode helper
// All API calls go through /api/printnode (server-side proxy)
// API key is NEVER exposed to the browser

// ============================================
// LABEL SIZE CONFIG
// ============================================
export interface LabelSize { widthMM: number; heightMM: number; }

const LABEL_SIZE_KEY = "wms_label_size";
const DEFAULT_SIZE: LabelSize = { widthMM: 70, heightMM: 45 };

export function getLabelSize(): LabelSize {
  try { const v = localStorage.getItem(LABEL_SIZE_KEY); return v ? JSON.parse(v) : DEFAULT_SIZE; }
  catch { return DEFAULT_SIZE; }
}

export function saveLabelSize(size: LabelSize) {
  try { localStorage.setItem(LABEL_SIZE_KEY, JSON.stringify(size)); } catch {}
}

function mm(v: number): number { return Math.round(v * 8); } // mm → dots @203dpi

// ============================================
// PRINTER
// ============================================
export interface PrintNodePrinter {
  id: number; name: string; description: string; state: string;
  computer: { id: number; name: string };
}

export async function listPrinters(): Promise<PrintNodePrinter[]> {
  const res = await fetch("/api/printnode?action=printers");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  const data = await res.json();
  return data.map((p: any) => ({
    id: p.id, name: p.name, description: p.description || "", state: p.state,
    computer: { id: p.computer?.id, name: p.computer?.name },
  }));
}

// ============================================
// PRINT JOB (via server proxy)
// ============================================
async function submitPrintJob(printerId: number, title: string, zpl: string, qty: number = 1): Promise<number> {
  const fullZpl = qty > 1 ? Array(qty).fill(zpl).join("\n") : zpl;
  const res = await fetch("/api/printnode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "print",
      printerId,
      title,
      content: btoa(fullZpl),
      source: "WMS Scanner",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur impression ${res.status}`);
  }
  const data = await res.json();
  return data.jobId;
}

// ============================================
// ZPL HELPERS
// ============================================
function trunc(s: string, max: number): string {
  return s.length > max ? s.substring(0, max) : s;
}

function formatDate(d: string): string {
  try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return d; }
}

function barcodeZPL(barcode: string, labelW: number, y: number, height: number, preferredBarW: number = 3): string {
  const isEAN13 = /^\d{13}$/.test(barcode);
  const isEAN8 = /^\d{8}$/.test(barcode);

  let barW = preferredBarW;

  if (!isEAN13 && !isEAN8) {
    const modules = 11 * barcode.length + 35;
    const maxW = labelW - 40;
    barW = Math.min(preferredBarW, Math.max(1, Math.floor(maxW / modules)));
  }

  let bcPixelW: number;
  if (isEAN13) bcPixelW = 95 * barW;
  else if (isEAN8) bcPixelW = 67 * barW;
  else bcPixelW = (11 * barcode.length + 35) * barW;

  const x = Math.max(5, Math.round((labelW - bcPixelW) / 2));

  if (isEAN13) return `^BY${barW},3,${height}^FO${x},${y}^BEN,${height},Y,N^FD${barcode}^FS`;
  if (isEAN8) return `^BY${barW},3,${height}^FO${x},${y}^B8N,${height},Y,N^FD${barcode}^FS`;
  return `^BY${barW},3,${height}^FO${x},${y}^BCN,${height},Y,N,N^FD${barcode}^FS`;
}

// ============================================
// PRODUCT LABEL
// ============================================
export function generateProductZPL(productName: string, barcode: string, ref?: string): string {
  const sz = getLabelSize();
  const W = mm(sz.widthMM);
  const H = mm(sz.heightMM);
  const cW = W - 20;
  const cpl = Math.floor(cW / 13);
  const barW = sz.widthMM >= 60 ? 3 : 2;
  const bcH = Math.min(Math.round(H * 0.40), 130);
  const hasRef = !!ref;

  const refBlock = hasRef ? 26 : 0;
  const nameBlock = 30;
  const bcBlock = bcH + 24;
  const total = refBlock + nameBlock + bcBlock;
  const startY = Math.max(8, Math.round((H - total) / 2));

  let y = startY;
  const lines: string[] = ["^XA", `^PW${W}`, `^LL${H}`, "^CI28"];

  if (hasRef) {
    lines.push(`^FO10,${y}^A0N,20,20^FB${cW},1,0,C^FD${trunc(ref!, cpl)}^FS`);
    y += 26;
  }
  lines.push(`^FO10,${y}^A0N,26,26^FB${cW},1,0,C^FD${trunc(productName, cpl)}^FS`);
  y += nameBlock;
  lines.push(barcodeZPL(barcode, W, y, bcH, barW));
  lines.push("^XZ");

  return lines.join("\n");
}

// ============================================
// LOT LABEL
// ============================================
export function generateLotZPL(lotName: string, productName: string, lotBarcode: string, expiryDate?: string): string {
  const sz = getLabelSize();
  const W = mm(sz.widthMM);
  const H = mm(sz.heightMM);
  const cW = W - 20;
  const cpl = Math.floor(cW / 13);
  const barW = sz.widthMM >= 60 ? 3 : 2;
  const bcH = Math.min(Math.round(H * 0.33), 110);
  const expStr = expiryDate ? formatDate(expiryDate) : "";

  const lotBlock = 36;
  const nameBlock = 26;
  const expBlock = expStr ? 24 : 0;
  const bcBlock = bcH + 22;
  const total = lotBlock + nameBlock + expBlock + bcBlock;
  const startY = Math.max(6, Math.round((H - total) / 2));

  let y = startY;
  const lines: string[] = ["^XA", `^PW${W}`, `^LL${H}`, "^CI28"];

  lines.push(`^FO10,${y}^A0N,30,30^FB${cW},1,0,C^FD${trunc(lotName, cpl)}^FS`);
  y += lotBlock;
  lines.push(`^FO10,${y}^A0N,22,22^FB${cW},1,0,C^FD${trunc(productName, cpl)}^FS`);
  y += nameBlock;

  if (expStr) {
    lines.push(`^FO10,${y}^A0N,22,22^FB${cW},1,0,C^FDDLUO: ${expStr}^FS`);
    y += expBlock;
  }

  lines.push(barcodeZPL(lotBarcode, W, y, bcH, barW));
  lines.push("^XZ");

  return lines.join("\n");
}

// ============================================
// LOCATION LABEL
// ============================================
export function generateLocationZPL(locationName: string, locationBarcode: string): string {
  const sz = getLabelSize();
  const W = mm(sz.widthMM);
  const H = mm(sz.heightMM);
  const cW = W - 20;
  const barW = sz.widthMM >= 60 ? 3 : 2;
  const bcH = Math.min(Math.round(H * 0.42), 130);

  const nameBlock = 48;
  const bcBlock = bcH + 22;
  const total = nameBlock + bcBlock;
  const startY = Math.max(8, Math.round((H - total) / 2));

  let y = startY;
  const lines: string[] = ["^XA", `^PW${W}`, `^LL${H}`, "^CI28"];

  lines.push(`^FO10,${y}^A0N,40,40^FB${cW},1,0,C^FD${locationName}^FS`);
  y += nameBlock;

  if (locationBarcode) {
    lines.push(barcodeZPL(locationBarcode, W, y, bcH, barW));
  }
  lines.push("^XZ");

  return lines.join("\n");
}

// ============================================
// PRINT FUNCTIONS
// ============================================
export async function printProductLabel(
  printerId: number, productName: string, barcode: string, ref?: string, qty: number = 1
): Promise<{ success: boolean; jobId?: number; error?: string }> {
  try {
    const zpl = generateProductZPL(productName, barcode, ref);
    const jobId = await submitPrintJob(printerId, `Produit: ${productName}`, zpl, qty);
    return { success: true, jobId };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function printLotLabel(
  printerId: number, lotName: string, productName: string, lotBarcode: string, expiryDate?: string, qty: number = 1
): Promise<{ success: boolean; jobId?: number; error?: string }> {
  try {
    const zpl = generateLotZPL(lotName, productName, lotBarcode, expiryDate);
    const jobId = await submitPrintJob(printerId, `Lot: ${lotName}`, zpl, qty);
    return { success: true, jobId };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function printLocationLabel(
  printerId: number, locationName: string, locationBarcode: string, qty: number = 1
): Promise<{ success: boolean; jobId?: number; error?: string }> {
  try {
    const zpl = generateLocationZPL(locationName, locationBarcode);
    const jobId = await submitPrintJob(printerId, `Empl: ${locationName}`, zpl, qty);
    return { success: true, jobId };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function printLabel(
  printerId: number, productName: string, barcode: string
): Promise<{ success: boolean; jobId?: number; error?: string }> {
  return printProductLabel(printerId, productName, barcode);
}

// ============================================
// CONFIG
// ============================================
const PRINTER_KEY = "wms_printer_id";

export function getSavedPrinterId(): number | null {
  try { const v = localStorage.getItem(PRINTER_KEY); return v ? parseInt(v, 10) : null; } catch { return null; }
}

export function savePrinterId(id: number) {
  try { localStorage.setItem(PRINTER_KEY, String(id)); } catch {}
}

export function isConfigured(): boolean {
  return !!getSavedPrinterId();
}
