import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Header from '../components/Header'
import InsightsTab from '../components/InsightsTab'
import ChatTab from '../components/ChatTab'
import DashboardTab from '../components/DashboardTab'
import SessionSidebar from '../components/SessionSidebar'
import { fetchInsightCount, logoutUser } from '../api/client'

const TABS = [
  { id: 'dashboard', label: 'Dashboard',     icon: '📊' },
  { id: 'insights',  label: 'Insights',       icon: '🎯' },
  { id: 'chat',      label: 'Ask your own Q', icon: '💬' },
]

const tabContentVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } },
}

export default function DashboardPage({ user, onLogout }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab]             = useState('dashboard')
  const [unreadCount, setUnreadCount]         = useState(0)
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [prefillQuery, setPrefillQuery]       = useState(null)
  // chatKey increments only on explicit navigation (sidebar select / new-chat button).
  // onSessionCreated (auto-create during handleSend) must NOT change this key, or React
  // will unmount ChatTab mid-stream and the response is lost.
  const [chatKey, setChatKey]                 = useState(0)

  useEffect(() => {
    refreshBadge()
    const id = setInterval(refreshBadge, 30_000)
    return () => clearInterval(id)
  }, [])

  const refreshBadge = async () => {
    try { setUnreadCount(await fetchInsightCount()) } catch { /* silent */ }
  }

  const handleLogout = async () => {
    try { await logoutUser() } catch { /* ignore */ }
    onLogout()
    navigate('/login', { replace: true })
  }

  const handleInsightQuery = (query) => {
    setPrefillQuery(query)
    setActiveTab('chat')
  }

  const handleNewSession = (sessionId) => {
    setActiveSessionId(sessionId)
    setChatKey(k => k + 1)   // explicit new chat → remount ChatTab
    setActiveTab('chat')
    setPrefillQuery(null)
  }

  const handleSelectSession = (sessionId) => {
    setActiveSessionId(sessionId)
    setChatKey(k => k + 1)   // switching sessions → remount to load history
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'transparent' }}>
      <Header
        user={user}
        onLogout={handleLogout}
        onMenuToggle={() => setSidebarOpen(v => !v)}
      />

      {/* ── Segmented tab bar ──────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2 bg-white/60 backdrop-blur-xl border-b border-white/80"
           style={{ boxShadow: '0 1px 0 rgba(99,102,241,0.06)' }}>
        <div className="flex items-center bg-black/[0.04] rounded-2xl p-1 gap-1">
          {TABS.map(tab => (
            <TabPill
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              badge={tab.id === 'insights' ? unreadCount : 0}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {activeTab === 'chat' && (
          <SessionSidebar
            activeSessionId={activeSessionId}
            onSelect={handleSelectSession}
            onNew={handleNewSession}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="flex-1 min-w-0"
            variants={tabContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {activeTab === 'dashboard' && <DashboardTab user={user} />}
            {activeTab === 'insights'  && (
              <InsightsTab user={user} onBadgeRefresh={refreshBadge} onAskQuery={handleInsightQuery} />
            )}
            {activeTab === 'chat' && (
              <ChatTab
                key={chatKey}
                user={user}
                sessionId={activeSessionId}
                onSessionCreated={setActiveSessionId}
                prefillQuery={prefillQuery}
                onPrefillConsumed={() => setPrefillQuery(null)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function TabPill({ tab, active, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 flex items-center justify-center gap-1.5
        py-2 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold
        transition-colors duration-150 relative
        ${active
          ? 'text-brand-600'
          : 'text-gray-500 hover:text-gray-700'
        }
      `}
    >
      {/* Animated sliding background */}
      {active && (
        <motion.div
          layoutId="tab-pill"
          className="absolute inset-0 rounded-xl bg-white shadow-sm"
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative z-10 text-sm">{tab.icon}</span>
      <span className="relative z-10 truncate hidden sm:inline">{tab.label}</span>
      {badge > 0 && (
        <motion.span
          className="relative z-10 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[16px] text-center leading-none flex-shrink-0"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {badge > 9 ? '9+' : badge}
        </motion.span>
      )}
    </button>
  )
}
