import axios from 'axios'

const api = axios.create({ baseURL: '/' })

// Detect session expiry: on 401 from any API call, clear local state and redirect to login
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('cpg_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export async function loginUser(username, password) {
  const { data } = await api.post('/login', { username, password })
  return data
}

export async function logoutUser() {
  await api.get('/logout')
}

export async function fetchSuggestions() {
  const { data } = await api.get('/api/suggestions')
  return data.suggestions || []
}

export async function sendQuery(question) {
  const { data } = await api.post('/api/query', { question })
  return data
}

/**
 * Streaming version of sendQuery using Server-Sent Events.
 * onProgress({ step, msg }) is called for each live progress update.
 * Resolves with the final result payload when done.
 */
export function sendQueryStream(question, onProgress) {
  return new Promise((resolve, reject) => {
    fetch('/api/query/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ question }),
    }).then(res => {
      if (res.status === 401) {
        sessionStorage.removeItem('cpg_user')
        window.location.href = '/login'
        return
      }
      if (!res.ok) { reject(new Error(`HTTP ${res.status}`)); return }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { reject(new Error('Stream ended without result')); return }
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'progress') { onProgress?.(event); continue }
            if (event.type === 'result')   { resolve(event); return }
          } catch { /* malformed line — skip */ }
        }
        pump()
      }).catch(reject)
      pump()
    }).catch(reject)
  })
}

export async function fetchInsights() {
  const { data } = await api.get('/api/insights')
  return data.insights || []
}

export async function fetchInsightCount() {
  const { data } = await api.get('/api/insights/count')
  return data.unread_count || 0
}

export async function markInsightRead(insightId) {
  await api.post(`/api/insights/${insightId}/read`)
}

// ── Chat Sessions ──────────────────────────────────────────────
export async function fetchSessions() {
  const { data } = await api.get('/api/sessions')
  return data.sessions || []
}

export async function createSession(title = 'New conversation') {
  const { data } = await api.post('/api/sessions', { title })
  return data  // { session_id, title }
}

export async function renameSession(sessionId, title) {
  const { data } = await api.patch(`/api/sessions/${sessionId}`, { title })
  return data
}

export async function deleteSession(sessionId) {
  await api.delete(`/api/sessions/${sessionId}`)
}

export async function fetchSessionMessages(sessionId) {
  const { data } = await api.get(`/api/sessions/${sessionId}/messages`)
  return data.messages || []
}

export async function saveMessage(sessionId, { role, content, raw_data, query_type, metadata, title_hint }) {
  const { data } = await api.post(`/api/sessions/${sessionId}/messages`, {
    role, content, raw_data, query_type, metadata, title_hint,
  })
  return data  // { message_id }
}

export const fetchDashboard = () => api.get('/api/dashboard').then(r => r.data)

export const fetchDrilldown = (drillType, value) =>
  api.get('/api/dashboard/drilldown', { params: { drill_type: drillType, value } }).then(r => r.data)
