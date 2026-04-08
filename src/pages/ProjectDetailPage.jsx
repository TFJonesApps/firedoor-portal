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
  const [pdfProgress,       setPdfProgress]       = useState(null)
  const [clients,           setClients]           = useState([])
  const [publishing,        setPublishing]        = useState(false)
  const [exportingCsv,      setExportingCsv]      = useState(false)
  const [doorSearch,        setDoorSearch]        = useState('')
  const [doorFilter,        setDoorFilter]        = useState('')
  const [doorSort,          setDoorSort]          = useState('date')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting,          setDeleting]          = useState(false)
  const [currentUser,       setCurrentUser]       = useState(null)
  // Remedial action modal
  const [actionModal,       setActionModal]       = useState(null)  // inspection obj
  const [actionNote,        setActionNote]        = useState('')
  const [actioning,         setActioning]         = useState(false)

  useEffect(() => {
    fetchData()
    supabase.from('clients').select('*').order('name').then(({ data }) => setClients(data || []))
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user))
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
    const { error: insErr } = await supabase.from('inspections').delete().eq('project_id', id)
    if (insErr) { alert('Failed to delete inspections: ' + insErr.message); setDeleting(false); return }
    const { error: projErr } = await supabase.from('projects').delete().eq('id', id)
    if (projErr) { alert('Failed to delete project: ' + projErr.message); setDeleting(false); return }
    navigate('/')
  }

  async function markActioned() {
    if (!actionModal) return
    setActioning(true)
    await supabase.from('inspections').update({
      remedial_actioned:    true,
      remedial_actioned_at: new Date().toISOString(),
      remedial_actioned_by: currentUser?.email || 'Unknown',
      remedial_action_note: actionNote.trim() || null,
    }).eq('id', actionModal.id)
    setActionModal(null)
    setActionNote('')
    setActioning(false)
    await fetchData()
  }

  async function undoActioned(inspectionId) {
    await supabase.from('inspections').update({
      remedial_actioned:    false,
      remedial_actioned_at: null,
      remedial_actioned_by: null,
      remedial_action_note: null,
    }).eq('id', inspectionId)
    await fetchData()
  }

  async function exportCsv() {
    setExportingCsv(true)
    try {
      const remedials = inspections.filter(i =>
        i.inspection_passed === 'Fail' &&
        (i.recommended_action?.toLowerCase().includes('repair') || i.remedial_works_completed)
      )
      if (remedials.length === 0) { alert('No remedial jobs to export for this project.'); setExportingCsv(false); return }

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
        '',
        project.address        || '',
        project.postcode       || '',
        '', '', '',
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

  const passCount      = inspections.filter(i => i.inspection_passed === 'Pass').length
  const failCount      = inspections.filter(i => i.inspection_passed === 'Fail').length
  const actionedCount  = inspections.filter(i => i.remedial_actioned).length
  const hasRepairJobs  = inspections.some(i =>
    i.inspection_passed === 'Fail' &&
    (i.recommended_action?.toLowerCase().includes('repair') || i.remedial_works_completed)
  )
  const passRate      = inspections.length > 0 ? Math.round((passCount / inspections.length) * 100) : null
  const lastInspected = inspections[0] ? new Date(inspections[0].created_at).toLocaleDateString('en-GB') : null

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

      {/* PDF generation progress modal */}
      {pdfProgress && (
        <div style={styles.lightboxOverlay}>
          <div style={styles.pdfModal}>
            <div style={styles.pdfModalTitle}>Generating Report</div>
            <div style={styles.pdfModalLabel}>{pdfProgress.label}</div>
            <div style={styles.pdfModalBarWrap}>
              <div style={{
                ...styles.pdfModalBarFill,
                width: `${pdfProgress.total ? (pdfProgress.current / pdfProgress.total) * 100 : 0}%`
              }} />
            </div>
            <div style={styles.pdfModalCount}>
              {pdfProgress.current} / {pdfProgress.total} doors
            </div>
          </div>
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
              <button style={{ background: '#F44336', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}
                disabled={deleting} onClick={deleteProject}>{deleting ? 'Deleting…' : 'Yes, Delete'}</button>
              <button style={{ background: 'transparent', border: '1px solid #8A9BAD', borderRadius: 6, padding: '10px 20px', color: '#8A9BAD', fontSize: 14, cursor: 'pointer' }}
                onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Actioned modal */}
      {actionModal && (
        <div style={styles.lightboxOverlay} onClick={() => { setActionModal(null); setActionNote('') }}>
          <div style={{ background: '#162840', borderRadius: 14, padding: 28, maxWidth: 460, width: '90%', border: '1px solid #4CAF50' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: 18 }}>Mark Remedial Actioned</h3>
            <p style={{ color: GREY, margin: '0 0 6px', fontSize: 13 }}>
              <strong style={{ color: '#fff' }}>{actionModal.door_location || actionModal.door_asset_id}</strong>
            </p>
            {actionModal.recommended_action && (
              <p style={{ color: '#FF9800', margin: '0 0 16px', fontSize: 13, background: '#FF980011', borderRadius: 6, padding: '8px 12px', border: '1px solid #FF980033' }}>
                {actionModal.recommended_action}
              </p>
            )}
            <label style={{ color: GREY, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Note (optional)</label>
            <textarea
              style={{ width: '100%', marginTop: 8, background: '#0D1F35', border: '1px solid #1A3A5C', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, resize: 'vertical', minHeight: 80, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              placeholder="e.g. Contractor attended 27/03/2026, closer replaced…"
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
            />
            <p style={{ color: GREY, fontSize: 12, margin: '8px 0 20px' }}>Logged as: <strong style={{ color: '#fff' }}>{currentUser?.email}</strong></p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{ background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: actioning ? 0.6 : 1 }}
                disabled={actioning} onClick={markActioned}>
                {actioning ? 'Saving…' : '✓ Confirm Actioned'}
              </button>
              <button style={{ background: 'transparent', border: '1px solid #8A9BAD', borderRadius: 8, padding: '10px 18px', color: '#8A9BAD', fontSize: 14, cursor: 'pointer' }}
                onClick={() => { setActionModal(null); setActionNote('') }}>Cancel</button>
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
                {project?.order_number && <span style={{ color: '#8A9BAD', marginLeft: 12 }}>Order: <strong style={{ color: '#fff' }}>{project.order_number}</strong></span>}
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
                onClick={async () => {
                  setGeneratingPdf(true)
                  setPdfProgress({ current: 0, total: inspections.length, label: 'Preparing report…' })
                  try {
                    await generateProjectReport(project, inspections, setPdfProgress)
                  } catch(e) { console.error(e) }
                  setPdfProgress(null)
                  setGeneratingPdf(false)
                }}>
                {generatingPdf ? 'Generating…' : '⬇ PDF'}
              </button>
              {hasRepairJobs && (
                <button style={{ ...styles.editBtn, background: '#1A3A5C', border: '1px solid #4CAF50', color: '#4CAF50', opacity: exportingCsv ? 0.6 : 1 }}
                  disabled={exportingCsv}
                  onClick={exportCsv}>
                  {exportingCsv ? 'Exporting…' : '⬇ CSV'}
                </button>
              )}
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
          {failCount > 0 && <Stat label="Actioned" value={`${actionedCount}/${failCount}`} color={actionedCount === failCount ? PASS_COLOR : '#FF9800'} />}
          {lastInspected && (
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ color: GREY, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Inspected</div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{lastInspected}</div>
            </div>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: GREY, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inspector</div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{(project?.engineer_name && !project.engineer_name.includes('@')) ? project.engineer_name : '—'}</div>
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
            project={project}
            expanded={expanded === ins.id}
            onToggle={() => setExpanded(expanded === ins.id ? null : ins.id)}
            onPhoto={setLightbox}
            onMarkActioned={() => { setActionModal(ins); setActionNote('') }}
            onUndoActioned={() => undoActioned(ins.id)}
          />
        ))}
      </div>
    </div>
  )
}

function InspectionCard({ inspection: ins, project, expanded, onToggle, onPhoto, onMarkActioned, onUndoActioned }) {
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
    ['Order Number',         project?.order_number],
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
    ['Inspector',            (ins.engineer_name && !ins.engineer_name.includes('@')) ? ins.engineer_name : (project?.engineer_name && !project.engineer_name.includes('@')) ? project.engineer_name : ins.engineer_name],
  ].filter(([, v]) => v)

  const actionedAt = ins.remedial_actioned_at
    ? new Date(ins.remedial_actioned_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  return (
    <div style={{ ...styles.card, opacity: ins.remedial_actioned ? 0.75 : 1 }}>
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
          {/* Actioned info */}
          {ins.remedial_actioned && (
            <div style={{ marginTop: 5, fontSize: 12, color: PASS_COLOR, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>✓ Actioned {actionedAt} by {ins.remedial_actioned_by}</span>
              {ins.remedial_action_note && <span style={{ color: GREY }}>· {ins.remedial_action_note}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <span style={{ ...styles.badge, background: `${passColor}22`, color: passColor }}>
            {ins.inspection_passed || '—'}
          </span>
          {ins.remedial_actioned && (
            <span style={{ ...styles.badge, background: '#4CAF5022', color: '#4CAF50', fontSize: 11 }}>✓ Actioned</span>
          )}
          <span style={{ color: GREY, fontSize: 16 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Mark actioned / undo bar — shown on fail doors without expanding */}
      {!passed && (
        <div style={{ padding: '8px 16px 8px 24px', background: '#0D1F35', borderTop: '1px solid #1A3A5C', display: 'flex', alignItems: 'center', gap: 10 }} onClick={e => e.stopPropagation()}>
          {ins.remedial_actioned ? (
            <button
              style={{ background: 'transparent', border: '1px solid #8A9BAD', borderRadius: 6, padding: '5px 14px', color: '#8A9BAD', fontSize: 12, cursor: 'pointer' }}
              onClick={onUndoActioned}>
              Undo Actioned
            </button>
          ) : (
            <button
              style={{ background: '#4CAF5022', border: '1px solid #4CAF50', borderRadius: 6, padding: '5px 14px', color: '#4CAF50', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onClick={onMarkActioned}>
              ✓ Mark Actioned
            </button>
          )}
          {ins.recommended_action && !ins.remedial_actioned && (
            <span style={{ color: '#FF9800', fontSize: 12 }}>{ins.recommended_action}</span>
          )}
        </div>
      )}

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
  backBtn:        { background: 'none', border: '1px solid #EEFF00', borderRadius: 4, padding: '6px 14px', color: '#EEFF00', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', alignSelf: 'center', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' },
  projectTitle:   { fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 },
  editBtn:        { background: 'none', border: '1px solid #EEFF00', borderRadius: 4, padding: '8px 14px', color: '#EEFF00', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' },
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
  pdfModal:       { background: '#162840', border: '1px solid #1A3A5C', borderRadius: 12, padding: '28px 36px', minWidth: 340, maxWidth: 460, textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' },
  pdfModalTitle:  { fontSize: 16, fontWeight: 700, color: '#EEFF00', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 },
  pdfModalLabel:  { fontSize: 14, color: '#fff', marginBottom: 16, minHeight: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pdfModalBarWrap:{ height: 8, background: '#0D1F35', borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  pdfModalBarFill:{ height: '100%', background: '#EEFF00', transition: 'width 0.2s ease' },
  pdfModalCount:  { fontSize: 12, color: GREY, fontWeight: 600 },
}
