import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import GridLayout from 'react-grid-layout'

const PANEL_LABELS = {
  projects: 'Projects', activity: 'Activity Feed', recent: 'Recent Inspections',
  remedials: 'Remedial Works', reinspection: 'Reinspection Due', workload: 'Inspector Workload',
}

const DEFAULT_LAYOUT = [
  { i: 'projects',     x: 0, y: 0,  w: 8, h: 12, minW: 4, minH: 6 },
  { i: 'recent',       x: 8, y: 0,  w: 4, h: 12, minW: 3, minH: 6 },
  { i: 'activity',     x: 0, y: 12, w: 4, h: 8,  minW: 3, minH: 5 },
  { i: 'remedials',    x: 4, y: 12, w: 4, h: 8,  minW: 3, minH: 5 },
  { i: 'reinspection', x: 8, y: 12, w: 4, h: 10, minW: 3, minH: 6 },
  { i: 'workload',     x: 0, y: 20, w: 4, h: 6,  minW: 3, minH: 4 },
]

function loadLayout() {
  try {
    const saved = localStorage.getItem('dashboardLayout2')
    if (saved) {
      const parsed = JSON.parse(saved)
      // merge in any new panels not in saved layout
      const ids = parsed.map(p => p.i)
      const missing = DEFAULT_LAYOUT.filter(p => !ids.includes(p.i))
      return [...parsed, ...missing]
    }
  } catch {}
  return DEFAULT_LAYOUT
}

const FLAT_DAYS     = 365
const COMMUNAL_DAYS = 90
const WARN_DAYS     = 30

function doorCategory(assembly) {
  return assembly?.toLowerCase().includes('flat entrance') ? 'flat' : 'communal'
}

