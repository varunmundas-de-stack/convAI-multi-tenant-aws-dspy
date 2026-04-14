import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('cpg_user')) } catch { return null }
  })

  useEffect(() => {
    const client = user?.client_id
      ? user.client_id.charAt(0).toUpperCase() + user.client_id.slice(1)
      : null
    document.title = user
      ? `CPG Sales Assistant${client ? ' — ' + client : ''}`
      : 'CPG Sales Assistant — Sign In'
  }, [user])

  const handleLogin = (userData) => {
    sessionStorage.setItem('cpg_user', JSON.stringify(userData))
    setUser(userData)
  }

  const handleLogout = () => {
    sessionStorage.removeItem('cpg_user')
    setUser(null)
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
              ? <DashboardPage user={user} onLogout={handleLogout} />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
