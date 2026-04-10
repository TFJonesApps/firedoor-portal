import jsPDF from 'jspdf'

// ─── Palette ────────────────────────────────────────────────────────────────── 
const NAVY = [13, 31, 53]
const YELLOW = [238, 255, 0]
const WHITE = [255, 255, 255]
const LGREY = [246, 248, 250]
const MGREY = [210, 217, 226]
const SLATE = [95, 112, 130]
const DARK = [28, 38, 52]
const GREEN = [22, 101, 52]
const RED = [153, 27, 27]
const ORANGE = [255, 140, 0]
const ORANGE_LIGHT = [255, 248, 240]

const W = 210 
const H = 297 
const ML = 16 
const MR = 16 
const CW = W - ML - MR 

// Client name → logo filename fallback (for projects created without client_logo)
const CLIENT_LOGOS = {
  'TF Jones':                     'tfj_logo.png',
  'Wigan Council':                'Wigan_Council.png',
  'Peaks & Plains Housing Trust': 'peaks and plains logo.png',
  'Lancaster City Council':       'lancastercc.png',
}

// Small helper: yield to the event loop so the browser can GC and repaint.
// Prevents tab freezes / OOM crashes on large (40+ door) reports.
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0))

// ─── Entry point: Project Report ──────────────────────────────────────────────
// Optional `onProgress({ current, total, label })` callback — wire this to a
// modal in the UI so users see progress instead of thinking the tab has hung.
export async function generateProjectReport(project, inspections, onProgress) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogoImage('/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png').catch(() => null)

  // Resolve client logo — use project field first, fall back to known map
  let clientLogoPath = project.client_logo || CLIENT_LOGOS[project.client_name] || '';
  if (clientLogoPath && !clientLogoPath.startsWith('http') && !clientLogoPath.startsWith('/')) {
    clientLogoPath = `/${clientLogoPath}`;
  }
  const clientLogo = clientLogoPath ? await loadLogoImage(clientLogoPath).catch(() => null) : null

  const summaryPages = await coverPage(doc, logo, clientLogo, project, inspections)
  const grandTotal = summaryPages + inspections.length

  for (let i = 0; i < inspections.length; i++) {
    doc.addPage()
    await inspectionPage(doc, logo, project, inspections[i], summaryPages + i + 1, grandTotal)

    // Report progress and yield every page so the browser stays responsive.
    // On a 40-door report this is the single biggest stability fix.
    onProgress?.({
      current: i + 1,
      total: inspections.length,
      label: inspections[i]?.door_location || `Door ${i + 1}`
    })
    if ((i + 1) % 3 === 0) await yieldToBrowser()
  }

  const parts = [project.client_name, project.name, project.postcode || project.address].filter(Boolean).map(s => s.trim())
  const filename = parts.join(' - ').replace(/[/\\?%*:|"<>]/g, '') + '.pdf'
  doc.save(filename)
}

// ─── Entry point: Single Inspection Report ──────────────────────────────────── 
export async function generateSingleInspectionReport(project, inspection) { 
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) 
  const logo = await loadLogoImage('/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png').catch(() => null) 
  await inspectionPage(doc, logo, project, inspection, 1, 1) 
  const dateStr = new Date(inspection.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) 
  const loc = (inspection.door_location || 'Door').replace(/[/\\?%*:|"<>]/g, '') 
  doc.save(`${loc} - ${dateStr}.pdf`) 
} 

// ─── Entry point: Full History Report ───────────────────────────────────────── 
export async function generateFullHistoryReport(assetId, inspections, remedials = []) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogoImage('/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png').catch(() => null)

  const sorted = [...inspections].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const latest = sorted[0]
  const project = latest.projects || { name: 'Asset History Log', client_name: '' }
  const completedRemedials = remedials.filter(r => r.status === 'completed')

  const grandTotal = sorted.length + 1 + completedRemedials.length
  await historyCoverPage(doc, logo, project, latest, assetId, 1, grandTotal)

  for (let i = 0; i < sorted.length; i++) {
    doc.addPage()
    await inspectionPage(doc, logo, project, sorted[i], i + 2, grandTotal)
    if ((i + 1) % 3 === 0) await yieldToBrowser()
  }

  // Append remedial evidence pages
  let nextPage = sorted.length + 2
  for (let i = 0; i < completedRemedials.length; i++) {
    doc.addPage()
    const pagesUsed = await remedialEvidencePage(doc, logo, completedRemedials[i], nextPage, grandTotal)
    nextPage += pagesUsed
    if ((i + 1) % 3 === 0) await yieldToBrowser()
  }

  doc.save(`History_${assetId}.pdf`)
}

// ─── Cover Page (Project Report) ───────────────────────────────────────────── 
async function coverPage(doc, logo, clientLogo, project, inspections) { 
  const passed = inspections.filter(i => i.inspection_passed === 'Pass').length 
  const failed = inspections.filter(i => i.inspection_passed === 'Fail').length 
  const total = inspections.length 
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0 
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) 

  const FOOTER_CLEAR = 14 
  const AVAIL_COVER = H - FOOTER_CLEAR 
  const STATIC_BOTTOM = 185 
  const rowsOnCover = Math.max(0, Math.floor((AVAIL_COVER - STATIC_BOTTOM) / SUM_ROW_H)) 
  const overflow = Math.max(0, total - rowsOnCover) 
  const overflowPages = overflow > 0 ? Math.ceil(overflow / Math.floor((AVAIL_COVER - 38) / SUM_ROW_H)) : 0 
  const grandTotal = 1 + overflowPages + inspections.length 

  doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F') 
  drawPageHeader(doc, logo, 'FIRE DOOR INSPECTION REPORT', dateStr) 

  let y = 34 
  const LOGO_BOX_W = 55; const logoBoxX = W - MR - LOGO_BOX_W 
  const ry = y + 10 

  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE); doc.text('PREPARED FOR', logoBoxX, ry) 

  if (clientLogo) { 
    const ratio = clientLogo.width / clientLogo.height 
    const MAX_W = 55; const targetH = ratio < 1.5 ? 52 : 22 
    let dh = targetH, dw = dh * ratio 
    if (dw > MAX_W) { dw = MAX_W; dh = dw / ratio } 
    doc.addImage(clientLogo.dataUrl, 'PNG', logoBoxX, ry + 5, dw, dh) 
  } 

  const leftW = logoBoxX - ML - 8 
  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY) 
  const nameLines = doc.splitTextToSize(project.name || 'Untitled Project', leftW) 
  doc.text(nameLines, ML, y + 10) 
  let nameBottom = y + 10 + nameLines.length * 9 

  if (project.address) { 
    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE) 
    doc.text(project.address, ML, nameBottom + 3); nameBottom += 6 
  }
  if (project.postcode) {
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK)
    doc.text(project.postcode, ML, nameBottom + 3); nameBottom += 6
  }

  y = Math.max(nameBottom + 6, y + 57) + 4 

  // Stats strip
  const statW = (CW - 9) / 4 
  const stats = [ 
    { label: 'Total Doors', value: total, color: NAVY }, 
    { label: 'Passed', value: passed, color: GREEN }, 
    { label: 'Failed', value: failed, color: RED }, 
    { label: 'Pass Rate', value: `${passRate}%`, color: NAVY }, 
  ] 
  stats.forEach((s, i) => { 
    const bx = ML + i * (statW + 3) 
    doc.setFillColor(...LGREY); doc.roundedRect(bx, y, statW, 17, 1.5, 1.5, 'F') 
    doc.setFillColor(...s.color); doc.roundedRect(bx, y, statW, 2.5, 1.5, 1.5, 'F') 
    doc.rect(bx, y + 1.2, statW, 1.3, 'F') 
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...s.color) 
    doc.text(String(s.value), bx + statW / 2, y + 10.5, { align: 'center' }) 
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE) 
    doc.text(s.label.toUpperCase(), bx + statW / 2, y + 14.5, { align: 'center' }) 
  }) 
  y += 22 

  // Info card
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text('Project Information', ML, y) 
  y += 4; doc.setFillColor(...MGREY); doc.rect(ML, y, CW, 0.4, 'F'); y += 0.4 

  const infoRows = [
    ['Client', project.client_name || '—'],
    ['Fire Door Inspector', (project.engineer_name && !project.engineer_name.includes('@')) ? project.engineer_name : '—'],
    ['Address', [project.address, project.postcode].filter(Boolean).join(', ') || '—'],
    project.order_number ? ['Order Number', project.order_number] : null,
    ['Report Date', dateStr],
    ['Total Inspections', String(total)],
  ].filter(Boolean)
  infoRows.forEach(([label, value], i) => {
    const rowH = 8.5; const ry = y + i * rowH 
    doc.setFillColor(...(i % 2 === 0 ? LGREY : WHITE)); doc.rect(ML, ry, CW, rowH, 'F') 
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE); doc.text(label, ML + 3, ry + 5.8) 
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK) 
    const val = doc.splitTextToSize(value, CW * 0.55)[0] 
    doc.text(val, ML + CW - 3, ry + 5.8, { align: 'right' }) 
  }) 
  y += infoRows.length * 8.5 + 8 

  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text('Inspection Summary', ML, y) 
  y += 4; y = drawSummaryHeader(doc, y) 

  let rowIndex = 0; let currentPage = 1 
  for (let i = 0; i < inspections.length; i++) { 
    if (y + SUM_ROW_H > H - FOOTER_CLEAR - 2) { 
      drawFooter(doc, currentPage, grandTotal) 
      doc.addPage(); currentPage++ 
      doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F') 
      drawPageHeader(doc, logo, project.name, 'INSPECTION SUMMARY (CONTINUED)') 
      y = 34; doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text('Inspection Summary (continued)', ML, y) 
      y += 4; y = drawSummaryHeader(doc, y) 
    } 
    drawSummaryRow(doc, inspections[i], y, rowIndex) 
    y += SUM_ROW_H; rowIndex++ 
  } 
  doc.setFillColor(...MGREY); doc.rect(ML, y, CW, 0.4, 'F') 
  drawFooter(doc, currentPage, grandTotal) 
  return currentPage 
}

