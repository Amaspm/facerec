import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AdminPage from './pages/AdminPage'
import AttendancePage from './pages/AttendancePage'
import HistoryPage from './pages/HistoryPage'
import ParticipantsPage from './pages/ParticipantsPage'
import RegisterPage from './pages/RegisterPage'
import ReportsPage from './pages/ReportsPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProtectedRoute>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<AttendancePage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="participants" element={<ParticipantsPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="reports" element={<ReportsPage />} />
            </Route>
          </Routes>
        </ProtectedRoute>
      </AuthProvider>
    </BrowserRouter>
  )
}
