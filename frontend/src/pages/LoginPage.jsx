import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')
    try {
      await login(password)
      // AuthContext update token → App re-render, redirect otomatis
    } catch (err) {
      setError(err.message || 'Login gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-icon" aria-hidden="true">👤</span>
          <h1>Sistem Absensi Wajah</h1>
          <p>Masuk sebagai admin untuk melanjutkan</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="login-password">Password Admin</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan password"
            autoComplete="current-password"
            autoFocus
            required
          />

          {error && (
            <div className="alert error" role="alert">{error}</div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}
