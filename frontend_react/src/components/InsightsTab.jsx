import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { fetchInsights, markInsightRead } from '../api/client'

const PRIORITY_STYLE = {
  high:   { bar: '#f43f5e', bg: 'rgba(244,63,94,0.06)',  badge: 'bg-rose-100 text-rose-700',    border: 'rgba(244,63,94,0.2)'  },
  medium: { bar: '#f97316', bg: 'rgba(249,115,22,0.06)', badge: 'bg-orange-100 text-orange-700', border: 'rgba(249,115,22,0.2)' },
  low:    { bar: '#10b981', bg: 'rgba(16,185,129,0.06)', badge: 'bg-emerald-100 text-emerald-700',border: 'rgba(16,185,129,0.2)' },
}

const TYPE_BADGE = {
  trend:          'bg-blue-100 text-blue-700',
  anomaly:        'bg-red-100 text-red-700',
  alert:          'bg-orange-100 text-orange-700',
  recommendation: 'bg-emerald-100 text-emerald-700',
  opportunity:    'bg-violet-100 text-violet-700',
}

const cardContainer = {
  animate: {
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
}
const cardItem = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 24 } },
}

export default function InsightsTab({ user, onBadgeRefresh, onAskQuery }) {
  const [insights, setInsights] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setError(null)
    try { setInsights(await fetchInsights()) }
    catch { setError('Could not load insights. Please try again.') }
    finally { setLoading(false) }
  }

  const handleCardClick = async (insight) => {
    if (!insight.is_read) {
      try {
        await markInsightRead(insight.insight_id)
        setInsights(prev => prev.map(i =>
          i.insight_id === insight.insight_id ? { ...i, is_read: true } : i
        ))
        onBadgeRefresh()
      } catch { /* ignore */ }
    }
    if (insight.suggested_query) onAskQuery(insight.suggested_query)
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scroll-smooth-ios px-4 sm:px-6 py-5">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-lg font-black text-gradient leading-tight">Targeted Insights</h2>
            <p className="text-xs text-gray-400 mt-1">
              Personalised nudges for your role &amp; territory · refreshed every 6 hours
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs font-bold text-brand-600 px-3 py-1.5 rounded-xl transition-all hover:shadow-glow-sm"
            style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton h-36 rounded-2xl" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="text-center py-16 text-gray-400">
            <p className="mb-3 text-sm">{error}</p>
            <button onClick={load}
              className="text-brand-500 text-sm font-bold hover:underline">Try again</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && insights.length === 0 && (
          <div className="text-center py-16 max-w-sm mx-auto">
            <div className="text-5xl mb-4">🎯</div>
            {user?.sales_hierarchy_level ? (
              <>
                <p className="font-bold text-gray-600 text-sm">Insights are being generated…</p>
                <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                  The system generates targeted nudges for your role (<strong>{user.sales_hierarchy_level}</strong>) every 6 hours. Check back soon.
                </p>
              </>
            ) : (
              <>
                <p className="font-bold text-gray-600 text-sm">Targeted Insights are for the sales field team</p>
                <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                  This feed delivers role-specific nudges to <strong>SO → ASM → ZSM → NSM</strong> users.
                </p>
                <div className="mt-4 px-4 py-2.5 rounded-xl text-xs font-medium text-brand-700 bg-brand-50 border border-brand-100 inline-block">
                  Try: <span className="font-mono">nsm_rajesh / nsm123</span> or <span className="font-mono">so_field1 / so123</span>
                </div>
              </>
            )}
            <p className="mt-4 text-xs text-gray-400">
              Use <strong className="text-brand-500">Ask your own Q</strong> to explore data right now.
            </p>
          </div>
        )}

        {/* Cards grid */}
        {!loading && !error && insights.length > 0 && (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            variants={cardContainer}
            initial="initial"
            animate="animate"
          >
            {insights.map((ins) => (
              <motion.div key={ins.insight_id} variants={cardItem}>
                <InsightCard insight={ins} onClick={() => handleCardClick(ins)} />
              </motion.div>
            ))}
          </motion.div>
        )}

        {!loading && insights.length > 0 && (
          <p className="text-center text-[11px] text-gray-300 mt-6">Insights refresh every 6 hours</p>
        )}
      </div>
    </div>
  )
}

function InsightCard({ insight: ins, onClick }) {
  const isUnread = !ins.is_read
  const p = PRIORITY_STYLE[ins.priority] || PRIORITY_STYLE.low
  const typeBadge = TYPE_BADGE[ins.insight_type] || 'bg-gray-100 text-gray-600'
  const changePct = ins.metric_change_pct

  return (
    <motion.div
      onClick={onClick}
      className="relative rounded-2xl p-4 cursor-pointer select-none group"
      style={{
        background: `rgba(255,255,255,0.82)`,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${isUnread ? p.border : 'rgba(255,255,255,0.9)'}`,
        borderLeft: `4px solid ${p.bar}`,
        boxShadow: '0 2px 12px rgba(99,102,241,0.06)',
      }}
      whileHover={{ y: -5, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Unread dot with pulse */}
      {isUnread && (
        <motion.span
          className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-rose-500"
          animate={{ scale: [1, 1.4, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        />
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide ${typeBadge}`}>
          {ins.insight_type}
        </span>
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide
          ${ins.priority === 'high' ? 'bg-rose-100 text-rose-700'
          : ins.priority === 'medium' ? 'bg-orange-100 text-orange-700'
          : 'bg-emerald-100 text-emerald-700'}`}>
          {ins.priority}
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide bg-gray-100 text-gray-500">
          {ins.hierarchy_level}
        </span>
      </div>

      {/* Title */}
      <div className="text-sm font-black text-gray-800 mb-1 leading-snug">
        {ins.title}
        {changePct != null && (
          <span className={`ml-2 text-xs font-black ${changePct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {changePct >= 0 ? '↑' : '↓'}{Math.abs(changePct).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed mb-2.5">{ins.description}</p>

      {/* Action */}
      {ins.suggested_action && (
        <p className="text-xs font-bold text-brand-500 group-hover:text-brand-700 transition-colors">
          → {ins.suggested_action}
        </p>
      )}

      <p className="text-[10px] text-gray-300 mt-2 font-medium">Tap to explore in chat →</p>
    </motion.div>
  )
}