// ─── History Front Sheet (Door Asset History Log) ─────────────────────────────
async function historyCoverPage(doc, logo, project, latest, assetId, pageNum, totalPages) {
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F')
  drawPageHeader(doc, logo, 'DOOR ASSET HISTORY LOG', dateStr)

  let y = 50
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE); doc.text('ASSET IDENTIFICATION', ML, y)
  y += 12
  doc.setFontSize(28); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(assetId || 'N/A', ML, y)
  y += 10
  doc.setFontSize(14); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE); doc.text(latest.door_location || 'Location Not Specified', ML, y)

  y += 25
  const cardW = (CW - 5) / 2
  doc.setFillColor(...LGREY); doc.roundedRect(ML, y, cardW, 25, 2, 2, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE); doc.text('CURRENT COMPLIANCE STATUS', ML + 5, y + 8)
  const isPass = latest.inspection_passed === 'Pass'
  doc.setFontSize(16); doc.setTextColor(...(isPass ? GREEN : RED)); doc.text(latest.inspection_passed?.toUpperCase() || 'UNKNOWN', ML + 5, y + 18)

  doc.setFillColor(...LGREY); doc.roundedRect(ML + cardW + 5, y, cardW, 25, 2, 2, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE); doc.text('ESTABLISHED FIRE RATING', ML + cardW + 10, y + 8)
  doc.setFontSize(16); doc.setTextColor(...NAVY); doc.text(latest.fire_rating || 'N/A', ML + cardW + 10, y + 18)

  y += 45
  doc.setFillColor(...NAVY); doc.rect(ML, y, 10, 1, 'F'); y += 8
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text('REPORT DETAILS', ML, y)
  y += 8
  const details = [
    ['Client:', project.client_name || 'N/A'],
    ['Site Name:', project.name || 'N/A'],
    ['Total Records:', `${totalPages - 1} Inspections`],
    ['Latest Inspection:', new Date(latest.created_at).toLocaleDateString('en-GB')]
  ]
  details.forEach(([label, value], i) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE); doc.text(label, ML, y + (i * 8))
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK); doc.text(String(value), ML + 40, y + (i * 8))
  })
  drawFooter(doc, pageNum, totalPages)
}

