import jsPDF from 'jspdf'

// ─── Palette ──────────────────────────────────────────────────────────────────
const NAVY   = [13,  31,  53]
const YELLOW = [238, 255, 0]
const WHITE  = [255, 255, 255]
const LGREY  = [246, 248, 250]
const MGREY  = [210, 217, 226]
const SLATE  = [95,  112, 130]
const DARK   = [28,  38,  52]
const GREEN  = [22,  101, 52]
const LGREEN = [220, 252, 231]
const RED    = [153, 27,  27]
const LRED   = [254, 226, 226]

const W  = 210
const H  = 297
const ML = 16
const MR = 16
const CW = W - ML - MR   // 178mm

// ─── Single inspection report ─────────────────────────────────────────────────
export async function generateSingleInspectionReport(project, inspection) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogoImage('/tfj_logo.png').catch(() => null)

  await inspectionPage(doc, logo, project, inspection, 1, 1)

  const dateStr = new Date(inspection.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const loc     = (inspection.door_location || 'Door').replace(/[/\\?%*:|"<>]/g, '')
  doc.save(`${loc} - ${dateStr}.pdf`)
}

// ─── Entry point (Project Report) ─────────────────────────────────────────────
export async function generateProjectReport(project, inspections) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo       = await loadLogoImage('/tfj_logo.png').catch(() => null)
  const clientLogo = project.client_logo
    ? await loadLogoImage(`/${project.client_logo}`).catch(() => null)
    : null

  let pageNum = 1
  const summaryPages = await coverPage(doc, logo, clientLogo, project, inspections, pageNum)
  pageNum += summaryPages

  const totalInspectionPages = inspections.length
  const grandTotal = summaryPages + totalInspectionPages

  for (let i = 0; i < inspections.length; i++) {
    doc.addPage()
    await inspectionPage(doc, logo, project, inspections[i], summaryPages + i + 1, grandTotal)
  }

  const parts = [project.client_name, project.name, project.postcode || project.address]
    .filter(Boolean).map(s => s.trim())
  const filename = parts.join(' - ').replace(/[/\\?%*:|"<>]/g, '') + '.pdf'
  doc.save(filename)
}

// ─── Full History Report (NEW - Added for Door History Page) ──────────────────
export async function generateFullHistoryReport(assetId, inspections) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogoImage('/tfj_logo.png').catch(() => null)
  
  // Sort latest first
  const sorted = [...inspections].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const project = sorted[0].projects || {}
  const totalPages = sorted.length + 1

  // Page 1: History Summary
  drawPageHeader(doc, logo, 'DOOR ASSET HISTORY', assetId)
  
  let y = 35
  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  doc.text(`Asset History: ${assetId}`, ML, y)
  
  y += 10
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
  doc.text(`${sorted[0].door_location || 'Location Not Specified'}`, ML, y)
  
  y += 15
  // Draw summary info
  doc.setFillColor(...LGREY); doc.roundedRect(ML, y, CW, 20, 2, 2, 'F')
  doc.setFontSize(7); doc.setTextColor(...SLATE)
  doc.text('TOTAL INSPECTIONS', ML + 5, y + 7)
  doc.text('CURRENT STATUS', ML + 60, y + 7)
  doc.text('FIRE RATING', ML + 110, y + 7)
  
  doc.setFontSize(11); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold')
  doc.text(String(sorted.length), ML + 5, y + 14)
  const isPass = sorted[0].inspection_passed === 'Pass'
  doc.setTextColor(...(isPass ? GREEN : RED)).text(sorted[0].inspection_passed.toUpperCase(), ML + 60, y + 14)
  doc.setTextColor(...NAVY).text(sorted[0].fire_rating || 'N/A', ML + 110, y + 14)

  y += 30
  doc.setFontSize(9); doc.text('Chronological Inspection Log', ML, y)
  y += 4
  y = drawSummaryHeader(doc, y)
  
  sorted.forEach((ins, i) => {
    drawSummaryRow(doc, ins, y, i)
    y += 7
  })

  drawFooter(doc, 1, totalPages)

  // Sub-pages: Detail for each inspection
  for (let i = 0; i < sorted.length; i++) {
    doc.addPage()
    await inspectionPage(doc, logo, project, sorted[i], i + 2, totalPages)
  }

  doc.save(`History - ${assetId}.pdf`)
}

// ─── Page header (shared) ─────────────────────────────────────────────────────
function drawPageHeader(doc, logo, rightTitle, rightSub, showLogo = true) {
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, W, 24, 'F')

  if (showLogo && logo) {
    const h = 16
    const w = (logo.width / logo.height) * h
    doc.addImage(logo.dataUrl, 'PNG', ML, 4, w, h)
  }

  if (rightTitle) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
    doc.text(rightTitle, W - MR, 11, { align: 'right' })
  }
  if (rightSub) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK)
    doc.text(rightSub, W - MR, 19, { align: 'right' })
  }
  return 25.5
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function drawFooter(doc, pageNum, totalPages) {
  doc.setFillColor(...NAVY)
  doc.rect(0, H - 12, W, 12, 'F')
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 155, 175)
  doc.text('TF Jones  ·  Fire Door Inspection  ·  Confidential', ML, H - 4.5)
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text(`Page ${pageNum} of ${totalPages}`, W - MR, H - 4.5, { align: 'right' })
}

