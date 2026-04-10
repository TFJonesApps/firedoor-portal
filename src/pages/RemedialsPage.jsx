import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateRemedialEvidence } from '../lib/generateReport'

export default function RemedialsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // URL-driven filter state
  const tab     = searchParams.get('status') || 'pending'
  const clientF = searchParams.get('client') || ''
  const q       = searchParams.get('q') || ''

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value); else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  // Data
  const [remedials, setRemedials] = useState([])
  const [loading, setLoading]     = useState(true)

  // Close modal
  const [closeTarget, setCloseTarget]       = useState(null) // remedial row
  const [closeReason, setCloseReason]       = useState('')
  const [closing, setClosing]               = useState(false)

  // View detail
  const [viewTarget, setViewTarget]         = useState(null) // remedial row
  const [generatingPdf, setGeneratingPdf]   = useState(null) // remedial id

  useEffect(() => {
    fetchRemedials()

    const sub = supabase.channel('remedials-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'remedials' }, () => fetchRemedials())
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [])

  async function fetchRemedials() {
    setLoading(true)
    const { data, error } = await supabase
      .from('remedials')
      .select('*, inspections(door_location, door_asset_id, fire_rating, inspection_passed, recommended_action, engineer_name, engineer_id), projects(name, client_name, address, postcode)')
      .order('created_at', { ascending: false })
    if (error) console.error('fetchRemedials error:', error)
    setRemedials(data || [])
    setLoading(false)
  }

  // Body-scroll lock for modals
  useEffect(() => {
    if (closeTarget || viewTarget) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [closeTarget, viewTarget])

  async function handleClose(e) {
    e.preventDefault()
    if (!closeTarget) return
    setClosing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('remedials').update({
        status: 'closed',
        closed_reason: closeReason.trim() || null,
        closed_at: new Date().toISOString(),
        closed_by: user?.id || null,
      }).eq('id', closeTarget.id)
      if (error) throw error
      setCloseTarget(null)
      setCloseReason('')
    } catch (err) {
      alert('Failed to close: ' + err.message)
    }
    setClosing(false)
  }

  async function reopenRemedial(rem) {
    await supabase.from('remedials').update({
      status: 'pending',
      closed_reason: null,
      closed_at: null,
      closed_by: null,
    }).eq('id', rem.id)
  }

  async function downloadEvidence(rem) {
    setGeneratingPdf(rem.id)
    try {
      await generateRemedialEvidence(rem)
    } catch (e) {
      console.error('Evidence PDF failed:', e)
    }
    setGeneratingPdf(null)
  }

  // Unique clients from remedials data
  const clients = useMemo(() => {
    const set = new Set()
    for (const r of remedials) {
      if (r.projects?.client_name) set.add(r.projects.client_name)
    }
    return Array.from(set).sort()
  }, [remedials])


  // Stats
  const stats = useMemo(() => {
    const s = { pending: 0, in_progress: 0, completed: 0, closed: 0 }
    for (const r of remedials) s[r.status] = (s[r.status] || 0) + 1
    return s
  }, [remedials])

  // Filtered list
  const filtered = useMemo(() => {
    return remedials.filter(r => {
      if (r.status !== tab) return false
      if (clientF && r.projects?.client_name !== clientF) return false
      if (q) {
        const query = q.toLowerCase()
        const fields = [
          r.inspections?.door_location,
          r.inspections?.door_asset_id,
          r.projects?.name,
          r.projects?.client_name,
          r.recommended_action,
          r.door_asset_id,
        ]
        if (!fields.some(f => f?.toLowerCase().includes(query))) return false
      }
      return true
    })
  }, [remedials, tab, clientF, q])

  const STATUS_COLORS = {
    pending:     { bg: '#F4433622', text: '#F44336' },
    in_progress: { bg: '#FF980022', text: '#FF9800' },
    completed:   { bg: '#4CAF5022', text: '#4CAF50' },
    closed:      { bg: '#64748B22', text: '#64748B' },
  }

  const STATUS_LABELS = {
    pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', closed: 'Closed'
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <button style={s.backBtn} onClick={() => navigate('/')}>← Dashboard</button>
          <h1 style={s.title}>Remedial Works</h1>
          <div style={{ flex: 1 }} />

          {/* Stats chips */}
          <div style={{ display: 'flex', gap: 12, marginRight: 16 }}>
            <span style={{ color: '#F44336', fontSize: 12, fontWeight: 700 }}>{stats.pending} pending</span>
            <span style={{ color: '#FF9800', fontSize: 12, fontWeight: 700 }}>{stats.in_progress} in progress</span>
            <span style={{ color: '#4CAF50', fontSize: 12, fontWeight: 700 }}>{stats.completed} completed</span>
          </div>

          <div style={s.tabs}>
            {['pending', 'in_progress', 'completed', 'closed'].map(t => (
              <button
                key={t}
                onClick={() => updateParam('status', t === 'pending' ? '' : t)}
                style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
              >{STATUS_LABELS[t]}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={s.filters}>
        <input
          style={{ ...s.input, flex: 1 }}
          placeholder="Search door location, asset ID, project, client…"
          value={q}
          onChange={e => updateParam('q', e.target.value)}
        />
        <select style={{ ...s.input, minWidth: 180 }} value={clientF} onChange={e => updateParam('client', e.target.value)}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={s.content}>
        {loading ? (
          <p style={{ color: '#8A9BAD', textAlign: 'center', padding: 60 }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: '#8A9BAD', textAlign: 'center', padding: 60 }}>No remedials found.</p>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead><tr>{['Door Location', 'Asset ID', 'Project', 'Client', 'Action Required', 'Status', 'Created', ''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(r => {
                  const sc = STATUS_COLORS[r.status] || STATUS_COLORS.pending
                  return (
                    <tr key={r.id} style={s.row}>
                      <td style={s.td}>
                        <span
                          style={{ color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => r.project_id && navigate(`/project/${r.project_id}`)}
                        >
                          {r.inspections?.door_location || '—'}
                        </span>
                      </td>
                      <td style={s.td}><span style={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: 12 }}>{r.door_asset_id || r.inspections?.door_asset_id || '—'}</span></td>
                      <td style={s.td}>
                        <span
                          style={{ color: '#CBD5E1', cursor: 'pointer' }}
                          onClick={() => r.project_id && navigate(`/project/${r.project_id}`)}
                        >
                          {r.projects?.name || '—'}
                        </span>
                      </td>
                      <td style={s.td}><span style={{ color: '#EEFF00', fontWeight: 600 }}>{r.projects?.client_name || '—'}</span></td>
                      <td style={s.td}>
                        <span style={{ color: '#F44336', fontWeight: 500 }}>{r.recommended_action || '—'}</span>
                        {r.recommended_repair_actions && (
                          <div style={{ color: '#FF9800', fontSize: 11, marginTop: 3, lineHeight: '1.4' }}>{r.recommended_repair_actions}</div>
                        )}
                      </td>
                      <td style={s.td}>
                        <span style={{ background: sc.bg, color: sc.text, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase' }}>
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td style={s.td}><span style={{ color: '#94A3B8' }}>{new Date(r.created_at).toLocaleDateString('en-GB')}</span></td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={s.actionBtn} onClick={() => setViewTarget(r)}>View</button>
                          {r.status === 'completed' && (
                            <button
                              style={{ ...s.actionBtn, borderColor: '#4CAF50', color: '#4CAF50', opacity: generatingPdf === r.id ? 0.6 : 1 }}
                              disabled={generatingPdf === r.id}
                              onClick={() => downloadEvidence(r)}
                            >
                              {generatingPdf === r.id ? '...' : 'PDF'}
                            </button>
                          )}
                          {(r.status === 'pending' || r.status === 'in_progress') && (
                            <button style={{ ...s.actionBtn, borderColor: '#64748B', color: '#64748B' }} onClick={() => { setCloseTarget(r); setCloseReason('') }}>
                              Close
                            </button>
                          )}
                          {r.status === 'closed' && (
                            <button style={s.actionBtn} onClick={() => reopenRemedial(r)}>Reopen</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={s.count}>{filtered.length} remedial{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      {/* View Remedial detail modal */}
      {viewTarget && (
        <div style={s.overlay} onClick={() => setViewTarget(null)}>
          <div style={{ ...s.modal, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Remedial Detail</h2>
              <button onClick={() => setViewTarget(null)} style={{ background: 'none', border: 'none', color: '#8A9BAD', fontSize: 22, cursor: 'pointer', padding: '0 4px' }}>&times;</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['Door Location', viewTarget.inspections?.door_location],
                ['Asset ID', viewTarget.door_asset_id || viewTarget.inspections?.door_asset_id],
                ['Fire Rating', viewTarget.inspections?.fire_rating],
                ['Project', viewTarget.projects?.name],
                ['Client', viewTarget.projects?.client_name],
                ['Address', [viewTarget.projects?.address, viewTarget.projects?.postcode].filter(Boolean).join(', ')],
                ['Inspector', viewTarget.inspections?.engineer_name],
                ['Inspection Result', viewTarget.inspections?.inspection_passed],
                ['Recommended Action', viewTarget.recommended_action],
                ['Repair Details', viewTarget.recommended_repair_actions],
                ['Status', STATUS_LABELS[viewTarget.status]],
                ['Created', new Date(viewTarget.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })],
                viewTarget.joiner_name && ['Joiner', viewTarget.joiner_name],
                viewTarget.completed_at && ['Completed', new Date(viewTarget.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })],
                viewTarget.completion_notes && ['Completion Notes', viewTarget.completion_notes],
                viewTarget.closed_reason && ['Close Reason', viewTarget.closed_reason],
                viewTarget.closed_at && ['Closed', new Date(viewTarget.closed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })],
              ].filter(Boolean).filter(([, v]) => v).map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ color: '#8A9BAD', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 130, flexShrink: 0 }}>{label}</span>
                  <span style={{ color: label === 'Recommended Action' || label === 'Repair Details' ? '#FF9800' : '#fff', fontSize: 13, fontWeight: label === 'Repair Details' ? 600 : 400 }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button
                style={{ background: 'transparent', border: '1px solid #EEFF00', borderRadius: 8, padding: '10px 20px', color: '#EEFF00', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => { setViewTarget(null); viewTarget.project_id && navigate(`/project/${viewTarget.project_id}`) }}
              >Go to Project</button>
              <button
                style={{ background: 'transparent', border: '1px solid #243F5C', borderRadius: 8, padding: '10px 20px', color: '#8A9BAD', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setViewTarget(null)}
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Close Remedial modal */}
      {closeTarget && (
        <div style={s.overlay} onClick={() => setCloseTarget(null)}>
          <form onSubmit={handleClose} style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 }}>Close Remedial</h2>
              <button type="button" onClick={() => setCloseTarget(null)} style={{ background: 'none', border: 'none', color: '#8A9BAD', fontSize: 22, cursor: 'pointer', padding: '0 4px' }}>&times;</button>
            </div>
            <p style={{ color: '#8A9BAD', fontSize: 13, margin: '0 0 16px' }}>
              Close this remedial for <span style={{ color: '#EEFF00', fontWeight: 700 }}>{closeTarget.inspections?.door_location || closeTarget.door_asset_id || 'this door'}</span>. Use this when TF Jones is not carrying out the repair.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={s.label}>Reason for closing</label>
              <textarea
                style={{ ...s.input, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="e.g. Client arranging own repair, Not cost-effective, etc."
                value={closeReason}
                onChange={e => setCloseReason(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" onClick={() => setCloseTarget(null)} style={{ background: 'transparent', border: '1px solid #243F5C', borderRadius: 8, padding: '10px 20px', color: '#8A9BAD', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginRight: 10 }}>Cancel</button>
              <button style={{ ...s.save, background: '#64748B' }} type="submit" disabled={closing}>
                {closing ? 'Closing…' : 'Close Remedial'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

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
  row:         { borderBottom: '1px solid #1A3A5C' },
  td:          { padding: '12px 14px', fontSize: 13, color: '#fff', verticalAlign: 'middle' },
  count:       { color: '#4A6580', fontSize: 11, marginTop: 8, textAlign: 'right' },

  actionBtn:   { background: 'transparent', border: '1px solid #EEFF00', borderRadius: 4, padding: '4px 10px', color: '#EEFF00', fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' },

  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
  modal:       { background: '#0D1F35', borderRadius: 16, padding: '28px 32px', width: '100%', maxWidth: 520, border: '1px solid #1A3A5C', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' },
  label:       { color: '#8A9BAD', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  save:        { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
}