// ─── Gap Diagram ─────────────────────────────────────────────────────────────
// Draws a rectangular door outline with gap measurements on each side.
// Values over 3mm are red, within tolerance are green.
function drawGapDiagram(doc, ins, x, y, colW) {
  const parseGap = (val) => {
    if (!val) return null
    const n = parseFloat(String(val).replace(/[^0-9.]/g, ''))
    return isNaN(n) ? null : n
  }
  const gapColor = (val) => {
    const n = parseGap(val)
    if (n === null) return SLATE
    return n > 3 ? RED : GREEN
  }
  const gapLabel = (val) => {
    if (!val) return '—'
    const n = parseGap(val)
    if (n === null) return String(val)
    return n > 8 ? `${n}mm — Over 8mm` : `${n}mm`
  }

  const boxW = colW; const boxH = 62
  const doorW = 28; const doorH = 34
  const doorX = x + (boxW - doorW) / 2
  const doorY = y + 18

  // Title bar
  doc.setFillColor(...NAVY); doc.rect(x, y, boxW, 6.5, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...YELLOW)
  doc.text('DOOR GAP MEASUREMENTS', x + 2.5, y + 4.5)

  // Background
  doc.setFillColor(...LGREY); doc.rect(x, y + 6.5, boxW, boxH - 6.5, 'F')

  // Door rectangle with subtle shadow
  doc.setFillColor(230, 230, 230); doc.rect(doorX + 0.5, doorY + 0.5, doorW, doorH, 'F')
  doc.setDrawColor(...MGREY); doc.setLineWidth(0.6)
  doc.setFillColor(...WHITE); doc.rect(doorX, doorY, doorW, doorH, 'FD')
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2)

  // "DOOR" label inside rectangle
  doc.setFontSize(5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MGREY)
  doc.text('DOOR', doorX + doorW / 2, doorY + doorH / 2 + 1, { align: 'center' })

  // Head (top) — centered above door
  doc.setFontSize(6); doc.setFont('helvetica', 'bold')
  doc.setTextColor(...gapColor(ins.gap_head))
  doc.text(`Head ${gapLabel(ins.gap_head)}`, x + boxW / 2, doorY - 3, { align: 'center' })

  // Threshold (bottom) — centered below door
  doc.setTextColor(...gapColor(ins.gap_threshold_mm))
  doc.text(`Threshold ${gapLabel(ins.gap_threshold_mm)}`, x + boxW / 2, doorY + doorH + 6, { align: 'center' })

  // Hinge side (left)
  doc.setTextColor(...gapColor(ins.gap_hinge_side))
  doc.text('Hinge', doorX - 3, doorY + doorH / 2 - 1, { align: 'right' })
  doc.text(gapLabel(ins.gap_hinge_side), doorX - 3, doorY + doorH / 2 + 4, { align: 'right' })

  // Closing side (right)
  doc.setTextColor(...gapColor(ins.gap_lock_side))
  doc.text('Closing', doorX + doorW + 3, doorY + doorH / 2 - 1, { align: 'left' })
  doc.text(gapLabel(ins.gap_lock_side), doorX + doorW + 3, doorY + doorH / 2 + 4, { align: 'left' })

  // Border
  doc.setDrawColor(...MGREY); doc.setLineWidth(0.3)
  doc.rect(x, y, boxW, boxH)
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2)

  return boxH
}

