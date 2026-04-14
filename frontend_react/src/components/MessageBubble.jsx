import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import DataChart from './DataChart'

const springTransition = { type: 'spring', stiffness: 300, damping: 28 }

export default function MessageBubble({ message }) {
  if (message.isWelcome) return <WelcomeCard name={message.name} client={message.client} />
  if (message.role === 'user') return <UserBubble text={message.text} />
  return <AssistantBubble message={message} />
}

function UserBubble({ text }) {
  return (
    <motion.div
      className="flex justify-end"
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={springTransition}
    >
      <div className="max-w-[75%]">
        <div
          className="text-white px-4 py-2.5 rounded-2xl rounded-br-sm text-sm"
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #9333ea)',
            boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
          }}
        >
          {text}
        </div>
        <p className="text-[10px] text-gray-300 mt-1 text-right">{timestamp()}</p>
      </div>
    </motion.div>
  )
}

function AssistantBubble({ message }) {
  const { data, error, isFirstAnswer } = message
  const [copied, setCopied] = useState(false)

  // Confetti on first answer
  useEffect(() => {
    if (isFirstAnswer && data?.success) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#a855f7', '#ec4899', '#14b8a6'],
      })
    }
  }, [isFirstAnswer, data?.success])

  const handleCopy = () => {
    const text = data?.response
      ? data.response.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : ''
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  if (error) {
    return (
      <motion.div
        className="flex gap-2"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={springTransition}
      >
        <BotAvatar />
        <div
          className="max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm"
          style={{
            background: 'rgba(254,242,242,0.9)',
            border: '1px solid rgba(252,165,165,0.5)',
            color: '#b91c1c',
            backdropFilter: 'blur(12px)',
          }}
        >
          {error}
        </div>
      </motion.div>
    )
  }

  if (!data) return null
  const { success, response, raw_data, metadata, query_type } = data

  return (
    <motion.div
      className="flex gap-2"
      initial={{ x: -30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={springTransition}
    >
      <BotAvatar />
      <div className="max-w-[88%] space-y-2">
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-3 relative group"
          style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 2px 16px rgba(99,102,241,0.07)',
          }}
        >
          {/* Copy button — appears on hover */}
          {data?.response && (
            <motion.button
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy response'}
              className="absolute top-2.5 right-2.5 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{
                background: copied ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.04)',
                color: copied ? '#10b981' : '#9ca3af',
              }}
              whileTap={{ scale: 0.8 }}
            >
              {copied ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </motion.button>
          )}
          {/* Natural summary for multi-row data */}
          {raw_data?.length > 0 && query_type !== 'diagnostic' && (
            <NaturalSummary data={raw_data} />
          )}

          {/* Main response HTML — overflow-x-auto ensures wide tables scroll on mobile */}
          {response && (
            <div className="overflow-x-auto">
              <div
                className="text-sm text-gray-700 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: success ? response : `<span class="text-red-600">${response}</span>` }}
              />
            </div>
          )}

          {/* Chart */}
          {raw_data?.length >= 2 && query_type !== 'diagnostic' && (
            <DataChart data={raw_data} />
          )}

          {/* CSV export */}
          {raw_data?.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => downloadCSV(raw_data)}
                className="text-xs text-gray-400 hover:text-emerald-600 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </button>
            </div>
          )}


          {/* Metadata footer */}
          {metadata && (
            <p className="text-[10px] text-gray-300 mt-2 pt-2 border-t border-gray-100/80">
              Intent: {metadata.intent} · Confidence: {((metadata.confidence || 0) * 100).toFixed(0)}% · {metadata.exec_time_ms?.toFixed(0)}ms
            </p>
          )}
        </div>
        <p className="text-[10px] text-gray-300 ml-1">{timestamp()}</p>
      </div>
    </motion.div>
  )
}

