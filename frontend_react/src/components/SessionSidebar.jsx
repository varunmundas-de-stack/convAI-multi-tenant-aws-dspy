import { useEffect, useState, useRef } from 'react'
import { fetchSessions, createSession, deleteSession, renameSession } from '../api/client'

export default function SessionSidebar({ activeSessionId, onSelect, onNew, isOpen, onClose }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try { setSessions(await fetchSessions()) } catch { /* silent */ }
    finally { setLoading(false) }
  }

  const handleNew = async () => {
    const s = await createSession('New conversation')
    setSessions(prev => [{ ...s, created_at: new Date().toISOString(), last_active: new Date().toISOString() }, ...prev])
    onNew(s.session_id)
    onClose?.()
  }

  const handleDelete = async (e, sessionId) => {
    e.stopPropagation()
    await deleteSession(sessionId)
    setSessions(prev => prev.filter(s => s.session_id !== sessionId))
    if (activeSessionId === sessionId) onNew(null)
  }

  const handleRename = async (sessionId, newTitle) => {
    if (!newTitle.trim()) return
    await renameSession(sessionId, newTitle.trim())
    setSessions(prev => prev.map(s => s.session_id === sessionId ? { ...s, title: newTitle.trim() } : s))
  }

  const groups = groupByDate(sessions)

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed md:relative inset-y-0 left-0 z-30
          w-64 flex flex-col bg-gray-900 text-white
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/10">
          <span className="text-sm font-semibold text-white/80">Chat History</span>
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded hover:bg-white/10 text-white/50 hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New chat button */}
        <div className="px-3 py-2">
          <button
            onClick={handleNew}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-white/20 hover:bg-white/10 text-sm font-medium text-white/80 hover:text-white transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
          {loading && (
            <div className="px-4 py-3 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-8 bg-white/10 rounded animate-pulse" />)}
            </div>
          )}

          {!loading && sessions.length === 0 && (
            <p className="px-4 py-4 text-xs text-white/30 text-center">
              No conversations yet.<br />Start by clicking New Chat.
            </p>
          )}

          {!loading && groups.map(({ label, items }) => (
            <div key={label}>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                {label}
              </p>
              {items.map(s => (
                <SessionItem
                  key={s.session_id}
                  session={s}
                  isActive={s.session_id === activeSessionId}
                  onClick={() => { onSelect(s.session_id); onClose?.() }}
                  onDelete={(e) => handleDelete(e, s.session_id)}
                  onRename={(newTitle) => handleRename(s.session_id, newTitle)}
                />
              ))}
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}

function SessionItem({ session, isActive, onClick, onDelete, onRename }) {
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState(session.title)
  const inputRef = useRef(null)

  const startEdit = (e) => {
    e.stopPropagation()
    setDraft(session.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitEdit = () => {
    setEditing(false)
    if (draft.trim() && draft.trim() !== session.title) {
      onRename(draft.trim())
    }
  }

  if (editing) {
    return (
      <div className="px-2 py-1 mx-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
            if (e.key === 'Escape') { setEditing(false) }
          }}
          className="w-full bg-white/15 text-white text-sm rounded px-2 py-1 outline-none border border-white/30 focus:border-white/60"
          autoFocus
        />
        <p className="text-[10px] text-white/30 mt-0.5 px-1">Enter to save · Esc to cancel</p>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className={`
        group flex items-center justify-between px-3 py-2 mx-1 rounded-lg cursor-pointer
        text-sm transition-colors
        ${isActive ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}
      `}
    >
      <span className="truncate flex-1 leading-tight">{session.title}</span>
      {/* Action buttons — always in DOM, visible on hover or when active */}
      <div className={`flex items-center gap-0.5 flex-shrink-0 ml-1 transition-opacity
        ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {/* Pencil / rename */}
        <button
          onClick={startEdit}
          title="Rename"
          className="p-0.5 rounded hover:bg-white/20 text-white/40 hover:text-white"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        {/* Trash / delete */}
        <button
          onClick={onDelete}
          title="Delete"
          className="p-0.5 rounded hover:bg-white/20 text-white/40 hover:text-red-400"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function groupByDate(sessions) {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const week7  = new Date(today); week7.setDate(today.getDate() - 7)
  const month30 = new Date(today); month30.setDate(today.getDate() - 30)

  const buckets = { Today: [], Yesterday: [], 'Last 7 days': [], 'Last 30 days': [], Older: [] }

  for (const s of sessions) {
    const d = new Date(s.last_active)
    if (d >= today)       buckets['Today'].push(s)
    else if (d >= yesterday) buckets['Yesterday'].push(s)
    else if (d >= week7)  buckets['Last 7 days'].push(s)
    else if (d >= month30) buckets['Last 30 days'].push(s)
    else                  buckets['Older'].push(s)
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}