// ─── Inspection Detail Page ─────────────────────────────────────────────────── 
async function inspectionPage(doc, logo, project, ins, pageNum, totalPages) { 
  const passed = ins.inspection_passed === 'Pass' 
  const passColor = passed ? GREEN : RED 
  const passLabel = passed ? 'PASS' : 'FAIL' 

  doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F') 
  drawPageHeader(doc, logo, project.name, project.client_name || '', false) 

  const headY = 30; const headH = 20 
  doc.setFillColor(...LGREY); doc.rect(ML, headY, CW, headH, 'F') 
  doc.setFillColor(...passColor); doc.rect(ML, headY, 3.5, headH, 'F') 

  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY) 
  const locLines = doc.splitTextToSize(ins.door_location || 'Unknown Location', CW - 52) 
  doc.text(locLines, ML + 7, headY + 9) 

  const badgeW = 24; const badgeX = ML + CW - badgeW 
  doc.setFillColor(...passColor); doc.roundedRect(badgeX, headY + 3.5, badgeW, 11, 2, 2, 'F') 
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255) 
  doc.text(passLabel, badgeX + badgeW / 2, headY + 11, { align: 'center' }) 

  const inspectorName = (ins.engineer_name && !ins.engineer_name.includes('@')) ? ins.engineer_name : project.engineer_name || ins.engineer_name
  const meta = [ins.door_asset_id && `Asset ID: ${ins.door_asset_id}`, ins.fire_rating, new Date(ins.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), inspectorName && `Inspector: ${inspectorName}`].filter(Boolean).join(' · ')
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE); doc.text(meta, ML + 7, headY + headH - 4) 

  const sections = [ 
    { title: 'Door Details', fields: [
      ['What type of survey was carried out?', ins.survey_type],
      ['What is the doorset assembly type?', ins.doorset_assembly_type], 
      ['What is the door configuration?', ins.doorset_configuration], 
      ['What is the fire rating of the door?', ins.fire_rating], 
      ['How is the fire door identified?', ins.fire_door_id_type], 
      ['What are the leaf sizes (mm)?', ins.leaf_sizes_mm], 
      ['What additional add-ons are present?', ins.additional_addons], 
      ['Is fire stopping acceptable?', ins.fire_stopping_acceptable], 
    ]}, 
    { title: 'Condition & Gaps', fields: [ 
      ['Is glazing free from damage?', ins.glazing_free_from_damage], 
      ['Is the surrounding structure intact?', ins.surrounding_structure_intact], 
      ['What is the condition of the door/frame?', ins.condition_door_leaf_frame], 
      ['Are gaps within the 3mm tolerance?', ins.gap_3mm_tolerance], 
      ['What is the gap on the hinge side?', ins.gap_hinge_side], 
      ['What is the gap on the lock side?', ins.gap_lock_side], 
      ['What is the gap at the head?', ins.gap_head], 
      ['What is the threshold gap (mm)?', ins.gap_threshold_mm], 
      ['Is the threshold gap within tolerance?', ins.threshold_gap_within_tolerance], 
      ['Is the leaf flush to the rebates?', ins.leaf_flush_to_rebates], 
    ]}, 
    { title: 'Hardware & Certification', fields: [ 
      ['Is a self-closing device fitted and working?', ins.self_closing_device], 
      ['Are the hinges in acceptable condition?', ins.hinges_condition_acceptable], 
      ['Is all essential hardware acceptable?', ins.essential_hardware_acceptable], 
      ['Is correct fire door signage present?', ins.correct_signage_present], 
      ['Are intumescent seals in acceptable condition?', ins.intumescent_seals_acceptable], 
    ]}, 
    { title: 'Outcome & Actions', fields: [ 
      ['What is the recommended action?', ins.recommended_action], 
      ['Have remedial works been completed?', ins.remedial_works_completed], 
      ['What repair actions are recommended?', ins.recommended_repair_actions], 
      ['What is the reason for replacement?', ins.replacement_reason], 
    ]} 
  ] 

  const colW = (CW - 4) / 2; let leftY = headY + 25, rightY = headY + 25
  const actionLower = ins.recommended_action?.toLowerCase() || ''
  const needsRepairBox = actionLower.includes('repair') || actionLower.includes('replace')
  for (const section of sections) {
    const active = section.fields.filter(([, v]) => v)
    if (active.length === 0) continue
    const isAction = section.title === 'Outcome & Actions'
    const isRepairAction = isAction && needsRepairBox
    let startX = leftY <= rightY ? ML : ML + colW + 4
    let cy = leftY <= rightY ? leftY : rightY
    const sectionStartY = cy

    // Header bar — orange for repair actions, navy otherwise
    if (isRepairAction) {
      doc.setFillColor(...ORANGE); doc.rect(startX, cy, colW, 6.5, 'F')
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE); doc.text('ACTION REQUIRED', startX + 2.5, cy + 4.5)
      // Severity badge
      const badgeW = 22; const badgeX = startX + colW - badgeW - 2
      const severityLabel = actionLower.includes('replace') ? 'REPLACE' : 'REPAIR'
      doc.setFillColor(...RED); doc.roundedRect(badgeX, cy + 1, badgeW, 4.5, 1, 1, 'F')
      doc.setFontSize(5.5); doc.setTextColor(...WHITE); doc.text(severityLabel, badgeX + badgeW / 2, cy + 4.2, { align: 'center' })
    } else {
      doc.setFillColor(...NAVY); doc.rect(startX, cy, colW, 6.5, 'F')
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...YELLOW); doc.text(section.title.toUpperCase(), startX + 2.5, cy + 4.5)
    }
    cy += 6.5

    active.forEach(([label, value], i) => {
      const labelLines = doc.splitTextToSize(label, colW * 0.45)
      const valLines = doc.splitTextToSize(String(value), colW * 0.45)
      const rh = Math.max(6, Math.max(labelLines.length, valLines.length) * 4.5 + 2.5)
      doc.setFillColor(...(isRepairAction ? (i % 2 === 0 ? ORANGE_LIGHT : WHITE) : (i % 2 === 0 ? LGREY : WHITE))); doc.rect(startX, cy, colW, rh, 'F')
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE); doc.text(labelLines, startX + 2.5, cy + 4)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...(isRepairAction ? RED : DARK)); doc.text(valLines, startX + colW - 2.5, cy + 4, { align: 'right' }); cy += rh
    })

    // Orange border around repair action section
    if (isRepairAction) {
      doc.setDrawColor(...ORANGE); doc.setLineWidth(0.6)
      doc.rect(startX, sectionStartY, colW, cy - sectionStartY)
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2)
    }

    if (leftY <= rightY) leftY = cy + 4; else rightY = cy + 4

    // Gap diagram — draw after Condition & Gaps section when gaps are out of tolerance
    if (section.title === 'Condition & Gaps' && ins.gap_3mm_tolerance && ins.gap_3mm_tolerance !== 'Yes') {
      const hasGaps = ins.gap_head || ins.gap_hinge_side || ins.gap_lock_side || ins.gap_threshold_mm
      if (hasGaps) {
        // Place in whichever column is shorter
        const diagX = leftY <= rightY ? ML : ML + colW + 4
        const diagY = leftY <= rightY ? leftY : rightY
        const diagH = drawGapDiagram(doc, ins, diagX, diagY, colW)
        if (diagX === ML) leftY = diagY + diagH + 4; else rightY = diagY + diagH + 4
      }
    }
  }

  const photos = [['Outside', ins.photo_outside_url], ['Inside', ins.photo_inside_url], ['Photo 1', ins.photo1_url], ['Photo 2', ins.photo2_url], ['Photo 3', ins.photo3_url], ['Photo 4', ins.photo4_url], ['Photo 5', ins.photo5_url], ['Photo 6', ins.photo6_url]].filter(([, u]) => u)
  if (photos.length > 0) {
    const PHOTO_GAP   = 4
    const PHOTO_COL_W = (CW - PHOTO_GAP) / 2   // 2 columns always
    const FOOTER_H    = 14
    const HEADER_H    = 10                       // photo section header
    const LABEL_H     = 5                        // label above each photo
    const ROW_GAP     = 3

    const numRows     = Math.ceil(photos.length / 2)
    let py            = Math.max(leftY, rightY) + 4
    const available   = H - FOOTER_H - py - HEADER_H  // total vertical space left
    const idealCellH  = (available - (numRows - 1) * ROW_GAP - numRows * LABEL_H) / numRows
    const CELL_H      = Math.max(25, Math.min(55, idealCellH))  // minimum 25mm per photo
    const ROW_H       = CELL_H + LABEL_H + ROW_GAP

    // Header bar
    doc.setFillColor(...LGREY); doc.rect(ML, py, CW, 7, 'F')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text('INSPECTION PHOTOGRAPHS', ML + 5.5, py + 4.8)
    py += HEADER_H

    for (let i = 0; i < Math.min(photos.length, 8); i++) {
      const col = i % 2
      const px = ML + col * (PHOTO_COL_W + PHOTO_GAP)
      // Cell background
      doc.setFillColor(...LGREY); doc.roundedRect(px, py, PHOTO_COL_W, CELL_H + LABEL_H, 1, 1, 'F')
      // Label
      doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE); doc.text(photos[i][0], px + 2, py + 4)
      // Photo — fit inside cell maintaining aspect ratio
      try {
        const img = await loadImage(photos[i][1])
        const imgEl = await getImageDimensions(img)
        const maxW = PHOTO_COL_W - 2, maxH = CELL_H - 2
        const ratio = imgEl.width / imgEl.height
        let dw = maxW, dh = dw / ratio
        if (dh > maxH) { dh = maxH; dw = dh * ratio }
        const ox = px + (PHOTO_COL_W - dw) / 2
        const oy = py + LABEL_H + (CELL_H - dh) / 2
        doc.addImage(img, 'JPEG', ox, oy, dw, dh)
      } catch (_) {}
      // Advance row after right column or last photo
      if (col === 1 || i === photos.length - 1) py += ROW_H
    }
  }
  drawFooter(doc, pageNum, totalPages) 
} 

