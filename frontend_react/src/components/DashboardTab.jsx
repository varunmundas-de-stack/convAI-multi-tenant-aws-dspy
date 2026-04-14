import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import { fetchDashboard, fetchDrilldown } from '../api/client'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title, Tooltip, Legend, Filler,
)

// ── Vivid palette ─────────────────────────────────────────────────────────────
const PALETTE = [
  { bg: 'rgba(99,102,241,0.82)',  border: '#6366f1' },
  { bg: 'rgba(168,85,247,0.82)',  border: '#a855f7' },
  { bg: 'rgba(20,184,166,0.82)',  border: '#14b8a6' },
  { bg: 'rgba(249,115,22,0.82)',  border: '#f97316' },
  { bg: 'rgba(236,72,153,0.82)',  border: '#ec4899' },
  { bg: 'rgba(234,179,8,0.82)',   border: '#eab308' },
  { bg: 'rgba(16,185,129,0.82)',  border: '#10b981' },
  { bg: 'rgba(14,165,233,0.82)',  border: '#0ea5e9' },
]

// ── KPI card styles ───────────────────────────────────────────────────────────
const KPI_CARDS = [
  {
    kind: 'sales',
    label: 'Total Sales',
    icon: '💰',
    gradient: 'linear-gradient(135deg, #047857 0%, #10b981 60%, #34d399 100%)',
    shadow: '0 8px 32px rgba(16,185,129,0.4)',
  },
  {
    kind: 'invoices',
    label: 'Invoices',
    icon: '🧾',
    gradient: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 60%, #38bdf8 100%)',
    shadow: '0 8px 32px rgba(14,165,233,0.4)',
  },
  {
    kind: 'brand',
    label: 'Top Brand',
    icon: '🏆',
    gradient: 'linear-gradient(135deg, #5b21b6 0%, #8b5cf6 60%, #a78bfa 100%)',
    shadow: '0 8px 32px rgba(139,92,246,0.4)',
  },
  {
    kind: 'region',
    label: 'Top Region',
    icon: '📍',
    gradient: 'linear-gradient(135deg, #b45309 0%, #f59e0b 60%, #fbbf24 100%)',
    shadow: '0 8px 32px rgba(245,158,11,0.4)',
  },
]