// ─── Summary table helpers ─────────────────────────────────────────────────────
const SUM_ROW_H  = 7
const SUM_HEAD_H = 8

function drawSummaryHeader(doc, y) {
  doc.setFillColor(...NAVY)
  doc.rect(ML, y, CW, SUM_HEAD_H, 'F')
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  const c1 = ML + 3; const c2 = ML + CW * 0.53; const c3 = ML + CW - 3
  doc.text('DOOR LOCATION / DATE', c1, y + 5.5)
  doc.text('FIRE RATING',   c2, y + 5.5)
  doc.text('RESULT',        c3, y + 5.5, { align: 'right' })
  return y + SUM_HEAD_H
}

function drawSummaryRow(doc, ins, y, rowIndex) {
  const isPassed = ins.inspection_passed === 'Pass'
  doc.setFillColor(...(rowIndex % 2 === 0 ? WHITE : LGREY))
  doc.rect(ML, y, CW, SUM_ROW_H, 'F')
  const c1 = ML + 3; const c2 = ML + CW * 0.53; const c3 = ML + CW - 3
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK)
  
  // If date exists, show it (useful for history report)
  const dateStr = ins.created_at ? new Date(ins.created_at).toLocaleDateString('en-GB') : ''
  const loc = doc.splitTextToSize(`${ins.door_location || '—'} ${dateStr ? '('+dateStr+')' : ''}`, CW * 0.5)[0]
  
  doc.text(loc, c1, y + 5)
  doc.text(ins.fire_rating || '—', c2, y + 5)
  const bw = 16; const bx = c3 - bw
  doc.setFillColor(...(isPassed ? GREEN : RED))
  doc.roundedRect(bx, y + 1, bw, 5, 1.5, 1.5, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text(ins.inspection_passed || '—', bx + bw / 2, y + 5, { align: 'center' })
}

// ─── Cover page (for project reports) ─────────────────────────────────────────
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
  const LOGO_BOX_W = 55; const LOGO_BOX_H = 22; const logoBoxX = W - MR - LOGO_BOX_W
  const ry = y + 10
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
  doc.text('PREPARED FOR', logoBoxX, ry)

  if (clientLogo) {
    const ratio = clientLogo.width / clientLogo.height
    const MAX_W = 55; const targetH = ratio < 1.5 ? 52 : 22
    let dh = targetH; let dw = dh * ratio
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

  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text('Project Information', ML, y)
  y += 4.4
  const infoRows = [['Client', project.client_name || '—'], ['Fire Door Inspector', project.engineer_name || '—'], ['Report Date', dateStr]]
  infoRows.forEach(([label, value], i) => {
    const rowH = 8.5; const ry = y + i * rowH
    doc.setFillColor(...(i % 2 === 0 ? LGREY : WHITE)); doc.rect(ML, ry, CW, rowH, 'F')
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE); doc.text(label, ML + 3, ry + 5.8)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK); doc.text(String(value), ML + CW - 3, ry + 5.8, { align: 'right' })
  })
  y += infoRows.length * 8.5 + 8

  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text('Inspection Summary', ML, y)
  y += 4
  y = drawSummaryHeader(doc, y)

  for (let i = 0; i < inspections.length; i++) {
    if (y + SUM_ROW_H > H - FOOTER_CLEAR - 2) {
      drawFooter(doc, 1, grandTotal); doc.addPage()
      drawPageHeader(doc, logo, project.name, 'SUMMARY CONT.')
      y = 34; y = drawSummaryHeader(doc, y)
    }
    drawSummaryRow(doc, inspections[i], y, i)
    y += SUM_ROW_H
  }
  drawFooter(doc, 1, grandTotal)
  return 1 + overflowPages
}

