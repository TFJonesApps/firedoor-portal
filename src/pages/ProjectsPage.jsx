import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ProjectsPage() {
  const [projects, setProjects] = useState([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [user, setUser]         = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    fetchProjects()
  }, [])

  async function fetchProjects() {
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const filtered = projects.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.address?.toLowerCase().includes(search.toLowerCase()) ||
    p.postcode?.toLowerCase().includes(search.toLowerCase()) ||
    p.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.engineer_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img src="/tfj_logo.png" alt="TF Jones" style={{ height: 36, objectFit: 'contain' }} />
            <div style={{ width: 1, height: 32, background: '#EEFF00', opacity: 0.4 }} />
            <p style={{ color: '#8A9BAD', fontSize: 13, margin: 0 }}>Fire Door Inspection Portal</p>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.userEmail}>{user?.email}</span>
            <button style={styles.signOutBtn} onClick={signOut}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={styles.content}>
        {/* Controls */}
        <div style={styles.controls}>
          <div style={styles.statsRow}>
            <StatChip label="Total Projects" value={projects.length} color="#8A9BAD" />
            <StatChip label="This Month" value={projects.filter(p => {
              const d = new Date(p.created_at)
              const now = new Date()
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            }).length} color="#EEFF00" />
          </div>
          <input
            style={styles.search}
            placeholder="Search projects, clients, engineers, postcodes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        {loading ? (
          <div style={styles.center}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div style={styles.center}><p style={{ color: '#8A9BAD' }}>No projects found.</p></div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Project', 'Address', 'Client', 'Engineer', 'Created'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr
                    key={p.id}
                    style={styles.row}
                    onClick={() => navigate(`/project/${p.id}`, { state: { project: p } })}
                  >
                    <td style={styles.td}>
                      <span style={styles.projectName}>{p.name}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: '#8A9BAD' }}>{[p.address, p.postcode].filter(Boolean).join(', ') || '—'}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: '#EEFF00', fontSize: 13 }}>{p.client_name || '—'}</span>
                    </td>
                    <td style={styles.td}>{p.engineer_name || '—'}</td>
                    <td style={styles.td}>
                      <span style={{ color: '#8A9BAD', fontSize: 13 }}>
                        {new Date(p.created_at).toLocaleDateString('en-GB')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatChip({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#8A9BAD' }}>{label}</div>
    </div>
  )
}

function Spinner() {
  return <div style={{ width: 36, height: 36, border: '3px solid #162840', borderTop: '3px solid #EEFF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '60px auto' }} />
}

const styles = {
  page: { minHeight: '100vh', background: '#0D1F35' },
  header: { background: '#1A3A5C', padding: '0 24px', borderBottom: '1px solid #162840' },
  headerInner: { maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' },
  title: { fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 },
  subtitle: { fontSize: 12, color: '#8A9BAD', marginTop: 2 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  userEmail: { color: '#8A9BAD', fontSize: 13 },
  signOutBtn: { background: 'transparent', border: '1px solid #8A9BAD', borderRadius: 6, padding: '6px 14px', color: '#8A9BAD', fontSize: 13 },
  content: { maxWidth: 1200, margin: '0 auto', padding: '24px 24px' },
  controls: { display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 },
  statsRow: { display: 'flex', gap: 32 },
  search: { background: '#162840', border: '1px solid #1A3A5C', borderRadius: 8, padding: '11px 16px', color: '#fff', fontSize: 15, width: '100%', maxWidth: 480, outline: 'none' },
  tableWrap: { overflowX: 'auto', borderRadius: 12, border: '1px solid #162840' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { background: '#162840', padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#8A9BAD', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1A3A5C' },
  row: { cursor: 'pointer', borderBottom: '1px solid #1A3A5C', transition: 'background 0.15s' },
  td: { padding: '14px 16px', fontSize: 14, color: '#fff', verticalAlign: 'middle' },
  projectName: { fontWeight: 600, fontSize: 15 },
  center: { textAlign: 'center', padding: 60 },
}
