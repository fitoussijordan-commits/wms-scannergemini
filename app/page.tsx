'use client'
import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import clsx from 'clsx'
import DropZone from '@/components/DropZone'
import MetricCard from '@/components/MetricCard'
import PctBadge from '@/components/PctBadge'
import {
  parseTNT, parseOdoo, parseOdooExcel, crossData, computeStats,
  DEMO_TNT, DEMO_ODOO, DEPT_NAMES,
  type TNTRow, type OdooRow, type CrossedRow,
} from '@/lib/parsers'

const DistribChart = dynamic(() => import('@/components/Charts').then(m => ({ default: m.DistribChart })), { ssr: false })
const DeptChart    = dynamic(() => import('@/components/Charts').then(m => ({ default: m.DeptChart    })), { ssr: false })
const DonutChart   = dynamic(() => import('@/components/Charts').then(m => ({ default: m.DonutChart   })), { ssr: false })

type Tab = 'croise' | 'clients' | 'depts' | 'graphiques'

// ─── Table header helper ──────────────────────────────────────────────────────
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={clsx('px-3 py-2.5 text-xs font-medium text-white/40 uppercase tracking-wide whitespace-nowrap', right ? 'text-right' : 'text-left')}>
      {children}
    </th>
  )
}
function Td({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td className={clsx('px-3 py-2.5 text-sm text-white/80 border-t border-white/[0.05]', right ? 'text-right' : '', mono ? 'font-mono' : '')}>
      {children}
    </td>
  )
}

