"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as odoo from "@/lib/odoo";

// ============================================
// DESIGN SYSTEM — Industrial / Clean / Utilitarian
// ============================================
const C = {
  // Backgrounds
  bg: "#f5f6f8",
  white: "#ffffff",
  card: "#ffffff",
  overlay: "rgba(0,0,0,0.04)",

  // Primary palette
  blue: "#2563eb",
  blueSoft: "#eff6ff",
  blueBorder: "#bfdbfe",

  // Status
  green: "#16a34a",
  greenSoft: "#f0fdf4",
  greenBorder: "#bbf7d0",
  orange: "#ea580c",
  orangeSoft: "#fff7ed",
  orangeBorder: "#fed7aa",
  red: "#dc2626",
  redSoft: "#fef2f2",
  redBorder: "#fecaca",

  // Text
  text: "#111827",
  textSec: "#4b5563",
  textMuted: "#9ca3af",

  // Borders
  border: "#e5e7eb",
  borderStrong: "#d1d5db",

  // Misc
  shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowLg: "0 4px 12px rgba(0,0,0,0.08)",
};

// ============================================
// SCANNER HOOK — Global key trapping for Zebra
// ============================================
function useScannerListener(onScan: (code: string) => void, enabled: boolean) {
  const buf = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const handle = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const inInput = tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA";

      if (e.key === "Enter") {
        if (buf.current.length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          const code = buf.current;
          buf.current = "";
          if (timer.current) { clearTimeout(timer.current); timer.current = null; }
          cb.current(code);
          if (inInput && tgt instanceof HTMLInputElement) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            if (setter) { setter.call(tgt, ""); tgt.dispatchEvent(new Event("input", { bubbles: true })); }
          }
          return;
        }
        buf.current = "";
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        return;
      }
      if (e.key.length !== 1) return;
      buf.current += e.key;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { buf.current = ""; timer.current = null; }, 50);
    };
    window.addEventListener("keydown", handle, true);
    return () => { window.removeEventListener("keydown", handle, true); if (timer.current) clearTimeout(timer.current); };
  }, [enabled]);
}

// Session persistence
function saveSession(s: odoo.OdooSession) { try { sessionStorage.setItem("wms_s", JSON.stringify(s)); } catch {} }
function loadSess(): odoo.OdooSession | null { try { const s = sessionStorage.getItem("wms_s"); return s ? JSON.parse(s) : null; } catch { return null; } }
function clearSess() { try { sessionStorage.removeItem("wms_s"); } catch {} }
function saveCfg(u: string, d: string) { try { localStorage.setItem("wms_c", JSON.stringify({ u, d })); } catch {} }
function loadCfg(): { u: string; d: string } | null { try { const c = localStorage.getItem("wms_c"); return c ? JSON.parse(c) : null; } catch { return null; } }

