"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as odoo from "@/lib/odoo";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface StockAlert {
  productId: number;
  ref: string;
  name: string;
  qty: number;
  threshold: number;
}
interface ConsoRow {
  ref: string;
  name: string;
  months: Record<string, number>;
  total: number;
  avg: number;
}
interface DeliveryRow {
  date: string;
  count: number;
  lines: number;
}
interface MoveRow {
  date: string;
  type: string;
  qty: number;
  lot: string;
  from: string;
  to: string;
  picking: string;
}
interface StockProduct {
  qty: number;
  name: string;
  ref: string;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function loadCfg(): { u: string; d: string } | null {
  try {
    const c = localStorage.getItem("wms_c");
    return c ? JSON.parse(c) : null;
  } catch {
    return null;
  }
}
function saveSession(s: odoo.OdooSession) {
  try {
    localStorage.setItem("wms_dash_s", JSON.stringify(s));
  } catch {}
}
function loadSession(): odoo.OdooSession | null {
  try {
    const s = localStorage.getItem("wms_dash_s");
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function clearSession() {
  try {
    localStorage.removeItem("wms_dash_s");
  } catch {}
}

function monthsBack(n: number): string[] {
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return months;
}
function fmtMonth(m: string): string {
  const [y, mo] = m.split("-");
  return new Date(+y, +mo - 1, 1).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
  });
}
function fmtDate(s: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;0,9..40,800;1,9..40,400&family=JetBrains+Mono:wght@400;600&display=swap');

:root {
  --bg-base: #0c0e12;
  --bg-raised: #13161c;
  --bg-surface: #191d25;
  --bg-hover: #1e2330;
  --bg-input: #111419;
  --border: #232830;
  --border-focus: #3b82f6;
  --text-primary: #e8ecf4;
  --text-secondary: #8a93a6;
  --text-muted: #555d6e;
  --accent: #3b82f6;
  --accent-soft: rgba(59,130,246,0.12);
  --accent-border: rgba(59,130,246,0.25);
  --success: #22c55e;
  --success-soft: rgba(34,197,94,0.10);
  --success-border: rgba(34,197,94,0.25);
  --warning: #f59e0b;
  --warning-soft: rgba(245,158,11,0.10);
  --warning-border: rgba(245,158,11,0.25);
  --danger: #ef4444;
  --danger-soft: rgba(239,68,68,0.10);
  --danger-border: rgba(239,68,68,0.25);
  --purple: #a855f7;
  --purple-soft: rgba(168,85,247,0.10);
  --purple-border: rgba(168,85,247,0.25);
  --orange: #f97316;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.5);
  --font-body: 'DM Sans', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --transition: 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-body); background: var(--bg-base); color: var(--text-primary); }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes barGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; }

.wms-input {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-family: var(--font-body);
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
  transition: border-color var(--transition), box-shadow var(--transition);
}
.wms-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.wms-input::placeholder { color: var(--text-muted); }

.wms-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  transition: all var(--transition);
  line-height: 1.4;
}
.wms-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.wms-btn-primary { background: var(--accent); color: #fff; }
.wms-btn-primary:hover:not(:disabled) { background: #2563eb; box-shadow: 0 0 20px var(--accent-soft); }
.wms-btn-ghost { background: var(--bg-surface); color: var(--text-secondary); border: 1px solid var(--border); }
.wms-btn-ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.wms-btn-danger { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-border); }
.wms-btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.18); }

.wms-card {
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color var(--transition);
}
.wms-card:hover { border-color: rgba(255,255,255,0.06); }

.wms-table thead th {
  padding: 12px 16px;
  font-weight: 600;
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
  position: sticky;
  top: 0;
  z-index: 2;
}
.wms-table tbody td {
  padding: 12px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid rgba(35,40,48,0.6);
}
.wms-table tbody tr { transition: background var(--transition); }
.wms-table tbody tr:hover { background: var(--bg-hover); }

.wms-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.wms-skeleton {
  background: linear-gradient(90deg, var(--bg-surface) 0%, var(--bg-hover) 50%, var(--bg-surface) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.8s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

.wms-tab {
  padding: 14px 20px;
  background: none;
  border: none;
  border-bottom: 2.5px solid transparent;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-body);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition);
  white-space: nowrap;
}
.wms-tab:hover { color: var(--text-secondary); }
.wms-tab[data-active="true"] {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 700;
}

.wms-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
.wms-scrollbar::-webkit-scrollbar-track { background: transparent; }
.wms-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.wms-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

.wms-stat-card {
  flex: 1;
  min-width: 140px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 18px 20px;
  animation: fadeIn 0.4s ease both;
}
.wms-stat-val {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.5px;
  line-height: 1.1;
}
.wms-stat-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
  font-weight: 500;
}

.wms-select {
  padding: 10px 14px;
  padding-right: 32px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-family: var(--font-body);
  background: var(--bg-input);
  color: var(--text-primary);
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555d6e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: border-color var(--transition);
}
.wms-select:focus { border-color: var(--accent); }

