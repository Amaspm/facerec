import { useCallback, useEffect, useState } from 'react'
import {
  deleteParticipant,
  getParticipants,
  updateParticipant,
} from '../api/client'
import AlertMessage from '../components/AlertMessage'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingSpinner from '../components/LoadingSpinner'

export default function ParticipantsPage() {
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [alert, setAlert] = useState({ type: '', message: '' })
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [confirm, setConfirm] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getParticipants()
      setParticipants(data)
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
      setParticipants([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  function startEdit(participant) {
    setEditing(participant.nomor_absen)
    setEditName(participant.nama)
    setAlert({ type: '', message: '' })
  }

  async function saveEdit() {
    const name = editName.trim()
    if (!name) {
      setAlert({ type: 'error', message: 'Nama tidak boleh kosong.' })
      return
    }

    setActionLoading(true)
    try {
      await updateParticipant(editing, name)
      setAlert({ type: 'success', message: 'Nama peserta berhasil diperbarui.' })
      setEditing(null)
      loadData()
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete(nomorAbsen) {
    setActionLoading(true)
    try {
      const result = await deleteParticipant(nomorAbsen)
      setAlert({ type: 'success', message: result.message })
      setConfirm(null)
      loadData()
    } catch (err) {
      setAlert({ type: 'error', message: err.message })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="page-grid single wide">
      <section className="panel">
        <div className="panel-header">
          <h2>Kelola Peserta</h2>
          <button type="button" className="btn btn-ghost" onClick={loadData} disabled={loading}>
            Refresh
          </button>
        </div>

        <p className="panel-desc">
          Daftar peserta terdaftar beserta jumlah sampel wajah. Edit nama atau hapus peserta
          beserta data wajahnya.
        </p>

        <AlertMessage
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert({ type: '', message: '' })}
        />

        {loading ? (
          <LoadingSpinner label="Memuat daftar peserta..." />
        ) : participants.length === 0 ? (
          <p className="empty-state">Belum ada peserta terdaftar.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>No. Absen</th>
                  <th>Nama</th>
                  <th>Sampel Wajah</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.nomor_absen}>
                    <td>{p.nomor_absen}</td>
                    <td>
                      {editing === p.nomor_absen ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="inline-input"
                          autoFocus
                        />
                      ) : (
                        p.nama
                      )}
                    </td>
                    <td>
                      <span className={`sample-badge ${p.sample_count >= 3 ? 'ok' : 'low'}`}>
                        {p.sample_count} sampel
                      </span>
                    </td>
                    <td className="actions-cell">
                      {editing === p.nomor_absen ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={saveEdit}
                            disabled={actionLoading}
                          >
                            Simpan
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditing(null)}
                            disabled={actionLoading}
                          >
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => startEdit(p)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() =>
                              setConfirm({
                                nomor: p.nomor_absen,
                                nama: p.nama,
                              })
                            }
                          >
                            Hapus
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!confirm}
        title="Hapus Peserta"
        message={
          confirm
            ? `Hapus peserta "${confirm.nama}" (${confirm.nomor}) beserta data wajahnya?`
            : ''
        }
        danger
        loading={actionLoading}
        confirmLabel="Hapus"
        onConfirm={() => handleDelete(confirm.nomor)}
        onCancel={() => !actionLoading && setConfirm(null)}
      />
    </div>
  )
}