// ============================================
// MAIN APP
// ============================================
export default function Page() {
  const [screen, setScreen] = useState<"login" | "home" | "transfer" | "done">("login");
  const [session, setSession] = useState<odoo.OdooSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [toast, setToast] = useState("");

  // Lookup
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupStock, setLookupStock] = useState<any[]>([]);
  const [lookupType, setLookupType] = useState("");

  // Transfer
  const [src, setSrc] = useState<any>(null);
  const [dst, setDst] = useState<any>(null);
  const [srcContent, setSrcContent] = useState<any[]>([]);
  const [dstContent, setDstContent] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [curProduct, setCurProduct] = useState<any>(null);
  const [curLot, setCurLot] = useState<any>(null);
  const [curStock, setCurStock] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<{ t: string; m: string } | null>(null);

  // Toast
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  // Global scan
  const handleGlobalScan = useCallback((code: string) => {
    showToast(`Scan: ${code}`);
    if (screen === "home") doLookup(code);
    else if (screen === "transfer") doTransferScan(code);
    setTimeout(() => {
      document.querySelectorAll("input").forEach((el) => {
        if (el.value === code || el.value.includes(code)) {
          const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (s) { s.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); }
        }
      });
    }, 10);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, session, src, dst]);

  useScannerListener(handleGlobalScan, screen !== "login");

  // Init
  useEffect(() => {
    const s = loadSess();
    if (s) { setSession(s); setScreen("home"); odoo.getLocations(s).then(setLocations).catch(() => { clearSess(); setScreen("login"); }); }
  }, []);

  const login = async (url: string, db: string, user: string, pw: string) => {
    setLoading(true); setError("");
    try {
      const cfg = { url: url.replace(/\/$/, ""), db };
      const s = await odoo.authenticate(cfg, user, pw);
      setSession(s); saveSession(s); saveCfg(url, db);
      setLocations(await odoo.getLocations(s));
      setScreen("home");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const logout = () => { setSession(null); clearSess(); setScreen("login"); resetTransfer(); };
  const goHome = () => { setScreen("home"); resetTransfer(); clearLookup(); };

  // Lookup
  const clearLookup = () => { setLookupResult(null); setLookupStock([]); setLookupType(""); setError(""); };
  const doLookup = async (code: string) => {
    if (!code || !session) return;
    setLoading(true); setError(""); clearLookup();
    try {
      const r = await odoo.smartScan(session, code);
      if (r.type === "product") { setLookupResult(r.data); setLookupType("product"); setLookupStock(await odoo.getAllStockForProduct(session, r.data.id)); }
      else if (r.type === "lot") { setLookupResult(r.data); setLookupType("lot"); if (r.data.product) setLookupStock(await odoo.getStockForLot(session, r.data.lot.id, r.data.product.id)); }
      else if (r.type === "location") { setLookupResult(r.data); setLookupType("location"); setLookupStock(await odoo.getProductsAtLocation(session, r.data.id)); }
      else setError(`"${code}" — introuvable`);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  // Transfer
  const resetTransfer = () => { setSrc(null); setDst(null); setSrcContent([]); setDstContent([]); setLines([]); setCurProduct(null); setCurLot(null); setCurStock([]); setFeedback(null); setError(""); };

  const loadContent = async (locId: number) => { if (!session) return []; try { return await odoo.getProductsAtLocation(session, locId); } catch { return []; } };

  const setSrcLoc = async (loc: any) => { setSrc(loc); setFeedback({ t: "ok", m: `Source → ${loc.name}` }); setSrcContent(await loadContent(loc.id)); };
  const setDstLoc = async (loc: any) => { setDst(loc); setFeedback({ t: "ok", m: `Destination → ${loc.name}` }); setDstContent(await loadContent(loc.id)); };

  const doTransferScan = async (code: string) => {
    if (!code || !session) return;
    setLoading(true); setError(""); setFeedback(null); setCurProduct(null); setCurLot(null); setCurStock([]);
    try {
      const r = await odoo.smartScan(session, code);
      if (r.type === "location") {
        if (!src) await setSrcLoc(r.data);
        else if (!dst) await setDstLoc(r.data);
        else setFeedback({ t: "info", m: `${r.data.name} (emplacements déjà définis)` });
      } else if (r.type === "product") {
        if (!src) { setFeedback({ t: "warn", m: "Scanne un emplacement source d'abord" }); }
        else { setCurProduct(r.data); setFeedback({ t: "ok", m: r.data.name }); setCurStock(await odoo.getStockAtLocation(session, r.data.id, src.id)); }
      } else if (r.type === "lot") {
        if (!src) { setFeedback({ t: "warn", m: "Scanne un emplacement source d'abord" }); }
        else { setCurProduct(r.data.product); setCurLot(r.data.lot); setFeedback({ t: "ok", m: `Lot ${r.data.lot.name}` }); if (r.data.product) setCurStock(await odoo.getStockAtLocation(session, r.data.product.id, src.id)); }
      } else { setFeedback({ t: "err", m: `"${code}" introuvable` }); }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const addLine = (qty: number, lotId?: number | null, lotName?: string | null) => {
    if (!curProduct) return;
    setLines(p => [...p, { productId: curProduct.id, productName: curProduct.name, productCode: curProduct.default_code, qty, uomId: curProduct.uom_id[0], uomName: curProduct.uom_id[1], lotId: lotId || curLot?.id || null, lotName: lotName || curLot?.name || null }]);
    setCurProduct(null); setCurLot(null); setCurStock([]); setFeedback(null);
  };

  const validate = async () => {
    if (!session || !src || !dst || !lines.length) return;
    setLoading(true); setError("");
    try {
      const pid = await odoo.createInternalTransfer(session, src.id, dst.id, lines);
      await odoo.validatePicking(session, pid);
      setScreen("done");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const rename = async (id: number, name: string) => {
    if (!session) return;
    try { await odoo.renameLocation(session, id, name); setLocations(await odoo.getLocations(session)); } catch {}
  };

  const selectLoc = async (loc: any) => { if (!src) await setSrcLoc(loc); else if (!dst) await setDstLoc(loc); };

  // ===================== RENDER =====================
  const step = !src ? 0 : !dst ? 1 : 2;

  if (screen === "login") return <Login onLogin={login} loading={loading} error={error} />;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', 'SF Pro Display', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes slideUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.5 } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      {/* Toast */}
      {toast && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 999, background: C.text, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: C.shadowLg, animation: "fadeIn .15s" }}>{toast}</div>}

      {/* Header */}
      <header style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={goHome} style={iconBtn}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
          <div>
            <span style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>WMS</span>
            <span style={{ fontSize: 10, color: C.blue, marginLeft: 6, fontWeight: 600, background: C.blueSoft, padding: "2px 6px", borderRadius: 4 }}>SCANNER</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
          <span style={{ fontSize: 12, color: C.textSec }}>{session?.name}</span>
          <button onClick={logout} style={iconBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 100px" }}>

        {/* ===== HOME ===== */}
        {screen === "home" && <>
          {/* Quick scan */}
          <Section>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.blueSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Recherche rapide</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>Scanne ou tape un code</div>
              </div>
            </div>
            <InputBar onSubmit={doLookup} placeholder="Code-barres, référence, lot, emplacement..." />
          </Section>

          {error && <Alert type="error">{error}</Alert>}

          {/* Results */}
          {lookupType === "product" && lookupResult && <ProductResult product={lookupResult} stock={lookupStock} />}
          {lookupType === "lot" && lookupResult && <LotResult lot={lookupResult.lot} product={lookupResult.product} stock={lookupStock} />}
          {lookupType === "location" && lookupResult && <LocationResult location={lookupResult} stock={lookupStock} onRename={rename} />}

          {/* Actions */}
          <div style={{ marginTop: 16 }}>
            <BigButton icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>} label="Transfert interne" sub="Déplacer du stock entre emplacements" onClick={() => { resetTransfer(); setScreen("transfer"); }} />
          </div>
        </>}

        {/* ===== TRANSFER ===== */}
        {screen === "transfer" && <>
          {/* Steps */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
            {["Source", "Destination", "Produits"].map((s, i) => (
              <div key={s} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", margin: "0 auto 4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700,
                  background: step > i ? C.green : step === i ? C.blue : C.border,
                  color: step >= i ? "#fff" : C.textMuted,
                  transition: "all .2s",
                }}>{step > i ? "✓" : i + 1}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: step === i ? C.blue : step > i ? C.green : C.textMuted }}>{s}</div>
              </div>
            ))}
          </div>

          {/* Location cards */}
          {src && <LocCard loc={src} label="Source" content={srcContent} color={C.blue} onRename={rename} />}
          {dst && <LocCard loc={dst} label="Destination" content={dstContent} color={C.green} onRename={rename} />}

          {/* Scan input */}
          <Section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {step === 0 ? "Scanner l'emplacement source" : step === 1 ? "Scanner la destination" : "Scanner un produit"}
              </span>
              {loading && <span style={{ fontSize: 11, color: C.blue, animation: "pulse 1s infinite" }}>Chargement...</span>}
            </div>
            <AutoInput locations={locations} onScan={doTransferScan} onPickLoc={selectLoc} step={step} />
          </Section>

          {feedback && <Alert type={feedback.t === "ok" ? "success" : feedback.t === "warn" ? "warning" : feedback.t === "err" ? "error" : "info"}>{feedback.m}</Alert>}
          {error && <Alert type="error">{error}</Alert>}

          {/* Product card */}
          {curProduct && <ProductPicker product={curProduct} lot={curLot} stock={curStock} srcName={src?.name} onAdd={addLine} />}

          {/* Lines */}
          {lines.length > 0 && (
            <Section>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                Lignes de transfert
                <span style={{ marginLeft: 8, background: C.blue, color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>{lines.length}</span>
              </div>
              {lines.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < lines.length - 1 ? `1px solid ${C.border}` : "none", animation: "slideUp .2s" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: C.blueSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{l.productName}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>
                      {l.productCode} · {l.qty} {l.uomName}
                      {l.lotName && <span style={{ color: C.blue }}> · {l.lotName}</span>}
                    </div>
                  </div>
                  <button onClick={() => setLines(p => p.filter((_, j) => j !== i))} style={{ ...iconBtn, color: C.red }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              ))}
            </Section>
          )}

          {/* Validate */}
          {lines.length > 0 && dst && (
            <div style={{ marginTop: 16 }}>
              <BigButton
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                label={loading ? "Envoi en cours..." : `Valider le transfert (${lines.length})`}
                sub={`${src?.name} → ${dst?.name}`}
                color={C.green}
                onClick={validate}
                disabled={loading}
              />
            </div>
          )}
          {lines.length > 0 && !dst && <Alert type="warning">Scanne un emplacement destination pour valider</Alert>}
        </>}

        {/* ===== DONE ===== */}
        {screen === "done" && (
          <div style={{ textAlign: "center", paddingTop: 60, animation: "slideUp .3s" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: C.greenSoft, border: `2px solid ${C.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 6 }}>Transfert validé</h2>
            <p style={{ fontSize: 14, color: C.textSec, marginBottom: 32 }}>{lines.length} ligne(s) · {src?.name} → {dst?.name}</p>
            <BigButton icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>} label="Nouveau transfert" onClick={() => { resetTransfer(); setScreen("transfer"); }} />
            <button onClick={goHome} style={{ ...secondaryBtn, marginTop: 12 }}>Retour à l'accueil</button>
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================
// UI COMPONENTS
// ============================================

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.white, borderRadius: 14, padding: 16, marginBottom: 12, border: `1px solid ${C.border}`, boxShadow: C.shadow, animation: "slideUp .2s" }}>{children}</div>;
}

function Alert({ type, children }: { type: string; children: React.ReactNode }) {
  const s: Record<string, { bg: string; border: string; color: string; icon: string }> = {
    success: { bg: C.greenSoft, border: C.greenBorder, color: C.green, icon: "✓" },
    warning: { bg: C.orangeSoft, border: C.orangeBorder, color: C.orange, icon: "⚠" },
    error: { bg: C.redSoft, border: C.redBorder, color: C.red, icon: "✕" },
    info: { bg: C.blueSoft, border: C.blueBorder, color: C.blue, icon: "ℹ" },
  };
  const c = s[type] || s.info;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 10, background: c.bg, border: `1px solid ${c.border}`, marginBottom: 12, animation: "slideUp .15s" }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: c.color }}>{c.icon}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: c.color }}>{children}</span>
    </div>
  );
}

function BigButton({ icon, label, sub, color, onClick, disabled }: { icon: React.ReactNode; label: string; sub?: string; color?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
      background: color || C.blue, border: "none", borderRadius: 14, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1, boxShadow: `0 2px 8px ${(color || C.blue)}33`,
      transition: "all .15s",
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ textAlign: "left" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{sub}</div>}
      </div>
    </button>
  );
}

function InputBar({ onSubmit, placeholder }: { onSubmit: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState("");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input style={inputStyle} value={v} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && v.trim()) { e.stopPropagation(); onSubmit(v.trim()); setV(""); } }}
        placeholder={placeholder} />
      <button onClick={() => { if (v.trim()) { onSubmit(v.trim()); setV(""); } }}
        style={{ padding: "0 18px", background: C.blue, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", flexShrink: 0 }}>
        →
      </button>
    </div>
  );
}

function AutoInput({ locations, onScan, onPickLoc, step }: any) {
  const [v, setV] = useState("");
  const [sugg, setSugg] = useState<any[]>([]);
  const [show, setShow] = useState(false);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; setV(val);
    if (val.length >= 2) {
      const l = val.toLowerCase();
      const m = locations.filter((x: any) => (x.name||"").toLowerCase().includes(l) || (x.complete_name||"").toLowerCase().includes(l) || (x.barcode||"").toLowerCase().includes(l)).slice(0, 6);
      setSugg(m); setShow(m.length > 0);
    } else { setSugg([]); setShow(false); }
  };

  return (
    <div style={{ position: "relative" }}>
      <input style={inputStyle} value={v} onChange={onChange}
        onKeyDown={e => { if (e.key === "Enter" && v.trim()) { e.stopPropagation(); setShow(false); onScan(v.trim()); setV(""); } }}
        onFocus={() => { if (sugg.length) setShow(true); }}
        onBlur={() => setTimeout(() => setShow(false), 200)}
        placeholder={step === 0 ? "Emplacement source..." : step === 1 ? "Emplacement destination..." : "Code-barres, réf, lot..."} />
      {show && (
        <div style={{ position: "absolute", top: 50, left: 0, right: 0, zIndex: 50, background: C.white, border: `1px solid ${C.blue}`, borderRadius: 10, boxShadow: C.shadowLg, maxHeight: 200, overflowY: "auto" }}>
          {sugg.map((loc: any) => (
            <button key={loc.id} onMouseDown={() => { onPickLoc(loc); setV(""); setSugg([]); setShow(false); }}
              style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "10px 14px", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ fontWeight: 600 }}>{loc.name}</span>
              {loc.barcode && <span style={{ color: C.textMuted, fontSize: 11 }}>{loc.barcode}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LocCard({ loc, label, content, color, onRename }: { loc: any; label: string; content: any[]; color: string; onRename: (id: number, n: string) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(loc.name);
  useEffect(() => setName(loc.name), [loc.name]);

  const grouped = Object.values(content.reduce((a: any, q: any) => {
    const k = q.product_id[0];
    if (!a[k]) a[k] = { name: q.product_id[1], qty: 0, res: 0 };
    a[k].qty += q.quantity; a[k].res += q.reserved_quantity || 0;
    return a;
  }, {})) as any[];

  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 12, overflow: "hidden", boxShadow: C.shadow }}>
      <div style={{ padding: "12px 16px", borderLeft: `4px solid ${color}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
            {editing ? (
              <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                <input style={{ ...inputStyle, fontSize: 14, padding: "4px 8px", fontWeight: 700 }} value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") { onRename(loc.id, name); setEditing(false); } if (e.key === "Escape") setEditing(false); }} autoFocus />
              </div>
            ) : (
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
                {loc.name}
                <button onClick={() => setEditing(true)} style={{ ...iconBtn, width: 22, height: 22 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setOpen(!open)} style={{ ...iconBtn, fontSize: 12, color: C.textMuted }}>
            {grouped.length} réf · {open ? "▲" : "▼"}
          </button>
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 16px 12px", borderTop: `1px solid ${C.border}` }}>
          {grouped.length === 0 && <div style={{ padding: "10px 0", fontSize: 12, color: C.textMuted, textAlign: "center" }}>Vide</div>}
          {grouped.slice(0, 20).map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < grouped.length - 1 ? `1px solid ${C.border}` : "none", fontSize: 12 }}>
              <span style={{ color: C.text, fontWeight: 500, maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ fontWeight: 700, color: (p.qty - p.res) > 0 ? C.green : C.orange }}>{p.qty - p.res}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductPicker({ product, lot, stock, srcName, onAdd }: any) {
  const [qty, setQty] = useState("1");
  const [selLot, setSelLot] = useState<{ id: number; name: string } | null>(lot ? { id: lot.id, name: lot.name } : null);
  const total = stock.reduce((s: number, q: any) => s + q.quantity, 0);
  const reserved = stock.reduce((s: number, q: any) => s + (q.reserved_quantity || 0), 0);
  const avail = total - reserved;
  const lots = stock.filter((q: any) => q.lot_id);

  useEffect(() => { if (lot) setSelLot({ id: lot.id, name: lot.name }); else setSelLot(null); }, [lot]);

  return (
    <Section>
      {/* Product info */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: C.blueSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{product.name}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{product.default_code || ""} {product.barcode ? `· ${product.barcode}` : ""}</div>
        </div>
      </div>

      {/* Stock bar */}
      <div style={{ display: "flex", gap: 1, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ flex: 1, padding: "10px 12px", background: avail > 0 ? C.greenSoft : C.orangeSoft, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: avail > 0 ? C.green : C.orange }}>{avail}</div>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>DISPO</div>
        </div>
        <div style={{ flex: 1, padding: "10px 12px", background: C.overlay, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.textSec }}>{total}</div>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>STOCK</div>
        </div>
        {reserved > 0 && <div style={{ flex: 1, padding: "10px 12px", background: C.orangeSoft, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.orange }}>{reserved}</div>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>RÉSERVÉ</div>
        </div>}
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14, textAlign: "center" }}>sur {srcName}</div>

      {/* Lot selection */}
      {lots.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>Lot</div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
            {stock.map((q: any, i: number) => {
              if (!q.lot_id) return null;
              const sel = selLot?.id === q.lot_id[0];
              const lq = q.quantity - (q.reserved_quantity || 0);
              return (
                <button key={i} onClick={() => sel ? setSelLot(null) : setSelLot({ id: q.lot_id[0], name: q.lot_id[1] })}
                  style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
                    background: sel ? C.blue : C.white, color: sel ? "#fff" : C.text,
                    border: `1.5px solid ${sel ? C.blue : C.border}`,
                  }}>
                  {q.lot_id[1]} <span style={{ fontWeight: 400, opacity: 0.7 }}>({lq})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Qty + add */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>Qté</div>
          <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
            onKeyDown={e => e.stopPropagation()}
            style={{ ...inputStyle, textAlign: "center", fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace" }} />
        </div>
        <button onClick={() => { if (parseFloat(qty) > 0) onAdd(parseFloat(qty), selLot?.id, selLot?.name); }}
          style={{ padding: "0 24px", background: C.blue, color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 20, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          Ajouter
        </button>
      </div>
    </Section>
  );
}

// ============================================
// LOOKUP RESULT CARDS
// ============================================
function ProductResult({ product, stock }: { product: any; stock: any[] }) {
  const tQ = stock.reduce((s, q) => s + q.quantity, 0);
  const tR = stock.reduce((s, q) => s + (q.reserved_quantity || 0), 0);
  return (
    <Section>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 2 }}>{product.name}{product.active === false && <span style={{ color: C.orange, fontSize: 11, marginLeft: 6 }}>(archivé)</span>}</div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>{product.default_code || ""} {product.barcode ? `· ${product.barcode}` : ""}</div>
      <div style={{ display: "flex", gap: 1, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ flex: 1, padding: "10px", background: C.greenSoft, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{tQ - tR}</div><div style={{ fontSize: 10, color: C.textMuted }}>DISPO</div>
        </div>
        <div style={{ flex: 1, padding: "10px", background: C.overlay, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.textSec }}>{tQ}</div><div style={{ fontSize: 10, color: C.textMuted }}>STOCK</div>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>Par emplacement</div>
      {stock.map((q, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < stock.length - 1 ? `1px solid ${C.border}` : "", fontSize: 12 }}>
          <div><span style={{ fontWeight: 600 }}>{q.location_id[1]}</span>{q.lot_id && <span style={{ color: C.blue, marginLeft: 6 }}>{q.lot_id[1]}</span>}</div>
          <span style={{ fontWeight: 700, color: (q.quantity - (q.reserved_quantity||0)) > 0 ? C.green : C.orange }}>{q.quantity - (q.reserved_quantity||0)}</span>
        </div>
      ))}
    </Section>
  );
}

function LotResult({ lot, product, stock }: { lot: any; product: any; stock: any[] }) {
  const tQ = stock.reduce((s, q) => s + q.quantity, 0);
  const tR = stock.reduce((s, q) => s + (q.reserved_quantity || 0), 0);
  return (
    <Section>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Lot {lot.name}</div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>{product?.name}</div>
      <div style={{ display: "flex", gap: 1, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ flex: 1, padding: "10px", background: C.greenSoft, textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 800, color: C.green }}>{tQ - tR}</div><div style={{ fontSize: 10, color: C.textMuted }}>DISPO</div></div>
        <div style={{ flex: 1, padding: "10px", background: C.overlay, textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 800, color: C.textSec }}>{tQ}</div><div style={{ fontSize: 10, color: C.textMuted }}>STOCK</div></div>
      </div>
      {stock.map((q, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < stock.length - 1 ? `1px solid ${C.border}` : "", fontSize: 12 }}>
          <span style={{ fontWeight: 600 }}>{q.location_id[1]}</span>
          <span style={{ fontWeight: 700, color: C.green }}>{q.quantity - (q.reserved_quantity||0)}</span>
        </div>
      ))}
    </Section>
  );
}

function LocationResult({ location, stock, onRename }: { location: any; stock: any[]; onRename: (id: number, n: string) => void }) {
  return (
    <Section>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 2 }}>{location.name}</div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>{location.barcode || location.complete_name} · {stock.length} réf</div>
      {stock.map((q, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < stock.length - 1 ? `1px solid ${C.border}` : "", fontSize: 12 }}>
          <div><span style={{ fontWeight: 600 }}>{q.product_id[1]}</span>{q.lot_id && <span style={{ color: C.blue, marginLeft: 6 }}>{q.lot_id[1]}</span>}</div>
          <span style={{ fontWeight: 700, color: C.green }}>{q.quantity - (q.reserved_quantity||0)}</span>
        </div>
      ))}
    </Section>
  );
}

// ============================================
// LOGIN
// ============================================
function Login({ onLogin, loading, error }: { onLogin: (u: string, d: string, l: string, p: string) => void; loading: boolean; error: string }) {
  const cfg = typeof window !== "undefined" ? loadCfg() : null;
  const [url, setUrl] = useState(cfg?.u || ""); const [db, setDb] = useState(cfg?.d || "");
  const [user, setUser] = useState(""); const [pw, setPw] = useState("");
  const [showCfg, setShowCfg] = useState(!cfg);
  const go = () => { if (url && db && user && pw) onLogin(url, db, user, pw); };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ width: "100%", maxWidth: 400, padding: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text }}>WMS Scanner</h1>
          <p style={{ fontSize: 14, color: C.textMuted, marginTop: 4 }}>Connexion à votre entrepôt</p>
        </div>

        <Section>
          <button onClick={() => setShowCfg(!showCfg)} style={{ ...secondaryBtn, marginBottom: showCfg ? 12 : 0, fontSize: 12 }}>{showCfg ? "Masquer" : "Afficher"} la config serveur</button>
          {showCfg && <>
            <Field label="URL Odoo" value={url} onChange={setUrl} placeholder="https://monentreprise.odoo.com" />
            <Field label="Base de données" value={db} onChange={setDb} placeholder="nom_base" />
          </>}
          <Field label="Identifiant" value={user} onChange={setUser} placeholder="admin@company.com" />
          <Field label="Mot de passe" value={pw} onChange={setPw} placeholder="••••••••" type="password" onEnter={go} />
          {error && <Alert type="error">{error}</Alert>}
          <button onClick={go} disabled={loading} style={{ width: "100%", padding: 14, background: C.blue, color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: loading ? "wait" : "pointer", marginTop: 8, fontFamily: "inherit" }}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </Section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type, onEnter }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string; onEnter?: () => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4, display: "block" }}>{label}</label>
      <input type={type || "text"} style={inputStyle} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }} />
    </div>
  );
}

// ============================================
// STYLE CONSTANTS
// ============================================
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10,
  color: C.text, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
  transition: "border-color .15s",
};

const iconBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
};

const secondaryBtn: React.CSSProperties = {
  width: "100%", padding: 12, background: "none", color: C.blue, border: `1.5px solid ${C.border}`, borderRadius: 10,
  fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
};
