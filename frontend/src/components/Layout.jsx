import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getHealth } from '../api/client'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/', label: 'Absensi', end: true },
  { to: '/register', label: 'Registrasi' },
  { to: '/history', label: 'Riwayat' },
  { to: '/admin', label: 'Admin' },
  { to: '/reports', label: 'Laporan PDF' },
]

export default function Layout() {
  const [health, setHealth] = useState(null)
  const [healthError, setHealthError] = useState(false)
  const { username, logout } = useAuth()

  useEffect(() => {
    getHealth()
      .then((data) => {
        setHealth(data)
        setHealthError(false)
      })
      .catch(() => {
        setHealth(null)
        setHealthError(true)
      })
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">👤</span>
          <div>
            <h1>Sistem Absensi Wajah</h1>
            <p className="brand-sub">Pengenalan wajah berbasis web</p>
          </div>
        </div>
        <nav className="app-nav">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="header-meta">
          {health && (
            <div className="health-badge">
              {health.participants} peserta · {health.registered_faces} wajah
            </div>
          )}
          {healthError && (
            <div className="health-badge health-error">API offline</div>
          )}
          {username && (
            <div className="admin-info">
              <span className="admin-label">{username}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={logout}
                title="Keluar"
              >
                Keluar
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
