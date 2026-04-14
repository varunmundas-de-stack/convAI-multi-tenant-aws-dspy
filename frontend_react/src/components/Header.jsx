import { motion } from 'framer-motion'
import DomainSelector from './DomainSelector'

const ROLE_CONFIG = {
  NSM:     { color: 'bg-purple-500/20 text-purple-200 border-purple-400/30', label: 'National' },
  ZSM:     { color: 'bg-blue-500/20   text-blue-200   border-blue-400/30',   label: 'Zone' },
  ASM:     { color: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30', label: 'Area' },
  SO:      { color: 'bg-orange-500/20 text-orange-200 border-orange-400/30', label: 'Territory' },
  admin:   { color: 'bg-white/15 text-white/80 border-white/20', label: null },
  analyst: { color: 'bg-sky-500/20 text-sky-200 border-sky-400/30', label: null },
}

export default function Header({ user, domain, onDomainChange, onLogout, onMenuToggle }) {
  const cfg         = ROLE_CONFIG[user?.role] || ROLE_CONFIG.admin
  const clientLabel = (user?.client_id || '').charAt(0).toUpperCase() + (user?.client_id || '').slice(1)
  const initials    = (user?.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <header
      className="flex-shrink-0 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #4c1d95 65%, #6d28d9 100%)' }}
    >
      {/* Subtle inner glow */}
      <div className="absolute inset-0 opacity-20"
           style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(139,92,246,0.5), transparent 60%)' }} />

      <div className="relative px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">

        {/* Hamburger */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="md:hidden p-2 rounded-xl bg-white/10 hover:bg-white/20 transition flex-shrink-0"
          >
            <svg className="w-4.5 h-4.5 text-white w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black text-white leading-tight tracking-tight text-gradient-animated">CPG Sales Assistant</h1>
            <p className="text-white/40 text-[11px] leading-tight hidden sm:block">AI-powered analytics</p>
          </div>
        </div>

        {/* User pill — center */}
        <motion.div
          className="hidden sm:flex items-center gap-2.5 min-w-0"
          style={{
            background: 'rgba(255,255,255,0.10)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '1rem',
            padding: '6px 14px 6px 8px',
          }}
          whileHover={{ scale: 1.03 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
               style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.7), rgba(99,102,241,0.7))' }}>
            {initials}
          </div>
          {/* Name */}
          <div className="min-w-0">
            <div className="text-sm font-bold text-white leading-tight truncate">{user?.full_name}</div>
            <div className="text-white/40 text-[11px] leading-tight truncate">{clientLabel}</div>
          </div>
          {/* Role */}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.color}`}>
            {user?.role}
          </span>
          {cfg.label && (
            <span className="text-[10px] text-white/30 flex-shrink-0 hidden md:inline font-medium">
              {cfg.label}
            </span>
          )}
        </motion.div>

        {/* Domain selector */}
        {onDomainChange && (
          <div className="hidden sm:block flex-shrink-0">
            <DomainSelector domain={domain} onChange={onDomainChange} />
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white/80 hover:text-white transition-all duration-150 flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">Sign out</span>
        </button>

      </div>
    </header>
  )
}
