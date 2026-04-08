import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { KNOWN_ENGINEERS } from '../lib/engineers'
import ProjectActionsMenu from '../components/ProjectActionsMenu'

// ─── Project management page ─────────────────────────────────────────────────
// Full-page list with filters, actions, and a Reinspect modal. Filter state
// lives in the URL (?tab=archived&client=xxx&inspector=yyy&q=foo) so the view
// is deep-linkable, bookmarkable, and survives browser back/forward.
export default function ProjectsManagePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // URL-driven filter state
  const tab       = searchParams.get('tab') || 'active'
  const clientF   = searchParams.get('client') || ''
  const inspF     = searchParams.get('inspector') || ''
  const q         = searchParams.get('q') || ''

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value); else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  // Data
  const [projects, setProjects]           = useState([])
  const [inspections, setInspections]     = useState([])
  const [clients, setClients]             = useState([])
  const [inspectorUsers, setInspectorUsers] = useState([])
  const [loading, setLoading]             = useState(true)

  // Reinspect modal state
  const [showReinspect, setShowReinspect] = useState(null)
  const [reinspectOrder, setReinspectOrder] = useState('')
  const [reinspectEngineerId, setReinspectEngineerId] = useState('')
  const [creatingReinspect, setCreatingReinspect] = useState(false)

  // Initial load + realtime subscriptions
  useEffect(() => {
    Promise.all([fetchProjects(), fetchInspections(), fetchClients(), fetchInspectors()])

    const projSub = supabase.channel('manage-projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchProjects())
      .subscribe()
    const insSub = supabase.channel('manage-inspections-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspections' }, () => fetchInspections())
      .subscribe()

    return () => {
      supabase.removeChannel(projSub)
      supabase.removeChannel(insSub)
    }
  }, [])

  async function fetchProjects() {
    setLoading(true)
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }
  async function fetchInspections() {
    const { data } = await supabase
      .from('inspections')
      .select('id, project_id, inspection_passed')
      .limit(5000)
    setInspections(data || [])
  }
  async function fetchClients() {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    setClients(data || [])
  }
  async function fetchInspectors() {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('role', 'inspector')
      .order('email')
    setInspectorUsers(data || [])
  }

  // engineer_id -> best display name (mirrors dashboard logic)
  const engineerIdToName = useMemo(() => {
    const map = {}
    for (const u of inspectorUsers) {
      map[u.id] = KNOWN_ENGINEERS[u.email?.toLowerCase()] || u.email || u.id
    }
    return map
  }, [inspectorUsers])

  // Unique inspector names for the filter dropdown
  const inspectors = useMemo(() => {
    const set = new Set()
    for (const u of inspectorUsers) {
      set.add(KNOWN_ENGINEERS[u.email?.toLowerCase()] || u.email)
    }
    return Array.from(set).sort()
  }, [inspectorUsers])

  // Body-scroll lock when reinspect modal is open
  useEffect(() => {
    if (showReinspect) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [showReinspect])

  async function createReinspection(e) {
    e.preventDefault()
    if (!showReinspect) return
    setCreatingReinspect(true)
    try {
      const src = showReinspect
      const inspector = inspectorUsers.find(u => u.id === reinspectEngineerId)
      const engineerEmail = inspector?.email || ''
      const engineerName = KNOWN_ENGINEERS[engineerEmail.toLowerCase()] || engineerEmail
      const { error } = await supabase.from('projects').insert({
        name: `${src.name} (Reinspection)`,
        address: src.address || null,
        postcode: src.postcode || null,
        client_id: src.client_id || null,
        client_name: src.client_name || null,
        order_number: reinspectOrder || null,
        engineer_id: reinspectEngineerId,
        engineer_name: engineerName,
        created_at: Date.now(),
        source_project_id: src.id,
      })
      if (error) throw error
      setShowReinspect(null)
      setReinspectOrder('')
      setReinspectEngineerId('')
      await fetchProjects()
    } catch (err) {
      alert('Failed to create reinspection: ' + err.message)
    }
    setCreatingReinspect(false)
  }

  // Filtered list
  const filtered = useMemo(() => {
    return projects.filter(p => {
      const archived  = p.is_archived === true
      const completed = p.is_completed === true
      if (tab === 'active'    && (archived || completed)) return false
      if (tab === 'completed' && !completed) return false
      if (tab === 'archived'  && !archived) return false
      if (clientF && p.client_name !== clientF) return false
      if (inspF) {
        const name = (p.engineer_id && engineerIdToName[p.engineer_id]) || p.engineer_name || ''
        if (name !== inspF) return false
      }
      const query = q.toLowerCase()
      return !query ||
        p.name?.toLowerCase().includes(query)          ||
        p.address?.toLowerCase().includes(query)       ||
        p.postcode?.toLowerCase().includes(query)      ||
        p.client_name?.toLowerCase().includes(query)   ||
        p.engineer_name?.toLowerCase().includes(query) ||
        p.order_number?.toLowerCase().includes(query)
    })
  }, [projects, tab, clientF, inspF, q, engineerIdToName])

  // Door counts per project
  const doorStats = useMemo(() => {
    const stats = {}
    for (const i of inspections) {
      if (!i.project_id) continue
      if (!stats[i.project_id]) stats[i.project_id] = { total: 0, passed: 0 }
      stats[i.project_id].total++
      if (i.inspection_passed === 'Pass') stats[i.project_id].passed++
    }
    return stats
  }, [inspections])

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <button style={s.backBtn} onClick={() => navigate('/')}>← Dashboard</button>
          <h1 style={s.title}>Manage Projects</h1>
          <div style={{ flex: 1 }} />
          <div style={s.tabs}>
            {['active', 'completed', 'archived'].map(t => (
              <button
                key={t}
                onClick={() => updateParam('tab', t === 'active' ? '' : t)}
                style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
              >{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={s.filters}>
        <input
          style={{ ...s.input, flex: 1 }}
          placeholder="Search projects, addresses, postcodes, order numbers…"
          value={q}
          onChange={e => updateParam('q', e.target.value)}
        />
        <select style={{ ...s.input, minWidth: 180 }} value={clientF} onChange={e => updateParam('client', e.target.value)}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select style={{ ...s.input, minWidth: 180 }} value={inspF} onChange={e => updateParam('inspector', e.target.value)}>
          <option value="">All Inspectors</option>
          {inspectors.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={s.content}>
        {loading ? (
          <p style={{ color: '#8A9BAD', textAlign: 'center', padding: 60 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#8A9BAD', textAlign: 'center', padding: 60 }}>No projects found.</p>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr>{['Project','Address','Client','Order No.','Inspector','Created','Doors','Pass Rate',''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(p => {
                  const stats = doorStats[p.id] || { total: 0, passed: 0 }
                  const passRate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : '—'
                  return (
                    <tr key={p.id} style={s.row} onClick={() => navigate(`/project/${p.id}`, { state: { project: p } })}>
                      <td style={s.td}>
                        <span style={s.projectName}>{p.name}</span>
                        {p.is_completed && <span style={s.completeBadge}>COMPLETE</span>}
                        {p.is_archived && <span style={s.archivedBadge}>ARCHIVED</span>}
                      </td>
                      <td style={s.td}><span style={{ color: '#CBD5E1' }}>{[p.address, p.postcode].filter(Boolean).join(', ') || '—'}</span></td>
                      <td style={s.td}><span style={{ color: '#EEFF00', fontWeight: 600 }}>{p.client_name || '—'}</span></td>
                      <td style={s.td}><span style={{ color: '#CBD5E1' }}>{p.order_number || '—'}</span></td>
                      <td style={s.td}><span style={{ color: '#fff', fontWeight: 500 }}>{(p.engineer_id && engineerIdToName[p.engineer_id]) || KNOWN_ENGINEERS[p.engineer_name?.toLowerCase()] || (p.engineer_name?.includes('@') ? '—' : p.engineer_name) || '—'}</span></td>
                      <td style={s.td}><span style={{ color: '#94A3B8' }}>{new Date(p.created_at).toLocaleDateString('en-GB')}</span></td>
                      <td style={s.td}><span style={{ color: '#fff', fontWeight: 600 }}>{stats.total || '—'}</span></td>
                      <td style={s.td}><span style={{ color: passRate === '—' ? '#8A9BAD' : passRate >= 80 ? '#4CAF50' : passRate >= 50 ? '#FF9800' : '#F44336', fontWeight: 600 }}>{passRate === '—' ? '—' : `${passRate}%`}</span></td>
                      <td style={s.td}>
                        <ProjectActionsMenu
                          project={p}
                          onReinspect={proj => { setShowReinspect(proj); setReinspectEngineerId(proj.engineer_id || ''); setReinspectOrder('') }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={s.count}>{filtered.length} project{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Reinspect modal */}
      {showReinspect && (
        <div style={s.overlay} onClick={() => setShowReinspect(null)}>
          <form onSubmit={createReinspection} style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Reinspect Project</h2>
              <button type="button" onClick={() => setShowReinspect(null)} style={{ background: 'none', border: 'none', color: '#8A9BAD', fontSize: 22, cursor: 'pointer', padding: '0 4px' }}>&times;</button>
            </div>
            <p style={{ color: '#8A9BAD', fontSize: 13, margin: '0 0 16px' }}>
              Create a new reinspection project for <span style={{ color: '#EEFF00', fontWeight: 700 }}>{showReinspect.name}</span> with the same site details and door list ready to go.
            </p>
            <div style={s.grid}>
              <div style={s.field}>
                <label style={s.label}>Source Project</label>
                <input style={{ ...s.input, opacity: 0.6 }} value={showReinspect.name} disabled />
              </div>
              <div style={s.field}>
                <label style={s.label}>Site Address</label>
                <input style={{ ...s.input, opacity: 0.6 }} value={[showReinspect.address, showReinspect.postcode].filter(Boolean).join(', ') || '—'} disabled />
              </div>
              <div style={s.field}>
                <label style={s.label}>New Order Number *</label>
                <input style={s.input} required placeholder="e.g. ORD-12345" value={reinspectOrder} onChange={e => setReinspectOrder(e.target.value)} />
              </div>
              <div style={s.field}>
                <label style={s.label}>Assign to Inspector *</label>
                <select style={s.input} required value={reinspectEngineerId} onChange={e => setReinspectEngineerId(e.target.value)}>
                  <option value="">— Select Inspector —</option>
                  {inspectorUsers.map(u => <option key={u.id} value={u.id}>{KNOWN_ENGINEERS[u.email?.toLowerCase()] || u.email}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setShowReinspect(null)} style={{ background: 'transparent', border: '1px solid #243F5C', borderRadius: 8, padding: '10px 20px', color: '#8A9BAD', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 10 }}>Cancel</button>
              <button style={s.save} type="submit" disabled={creatingReinspect}>
                {creatingReinspect ? 'Creating…' : 'Create Reinspection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

const GREY = '#8A9BAD'
const s = {
  page:        { minHeight: '100vh', background: '#0D1F35', color: '#fff' },
  header:      { background: '#1A3A5C', borderBottom: '1px solid #162840', padding: '0 32px' },
  headerInner: { maxWidth: 1600, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', flexWrap: 'wrap' },
  backBtn:     { background: 'none', border: '1px solid #EEFF00', borderRadius: 4, padding: '6px 14px', color: '#EEFF00', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' },
  title:       { color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 },
  tabs:        { display: 'flex', gap: 6 },
  tab:         { padding: '6px 14px', fontSize: 11, fontWeight: 700, borderRadius: 4, border: '1px solid #EEFF00', cursor: 'pointer', background: 'none', color: '#EEFF00', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tabActive:   { background: '#EEFF00', color: '#0D1F35' },

  filters:     { maxWidth: 1600, margin: '0 auto', display: 'flex', gap: 10, padding: '16px 32px 0' },
  input:       { background: '#162840', border: '1px solid #243F5C', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, outline: 'none' },

  content:     { maxWidth: 1600, margin: '0 auto', padding: '16px 32px 40px' },
  tableWrap:   { background: '#162840', borderRadius: 10, border: '1px solid #1A3A5C', overflow: 'hidden' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { background: '#0D1F35', color: '#8A9BAD', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '12px 14px', textAlign: 'left', borderBottom: '1px solid #1A3A5C' },
  row:         { cursor: 'pointer', borderBottom: '1px solid #1A3A5C' },
  td:          { padding: '12px 14px', fontSize: 13, color: '#fff', verticalAlign: 'middle' },
  projectName: { color: '#fff', fontWeight: 600 },
  completeBadge: { background: '#4CAF50', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginLeft: 8, verticalAlign: 'middle' },
  archivedBadge: { background: '#64748B', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginLeft: 8, verticalAlign: 'middle' },
  count:       { color: '#4A6580', fontSize: 11, marginTop: 8, textAlign: 'right' },

  // Reinspect modal
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal:       { background: '#0D1F35', borderRadius: 16, padding: '28px 32px', width: '100%', maxWidth: 620, border: '1px solid #1A3A5C', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' },
  grid:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  field:       { display: 'flex', flexDirection: 'column', gap: 6 },
  label:       { color: GREY, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  save:        { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
}