function dueInfo(inspection) {
  const days   = doorCategory(inspection.doorset_assembly_type) === 'flat' ? FLAT_DAYS : COMMUNAL_DAYS
  const due    = new Date(inspection.created_at)
  due.setDate(due.getDate() + days)
  const diff   = Math.ceil((due - new Date()) / 86400000)
  const status = diff <= 0 ? 'overdue' : diff <= WARN_DAYS ? 'soon' : 'ok'
  return { due, diff, status }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs  = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (days > 0) return `${days}d ago`
  if (hrs  > 0) return `${hrs}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'just now'
}

export default function ProjectsPage() {
  const [projects,         setProjects]         = useState([])
  const [inspections,      setInspections]      = useState([])
  const [clients,          setClients]          = useState([])
  const [clientFilter,     setClientFilter]     = useState('')
  const [inspectorFilter,  setInspectorFilter]  = useState('')
  const [search,           setSearch]           = useState('')
  const [loading,          setLoading]          = useState(true)
  const [user,             setUser]             = useState(null)
  const [layout,     setLayout]     = useState(loadLayout)
  const [gridWidth,  setGridWidth]  = useState(window.innerWidth - 64)
  const navigate = useNavigate()

  useEffect(() => {
    const onResize = () => setGridWidth(window.innerWidth - 64)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function handleLayoutChange(newLayout) {
    setLayout(newLayout)
    localStorage.setItem('dashboardLayout2', JSON.stringify(newLayout))
  }

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
    const { data } = await supabase
      .from('inspections')
      .select('id, door_asset_id, door_location, doorset_assembly_type, inspection_passed, created_at, engineer_name, project_id, recommended_action, remedial_works_completed, projects(name, client_name)')
      .order('created_at', { ascending: false })
      .limit(500)
    setInspections(data || [])
  }

  async function fetchClients() {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    setClients(data || [])
  }

  // Latest inspection per door (deduped)
  const latestPerDoor = useMemo(() => {
    const seen = new Map()
    for (const ins of inspections) {
      if (!seen.has(ins.door_asset_id)) seen.set(ins.door_asset_id, ins)
    }
    return Array.from(seen.values())
  }, [inspections])

  // Filtered latest per door
  const filteredLatest = useMemo(() => {
    let list = latestPerDoor
    if (clientFilter)    list = list.filter(i => i.projects?.client_name === clientFilter)
    if (inspectorFilter) list = list.filter(i => i.engineer_name === inspectorFilter)
    return list
  }, [latestPerDoor, clientFilter, inspectorFilter])

  const overdue = filteredLatest.filter(i => dueInfo(i).status === 'overdue').sort((a,b) => dueInfo(a).diff - dueInfo(b).diff)
  const soon    = filteredLatest.filter(i => dueInfo(i).status === 'soon').sort((a,b)    => dueInfo(a).diff - dueInfo(b).diff)
  const allDueSorted = [...filteredLatest].sort((a,b) => dueInfo(a).diff - dueInfo(b).diff)

  // Remedials outstanding — latest inspection is Fail with Repair action
  const remedialsOutstanding = useMemo(() => filteredLatest.filter(i =>
    i.inspection_passed === 'Fail' && i.recommended_action?.toLowerCase().includes('repair')
  ), [filteredLatest])

  // Recent feed
  const recentFeed = useMemo(() => {
    let list = inspections
    if (clientFilter)    list = list.filter(i => i.projects?.client_name === clientFilter)
    if (inspectorFilter) list = list.filter(i => i.engineer_name === inspectorFilter)
    return list.slice(0, 15)
  }, [inspections, clientFilter, inspectorFilter])

  // Activity feed — group by engineer + project + day
  const activityFeed = useMemo(() => {
    const map = new Map()
    for (const ins of inspections.slice(0, 100)) {
      const d   = new Date(ins.created_at)
      const key = `${ins.engineer_name}__${ins.project_id}__${d.toDateString()}`
      if (!map.has(key)) map.set(key, {
        engineer:  ins.engineer_name,
        project:   ins.projects?.name,
        client:    ins.projects?.client_name,
        date:      ins.created_at,
        projectId: ins.project_id,
        count:     0,
      })
      map.get(key).count++
    }
    return Array.from(map.values()).slice(0, 8)
  }, [inspections])

  // Inspector workload this month
  const inspectorWorkload = useMemo(() => {
    const now  = new Date()
    const list = inspections.filter(i => {
      const d = new Date(i.created_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const counts = {}
    for (const i of list) {
      const name = i.engineer_name || 'Unknown'
      counts[name] = (counts[name] || 0) + 1
    }
    return Object.entries(counts).sort((a,b) => b[1] - a[1])
  }, [inspections])

  // Unique inspectors for filter
  const inspectors = useMemo(() => {
    const names = new Set(inspections.map(i => i.engineer_name).filter(Boolean))
    return Array.from(names).sort()
  }, [inspections])

  // Stats
  const totalDoors      = latestPerDoor.length
  const totalIns        = inspections.length
  const passRate        = totalIns > 0 ? Math.round((inspections.filter(i => i.inspection_passed === 'Pass').length / totalIns) * 100) : 0
  const dueCount        = overdue.length + soon.length
  const remedialCount   = remedialsOutstanding.length
  const thisMonthCount  = projects.filter(p => {
    const d = new Date(p.created_at), n = new Date()
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
  }).length

  // Projects search filter
  const filteredProjects = projects.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase())            ||
    p.address?.toLowerCase().includes(search.toLowerCase())        ||
    p.postcode?.toLowerCase().includes(search.toLowerCase())       ||
    p.client_name?.toLowerCase().includes(search.toLowerCase())    ||
    p.engineer_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={s.page}>

      {/* ── Header ── */}
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

      {/* ── Stats bar ── */}
      <div style={s.statsBar}>
        <StatChip label="Total Projects"    value={projects.length}    color="#8A9BAD" />
        <div style={s.statsDivider} />
        <StatChip label="Total Doors"       value={totalDoors}         color="#fff" />
        <div style={s.statsDivider} />
        <StatChip label="Pass Rate"         value={`${passRate}%`}     color="#4CAF50" />
        <div style={s.statsDivider} />
        <StatChip label="Due / Overdue"     value={dueCount}           color={dueCount     > 0 ? '#FF9800' : '#8A9BAD'} />
        <div style={s.statsDivider} />
        <StatChip label="Remedials Open"    value={remedialCount}      color={remedialCount > 0 ? '#F44336' : '#8A9BAD'} />
        <div style={s.statsDivider} />
        <StatChip label="Projects This Month" value={thisMonthCount}   color="#EEFF00" />
      </div>

      {/* ── Filters row ── */}
      <div style={s.filtersRow}>
        <input
          style={s.search}
          placeholder="Search projects, clients, inspectors, postcodes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={s.select} value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select style={s.select} value={inspectorFilter} onChange={e => setInspectorFilter(e.target.value)}>
          <option value="">All Inspectors</option>
          {inspectors.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* ── react-grid-layout dashboard ── */}
      <div style={{ padding: '0 32px 40px', maxWidth: 1600, margin: '0 auto' }}>
        <GridLayout
          layout={layout}
          cols={12}
          rowHeight={30}
          width={gridWidth}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".panel-drag-handle"
          margin={[10, 10]}
          containerPadding={[0, 0]}
          isResizable
          isDraggable
        >
            {layout.map(({ i: id }) => (
              <div key={id} style={{ background: '#162840', borderRadius: 12, border: '1px solid #1A3A5C', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
                {/* Panel header with drag handle */}
                <div className="panel-drag-handle" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #1A3A5C', cursor: 'grab', background: '#0D1F35', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <circle cx="4" cy="3" r="1.2" fill="#4A6580"/>
                    <circle cx="10" cy="3" r="1.2" fill="#4A6580"/>
                    <circle cx="4" cy="7" r="1.2" fill="#4A6580"/>
                    <circle cx="10" cy="7" r="1.2" fill="#4A6580"/>
                    <circle cx="4" cy="11" r="1.2" fill="#4A6580"/>
                    <circle cx="10" cy="11" r="1.2" fill="#4A6580"/>
                  </svg>
                  <span style={{ color: '#4A6580', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
                    {PANEL_LABELS[id]}
                  </span>
                  <span style={{ color: '#243F5C', fontSize: 9 }}>↔ resize corner</span>
                </div>
                {/* Panel content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {id === 'projects' && (
                  <>
                    <SectionTitle>Projects</SectionTitle>
                    {loading ? <Spinner /> : filteredProjects.length === 0 ? (
                      <p style={{ color: '#8A9BAD', textAlign: 'center', padding: 40 }}>No projects found.</p>
                    ) : (
                      <div style={s.tableWrap}>
                        <table style={s.table}>
                          <thead><tr>{['Project','Address','Client','Inspector','Created'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                          <tbody>
                            {filteredProjects.map(p => (
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
                  </>
                )}

                {id === 'activity' && (
                  <>
                    <SectionTitle>Activity Feed</SectionTitle>
                    <div style={s.panel}>
                      {activityFeed.length === 0
                        ? <p style={{ color: '#8A9BAD', fontSize: 13 }}>No activity yet.</p>
                        : activityFeed.map((g, i) => (
                          <div key={i} style={{ ...s.feedRow, cursor: g.projectId ? 'pointer' : 'default' }}
                            onClick={() => g.projectId && navigate(`/project/${g.projectId}`)}>
                            <div style={s.activityDot} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.4 }}>
                                <span style={{ color: '#EEFF00', fontWeight: 600 }}>{g.engineer || '—'}</span>{' '}inspected{' '}
                                <span style={{ color: '#fff', fontWeight: 700 }}>{g.count} door{g.count !== 1 ? 's' : ''}</span>{' '}
                                at <span style={{ color: '#fff' }}>{g.project || '—'}</span>
                              </div>
                              <div style={s.feedMeta}>{g.client || '—'} · {timeAgo(g.date)}</div>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </>
                )}

                {id === 'recent' && (
                  <>
                    <SectionTitle>Recent Inspections</SectionTitle>
                    <div style={s.panel}>
                      {recentFeed.length === 0
                        ? <p style={{ color: '#8A9BAD', fontSize: 13 }}>No inspections yet.</p>
                        : recentFeed.map(ins => (
                          <div key={ins.id} style={s.feedRow} onClick={() => ins.project_id && navigate(`/project/${ins.project_id}`)}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={s.feedDoor}>{ins.door_location || ins.door_asset_id || '—'}</div>
                              <div style={s.feedProject}>{ins.projects?.name || '—'} · {ins.projects?.client_name || '—'}</div>
                              <div style={s.feedMeta}>{new Date(ins.created_at).toLocaleDateString('en-GB')} · {ins.engineer_name || '—'}</div>
                            </div>
                            <PassBadge passed={ins.inspection_passed === 'Pass'} />
                          </div>
                        ))
                      }
                    </div>
                  </>
                )}

                {id === 'remedials' && (
                  <>
                    <SectionTitle>Remedial Works Outstanding</SectionTitle>
                    <div style={s.panel}>
                      {remedialsOutstanding.length === 0
                        ? <p style={{ color: '#4CAF50', fontSize: 13 }}>✓ No outstanding remedials.</p>
                        : remedialsOutstanding.map(ins => (
                          <div key={ins.id} style={{ ...s.feedRow, borderLeft: '3px solid #F44336', paddingLeft: 10, cursor: 'pointer' }}
                            onClick={() => ins.project_id && navigate(`/project/${ins.project_id}`)}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={s.feedDoor}>{ins.door_location || ins.door_asset_id || '—'}</div>
                              <div style={s.feedProject}>{ins.projects?.name || '—'} · {ins.projects?.client_name || '—'}</div>
                              <div style={{ ...s.feedMeta, color: '#F44336' }}>{ins.remedial_works_completed || ins.recommended_action || 'Repair required'}</div>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#F44336', flexShrink: 0 }}>ACTION</span>
                          </div>
                        ))
                      }
                    </div>
                  </>
                )}

                {id === 'reinspection' && (
                  <>
                    <SectionTitle>Reinspection Due</SectionTitle>
                    <div style={s.panel}>
                      {allDueSorted.length === 0
                        ? <p style={{ color: '#4CAF50', fontSize: 13 }}>✓ No doors yet.</p>
                        : allDueSorted.slice(0, 25).map(ins => <DueRow key={ins.id} ins={ins} navigate={navigate} />)
                      }
                    </div>
                  </>
                )}

                {id === 'workload' && (
                  <>
                    <SectionTitle>Inspector Workload <span style={{ color: '#4A6580', fontSize: 11, fontWeight: 400 }}>this month</span></SectionTitle>
                    <div style={s.panel}>
                      {inspectorWorkload.length === 0
                        ? <p style={{ color: '#8A9BAD', fontSize: 13 }}>No inspections this month.</p>
                        : inspectorWorkload.map(([name, count]) => {
                            const barW = Math.max(16, Math.round((count / inspectorWorkload[0][1]) * 120))
                            return (
                              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1A3A5C' }}>
                                <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                <div style={{ height: 6, borderRadius: 3, background: '#EEFF00', width: barW, flexShrink: 0 }} />
                                <span style={{ color: '#EEFF00', fontSize: 13, fontWeight: 700, minWidth: 28, textAlign: 'right' }}>{count}</span>
                              </div>
                            )
                          })
                      }
                    </div>
                  </>
                )}
                </div>
              </div>
            ))}
        </GridLayout>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function SectionTitle({ children, style }) {
  return <p style={{ color: '#8A9BAD', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px', ...style }}>{children}</p>
}

function DueRow({ ins, navigate }) {
  const { due, diff, status } = dueInfo(ins)
  const color = status === 'overdue' ? '#F44336' : status === 'soon' ? '#FF9800' : '#4CAF50'
  const label = status === 'overdue'
    ? `Overdue by ${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''}`
    : `Due in ${diff} day${diff !== 1 ? 's' : ''} · ${due.toLocaleDateString('en-GB')}`
  return (
    <div style={{ ...s.feedRow, borderLeft: `3px solid ${color}`, paddingLeft: 10, cursor: 'pointer' }}
      onClick={() => ins.project_id && navigate(`/project/${ins.project_id}`)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={s.feedDoor}>{ins.door_location || ins.door_asset_id || '—'}</div>
        <div style={s.feedProject}>{ins.projects?.name || '—'}</div>
        <div style={{ ...s.feedMeta, color }}>{label} · {due.toLocaleDateString('en-GB')}</div>
      </div>
      <div style={{ fontSize: 11, color, fontWeight: 700, flexShrink: 0 }}>
        {doorCategory(ins.doorset_assembly_type) === 'flat' ? 'FLAT' : 'COMM'}
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
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#8A9BAD', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}

function Spinner() {
  return <div style={{ width: 36, height: 36, border: '3px solid #162840', borderTop: '3px solid #EEFF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '60px auto' }} />
}

const s = {
  page:         { minHeight: '100vh', background: '#0D1F35' },
  header:       { background: '#0D1F35', padding: '0 32px', borderBottom: '3px solid #EEFF00' },
  headerInner:  { maxWidth: 1600, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0' },
  headerRight:  { display: 'flex', alignItems: 'center', gap: 12 },
  userEmail:    { color: '#fff', fontSize: 14, fontWeight: 500 },
  btn:          { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' },

  statsBar:     { maxWidth: 1600, margin: '0 auto', padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 0, borderBottom: '1px solid #162840' },
  statsDivider: { width: 1, height: 40, background: '#1A3A5C', flexShrink: 0, margin: '0 8px' },

  filtersRow:   { maxWidth: 1600, margin: '0 auto', padding: '16px 32px', display: 'flex', gap: 12 },
  search:       { flex: 1, background: '#162840', border: '1px solid #243F5C', borderRadius: 8, padding: '10px 16px', color: '#fff', fontSize: 14, outline: 'none' },
  select:       { background: '#162840', border: '1px solid #243F5C', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none', minWidth: 160 },

  body:         { maxWidth: 1600, margin: '0 auto', padding: '0 32px 40px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignItems: 'flex-start' },

  tableWrap:    { overflowX: 'auto', borderRadius: 12, border: '1px solid #162840', marginBottom: 4 },
  table:        { width: '100%', borderCollapse: 'collapse' },
  th:           { background: '#162840', padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#8A9BAD', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1A3A5C' },
  row:          { cursor: 'pointer', borderBottom: '1px solid #1A3A5C' },
  td:           { padding: '14px 16px', fontSize: 14, color: '#fff', verticalAlign: 'middle' },
  projectName:  { fontWeight: 700, fontSize: 15, color: '#fff' },

  panel:        { background: '#162840', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 },
  feedRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #1A3A5C', cursor: 'pointer' },
  feedDoor:     { color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  feedProject:  { color: '#8A9BAD', fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  feedMeta:     { color: '#4A6580', fontSize: 11, marginTop: 2 },
  activityDot:  { width: 8, height: 8, borderRadius: '50%', background: '#EEFF00', flexShrink: 0 },
}