// ─── Helpers ────────────────────────────────────────────────────────────────── 
function drawPageHeader(doc, logo, rightTitle, rightSub, showLogo = true) { 
  doc.setFillColor(...WHITE); doc.rect(0, 0, W, 24, 'F') 
  if (showLogo && logo) { 
    const h = 16, w = (logo.width / logo.height) * h 
    doc.addImage(logo.dataUrl, 'PNG', ML, 4, w, h) 
  } 
  if (rightTitle) { doc.setFontSize(7.5); doc.setTextColor(...SLATE); doc.text(rightTitle, W - MR, 11, { align: 'right' }) } 
  if (rightSub) { doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK); doc.text(rightSub, W - MR, 19, { align: 'right' }) } 
} 

function drawFooter(doc, pageNum, totalPages) { 
  doc.setFillColor(...NAVY); doc.rect(0, H - 12, W, 12, 'F') 
  doc.setFontSize(7); doc.setTextColor(130, 155, 175); doc.text('TF Jones · Fire Door Inspection', ML, H - 4.5) 
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE); doc.text(`Page ${pageNum} of ${totalPages}`, W - MR, H - 4.5, { align: 'right' }) 
} 

const SUM_ROW_H = 7; const SUM_HEAD_H = 8 
function drawSummaryHeader(doc, y) { 
  doc.setFillColor(...NAVY); doc.rect(ML, y, CW, SUM_HEAD_H, 'F') 
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE) 
  doc.text('DOOR LOCATION', ML + 3, y + 5.5) 
  doc.text('FIRE RATING', ML + CW * 0.53, y + 5.5) 
  doc.text('RESULT', ML + CW - 3, y + 5.5, { align: 'right' }) 
  return y + SUM_HEAD_H 
} 