function NaturalSummary({ data }) {
  if (!data?.length) return null
  const cols  = Object.keys(data[0])
  const count = data.length

  const numCols = cols.filter(c => typeof data[0][c] === 'number')
  const strCols = cols.filter(c => typeof data[0][c] === 'string')

  const valCol = numCols.length === 0 ? null
    : numCols.reduce((best, c) => {
        const avg = data.reduce((s, r) => s + Math.abs(r[c] ?? 0), 0) / data.length
        const bestAvg = data.reduce((s, r) => s + Math.abs(r[best] ?? 0), 0) / data.length
        return avg > bestAvg ? c : best
      })

  const dimCol = strCols[0] ?? numCols.find(c => c !== valCol) ?? null

  if (!valCol) return null

  const fmt = (n) => {
    if (typeof n !== 'number') return String(n ?? '')
    if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`
    if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`
    return n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  }

  const peakRow = count === 1 ? data[0]
    : [...data].sort((a, b) => (b[valCol] ?? 0) - (a[valCol] ?? 0))[0]

  const dimVal = dimCol ? peakRow[dimCol] : null
  const numVal = peakRow[valCol]

  const label = dimVal == null ? null
    : typeof dimVal === 'number'
      ? `${dimCol.charAt(0).toUpperCase() + dimCol.slice(1)} ${dimVal}`
      : String(dimVal)

  const BANNER = {
    background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))',
    borderLeft: '3px solid #6366f1',
  }

  if (count === 1) {
    return (
      <div className="mb-2 px-3 py-2 rounded-xl text-sm" style={BANNER}>
        {label && <span className="text-gray-500">{label}: </span>}
        <span className="font-black text-brand-600">{fmt(numVal)}</span>
      </div>
    )
  }

  return (
    <div className="mb-2 px-3 py-2 rounded-xl text-sm text-gray-600" style={BANNER}>
      Found <strong>{count}</strong> results
      {label
        ? <> · Top: <strong>{label}</strong> — <span className="font-black text-brand-600">{fmt(numVal)}</span></>
        : <> · Peak: <span className="font-black text-brand-600">{fmt(numVal)}</span></>
      }
    </div>
  )
}

function BotAvatar() {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{
        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
        boxShadow: '0 2px 10px rgba(99,102,241,0.4)',
      }}
    >
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    </div>
  )
}

function WelcomeCard({ name, client }) {
  return (
    <motion.div
      className="flex gap-2"
      initial={{ x: -30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={springTransition}
    >
      <BotAvatar />
      <div
        className="rounded-2xl rounded-tl-sm overflow-hidden max-w-[88%]"
        style={{
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        <div className="px-4 pt-4 pb-1">
          <p className="text-sm font-semibold text-gray-800">Hello, {name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Welcome to <span className="font-medium text-gray-700">{client} Analytics</span>. How can I help you today?
          </p>
        </div>

        <div className="px-4 pb-4 pt-3 text-xs space-y-2">
          <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.06)', borderLeft: '2px solid #10b981' }}>
            <p className="font-semibold text-gray-600 mb-1">You can ask about:</p>
            <ul className="text-gray-500 space-y-0.5 list-disc list-inside">
              <li>{client} sales, brands, SKUs and products</li>
              <li>Distribution channels and customer insights</li>
              <li>Time-based trends and performance metrics</li>
              <li>Diagnostic analysis (e.g. why did sales change)</li>
            </ul>
          </div>
          <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(244,63,94,0.05)', borderLeft: '2px solid #f43f5e' }}>
            <p className="font-semibold text-gray-600 mb-1">Out of scope:</p>
            <ul className="text-gray-500 space-y-0.5 list-disc list-inside">
              <li>Other companies' data</li>
              <li>Database metadata or schema information</li>
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function downloadCSV(data) {
  if (!data?.length) return
  const headers = Object.keys(data[0])
  const escape  = (v) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = [headers.join(','), ...data.map(row => headers.map(h => escape(row[h])).join(','))]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `cpg-export-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
