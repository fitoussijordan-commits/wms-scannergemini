"use client";

import { useState, useEffect, useRef } from "react";
import * as odoo from "@/lib/odoo";

// ============================================
// THEME
// ============================================
const T = {
  bg: "#0a0f1a",
  surface: "#111827",
  surfaceLight: "#1a2236",
  border: "#1e2d45",
  accent: "#22d3ee",
  accentDim: "rgba(34,211,238,0.1)",
  success: "#34d399",
  successDim: "rgba(52,211,153,0.1)",
  warning: "#fbbf24",
  warningDim: "rgba(251,191,36,0.1)",
  danger: "#f87171",
  dangerDim: "rgba(248,113,113,0.1)",
  text: "#e2e8f0",
  textDim: "#64748b",
  textMuted: "#475569",
};

// ============================================
// ICONS
// ============================================
const Icon = {
  scan: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>,
  box: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  location: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  arrow: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  trash: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  warehouse: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
  lot: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>,
};

// ============================================
// MAIN APP
// ============================================
export default function Page() {
  const [screen, setScreen] = useState<"login" | "home" | "scan" | "confirm">("login");
  const [session, setSession] = useState<odoo.OdooSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scanFeedback, setScanFeedback] = useState<{ type: string; message: string } | null>(null);
  const [locations, setLocations] = useState<any[]>([]);

  // Transfer state
  const [sourceLocation, setSourceLocation] = useState<any>(null);
  const [destLocation, setDestLocation] = useState<any>(null);
  const [transferLines, setTransferLines] = useState<any[]>([]);
  const [lastProduct, setLastProduct] = useState<any>(null);
  const [lastLot, setLastLot] = useState<any>(null);
  const [stockInfo, setStockInfo] = useState<any[]>([]);

  // === HANDLERS ===

  const handleLogin = async (url: string, db: string, login: string, password: string) => {
    setLoading(true);
    setError("");
    try {
      const config = { url: url.replace(/\/$/, ""), db };
      const sess = await odoo.authenticate(config, login, password);
      setSession(sess);
      const locs = await odoo.getLocations(sess);
      setLocations(locs);
      setScreen("home");
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    setSession(null);
    setScreen("login");
    resetTransfer();
  };

  const resetTransfer = () => {
    setSourceLocation(null);
    setDestLocation(null);
    setTransferLines([]);
    setLastProduct(null);
    setLastLot(null);
    setStockInfo([]);
    setError("");
    setScanFeedback(null);
  };

  const startTransfer = () => {
    resetTransfer();
    setScreen("scan");
  };

  // === SMART SCAN ===
  const handleSmartScan = async (code: string) => {
    if (!code || !session) return;
    setLoading(true);
    setError("");
    setScanFeedback(null);
    setLastProduct(null);
    setLastLot(null);
    setStockInfo([]);

    try {
      const result = await odoo.smartScan(session, code);

      switch (result.type) {
        case "location":
          if (!sourceLocation) {
            setSourceLocation(result.data);
            setScanFeedback({ type: "success", message: `📍 Source : ${result.data.complete_name || result.data.name}` });
          } else if (!destLocation) {
            setDestLocation(result.data);
            setScanFeedback({ type: "success", message: `📍 Destination : ${result.data.complete_name || result.data.name}` });
          } else {
            setScanFeedback({ type: "info", message: `📍 Emplacement détecté : ${result.data.complete_name || result.data.name} (source et dest déjà définies)` });
          }
          break;

        case "product":
          if (!sourceLocation) {
            setScanFeedback({ type: "warning", message: "Scanne d'abord un emplacement source" });
            break;
          }
          setLastProduct(result.data);
          setScanFeedback({ type: "success", message: `📦 ${result.data.name} (${result.data.default_code || result.data.barcode})` });
          // Charger le stock sur l'emplacement source
          const quants = await odoo.getStockAtLocation(session, result.data.id, sourceLocation.id);
          setStockInfo(quants);
          break;

        case "lot":
          if (!sourceLocation) {
            setScanFeedback({ type: "warning", message: "Scanne d'abord un emplacement source" });
            break;
          }
          setLastProduct(result.data.product);
          setLastLot(result.data.lot);
          setScanFeedback({ type: "success", message: `🏷️ Lot ${result.data.lot.name} → ${result.data.product?.name || "Produit inconnu"}` });
          if (result.data.product) {
            const lotQuants = await odoo.getStockAtLocation(session, result.data.product.id, sourceLocation.id);
            setStockInfo(lotQuants);
          }
          break;

        case "not_found":
          setScanFeedback({ type: "error", message: `❌ "${code}" non reconnu (ni emplacement, ni produit, ni réf, ni lot)` });
          break;
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const selectLocation = (loc: any) => {
    if (!sourceLocation) {
      setSourceLocation(loc);
      setScanFeedback({ type: "success", message: `📍 Source : ${loc.complete_name || loc.name}` });
    } else if (!destLocation) {
      setDestLocation(loc);
      setScanFeedback({ type: "success", message: `📍 Destination : ${loc.complete_name || loc.name}` });
    }
  };

  const addLine = (qty: number) => {
    if (!lastProduct) return;
    setTransferLines((prev) => [...prev, {
      productId: lastProduct.id,
      productName: lastProduct.name,
      productCode: lastProduct.default_code,
      qty,
      uomId: lastProduct.uom_id[0],
      uomName: lastProduct.uom_id[1],
      lotId: lastLot?.id || null,
      lotName: lastLot?.name || null,
    }]);
    setLastProduct(null);
    setLastLot(null);
    setStockInfo([]);
    setScanFeedback(null);
  };

  const removeLine = (i: number) => setTransferLines((prev) => prev.filter((_, idx) => idx !== i));

  const handleValidate = async () => {
    if (!session || !sourceLocation || !destLocation || !transferLines.length) return;
    setLoading(true);
    setError("");
    try {
      const pickingId = await odoo.createInternalTransfer(
        session, sourceLocation.id, destLocation.id, transferLines
      );
      await odoo.validatePicking(session, pickingId);
      setScreen("confirm");
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  // === RENDER ===

  const baseStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: `linear-gradient(180deg, ${T.bg} 0%, #0d1424 100%)`,
    color: T.text,
    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    maxWidth: 480,
    margin: "0 auto",
  };

  // Determine current step
  const currentStep = !sourceLocation ? "source" : !destLocation ? "dest" : "product";

  // LOGIN
  if (screen === "login") return <LoginScreen onLogin={handleLogin} loading={loading} error={error} />;

  // CONFIRM
  if (screen === "confirm") return (
    <div style={baseStyle}>
      <Header name={session?.name} onLogout={handleLogout} />
      <div style={{ padding: 20, textAlign: "center", paddingTop: 60 }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: T.successDim, border: `2px solid ${T.success}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={T.success} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Transfert validé !</h2>
        <p style={{ color: T.textDim, fontSize: 13, marginBottom: 30 }}>
          {transferLines.length} ligne(s) • {sourceLocation?.name} → {destLocation?.name}
        </p>
        <button style={btnStyle()} onClick={startTransfer}>Nouveau transfert</button>
        <button style={btnSecondary()} onClick={() => setScreen("home")}>Retour accueil</button>
      </div>
    </div>
  );

  // HOME
  if (screen === "home") return (
    <div style={baseStyle}>
      <Header name={session?.name} onLogout={handleLogout} />
      <div style={{ padding: 20 }}>
        <div style={{ textAlign: "center", padding: "40px 0 30px" }}>
          <div style={{ color: T.accent, marginBottom: 16, display: "flex", justifyContent: "center" }}>{Icon.warehouse}</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>WMS Scanner</h1>
          <p style={{ color: T.textDim, fontSize: 13 }}>Scan intelligent — détecte tout automatiquement</p>
        </div>
        <button style={{ ...btnStyle(), display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }} onClick={startTransfer}>
          {Icon.scan} Nouveau transfert
        </button>
        <div style={cardStyle()}>
          <div style={labelStyle()}>Emplacements chargés</div>
          <p style={{ fontSize: 28, fontWeight: 700, color: T.accent, margin: 0 }}>{locations.length}</p>
        </div>
      </div>
    </div>
  );

  // SCAN SCREEN
  return (
    <div style={baseStyle}>
      <Header name={session?.name} onLogout={handleLogout} showBack onBack={() => { setScreen("home"); resetTransfer(); }} />
      <div style={{ padding: 20 }}>
        {/* Progress bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {(["source", "dest", "product"] as const).map((step, i) => (
            <div key={step} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: currentStep === step ? T.accent : (["source","dest","product"].indexOf(currentStep) > i ? T.success : T.border),
            }}/>
          ))}
        </div>

        {/* Location info */}
        {sourceLocation && (
          <div style={{ ...cardStyle(), display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
            <span style={{ color: T.success }}>{Icon.location}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.textDim }}>Source</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{sourceLocation.complete_name || sourceLocation.name}</div>
            </div>
            {destLocation && <>
              <span style={{ color: T.textMuted }}>{Icon.arrow}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: T.textDim }}>Dest</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{destLocation.complete_name || destLocation.name}</div>
              </div>
            </>}
          </div>
        )}

        {/* SINGLE SMART SCAN INPUT */}
        <SmartScanInput
          onScan={handleSmartScan}
          loading={loading}
          currentStep={currentStep}
          locations={locations}
          onSelectLocation={selectLocation}
        />

        {/* Scan feedback */}
        {scanFeedback && (
          <div style={{
            ...cardStyle(),
            background: scanFeedback.type === "success" ? T.successDim
              : scanFeedback.type === "warning" ? T.warningDim
              : scanFeedback.type === "error" ? T.dangerDim
              : T.accentDim,
            borderColor: scanFeedback.type === "success" ? "rgba(52,211,153,0.3)"
              : scanFeedback.type === "warning" ? "rgba(251,191,36,0.3)"
              : scanFeedback.type === "error" ? "rgba(248,113,113,0.3)"
              : "rgba(34,211,238,0.3)",
            color: scanFeedback.type === "success" ? T.success
              : scanFeedback.type === "warning" ? T.warning
              : scanFeedback.type === "error" ? T.danger
              : T.accent,
            fontSize: 13,
            textAlign: "center",
          }}>
            {scanFeedback.message}
          </div>
        )}

        {/* Error */}
        {error && <div style={{ ...cardStyle(), background: T.dangerDim, borderColor: "rgba(248,113,113,0.3)", color: T.danger, fontSize: 13, textAlign: "center" }}>{error}</div>}

        {/* Product + Stock */}
        {lastProduct && (
          <ProductStockCard product={lastProduct} lot={lastLot} stockInfo={stockInfo} sourceLocation={sourceLocation} onAdd={addLine} />
        )}

        {/* Transfer lines */}
        {transferLines.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={labelStyle()}>Lignes du transfert ({transferLines.length})</div>
            {transferLines.map((line, i) => (
              <div key={i} style={{ ...cardStyle(), display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                <span style={{ color: T.accent }}>{Icon.box}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{line.productName}</div>
                  <div style={{ fontSize: 11, color: T.textDim }}>
                    {line.productCode} • {line.qty} {line.uomName}
                    {line.lotName && <span style={{ color: T.accent }}> • Lot {line.lotName}</span>}
                  </div>
                </div>
                <button onClick={() => removeLine(i)} style={{ background: "transparent", border: "none", color: T.danger, cursor: "pointer", padding: 4 }}>{Icon.trash}</button>
              </div>
            ))}

            {!destLocation && (
              <div style={{ ...cardStyle(), background: T.warningDim, borderColor: "rgba(251,191,36,0.3)", color: T.warning, fontSize: 12, textAlign: "center" }}>
                Scanne un emplacement destination avant de valider
              </div>
            )}

            {destLocation && (
              <button
                style={{ ...btnStyle(`linear-gradient(135deg, ${T.success}, #10b981)`), marginTop: 12 }}
                onClick={handleValidate}
                disabled={loading}
              >
                {loading ? "Envoi..." : `Valider (${transferLines.length} ligne${transferLines.length > 1 ? "s" : ""})`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// SUB COMPONENTS
// ============================================

function Header({ name, onLogout, showBack, onBack }: { name?: string; onLogout: () => void; showBack?: boolean; onBack?: () => void }) {
  return (
    <div style={{
      padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
      borderBottom: `1px solid ${T.border}`, background: "rgba(17,24,39,0.8)", backdropFilter: "blur(20px)",
      position: "sticky", top: 0, zIndex: 100,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {showBack && <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.textDim, cursor: "pointer", padding: 0 }}>{Icon.back}</button>}
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: T.accent }}>⬡ WMS</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: T.textDim }}>{name}</span>
        <button onClick={onLogout} style={{ background: "transparent", border: "none", color: T.textDim, cursor: "pointer", padding: 0 }}>{Icon.logout}</button>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, loading, error }: { onLogin: (url: string, db: string, login: string, pw: string) => void; loading: boolean; error: string }) {
  const [url, setUrl] = useState("");
  const [db, setDb] = useState("");
  const [login, setLogin] = useState("");
  const [pw, setPw] = useState("");
  const [showConfig, setShowConfig] = useState(true);

  const submit = () => { if (url && db && login && pw) onLogin(url, db, login, pw); };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${T.bg} 0%, #0d1424 100%)`, color: T.text, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ padding: 20, paddingTop: 60 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: T.accentDim, border: `1px solid ${T.accent}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            {Icon.warehouse}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>WMS Scanner</h1>
          <p style={{ color: T.textDim, fontSize: 13 }}>Connexion Odoo</p>
        </div>

        <button style={btnSecondary()} onClick={() => setShowConfig(!showConfig)}>
          {showConfig ? "Masquer" : "Afficher"} config serveur
        </button>

        {showConfig && (
          <div style={{ ...cardStyle(), marginTop: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle()}>URL Odoo</label>
              <input style={inputStyle()} placeholder="https://monentreprise.odoo.com" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle()}>Base de données</label>
              <input style={inputStyle()} placeholder="nom_de_la_base" value={db} onChange={(e) => setDb(e.target.value)} />
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, marginBottom: 12 }}>
          <label style={labelStyle()}>Identifiant</label>
          <input style={inputStyle()} placeholder="admin@company.com" value={login} onChange={(e) => setLogin(e.target.value)} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle()}>Mot de passe</label>
          <input style={inputStyle()} type="password" placeholder="••••••••" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>

        {error && <div style={{ ...cardStyle(), background: T.dangerDim, borderColor: "rgba(248,113,113,0.3)", color: T.danger, fontSize: 13, textAlign: "center", marginBottom: 16 }}>{error}</div>}

        <button style={btnStyle()} onClick={submit} disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </div>
    </div>
  );
}

function SmartScanInput({ onScan, loading, currentStep, locations, onSelectLocation }: any) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => { ref.current?.focus(); }, [currentStep]);

  const hints: Record<string, string> = {
    source: "Scanne un emplacement source, une réf, un code-barres, ou un lot...",
    dest: "Scanne un emplacement destination, ou continue avec les produits...",
    product: "Scanne un produit, une réf, un lot, ou un emplacement...",
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && value.trim()) {
      onScan(value.trim());
      setValue("");
    }
  };

  const filtered = locations.filter((l: any) =>
    (l.complete_name || l.name).toLowerCase().includes(filter.toLowerCase()) ||
    (l.barcode && l.barcode.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <label style={{ ...labelStyle(), marginBottom: 0 }}>Scan intelligent</label>
        {loading && <span style={{ fontSize: 11, color: T.accent, animation: "pulse 1s infinite" }}>Recherche...</span>}
      </div>
      <input
        ref={ref}
        style={{
          width: "100%", padding: "16px 20px", background: T.surfaceLight,
          border: `2px solid ${T.accent}`, borderRadius: 12, color: T.text,
          fontSize: 18, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const,
          textAlign: "center" as const, letterSpacing: "0.1em",
          boxShadow: `0 0 20px ${T.accentDim}`,
        }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Code-barres / Réf / Lot..."
        autoFocus
      />
      <p style={{ fontSize: 11, color: T.textMuted, textAlign: "center", marginTop: 6 }}>
        {hints[currentStep]}
      </p>

      {/* Manual location picker */}
      <button style={{ ...btnSecondary(), marginTop: 4, fontSize: 12 }} onClick={() => setShowPicker(!showPicker)}>
        {showPicker ? "Fermer" : "Choisir un emplacement manuellement"}
      </button>
      {showPicker && (
        <div style={{ ...cardStyle(), marginTop: 8, maxHeight: 200, overflowY: "auto" as const }}>
          <input style={{ ...inputStyle(), marginBottom: 8, fontSize: 12 }} placeholder="Filtrer..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          {filtered.slice(0, 20).map((loc: any) => (
            <button key={loc.id} onClick={() => { onSelectLocation(loc); setShowPicker(false); setFilter(""); }}
              style={{ display: "block", width: "100%", padding: "8px 10px", background: "transparent", border: "none", borderBottom: `1px solid ${T.border}`, color: T.text, fontSize: 12, textAlign: "left" as const, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontWeight: 600 }}>{loc.complete_name || loc.name}</span>
              {loc.barcode && <span style={{ color: T.textDim, marginLeft: 8 }}>[{loc.barcode}]</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductStockCard({ product, lot, stockInfo, sourceLocation, onAdd }: any) {
  const [qty, setQty] = useState("1");
  const totalStock = stockInfo.reduce((s: number, q: any) => s + q.quantity, 0);
  const totalReserved = stockInfo.reduce((s: number, q: any) => s + (q.reserved_quantity || 0), 0);
  const available = totalStock - totalReserved;

  return (
    <div style={{ ...cardStyle(), border: `1px solid rgba(34,211,238,0.3)` }}>
      {/* Product info */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{Icon.box}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{product.name}</div>
          <div style={{ fontSize: 11, color: T.textDim }}>
            {product.default_code && <span>Réf: {product.default_code} • </span>}
            {product.barcode && <span>EAN: {product.barcode}</span>}
          </div>
          {lot && (
            <div style={{ fontSize: 11, color: T.accent, marginTop: 2 }}>
              🏷️ Lot: {lot.name}
            </div>
          )}
        </div>
      </div>

      {/* STOCK INFO */}
      <div style={{
        background: available > 0 ? T.successDim : T.warningDim,
        border: `1px solid ${available > 0 ? "rgba(52,211,153,0.3)" : "rgba(251,191,36,0.3)"}`,
        borderRadius: 8, padding: "12px 14px", marginBottom: 14,
      }}>
        <div style={{ fontSize: 11, color: T.textDim, marginBottom: 6 }}>Stock sur {sourceLocation?.name}</div>
        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: available > 0 ? T.success : T.warning }}>{available}</div>
            <div style={{ fontSize: 10, color: T.textDim }}>Disponible</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.textDim }}>{totalStock}</div>
            <div style={{ fontSize: 10, color: T.textDim }}>En stock</div>
          </div>
          {totalReserved > 0 && <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.warning }}>{totalReserved}</div>
            <div style={{ fontSize: 10, color: T.textDim }}>Réservé</div>
          </div>}
        </div>
        {stockInfo.length > 1 && (
          <div style={{ marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Par lot :</div>
            {stockInfo.map((q: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                <span>{q.lot_id ? q.lot_id[1] : "Sans lot"}</span>
                <span style={{ color: T.accent, fontWeight: 600 }}>{q.quantity - (q.reserved_quantity || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Qty + add */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle()}>Quantité</label>
          <input style={{ ...inputStyle(), textAlign: "center" as const, fontSize: 16, fontWeight: 700 }} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button style={{ ...btnStyle(), width: "auto", padding: "12px 20px", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => { if (parseFloat(qty) > 0) onAdd(parseFloat(qty)); }}>
            {Icon.check} OK
          </button>
        </div>
      </div>
      {available <= 0 && <div style={{ marginTop: 8, fontSize: 11, color: T.warning, textAlign: "center" as const }}>Stock insuffisant sur cet emplacement</div>}
    </div>
  );
}

// === STYLE HELPERS ===
function cardStyle(): React.CSSProperties {
  return { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginBottom: 12 };
}
function labelStyle(): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: T.textDim, marginBottom: 6, display: "block" };
}
function inputStyle(): React.CSSProperties {
  return { width: "100%", padding: "12px 16px", background: T.surfaceLight, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };
}
function btnStyle(bg?: string): React.CSSProperties {
  return { width: "100%", padding: "14px", background: bg || `linear-gradient(135deg, ${T.accent}, #06b6d4)`, color: "#000", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.03em", textTransform: "uppercase" as const };
}
function btnSecondary(): React.CSSProperties {
  return { width: "100%", padding: "12px", background: "transparent", color: T.accent, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginTop: 10 };
}
