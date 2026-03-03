// lib/printnode.ts

const API_URL = "https://api.printnode.com";

function getApiKey(): string {
  const key = process.env.NEXT_PUBLIC_PRINTNODE_API_KEY || "";
  if (!key) throw new Error("NEXT_PUBLIC_PRINTNODE_API_KEY non configurée");
  return key;
}

function headers() {
  return {
    "Authorization": "Basic " + btoa(getApiKey() + ":"),
    "Content-Type": "application/json",
  };
}

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

function mmToDots(mm: number): number { return Math.round(mm * 8); }

// ============================================
// PRINTER
// ============================================
export interface PrintNodePrinter {
  id: number; name: string; description: string; state: string;
  computer: { id: number; name: string };
}

export async function listPrinters(): Promise<PrintNodePrinter[]> {
  const res = await fetch(`${API_URL}/printers`, { headers: headers() });
  if (!res.ok) throw new Error(`PrintNode erreur ${res.status}`);
  const data = await res.json();
  return data.map((p: any) => ({
    id: p.id, name: p.name, description: p.description || "", state: p.state,
    computer: { id: p.computer?.id, name: p.computer?.name },
  }));
}

// ============================================
// PRINT JOB
// ============================================
async function submitPrintJob(printerId: number, title: string, zpl: string, qty: number = 1): Promise<number> {
  // Repeat ZPL for quantity
  const fullZpl = qty > 1 ? Array(qty).fill(zpl).join("\n") : zpl;

  const res = await fetch(`${API_URL}/printjobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      printerId,
      title,
      contentType: "raw_base64",
      content: btoa(fullZpl),
      source: "WMS Scanner",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PrintNode erreur: ${err}`);
  }
  return await res.json();
}

// ============================================
// ZPL HELPERS
// ============================================
function trunc(s: string, max: number): string {
  return s.length > max ? s.substring(0, max - 1) : s;
}

function barcodeZPL(barcode: string, x: number, y: number, height: number, barWidth: number = 3): string {
  const isEAN13 = /^\d{13}$/.test(barcode);
  const isEAN8 = /^\d{8}$/.test(barcode);
  if (isEAN13) return `^BY${barWidth},3,${height}^FO${x},${y}^BEN,${height},Y,N^FD${barcode}^FS`;
  if (isEAN8) return `^BY${barWidth},3,${height}^FO${x},${y}^B8N,${height},Y,N^FD${barcode}^FS`;
  // Code 128
  return `^BY${barWidth},3,${height}^FO${x},${y}^BCN,${height},Y,N,N^FD${barcode}^FS`;
}

// ============================================
// PRODUCT LABEL: ref + name + BIG barcode + EAN
// ============================================
export function generateProductZPL(productName: string, barcode: string, ref?: string): string {
  const sz = getLabelSize();
  const W = mmToDots(sz.widthMM);
  const H = mmToDots(sz.heightMM);
  const cW = W - 30;
  const cpl = Math.floor(cW / 13);

  // Layout: content centered vertically
  // ref (small) → name → barcode (big) → ean text
  const refText = ref || "";
  const name = trunc(productName, cpl);
  const bcH = Math.min(Math.round(H * 0.38), 120); // 38% of label height
  const barW = sz.widthMM >= 60 ? 3 : 2;

  // Y positions — push content down to center
  const totalContent = 24 + 28 + 8 + bcH + 20; // ref + name + gap + barcode + ean text
  const startY = Math.max(10, Math.round((H - totalContent) / 2));

  return [
    "^XA", `^PW${W}`, `^LL${H}`,
    // Ref (small, centered)
    refText ? `^FO15,${startY}^A0N,22,22^FB${cW},1,0,C^FD${trunc(refText, cpl)}^FS` : "",
    // Product name (bold, centered)
    `^FO15,${startY + (refText ? 28 : 0)}^A0N,26,26^FB${cW},1,0,C^FD${name}^FS`,
    // Barcode (BIG)
    barcodeZPL(barcode, 20, startY + (refText ? 28 : 0) + 34, bcH, barW),
    "^XZ",
  ].filter(Boolean).join("\n");
}

// ============================================
// LOT LABEL: lot name (big) + name + expiry + barcode
// ============================================
export function generateLotZPL(lotName: string, productName: string, lotBarcode: string, expiryDate?: string): string {
  const sz = getLabelSize();
  const W = mmToDots(sz.widthMM);
  const H = mmToDots(sz.heightMM);
  const cW = W - 30;
  const cpl = Math.floor(cW / 13);
  const bcH = Math.min(Math.round(H * 0.32), 100);
  const barW = sz.widthMM >= 60 ? 3 : 2;

  // Format expiry
  const expStr = expiryDate ? formatDate(expiryDate) : "";

  const totalContent = 32 + 24 + (expStr ? 22 : 0) + 8 + bcH + 18;
  const startY = Math.max(8, Math.round((H - totalContent) / 2));

  return [
    "^XA", `^PW${W}`, `^LL${H}`,
    // Lot name (large bold)
    `^FO15,${startY}^A0N,32,32^FB${cW},1,0,C^FD${trunc(lotName, cpl)}^FS`,
    // Product name
    `^FO15,${startY + 36}^A0N,22,22^FB${cW},1,0,C^FD${trunc(productName, cpl)}^FS`,
    // Expiry date
    expStr ? `^FO15,${startY + 62}^A0N,22,22^FB${cW},1,0,C^FDDLUO: ${expStr}^FS` : "",
    // Barcode
    barcodeZPL(lotBarcode, 20, startY + 62 + (expStr ? 28 : 8), bcH, barW),
    "^XZ",
  ].filter(Boolean).join("\n");
}

// ============================================
// LOCATION LABEL: name (large) + barcode
// ============================================
export function generateLocationZPL(locationName: string, locationBarcode: string): string {
  const sz = getLabelSize();
  const W = mmToDots(sz.widthMM);
  const H = mmToDots(sz.heightMM);
  const cW = W - 30;
  const bcH = Math.min(Math.round(H * 0.4), 120);
  const barW = sz.widthMM >= 60 ? 3 : 2;

  const totalContent = 40 + 16 + bcH;
  const startY = Math.max(10, Math.round((H - totalContent) / 2));

  return [
    "^XA", `^PW${W}`, `^LL${H}`,
    // Location name (large)
    `^FO15,${startY}^A0N,40,40^FB${cW},1,0,C^FD${locationName}^FS`,
    // Barcode
    locationBarcode ? barcodeZPL(locationBarcode, 20, startY + 52, bcH, barW) : "",
    "^XZ",
  ].filter(Boolean).join("\n");
}

// ============================================
// DATE HELPER
// ============================================
function formatDate(d: string): string {
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return d; }
}

// ============================================
// PRINT FUNCTIONS (with quantity)
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

// Legacy
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
  return !!process.env.NEXT_PUBLIC_PRINTNODE_API_KEY && !!getSavedPrinterId();
}