.alert-card {
  animation: slideUp 0.35s ease both;
  border-radius: var(--radius-md);
  padding: 18px 22px;
  border-left: 4px solid;
  transition: transform var(--transition), box-shadow var(--transition);
}
.alert-card:hover { transform: translateX(2px); }

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transform-origin: left;
  animation: barGrow 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.conso-cell {
  transition: background var(--transition);
}
.conso-cell:hover {
  outline: 1.5px solid var(--accent);
  outline-offset: -1px;
  border-radius: 2px;
}
`;

// ─────────────────────────────────────────────
// ICONS (inline SVGs)
// ─────────────────────────────────────────────
const Icons = {
  warehouse: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 21V8l9-5 9 5v13" />
      <path d="M9 21V12h6v9" />
    </svg>
  ),
  refresh: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  ),
  search: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  ),
  alert: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  chart: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  truck: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  history: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  logout: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  upload: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  check: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--success)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  scanner: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  ),
};

const TABS = [
  { key: "alerts", label: "Alertes stock", icon: Icons.alert },
  { key: "conso", label: "Consommation", icon: Icons.chart },
  { key: "deliveries", label: "Livraisons", icon: Icons.truck },
  { key: "moves", label: "Historique", icon: Icons.history },
] as const;

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────
function Spinner({ size = 16 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `2px solid var(--border)`,
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

function Skeleton({ h = 20, w = "100%" }: { h?: number; w?: string | number }) {
  return (
    <div className="wms-skeleton" style={{ height: h, width: w }} />
  );
}

function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 24px",
        animation: "fadeIn 0.4s ease both",
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 12, opacity: 0.5 }}>
        {icon}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{sub}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  delay = 0,
}: {
  label: string;
  value: string | number;
  color: string;
  delay?: number;
}) {
  return (
    <div className="wms-stat-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="wms-stat-val" style={{ color }}>
        {value}
      </div>
      <div className="wms-stat-label">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MINI BAR CHART for Deliveries
// ─────────────────────────────────────────────
function MiniBarChart({ data, max }: { data: number[]; max: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 48 }}>
      {data.map((v, i) => {
        const h = max > 0 ? (v / max) * 100 : 0;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(h, 4)}%`,
              background: `var(--accent)`,
              opacity: 0.3 + (v / max) * 0.7,
              borderRadius: "3px 3px 0 0",
              transition: "height 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
              minWidth: 3,
            }}
          />
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════
// MAIN DASHBOARD
// ═════════════════════════════════════════════
export default function Dashboard() {
  // ── Auth state ──
  const [session, setSession] = useState<odoo.OdooSession | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [url, setUrl] = useState("");
  const [db, setDb] = useState("");
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");

  // ── UI state ──
  const [tab, setTab] = useState<string>("alerts");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Data state ──
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [thresholds, setThresholds] = useState<Record<number, number>>({});
  const [conso, setConso] = useState<ConsoRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [stockMap, setStockMap] = useState<Record<number, StockProduct>>({});

  // ── Filter state ──
  const [consoMonths, setConsoMonths] = useState(6);
  const [delStart, setDelStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [delEnd, setDelEnd] = useState(() =>
    new Date().toISOString().split("T")[0]
  );
  const [moveRef, setMoveRef] = useState("");
  const [moveSearched, setMoveSearched] = useState(false);
  const [moveSort, setMoveSort] = useState<"date" | "type" | "picking">(
    "date"
  );
  const [moveSortDir, setMoveSortDir] = useState<"asc" | "desc">("desc");
  const [moveTypeFilter, setMoveTypeFilter] = useState("all");
  const [editThresh, setEditThresh] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [stockSearch, setStockSearch] = useState("");
  const [consoSearch, setConsoSearch] = useState("");

  // ── Init ──
  useEffect(() => {
    const s = loadSession();
    if (s) setSession(s);
    const cfg = loadCfg();
    if (cfg) {
      setUrl(cfg.u);
      setDb(cfg.d);
    }
  }, []);

  useEffect(() => {
    try {
      const t = localStorage.getItem("wms_thresholds");
      if (t) setThresholds(JSON.parse(t));
    } catch {}
  }, []);

  // ── Auth ──
  const login = async () => {
    if (!url || !db || !user || !pw) return;
    setLoginLoading(true);
    setLoginError("");
    try {
      const s = await odoo.authenticate({ url, db }, user, pw);
      saveSession(s);
      setSession(s);
    } catch (e: any) {
      setLoginError(e.message);
    }
    setLoginLoading(false);
  };

  const logout = () => {
    clearSession();
    setSession(null);
    setAlerts([]);
    setConso([]);
    setDeliveries([]);
    setMoves([]);
  };

  const saveThresholds = (t: Record<number, number>) => {
    setThresholds(t);
    try {
      localStorage.setItem("wms_thresholds", JSON.stringify(t));
    } catch {}
  };

  // ── Data Loaders ──
  const loadAlerts = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const quants = await odoo.searchRead(
        session,
        "stock.quant",
        [
          ["location_id.usage", "=", "internal"],
          ["quantity", ">", 0],
        ],
        ["product_id", "quantity", "location_id"],
        2000
      );
      const byProduct: Record<
        number,
        { name: string; ref: string; qty: number }
      > = {};
      for (const q of quants) {
        const pid = q.product_id[0];
        if (!byProduct[pid])
          byProduct[pid] = { name: q.product_id[1], ref: "", qty: 0 };
        byProduct[pid].qty += q.quantity;
      }
      const pids = Object.keys(byProduct).map(Number);
      if (pids.length) {
        const prods = await odoo.searchRead(
          session,
          "product.product",
          [["id", "in", pids]],
          ["id", "default_code"],
          2000
        );
        for (const p of prods)
          if (byProduct[p.id]) byProduct[p.id].ref = p.default_code || "";
      }
      setStockMap(
        Object.fromEntries(
          Object.entries(byProduct).map(([id, v]) => [
            id,
            { qty: v.qty, name: v.name, ref: v.ref },
          ])
        )
      );
      const alertList: StockAlert[] = [];
      for (const [idStr, data] of Object.entries(byProduct)) {
        const pid = Number(idStr);
        const thresh = thresholds[pid];
        if (thresh !== undefined && data.qty <= thresh) {
          alertList.push({
            productId: pid,
            ref: data.ref,
            name: data.name,
            qty: data.qty,
            threshold: thresh,
          });
        }
      }
      alertList.sort((a, b) => a.qty / a.threshold - b.qty / b.threshold);
      setAlerts(alertList);
      return byProduct;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session, thresholds]);

  const loadConso = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const months = monthsBack(consoMonths);
      const startDate = months[0] + "-01";
      const endDate = new Date().toISOString().split("T")[0];
      const [custLocs, intLocs] = await Promise.all([
        odoo.searchRead(
          session,
          "stock.location",
          [["usage", "=", "customer"]],
          ["id"],
          100
        ),
        odoo.searchRead(
          session,
          "stock.location",
          [["usage", "=", "internal"]],
          ["id"],
          500
        ),
      ]);
      const custLocIds = custLocs.map((l: any) => l.id);
      const intLocIds = intLocs.map((l: any) => l.id);
      const batchDateSize = 3;
      let allMoves: any[] = [];
      for (let i = 0; i < months.length; i += batchDateSize) {
        const batchStart = months[i] + "-01";
        const batchEnd =
          i + batchDateSize >= months.length
            ? endDate
            : (() => {
                const d = new Date(months[i + batchDateSize] + "-01");
                d.setDate(0);
                return d.toISOString().split("T")[0];
              })();
        const batchMoves = await odoo.searchRead(
          session,
          "stock.move",
          [
            ["state", "=", "done"],
            ["location_id", "in", intLocIds],
            ["location_dest_id", "in", custLocIds],
            ["date", ">=", batchStart + " 00:00:00"],
            ["date", "<=", batchEnd + " 23:59:59"],
          ],
          ["product_id", "product_qty", "date"],
          10000
        );
        allMoves = allMoves.concat(batchMoves);
      }
      const byProd: Record<
        number,
        { name: string; ref: string; months: Record<string, number> }
      > = {};
      for (const m of allMoves) {
        const pid = m.product_id[0];
        const month = (m.date || "").substring(0, 7);
        if (!month) continue;
        if (!byProd[pid])
          byProd[pid] = { name: m.product_id[1], ref: "", months: {} };
        byProd[pid].months[month] =
          (byProd[pid].months[month] || 0) + m.product_qty;
      }
      const prodIds = Object.keys(byProd).map(Number);
      if (prodIds.length) {
        const prods = await odoo.searchRead(
          session,
          "product.product",
          [["id", "in", prodIds]],
          ["id", "default_code"],
          2000
        );
        for (const p of prods)
          if (byProd[p.id]) byProd[p.id].ref = p.default_code || "";
      }
      const rows: ConsoRow[] = Object.entries(byProd).map(([, v]) => ({
        ref: v.ref,
        name: v.name,
        months: v.months,
        total: Object.values(v.months).reduce((s, n) => s + n, 0),
        avg: 0,
      }));
      rows.sort((a, b) => b.total - a.total);
      rows.forEach((r) => {
        const activeMonths = Object.values(r.months).filter(
          (v) => v > 0
        ).length;
        r.avg = activeMonths > 0 ? Math.round(r.total / activeMonths) : 0;
      });
      setConso(rows);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session, consoMonths]);

  const loadDeliveries = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const pickings = await odoo.searchRead(
        session,
        "stock.picking",
        [
          ["state", "=", "done"],
          ["picking_type_code", "=", "outgoing"],
          ["date_done", ">=", delStart + " 00:00:00"],
          ["date_done", "<=", delEnd + " 23:59:59"],
        ],
        ["name", "date_done", "partner_id", "move_ids"],
        1000,
        "date_done desc"
      );
      const byDate: Record<string, { count: number; lines: number }> = {};
      for (const p of pickings) {
        const date = (p.date_done || "").substring(0, 10);
        if (!byDate[date]) byDate[date] = { count: 0, lines: 0 };
        byDate[date].count++;
        byDate[date].lines += (p.move_ids || []).length;
      }
      const rows: DeliveryRow[] = Object.entries(byDate)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, v]) => ({ date, ...v }));
      setDeliveries(rows);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session, delStart, delEnd]);

  const loadMoves = useCallback(async () => {
    if (!session || !moveRef.trim()) return;
    setLoading(true);
    setError("");
    setMoveSearched(true);
    try {
      let prods = await odoo.searchRead(
        session,
        "product.product",
        [["default_code", "=ilike", moveRef.trim()]],
        ["id", "name", "default_code"],
        5
      );
      if (!prods.length)
        prods = await odoo.searchRead(
          session,
          "product.product",
          [["barcode", "=", moveRef.trim()]],
          ["id", "name", "default_code"],
          5
        );
      if (!prods.length) {
        setError(`Référence "${moveRef}" introuvable`);
        setMoves([]);
        setLoading(false);
        return;
      }
      const productId = prods[0].id;
      const rawMoves = await odoo.searchRead(
        session,
        "stock.move",
        [
          ["product_id", "=", productId],
          ["state", "=", "done"],
        ],
        [
          "date",
          "picking_id",
          "location_id",
          "location_dest_id",
          "product_qty",
          "lot_ids",
          "name",
        ],
        500,
        "date desc"
      );
      const locIds = Array.from(
        new Set(
          rawMoves
            .flatMap((m: any) => [
              m.location_id?.[0],
              m.location_dest_id?.[0],
            ])
            .filter(Boolean)
        )
      ) as number[];
      const locs = locIds.length
        ? await odoo.searchRead(
            session,
            "stock.location",
            [["id", "in", locIds]],
            ["id", "usage"],
            200
          )
        : [];
      const locUsage: Record<number, string> = Object.fromEntries(
        locs.map((l: any) => [l.id, l.usage])
      );
      const rows: MoveRow[] = rawMoves.map((m: any) => {
        const fromUsage = locUsage[m.location_id?.[0]] || "";
        const toUsage = locUsage[m.location_dest_id?.[0]] || "";
        const type =
          fromUsage === "supplier" ||
          (toUsage === "internal" && fromUsage !== "internal")
            ? "Entrée"
            : toUsage === "customer" ||
              (fromUsage === "internal" && toUsage !== "internal")
            ? "Sortie"
            : "Interne";
        return {
          date: m.date,
          type,
          qty: m.product_qty,
          lot: Array.isArray(m.lot_ids)
            ? m.lot_ids.join(", ") || "—"
            : "—",
          from: m.location_id?.[1] || "—",
          to: m.location_dest_id?.[1] || "—",
          picking: m.picking_id?.[1] || "—",
        };
      });
      setMoves(rows);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session, moveRef]);

  // ── Auto-load on tab ──
  useEffect(() => {
    if (!session) return;
    if (tab === "alerts") {
      loadAlerts();
      if (conso.length === 0) loadConso();
    }
    if (tab === "conso") loadConso();
    if (tab === "deliveries") loadDeliveries();
  }, [tab, session]);

  // ── Computed ──
  const months = useMemo(() => monthsBack(consoMonths), [consoMonths]);
  const moveTypeOptions = useMemo(
    () => ["all", ...Array.from(new Set(moves.map((m) => m.type)))],
    [moves]
  );
  const filteredMoves = useMemo(
    () =>
      [...moves]
        .filter((m) => moveTypeFilter === "all" || m.type === moveTypeFilter)
        .sort((a, b) => {
          const dir = moveSortDir === "asc" ? 1 : -1;
          if (moveSort === "date") return dir * a.date.localeCompare(b.date);
          if (moveSort === "type") return dir * a.type.localeCompare(b.type);
          if (moveSort === "picking")
            return dir * a.picking.localeCompare(b.picking);
          return 0;
        }),
    [moves, moveTypeFilter, moveSort, moveSortDir]
  );

  // ═══════════════════════════════════════
  // LOGIN SCREEN
  // ═══════════════════════════════════════
  if (!session)
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-base)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-body)",
        }}
      >
        <style>{GLOBAL_CSS}</style>
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            padding: 24,
            animation: "fadeIn 0.5s ease both",
          }}
        >
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "var(--radius-md)",
                background: "linear-gradient(135deg, var(--accent), #6366f1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 18px",
                boxShadow: "0 8px 32px rgba(59,130,246,0.3)",
                color: "#fff",
              }}
            >
              {Icons.warehouse}
            </div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "var(--text-primary)",
                letterSpacing: "-0.3px",
                marginBottom: 4,
              }}
            >
              WMS Dashboard
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-muted)",
              }}
            >
              Rapports & Alertes stock · Odoo
            </p>
          </div>

          {/* Form */}
          <div className="wms-card" style={{ padding: 28 }}>
            {[
              {
                label: "URL Odoo",
                val: url,
                set: setUrl,
                ph: "https://odoo.example.com",
              },
              {
                label: "Base de données",
                val: db,
                set: setDb,
                ph: "nom_base",
              },
              {
                label: "Identifiant",
                val: user,
                set: setUser,
                ph: "admin@company.com",
              },
              {
                label: "Mot de passe",
                val: pw,
                set: setPw,
                ph: "••••••••",
                type: "password",
              },
            ].map((f) => (
              <div key={f.label} style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    display: "block",
                    marginBottom: 6,
                    letterSpacing: "0.3px",
                  }}
                >
                  {f.label}
                </label>
                <input
                  className="wms-input"
                  type={f.type || "text"}
                  value={f.val}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.ph}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                />
              </div>
            ))}

            {loginError && (
              <div
                style={{
                  background: "var(--danger-soft)",
                  border: "1px solid var(--danger-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "var(--danger)",
                  marginBottom: 14,
                }}
              >
                {loginError}
              </div>
            )}

            <button
              className="wms-btn wms-btn-primary"
              onClick={login}
              disabled={loginLoading}
              style={{ width: "100%", justifyContent: "center", padding: 14, fontSize: 15 }}
            >
              {loginLoading ? <Spinner size={16} /> : null}
              {loginLoading ? "Connexion..." : "Se connecter"}
            </button>
          </div>
        </div>
      </div>
    );

  // ═══════════════════════════════════════
  // MAIN DASHBOARD
  // ═══════════════════════════════════════
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        fontFamily: "var(--font-body)",
      }}
    >
      <style>{GLOBAL_CSS}</style>

      {/* ── HEADER ── */}
      <header
        style={{
          background: "var(--bg-raised)",
          borderBottom: "1px solid var(--border)",
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 60,
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "var(--radius-sm)",
              background: "linear-gradient(135deg, var(--accent), #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {Icons.warehouse}
          </div>
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "var(--text-primary)",
                letterSpacing: "-0.2px",
                lineHeight: 1.2,
              }}
            >
              WMS Dashboard
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {session.name} · {session.config?.url?.replace("https://", "")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="/"
            className="wms-btn wms-btn-ghost"
            style={{
              textDecoration: "none",
              padding: "8px 14px",
              fontSize: 13,
            }}
          >
            {Icons.scanner} Scanner
          </a>
          <button
            className="wms-btn wms-btn-danger"
            onClick={logout}
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            {Icons.logout} Déconnexion
          </button>
        </div>
      </header>

      {/* ── TABS ── */}
      <nav
        style={{
          background: "var(--bg-raised)",
          borderBottom: "1px solid var(--border)",
          padding: "0 28px",
          display: "flex",
          gap: 2,
          overflowX: "auto",
        }}
        className="wms-scrollbar"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            className="wms-tab"
            data-active={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {t.icon} {t.label}
            </span>
          </button>
        ))}
      </nav>

      {/* ── CONTENT ── */}
      <main
        style={{
          maxWidth: 1260,
          margin: "0 auto",
          padding: "28px 28px 60px",
        }}
      >
        {/* Global error */}
        {error && (
          <div
            style={{
              background: "var(--danger-soft)",
              border: "1px solid var(--danger-border)",
              borderRadius: "var(--radius-md)",
              padding: "14px 18px",
              fontSize: 14,
              color: "var(--danger)",
              marginBottom: 24,
              display: "flex",
              alignItems: "center",
              gap: 10,
              animation: "fadeIn 0.3s ease both",
            }}
          >
            {Icons.alert}
            <span style={{ flex: 1 }}>{error}</span>
            <button
              onClick={() => setError("")}
              style={{
                background: "none",
                border: "none",
                color: "var(--danger)",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                padding: 4,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* ══════════════ ALERTES ══════════════ */}
        {tab === "alerts" && (
          <div style={{ animation: "fadeIn 0.3s ease both" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 28,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.3px",
                    marginBottom: 4,
                  }}
                >
                  Alertes stock
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Seuils min. configurables — jours restants estimés via la consommation moyenne
                </p>
              </div>
              <button
                className="wms-btn wms-btn-primary"
                onClick={loadAlerts}
                disabled={loading}
              >
                {loading ? <Spinner /> : Icons.refresh} Actualiser
              </button>
            </div>

            {/* Alert cards */}
            {alerts.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--danger)",
                    marginBottom: 14,
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--danger)",
                      animation: "pulse-dot 1.5s ease-in-out infinite",
                    }}
                  />
                  {alerts.length} article{alerts.length > 1 ? "s" : ""} en alerte
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {alerts.map((a, idx) => {
                    const ratio = a.qty / a.threshold;
                    const isRed = ratio <= 0.25;
                    const isOrange = ratio <= 0.75;
                    const color = isRed
                      ? "var(--danger)"
                      : isOrange
                      ? "var(--warning)"
                      : "var(--orange)";
                    const bg = isRed
                      ? "var(--danger-soft)"
                      : isOrange
                      ? "var(--warning-soft)"
                      : "rgba(249,115,22,0.08)";
                    const borderColor = isRed
                      ? "var(--danger)"
                      : isOrange
                      ? "var(--warning)"
                      : "var(--orange)";
                    const consoRow = conso.find((c) => c.ref === a.ref);
                    const dailyAvg = consoRow ? consoRow.avg / 30 : 0;
                    const daysLeft =
                      dailyAvg > 0 ? Math.round(a.qty / dailyAvg) : null;
                    const daysLabel =
                      daysLeft === null
                        ? "Conso inconnue"
                        : daysLeft <= 0
                        ? "Rupture imminente"
                        : `${daysLeft}j restant${daysLeft > 1 ? "s" : ""}`;
                    return (
                      <div
                        key={a.productId}
                        className="alert-card"
                        style={{
                          background: bg,
                          borderLeftColor: borderColor,
                          animationDelay: `${idx * 50}ms`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 16,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: "var(--text-primary)",
                                marginBottom: 6,
                              }}
                            >
                              {a.ref && (
                                <span
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--accent)",
                                    marginRight: 8,
                                    fontSize: 12,
                                  }}
                                >
                                  [{a.ref}]
                                </span>
                              )}
                              {a.name}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 20,
                                flexWrap: "wrap",
                                fontSize: 13,
                                color: "var(--text-secondary)",
                              }}
                            >
                              <span>
                                Stock :{" "}
                                <strong style={{ color, fontSize: 15 }}>
                                  {a.qty}
                                </strong>
                              </span>
                              <span>
                                Seuil : <strong>{a.threshold}</strong>
                              </span>
                              {consoRow && (
                                <span>
                                  Moy : <strong>{consoRow.avg}/mois</strong>
                                </span>
                              )}
                            </div>
                          </div>
                          <div
                            style={{
                              textAlign: "right",
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color,
                                whiteSpace: "nowrap",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {daysLabel}
                            </div>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div
                          style={{
                            height: 4,
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: 2,
                            marginTop: 14,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            className="bar-fill"
                            style={{
                              width: `${Math.min(ratio * 100, 100)}%`,
                              background: color,
                              animationDelay: `${idx * 50 + 200}ms`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* All OK */}
            {alerts.length === 0 && Object.keys(stockMap).length > 0 && (
              <div
                style={{
                  background: "var(--success-soft)",
                  border: "1px solid var(--success-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "22px 28px",
                  marginBottom: 28,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  animation: "fadeIn 0.4s ease both",
                }}
              >
                {Icons.check}
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--success)",
                    }}
                  >
                    Tous les stocks sont OK
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    Aucun article n&apos;a atteint son seuil d&apos;alerte.
                  </div>
                </div>
              </div>
            )}

            {/* Threshold manager */}
            <div className="wms-card" style={{ padding: 24 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    Gérer les seuils
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    Import Excel : colonne A = référence, colonne B = seuil
                  </div>
                </div>
                <label
                  className="wms-btn"
                  style={{
                    background: "var(--purple-soft)",
                    color: "var(--purple)",
                    border: "1px solid var(--purple-border)",
                    cursor: "pointer",
                    padding: "8px 14px",
                    fontSize: 13,
                  }}
                >
                  {Icons.upload} Importer Excel
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const XLSX = await import("xlsx");
                        const data = await file.arrayBuffer();
                        const wb = XLSX.read(data, { type: "array" });
                        const ws = wb.Sheets[wb.SheetNames[0]];
                        const rows: any[] = XLSX.utils.sheet_to_json(ws, {
                          header: 1,
                        });
                        const newThresh = { ...thresholds };
                        let imported = 0;
                        for (const row of rows) {
                          const ref = String(row[0] || "").trim();
                          const val = Number(row[1]);
                          if (!ref || isNaN(val) || val < 0) continue;
                          const match = Object.entries(stockMap).find(
                            ([, d]) => d.ref === ref
                          );
                          if (match) {
                            newThresh[Number(match[0])] = val;
                            imported++;
                          }
                        }
                        saveThresholds(newThresh);
                        alert(`${imported} seuil(s) importé(s)`);
                      } catch {
                        alert("Erreur lecture Excel");
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <input
                className="wms-input"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Filtrer par référence ou nom..."
                style={{ marginBottom: 16 }}
              />

              <div
                className="wms-scrollbar"
                style={{ maxHeight: 420, overflowY: "auto" }}
              >
                {Object.keys(stockMap).length === 0 && !loading && (
                  <EmptyState
                    icon={Icons.refresh}
                    title='Cliquez sur "Actualiser"'
                    sub="pour charger les produits"
                  />
                )}
                {Object.entries(stockMap)
                  .filter(
                    ([, d]) =>
                      !stockSearch ||
                      d.ref
                        .toLowerCase()
                        .includes(stockSearch.toLowerCase()) ||
                      d.name
                        .toLowerCase()
                        .includes(stockSearch.toLowerCase())
                  )
                  .map(([pidStr, data]) => {
                    const pid = Number(pidStr);
                    const { qty, name, ref } = data;
                    const thresh = thresholds[pid];
                    const isAlert = thresh !== undefined && qty <= thresh;
                    return (
                      <div
                        key={pid}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "11px 0",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--text-primary)",
                              fontWeight:
                                thresh !== undefined ? 600 : 400,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ref && (
                              <span
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  color: "var(--accent)",
                                  fontWeight: 700,
                                  marginRight: 8,
                                  fontSize: 12,
                                }}
                              >
                                [{ref}]
                              </span>
                            )}
                            {name}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: isAlert
                                ? "var(--danger)"
                                : "var(--text-muted)",
                              marginTop: 2,
                            }}
                          >
                            Stock : <strong>{qty}</strong>
                            {thresh !== undefined && ` · Seuil : ${thresh}`}
                            {isAlert && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  color: "var(--danger)",
                                  fontWeight: 700,
                                }}
                              >
                                ● Alerte
                              </span>
                            )}
                          </div>
                        </div>
                        {editThresh === pid ? (
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              flexShrink: 0,
                            }}
                          >
                            <input
                              className="wms-input"
                              value={editVal}
                              onChange={(e) =>
                                setEditVal(e.target.value)
                              }
                              type="number"
                              min="0"
                              style={{ width: 80, padding: "6px 10px" }}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const v = Number(editVal);
                                  if (!isNaN(v) && v >= 0)
                                    saveThresholds({
                                      ...thresholds,
                                      [pid]: v,
                                    });
                                  setEditThresh(null);
                                }
                                if (e.key === "Escape")
                                  setEditThresh(null);
                              }}
                            />
                            <button
                              className="wms-btn"
                              onClick={() => {
                                const v = Number(editVal);
                                if (!isNaN(v) && v >= 0)
                                  saveThresholds({
                                    ...thresholds,
                                    [pid]: v,
                                  });
                                setEditThresh(null);
                              }}
                              style={{
                                background: "var(--success)",
                                color: "#fff",
                                padding: "6px 10px",
                                fontSize: 13,
                              }}
                            >
                              ✓
                            </button>
                            <button
                              className="wms-btn wms-btn-danger"
                              onClick={() => {
                                const t = { ...thresholds };
                                delete t[pid];
                                saveThresholds(t);
                                setEditThresh(null);
                              }}
                              style={{ padding: "6px 10px", fontSize: 12 }}
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            className="wms-btn"
                            onClick={() => {
                              setEditThresh(pid);
                              setEditVal(
                                thresh !== undefined
                                  ? String(thresh)
                                  : ""
                              );
                            }}
                            style={{
                              flexShrink: 0,
                              padding: "6px 14px",
                              fontSize: 12,
                              background:
                                thresh !== undefined
                                  ? isAlert
                                    ? "var(--danger-soft)"
                                    : "var(--warning-soft)"
                                  : "var(--bg-surface)",
                              color:
                                thresh !== undefined
                                  ? isAlert
                                    ? "var(--danger)"
                                    : "var(--warning)"
                                  : "var(--text-muted)",
                              border: `1px solid ${
                                thresh !== undefined
                                  ? isAlert
                                    ? "var(--danger-border)"
                                    : "var(--warning-border)"
                                  : "var(--border)"
                              }`,
                              fontWeight: thresh !== undefined ? 700 : 400,
                              fontFamily:
                                thresh !== undefined
                                  ? "var(--font-mono)"
                                  : "inherit",
                            }}
                          >
                            {thresh !== undefined
                              ? `Seuil: ${thresh}`
                              : "+ Seuil"}
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ CONSO ══════════════ */}
        {tab === "conso" && (
          <div style={{ animation: "fadeIn 0.3s ease both" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 24,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.3px",
                    marginBottom: 4,
                  }}
                >
                  Consommation mensuelle
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Quantités sorties vers clients (hors transferts internes)
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select
                  className="wms-select"
                  value={consoMonths}
                  onChange={(e) => setConsoMonths(Number(e.target.value))}
                >
                  {[3, 6, 9, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} mois
                    </option>
                  ))}
                </select>
                <button
                  className="wms-btn wms-btn-primary"
                  onClick={loadConso}
                  disabled={loading}
                >
                  {loading ? <Spinner /> : Icons.refresh} Charger
                </button>
              </div>
            </div>

            {conso.length > 0 && (
              <input
                className="wms-input"
                value={consoSearch}
                onChange={(e) => setConsoSearch(e.target.value)}
                placeholder="Filtrer par référence ou désignation..."
                style={{ marginBottom: 16 }}
              />
            )}

            {conso.length > 0 && (
              <div
                className="wms-card"
                style={{ overflow: "hidden" }}
              >
                <div
                  className="wms-scrollbar"
                  style={{ overflowX: "auto" }}
                >
                  <table className="wms-table">
                    <thead>
                      <tr>
                        <th
                          style={{
                            position: "sticky",
                            left: 0,
                            zIndex: 3,
                          }}
                        >
                          Référence
                        </th>
                        <th style={{ minWidth: 180 }}>Désignation</th>
                        {months.map((m) => (
                          <th
                            key={m}
                            style={{
                              textAlign: "center",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {fmtMonth(m)}
                          </th>
                        ))}
                        <th
                          style={{
                            textAlign: "center",
                            color: "var(--purple)",
                          }}
                        >
                          Moy/mois
                        </th>
                        <th
                          style={{
                            textAlign: "center",
                            color: "var(--text-primary)",
                          }}
                        >
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {conso
                        .filter(
                          (row) =>
                            !consoSearch ||
                            row.ref
                              .toLowerCase()
                              .includes(consoSearch.toLowerCase()) ||
                            row.name
                              .toLowerCase()
                              .includes(consoSearch.toLowerCase())
                        )
                        .map((row, i) => {
                          const max = Math.max(
                            ...months.map((m) => row.months[m] || 0)
                          );
                          return (
                            <tr key={i}>
                              <td
                                style={{
                                  fontWeight: 700,
                                  fontFamily: "var(--font-mono)",
                                  color: "var(--accent)",
                                  fontSize: 12,
                                  whiteSpace: "nowrap",
                                  position: "sticky",
                                  left: 0,
                                  background: "var(--bg-raised)",
                                  zIndex: 1,
                                }}
                              >
                                {row.ref || "—"}
                              </td>
                              <td
                                style={{
                                  color: "var(--text-primary)",
                                  fontSize: 12,
                                }}
                              >
                                {row.name.replace(/\[.*?\]\s*/, "")}
                              </td>
                              {months.map((m) => {
                                const val = row.months[m] || 0;
                                const intensity =
                                  max > 0 ? val / max : 0;
                                return (
                                  <td
                                    key={m}
                                    className="conso-cell"
                                    style={{
                                      textAlign: "center",
                                      background:
                                        val > 0
                                          ? `rgba(59,130,246,${
                                              intensity * 0.2 + 0.04
                                            })`
                                          : "transparent",
                                      color:
                                        val > 0
                                          ? "var(--text-primary)"
                                          : "var(--text-muted)",
                                      fontWeight: val > 0 ? 600 : 400,
                                      fontFamily:
                                        val > 0
                                          ? "var(--font-mono)"
                                          : "inherit",
                                      fontSize: 12,
                                    }}
                                  >
                                    {val > 0 ? val : "—"}
                                  </td>
                                );
                              })}
                              <td
                                style={{
                                  textAlign: "center",
                                  fontWeight: 600,
                                  color: "var(--purple)",
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 12,
                                }}
                              >
                                {row.avg > 0 ? row.avg : "—"}
                              </td>
                              <td
                                style={{
                                  textAlign: "center",
                                  fontWeight: 800,
                                  color: "var(--text-primary)",
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 13,
                                }}
                              >
                                {row.total}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {conso.length === 0 && !loading && (
              <EmptyState
                icon={Icons.chart}
                title='Cliquez sur "Charger"'
                sub="pour afficher la consommation mensuelle"
              />
            )}
            {loading && <div style={{ textAlign: "center", padding: 40 }}><Spinner size={24} /></div>}
          </div>
        )}

        {/* ══════════════ LIVRAISONS ══════════════ */}
        {tab === "deliveries" && (
          <div style={{ animation: "fadeIn 0.3s ease both" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 24,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.3px",
                    marginBottom: 4,
                  }}
                >
                  Livraisons par période
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Bons de livraison validés, groupés par jour
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <input
                  className="wms-input"
                  type="date"
                  value={delStart}
                  onChange={(e) => setDelStart(e.target.value)}
                  style={{ width: "auto" }}
                />
                <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
                  →
                </span>
                <input
                  className="wms-input"
                  type="date"
                  value={delEnd}
                  onChange={(e) => setDelEnd(e.target.value)}
                  style={{ width: "auto" }}
                />
                <button
                  className="wms-btn wms-btn-primary"
                  onClick={loadDeliveries}
                  disabled={loading}
                >
                  {loading ? <Spinner /> : Icons.refresh} Charger
                </button>
              </div>
            </div>

            {deliveries.length > 0 && (
              <>
                {/* Stats */}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    marginBottom: 24,
                    flexWrap: "wrap",
                  }}
                >
                  <StatCard
                    label="Jours"
                    value={deliveries.length}
                    color="var(--accent)"
                    delay={0}
                  />
                  <StatCard
                    label="Livraisons"
                    value={deliveries.reduce((s, d) => s + d.count, 0)}
                    color="var(--success)"
                    delay={50}
                  />
                  <StatCard
                    label="Lignes totales"
                    value={deliveries.reduce((s, d) => s + d.lines, 0)}
                    color="var(--purple)"
                    delay={100}
                  />
                  <StatCard
                    label="Moy./jour"
                    value={Math.round(
                      deliveries.reduce((s, d) => s + d.count, 0) /
                        deliveries.length
                    )}
                    color="var(--warning)"
                    delay={150}
                  />
                </div>

                {/* Mini chart */}
                <div
                  className="wms-card"
                  style={{ padding: "18px 20px", marginBottom: 16 }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Livraisons / jour
                  </div>
                  <MiniBarChart
                    data={[...deliveries].reverse().map((d) => d.count)}
                    max={Math.max(...deliveries.map((d) => d.count))}
                  />
                </div>

                {/* Table */}
                <div className="wms-card">
                  <div
                    className="wms-scrollbar"
                    style={{ overflowX: "auto" }}
                  >
                    <table className="wms-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th style={{ textAlign: "center" }}>Livraisons</th>
                          <th style={{ textAlign: "center" }}>
                            Lignes articles
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveries.map((d, i) => {
                          const maxCount = Math.max(
                            ...deliveries.map((x) => x.count)
                          );
                          return (
                            <tr key={i}>
                              <td
                                style={{
                                  fontWeight: 600,
                                  color: "var(--text-primary)",
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 12,
                                }}
                              >
                                {fmtDate(d.date)}
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 10,
                                  }}
                                >
                                  <div
                                    style={{
                                      height: 6,
                                      width: `${
                                        (d.count / maxCount) * 80
                                      }px`,
                                      borderRadius: 3,
                                      minWidth: 4,
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      className="bar-fill"
                                      style={{
                                        background: "var(--accent)",
                                        animationDelay: `${i * 30}ms`,
                                      }}
                                    />
                                  </div>
                                  <span
                                    style={{
                                      fontWeight: 700,
                                      color: "var(--text-primary)",
                                      fontFamily: "var(--font-mono)",
                                      fontSize: 13,
                                    }}
                                  >
                                    {d.count}
                                  </span>
                                </div>
                              </td>
                              <td
                                style={{
                                  textAlign: "center",
                                  fontWeight: 600,
                                  color: "var(--text-secondary)",
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 13,
                                }}
                              >
                                {d.lines}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {deliveries.length === 0 && !loading && (
              <EmptyState
                icon={Icons.truck}
                title="Sélectionnez une période"
                sub='puis cliquez sur "Charger"'
              />
            )}
            {loading && <div style={{ textAlign: "center", padding: 40 }}><Spinner size={24} /></div>}
          </div>
        )}

        {/* ══════════════ HISTORIQUE ══════════════ */}
        {tab === "moves" && (
          <div style={{ animation: "fadeIn 0.3s ease both" }}>
            <div style={{ marginBottom: 24 }}>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.3px",
                  marginBottom: 4,
                }}
              >
                Historique des mouvements
              </h2>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                Recherchez par référence article ou code-barres
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  className="wms-input"
                  value={moveRef}
                  onChange={(e) => setMoveRef(e.target.value)}
                  placeholder="Référence ou code-barres..."
                  onKeyDown={(e) => e.key === "Enter" && loadMoves()}
                  style={{ flex: 1 }}
                />
                <button
                  className="wms-btn wms-btn-primary"
                  onClick={loadMoves}
                  disabled={loading || !moveRef.trim()}
                  style={{
                    opacity: !moveRef.trim() ? 0.5 : 1,
                  }}
                >
                  {loading ? <Spinner /> : Icons.search} Rechercher
                </button>
              </div>
            </div>

            {filteredMoves.length > 0 && (
              <div className="wms-card">
                {/* Filters header */}
                <div
                  style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {filteredMoves.length}/{moves.length} mouvement
                    {filteredMoves.length > 1 ? "s" : ""}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {moveTypeOptions.map((t) => (
                      <button
                        key={t}
                        className="wms-btn"
                        onClick={() => setMoveTypeFilter(t)}
                        style={{
                          padding: "5px 12px",
                          fontSize: 11,
                          fontWeight: 600,
                          background:
                            moveTypeFilter === t
                              ? "var(--accent-soft)"
                              : "var(--bg-surface)",
                          color:
                            moveTypeFilter === t
                              ? "var(--accent)"
                              : "var(--text-muted)",
                          border: `1px solid ${
                            moveTypeFilter === t
                              ? "var(--accent-border)"
                              : "var(--border)"
                          }`,
                        }}
                      >
                        {t === "all" ? "Tous" : t}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className="wms-scrollbar"
                  style={{ overflowX: "auto" }}
                >
                  <table className="wms-table">
                    <thead>
                      <tr>
                        {(["date", "type", "picking"] as const).map(
                          (col) => (
                            <th
                              key={col}
                              onClick={() => {
                                if (moveSort === col)
                                  setMoveSortDir((d) =>
                                    d === "asc" ? "desc" : "asc"
                                  );
                                else {
                                  setMoveSort(col);
                                  setMoveSortDir("desc");
                                }
                              }}
                              style={{
                                cursor: "pointer",
                                userSelect: "none",
                                whiteSpace: "nowrap",
                                color:
                                  moveSort === col
                                    ? "var(--accent)"
                                    : undefined,
                              }}
                            >
                              {col === "date"
                                ? "Date"
                                : col === "type"
                                ? "Type"
                                : "BL/Transfert"}
                              {moveSort === col
                                ? moveSortDir === "asc"
                                  ? " ↑"
                                  : " ↓"
                                : ""}
                            </th>
                          )
                        )}
                        <th>Qté</th>
                        <th>Lot</th>
                        <th>De</th>
                        <th>Vers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMoves.map((m, i) => {
                        const typeConfig =
                          m.type === "Sortie"
                            ? {
                                bg: "var(--danger-soft)",
                                color: "var(--danger)",
                              }
                            : m.type === "Entrée"
                            ? {
                                bg: "var(--success-soft)",
                                color: "var(--success)",
                              }
                            : {
                                bg: "var(--accent-soft)",
                                color: "var(--accent)",
                              };
                        return (
                          <tr key={i}>
                            <td
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {fmtDate(m.date)}
                            </td>
                            <td>
                              <span
                                className="wms-badge"
                                style={{
                                  background: typeConfig.bg,
                                  color: typeConfig.color,
                                }}
                              >
                                {m.type}
                              </span>
                            </td>
                            <td
                              style={{
                                color: "var(--accent)",
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {m.picking}
                            </td>
                            <td
                              style={{
                                fontWeight: 800,
                                color: "var(--text-primary)",
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {m.qty}
                            </td>
                            <td
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                              }}
                            >
                              {m.lot}
                            </td>
                            <td
                              style={{
                                fontSize: 12,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {m.from}
                            </td>
                            <td
                              style={{
                                fontSize: 12,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {m.to}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {moves.length === 0 && moveSearched && !loading && (
              <EmptyState
                icon={Icons.search}
                title={`Aucun mouvement pour "${moveRef}"`}
                sub="Vérifiez la référence et réessayez"
              />
            )}
            {!moveSearched && !loading && (
              <EmptyState
                icon={Icons.history}
                title="Entrez une référence"
                sub="pour afficher l'historique des mouvements"
              />
            )}
            {loading && <div style={{ textAlign: "center", padding: 40 }}><Spinner size={24} /></div>}
          </div>
        )}
      </main>
    </div>
  );
}
