import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateProjectReport } from '../lib/generateReport'

const PASS_COLOR  = '#4CAF50'
const FAIL_COLOR  = '#F44336'
const GREY        = '#8A9BAD'

export default function ProjectDetailPage() {
  const { id }       = useParams()
  const { state }    = useLocation()
  const navigate     = useNavigate()

  const [project, setProject]         = useState(state?.project || null)
  const [inspections, setInspections] = useState([])
  const [loading, setLoading]         = useState(true)
  const [expanded, setExpanded]       = useState(null)
  const [lightbox, setLightbox]       = useState(null)
  const [editing, setEditing]         = useState(false)
  const [editForm, setEditForm]       = useState({})
  const [saving, setSaving]           = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [clients, setClients]         = useState([])
  const [publishing, setPublishing]   = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)

  useEffect(() => {
    fetchData()
    supabase.from('clients').select('*').order('name').then(({ data }) => setClients(data || []))
  }, [id])

  async function fetchData() {
    setLoading(true)
    if (!project) {
      const { data } = await supabase.from('projects').select('*').eq('id', id).single()
      setProject(data)
    }
    const { data: ins } = await supabase
      .from('inspections')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
    setInspections(ins || [])
    setLoading(false)
  }

  function startEdit() {
    setEditForm({
      name:         project.name         || '',
      address:      project.address      || '',
      postcode:     project.postcode     || '',
      client_name:  project.client_name  || '',
      client_logo:  project.client_logo  || '',
      client_id:    project.client_id    || null,
    })
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    const { data, error } = await supabase.from('projects').update(editForm).eq('id', id).select().single()
    if (!error) { setProject(data); setEditing(false) }
    setSaving(false)
  }

  const passCount = inspections.filter(i => i.inspection_passed === 'Pass').length
  const failCount = inspections.filter(i => i.inspection_passed === 'Fail').length

  async function exportCsv() {
    setExportingCsv(true)
    try {
      // Get client CSV codes
      const { data: clientData } = await supabase
        .from('clients')
        .select('csv_client_alpha,csv_branch_alpha,csv_contract_alpha,csv_contractor_alpha,csv_depot_alpha,csv_priority_alpha')
        .eq('id', project.client_id)
        .single()

      const alphas = clientData || {}

      // Only rows with repair actions
      const rows = inspections.filter(i => i.recommended_repair_actions?.trim())

      if (rows.length === 0) {
        alert('No remedial works to export for this project.')
        setExportingCsv(false)
        return
      }

      const headers = [
        'Client_Alpha','Branch_Alpha','Contract_Alpha','Contractor_Alpha','Depot_Alpha','Priority_Alpha',
        'Property Ref','Address','Postcode','Job Number','Received Date','Required Date',
        'Job Description','SOR Code','Qty','SOR Description','Rate','Costcode','Orderno',
        'Asset_Contact','Asset_Contact_Phone','Asset_Contact_Notes','Asset_Contact_Email',
      ]

      const csvRows = rows.map(ins => [
        alphas.csv_client_alpha    || '',
        alphas.csv_branch_alpha    || '',
        alphas.csv_contract_alpha  || '',
        alphas.csv_contractor_alpha || '',
        alphas.csv_depot_alpha     || '',
        alphas.csv_priority_alpha  || '',
        project.address            || '',
        project.address            || '',
        project.postcode           || '',
        '', // Job Number — blank
        '', // Received Date — blank
        '', // Required Date — blank
        ins.recommended_repair_actions || '',
        '', '', '', '', '', '', '', '', '', '',
      ])

      const csvContent = [headers, ...csvRows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\r\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${project.name} - Remedial Works.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('Export failed.')
    }
    setExportingCsv(false)
  }

  return (
    <div style={styles.page}>
      {/* Lightbox */}
      {lightbox && (
        <div style={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Photo" style={styles.lightboxImg} onClick={e => e.stopPropagation()} />
          <button style={styles.lightboxClose} onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerInner}>
          <img src="/tfj_logo.png" alt="TF Jones" style={{ height: 30, objectFit: 'contain', alignSelf: 'center' }} />
          <div style={{ width: 1, height: 28, background: '#EEFF00', opacity: 0.4, alignSelf: 'center' }} />
          <button style={styles.backBtn} onClick={() => navigate('/')}>← Back</button>
          {!editing ? (
            <div style={{ flex: 1 }}>
              <h1 style={styles.projectTitle}>{project?.name}</h1>
              <p style={{ color: GREY, fontSize: 13 }}>
                {[project?.address, project?.postcode].filter(Boolean).join(', ')}
                {project?.client_name && <span style={{ color: '#EEFF00', marginLeft: 12 }}>{project.client_name}</span>}
              </p>
            </div>
          ) : (
            <div style={styles.editForm}>
              {[
                ['Project Name', 'name'],
                ['Address',      'address'],
                ['Postcode',     'postcode'],
              ].map(([label, key]) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <label style={styles.editLabel}>{label}</label>
                  <input
                    style={styles.editInput}
                    value={editForm[key]}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={styles.editLabel}>Client</label>
                <select
                  style={{ ...styles.editInput, cursor: 'pointer' }}
                  value={editForm.client_name}
                  onChange={e => {
                    const selected = clients.find(c => c.name === e.target.value)
                    setEditForm(f => ({
                      ...f,
                      client_name:  e.target.value,
                      client_logo:  selected?.logo_filename || '',
                      client_id:    selected?.id || null,
                    }))
                  }}
                >
                  <option value="">— Select client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button style={styles.saveBtn} onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          )}
          {!editing && (
            <div style={{ display: 'flex', gap: 8, alignSelf: 'center', flexWrap: 'wrap' }}>
              <button style={styles.editBtn} onClick={startEdit}>Edit Project</button>
              <button
                style={{ ...styles.editBtn, background: '#EEFF00', opacity: generatingPdf ? 0.6 : 1 }}
                disabled={generatingPdf || inspections.length === 0}
                onClick={async () => {
                  setGeneratingPdf(true)
                  try { await generateProjectReport(project, inspections) } catch (e) { console.error(e) }
                  setGeneratingPdf(false)
                }}
              >
                {generatingPdf ? 'Generating…' : '⬇ Download PDF'}
              </button>
              <button
                style={{ ...styles.editBtn, background: '#1A3A5C', border: '1px solid #4CAF50', color: '#4CAF50', opacity: exportingCsv ? 0.6 : 1 }}
                disabled={exportingCsv || inspections.length === 0 || !project?.client_id}
                onClick={exportCsv}
              >
                {exportingCsv ? 'Exporting…' : '⬇ Export Jobs CSV'}
              </button>
              <button
                style={{
                  ...styles.editBtn,
                  background: project?.is_published ? '#1A3A2A' : '#1A2A3A',
                  border: `1px solid ${project?.is_published ? '#4CAF50' : '#8A9BAD'}`,
                  color: project?.is_published ? '#4CAF50' : '#8A9BAD',
                  opacity: publishing ? 0.6 : 1,
                }}
                disabled={publishing || inspections.length === 0}
                onClick={async () => {
                  setPublishing(true)
                  const newVal = !project.is_published
                  const { data, error } = await supabase
                    .from('projects')
                    .update({ is_published: newVal })
                    .eq('id', project.id)
                    .select()
                    .single()
                  if (!error) setProject(data)
                  setPublishing(false)
                }}
              >
                {publishing ? 'Updating…' : project?.is_published ? '✓ Released to Clients' : '⬆ Release to Clients'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={styles.content}>
        {/* Stats */}
        <div style={styles.statsRow}>
          <Stat label="Total" value={inspections.length} color={GREY} />
          <Stat label="Pass"  value={passCount}           color={PASS_COLOR} />
          <Stat label="Fail"  value={failCount}           color={FAIL_COLOR} />
          <div style={{ marginLeft: 'auto', color: GREY, fontSize: 13, alignSelf: 'center' }}>
            Engineer: <strong style={{ color: '#fff' }}>{project?.engineer_name || '—'}</strong>
          </div>
        </div>

        {/* Inspections */}
        <h2 style={styles.sectionTitle}>Inspections</h2>

        {loading ? <Spinner /> : inspections.length === 0 ? (
          <p style={{ color: GREY }}>No inspections recorded yet.</p>
        ) : inspections.map(ins => (
          <InspectionCard
            key={ins.id}
            inspection={ins}
            expanded={expanded === ins.id}
            onToggle={() => setExpanded(expanded === ins.id ? null : ins.id)}
            onPhoto={setLightbox}
          />
        ))}
      </div>
    </div>
  )
}

function InspectionCard({ inspection: ins, expanded, onToggle, onPhoto }) {
  const passed    = ins.inspection_passed === 'Pass'
  const passColor = passed ? PASS_COLOR : FAIL_COLOR
  const date      = new Date(ins.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const photos = [
    ['Outside', ins.photo_outside_url],
    ['Inside',  ins.photo_inside_url],
    ['Photo 1', ins.photo1_url],
    ['Photo 2', ins.photo2_url],
    ['Photo 3', ins.photo3_url],
    ['Photo 4', ins.photo4_url],
    ['Photo 5', ins.photo5_url],
    ['Photo 6', ins.photo6_url],
  ].filter(([, url]) => url)

  const fields = [
    ['Survey Type',         ins.survey_type],
    ['Assembly Type',       ins.doorset_assembly_type],
    ['Configuration',       ins.doorset_configuration],
    ['Fire Rating',         ins.fire_rating],
    ['Fire Door ID Type',   ins.fire_door_id_type],
    ['Leaf Sizes (mm)',     ins.leaf_sizes_mm],
    ['Add-ons',             ins.additional_addons],
    ['Glazing OK',          ins.glazing_free_from_damage],
    ['Structure Intact',    ins.surrounding_structure_intact],
    ['Door/Frame Condition',ins.condition_door_leaf_frame],
    ['3mm Gap Tolerance',   ins.gap_3mm_tolerance],
    ['Gap — Hinge Side',    ins.gap_hinge_side],
    ['Gap — Lock Side',     ins.gap_lock_side],
    ['Gap — Head',          ins.gap_head],
    ['Gap — Threshold (mm)',ins.gap_threshold_mm],
    ['Threshold Within Tol.',ins.threshold_gap_within_tolerance],
    ['Leaf Flush to Rebates',ins.leaf_flush_to_rebates],
    ['Self-Closing Device', ins.self_closing_device],
    ['Hinges Acceptable',   ins.hinges_condition_acceptable],
    ['Essential Hardware',  ins.essential_hardware_acceptable],
    ['Correct Signage',     ins.correct_signage_present],
    ['Intumescent Seals',   ins.intumescent_seals_acceptable],
    ['Fire Stopping',       ins.fire_stopping_acceptable],
    ['Recommended Action',  ins.recommended_action],
    ['Remedial Works',      ins.remedial_works_completed],
    ['Repair Actions',      ins.recommended_repair_actions],
    ['Replacement Reason',  ins.replacement_reason],
    ['Inspector',           ins.engineer_name],
  ].filter(([, v]) => v)

  return (
    <div style={styles.card}>
      {/* Card header */}
      <div style={styles.cardHeader} onClick={onToggle}>
        <div style={{ width: 4, minHeight: 48, background: passColor, borderRadius: 2, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={styles.cardTitle}>{ins.door_location || 'Unknown location'}</div>
          {ins.door_asset_id && <div style={{ color: GREY, fontSize: 13 }}>ID: {ins.door_asset_id}</div>}
          {ins.fire_rating   && <div style={{ color: '#8AB4D4', fontSize: 13 }}>{ins.fire_rating}</div>}
          <div style={{ color: GREY, fontSize: 12, marginTop: 2 }}>{date}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span style={{ ...styles.badge, background: `${passColor}22`, color: passColor }}>
            {ins.inspection_passed || '—'}
          </span>
          <span style={{ color: GREY, fontSize: 18 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={styles.cardBody}>
          <div style={styles.fieldsGrid}>
            {fields.map(([label, value]) => (
              <div key={label} style={styles.fieldRow}>
                <span style={styles.fieldLabel}>{label}</span>
                <span style={styles.fieldValue}>{value}</span>
              </div>
            ))}
          </div>

          {photos.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={styles.photoHeading}>Photos</div>
              <div style={styles.photoGrid}>
                {photos.map(([label, url]) => (
                  <div key={label} style={styles.photoItem} onClick={() => onPhoto(url)}>
                    <img src={url} alt={label} style={styles.photoThumb} />
                    <div style={styles.photoLabel}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: GREY }}>{label}</div>
    </div>
  )
}

function Spinner() {
  return <div style={{ width: 36, height: 36, border: '3px solid #162840', borderTop: '3px solid #EEFF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '40px auto' }} />
}

const styles = {
  page: { minHeight: '100vh', background: '#0D1F35' },
  header: { background: '#1A3A5C', padding: '0 24px', borderBottom: '1px solid #162840' },
  headerInner: { maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 0', flexWrap: 'wrap', position: 'relative' },
  backBtn: { background: 'transparent', border: '1px solid #8A9BAD', borderRadius: 6, padding: '6px 14px', color: '#8A9BAD', fontSize: 13, whiteSpace: 'nowrap', alignSelf: 'center' },
  projectTitle: { fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 },
  editBtn: { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 700, fontSize: 13, alignSelf: 'center', whiteSpace: 'nowrap' },
  editForm: { display: 'flex', flexWrap: 'wrap', gap: 12, flex: 1 },
  editLabel: { fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em' },
  editInput: { background: '#0D1F35', border: '1px solid #1A3A5C', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 14, minWidth: 160, outline: 'none' },
  saveBtn: { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 700, fontSize: 13 },
  cancelBtn: { background: 'transparent', border: '1px solid #8A9BAD', borderRadius: 6, padding: '8px 14px', color: '#8A9BAD', fontSize: 13 },
  content: { maxWidth: 1200, margin: '0 auto', padding: '24px' },
  statsRow: { display: 'flex', gap: 32, background: '#081628', borderRadius: 12, padding: '16px 24px', marginBottom: 24, alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: '#8A9BAD', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card: { background: '#162840', borderRadius: 10, marginBottom: 10, overflow: 'hidden', border: '1px solid #1A3A5C' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' },
  cardTitle: { fontWeight: 600, fontSize: 16, color: '#fff' },
  badge: { borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  cardBody: { background: '#0D1F35', padding: '16px 20px', borderTop: '1px solid #1A3A5C' },
  fieldsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '6px 24px' },
  fieldRow: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #162840' },
  fieldLabel: { color: GREY, fontSize: 13 },
  fieldValue: { color: '#fff', fontSize: 13, fontWeight: 500, textAlign: 'right', marginLeft: 12 },
  photoHeading: { color: '#EEFF00', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 },
  photoGrid: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  photoItem: { cursor: 'pointer' },
  photoThumb: { width: 100, height: 100, objectFit: 'cover', borderRadius: 6, border: '1px solid #1A3A5C', display: 'block' },
  photoLabel: { color: GREY, fontSize: 11, textAlign: 'center', marginTop: 4 },
  lightboxOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  lightboxImg: { maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 },
  lightboxClose: { position: 'absolute', top: 20, right: 24, background: 'transparent', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' },
}
