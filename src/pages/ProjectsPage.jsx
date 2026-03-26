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
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <img src="/tfj_logo.png" alt="TF Jones" style={{ height: 42, objectFit: 'contain' }} />
            <div style={{ width: 1, height: 36, background: '#fff', opacity: 0.15 }} />
            <div>
              <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Fire Door Inspection Portal</p>
              <p style={{ color: '#8A9BAD', fontSize: 12, margin: 0, marginTop: 2 }}>TF Jones</p>
            </div>
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
                  {['Project', 'Address', 'Client', 'Inspector', 'Created'].map(h => (
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
                      <span style={{ color: '#CBD5E1' }}>{[p.address, p.postcode].filter(Boolean).join(', ') || '—'}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: '#EEFF00', fontWeight: 600 }}>{p.client_name || '—'}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: '#fff', fontWeight: 500 }}>{p.engineer_name || '—'}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={{ color: '#94A3B8' }}>
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
      <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#8A9BAD', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}

function Spinner() {
  return <div style={{ width: 36, height: 36, border: '3px solid #162840', borderTop: '3px solid #EEFF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '60px auto' }} />
}

const styles = {
  page: { minHeight: '100vh', background: '#0D1F35' },
  header: { background: '#0D1F35', padding: '0 32px', borderBottom: '3px solid #EEFF00' },
  headerInner: { maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0' },
  title: { fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 },
  subtitle: { fontSize: 12, color: '#8A9BAD', marginTop: 2 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 20 },
  userEmail: { color: '#fff', fontSize: 14, fontWeight: 500 },
  signOutBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 500 },
  content: { maxWidth: 1200, margin: '0 auto', padding: '24px 24px' },
  controls: { display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 },
  statsRow: { display: 'flex', gap: 32 },
  search: { background: '#162840', border: '1px solid #243F5C', borderRadius: 8, padding: '12px 16px', color: '#fff', fontSize: 15, width: '100%', maxWidth: 520, outline: 'none' },
  tableWrap: { overflowX: 'auto', borderRadius: 12, border: '1px solid #162840' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { background: '#162840', padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#8A9BAD', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1A3A5C' },
  row: { cursor: 'pointer', borderBottom: '1px solid #1A3A5C', transition: 'background 0.15s' },
  td: { padding: '16px 16px', fontSize: 15, color: '#fff', verticalAlign: 'middle' },
  projectName: { fontWeight: 700, fontSize: 16, color: '#fff', letterSpacing: '-0.01em' },
  center: { textAlign: 'center', padding: 60 },
}
