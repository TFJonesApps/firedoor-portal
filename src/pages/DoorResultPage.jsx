import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function DoorResultPage() {
  const { assetId } = useParams()
  const navigate    = useNavigate()
  const [state, setState]           = useState('loading')  // loading | pending | found | notfound | error
  const [inspection, setInspection] = useState(null)
  const [project, setProject]       = useState(null)

  useEffect(() => {
    load()
  }, [assetId])

  async function load() {
    setState('loading')
    try {
      // Find most recent inspection for this asset
      const decoded = decodeURIComponent(assetId)
      const { data: ins, error: insErr } = await supabase
        .from('inspections')
        .select('*')
        .eq('door_asset_id', decoded)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (insErr || !ins) { setState('notfound'); return }

      // Check if project has been released to clients
      const { data: proj } = await supabase
        .from('projects')
        .select('id, name, address, postcode, is_published')
        .eq('id', ins.project_id)
        .single()

      setInspection(ins)
      setProject(proj)
      setState(proj?.is_published ? 'found' : 'pending')
    } catch {
      setState('error')
    }
  }

  const passed = inspection?.inspection_passed === 'Pass'

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <img
          src="/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png"
          alt="TF Jones"
          style={s.logo}
        />
        <button style={s.backBtn} onClick={() => navigate('/client/scan')}>
          ← Scan Another
        </button>
      </div>

      <div style={s.body}>
        {state === 'loading' && (
          <div style={s.centred}>
            <Spinner />
            <p style={s.hint}>Looking up door…</p>
          </div>
        )}

        {state === 'notfound' && (
          <div style={s.centred}>
            <div style={s.iconBox}>❓</div>
            <h2 style={s.heading}>Door Not Found</h2>
            <p style={s.hint}>
              No inspection record found for this barcode.{'\n'}
              Please check the sticker or contact your inspector.
            </p>
          </div>
        )}

        {state === 'error' && (
          <div style={s.centred}>
            <div style={s.iconBox}>⚠️</div>
            <h2 style={s.heading}>Something went wrong</h2>
            <p style={s.hint}>Please try again or contact support.</p>
            <button style={s.retryBtn} onClick={load}>Try Again</button>
          </div>
        )}

        {state === 'pending' && (
          <div style={s.centred}>
            <div style={{ ...s.iconBox, fontSize: 48 }}>🔍</div>
            <h2 style={s.heading}>Door Inspected</h2>
            <p style={s.hint}>
              Findings will follow once the inspection report has been finalised.
              Please check back shortly.
            </p>
            <div style={s.pendingCard}>
              <p style={s.pendingLabel}>Door ID</p>
              <p style={s.pendingValue}>{decodeURIComponent(assetId)}</p>
              {inspection?.door_location && (
                <>
                  <p style={s.pendingLabel}>Location</p>
                  <p style={s.pendingValue}>{inspection.door_location}</p>
                </>
              )}
            </div>
          </div>
        )}

        {state === 'found' && inspection && (
          <>
            {/* Result badge */}
            <div style={{ ...s.resultBadge, background: passed ? '#0A2E1A' : '#2E0A0A', border: `2px solid ${passed ? '#4CAF50' : '#F44336'}` }}>
              <span style={{ fontSize: 36 }}>{passed ? '✅' : '❌'}</span>
              <div>
                <div style={{ ...s.resultLabel, color: passed ? '#4CAF50' : '#F44336' }}>
                  {passed ? 'PASS' : 'FAIL'}
                </div>
                <div style={s.resultSub}>Last Inspection Result</div>
              </div>
            </div>

            {/* Location & type card */}
            <div style={s.card}>
              <InfoRow label="Location"     value={inspection.door_location || '—'} />
              <InfoRow label="Door Type"    value={inspection.doorset_assembly_type || inspection.survey_type || '—'} />
              <InfoRow label="Fire Rating"  value={inspection.fire_rating || '—'} />
              <InfoRow label="Configuration" value={inspection.doorset_configuration || '—'} />
            </div>

            {/* Inspection card */}
            <div style={s.card}>
              <InfoRow
                label="Inspected"
                value={new Date(inspection.created_at).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'long', year: 'numeric'
                })}
              />
              <InfoRow label="Inspector"   value={inspection.engineer_name || '—'} />
              <InfoRow label="Project"     value={project?.name || '—'} />
              {project?.address && (
                <InfoRow label="Site" value={[project.address, project.postcode].filter(Boolean).join(', ')} />
              )}
            </div>

            {/* Recommended actions */}
            {(inspection.recommended_action || inspection.recommended_repair_actions) && (
              <div style={{ ...s.card, borderLeft: `3px solid ${passed ? '#4CAF50' : '#F44336'}` }}>
                <p style={s.cardTitle}>Recommended Actions</p>
                {inspection.recommended_action && (
                  <p style={s.actionText}>{inspection.recommended_action}</p>
                )}
                {inspection.recommended_repair_actions && (
                  <p style={s.actionText}>{inspection.recommended_repair_actions}</p>
                )}
              </div>
            )}

            {/* Door ID footer */}
            <p style={s.doorId}>Door ID: {inspection.door_asset_id}</p>
          </>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={s.infoRow}>
      <span style={s.infoLabel}>{label}</span>
      <span style={s.infoValue}>{value}</span>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ width: 40, height: 40, border: '3px solid #162840', borderTop: '3px solid #EEFF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
  )
}

const s = {
  page:        { minHeight: '100vh', background: '#0D1F35', display: 'flex', flexDirection: 'column' },
  header:      { background: '#162840', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1A3A5C' },
  logo:        { height: 32, objectFit: 'contain' },
  backBtn:     { background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '6px 14px', color: '#fff', fontSize: 13 },
  body:        { flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480, width: '100%', margin: '0 auto' },
  centred:     { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, textAlign: 'center', paddingTop: 40 },
  iconBox:     { fontSize: 64, lineHeight: 1 },
  heading:     { color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 },
  hint:        { color: '#8A9BAD', fontSize: 15, margin: 0, maxWidth: 300, lineHeight: 1.5 },
  retryBtn:    { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 15, fontWeight: 700, marginTop: 8 },
  pendingCard: { background: '#162840', borderRadius: 12, padding: '16px 20px', width: '100%', maxWidth: 340, marginTop: 8 },
  pendingLabel:{ color: '#8A9BAD', fontSize: 12, margin: '8px 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' },
  pendingValue:{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 },
  resultBadge: { borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  resultLabel: { fontSize: 28, fontWeight: 800, letterSpacing: '0.05em', lineHeight: 1 },
  resultSub:   { color: '#8A9BAD', fontSize: 13, marginTop: 4 },
  card:        { background: '#162840', borderRadius: 14, padding: '4px 0', overflow: 'hidden' },
  cardTitle:   { color: '#fff', fontSize: 15, fontWeight: 700, margin: '12px 16px 8px' },
  infoRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '11px 16px', borderBottom: '1px solid #1A3A5C', gap: 12 },
  infoLabel:   { color: '#8A9BAD', fontSize: 14, flexShrink: 0 },
  infoValue:   { color: '#fff', fontSize: 14, fontWeight: 600, textAlign: 'right', flex: 1 },
  actionText:  { color: '#CBD5E1', fontSize: 14, margin: '0 16px 12px', lineHeight: 1.5 },
  doorId:      { color: '#3A5470', fontSize: 12, textAlign: 'center', marginTop: 8 },
}
