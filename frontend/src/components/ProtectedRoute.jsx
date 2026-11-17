import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'
import LoginPage from '../pages/LoginPage'

/**
 * Bungkus route yang butuh autentikasi.
 * Tampilkan spinner selama verifikasi token, LoginPage jika belum login.
 */
export default function ProtectedRoute({ children }) {
  const { token, loading } = useAuth()

  if (loading) {
    return (
      <div className="app-shell">
        <main className="app-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner label="Memverifikasi sesi..." />
        </main>
      </div>
    )
  }

  if (!token) {
    return <LoginPage />
  }

  return children
}
