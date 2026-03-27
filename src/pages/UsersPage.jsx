import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function UsersPage() {
  const navigate = useNavigate()
  const [users, setUsers]     = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null) // user id being saved
  const [edits, setEdits]     = useState({})   // { [id]: { role, client_id } }

  useEffect(() => {
    Promise.all([loadUsers(), loadClients()])
  }, [])

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('id, email, role, client_id, clients(name)')
      .order('email')
    setUsers(data || [])
    setLoading(false)
  }

  async function loadClients() {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    setClients(data || [])
  }

  function getEdit(user) {
    return edits[user.id] ?? { role: user.role, client_id: user.client_id }
  }

  function setField(userId, field, value) {
    setEdits(prev => ({
      ...prev,
      [userId]: { ...getEdit(users.find(u => u.id === userId)), [field]: value }
    }))
  }

  async function save(user) {
    setSaving(user.id)
    const edit = getEdit(user)
    await supabase
      .from('user_profiles')
      .update({ role: edit.role, client_id: edit.client_id || null })
      .eq('id', user.id)
    // clear local edit
    setEdits(prev => { const n = { ...prev }; delete n[user.id]; return n })
    await loadUsers()
    setSaving(null)
  }

  function isDirty(user) {
    if (!edits[user.id]) return false
    const e = edits[user.id]
    return e.role !== user.role || e.client_id !== user.client_id
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <img src="/tfj_logo.png" alt="TF Jones" style={s.logo} />
        </div>
        <div style={s.headerRight}>
          <button style={s.backBtn} onClick={() => navigate('/')}>← Projects</button>
          <button style={s.signOutBtn} onClick={() => supabase.auth.signOut()}>Sign Out</button>
        </div>
      </div>

      <div style={s.body}>
        <h1 style={s.title}>User Management</h1>
        <p style={s.sub}>Assign roles and clients to portal users. Create accounts first via Supabase Auth dashboard, then configure them here.</p>

        {loading ? (
          <div style={s.centred}><Spinner /></div>
        ) : users.length === 0 ? (
          <div style={s.empty}>No users found.</div>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Email</th>
                  <th style={s.th}>Role</th>
                  <th style={s.th}>Client</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const edit = getEdit(user)
                  const dirty = isDirty(user)
                  return (
                    <tr key={user.id} style={s.tr}>
                      <td style={s.td}>
                        <span style={s.email}>{user.email || <span style={s.noEmail}>No email recorded — user must log in once</span>}</span>
                      </td>
                      <td style={s.td}>
                        <select
                          style={s.select}
                          value={edit.role || 'client'}
                          onChange={e => setField(user.id, 'role', e.target.value)}
                        >
                          <option value="admin">Admin</option>
                          <option value="inspector">Inspector</option>
                          <option value="client">Client</option>
                        </select>
                      </td>
                      <td style={s.td}>
                        <select
                          style={s.select}
                          value={edit.client_id || ''}
                          onChange={e => setField(user.id, 'client_id', e.target.value || null)}
                          disabled={edit.role === 'admin' || edit.role === 'inspector'}
                        >
                          <option value="">— None —</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td style={s.tdAction}>
                        <button
                          style={{ ...s.saveBtn, opacity: dirty ? 1 : 0.3, cursor: dirty ? 'pointer' : 'default' }}
                          disabled={!dirty || saving === user.id}
                          onClick={() => save(user)}
                        >
                          {saving === user.id ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return <div style={{ width: 36, height: 36, border: '3px solid #162840', borderTop: '3px solid #EEFF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
}

const s = {
  page:      { minHeight: '100vh', background: '#0D1F35', fontFamily: 'system-ui, sans-serif' },
  header:    { background: '#0D1F35', borderBottom: '3px solid #EEFF00', padding: '0 28px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft:{ display: 'flex', alignItems: 'center' },
  headerRight:{ display: 'flex', alignItems: 'center', gap: 12 },
  logo:      { height: 42, objectFit: 'contain' },
  backBtn:   { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '7px 14px', color: '#fff', fontSize: 13, cursor: 'pointer' },
  signOutBtn:{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '7px 14px', color: '#fff', fontSize: 13, cursor: 'pointer' },
  body:      { padding: '32px 28px', maxWidth: 900, margin: '0 auto' },
  title:     { color: '#fff', fontSize: 26, fontWeight: 800, margin: '0 0 8px' },
  sub:       { color: '#8A9BAD', fontSize: 14, margin: '0 0 28px', lineHeight: 1.6 },
  centred:   { display: 'flex', justifyContent: 'center', paddingTop: 60 },
  empty:     { color: '#8A9BAD', textAlign: 'center', paddingTop: 60 },
  tableWrap: { background: '#162840', borderRadius: 14, overflow: 'hidden' },
  table:     { width: '100%', borderCollapse: 'collapse' },
  th:        { color: '#8A9BAD', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 20px', textAlign: 'left', borderBottom: '1px solid #1A3A5C' },
  tr:        { borderBottom: '1px solid #1A3A5C' },
  td:        { padding: '14px 20px', verticalAlign: 'middle' },
  tdAction:  { padding: '14px 20px', verticalAlign: 'middle', textAlign: 'right' },
  email:     { color: '#fff', fontSize: 14, fontWeight: 600 },
  noEmail:   { color: '#8A9BAD', fontSize: 13, fontStyle: 'italic', fontWeight: 400 },
  select:    { background: '#0D1F35', border: '1px solid #1A3A5C', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, width: '100%' },
  saveBtn:   { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 700 },
}
