import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateProjectReport } from '../lib/generateReport'

const PASS_COLOR   = '#4CAF50'
const FAIL_COLOR   = '#F44336'
const GREY         = '#8A9BAD'
const FLAT_DAYS    = 365
const COMMUNAL_DAYS = 90
const WARN_DAYS    = 30

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

export default function ProjectDetailPage() {
  const { id }            = useParams()
  const { state }         = useLocation()
  const navigate          = useNavigate()

  const [project,           setProject]           = useState(state?.project || null)
  const [inspections,       setInspections]       = useState([])
  const [loading,           setLoading]           = useState(true)
  const [expanded,          setExpanded]          = useState(null)
  const [lightbox,          setLightbox]          = useState(null)
  const [editing,           setEditing]           = useState(false)
  const [editForm,          setEditForm]          = useState({})
  const [saving,            setSaving]            = useState(false)
  const [generatingPdf,     setGeneratingPdf]     = useState(false)
  const [clients,           setClients]           = useState([])
  const [publishing,        setPublishing]        = useState(false)
  const [exportingCsv,      setExportingCsv]      = useState(false)
  const [doorSearch,        setDoorSearch]        = useState('')
  const [doorFilter,        setDoorFilter]        = useState('')      // '' | 'Pass' | 'Fail'
  const [doorSort,          setDoorSort]          = useState('date')  // 'date' | 'name' | 'result'
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting,          setDeleting]          = useState(false)

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
      name:        project?.name        || '',
      address:     project?.address     || '',
      postcode:    project?.postcode    || '',
      client_name: project?.client_name || '',
      client_logo: project?.client_logo || '',
      client_id:   project?.client_id   || null,
      notes:       project?.notes       || '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    const { data, error } = await supabase.from('projects').update(editForm).eq('id', id).select().single()
    if (!error) { setProject(data); setEditing(false) }
    setSaving(false)
  }

  async function deleteProject() {
    setDeleting(true)
    await supabase.from('inspections').delete().eq('project_id', id)
    await supabase.from('projects').delete().eq('id', id)
    navigate('/')
  }

  async function exportCsv() {
    setExportingCsv(true)
    try {
      const remedials = inspections.filter(i =>
        i.inspection_passed === 'Fail' &&
        (i.recommended_action?.toLowerCase().includes('repair') || i.remedial_works_completed)
      )
      if (remedials.length === 0) { alert('No remedial jobs to export for this project.'); setExportingCsv(false); return }

      // Fetch client alpha codes
      let alphas = { alpha_client: '', alpha_branch: '', alpha_contract: '', alpha_contractor: 'TFJ', alpha_depot: 'HQ', alpha_priority: 'TARGET' }
      if (project.client_id) {
        const { data: clientData } = await supabase.from('clients').select('alpha_client,alpha_branch,alpha_contract,alpha_contractor,alpha_depot,alpha_priority').eq('id', project.client_id).single()
        if (clientData) alphas = clientData
      }

      const headers = [
        'Client_Alpha','Branch_Alpha','Contract_Alpha','Contractor_Alpha','Depot_Alpha','Priority_Alpha',
        'Property Ref','Address','Postcode','Job Number','Received Date','Required Date',
        'Job Description','SOR Code','Qty','SOR Description','Rate','Costcode','Orderno',
        'Asset_Contact','Asset_Contact_Phone','Asset_Contact_Notes','Asset_Contact_Email',
      ]
      const rows = remedials.map(i => [
        alphas.alpha_client    || '',
        alphas.alpha_branch    || '',
        alphas.alpha_contract  || '',
        alphas.alpha_contractor || 'TFJ',
        alphas.alpha_depot     || 'HQ',
        alphas.alpha_priority  || 'TARGET',
        '',                    // Property Ref — fill manually
        project.address        || '',
        project.postcode       || '',
        '',                    // Job Number — blank
        '',                    // Received Date
        '',                    // Required Date
        `Fire Door Repair - ${i.door_location || i.door_asset_id || 'Unknown'}: ${i.remedial_works_completed || i.recommended_action || ''}`,
        '', '', '', '', '', '', '', '', '', '',
      ])

      const csv  = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = Object.assign(document.createElement('a'), { href: url, download: `${project.name || 'export'}_jobs.csv` })
      a.click(); URL.revokeObjectURL(url)
    } catch (e) { console.error(e); alert('Export failed.') }
    setExportingCsv(false)
  }

  // Stats
  const passCount      = inspections.filter(i => i.inspection_passed === 'Pass').length
  const failCount      = inspections.filter(i => i.inspection_passed === 'Fail').length
  const passRate       = inspections.length > 0 ? Math.round((passCount / inspections.length) * 100) : null
  const lastInspected  = inspections[0] ? new Date(inspections[0].created_at).toLocaleDateString('en-GB') : null

  // Filter + sort inspections
  const visibleInspections = useMemo(() => {
    let list = [...inspections]
    if (doorSearch)  list = list.filter(i =>
      i.door_location?.toLowerCase().includes(doorSearch.toLowerCase()) ||
      i.door_asset_id?.toLowerCase().includes(doorSearch.toLowerCase())
    )
    if (doorFilter)  list = list.filter(i => i.inspection_passed === doorFilter)
    if (doorSort === 'name')   list.sort((a,b) => (a.door_location || '').localeCompare(b.door_location || ''))
    if (doorSort === 'result') list.sort((a,b) => (a.inspection_passed || '').localeCompare(b.inspection_passed || ''))
    if (doorSort === 'date')   list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    return list
  }, [inspections, doorSearch, doorFilter, doorSort])

  return (
    <div style={styles.page}>

      {/* Lightbox */}
      {lightbox && (
        <div style={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Photo" style={styles.lightboxImg} onClick={e => e.stopPropagation()} />
          <button style={styles.lightboxClose} onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div style={styles.lightboxOverlay} onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background: '#162840', borderRadius: 12, padding: 32, maxWidth: 400, width: '90%', border: '1px solid #F44336' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 12px' }}>Delete Project?</h3>
            <p style={{ color: GREY, margin: '0 0 24px', fontSize: 14 }}>
              This will permanently delete <strong style={{ color: '#fff' }}>{project?.name}</strong> and all {inspections.length} inspection{inspections.length !== 1 ? 's' : ''}. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                style={{ background: '#F44336', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}
                disabled={deleting}
                onClick={deleteProject}
              >{deleting ? 'Deleting…' : 'Yes, Delete'}</button>
              <button
                style={{ background: 'transparent', border: '1px solid #8A9BAD', borderRadius: 6, padding: '10px 20px', color: '#8A9BAD', fontSize: 14, cursor: 'pointer' }}
                onClick={() => setShowDeleteConfirm(false)}
              >Cancel</button>
            </div>
          </div>
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
              <p style={{ color: GREY, fontSize: 13, margin: 0 }}>
                {[project?.address, project?.postcode].filter(Boolean).join(', ')}
                {project?.client_name && <span style={{ color: '#EEFF00', marginLeft: 12 }}>{project.client_name}</span>}
              </p>
            </div>
          ) : (
            <div style={styles.editForm}>
              {[['Project Name','name'],['Address','address'],['Postcode','postcode']].map(([label, key]) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <label style={styles.editLabel}>{label}</label>
                  <input style={styles.editInput} value={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={styles.editLabel}>Client</label>
                <select style={{ ...styles.editInput, cursor: 'pointer' }} value={editForm.client_name}
                  onChange={e => {
                    const selected = clients.find(c => c.name === e.target.value)
                    setEditForm(f => ({ ...f, client_name: e.target.value, client_logo: selected?.logo_filename || '', client_id: selected?.id || null }))
                  }}>
                  <option value="">— Select client —</option>
                  {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 200 }}>
                <label style={styles.editLabel}>Notes</label>
                <textarea style={{ ...styles.editInput, resize: 'vertical', minHeight: 60 }} value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4, alignSelf: 'flex-end' }}>
                <button style={styles.saveBtn} onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          )}

          {!editing && (
            <div style={{ display: 'flex', gap: 8, alignSelf: 'center', flexWrap: 'wrap' }}>
              <button style={styles.editBtn} onClick={startEdit}>Edit</button>
              <button style={{ ...styles.editBtn, background: '#EEFF00', color: '#0D1F35', opacity: generatingPdf ? 0.6 : 1 }}
                disabled={generatingPdf || inspections.length === 0}
                onClick={async () => { setGeneratingPdf(true); try { await generateProjectReport(project, inspections) } catch(e) { console.error(e) } setGeneratingPdf(false) }}>
                {generatingPdf ? 'Generating…' : '⬇ PDF'}
              </button>
              <button style={{ ...styles.editBtn, background: '#1A3A5C', border: '1px solid #4CAF50', color: '#4CAF50', opacity: exportingCsv ? 0.6 : 1 }}
                disabled={exportingCsv || inspections.length === 0}
                onClick={exportCsv}>
                {exportingCsv ? 'Exporting…' : '⬇ CSV'}
              </button>
              <button style={{ ...styles.editBtn, background: project?.is_published ? '#1A3A2A' : '#1A2A3A', border: `1px solid ${project?.is_published ? '#4CAF50' : '#8A9BAD'}`, color: project?.is_published ? '#4CAF50' : '#8A9BAD', opacity: publishing ? 0.6 : 1 }}
                disabled={publishing || inspections.length === 0}
                onClick={async () => {
                  setPublishing(true)
                  const { data, error } = await supabase.from('projects').update({ is_published: !project.is_published }).eq('id', project.id).select().single()
                  if (!error) setProject(data)
                  setPublishing(false)
                }}>
                {publishing ? 'Updating…' : project?.is_published ? '✓ Released' : '⬆ Release'}
              </button>
              <button style={{ ...styles.editBtn, background: '#2E0A0A', border: '1px solid #F44336', color: '#F44336' }}
                onClick={() => setShowDeleteConfirm(true)}>
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={styles.content}>

        {/* Stats */}
        <div style={styles.statsRow}>
          <Stat label="Total"    value={inspections.length} color={GREY} />
          <Stat label="Pass"     value={passCount}          color={PASS_COLOR} />
          <Stat label="Fail"     value={failCount}          color={FAIL_COLOR} />
          {passRate !== null && <Stat label="Pass Rate" value={`${passRate}%`} color={passRate >= 80 ? PASS_COLOR : passRate >= 50 ? '#FF9800' : FAIL_COLOR} />}
          {lastInspected && (
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ color: GREY, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Inspected</div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{lastInspected}</div>
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: GREY, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inspector</div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{project?.engineer_name || '—'}</div>
          </div>
        </div>

        {/* Project notes */}
        {project?.notes && (
          <div style={{ background: '#162840', borderRadius: 10, padding: '14px 18px', marginBottom: 20, border: '1px solid #1A3A5C' }}>
            <div style={{ color: GREY, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Project Notes</div>
            <div style={{ color: '#CBD5E1', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{project.notes}</div>
          </div>
        )}

        {/* Inspections */}
        <h2 style={styles.sectionTitle}>
          Inspections
          <span style={{ color: GREY, fontSize: 13, fontWeight: 400, marginLeft: 10 }}>
            {visibleInspections.length}{inspections.length !== visibleInspections.length ? ` of ${inspections.length}` : ''} doors
          </span>
        </h2>

        {/* Search + filter + sort */}
        {inspections.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              style={{ flex: 1, minWidth: 180, background: '#162840', border: '1px solid #243F5C', borderRadius: 8, padding: '9px 14px', color: '#fff', fontSize: 14, outline: 'none' }}
              placeholder="Search door name or barcode…"
              value={doorSearch}
              onChange={e => setDoorSearch(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {['', 'Pass', 'Fail'].map(f => (
                <button key={f} onClick={() => setDoorFilter(f)} style={{
                  background: doorFilter === f ? (f === 'Pass' ? '#0A2E1A' : f === 'Fail' ? '#2E0A0A' : '#243F5C') : 'transparent',
                  border: `1px solid ${doorFilter === f ? (f === 'Pass' ? PASS_COLOR : f === 'Fail' ? FAIL_COLOR : '#EEFF00') : '#243F5C'}`,
                  color: doorFilter === f ? (f === 'Pass' ? PASS_COLOR : f === 'Fail' ? FAIL_COLOR : '#EEFF00') : GREY,
                  borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  {f || 'All'}
                </button>
              ))}
            </div>
            <select
              style={{ background: '#162840', border: '1px solid #243F5C', borderRadius: 8, padding: '9px 14px', color: '#fff', fontSize: 13, outline: 'none' }}
              value={doorSort}
              onChange={e => setDoorSort(e.target.value)}
            >
              <option value="date">Sort: Date</option>
              <option value="name">Sort: Name</option>
              <option value="result">Sort: Result</option>
            </select>
          </div>
        )}

        {loading ? <Spinner /> : inspections.length === 0 ? (
          <p style={{ color: GREY }}>No inspections recorded yet.</p>
        ) : visibleInspections.length === 0 ? (
          <p style={{ color: GREY }}>No doors match your filter.</p>
        ) : visibleInspections.map(ins => (
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
  const { due, diff, status } = dueInfo(ins)
  const dueColor  = status === 'overdue' ? FAIL_COLOR : status === 'soon' ? '#FF9800' : PASS_COLOR
  const dueLabel  = status === 'overdue'
    ? `Overdue by ${Math.abs(diff)}d`
    : `Next due ${due.toLocaleDateString('en-GB')}`

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
    ['Survey Type',          ins.survey_type],
    ['Assembly Type',        ins.doorset_assembly_type],
    ['Configuration',        ins.doorset_configuration],
    ['Fire Rating',          ins.fire_rating],
    ['Fire Door ID Type',    ins.fire_door_id_type],
    ['Leaf Sizes (mm)',      ins.leaf_sizes_mm],
    ['Add-ons',              ins.additional_addons],
    ['Glazing OK',           ins.glazing_free_from_damage],
    ['Structure Intact',     ins.surrounding_structure_intact],
    ['Door/Frame Condition', ins.condition_door_leaf_frame],
    ['3mm Gap Tolerance',    ins.gap_3mm_tolerance],
    ['Gap — Hinge Side',     ins.gap_hinge_side],
    ['Gap — Lock Side',      ins.gap_lock_side],
    ['Gap — Head',           ins.gap_head],
    ['Gap — Threshold (mm)', ins.gap_threshold_mm],
    ['Threshold Within Tol.',ins.threshold_gap_within_tolerance],
    ['Leaf Flush to Rebates',ins.leaf_flush_to_rebates],
    ['Self-Closing Device',  ins.self_closing_device],
    ['Hinges Acceptable',    ins.hinges_condition_acceptable],
    ['Essential Hardware',   ins.essential_hardware_acceptable],
    ['Correct Signage',      ins.correct_signage_present],
    ['Intumescent Seals',    ins.intumescent_seals_acceptable],
    ['Fire Stopping',        ins.fire_stopping_acceptable],
    ['Recommended Action',   ins.recommended_action],
    ['Remedial Works',       ins.remedial_works_completed],
    ['Repair Actions',       ins.recommended_repair_actions],
    ['Replacement Reason',   ins.replacement_reason],
    ['Inspector',            ins.engineer_name],
  ].filter(([, v]) => v)

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader} onClick={onToggle}>
        <div style={{ width: 4, minHeight: 52, background: passColor, borderRadius: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.cardTitle}>{ins.door_location || 'Unknown location'}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
            {ins.door_asset_id && <span style={{ color: GREY, fontSize: 12 }}>ID: {ins.door_asset_id}</span>}
            {ins.fire_rating   && <span style={{ color: '#8AB4D4', fontSize: 12 }}>{ins.fire_rating}</span>}
            <span style={{ color: GREY, fontSize: 12 }}>{date}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: dueColor }}>
            {doorCategory(ins.doorset_assembly_type) === 'flat' ? 'FLAT' : 'COMMUNAL'} · {dueLabel}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <span style={{ ...styles.badge, background: `${passColor}22`, color: passColor }}>
            {ins.inspection_passed || '—'}
          </span>
          <span style={{ color: GREY, fontSize: 16 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

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
  page:           { minHeight: '100vh', background: '#0D1F35' },
  header:         { background: '#1A3A5C', padding: '0 24px', borderBottom: '1px solid #162840' },
  headerInner:    { maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 0', flexWrap: 'wrap' },
  backBtn:        { background: 'transparent', border: '1px solid #8A9BAD', borderRadius: 6, padding: '6px 14px', color: '#8A9BAD', fontSize: 13, whiteSpace: 'nowrap', alignSelf: 'center', cursor: 'pointer' },
  projectTitle:   { fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 },
  editBtn:        { background: '#1A3A5C', color: '#fff', border: '1px solid #243F5C', borderRadius: 6, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  editForm:       { display: 'flex', flexWrap: 'wrap', gap: 12, flex: 1 },
  editLabel:      { fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em' },
  editInput:      { background: '#0D1F35', border: '1px solid #1A3A5C', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 14, minWidth: 160, outline: 'none' },
  saveBtn:        { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  cancelBtn:      { background: 'transparent', border: '1px solid #8A9BAD', borderRadius: 6, padding: '8px 14px', color: '#8A9BAD', fontSize: 13, cursor: 'pointer' },
  content:        { maxWidth: 1200, margin: '0 auto', padding: '24px' },
  statsRow:       { display: 'flex', gap: 32, background: '#081628', borderRadius: 12, padding: '16px 24px', marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' },
  sectionTitle:   { fontSize: 16, fontWeight: 600, color: '#8A9BAD', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' },
  card:           { background: '#162840', borderRadius: 10, marginBottom: 10, overflow: 'hidden', border: '1px solid #1A3A5C' },
  cardHeader:     { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' },
  cardTitle:      { fontWeight: 600, fontSize: 16, color: '#fff' },
  badge:          { borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  cardBody:       { background: '#0D1F35', padding: '16px 20px', borderTop: '1px solid #1A3A5C' },
  fieldsGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '6px 24px' },
  fieldRow:       { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #162840' },
  fieldLabel:     { color: GREY, fontSize: 13 },
  fieldValue:     { color: '#fff', fontSize: 13, fontWeight: 500, textAlign: 'right', marginLeft: 12 },
  photoHeading:   { color: '#EEFF00', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 },
  photoGrid:      { display: 'flex', flexWrap: 'wrap', gap: 10 },
  photoItem:      { cursor: 'pointer' },
  photoThumb:     { width: 100, height: 100, objectFit: 'cover', borderRadius: 6, border: '1px solid #1A3A5C', display: 'block' },
  photoLabel:     { color: GREY, fontSize: 11, textAlign: 'center', marginTop: 4 },
  lightboxOverlay:{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  lightboxImg:    { maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 },
  lightboxClose:  { position: 'absolute', top: 20, right: 24, background: 'transparent', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' },
}
