import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function UsersPage() {
  const navigate = useNavigate()
  const [users, setUsers]     = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null)
  const [edits, setEdits]     = useState({})
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating]     = useState(false)
  const [createError, setCreateError] = useState('')
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'client', client_id: '' })
  const [confirmDelete, setConfirmDelete] = useState(null) // user id pending delete
  const [actioning, setActioning] = useState(null) // user id being actioned

  useEffect(() => {
    Promise.all([loadUsers(), loadClients()])
  }, [])

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase
      .from('user_profiles')
      .select('id, email, role, client_id, disabled, full_name, clients(name)')
      .order('email')
    setUsers(data || [])
    setLoading(false)
  }

  async function loadClients() {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    setClients(data || [])
  }

  async function callFunction(body) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not logged in — please sign in again')
    const res = await fetch('https://ztagewwelwgrhmibikcv.supabase.co/functions/v1/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0YWdld3dlbHdncmhtaWJpa2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTMzNDQsImV4cCI6MjA5MDAyOTM0NH0.cC8_Ltldb4fRB9nHNCNCZIN2N7R_cD1WIFP6oMVyrG8',
      },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    console.log('Edge Function response:', res.status, text)
    let json
    try { json = JSON.parse(text) } catch { throw new Error(text || `Request failed (${res.status})`) }
    if (!res.ok) throw new Error(json.error || json.message || `Request failed (${res.status})`)
    return json
  }

  async function createUser(e) {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    try {
      await callFunction({
        action:    'create',
        email:     newUser.email,
        password:  newUser.password,
        role:      newUser.role,
        client_id: newUser.client_id || null,
      })
      setShowCreate(false)
      setNewUser({ email: '', password: '', role: 'client', client_id: '' })
      await loadUsers()
    } catch (err) {
      setCreateError(err.message)
    }
    setCreating(false)
  }

  async function toggleDisable(user) {
    setActioning(user.id)
    try {
      await callFunction({ action: user.disabled ? 'enable' : 'disable', user_id: user.id })
      await loadUsers()
    } catch (err) {
      alert(err.message)
    }
    setActioning(null)
  }

  async function deleteUser(userId) {
    setActioning(userId)
    try {
      await callFunction({ action: 'delete', user_id: userId })
      setConfirmDelete(null)
      await loadUsers()
    } catch (err) {
      alert(err.message)
    }
    setActioning(null)
  }

  function getEdit(user) {
    return edits[user.id] ?? { role: user.role, client_id: user.client_id, full_name: user.full_name || '' }
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
      .update({ role: edit.role, client_id: edit.client_id || null, full_name: edit.full_name.trim() || null })
      .eq('id', user.id)
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
      <div style={s.header}>
        <div style={s.headerLeft}>
          <img src="/tfj_logo.png" alt="TF Jones" style={s.logo} />
        </div>
        <div style={s.headerRight}>
          <button style={s.backBtn} onClick={() => navigate('/')}>← Home</button>
          <button style={s.backBtn} onClick={() => supabase.auth.signOut()}>Sign Out</button>
        </div>
      </div>

      <div style={s.body}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h1 style={s.title}>User Management</h1>
          <button style={s.createBtn} onClick={() => { setShowCreate(v => !v); setCreateError('') }}>
            {showCreate ? 'Cancel' : '+ New User'}
          </button>
        </div>

        {/* Create user form */}
        {showCreate && (
          <form onSubmit={createUser} style={s.createForm}>
            <div style={s.formGrid}>
              <div style={s.formField}>
                <label style={s.label}>Email</label>
                <input
                  style={s.input}
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={newUser.email}
                  onChange={e => setNewUser(v => ({ ...v, email: e.target.value }))}
                />
              </div>
              <div style={s.formField}>
                <label style={s.label}>Password</label>
                <input
                  style={s.input}
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  value={newUser.password}
                  onChange={e => setNewUser(v => ({ ...v, password: e.target.value }))}
                />
              </div>
              <div style={s.formField}>
                <label style={s.label}>Role</label>
                <select
                  style={s.input}
                  value={newUser.role}
                  onChange={e => setNewUser(v => ({ ...v, role: e.target.value, client_id: '' }))}
                >
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                  <option value="inspector">Inspector</option>
                  <option value="joiner">Fire Door Joiner</option>
                  <option value="client">Client</option>
                </select>
              </div>
              <div style={s.formField}>
                <label style={s.label}>Client</label>
                <select
                  style={s.input}
                  value={newUser.client_id}
                  onChange={e => setNewUser(v => ({ ...v, client_id: e.target.value }))}
                  disabled={newUser.role !== 'client'}
                >
                  <option value="">— None —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {createError && <p style={s.error}>{createError}</p>}
            <button style={s.saveBtn} type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create User'}
            </button>
          </form>
        )}

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
                  <th style={s.th}>Status</th>
                  <th style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const edit    = getEdit(user)
                  const dirty   = isDirty(user)
                  const busy    = actioning === user.id
                  const pending = confirmDelete === user.id
                  return (
                    <tr key={user.id} style={{ ...s.tr, opacity: user.disabled ? 0.6 : 1 }}>
                      <td style={s.td}>
                        <span style={s.email}>{user.email || <span style={s.noEmail}>No email — user must log in once</span>}</span>
                      </td>
                      <td style={s.td}>
                        <select style={s.select} value={edit.role || 'client'} onChange={e => setField(user.id, 'role', e.target.value)}>
                          <option value="admin">Admin</option>
                          <option value="user">User</option>
                          <option value="inspector">Inspector</option>
                          <option value="joiner">Fire Door Joiner</option>
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
                          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: user.disabled ? '#F4433622' : '#4CAF5022', color: user.disabled ? '#F44336' : '#4CAF50', border: `1px solid ${user.disabled ? '#F44336' : '#4CAF50'}` }}>
                          {user.disabled ? 'Disabled' : 'Active'}
                        </span>
                      </td>
                      <td style={s.tdAction}>
                        {pending ? (
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <span style={{ color: '#F44336', fontSize: 13, fontWeight: 600 }}>Delete?</span>
                            <button style={s.deleteConfirmBtn} onClick={() => deleteUser(user.id)} disabled={busy}>
                              {busy ? '…' : 'Yes, Delete'}
                            </button>
                            <button style={s.cancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                              style={{ ...s.saveBtn, opacity: dirty ? 1 : 0.3, cursor: dirty ? 'pointer' : 'default' }}
                              disabled={!dirty || saving === user.id}
                              onClick={() => save(user)}
                            >
                              {saving === user.id ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              style={{ ...s.disableBtn, background: user.disabled ? '#4CAF5022' : '#FF980022', color: user.disabled ? '#4CAF50' : '#FF9800', border: `1px solid ${user.disabled ? '#4CAF50' : '#FF9800'}` }}
                              onClick={() => toggleDisable(user)}
                              disabled={busy}
                            >
                              {busy ? '…' : user.disabled ? 'Enable' : 'Disable'}
                            </button>
                            <button style={s.deleteBtn} onClick={() => setConfirmDelete(user.id)}>Delete</button>
                          </div>
                        )}
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
  page:            { minHeight: '100vh', background: '#0D1F35', fontFamily: 'system-ui, sans-serif' },
  header:          { background: '#0D1F35', borderBottom: '3px solid #EEFF00', padding: '0 28px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft:      { display: 'flex', alignItems: 'center' },
  headerRight:     { display: 'flex', alignItems: 'center', gap: 12 },
  logo:            { height: 42, objectFit: 'contain' },
  backBtn:         { background: 'none', border: '1px solid #EEFF00', borderRadius: 4, padding: '7px 14px', color: '#EEFF00', fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' },
  body:            { padding: '32px 28px', maxWidth: 1100, margin: '0 auto' },
  title:           { color: '#fff', fontSize: 26, fontWeight: 800, margin: 0 },
  createBtn:       { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  createForm:      { background: '#162840', borderRadius: 14, padding: '20px 24px', marginBottom: 24 },
  formGrid:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  formField:       { display: 'flex', flexDirection: 'column', gap: 6 },
  label:           { color: '#8A9BAD', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input:           { background: '#0D1F35', border: '1px solid #1A3A5C', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, outline: 'none' },
  error:           { color: '#F44336', fontSize: 13, margin: '0 0 12px' },
  centred:         { display: 'flex', justifyContent: 'center', paddingTop: 60 },
  empty:           { color: '#8A9BAD', textAlign: 'center', paddingTop: 60 },
  tableWrap:       { background: '#162840', borderRadius: 14, overflow: 'hidden', marginTop: 24 },
  table:           { width: '100%', borderCollapse: 'collapse' },
  th:              { color: '#8A9BAD', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 20px', textAlign: 'left', borderBottom: '1px solid #1A3A5C' },
  tr:              { borderBottom: '1px solid #1A3A5C' },
  td:              { padding: '14px 20px', verticalAlign: 'middle' },
  tdAction:        { padding: '14px 20px', verticalAlign: 'middle', textAlign: 'right', minWidth: 260 },
  email:           { color: '#fff', fontSize: 14, fontWeight: 600 },
  noEmail:         { color: '#8A9BAD', fontSize: 13, fontStyle: 'italic', fontWeight: 400 },
  select:          { background: '#0D1F35', border: '1px solid #1A3A5C', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 14, width: '100%' },
  badge:           { display: 'inline-block', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 },
  saveBtn:         { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  disableBtn:      { borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  deleteBtn:       { background: '#F4433622', color: '#F44336', border: '1px solid #F44336', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  deleteConfirmBtn:{ background: '#F44336', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  cancelBtn:       { background: 'transparent', color: '#8A9BAD', border: '1px solid #8A9BAD', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
}