// ── Formatting ────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—'
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)} L`
  return `₹${Number(n).toLocaleString('en-IN')}`
}
function fmtTick(v) {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `${(v / 1_000).toFixed(0)}K`
  return v
}

const hoverCursor = {
  onHover: (evt, els) => {
    const t = evt?.native?.target
    if (t) t.style.cursor = els.length ? 'pointer' : 'default'
  },
}

// ── useCountUp hook ───────────────────────────────────────────────────────────
function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0)
  const triggered = useRef(false)

  useEffect(() => {
    if (target == null || typeof target !== 'number' || triggered.current) return
    triggered.current = true
    const start = performance.now()

    const tick = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration])

  return value
}

// ── Framer motion variants ────────────────────────────────────────────────────
const kpiContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
}
const kpiItem = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ cfg, value, rawValue, loading }) {
  const salesCount  = useCountUp(cfg.kind === 'sales'    ? rawValue : null)
  const invoiceCount = useCountUp(cfg.kind === 'invoices' ? rawValue : null)

  if (loading) {
    return <div className="skeleton rounded-2xl h-28" />
  }

  let displayValue = value
  if (cfg.kind === 'sales' && typeof rawValue === 'number') {
    displayValue = fmt(salesCount)
  } else if (cfg.kind === 'invoices' && typeof rawValue === 'number') {
    displayValue = invoiceCount.toLocaleString('en-IN')
  }

  return (
    <div
      className="rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden cursor-default select-none"
      style={{ background: cfg.gradient, boxShadow: cfg.shadow }}
    >
      {/* Background pattern */}
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-10"
           style={{ background: 'rgba(255,255,255,0.5)' }} />
      <div className="absolute -right-2 bottom-2 w-14 h-14 rounded-full opacity-10"
           style={{ background: 'rgba(255,255,255,0.5)' }} />

      <div className="flex items-center justify-between relative">
        <span className="text-[11px] font-bold text-white/70 uppercase tracking-widest">{cfg.label}</span>
        <span className="text-lg">{cfg.icon}</span>
      </div>
      <div className="text-white font-black text-2xl leading-tight truncate relative mt-1">{displayValue}</div>
    </div>
  )
}

// ── Glass Chart Card ──────────────────────────────────────────────────────────
function ChartCard({ title, hint, accentColor = '#6366f1', loading, children }) {
  if (loading) {
    return (
      <div className="rounded-2xl p-5 h-full skeleton min-h-[280px]" />
    )
  }
  return (
    <div
      className="rounded-2xl p-5 h-full flex flex-col transition-all duration-300 hover:shadow-card-hover"
      style={{
        background: 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.9)',
        boxShadow: '0 4px 24px rgba(99,102,241,0.07), 0 1px 0 rgba(255,255,255,0.9) inset',
        borderTop: `3px solid ${accentColor}`,
      }}
    >
      <div className="mb-3 flex-shrink-0">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {hint && (
          <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
            </svg>
            {hint}
          </p>
        )}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}

// ── Drilldown Panel ───────────────────────────────────────────────────────────
const TYPE_LABELS = {
  brand_skus:     'Brand → SKUs',
  channel_brands: 'Channel → Brands',
  week_days:      'Week → Daily',
}

function DrilldownPanel({ state, onClose }) {
  if (!state) return null
  const { drillType, title, items, loading, error } = state

  const miniChartData = items?.length ? {
    labels: items.map(r => r.label),
    datasets: [{
      data:            items.map(r => r.sales),
      backgroundColor: items.map((_, i) => PALETTE[i % PALETTE.length].bg),
      borderColor:     items.map((_, i) => PALETTE[i % PALETTE.length].border),
      borderWidth: 2, borderRadius: 4,
    }],
  } : null

  const miniOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed.x)}` } },
    },
    scales: {
      x: { display: false, beginAtZero: true },
      y: { ticks: { font: { size: 10 }, color: '#6b7280' }, grid: { display: false } },
    },
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 animate-fade-in"
        style={{ background: 'rgba(17,12,46,0.45)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 h-full w-full sm:w-[420px] z-50 flex flex-col animate-slide-in-right"
        style={{
          background: 'rgba(255,255,255,0.94)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderLeft: '1px solid rgba(255,255,255,0.9)',
          boxShadow: '-8px 0 40px rgba(99,102,241,0.15)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06))',
            borderBottom: '1px solid rgba(99,102,241,0.1)',
          }}
        >
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1">
              <span>Dashboard</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-semibold text-brand-500">{TYPE_LABELS[drillType]}</span>
            </div>
            <h3 className="text-sm font-black text-gray-800 leading-snug truncate">
              {loading ? 'Loading…' : title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none"
            style={{ background: 'rgba(0,0,0,0.05)' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scroll-smooth-ios">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
              <span className="text-xs text-gray-400">Fetching detail…</span>
            </div>
          )}

          {!loading && error && (
            <div className="p-5">
              <div className="rounded-2xl p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200">{error}</div>
            </div>
          )}

          {!loading && !error && items?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <span className="text-4xl mb-3">🔍</span>
              <span className="text-sm font-medium">No data for this selection</span>
            </div>
          )}

          {!loading && !error && items?.length > 0 && (
            <>
              {/* Mini chart */}
              <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(99,102,241,0.08)' }}>
                <div style={{ height: Math.min(items.length * 30 + 20, 230) }}>
                  <Bar data={miniChartData} options={miniOptions} />
                </div>
              </div>

              {/* Table */}
              <div className="p-5">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(99,102,241,0.1)' }}>
                      <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide pb-2.5 pr-3 w-6">#</th>
                      <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide pb-2.5">Name</th>
                      <th className="text-right text-[10px] font-bold text-gray-400 uppercase tracking-wide pb-2.5">Sales</th>
                      <th className="text-right text-[10px] font-bold text-gray-400 uppercase tracking-wide pb-2.5 pl-3 w-20">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i} className="group" style={{ borderBottom: '1px solid rgba(99,102,241,0.05)' }}>
                        <td className="py-3 pr-3 text-[11px] text-gray-300 font-mono">{i + 1}</td>
                        <td className="py-3 pr-2">
                          <div className="text-xs font-bold text-gray-800 leading-tight">{item.label}</div>
                          <div className="text-[10px] text-gray-400">{item.invoices} invoices</div>
                        </td>
                        <td className="py-3 text-right text-xs font-black text-gray-900 whitespace-nowrap">{fmt(item.sales)}</td>
                        <td className="py-3 pl-3">
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="text-[11px] font-bold text-gray-500">{item.pct}%</span>
                            <div className="w-14 h-1.5 rounded-full overflow-hidden bg-gray-100">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${item.pct}%`,
                                  background: PALETTE[i % PALETTE.length].border,
                                  transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-gray-300 mt-5 text-center">Last 30 days · {items.length} results</p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main DashboardTab ─────────────────────────────────────────────────────────
export default function DashboardTab() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [drilldown, setDrilldown] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await fetchDashboard()
      if (d.error) throw new Error(d.error)
      setData(d)
    } catch (e) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openDrilldown = useCallback(async (drillType, value) => {
    setDrilldown({ drillType, title: '', items: [], loading: true, error: null })
    try {
      const result = await fetchDrilldown(drillType, value)
      if (result.error) throw new Error(result.error)
      setDrilldown(prev => ({ ...prev, title: result.title, items: result.items, loading: false }))
    } catch (e) {
      setDrilldown(prev => ({ ...prev, loading: false, error: e.message }))
    }
  }, [])

  // ── Chart configs ───────────────────────────────────────────────────────────
  const brandChartData = data ? {
    labels: data.by_brand.map(r => r.brand_name),
    datasets: [{
      label: 'Net Sales',
      data:  data.by_brand.map(r => r.sales),
      backgroundColor: data.by_brand.map((_, i) => PALETTE[i % PALETTE.length].bg),
      borderColor:     data.by_brand.map((_, i) => PALETTE[i % PALETTE.length].border),
      borderWidth: 2, borderRadius: 6, borderSkipped: false,
    }],
  } : null

  const brandOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    onClick: (_, els) => { if (els.length && data) openDrilldown('brand_skus', data.by_brand[els[0].index].brand_name) },
    ...hoverCursor,
    scales: {
      x: {
        beginAtZero: true,
        ticks: { font: { size: 10 }, color: '#9ca3af', callback: fmtTick },
        grid: { color: 'rgba(99,102,241,0.05)' },
      },
      y: {
        ticks: { font: { size: 10, weight: '600' }, color: '#4b5563' },
        grid: { display: false },
      },
    },
  }

  const trendChartData = data ? {
    labels: data.trend.map(r => r.week),
    datasets: [{
      label: 'Net Sales',
      data:  data.trend.map(r => r.sales),
      backgroundColor: 'rgba(99,102,241,0.10)',
      borderColor: '#6366f1',
      borderWidth: 2.5,
      fill: true,
      tension: 0.45,
      pointRadius: 5,
      pointHoverRadius: 8,
      pointBackgroundColor: '#6366f1',
      pointBorderColor: '#fff',
      pointBorderWidth: 2.5,
    }],
  } : null

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    onClick: (_, els) => { if (els.length && data) openDrilldown('week_days', data.trend[els[0].index].week) },
    ...hoverCursor,
    scales: {
      y: {
        beginAtZero: true,
        ticks: { font: { size: 10 }, color: '#9ca3af', callback: fmtTick },
        grid: { color: 'rgba(99,102,241,0.06)' },
      },
      x: {
        ticks: { font: { size: 10 }, color: '#9ca3af', maxRotation: 30 },
        grid: { display: false },
      },
    },
  }

  const channelChartData = data ? {
    labels: data.by_channel.map(r => r.channel_name),
    datasets: [{
      data:            data.by_channel.map(r => r.sales),
      backgroundColor: data.by_channel.map((_, i) => PALETTE[i % PALETTE.length].bg),
      borderColor:     data.by_channel.map((_, i) => PALETTE[i % PALETTE.length].border),
      borderWidth: 2.5,
      hoverOffset: 10,
    }],
  } : null

  const channelOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: { font: { size: 11, weight: '600' }, padding: 12, color: '#4b5563' },
      },
      tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtTick(ctx.parsed)}` } },
    },
    onClick: (_, els) => { if (els.length && data) openDrilldown('channel_brands', data.by_channel[els[0].index].channel_name) },
    ...hoverCursor,
  }

  // ── KPI values ─────────────────────────────────────────────────
  const kpiValues = data ? [
    fmt(data.kpis.total_sales),
    data.kpis.total_invoices.toLocaleString('en-IN'),
    data.kpis.top_brand,
    data.kpis.top_region,
  ] : ['—', '—', '—', '—']

  const kpiRaw = data ? [
    data.kpis.total_sales,
    data.kpis.total_invoices,
    null,
    null,
  ] : [null, null, null, null]

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scroll-smooth-ios p-4 sm:p-5 space-y-4">

      {/* ── Title row ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-gradient leading-tight">Sales Dashboard</h2>
          <p className="text-xs text-gray-400 mt-0.5">Last 30 days · click any chart to explore</p>
        </div>
        <motion.button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-bold text-brand-600 px-3.5 py-2 rounded-xl disabled:opacity-40"
          style={{
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(99,102,241,0.2)',
            backdropFilter: 'blur(12px)',
          }}
          whileTap={{ rotate: 360 }}
          transition={{ duration: 0.5 }}
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </motion.button>
      </div>

      {/* ── Error ────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-2xl p-4 flex items-center justify-between animate-scale-in"
             style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <span className="text-sm text-red-600 font-medium">{error}</span>
          <button onClick={load} className="text-xs font-bold text-red-500 underline ml-4">Retry</button>
        </div>
      )}

      {/* ── KPI grid ─────────────────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        variants={kpiContainer}
        initial="initial"
        animate="animate"
      >
        {KPI_CARDS.map((cfg, i) => (
          <motion.div key={cfg.kind} variants={kpiItem}>
            <KpiCard cfg={cfg} value={kpiValues[i]} rawValue={kpiRaw[i]} loading={loading} />
          </motion.div>
        ))}
      </motion.div>

      {/* ── Brand bar + Channel doughnut ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          className="md:col-span-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 24 }}
        >
          <ChartCard
            title="Sales by Brand — Top 8"
            hint="Click a bar to see SKU breakdown"
            accentColor="#6366f1"
            loading={loading}
          >
            {brandChartData && (
              <div style={{ height: 268 }}>
                <Bar data={brandChartData} options={brandOptions} />
              </div>
            )}
          </ChartCard>
        </motion.div>
        <motion.div
          className="md:col-span-1"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, type: 'spring', stiffness: 260, damping: 24 }}
        >
          <ChartCard
            title="Sales by Channel"
            hint="Click a segment to see brands"
            accentColor="#a855f7"
            loading={loading}
          >
            {channelChartData && (
              <div style={{ height: 268 }}>
                <Doughnut data={channelChartData} options={channelOptions} />
              </div>
            )}
          </ChartCard>
        </motion.div>
      </div>

      {/* ── Weekly trend ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.26, type: 'spring', stiffness: 260, damping: 24 }}
      >
        <ChartCard
          title="Weekly Sales Trend — Last 8 Weeks"
          hint="Click a data point to see daily breakdown"
          accentColor="#14b8a6"
          loading={loading}
        >
          {trendChartData && (
            <div style={{ height: 200 }}>
              <Line data={trendChartData} options={trendOptions} />
            </div>
          )}
        </ChartCard>
      </motion.div>

      {/* Drill-down panel */}
      <DrilldownPanel state={drilldown} onClose={() => setDrilldown(null)} />
    </div>
  )
}