// ─── Inspection detail page ───────────────────────────────────────────────────
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
  doc.text(doc.splitTextToSize(ins.door_location || 'Unknown Location', CW - 52), ML + 7, headY + 9)

  const badgeW = 24; const badgeX = ML + CW - badgeW
  doc.setFillColor(...passColor); doc.roundedRect(badgeX, headY + 3.5, badgeW, 11, 2, 2, 'F')
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text(passLabel, badgeX + badgeW / 2, headY + 11, { align: 'center' })

  const meta = [ins.door_asset_id && `Asset ID: ${ins.door_asset_id}`, ins.fire_rating, new Date(ins.created_at).toLocaleDateString('en-GB')].filter(Boolean).join('   ·   ')
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE); doc.text(meta, ML + 7, headY + headH - 4)

  const sections = [
    { title: 'Details', fields: [['Survey Type', ins.survey_type], ['Assembly', ins.doorset_assembly_type], ['Rating', ins.fire_rating], ['ID Type', ins.fire_door_id_type]] },
    { title: 'Condition', fields: [['Structure', ins.surrounding_structure_intact], ['Gaps OK', ins.gap_3mm_tolerance], ['Hinge Gap', ins.gap_hinge_side], ['Head Gap', ins.gap_head]] },
    { title: 'Hardware', fields: [['Self Closing', ins.self_closing_device], ['Hinges', ins.hinges_condition_acceptable], ['Seals', ins.intumescent_seals_acceptable]] },
    { title: 'Outcome', fields: [['Action', ins.recommended_action], ['Repair', ins.recommended_repair_actions]] }
  ]

  const GAP = 4; const colW = (CW - GAP) / 2; let leftY = headY + headH + 5; let rightY = headY + headH + 5
  const PHOTO_BLOCK = 44; const FOOTER_CLEAR = 17; const maxFieldY = H - FOOTER_CLEAR - PHOTO_BLOCK

  for (const section of sections) {
    const active = section.fields.filter(([, v]) => v)
    if (active.length === 0) continue
    let col = leftY <= rightY ? 'left' : 'right'
    let startX = col === 'left' ? ML : ML + colW + GAP
    let cy = col === 'left' ? leftY : rightY
    
    doc.setFillColor(...NAVY); doc.rect(startX, cy, colW, 6.5, 'F')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...YELLOW)
    doc.text(section.title.toUpperCase(), startX + 2.5, cy + 4.5); cy += 6.5

    active.forEach(([label, value], i) => {
      doc.setFillColor(...(i % 2 === 0 ? LGREY : WHITE)); doc.rect(startX, cy, colW, 6, 'F')
      doc.setFontSize(6.5); doc.setTextColor(...SLATE); doc.setFont('helvetica', 'normal'); doc.text(label, startX + 2.5, cy + 4)
      doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold'); doc.text(String(value), startX + colW - 2.5, cy + 4, { align: 'right' })
      cy += 6
    })
    if (col === 'left') leftY = cy + 3; else rightY = cy + 3
  }

  const photos = [['Outside', ins.photo_outside_url], ['Inside', ins.photo_inside_url], ['Photo 1', ins.photo1_url], ['Photo 2', ins.photo2_url], ['Photo 3', ins.photo3_url]].filter(([, u]) => u)
  if (photos.length > 0) {
    const barY = H - FOOTER_CLEAR - PHOTO_BLOCK; const phY = barY + 8; const PW = (CW - 12) / 5
    doc.setFillColor(...LGREY); doc.rect(ML, barY, CW, 6, 'F')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text('PHOTOS', ML + 3, barY + 4)
    for (let i = 0; i < photos.length; i++) {
      const img = await loadImage(photos[i][1]).catch(() => null)
      if (img) doc.addImage(img, 'JPEG', ML + i * (PW + 3), phY, PW, 30)
    }
  }
  drawFooter(doc, pageNum, totalPages)
}

// ─── Image loaders ────────────────────────────────────────────────────────────
async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = reject; img.src = url + (url.includes('?') ? '&' : '?') + `_=${Date.now()}`
  })
}

async function loadLogoImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.width, height: img.height })
    }
    img.onerror = reject; img.src = url
  })
}

function trimWhitespace(canvas) { return canvas }