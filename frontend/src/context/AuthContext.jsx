import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { loginAdmin, verifyToken } from '../api/client'

const TOKEN_KEY = 'facerec_token'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? null)
  const [username, setUsername] = useState(null)
  const [loading, setLoading] = useState(true)

  // Verifikasi token saat mount
  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    verifyToken(token)
      .then((data) => setUsername(data.username))
      .catch(() => {
        // Token kadaluarsa atau tidak valid — hapus
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setUsername(null)
      })
      .finally(() => setLoading(false))
  }, [token])

  const login = useCallback(async (password) => {
    const data = await loginAdmin(password)
    localStorage.setItem(TOKEN_KEY, data.access_token)
    setToken(data.access_token)
    setUsername('admin')
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUsername(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, username, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}
