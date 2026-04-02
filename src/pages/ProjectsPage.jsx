import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import GridLayout from 'react-grid-layout'

// Inject pulse animation for live indicator
if (!document.getElementById('live-pulse-style')) {
  const style = document.createElement('style')
  style.id = 'live-pulse-style'
  style.textContent = `@keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`
  document.head.appendChild(style)
}

const KNOWN_ENGINEERS = {
  'lee.bates@tfjones.com': 'Lee Bates',
  'david.metcalfe@tfjones.com': 'David Metcalfe',
  'trevor.mccormick@tfjones.com': 'Trevor McCormick',
  'allan.hughes@tfjones.com': 'Allan Hughes',
  'gareth.robertson@tfjones.com': 'Gareth Robertson',
  'keiran.thompson@tfjones.com': 'Keiran Thompson',
  'jwild.tfjones@gmail.com': 'John Wild',
}

const PANEL_LABELS = {
  projects: 'Projects', recent: 'Recent Inspections',
  remedials: 'Remedial Works', reinspection: 'Reinspection Due', workload: 'Inspector Workload',
}

const DEFAULT_LAYOUT = [
  { i: 'projects',     x: 0, y: 0,  w: 8, h: 12, minW: 2, minH: 2 },
  { i: 'recent',       x: 8, y: 0,  w: 4, h: 12, minW: 2, minH: 2 },
  { i: 'remedials',    x: 0, y: 12, w: 4, h: 8,  minW: 2, minH: 2 },
  { i: 'reinspection', x: 4, y: 12, w: 4, h: 10, minW: 2, minH: 2 },
  { i: 'workload',     x: 8, y: 12, w: 4, h: 6,  minW: 2, minH: 2 },
]

const LAYOUT_KEY = 'dashboardLayout4'

function loadLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Always enforce minW/minH from DEFAULT_LAYOUT so old saved values never block resizing
      const defaults = Object.fromEntries(DEFAULT_LAYOUT.map(p => [p.i, p]))
      const merged = parsed.map(p => ({ ...p, minW: defaults[p.i]?.minW ?? 2, minH: defaults[p.i]?.minH ?? 2 }))
      // Add any new panels not in saved layout
      const ids = merged.map(p => p.i)
      const missing = DEFAULT_LAYOUT.filter(p => !ids.includes(p.i))
      return [...merged, ...missing]
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
  const [layout,        setLayout]        = useState(loadLayout)
  const [gridWidth,     setGridWidth]     = useState(window.innerWidth - 64)
  const [showCalendar,  setShowCalendar]  = useState(false)
  const [showExport,    setShowExport]    = useState(false)
  const [showArchived,  setShowArchived]  = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [newProject, setNewProject] = useState({ name: '', address: '', postcode: '', client_id: '', order_number: '', engineer_id: '' })
  const [creatingProject, setCreatingProject] = useState(false)
  const [createProjectError, setCreateProjectError] = useState('')
  const [inspectorUsers, setInspectorUsers] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    const onResize = () => setGridWidth(window.innerWidth - 64)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function handleLayoutChange(newLayout) {
    setLayout(newLayout)
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(newLayout))
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    Promise.all([fetchProjects(), fetchInspections(), fetchClients(), fetchInspectors()])

    // Real-time subscriptions — auto-refresh when data changes
    const projectSub = supabase.channel('projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchProjects())
      .subscribe()
    const inspectionSub = supabase.channel('inspections-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inspections' }, () => fetchInspections())
      .subscribe()

    return () => {
      supabase.removeChannel(projectSub)
      supabase.removeChannel(inspectionSub)
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
      .select('id, door_asset_id, door_location, doorset_assembly_type, inspection_passed, created_at, engineer_id, engineer_name, project_id, recommended_action, remedial_works_completed, projects(name, client_name)')
      .order('created_at', { ascending: false })
      .limit(500)
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

  async function createProject(e) {
    e.preventDefault()
    setCreatingProject(true)
    setCreateProjectError('')
    try {
      const inspector = inspectorUsers.find(u => u.id === newProject.engineer_id)
      const engineerEmail = inspector?.email || ''
      const engineerName = KNOWN_ENGINEERS[engineerEmail.toLowerCase()] || engineerEmail
      const client = clients.find(c => c.id === newProject.client_id)
      const { error } = await supabase.from('projects').insert({
        name: newProject.name,
        address: newProject.address || null,
        postcode: newProject.postcode || null,
        client_id: newProject.client_id || null,
        client_name: client?.name || null,
        order_number: newProject.order_number || null,
        engineer_id: newProject.engineer_id,
        engineer_name: engineerName,
        created_at: Date.now(),
      })
      if (error) throw error
      setShowCreateProject(false)
      setNewProject({ name: '', address: '', postcode: '', client_id: '', order_number: '', engineer_id: '' })
      await fetchProjects()
    } catch (err) {
      setCreateProjectError(err.message)
    }
    setCreatingProject(false)
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
  // Build a map of engineer_id -> best display name for filter matching
  const engineerIdToName = useMemo(() => {
    const map = {}
    for (const i of inspections) {
      const eid = i.engineer_id
      if (!eid) continue
      const name = KNOWN_ENGINEERS[i.engineer_name?.toLowerCase()] || i.engineer_name || eid
      if (!map[eid] || (map[eid].includes('@') && !name.includes('@'))) map[eid] = name
    }
    return map
  }, [inspections])

  const filteredLatest = useMemo(() => {
    let list = latestPerDoor
    if (clientFilter)    list = list.filter(i => i.projects?.client_name === clientFilter)
    if (inspectorFilter) list = list.filter(i => {
      if (i.engineer_name === inspectorFilter) return true
      return i.engineer_id && engineerIdToName[i.engineer_id] === inspectorFilter
    })
    return list
  }, [latestPerDoor, clientFilter, inspectorFilter, engineerIdToName])

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
    if (inspectorFilter) list = list.filter(i => {
      if (i.engineer_name === inspectorFilter) return true
      return i.engineer_id && engineerIdToName[i.engineer_id] === inspectorFilter
    })
    return list.slice(0, 15)
  }, [inspections, clientFilter, inspectorFilter, engineerIdToName])



  // Inspector workload this month — group by engineer_id, display best name
  const inspectorWorkload = useMemo(() => {
    const now  = new Date()
    const list = inspections.filter(i => {
      const d = new Date(i.created_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const counts = {}  // keyed by engineer_id
    const names  = {}  // best display name per engineer_id
    for (const i of list) {
      const eid  = i.engineer_id || i.engineer_name || 'Unknown'
      const name = i.engineer_name || 'Unknown'
      counts[eid] = (counts[eid] || 0) + 1
      // Prefer a real name over an email address
      if (!names[eid] || (names[eid].includes('@') && !name.includes('@'))) {
        names[eid] = name
      }
    }
    return Object.entries(counts)
      .map(([eid, count]) => [names[eid] || eid, count])
      .sort((a,b) => b[1] - a[1])
  }, [inspections])

  // Unique inspectors for filter — deduplicate by engineer_id, prefer real name
  const inspectors = useMemo(() => {
    const map = {}
    for (const i of inspections) {
      const eid = i.engineer_id || i.engineer_name
      if (!eid) continue
      const name = i.engineer_name || eid
      if (!map[eid] || (map[eid].includes('@') && !name.includes('@'))) {
        map[eid] = name
      }
    }
    return [...new Set(Object.values(map))].sort()
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

  // Projects search + archive filter
  const filteredProjects = projects.filter(p => {
    const archived = p.is_archived === true
    if (showArchived !== archived) return false
    const q = search.toLowerCase()
    return !q ||
      p.name?.toLowerCase().includes(q)          ||
      p.address?.toLowerCase().includes(q)       ||
      p.postcode?.toLowerCase().includes(q)      ||
      p.client_name?.toLowerCase().includes(q)   ||
      p.engineer_name?.toLowerCase().includes(q) ||
      p.order_number?.toLowerCase().includes(q)
  })

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <p style={{ color: '#8A9BAD', fontSize: 12, margin: 0 }}>TF Jones</p>
                <span style={s.liveBadge}><span style={s.liveDot} /> LIVE</span>
              </div>
            </div>
          </div>
          <div style={s.headerRight}>
            <span style={s.userEmail}>{user?.email}</span>
            <button style={s.btn} onClick={() => navigate('/users')}>Users</button>
            <button style={s.btn} onClick={() => supabase.auth.signOut()}>Sign Out</button>
          </div>
        </div>
      </div>

      {/* ── Stats bar with tools ── */}
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
        <div style={{ flex: 1 }} />
        <button style={s.toolBtn} onClick={() => navigate('/door-history')}>🚪 Door History</button>
        <button style={s.toolBtn} onClick={() => setShowExport(true)}>⬇ Export</button>
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
              <div key={id} style={{ background: '#162840', borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
                {/* Panel header with drag handle */}
                <div className="panel-drag-handle" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.12)', cursor: 'grab', background: '#0D1F35', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <circle cx="4" cy="3" r="1.2" fill="#8A9BAD"/>
                    <circle cx="10" cy="3" r="1.2" fill="#8A9BAD"/>
                    <circle cx="4" cy="7" r="1.2" fill="#8A9BAD"/>
                    <circle cx="10" cy="7" r="1.2" fill="#8A9BAD"/>
                    <circle cx="4" cy="11" r="1.2" fill="#8A9BAD"/>
                    <circle cx="10" cy="11" r="1.2" fill="#8A9BAD"/>
                  </svg>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
                    {PANEL_LABELS[id]}
                  </span>
                  <span style={{ color: '#3A5570', fontSize: 9 }}>↔ resize corner</span>
                </div>
                {/* Panel content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {id === 'projects' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <SectionTitle>Projects</SectionTitle>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { setShowCreateProject(v => !v); setCreateProjectError('') }}
                          style={s.cpBtn}
                        >{ showCreateProject ? 'Cancel' : '+ New Project' }</button>
                        <button
                          onClick={() => setShowArchived(false)}
                          style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: !showArchived ? '#EEFF00' : '#1A3A5C', color: !showArchived ? '#0D1F35' : '#8A9BAD' }}
                        >Active</button>
                        <button
                          onClick={() => setShowArchived(true)}
                          style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: showArchived ? '#EEFF00' : '#1A3A5C', color: showArchived ? '#0D1F35' : '#8A9BAD' }}
                        >Archived</button>
                      </div>
                    </div>
                    {loading ? <Spinner /> : filteredProjects.length === 0 ? (
                      <p style={{ color: '#8A9BAD', textAlign: 'center', padding: 40 }}>No projects found.</p>
                    ) : (
                      <div style={s.tableWrap}>
                        <table style={s.table}>
                          <thead><tr>{['Project','Address','Client','Order No.','Inspector','Created'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                          <tbody>
                            {filteredProjects.map(p => (
                              <tr key={p.id} style={s.row} onClick={() => navigate(`/project/${p.id}`, { state: { project: p } })}>
                                <td style={s.td}><span style={s.projectName}>{p.name}</span></td>
                                <td style={s.td}><span style={{ color: '#CBD5E1' }}>{[p.address, p.postcode].filter(Boolean).join(', ') || '—'}</span></td>
                                <td style={s.td}><span style={{ color: '#EEFF00', fontWeight: 600 }}>{p.client_name || '—'}</span></td>
                                <td style={s.td}><span style={{ color: '#CBD5E1' }}>{p.order_number || '—'}</span></td>
                                <td style={s.td}><span style={{ color: '#fff', fontWeight: 500 }}>{(p.engineer_id && engineerIdToName[p.engineer_id]) || KNOWN_ENGINEERS[p.engineer_name?.toLowerCase()] || (p.engineer_name?.includes('@') ? '—' : p.engineer_name) || '—'}</span></td>
                                <td style={s.td}><span style={{ color: '#94A3B8' }}>{new Date(p.created_at).toLocaleDateString('en-GB')}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
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
                              <div style={s.feedMeta}>{new Date(ins.created_at).toLocaleDateString('en-GB')} · {(ins.engineer_id && engineerIdToName[ins.engineer_id]) || ins.engineer_name || '—'}</div>
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <SectionTitle style={{ margin: 0 }}>Reinspection Due</SectionTitle>
                      <button
                        onClick={() => setShowCalendar(true)}
                        style={{ background: '#1A3A5C', border: '1px solid #243F5C', borderRadius: 6, padding: '4px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        📅 Calendar
                      </button>
                    </div>
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

      {showCreateProject && (
        <div style={s.cpOverlay} onClick={() => setShowCreateProject(false)}>
          <form onSubmit={createProject} style={s.cpModal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Create New Project</h2>
              <button type="button" onClick={() => setShowCreateProject(false)} style={{ background: 'none', border: 'none', color: '#8A9BAD', fontSize: 22, cursor: 'pointer', padding: '0 4px' }}>&times;</button>
            </div>
            <div style={s.cpGrid}>
              <div style={s.cpField}>
                <label style={s.cpLabel}>Project Name *</label>
                <input style={s.cpInput} required placeholder="e.g. Block A Fire Doors" value={newProject.name} onChange={e => setNewProject(v => ({ ...v, name: e.target.value }))} />
              </div>
              <div style={s.cpField}>
                <label style={s.cpLabel}>Address</label>
                <input style={s.cpInput} placeholder="Site address" value={newProject.address} onChange={e => setNewProject(v => ({ ...v, address: e.target.value }))} />
              </div>
              <div style={s.cpField}>
                <label style={s.cpLabel}>Postcode</label>
                <input style={s.cpInput} placeholder="e.g. WN1 1AA" value={newProject.postcode} onChange={e => setNewProject(v => ({ ...v, postcode: e.target.value }))} />
              </div>
              <div style={s.cpField}>
                <label style={s.cpLabel}>Client</label>
                <select style={s.cpInput} value={newProject.client_id} onChange={e => setNewProject(v => ({ ...v, client_id: e.target.value }))}>
                  <option value="">— Select Client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={s.cpField}>
                <label style={s.cpLabel}>Order Number</label>
                <input style={s.cpInput} placeholder="e.g. ORD-001" value={newProject.order_number} onChange={e => setNewProject(v => ({ ...v, order_number: e.target.value }))} />
              </div>
              <div style={s.cpField}>
                <label style={s.cpLabel}>Assign to Inspector *</label>
                <select style={s.cpInput} required value={newProject.engineer_id} onChange={e => setNewProject(v => ({ ...v, engineer_id: e.target.value }))}>
                  <option value="">— Select Inspector —</option>
                  {inspectorUsers.map(u => <option key={u.id} value={u.id}>{KNOWN_ENGINEERS[u.email?.toLowerCase()] || u.email}</option>)}
                </select>
              </div>
            </div>
            {createProjectError && <p style={{ color: '#F44336', fontSize: 13, margin: '12px 0 0' }}>{createProjectError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setShowCreateProject(false)} style={{ background: 'transparent', border: '1px solid #243F5C', borderRadius: 8, padding: '10px 20px', color: '#8A9BAD', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 10 }}>Cancel</button>
              <button style={s.cpSave} type="submit" disabled={creatingProject}>
                {creatingProject ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showCalendar && (
        <CalendarModal doors={allDueSorted} onClose={() => setShowCalendar(false)} navigate={navigate} />
      )}
      {showExport && (
        <ExportModal onClose={() => setShowExport(false)} />
      )}
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

function downloadCsv(filename, headers, rows) {
  const csv  = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: filename }).click()
  URL.revokeObjectURL(url)
}

function ExportModal({ onClose }) {
  const [busy, setBusy] = useState(null)

  const exports = [
    {
      id: 'projects',
      title: 'All Projects',
      desc: 'Name, address, client, inspector, door count, pass rate, created date, notes',
      icon: '🏢',
      run: async () => {
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name, address, postcode, client_name, engineer_name, created_at, notes')
          .order('created_at', { ascending: false })
        const { data: inspections } = await supabase
          .from('inspections')
          .select('project_id, inspection_passed')
        const statsMap = {}
        for (const i of (inspections || [])) {
          if (!statsMap[i.project_id]) statsMap[i.project_id] = { total: 0, pass: 0 }
          statsMap[i.project_id].total++
          if (i.inspection_passed === 'Pass') statsMap[i.project_id].pass++
        }
        downloadCsv('projects.csv',
          ['Project Name','Address','Postcode','Client','Inspector','Created','Total Doors','Pass','Fail','Pass Rate %','Notes'],
          (projects || []).map(p => {
            const s = statsMap[p.id] || { total: 0, pass: 0 }
            const fail = s.total - s.pass
            const rate = s.total ? Math.round((s.pass / s.total) * 100) : ''
            return [p.name, p.address, p.postcode, p.client_name, p.engineer_name, new Date(p.created_at).toLocaleDateString('en-GB'), s.total, s.pass, fail, rate, p.notes]
          })
        )
      },
    },
    {
      id: 'inspections',
      title: 'All Inspections',
      desc: 'Complete record — every field captured during inspection including gaps, hardware, seals, remedials, and photos',
      icon: '🚪',
      run: async () => {
        const { data } = await supabase
          .from('inspections')
          .select('*, projects(name, client_name, address, postcode)')
          .order('created_at', { ascending: false })
        downloadCsv('inspections_full.csv',
          [
            'Project','Client','Address','Postcode',
            'Inspection Date','Inspector','Result',
            'Door Location','Door ID',
            'Survey Type','Assembly Type','Configuration','Fire Rating','Fire Door ID Type',
            'Leaf Sizes (mm)','Add-ons',
            'Glazing OK','Structure Intact','Door/Frame Condition',
            '3mm Gap Tolerance','Gap Hinge Side','Gap Lock Side','Gap Head','Gap Threshold (mm)','Threshold Within Tolerance',
            'Leaf Flush to Rebates','Self-Closing Device','Hinges Acceptable',
            'Essential Hardware','Correct Signage','Intumescent Seals','Fire Stopping',
            'Recommended Action','Remedial Works','Repair Actions','Replacement Reason',
            'Remedial Actioned','Actioned Date','Actioned By','Action Note',
            'Photo Outside','Photo Inside','Photo 1','Photo 2','Photo 3','Photo 4','Photo 5','Photo 6',
          ],
          (data || []).map(i => [
            i.projects?.name, i.projects?.client_name, i.projects?.address, i.projects?.postcode,
            new Date(i.created_at).toLocaleDateString('en-GB'), i.engineer_name, i.inspection_passed,
            i.door_location, i.door_asset_id,
            i.survey_type, i.doorset_assembly_type, i.doorset_configuration, i.fire_rating, i.fire_door_id_type,
            i.leaf_sizes_mm, i.additional_addons,
            i.glazing_free_from_damage, i.surrounding_structure_intact, i.condition_door_leaf_frame,
            i.gap_3mm_tolerance, i.gap_hinge_side, i.gap_lock_side, i.gap_head, i.gap_threshold_mm, i.threshold_gap_within_tolerance,
            i.leaf_flush_to_rebates, i.self_closing_device, i.hinges_condition_acceptable,
            i.essential_hardware_acceptable, i.correct_signage_present, i.intumescent_seals_acceptable, i.fire_stopping_acceptable,
            i.recommended_action, i.remedial_works_completed, i.recommended_repair_actions, i.replacement_reason,
            i.remedial_actioned ? 'Yes' : 'No',
            i.remedial_actioned_at ? new Date(i.remedial_actioned_at).toLocaleDateString('en-GB') : '',
            i.remedial_actioned_by, i.remedial_action_note,
            i.photo_outside_url, i.photo_inside_url, i.photo1_url, i.photo2_url, i.photo3_url, i.photo4_url, i.photo5_url, i.photo6_url,
          ])
        )
      },
    },
    {
      id: 'remedials',
      title: 'Remedials Outstanding',
      desc: 'Failed doors not yet actioned — door, project, client, address, inspector, date, action required',
      icon: '🔧',
      run: async () => {
        const { data } = await supabase
          .from('inspections')
          .select('door_location, door_asset_id, doorset_assembly_type, fire_rating, recommended_action, remedial_works_completed, engineer_name, created_at, projects(name, address, postcode, client_name)')
          .eq('inspection_passed', 'Fail')
          .eq('remedial_actioned', false)
          .order('created_at', { ascending: false })
        downloadCsv('remedials_outstanding.csv',
          ['Door Location','Door ID','Assembly Type','Fire Rating','Project','Client','Address','Postcode','Inspector','Inspection Date','Recommended Action','Remedial Works'],
          (data || []).map(i => [
            i.door_location, i.door_asset_id, i.doorset_assembly_type, i.fire_rating,
            i.projects?.name, i.projects?.client_name, i.projects?.address, i.projects?.postcode,
            i.engineer_name, new Date(i.created_at).toLocaleDateString('en-GB'),
            i.recommended_action, i.remedial_works_completed,
          ])
        )
      },
    },
    {
      id: 'actioned',
      title: 'Actioned Remedials',
      desc: 'Completed remedials — original action, who actioned it, when, note, project, client, address',
      icon: '✅',
      run: async () => {
        const { data } = await supabase
          .from('inspections')
          .select('door_location, door_asset_id, doorset_assembly_type, fire_rating, recommended_action, remedial_works_completed, engineer_name, created_at, remedial_actioned_at, remedial_actioned_by, remedial_action_note, projects(name, client_name, address, postcode)')
          .eq('remedial_actioned', true)
          .order('remedial_actioned_at', { ascending: false })
        downloadCsv('actioned_remedials.csv',
          ['Door Location','Door ID','Assembly Type','Fire Rating','Project','Client','Address','Postcode','Inspector','Inspection Date','Recommended Action','Remedial Works','Actioned Date','Actioned By','Action Note'],
          (data || []).map(i => [
            i.door_location, i.door_asset_id, i.doorset_assembly_type, i.fire_rating,
            i.projects?.name, i.projects?.client_name, i.projects?.address, i.projects?.postcode,
            i.engineer_name, new Date(i.created_at).toLocaleDateString('en-GB'),
            i.recommended_action, i.remedial_works_completed,
            i.remedial_actioned_at ? new Date(i.remedial_actioned_at).toLocaleDateString('en-GB') : '',
            i.remedial_actioned_by, i.remedial_action_note,
          ])
        )
      },
    },
    {
      id: 'reinspection',
      title: 'Reinspection Schedule',
      desc: 'All doors with due date, status, days remaining, type, last result, inspector, project, client, address',
      icon: '📅',
      run: async () => {
        const { data } = await supabase
          .from('inspections')
          .select('door_location, door_asset_id, doorset_assembly_type, fire_rating, inspection_passed, created_at, engineer_name, projects(name, client_name, address, postcode)')
          .order('created_at', { ascending: false })
        const seen = new Map()
        for (const ins of (data || [])) {
          if (!seen.has(ins.door_asset_id)) seen.set(ins.door_asset_id, ins)
        }
        const rows = Array.from(seen.values()).map(ins => {
          const { due, diff, status } = dueInfo(ins)
          return [
            ins.door_location, ins.door_asset_id,
            doorCategory(ins.doorset_assembly_type) === 'flat' ? 'Flat Entrance' : 'Communal',
            ins.fire_rating, ins.inspection_passed, ins.engineer_name,
            new Date(ins.created_at).toLocaleDateString('en-GB'),
            due.toLocaleDateString('en-GB'),
            status === 'overdue' ? `Overdue by ${Math.abs(diff)} days` : `${diff} days`,
            status.charAt(0).toUpperCase() + status.slice(1),
            ins.projects?.name, ins.projects?.client_name, ins.projects?.address, ins.projects?.postcode,
          ]
        }).sort((a, b) => {
          const statusOrder = { overdue: 0, soon: 1, ok: 2 }
          return (statusOrder[a[9].toLowerCase()] - statusOrder[b[9].toLowerCase()]) || a[7].localeCompare(b[7])
        })
        downloadCsv('reinspection_schedule.csv',
          ['Door Location','Door ID','Type','Fire Rating','Last Result','Inspector','Last Inspected','Next Due','Days Remaining','Status','Project','Client','Address','Postcode'],
          rows
        )
      },
    },
  ]

  async function run(exp) {
    setBusy(exp.id)
    try { await exp.run() } catch(e) { alert('Export failed: ' + e.message) }
    setBusy(null)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={onClose}>
      <div style={{ background: '#0D1F35', borderRadius: 16, border: '1px solid rgba(255,255,255,0.15)', width: '100%', maxWidth: 560, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 800 }}>Export Data</h2>
            <p style={{ color: '#8A9BAD', margin: '4px 0 0', fontSize: 13 }}>Download data as CSV — opens in Excel</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#8A9BAD', fontSize: 22, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {exports.map(exp => (
            <div key={exp.id} style={{ background: '#162840', borderRadius: 10, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, border: '1px solid #1A3A5C' }}>
              <span style={{ fontSize: 28 }}>{exp.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{exp.title}</div>
                <div style={{ color: '#8A9BAD', fontSize: 12, marginTop: 2 }}>{exp.desc}</div>
              </div>
              <button
                onClick={() => run(exp)}
                disabled={busy === exp.id}
                style={{ background: busy === exp.id ? '#1A3A5C' : '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 700, fontSize: 13, cursor: busy === exp.id ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: busy === exp.id ? 0.7 : 1, minWidth: 90 }}>
                {busy === exp.id ? 'Exporting…' : '⬇ Export'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CalendarModal({ doors, onClose, navigate }) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(null)

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthName = viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Build a map: 'YYYY-MM-DD' -> [door, door, ...]
  const doorsByDay = useMemo(() => {
    const map = {}
    doors.forEach(ins => {
      const { due } = dueInfo(ins)
      const key = due.toISOString().slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(ins)
    })
    return map
  }, [doors])

  // Build calendar grid (Mon–Sun)
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  // Monday = 0 offset
  const startOffset = (firstDay.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d))

  const selectedKey   = selectedDay ? selectedDay.toISOString().slice(0, 10) : null
  const selectedDoors = selectedKey ? (doorsByDay[selectedKey] || []) : []

  function dayColor(doorsOnDay) {
    if (!doorsOnDay?.length) return null
    const statuses = doorsOnDay.map(ins => dueInfo(ins).status)
    if (statuses.includes('overdue')) return '#F44336'
    if (statuses.includes('soon'))    return '#FF9800'
    return '#4CAF50'
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
      onClick={onClose}>
      <div style={{ background: '#0D1F35', borderRadius: 16, border: '1px solid rgba(255,255,255,0.15)', width: '100%', maxWidth: 640, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
              style={{ background: '#162840', border: '1px solid #243F5C', borderRadius: 6, color: '#fff', padding: '6px 12px', cursor: 'pointer', fontSize: 16 }}>‹</button>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, minWidth: 160, textAlign: 'center' }}>{monthName}</span>
            <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
              style={{ background: '#162840', border: '1px solid #243F5C', borderRadius: 6, color: '#fff', padding: '6px 12px', cursor: 'pointer', fontSize: 16 }}>›</button>
          </div>
          <button onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#8A9BAD', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} style={{ textAlign: 'center', color: '#8A9BAD', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} />
            const key       = date.toISOString().slice(0, 10)
            const doorsHere = doorsByDay[key] || []
            const color     = dayColor(doorsHere)
            const isToday   = date.toDateString() === today.toDateString()
            const isSelected = selectedKey === key
            const overdue   = doorsHere.filter(d => dueInfo(d).status === 'overdue')
            const soon      = doorsHere.filter(d => dueInfo(d).status === 'soon')
            const ok        = doorsHere.filter(d => dueInfo(d).status === 'ok')

            return (
              <div key={key}
                onClick={() => setSelectedDay(isSelected ? null : date)}
                style={{
                  background: isSelected ? '#1A3A5C' : '#162840',
                  border: isToday ? '2px solid #EEFF00' : isSelected ? '2px solid #4A9BAD' : '1px solid #1A3A5C',
                  borderRadius: 8, padding: '6px 4px', minHeight: 56, cursor: doorsHere.length ? 'pointer' : 'default',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  opacity: doorsHere.length === 0 ? 0.4 : 1,
                }}>
                <span style={{ color: isToday ? '#EEFF00' : '#fff', fontSize: 13, fontWeight: isToday ? 700 : 400 }}>
                  {date.getDate()}
                </span>
                {doorsHere.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
                    {overdue.length > 0 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F44336' }} />}
                    {soon.length   > 0 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF9800' }} />}
                    {ok.length     > 0 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4CAF50' }} />}
                  </div>
                )}
                {doorsHere.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color }}>
                    {doorsHere.length}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 16, justifyContent: 'center' }}>
          {[['#F44336','Overdue'],['#FF9800','Due soon'],['#4CAF50','On track']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block' }} />
              <span style={{ color: '#8A9BAD', fontSize: 12 }}>{l}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, border: '2px solid #EEFF00', display: 'inline-block' }} />
            <span style={{ color: '#8A9BAD', fontSize: 12 }}>Today</span>
          </div>
        </div>

        {/* Selected day doors */}
        {selectedDay && (
          <div style={{ marginTop: 20, borderTop: '1px solid #1A3A5C', paddingTop: 16 }}>
            <p style={{ color: '#8A9BAD', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              {selectedDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} — {selectedDoors.length} door{selectedDoors.length !== 1 ? 's' : ''}
            </p>
            {selectedDoors.map(ins => {
              const { status, diff } = dueInfo(ins)
              const color = status === 'overdue' ? '#F44336' : status === 'soon' ? '#FF9800' : '#4CAF50'
              const label = status === 'overdue' ? `Overdue by ${Math.abs(diff)}d` : `Due in ${diff}d`
              return (
                <div key={ins.id}
                  onClick={() => ins.project_id && navigate(`/project/${ins.project_id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#162840', borderRadius: 8, marginBottom: 6, borderLeft: `3px solid ${color}`, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{ins.door_location || ins.door_asset_id || '—'}</div>
                    <div style={{ color: '#8A9BAD', fontSize: 12 }}>{ins.projects?.name || '—'} · {ins.projects?.client_name || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <span style={{ fontSize: 11, color, fontWeight: 700 }}>{label}</span>
                    <span style={{ fontSize: 10, color: '#8A9BAD' }}>{doorCategory(ins.doorset_assembly_type) === 'flat' ? 'FLAT' : 'COMMUNAL'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
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

  toolBtn:   { background: '#1A3A5C', border: '1px solid #243F5C', borderRadius: 8, padding: '8px 16px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  liveBadge: { display: 'flex', alignItems: 'center', gap: 6, color: '#4CAF50', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' },
  liveDot:   { width: 8, height: 8, borderRadius: '50%', background: '#4CAF50', display: 'inline-block', animation: 'livePulse 1.5s ease-in-out infinite' },

  cpBtn:     { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  cpOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  cpModal:   { background: '#0D1F35', borderRadius: 16, padding: '28px 32px', width: '100%', maxWidth: 620, border: '1px solid #1A3A5C', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' },
  cpGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  cpField:   { display: 'flex', flexDirection: 'column', gap: 6 },
  cpLabel:   { color: '#8A9BAD', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  cpInput:   { background: '#162840', border: '1px solid #243F5C', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, outline: 'none' },
  cpSave:    { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
}
