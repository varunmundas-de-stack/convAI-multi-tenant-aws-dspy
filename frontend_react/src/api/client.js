/**
 * API client — JWT Bearer token auth, SSE streaming, all backend endpoints.
 * Migrated from Flask session cookies → FastAPI JWT Bearer tokens.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ""

// ── Token management ─────────────────────────────────────────────────────────
export const tokenStore = {
  getAccess:  () => localStorage.getItem("access_token"),
  getRefresh: () => localStorage.getItem("refresh_token"),
  set: (access, refresh) => {
    localStorage.setItem("access_token", access)
    if (refresh) localStorage.setItem("refresh_token", refresh)
  },
  clear: () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
  },
}

async function tryRefresh() {
  const refresh = tokenStore.getRefresh()
  if (!refresh) return false
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) return false
    const data = await res.json()
    tokenStore.set(data.access_token, null)
    return true
  } catch { return false }
}

async function apiFetch(path, options = {}, _retry = false) {
  const token = tokenStore.getAccess()
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (res.status === 401 && !_retry) {
    const refreshed = await tryRefresh()
    if (refreshed) return apiFetch(path, options, true)
    tokenStore.clear()
    window.location.href = "/login"
    throw new Error("Session expired")
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const apiClient = {
  get:    (path)       => apiFetch(path),
  post:   (path, body) => apiFetch(path, { method: "POST", body: JSON.stringify(body) }),
  delete: (path)       => apiFetch(path, { method: "DELETE" }),
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function loginUser(username, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  })
  tokenStore.set(data.access_token, data.refresh_token)
  return data.user
}

export async function logoutUser() {
  tokenStore.clear()
}

export async function getMe() {
  return apiClient.get("/auth/me")
}

// ── Streaming query (SSE) ────────────────────────────────────────────────────
export function sendQueryStream(question, onProgress, sessionId = null, domain = "cpg") {
  return new Promise((resolve, reject) => {
    const token = tokenStore.getAccess()
    fetch(`${BASE_URL}/query/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ question, session_id: sessionId, domain }),
    }).then(async (res) => {
      if (res.status === 401) { tokenStore.clear(); window.location.href = "/login"; return }
      if (!res.ok) { reject(new Error(`HTTP ${res.status}`)); return }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { reject(new Error("Stream ended without result")); return }
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n\n")
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.event === "progress")      { onProgress?.(event); continue }
            if (event.event === "clarification") { resolve({ clarification: true, ...event }); return }
            if (event.event === "result")        { resolve(event.data || event); return }
            if (event.event === "error")         { reject(new Error(event.message)); return }
          } catch { /* skip malformed */ }
        }
        pump()
      }).catch(reject)
      pump()
    }).catch(reject)
  })
}

// ── Non-streaming query ───────────────────────────────────────────────────────
export async function sendQuery(question, sessionId = null, domain = "cpg") {
  return apiClient.post("/query", { question, session_id: sessionId, domain })
}

// ── Clarification resumption ──────────────────────────────────────────────────
export async function submitClarification(requestId, answers, sessionId) {
  return apiClient.post("/query/clarify", { request_id: requestId, answers, session_id: sessionId })
}

// ── Suggestions ───────────────────────────────────────────────────────────────
export async function fetchSuggestions(domain = "cpg") {
  const data = await apiClient.get("/query/suggestions")
  return data[domain] || data.cpg || []
}

// ── Insights ──────────────────────────────────────────────────────────────────
export async function fetchInsights()            { return apiClient.get("/insights") }
export async function fetchInsightCount()        { return apiClient.get("/insights/count") }
export async function markInsightRead(id)        { return apiClient.post(`/insights/${id}/read`, {}) }

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function fetchDashboard(period = "last_365_days") {
  return apiClient.get(`/dashboard?period=${period}`)
}

export async function fetchDrilldown(drillType, value) {
  return apiClient.get(`/dashboard/drilldown?type=${encodeURIComponent(drillType)}&value=${encodeURIComponent(value)}`)
}

// ── RLHF ─────────────────────────────────────────────────────────────────────
export async function submitFeedback(payload) { return apiClient.post("/rlhf/feedback", payload) }

// ── Sessions (kept for sidebar compatibility) ─────────────────────────────────
export async function fetchSessions() {
  // Session persistence via Redis QCO — no server-side session list yet
  return []
}

// crypto.randomUUID() requires a secure context (HTTPS) in some browsers.
// Use a Math.random fallback so session IDs always generate on plain HTTP.
function makeUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID() } catch { /* fall through */ }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export async function createSession(title = "New conversation") {
  return { session_id: makeUUID(), title }
}
export async function fetchSessionMessages() { return [] }
export async function saveMessage() { return {} }
export async function deleteSession() {}
export async function renameSession() {}
