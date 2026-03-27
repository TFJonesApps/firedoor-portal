import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FLAT_DAYS      = 365
const COMMUNAL_DAYS  = 90
const WARN_DAYS      = 30

function doorCategory(assembly) {
  return assembly?.toLowerCase().includes('flat entrance') ? 'flat' : 'communal'
}

function dueInfo(inspection) {
  const days  = doorCategory(inspection.doorset_assembly_type) === 'flat' ? FLAT_DAYS : COMMUNAL_DAYS
  const due   = new Date(inspection.created_at)
  due.setDate(due.getDate() + days)
  const diff  = Math.ceil((due - new Date()) / 86400000)
  const status = diff <= 0 ? 'overdue' : diff <= WARN_DAYS ? 'soon' : 'ok'
  return { due, diff, status }
}

export default function ProjectsPage() {
  const [projects, setProjects]         = useState([])
  const [inspections, setInspections]   = useState([])
  const [clients, setClients]           = useState([])
  const [clientFilter, setClientFilter] = useState('')
  const [search, setSearch]             = useState('')
  const [loading, setLoading]           = useState(true)
  const [user, setUser]                 = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    Promise.all([fetchProjects(), fetchInspections(), fetchClients()])
  }, [])

  async function fetchProjects() {
    setLoading(true)
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  async function fetchInspections() {
    // Fetch enough to dedup per door for due panel + recent feed
    const { data } = await supabase
      .from('inspections')
      .select('id, door_asset_id, door_location, doorset_assembly_type, inspection_passed, created_at, engineer_name, project_id, projects(name, client_name)')
      .order('created_at', { ascending: false })
      .limit(500)
    setInspections(data || [])
  }

  async function fetchClients() {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    setClients(data || [])
  }

  // Latest inspection per door (for due panel)
  const latestPerDoor = useMemo(() => {
    const seen = new Map()
    for (const ins of inspections) {
      if (!seen.has(ins.door_asset_id)) seen.set(ins.door_asset_id, ins)
    }
    return Array.from(seen.values())
  }, [inspections])

  // Filter by client
  const filteredLatest = useMemo(() => {
    if (!clientFilter) return latestPerDoor
    return latestPerDoor.filter(i => i.projects?.client_name === clientFilter)
  }, [latestPerDoor, clientFilter])

  const overdue = filteredLatest.filter(i => dueInfo(i).status === 'overdue').sort((a,b) => dueInfo(a).diff - dueInfo(b).diff)
  const soon    = filteredLatest.filter(i => dueInfo(i).status === 'soon').sort((a,b) => dueInfo(a).diff - dueInfo(b).diff)

  // Recent feed (filtered by client)
  const recentFeed = useMemo(() => {
    let list = inspections
    if (clientFilter) list = list.filter(i => i.projects?.client_name === clientFilter)
    return list.slice(0, 12)
  }, [inspections, clientFilter])

  const filtered = projects.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.address?.toLowerCase().includes(search.toLowerCase()) ||
    p.postcode?.toLowerCase().includes(search.toLowerCase()) ||
    p.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.engineer_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <img src="/tfj_logo.png" alt="TF Jones" style={{ height: 42, objectFit: 'contain' }} />
            <div style={{ width: 1, height: 36, background: '#fff', opacity: 0.15 }} />
            <div>
              <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>Fire Door Inspection Portal</p>
              <p style={{ color: '#8A9BAD', fontSize: 12, margin: 0, marginTop: 2 }}>TF Jones</p>
            </div>
          </div>
          <div style={s.headerRight}>
            <span style={s.userEmail}>{user?.email}</span>
            <button style={s.btn} onClick={() => navigate('/users')}>Users</button>
            <button style={s.btn} onClick={() => supabase.auth.signOut()}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={s.body}>
        {/* Left panel — projects */}
        <div style={s.left}>
          <div style={s.statsRow}>
            <StatChip label="Total Projects" value={projects.length} color="#8A9BAD" />
            <StatChip label="This Month" value={projects.filter(p => {
              const d = new Date(p.created_at); const n = new Date()
              return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
            }).length} color="#EEFF00" />
          </div>

          <input
            style={s.search}
            placeholder="Search projects, clients, inspectors, postcodes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {loading ? <Spinner /> : filtered.length === 0 ? (
            <p style={{ color: '#8A9BAD', textAlign: 'center', padding: 40 }}>No projects found.</p>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>{['Project','Address','Client','Inspector','Created'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} style={s.row} onClick={() => navigate(`/project/${p.id}`, { state: { project: p } })}>
                      <td style={s.td}><span style={s.projectName}>{p.name}</span></td>
                      <td style={s.td}><span style={{ color: '#CBD5E1' }}>{[p.address, p.postcode].filter(Boolean).join(', ') || '—'}</span></td>
                      <td style={s.td}><span style={{ color: '#EEFF00', fontWeight: 600 }}>{p.client_name || '—'}</span></td>
                      <td style={s.td}><span style={{ color: '#fff', fontWeight: 500 }}>{p.engineer_name || '—'}</span></td>
                      <td style={s.td}><span style={{ color: '#94A3B8' }}>{new Date(p.created_at).toLocaleDateString('en-GB')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={s.right}>
          {/* Client filter */}
          <select style={s.clientFilter} value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>

          {/* Due / Overdue */}
          {(overdue.length > 0 || soon.length > 0) && (
            <div style={s.panel}>
              <p style={s.panelTitle}>Reinspection Due</p>
              {overdue.map(ins => <DueRow key={ins.id} ins={ins} navigate={navigate} />)}
              {soon.map(ins   => <DueRow key={ins.id} ins={ins} navigate={navigate} />)}
            </div>
          )}

          {/* Recent inspections */}
          <div style={s.panel}>
            <p style={s.panelTitle}>Recent Inspections</p>
            {recentFeed.length === 0 ? (
              <p style={{ color: '#8A9BAD', fontSize: 13, padding: '8px 0' }}>No inspections yet.</p>
            ) : recentFeed.map(ins => (
              <div
                key={ins.id}
                style={s.feedRow}
                onClick={() => ins.project_id && navigate(`/project/${ins.project_id}`)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.feedDoor}>{ins.door_location || ins.door_asset_id || '—'}</div>
                  <div style={s.feedProject}>{ins.projects?.name || '—'} · {ins.projects?.client_name || '—'}</div>
                  <div style={s.feedMeta}>{new Date(ins.created_at).toLocaleDateString('en-GB')} · {ins.engineer_name || '—'}</div>
                </div>
                <PassBadge passed={ins.inspection_passed === 'Pass'} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DueRow({ ins, navigate }) {
  const { due, diff, status } = dueInfo(ins)
  const color = status === 'overdue' ? '#F44336' : '#FF9800'
  const label = status === 'overdue'
    ? `Overdue by ${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''}`
    : `Due in ${diff} day${diff !== 1 ? 's' : ''}`
  return (
    <div style={{ ...s.feedRow, borderLeft: `3px solid ${color}`, paddingLeft: 10 }}
      onClick={() => ins.project_id && navigate(`/project/${ins.project_id}`)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={s.feedDoor}>{ins.door_location || ins.door_asset_id || '—'}</div>
        <div style={s.feedProject}>{ins.projects?.name || '—'}</div>
        <div style={{ ...s.feedMeta, color }}>{label} · {due.toLocaleDateString('en-GB')}</div>
      </div>
      <div style={{ fontSize: 11, color, fontWeight: 700, flexShrink: 0 }}>
        {doorCategory(ins.doorset_assembly_type) === 'flat' ? 'FLAT' : 'COMMUNAL'}
      </div>
    </div>
  )
}

function PassBadge({ passed }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: passed ? '#0A2E1A' : '#2E0A0A', color: passed ? '#4CAF50' : '#F44336', flexShrink: 0 }}>
      {passed ? 'PASS' : 'FAIL'}
    </span>
  )
}

function StatChip({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#8A9BAD', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}

function Spinner() {
  return <div style={{ width: 36, height: 36, border: '3px solid #162840', borderTop: '3px solid #EEFF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '60px auto' }} />
}

const s = {
  page:        { minHeight: '100vh', background: '#0D1F35' },
  header:      { background: '#0D1F35', padding: '0 32px', borderBottom: '3px solid #EEFF00' },
  headerInner: { maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  userEmail:   { color: '#fff', fontSize: 14, fontWeight: 500 },
  btn:         { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  body:        { maxWidth: 1400, margin: '0 auto', padding: '24px 32px', display: 'flex', gap: 24, alignItems: 'flex-start' },
  left:        { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },
  right:       { width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 },
  statsRow:    { display: 'flex', gap: 32 },
  search:      { background: '#162840', border: '1px solid #243F5C', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 15, width: '100%', outline: 'none', boxSizing: 'border-box' },
  tableWrap:   { overflowX: 'auto', borderRadius: 12, border: '1px solid #162840' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { background: '#162840', padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#8A9BAD', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1A3A5C' },
  row:         { cursor: 'pointer', borderBottom: '1px solid #1A3A5C' },
  td:          { padding: '16px 16px', fontSize: 15, color: '#fff', verticalAlign: 'middle' },
  projectName: { fontWeight: 700, fontSize: 16, color: '#fff' },
  clientFilter:{ background: '#162840', border: '1px solid #243F5C', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, width: '100%', outline: 'none' },
  panel:       { background: '#162840', borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 2 },
  panelTitle:  { color: '#8A9BAD', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' },
  feedRow:     { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #1A3A5C', cursor: 'pointer' },
  feedDoor:    { color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  feedProject: { color: '#8A9BAD', fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  feedMeta:    { color: '#4A6580', fontSize: 11, marginTop: 2 },
}