function drawSummaryRow(doc, ins, y, rowIndex) { 
  const isPassed = ins.inspection_passed === 'Pass' 
  doc.setFillColor(...(rowIndex % 2 === 0 ? WHITE : LGREY)); doc.rect(ML, y, CW, SUM_ROW_H, 'F') 
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK) 
  const loc = doc.splitTextToSize(ins.door_location || '—', CW * 0.5)[0] 
  doc.text(loc, ML + 3, y + 5) 
  doc.text(ins.fire_rating || '—', ML + CW * 0.53, y + 5) 
  // Result pill — sized to fill most of the row height, text properly centered.
  const bw = 22
  const bh = SUM_ROW_H - 2          // 5mm -> fills row with 1mm padding each side
  const bx = ML + CW - 3 - bw
  const by = y + 1
  doc.setFillColor(...(isPassed ? GREEN : RED))
  doc.roundedRect(bx, by, bw, bh, 1.8, 1.8, 'F')
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  // Vertical centre: jsPDF text y is the baseline, so nudge by ~0.35 * fontSize/2
  doc.text(
    (ins.inspection_passed || '—').toUpperCase(),
    bx + bw / 2,
    by + bh / 2 + 1.3,
    { align: 'center', baseline: 'alphabetic' }
  )
}

// ─── Entry point: Remedial Evidence Report ────────────────────────────────────
export async function generateRemedialEvidence(remedial) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogoImage('/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png').catch(() => null)
  const totalPhotos = (remedial.before_photo_urls?.length || 0) + (remedial.after_photo_urls?.length || 0)
  const totalPages = totalPhotos > 6 ? 2 : 1
  await remedialEvidencePage(doc, logo, remedial, 1, totalPages)
  const location = remedial.inspections?.door_location || remedial.door_asset_id || 'remedial'
  doc.save(`Remedial_Evidence_${location.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`)
}