// ─── Bar row for dept/client charts ──────────────────────────────────────────
function BarRow({ label, value, max, sub }: { label: string; value: number; max: number; sub: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-white/40 min-w-[110px] truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/[0.06]">
        <div className="h-1.5 rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-white/70 min-w-[56px] text-right">{sub}</span>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [tntRows,  setTntRows]  = useState<TNTRow[]>([])
  const [odooRows, setOdooRows] = useState<OdooRow[]>([])
  const [tntName,  setTntName]  = useState('')
  const [odooName, setOdooName] = useState('')
  const [step, setStep]         = useState<1|2|3>(1)
  const [activeTab, setActiveTab] = useState<Tab>('croise')
  const [sortKey, setSortKey]   = useState<keyof CrossedRow>('pct')
  const [sortDir, setSortDir]   = useState<'asc'|'desc'>('desc')
  const [filter, setFilter]     = useState('')

  // ── Parse handlers ──────────────────────────────────────────────────────────
  async function handleTNT(content: string | ArrayBuffer, name: string) {
    setTntName(name)
    if (content instanceof ArrayBuffer && name.toLowerCase().endsWith('.pdf')) {
      // Parser le PDF via l'API serveur
      const blob = new Blob([content], { type: 'application/pdf' })
      const form = new FormData()
      form.append('file', blob, name)
      try {
        const res = await fetch('/api/parse-pdf', { method: 'POST', body: form })
        const data = await res.json()
        if (data.error) { alert('Erreur parsing PDF: ' + data.error); return }
        setTntRows(data.rows)
        if (data.rows.length > 0) setStep(s => Math.max(s, 2) as 1 | 2 | 3)
      } catch (e) {
        alert('Erreur réseau: ' + e)
      }
    } else {
      const text = content instanceof ArrayBuffer ? new TextDecoder().decode(content) : content
      const rows = parseTNT(text)
      setTntRows(rows)
      if (rows.length > 0) setStep(s => Math.max(s, 2) as 1 | 2 | 3)
    }
  }

  function handleOdoo(content: string | ArrayBuffer, name: string) {
    if (content instanceof ArrayBuffer) {
      parseOdooExcel(content).then(rows => {
        setOdooRows(rows)
        setOdooName(name)
        if (rows.length > 0) setStep(s => Math.max(s, 3) as 1 | 2 | 3)
      })
    } else {
      const rows = parseOdoo(content)
      setOdooRows(rows)
      setOdooName(name)
      if (rows.length > 0) setStep(s => Math.max(s, 3) as 1 | 2 | 3)
    }
  }
  function loadDemo() {
    handleTNT(DEMO_TNT, 'démo-tnt.txt')
    handleOdoo(DEMO_ODOO, 'démo-odoo.csv')
    setStep(3)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const crossed = useMemo(() => crossData(tntRows, odooRows), [tntRows, odooRows])
  const stats   = useMemo(() => computeStats(crossed), [crossed])

  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return crossed
      .filter(r => r.matched)
      .filter(r => !q || r.ref.toLowerCase().includes(q) || r.client.toLowerCase().includes(q) || DEPT_NAMES[r.dept]?.toLowerCase().includes(q))
      .sort((a, b) => {
        const av = a[sortKey] as number | string
        const bv = b[sortKey] as number | string
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'desc' ? bv - av : av - bv
        return sortDir === 'desc' ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
      })
  }, [crossed, filter, sortKey, sortDir])

  function toggleSort(key: keyof CrossedRow) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortTh({ k, children }: { k: keyof CrossedRow; children: React.ReactNode }) {
    const active = sortKey === k
    return (
      <th
        className={clsx('px-3 py-2.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap text-right cursor-pointer select-none transition-colors', active ? 'text-white/70' : 'text-white/35 hover:text-white/55')}
        onClick={() => toggleSort(k)}
      >
        {children} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
      </th>
    )
  }

  function canAnalyse() { return tntRows.length > 0 && odooRows.length > 0 }

  // ── Export CSV ───────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = 'Référence;Client;Département;Poids (kg);Transport HT (€);Commande HT (€);% Transport\n'
    const rows = filtered.map(r =>
      `${r.ref};${r.client};${DEPT_NAMES[r.dept] || r.dept};${r.weight.toFixed(2)};${r.transportHT.toFixed(2)};${r.commandeHT.toFixed(2)};${r.pct.toFixed(2)}%`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'analyse-transport.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-black/30 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-accent/20 flex items-center justify-center text-accent text-sm">⚡</div>
            <span className="font-semibold text-white/90 text-sm tracking-tight">TNT × Odoo</span>
            <span className="text-white/20 text-xs hidden sm:block">Analyse transport</span>
          </div>
          <button
            onClick={loadDemo}
            className="text-xs text-white/40 hover:text-white/70 transition-colors border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5"
          >
            Charger démo
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Step indicator ── */}
        <div className="flex items-center gap-0 mb-8">
          {(['Import TNT', 'Import Odoo', 'Analyse'] as const).map((label, i) => {
            const n = (i + 1) as 1|2|3
            const done  = step > n || (n === 1 && tntRows.length > 0) || (n === 2 && odooRows.length > 0) || (n === 3 && step === 3)
            const active = step === n
            return (
              <div key={n} className="flex items-center">
                {i > 0 && <div className={clsx('w-12 h-px', done ? 'bg-accent/40' : 'bg-white/[0.08]')} />}
                <button
                  className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all', active ? 'text-white bg-white/[0.07]' : done ? 'text-emerald-400 hover:bg-white/[0.04] cursor-pointer' : 'text-white/25 cursor-default')}
                  onClick={() => { if (done || n <= step) setStep(n) }}
                >
                  <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0', active ? 'bg-accent text-white' : done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.06] text-white/25')}>
                    {done && !active ? '✓' : n}
                  </span>
                  {label}
                </button>
              </div>
            )
          })}
        </div>

        {/* ── Step 1 & 2: Import ── */}
        {step < 3 && (
          <div className="animate-slide-up">
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {/* TNT */}
              <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-white/80">Facture TNT</h2>
                  {tntRows.length > 0 && <span className="text-xs text-emerald-400 font-medium">{tntRows.length} réf. extraites</span>}
                </div>
                <p className="text-xs text-white/30 mb-3">Fichier PDF FedEx/TNT — parsé automatiquement</p>
                <DropZone
                  label={tntName || 'Glissez votre fichier TNT'}
                  sublabel="TXT, CSV ou PDF parsé"
                  accept={{ 'application/pdf': ['.pdf'], 'text/*': ['.txt', '.csv'] }}
                  loaded={tntRows.length > 0}
                  onFile={handleTNT}
                  icon="📄"
                />
                {tntRows.length > 0 && (
                  <p className="text-xs text-white/30 mt-2">
                    Fichier : <span className="text-white/50">{tntName}</span>
                  </p>
                )}
              </div>

              {/* Odoo */}
              <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-white/80">Export Odoo</h2>
                  {odooRows.length > 0 && <span className="text-xs text-emerald-400 font-medium">{odooRows.length} commandes</span>}
                </div>
                <p className="text-xs text-white/30 mb-3">CSV avec colonnes : Référence (S…), Montant HT, Client</p>
                <DropZone
                  label={odooName || 'Glissez votre export Odoo'}
                  sublabel="CSV séparé par virgule ou point-virgule"
                  accept={{ 'text/*': ['.csv', '.txt'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }}
                  loaded={odooRows.length > 0}
                  onFile={handleOdoo}
                  icon="📊"
                />
                {odooRows.length > 0 && (
                  <p className="text-xs text-white/30 mt-2">
                    Fichier : <span className="text-white/50">{odooName}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Odoo export helper */}
            <div className="bg-white/[0.02] rounded-xl border border-white/[0.06] p-4 mb-6 text-xs text-white/40">
              <p className="font-medium text-white/60 mb-1.5">Comment exporter depuis Odoo</p>
              <p>Ventes → Commandes → Filtrer la période → Exporter → sélectionner : <code className="bg-white/[0.07] px-1 py-0.5 rounded text-white/60">Référence</code>, <code className="bg-white/[0.07] px-1 py-0.5 rounded text-white/60">Partenaire</code>, <code className="bg-white/[0.07] px-1 py-0.5 rounded text-white/60">Montant non taxé</code> → Format CSV</p>
            </div>

            <div className="flex justify-end">
              <button
                disabled={!canAnalyse()}
                onClick={() => setStep(3)}
                className={clsx('px-5 py-2.5 rounded-xl text-sm font-semibold transition-all', canAnalyse() ? 'bg-accent hover:bg-accent-dark text-white shadow-lg shadow-accent/20' : 'bg-white/[0.05] text-white/25 cursor-not-allowed')}
              >
                Analyser {tntRows.length > 0 && odooRows.length > 0 ? `(${Math.min(tntRows.length, odooRows.length)}+ croisements)` : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Dashboard ── */}
        {step === 3 && (
          <div className="animate-slide-up">
            {/* Metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <MetricCard label="Commandes croisées" value={String(stats.matchedCount)} sub={`${stats.tntOnlyCount} TNT seul · ${stats.odooOnlyCount} Odoo seul`} />
              <MetricCard label="% transport moyen" value={`${stats.avgPct.toFixed(1)}%`} sub="sur commande HT" accent />
              <MetricCard label="Coût moyen / colis" value={`${stats.avgTransportParColis.toFixed(2)} €`} sub="transport estimé HT" />
              <MetricCard label="Commandes > 10%" value={String(stats.over10Pct)} sub={`dont ${stats.over20Pct} > 20%`} danger={stats.over10Pct > 0} />
            </div>

            {/* Summary row */}
            <div className="grid sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
                <p className="text-xs text-white/35 mb-1">Total transport HT</p>
                <p className="text-xl font-semibold text-white">{stats.totalTransport.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
              </div>
              <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
                <p className="text-xs text-white/35 mb-1">Total commandes HT</p>
                <p className="text-xl font-semibold text-white">{stats.totalCommande.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
              </div>
              <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
                <p className="text-xs text-white/35 mb-1">Transport / CA total</p>
                <p className="text-xl font-semibold text-accent">{stats.avgPct.toFixed(2)}%</p>
                <div className="mt-2 h-1.5 rounded-full bg-white/[0.06]">
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(stats.avgPct * 3, 100)}%` }} />
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] overflow-hidden">
              {/* Tab nav */}
              <div className="flex border-b border-white/[0.06] overflow-x-auto">
                {([
                  { key: 'croise', label: 'Croisement' },
                  { key: 'clients', label: 'Top clients' },
                  { key: 'depts', label: 'Départements' },
                  { key: 'graphiques', label: 'Graphiques' },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={clsx('px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2', activeTab === t.key ? 'text-accent border-accent bg-accent/5' : 'text-white/40 border-transparent hover:text-white/60 hover:bg-white/[0.03]')}
                  >
                    {t.label}
                  </button>
                ))}
                <div className="flex-1" />
                <button onClick={exportCSV} className="px-4 text-xs text-white/30 hover:text-white/60 transition-colors whitespace-nowrap">
                  ↓ CSV
                </button>
                <button onClick={() => setStep(1)} className="px-4 text-xs text-white/30 hover:text-white/60 transition-colors whitespace-nowrap border-l border-white/[0.06]">
                  ← Reimporter
                </button>
              </div>

              {/* Tab content */}
              <div className="p-4">

                {/* ── Croisement ── */}
                {activeTab === 'croise' && (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <input
                        type="text"
                        placeholder="Rechercher par ref, client, département…"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-white/25 outline-none focus:border-white/20"
                      />
                      <span className="text-xs text-white/30">{filtered.length} lignes</span>
                    </div>
                    <div className="scroll-table rounded-lg overflow-hidden border border-white/[0.06]">
                      <table className="w-full">
                        <thead className="bg-white/[0.04] sticky top-0">
                          <tr>
                            <Th>Référence</Th>
                            <Th>Client</Th>
                            <Th>Dép.</Th>
                            <SortTh k="transportHT">Transport HT</SortTh>
                            <SortTh k="commandeHT">Commande HT</SortTh>
                            <SortTh k="pct">% Transport</SortTh>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(r => (
                            <tr key={r.ref} className="hover:bg-white/[0.03] transition-colors">
                              <Td mono><span className="text-white/50 bg-white/[0.06] px-1.5 py-0.5 rounded text-xs">{r.ref}</span></Td>
                              <Td><span className="max-w-[180px] block truncate" title={r.client}>{r.client || '—'}</span></Td>
                              <Td><span className="text-white/50 text-xs">{DEPT_NAMES[r.dept] || r.dept}</span></Td>
                              <Td right mono>{r.transportHT.toFixed(2)} €</Td>
                              <Td right mono>{r.commandeHT.toFixed(2)} €</Td>
                              <Td right><PctBadge pct={r.pct} /></Td>
                            </tr>
                          ))}
                          {filtered.length === 0 && (
                            <tr><td colSpan={6} className="text-center py-8 text-xs text-white/25">Aucun résultat</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── Top clients ── */}
                {activeTab === 'clients' && (
                  <div className="scroll-table rounded-lg overflow-hidden border border-white/[0.06]">
                    <table className="w-full">
                      <thead className="bg-white/[0.04]">
                        <tr>
                          <Th>Client</Th>
                          <Th>Colis</Th>
                          <Th>Transport total</Th>
                          <Th>CA total</Th>
                          <Th>% Transport</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.topClients.map(c => (
                          <tr key={c.client} className="hover:bg-white/[0.03] transition-colors">
                            <Td><span className="max-w-[200px] block truncate" title={c.client}>{c.client}</span></Td>
                            <Td right><span className="text-white/50">{c.count}</span></Td>
                            <Td right mono>{c.transport.toFixed(2)} €</Td>
                            <Td right mono>{c.commande.toFixed(2)} €</Td>
                            <Td right><PctBadge pct={c.pct} /></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── Départements ── */}
                {activeTab === 'depts' && (
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs font-semibold text-white/50 mb-3 uppercase tracking-wide">Livraisons par département</p>
                      {stats.topDepts.slice(0, 15).map(d => (
                        <BarRow key={d.dept} label={`${d.dept} — ${d.name}`} value={d.count} max={stats.topDepts[0]?.count || 1} sub={`${d.count} colis`} />
                      ))}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white/50 mb-3 uppercase tracking-wide">Coût transport par département</p>
                      {[...stats.topDepts].sort((a, b) => b.transport - a.transport).slice(0, 15).map(d => (
                        <BarRow key={d.dept} label={`${d.dept} — ${d.name}`} value={d.transport} max={Math.max(...stats.topDepts.map(x => x.transport)) || 1} sub={`${d.transport.toFixed(0)} €`} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Graphiques ── */}
                {activeTab === 'graphiques' && (
                  <div className="grid sm:grid-cols-3 gap-6">
                    <div>
                      <p className="text-xs font-semibold text-white/50 mb-3 uppercase tracking-wide">Distribution % transport</p>
                      <DistribChart distrib={stats.distrib} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white/50 mb-3 uppercase tracking-wide">Transport / département (top 8)</p>
                      <DeptChart topDepts={stats.topDepts} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white/50 mb-3 uppercase tracking-wide">Couverture croisement</p>
                      <DonutChart matched={stats.matchedCount} tntOnly={stats.tntOnlyCount} odooOnly={stats.odooOnlyCount} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
