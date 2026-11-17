const API_BASE = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'facerec_token'

function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function handleResponse(response) {
  if (!response.ok) {
    let detail = response.statusText
    try {
      const data = await response.json()
      detail = data.detail || JSON.stringify(data)
    } catch {
      detail = await response.text()
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return response
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function loginAdmin(password) {
  // OAuth2PasswordRequestForm → application/x-www-form-urlencoded
  const body = new URLSearchParams({ username: 'admin', password })
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }),
  )
  return res.json()
}

export async function verifyToken(token) {
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  )
  return res.json()
}

// ── System ────────────────────────────────────────────────────────────────────

export async function getHealth() {
  const res = await handleResponse(await fetch(`${API_BASE}/api/health`))
  return res.json()
}

// ── Faces (protected) ─────────────────────────────────────────────────────────

export async function detectFaces(imageBlob) {
  const form = new FormData()
  form.append('image', imageBlob, 'frame.jpg')
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/faces/detect`, { method: 'POST', body: form }),
  )
  return res.json()
}

export async function recognizeFace(imageBlob, autoRecord = true) {
  const form = new FormData()
  form.append('image', imageBlob, 'frame.jpg')
  form.append('auto_record', String(autoRecord))

  const res = await handleResponse(
    await fetch(`${API_BASE}/api/faces/recognize`, { method: 'POST', body: form }),
  )
  return res.json()
}

export async function registerFace(imageBlob, nomorAbsen, nama) {
  const form = new FormData()
  form.append('image', imageBlob, 'frame.jpg')
  form.append('nomor_absen', nomorAbsen)
  form.append('nama', nama)

  const res = await handleResponse(
    await fetch(`${API_BASE}/api/faces/register`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    }),
  )
  return res.json()
}

// ── Attendance ────────────────────────────────────────────────────────────────

export async function getAttendance({ limit = 50, offset = 0, startDate, endDate } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)

  const res = await handleResponse(
    await fetch(`${API_BASE}/api/attendance?${params}`),
  )
  return res.json()
}

export async function deleteAttendance(id) {
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/attendance/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }),
  )
  return res.json()
}

export async function deleteAllAttendance() {
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/attendance`, {
      method: 'DELETE',
      headers: authHeaders(),
    }),
  )
  return res.json()
}

export async function createAttendance({ nomor_absen, waktu, status = 'Hadir' }) {
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ nomor_absen, waktu: waktu || null, status }),
    }),
  )
  return res.json()
}

export async function updateAttendance(id, { nomor_absen, waktu, status }) {
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/attendance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ nomor_absen, waktu, status }),
    }),
  )
  return res.json()
}

// ── Participants ──────────────────────────────────────────────────────────────

export async function getParticipants() {
  const res = await handleResponse(await fetch(`${API_BASE}/api/participants`))
  return res.json()
}

export async function updateParticipant(nomorAbsen, nama) {
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/participants/${encodeURIComponent(nomorAbsen)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ nama }),
    }),
  )
  return res.json()
}

export async function patchParticipant(nomorAbsen, { nomor_absen, nama }) {
  const body = {}
  if (nomor_absen !== undefined) body.nomor_absen = nomor_absen
  if (nama !== undefined) body.nama = nama
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/participants/${encodeURIComponent(nomorAbsen)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    }),
  )
  return res.json()
}

export function getParticipantFaceImageUrl(nomorAbsen) {
  // Kembalikan URL langsung — dipakai sebagai src di <img>
  return `${API_BASE}/api/participants/${encodeURIComponent(nomorAbsen)}/face-image`
}

export async function resetFaceSamples(nomorAbsen) {
  const res = await handleResponse(
    await fetch(
      `${API_BASE}/api/participants/${encodeURIComponent(nomorAbsen)}/face-samples`,
      { method: 'DELETE', headers: authHeaders() },
    ),
  )
  return res.json()
}

export async function deleteParticipant(nomorAbsen) {
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/participants/${encodeURIComponent(nomorAbsen)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }),
  )
  return res.json()
}

// ── Export PDF (public — hanya baca) ─────────────────────────────────────────

export async function downloadWeeklyPdf(year, week) {
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/export/pdf/weekly?year=${year}&week=${week}`),
  )
  const blob = await res.blob()
  triggerDownload(blob, `laporan-absensi-pekan-${year}-w${String(week).padStart(2, '0')}.pdf`)
}

export async function downloadMonthlyPdf(year, month) {
  const res = await handleResponse(
    await fetch(`${API_BASE}/api/export/pdf/monthly?year=${year}&month=${month}`),
  )
  const blob = await res.blob()
  triggerDownload(blob, `laporan-absensi-${year}-${String(month).padStart(2, '0')}.pdf`)
}