// ─── Remedial Evidence Page (reusable for embedding in history) ──────────────
async function remedialEvidencePage(doc, logo, rem, startPage, totalPages) {
  let pageNum = startPage
  const FOOTER_H = 14
  const PHOTO_GAP = 4
  const HALF_W = (CW - PHOTO_GAP) / 2

  function newPage(subtitle) {
    drawFooter(doc, pageNum, totalPages)
    doc.addPage(); pageNum++
    doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F')
    drawPageHeader(doc, logo, 'REMEDIAL EVIDENCE REPORT', subtitle || '')
    return 34
  }

  doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F')
  drawPageHeader(doc, logo, 'REMEDIAL EVIDENCE REPORT', new Date(rem.completed_at || rem.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }))

  let y = 34

  // ── Combined info table: door info + action + completion in one block ──
  const allRows = [
    { label: 'Location', value: rem.inspections?.door_location, section: 'info' },
    { label: 'Asset ID', value: rem.door_asset_id || rem.inspections?.door_asset_id, section: 'info' },
    { label: 'Fire Rating', value: rem.inspections?.fire_rating, section: 'info' },
    { label: 'Project', value: rem.projects?.name, section: 'info' },
    { label: 'Client', value: rem.projects?.client_name, section: 'info' },
    { label: 'Address', value: [rem.projects?.address, rem.projects?.postcode].filter(Boolean).join(', '), section: 'info' },
    { label: 'Action Required', value: rem.recommended_action, section: 'action' },
    { label: 'Repair Details', value: rem.recommended_repair_actions, section: 'action' },
    { label: 'Completed By', value: rem.joiner_name, section: 'completion' },
    { label: 'Completed', value: rem.completed_at ? new Date(rem.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null, section: 'completion' },
    { label: 'Notes', value: rem.completion_notes, section: 'completion' },
  ].filter(r => r.value)

  // Section headers
  const sectionHeaders = { info: 'DOOR & PROJECT', action: 'ACTION REQUIRED', completion: 'REPAIR COMPLETED' }
  const sectionColors = {
    info: { header: NAVY, headerText: YELLOW, even: LGREY, odd: WHITE, text: DARK },
    action: { header: ORANGE, headerText: WHITE, even: ORANGE_LIGHT, odd: WHITE, text: RED },
    completion: { header: GREEN, headerText: WHITE, even: LGREY, odd: WHITE, text: DARK },
  }
  let lastSection = ''
  let rowInSection = 0

  allRows.forEach((row) => {
    const sc = sectionColors[row.section]
    // Draw section header when section changes
    if (row.section !== lastSection) {
      if (lastSection) y += 2
      doc.setFillColor(...sc.header); doc.rect(ML, y, CW, 6.5, 'F')
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...sc.headerText)
      doc.text(sectionHeaders[row.section], ML + 2.5, y + 4.5)
      // Severity badge on action header
      if (row.section === 'action') {
        const sLabel = (rem.recommended_action || '').toLowerCase().includes('replace') ? 'REPLACE' : 'REPAIR'
        const bw = 22; const bx = ML + CW - bw - 2
        doc.setFillColor(...RED); doc.roundedRect(bx, y + 1, bw, 4.5, 1, 1, 'F')
        doc.setFontSize(5.5); doc.setTextColor(...WHITE); doc.text(sLabel, bx + bw / 2, y + 4.2, { align: 'center' })
      }
      y += 6.5
      lastSection = row.section
      rowInSection = 0
    }

    const valLines = doc.splitTextToSize(String(row.value), CW * 0.55)
    const rh = Math.max(7, valLines.length * 4.5 + 3)
    doc.setFillColor(...(rowInSection % 2 === 0 ? sc.even : sc.odd)); doc.rect(ML, y, CW, rh, 'F')
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE); doc.text(row.label, ML + 3, y + 5)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...sc.text); doc.text(valLines, ML + CW - 3, y + 5, { align: 'right' })
    y += rh
    rowInSection++
  })
  y += 8

  // ── Photo sections: before on left, after on right (side by side) ──
  const beforePhotos = (rem.before_photo_urls || []).slice(0, 4)
  const afterPhotos = (rem.after_photo_urls || []).slice(0, 4)
  const hasPhotos = beforePhotos.length > 0 || afterPhotos.length > 0

  if (hasPhotos) {
    const spaceLeft = H - FOOTER_H - y
    // If not enough space for photos (~80mm minimum), start new page
    if (spaceLeft < 80) { y = newPage('PHOTOGRAPHIC EVIDENCE') }

    // Side-by-side layout: before column left, after column right
    const colW = HALF_W
    const photoAreaH = H - FOOTER_H - y - 4

    async function drawPhotoColumn(photos, title, startX) {
      let py = y
      // Column header
      doc.setFillColor(...LGREY); doc.rect(startX, py, colW, 7, 'F')
      doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(title, startX + 3, py + 4.8)
      py += 8

      const count = photos.length
      const cellGap = 3
      const labelH = 5
      const availH = photoAreaH - 8 // minus header
      const cellH = Math.max(20, Math.min(65, (availH - (count - 1) * cellGap - count * labelH) / count))

      for (let i = 0; i < count; i++) {
        doc.setFillColor(...LGREY); doc.roundedRect(startX, py, colW, cellH + labelH, 1, 1, 'F')
        doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE); doc.text(`Photo ${i + 1}`, startX + 2, py + 4)
        try {
          const img = await loadImage(photos[i])
          const imgEl = await getImageDimensions(img)
          const maxW = colW - 4, maxH = cellH - 2
          const ratio = imgEl.width / imgEl.height
          let dw = maxW, dh = dw / ratio
          if (dh > maxH) { dh = maxH; dw = dh * ratio }
          const ox = startX + (colW - dw) / 2
          const oy = py + labelH + (cellH - dh) / 2
          doc.addImage(img, 'JPEG', ox, oy, dw, dh)
        } catch (_) {}
        py += cellH + labelH + cellGap
      }
      return py
    }

    // If only one set of photos, use full width
    if (beforePhotos.length > 0 && afterPhotos.length === 0) {
      await drawFullWidthPhotos(beforePhotos, 'BEFORE — EVIDENCE OF DAMAGE')
    } else if (afterPhotos.length > 0 && beforePhotos.length === 0) {
      await drawFullWidthPhotos(afterPhotos, 'AFTER — COMPLETED REPAIR')
    } else {
      // Both sets — side by side
      const endLeft = beforePhotos.length > 0 ? await drawPhotoColumn(beforePhotos, 'BEFORE', ML) : y
      const endRight = afterPhotos.length > 0 ? await drawPhotoColumn(afterPhotos, 'AFTER', ML + colW + PHOTO_GAP) : y
      y = Math.max(endLeft, endRight)
    }

    async function drawFullWidthPhotos(photos, title) {
      doc.setFillColor(...LGREY); doc.rect(ML, y, CW, 7, 'F')
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(title, ML + 3, y + 4.8)
      y += 9
      const count = photos.length
      const cols = count === 1 ? 1 : 2
      const cellW = cols === 1 ? CW : HALF_W
      const availH = H - FOOTER_H - y - 4
      const rows = Math.ceil(count / cols)
      const cellH = Math.max(30, Math.min(80, (availH - (rows - 1) * 3 - rows * 5) / rows))

      for (let i = 0; i < count; i++) {
        const col = cols === 1 ? 0 : i % 2
        const px = ML + col * (HALF_W + PHOTO_GAP)
        const w = cellW
        doc.setFillColor(...LGREY); doc.roundedRect(px, y, w, cellH + 5, 1, 1, 'F')
        doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE); doc.text(`Photo ${i + 1}`, px + 2, y + 4)
        try {
          const img = await loadImage(photos[i])
          const imgEl = await getImageDimensions(img)
          const maxW = w - 4, maxH = cellH - 2
          const ratio = imgEl.width / imgEl.height
          let dw = maxW, dh = dw / ratio
          if (dh > maxH) { dh = maxH; dw = dh * ratio }
          const ox = px + (w - dw) / 2
          const oy = y + 5 + (cellH - dh) / 2
          doc.addImage(img, 'JPEG', ox, oy, dw, dh)
        } catch (_) {}
        if (cols === 1 || col === 1 || i === count - 1) y += cellH + 5 + 3
      }
    }
  }

  drawFooter(doc, pageNum, totalPages)
  return pageNum - startPage + 1
}

