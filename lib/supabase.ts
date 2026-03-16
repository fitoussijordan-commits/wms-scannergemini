// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const sb = createClient(url, key);

// ── Types ──────────────────────────────────────────────────────────────────────
export interface WmsThreshold {
  odoo_ref: string;
  threshold: number;
  product_name: string;
  updated_at?: string;
}
export interface WmsStockCache {
  odoo_product_id: number;
  odoo_ref: string;
  product_name: string;
  qty_on_hand: number;
  synced_at?: string;
}
export interface WmsConsoCache {
  odoo_ref: string;
  product_name: string;
  month: string;
  qty: number;
  synced_at?: string;
}

// ══════════════════════════════════════════
// SEUILS
// ══════════════════════════════════════════

export async function loadThresholds(): Promise<Record<string, number>> {
  const { data, error } = await sb.from("wms_thresholds").select("odoo_ref, threshold");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).map((r) => [r.odoo_ref, r.threshold]));
}

export async function saveThreshold(odoo_ref: string, threshold: number, product_name: string): Promise<void> {
  const { error } = await sb.from("wms_thresholds").upsert({ odoo_ref, threshold, product_name, updated_at: new Date().toISOString() }, { onConflict: "odoo_ref" });
  if (error) throw new Error(error.message);
}

export async function deleteThreshold(odoo_ref: string): Promise<void> {
  const { error } = await sb.from("wms_thresholds").delete().eq("odoo_ref", odoo_ref);
  if (error) throw new Error(error.message);
}

export async function saveThresholdsBulk(thresholds: WmsThreshold[]): Promise<void> {
  if (!thresholds.length) return;
  const { error } = await sb.from("wms_thresholds").upsert(
    thresholds.map((t) => ({ ...t, updated_at: new Date().toISOString() })),
    { onConflict: "odoo_ref" }
  );
  if (error) throw new Error(error.message);
}

// ══════════════════════════════════════════
// STOCK CACHE
// ══════════════════════════════════════════

export async function loadStockCache(): Promise<WmsStockCache[]> {
  const { data, error } = await sb.from("wms_stock_cache").select("*").order("odoo_ref");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getStockCacheAge(): Promise<Date | null> {
  const { data } = await sb.from("wms_sync_meta").select("value").eq("key", "stock_synced_at").single();
  return data?.value ? new Date(data.value) : null;
}

export async function saveStockCache(items: WmsStockCache[]): Promise<void> {
  if (!items.length) return;
  // Upsert in batches of 500
  for (let i = 0; i < items.length; i += 500) {
    const batch = items.slice(i, i + 500);
    const { error } = await sb.from("wms_stock_cache").upsert(
      batch.map((item) => ({ ...item, synced_at: new Date().toISOString() })),
      { onConflict: "odoo_product_id" }
    );
    if (error) throw new Error(error.message);
  }
  // Update sync metadata
  await sb.from("wms_sync_meta").upsert(
    { key: "stock_synced_at", value: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
}

// ══════════════════════════════════════════
// CONSO CACHE
// ══════════════════════════════════════════

export async function getCachedConsoMonthsCount(): Promise<number> {
  const { data } = await sb.from("wms_sync_meta").select("value").eq("key", "conso_months_count").single();
  return data?.value ? Number(data.value) : 0;
}

export async function loadConsoCache(months: string[]): Promise<WmsConsoCache[]> {
  const { data, error } = await sb.from("wms_conso_cache").select("*").in("month", months);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getConsoCacheAge(): Promise<Date | null> {
  const { data } = await sb.from("wms_sync_meta").select("value").eq("key", "conso_synced_at").single();
  return data?.value ? new Date(data.value) : null;
}

export async function saveConsoCache(items: WmsConsoCache[]): Promise<void> {
  if (!items.length) return;
  for (let i = 0; i < items.length; i += 500) {
    const batch = items.slice(i, i + 500);
    const { error } = await sb.from("wms_conso_cache").upsert(
      batch.map((item) => ({ ...item, synced_at: new Date().toISOString() })),
      { onConflict: "odoo_ref,month" }
    );
    if (error) throw new Error(error.message);
  }
  await sb.from("wms_sync_meta").upsert([
    { key: "conso_synced_at", value: new Date().toISOString(), updated_at: new Date().toISOString() },
    { key: "conso_months_count", value: String(new Set(items.map(i => i.month)).size), updated_at: new Date().toISOString() },
  ], { onConflict: "key" });
}

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════

/** Returns true if cache is older than maxAgeMinutes */
export function isCacheStale(syncedAt: Date | null, maxAgeMinutes: number): boolean {
  if (!syncedAt) return true;
  return (Date.now() - syncedAt.getTime()) > maxAgeMinutes * 60 * 1000;
}

// ══════════════════════════════════════════
// WATCHLIST
// ══════════════════════════════════════════

export interface WmsWatchlistItem {
  odoo_ref: string;
  product_name: string;
  added_at?: string;
}

export async function loadWatchlist(): Promise<Set<string>> {
  const { data, error } = await sb.from("wms_watchlist").select("odoo_ref");
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r) => r.odoo_ref));
}

export async function saveWatchlist(items: WmsWatchlistItem[]): Promise<void> {
  // Replace entire watchlist
  await sb.from("wms_watchlist").delete().neq("odoo_ref", "");
  if (!items.length) return;
  const { error } = await sb.from("wms_watchlist").insert(items.map(i => ({ ...i, added_at: new Date().toISOString() })));
  if (error) throw new Error(error.message);
}
