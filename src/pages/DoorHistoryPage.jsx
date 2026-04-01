import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateSingleInspectionReport, generateFullHistoryReport } from '../lib/generateReport'

const PASS = '#4CAF50'
const FAIL = '#F44336'
const YELLOW = '#EEFF00'

export default function DoorHistoryPage() {
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState('')
  const [assetId, setAssetId]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [inspections, setInspections] = useState([])
  const [clients, setClients]         = useState([])
  const [clientFilter, setClientFilter] = useState('')
  const [expanded, setExpanded]       = useState(null)
  const [generating, setGenerating]   = useState(null)
  const [generatingHistory, setGeneratingHistory] = useState(false)
  const [searched, setSearched]       = useState(false)

  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then(({ data }) => setClients(data || []))
  }, [])

  async function search(id) {
    const decoded = (id || searchInput).trim()
    if (!decoded) return
    setAssetId(decoded)
    setSearchInput(decoded)
    setLoading(true)
    setSearched(true)
    setExpanded(null)

    let query = supabase
      .from('inspections')
      .select('*, projects!inner(id, name, address, postcode, client_name, client_id, client_logo, engineer_name)')
      .eq('door_asset_id', decoded)
      .order('created_at', { ascending: false })

    if (clientFilter) {
      query = query.eq('projects.client_id', clientFilter)
    }

    const { data, error } = await query
    setInspections(error ? [] : (data || []))
    setLoading(false)
  }

  useEffect(() => {
    if (searched && assetId) search(assetId)
  }, [clientFilter])

  async function downloadPdf(ins) {
    setGenerating(ins.id)
    try {
      await generateSingleInspectionReport(ins.projects, ins)
    } catch (e) {
      console.error('PDF generation failed:', e)
    }
    setGenerating(null)
  }

  // NEW: Function to generate the packaged history PDF
  async function downloadFullHistory() {
    if (inspections.length === 0) return
    setGeneratingHistory(true)
    try {
      // Logic assumes your lib handles the array of inspections
      await generateFullHistoryReport(assetId, inspections)
    } catch (e) {
      console.error('History PDF generation failed:', e)
    }
    setGeneratingHistory(false)
  }

  const latest = inspections[0]
  const passCount = inspections.filter(i => i.inspection_passed === 'Pass').length
  const passRate  = inspections.length > 0 ? Math.round((passCount / inspections.length) * 100) : 0

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.headerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <img src="/tfj_logo.png" alt="TF Jones" style={{ height: 42, objectFit: 'contain' }} />
            <div style={{ width: 1, height: 36, background: '#fff', opacity: 0.15 }} />
            <div>
              <p style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>Door History</p>
              <p style={{ color: '#8A9BAD', fontSize: 12, margin: 0, marginTop: 2 }}>Search inspection history by Asset ID</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={s.btn} onClick={() => navigate('/')}>Dashboard</button>
          </div>
        </div>
      </div>

      <div style={s.body}>
        <div style={s.searchBar}>
          <input
            style={s.searchInput}
            placeholder="Enter door asset ID / barcode..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
          />
          <select
            style={s.clientSelect}
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button style={s.searchBtn} onClick={() => search()}>Search</button>
        </div>

        {loading && (
          <div style={s.centred}>
            <div style={s.spinner} />
            <p style={{ color: '#8A9BAD', margin: 0 }}>Searching...</p>
          </div>
        )}

        {!loading && searched && inspections.length === 0 && (
          <div style={s.centred}>
            <p style={{ color: '#8A9BAD', fontSize: 15 }}>No inspections found for "{assetId}"{clientFilter ? ' with the selected client' : ''}</p>
          </div>
        )}

        {!loading && inspections.length > 0 && (
          <>
            <div style={s.summaryCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch' }}>
                <div>
                  <p style={{ ...s.summaryLabel, marginTop: 0 }}>Door Asset ID</p>
                  <p style={s.summaryValue}>{assetId}</p>
                  {latest?.door_location && (
                    <>
                      <p style={s.summaryLabel}>Location</p>
                      <p style={s.summaryValue}>{latest.door_location}</p>
                    </>
                  )}
                  {latest?.doorset_assembly_type && (
                    <>
                      <p style={s.summaryLabel}>Type</p>
                      <p style={s.summaryValue}>{latest.doorset_assembly_type}</p>
                    </>
                  )}
                  {latest?.fire_rating && (
                    <>
                      <p style={s.summaryLabel}>Fire Rating</p>
                      <p style={s.summaryValue}>{latest.fire_rating}</p>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={s.statBox}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>{inspections.length}</span>
                      <span style={{ fontSize: 11, color: '#8A9BAD' }}>Inspections</span>
                    </div>
                    <div style={s.statBox}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: passRate >= 80 ? PASS : passRate >= 50 ? '#FF9800' : FAIL }}>{passRate}%</span>
                      <span style={{ fontSize: 11, color: '#8A9BAD' }}>Pass Rate</span>
                    </div>
                  </div>

                  {/* History PDF Button placed right under the stats */}
                  <button 
                    style={{ ...s.historyBtn, opacity: generatingHistory ? 0.7 : 1 }} 
                    onClick={downloadFullHistory}
                    disabled={generatingHistory}
                  >
                    {generatingHistory ? 'Packaging...' : 'Download Full History PDF'}
                  </button>
                </div>
              </div>
            </div>

            <div style={s.timeline}>
              {inspections.map((ins, i) => {
                const passed = ins.inspection_passed === 'Pass'
                const isExpanded = expanded === ins.id
                const date = new Date(ins.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

                return (
                  <div key={ins.id} style={s.timelineItem}>
                    <div style={s.timelineSide}>
                      <div style={{ ...s.dot, background: passed ? PASS : FAIL }} />
                      {i < inspections.length - 1 && <div style={s.line} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{ ...s.timelineCard, borderLeft: `3px solid ${passed ? PASS : FAIL}`, cursor: 'pointer' }}
                        onClick={() => setExpanded(isExpanded ? null : ins.id)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ ...s.badge, background: passed ? '#0A2E1A' : '#2E0A0A', color: passed ? PASS : FAIL }}>
                                {passed ? 'PASS' : 'FAIL'}
                              </span>
                              <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{date}</span>
                            </div>
                            <p style={{ color: '#8A9BAD', fontSize: 13, margin: '4px 0 0' }}>
                              {ins.projects?.name || '—'} &middot; {ins.engineer_name || '—'}
                            </p>
                            {ins.projects?.client_name && (
                              <p style={{ color: YELLOW, fontSize: 12, margin: '2px 0 0', fontWeight: 600 }}>{ins.projects.client_name}</p>
                            )}
                          </div>
                          <span style={{ color: '#3A5570', fontSize: 18 }}>{isExpanded ? '−' : '+'}</span>
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: 12, borderTop: '1px solid #1A3A5C', paddingTop: 12 }}>
                            <DetailGrid ins={ins} />
                            <PhotoRow ins={ins} />

                            {(ins.recommended_action || ins.recommended_repair_actions) && (
                              <div style={{ marginTop: 10, padding: '10px 12px', background: '#0D1F35', borderRadius: 8 }}>
                                <p style={{ color: '#8A9BAD', fontSize: 11, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recommended Actions</p>
                                {ins.recommended_action && <p style={{ color: '#CBD5E1', fontSize: 13, margin: '0 0 4px' }}>{ins.recommended_action}</p>}
                                {ins.recommended_repair_actions && <p style={{ color: '#CBD5E1', fontSize: 13, margin: 0 }}>{ins.recommended_repair_actions}</p>}
                              </div>
                            )}

                            <button
                              style={{ ...s.pdfBtn, opacity: generating === ins.id ? 0.6 : 1 }}
                              disabled={generating === ins.id}
                              onClick={e => { e.stopPropagation(); downloadPdf(ins) }}
                            >
                              {generating === ins.id ? 'Generating...' : 'Download PDF Report'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DetailGrid({ ins }) {
  const fields = [
    ['Survey Type', ins.survey_type],
    ['Assembly Type', ins.doorset_assembly_type],
    ['Configuration', ins.doorset_configuration],
    ['Fire Rating', ins.fire_rating],
    ['Leaf Sizes', ins.leaf_sizes_mm],
    ['Fire Stopping', ins.fire_stopping_acceptable],
    ['Glazing OK', ins.glazing_free_from_damage],
    ['Structure Intact', ins.surrounding_structure_intact],
    ['Condition', ins.condition_door_leaf_frame],
    ['Gaps 3mm Tolerance', ins.gap_3mm_tolerance],
    ['Hinge Gap', ins.gap_hinge_side],
    ['Lock Gap', ins.gap_lock_side],
    ['Head Gap', ins.gap_head],
    ['Threshold Gap', ins.gap_threshold_mm],
    ['Self-Closing', ins.self_closing_device],
    ['Hinges OK', ins.hinges_condition_acceptable],
    ['Hardware OK', ins.essential_hardware_acceptable],
    ['Signage', ins.correct_signage_present],
    ['Seals OK', ins.intumescent_seals_acceptable],
  ].filter(([, v]) => v)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#1A3A5C', borderRadius: 8, overflow: 'hidden' }}>
      {fields.map(([label, value]) => (
        <div key={label} style={{ background: '#162840', padding: '8px 10px' }}>
          <p style={{ color: '#8A9BAD', fontSize: 11, margin: 0 }}>{label}</p>
          <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: '2px 0 0' }}>{value}</p>
        </div>
      ))}
    </div>
  )
}

function PhotoRow({ ins }) {
  const photos = [
    ['Outside', ins.photo_outside_url],
    ['Inside', ins.photo_inside_url],
    ['Photo 1', ins.photo1_url],
    ['Photo 2', ins.photo2_url],
    ['Photo 3', ins.photo3_url],
    ['Photo 4', ins.photo4_url],
    ['Photo 5', ins.photo5_url],
    ['Photo 6', ins.photo6_url],
  ].filter(([, u]) => u)

  if (photos.length === 0) return null

  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ color: '#8A9BAD', fontSize: 11, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Photos</p>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {photos.map(([label, url]) => (
          <div key={label} style={{ flexShrink: 0, textAlign: 'center' }}>
            <img src={url} alt={label} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #1A3A5C' }} />
            <p style={{ color: '#8A9BAD', fontSize: 10, margin: '3px 0 0' }}>{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const s = {
  page:        { minHeight: '100vh', background: '#0D1F35', display: 'flex', flexDirection: 'column' },
  header:      { background: '#0D1F35', padding: '0 32px', borderBottom: '3px solid #EEFF00' },
  headerInner: { maxWidth: 1600, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0' },
  btn:         { background: '#162840', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  body:        { flex: 1, maxWidth: 960, width: '100%', margin: '0 auto', padding: '24px 24px' },

  searchBar:   { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  searchInput: { flex: 1, minWidth: 200, background: '#162840', border: '1px solid #1A3A5C', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none' },
  clientSelect:{ background: '#162840', border: '1px solid #1A3A5C', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none', minWidth: 160 },
  searchBtn:   { background: YELLOW, color: '#0D1F35', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },

  centred:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 40 },
  spinner:     { width: 36, height: 36, border: '3px solid #162840', borderTop: `3px solid ${YELLOW}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' },

  summaryCard: { background: '#162840', borderRadius: 14, padding: '20px 24px', marginBottom: 24 },
  summaryLabel:{ color: '#8A9BAD', fontSize: 11, margin: '10px 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  summaryValue:{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 },
  statBox:     { display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0D1F35', borderRadius: 10, padding: '12px 16px', minWidth: 80 },

  // Updated Button Style for the Summary Area
  historyBtn:  { background: 'transparent', color: YELLOW, border: `1px solid ${YELLOW}`, borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' },

  timeline:     { display: 'flex', flexDirection: 'column', gap: 0 },
  timelineItem: { display: 'flex', gap: 16, minHeight: 80 },
  timelineSide: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 },
  dot:          { width: 12, height: 12, borderRadius: '50%', flexShrink: 0, marginTop: 14 },
  line:         { width: 2, flex: 1, background: '#1A3A5C', margin: '4px 0' },
  timelineCard: { background: '#162840', borderRadius: 10, padding: '14px 16px', marginBottom: 12 },
  badge:        { fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6, letterSpacing: '0.05em' },
  pdfBtn:       { marginTop: 12, background: YELLOW, color: '#0D1F35', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%' },
}