// ─── Image helpers ────────────────────────────────────────────────────────────
function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = () => resolve({ width: 4, height: 3 }) // fallback 4:3
    img.src = dataUrl
  })
}

async function loadImage(url) {
  return new Promise((resolve, reject) => { 
    const img = new Image(); img.crossOrigin = 'anonymous' 
    img.onload = () => { 
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height 
      canvas.getContext('2d').drawImage(img, 0, 0) 
      resolve(canvas.toDataURL('image/jpeg', 0.85)) 
    } 
    img.onerror = reject; img.src = url + (url.includes('?') ? '&' : '?') + `_=${Date.now()}` 
  }) 
} 

async function loadLogoImage(url) { 
  return new Promise((resolve, reject) => { 
    if (!url) return reject('No URL');
    const img = new Image(); img.crossOrigin = 'anonymous' 
    img.onload = () => { 
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height 
      canvas.getContext('2d').drawImage(img, 0, 0) 
      try {
        const trimmed = trimWhitespace(canvas) 
        resolve({ dataUrl: trimmed.toDataURL('image/png'), width: trimmed.width, height: trimmed.height }) 
      } catch (e) {
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.width, height: img.height }) 
      }
    } 
    img.onerror = reject; img.src = url.startsWith('http') ? `${url}?t=${Date.now()}` : url; 
  }) 
} 

function trimWhitespace(canvas) { 
  const ctx = canvas.getContext('2d'); const w = canvas.width; const h = canvas.height 
  const data = ctx.getImageData(0, 0, w, h).data 
  let t = h, b = 0, l = w, r = 0 
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { 
    const i = (y * w + x) * 4 
    if (data[i + 3] > 20) { if (y < t) t = y; if (y > b) b = y; if (x < l) l = x; if (x > r) r = x; } 
  } 
  const out = document.createElement('canvas'); out.width = Math.max(1, r - l + 12); out.height = Math.max(1, b - t + 12) 
  out.getContext('2d').drawImage(canvas, l - 6, t - 6, out.width, out.height, 0, 0, out.width, out.height) 
  return out 
}