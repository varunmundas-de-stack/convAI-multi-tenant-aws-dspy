import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import { tokenStore } from './api/client'

export default function App() {
  // User persisted in localStorage alongside JWT tokens
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('cpg_user')
      // Only restore if a valid access token also exists
      if (stored && tokenStore.getAccess()) return JSON.parse(stored)
      return null
    } catch { return null }
  })

  // Active domain — CPG (live) or cold_chain (coming soon)
  const [domain, setDomain] = useState(
    () => localStorage.getItem('cpg_domain') || 'cpg'
  )

  useEffect(() => {
    const client = user?.client_id
      ? user.client_id.charAt(0).toUpperCase() + user.client_id.slice(1)
      : null
    document.title = user
      ? `CPG Analytics${client ? ' — ' + client : ''}`
      : 'CPG Analytics — Sign In'
  }, [user])

  const handleLogin = (userData) => {
    localStorage.setItem('cpg_user', JSON.stringify(userData))
    setUser(userData)
  }

  const handleLogout = () => {
    tokenStore.clear()
    localStorage.removeItem('cpg_user')
    setUser(null)
  }

  const handleDomainChange = (newDomain) => {
    localStorage.setItem('cpg_domain', newDomain)
    setDomain(newDomain)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} />}
        />
        <Route
          path="/*"
          element={
            user
              ? <DashboardPage
                  user={user}
                  domain={domain}
                  onDomainChange={handleDomainChange}
                  onLogout={handleLogout}
                />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
