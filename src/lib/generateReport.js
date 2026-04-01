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
  const logo = await loadLogoImage('/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png').catch(() => null)

  await inspectionPage(doc, logo, project, inspection, 1, 1)

  const dateStr = new Date(inspection.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const loc     = (inspection.door_location || 'Door').replace(/[/\\?%*:|"<>]/g, '')
  doc.save(`${loc} - ${dateStr}.pdf`)
}

// ─── Entry point (Project Report) ─────────────────────────────────────────────
export async function generateProjectReport(project, inspections) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo       = await loadLogoImage('/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png').catch(() => null)
  const clientLogo = project.client_logo
    ? await loadLogoImage(`/${project.client_logo}`).catch(() => null)
    : null

  let pageNum = 1
  const totalPages = () => pageNum  // resolved later — we'll do a two-pass count

  // Cover + overflowed summary pages
  const summaryPages = await coverPage(doc, logo, clientLogo, project, inspections, pageNum)
  pageNum += summaryPages

  // Inspection detail pages
  const totalInspectionPages = inspections.length
  const grandTotal = summaryPages + totalInspectionPages

  for (let i = 0; i < inspections.length; i++) {
    doc.addPage()
    await inspectionPage(doc, logo, project, inspections[i], summaryPages + i + 1, grandTotal)
  }

  // Filename
  const parts = [project.client_name, project.name, project.postcode || project.address]
    .filter(Boolean).map(s => s.trim())
  const filename = parts.join(' - ').replace(/[/\\?%*:|"<>]/g, '') + '.pdf'
  doc.save(filename)
}

// ─── Full History Report (NEW) ────────────────────────────────────────────────
/**
 * Combines all existing individual reports for a specific door into one PDF.
 */
export async function generateFullHistoryReport(assetId, inspections) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogoImage('/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png').catch(() => null)
  
  // Sort latest first
  const sorted = [...inspections].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  
  // Use the project context from the most recent inspection
  const project = sorted[0].projects || { name: 'Door History', client_name: '' }
  const totalPages = sorted.length

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) doc.addPage()
    
    // Reuse your exact same inspectionPage logic
    await inspectionPage(doc, logo, project, sorted[i], i + 1, totalPages)
  }

  doc.save(`History_${assetId}.pdf`)
}

// ─── Page header (shared) ─────────────────────────────────────────────────────
function drawPageHeader(doc, logo, rightTitle, rightSub, showLogo = true) {
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, W, 24, 'F')

  if (showLogo) {
    if (logo) {
      const h = 16
      const w = (logo.width / logo.height) * h
      doc.addImage(logo.dataUrl, 'PNG', ML, 4, w, h)
    } else {
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...NAVY)
      doc.text('TF JONES', ML, 14)
    }
  }

  if (rightTitle) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...SLATE)
    doc.text(rightTitle, W - MR, 11, { align: 'right' })
  }
  if (rightSub) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(rightSub, W - MR, 19, { align: 'right' })
  }
  return 25.5
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function drawFooter(doc, pageNum, totalPages) {
  doc.setFillColor(...NAVY)
  doc.rect(0, H - 12, W, 12, 'F')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(130, 155, 175)
  doc.text('TF Jones  ·  Fire Door Inspection  ·  Confidential', ML, H - 4.5)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(`Page ${pageNum} of ${totalPages}`, W - MR, H - 4.5, { align: 'right' })
}

// ─── Summary table helpers ─────────────────────────────────────────────────────
const SUM_ROW_H  = 7
const SUM_HEAD_H = 8

function drawSummaryHeader(doc, y) {
  doc.setFillColor(...NAVY)
  doc.rect(ML, y, CW, SUM_HEAD_H, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  const c1 = ML + 3
  const c2 = ML + CW * 0.53
  const c3 = ML + CW - 3
  doc.text('DOOR LOCATION', c1, y + 5.5)
  doc.text('FIRE RATING',   c2, y + 5.5)
  doc.text('RESULT',        c3, y + 5.5, { align: 'right' })
  return y + SUM_HEAD_H
}

function drawSummaryRow(doc, ins, y, rowIndex) {
  const isPassed = ins.inspection_passed === 'Pass'
  doc.setFillColor(...(rowIndex % 2 === 0 ? WHITE : LGREY))
  doc.rect(ML, y, CW, SUM_ROW_H, 'F')

  const c1 = ML + 3
  const c2 = ML + CW * 0.53
  const c3 = ML + CW - 3

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DARK)
  const loc = doc.splitTextToSize(ins.door_location || '—', CW * 0.5)[0]
  doc.text(loc, c1, y + 5)
  doc.text(ins.fire_rating || '—', c2, y + 5)

  const bw = 16
  const bx = c3 - bw
  doc.setFillColor(...(isPassed ? GREEN : RED))
  doc.roundedRect(bx, y + 1, bw, 5, 1.5, 1.5, 'F')
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(ins.inspection_passed || '—', bx + bw / 2, y + 5, { align: 'center' })
}

// ─── Cover page ───────────────────────────────────────────────────────────────
async function coverPage(doc, logo, clientLogo, project, inspections) {
  const passed   = inspections.filter(i => i.inspection_passed === 'Pass').length
  const failed   = inspections.filter(i => i.inspection_passed === 'Fail').length
  const total    = inspections.length
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
  const dateStr  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

  const FOOTER_CLEAR = 14
  const AVAIL_COVER  = H - FOOTER_CLEAR
  const STATIC_BOTTOM = 185
  const rowsOnCover   = Math.max(0, Math.floor((AVAIL_COVER - STATIC_BOTTOM) / SUM_ROW_H))
  const overflow      = Math.max(0, total - rowsOnCover)
  const overflowPages = overflow > 0 ? Math.ceil(overflow / Math.floor((AVAIL_COVER - 38) / SUM_ROW_H)) : 0
  const grandTotal    = 1 + overflowPages + inspections.length

  doc.setFillColor(...WHITE)
  doc.rect(0, 0, W, H, 'F')

  drawPageHeader(doc, logo, 'FIRE DOOR INSPECTION REPORT', dateStr)

  let y = 34
  const LOGO_BOX_W = 55
  const LOGO_BOX_H = 22
  const logoBoxX   = W - MR - LOGO_BOX_W
  const ry = y + 10

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...SLATE)
  doc.text('PREPARED FOR', logoBoxX, ry)

  if (clientLogo) {
    const ratio   = clientLogo.width / clientLogo.height
    const MAX_W   = 55
    const targetH = ratio < 1.5 ? 52 : 22
    let dh = targetH
    let dw = dh * ratio
    if (dw > MAX_W) { dw = MAX_W; dh = dw / ratio }
    const yOffset = ratio < 1.5 ? 3 : 5
    doc.addImage(clientLogo.dataUrl, 'PNG', logoBoxX, ry + yOffset, dw, dh)
  }

  const leftW = logoBoxX - ML - 8
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  const nameLines = doc.splitTextToSize(project.name || 'Untitled Project', leftW)
  doc.text(nameLines, ML, y + 10)

  let nameBottom = y + 10 + nameLines.length * 9

  if (project.address) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...SLATE)
    doc.text(project.address, ML, nameBottom + 3)
    nameBottom += 6
  }
  if (project.postcode) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DARK)
    doc.text(project.postcode, ML, nameBottom + 3)
    nameBottom += 6
  }

  y = Math.max(nameBottom + 6, y + 57)
  y += 4

  const statW = (CW - 9) / 4
  const stats = [
    { label: 'Total Doors', value: total,          color: NAVY  },
    { label: 'Passed',      value: passed,         color: GREEN },
    { label: 'Failed',      value: failed,         color: RED   },
    { label: 'Pass Rate',   value: `${passRate}%`, color: NAVY  },
  ]
  stats.forEach((s, i) => {
    const bx = ML + i * (statW + 3)
    doc.setFillColor(...LGREY)
    doc.roundedRect(bx, y, statW, 17, 1.5, 1.5, 'F')
    doc.setFillColor(...s.color)
    doc.roundedRect(bx, y, statW, 2.5, 1.5, 1.5, 'F')
    doc.rect(bx, y + 1.2, statW, 1.3, 'F')
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...s.color)
    doc.text(String(s.value), bx + statW / 2, y + 10.5, { align: 'center' })
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...SLATE)
    doc.text(s.label.toUpperCase(), bx + statW / 2, y + 14.5, { align: 'center' })
  })
  y += 22

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  doc.text('Project Information', ML, y)
  y += 4
  doc.setFillColor(...MGREY)
  doc.rect(ML, y, CW, 0.4, 'F')
  y += 0.4

  const infoRows = [
    ['Client',               project.client_name   || '—'],
    ['Fire Door Inspector',  project.engineer_name || '—'],
    ['Address',              [project.address, project.postcode].filter(Boolean).join(', ') || '—'],
    ['Report Date',          dateStr],
    ['Total Inspections',    String(total)],
  ]
  infoRows.forEach(([label, value], i) => {
    const rowH = 8.5
    const ry = y + i * rowH
    doc.setFillColor(...(i % 2 === 0 ? LGREY : WHITE))
    doc.rect(ML, ry, CW, rowH, 'F')
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE)
    doc.text(label, ML + 3, ry + 5.8)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK)
    const val = doc.splitTextToSize(value, CW * 0.55)[0]
    doc.text(val, ML + CW - 3, ry + 5.8, { align: 'right' })
  })
  y += infoRows.length * 8.5
  doc.setFillColor(...MGREY); doc.rect(ML, y, CW, 0.4, 'F')
  y += 8

  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  doc.text('Inspection Summary', ML, y); y += 4

  let rowIndex = 0; let currentPage = 1
  y = drawSummaryHeader(doc, y)

  for (let i = 0; i < inspections.length; i++) {
    if (y + SUM_ROW_H > H - FOOTER_CLEAR - 2) {
      drawFooter(doc, currentPage, grandTotal)
      doc.addPage(); currentPage++
      doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F')
      drawPageHeader(doc, logo, `${project.name}`, 'INSPECTION SUMMARY (CONTINUED)')
      y = 34; doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
      doc.text('Inspection Summary (continued)', ML, y); y += 4
      y = drawSummaryHeader(doc, y)
    }
    drawSummaryRow(doc, inspections[i], y, rowIndex)
    y += SUM_ROW_H; rowIndex++
  }
  doc.setFillColor(...MGREY); doc.rect(ML, y, CW, 0.4, 'F')
  drawFooter(doc, currentPage, grandTotal)
  return currentPage
}

// ─── Inspection page (shared logic) ──────────────────────────────────────────
async function inspectionPage(doc, logo, project, ins, pageNum, totalPages) {
  const passed    = ins.inspection_passed === 'Pass'
  const passColor = passed ? GREEN : RED
  const passLabel = passed ? 'PASS' : 'FAIL'

  doc.setFillColor(...WHITE)
  doc.rect(0, 0, W, H, 'F')

  drawPageHeader(doc, logo, project.name, project.client_name || '', false)

  const headY = 30
  const headH = 20
  doc.setFillColor(...LGREY); doc.rect(ML, headY, CW, headH, 'F')
  doc.setFillColor(...passColor); doc.rect(ML, headY, 3.5, headH, 'F')

  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  const locLines = doc.splitTextToSize(ins.door_location || 'Unknown Location', CW - 52)
  doc.text(locLines, ML + 7, headY + 9)

  const badgeW = 24; const badgeX = ML + CW - badgeW
  doc.setFillColor(...passColor); doc.roundedRect(badgeX, headY + 3.5, badgeW, 11, 2, 2, 'F')
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text(passLabel, badgeX + badgeW / 2, headY + 11, { align: 'center' })

  const meta = [
    ins.door_asset_id && `Asset ID: ${ins.door_asset_id}`,
    ins.fire_rating,
    new Date(ins.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    ins.engineer_name && `Inspector: ${ins.engineer_name}`,
  ].filter(Boolean).join('   ·   ')
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
  doc.text(meta, ML + 7, headY + headH - 4)

  const sections = [
    {
      title: 'Door Details',
      fields: [
        ['What type of survey was carried out?',    ins.survey_type],
        ['What is the doorset assembly type?',      ins.doorset_assembly_type],
        ['What is the door configuration?',         ins.doorset_configuration],
        ['What is the fire rating of the door?',    ins.fire_rating],
        ['How is the fire door identified?',        ins.fire_door_id_type],
        ['What are the leaf sizes (mm)?',           ins.leaf_sizes_mm],
        ['What additional add-ons are present?',    ins.additional_addons],
        ['Is fire stopping acceptable?',            ins.fire_stopping_acceptable],
      ]
    },
    {
      title: 'Condition & Gaps',
      fields: [
        ['Is glazing free from damage?',                ins.glazing_free_from_damage],
        ['Is the surrounding structure intact?',        ins.surrounding_structure_intact],
        ['What is the condition of the door/frame?',    ins.condition_door_leaf_frame],
        ['Are gaps within the 3mm tolerance?',          ins.gap_3mm_tolerance],
        ['What is the gap on the hinge side?',          ins.gap_hinge_side],
        ['What is the gap on the lock side?',           ins.gap_lock_side],
        ['What is the gap at the head?',                ins.gap_head],
        ['What is the threshold gap (mm)?',             ins.gap_threshold_mm],
        ['Is the threshold gap within tolerance?',      ins.threshold_gap_within_tolerance],
        ['Is the leaf flush to the rebates?',           ins.leaf_flush_to_rebates],
      ]
    },
    {
      title: 'Hardware & Certification',
      fields: [
        ['Is a self-closing device fitted and working?', ins.self_closing_device],
        ['Are the hinges in acceptable condition?',      ins.hinges_condition_acceptable],
        ['Is all essential hardware acceptable?',        ins.essential_hardware_acceptable],
        ['Is correct fire door signage present?',        ins.correct_signage_present],
        ['Are intumescent seals in acceptable condition?', ins.intumescent_seals_acceptable],
      ]
    },
    {
      title: 'Outcome & Actions',
      fields: [
        ['What is the recommended action?',              ins.recommended_action],
        ['Have remedial works been completed?',          ins.remedial_works_completed],
        ['What repair actions are recommended?',         ins.recommended_repair_actions],
        ['What is the reason for replacement?',          ins.replacement_reason],
      ]
    },
  ]

  const GAP = 4; const colW = (CW - GAP) / 2
  const ROW_H = 6; const SEC_H = 6.5; const FOOTER_CLEAR = 17
  const PHOTO_BLOCK = 44; const maxFieldY = H - FOOTER_CLEAR - PHOTO_BLOCK - 4
  let leftY = headY + headH + 5; let rightY = headY + headH + 5

  sections.forEach(section => {
    const active = section.fields.filter(([, v]) => v)
    if (active.length === 0) return
    const sh = SEC_H + active.reduce((sum, [label]) => {
      const lines = Math.ceil(label.length / 38)
      return sum + Math.max(ROW_H, lines * 4.5 + 2.5)
    }, 0) + 3

    let startX, col
    if (leftY <= rightY && leftY + sh <= maxFieldY) { col = 'left'; startX = ML }
    else if (rightY + sh <= maxFieldY) { col = 'right'; startX = ML + colW + GAP }
    else { col = leftY <= rightY ? 'left' : 'right'; startX = col === 'left' ? ML : ML + colW + GAP }
    let cy = col === 'left' ? leftY : rightY

    doc.setFillColor(...NAVY); doc.rect(startX, cy, colW, SEC_H, 'F')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...YELLOW)
    doc.text(section.title.toUpperCase(), startX + 2.5, cy + 4.5); cy += SEC_H

    active.forEach(([label, value], i) => {
      const labelLines = doc.splitTextToSize(label, colW * 0.60)
      const rh = Math.max(ROW_H, labelLines.length * 4.5 + 2.5)
      doc.setFillColor(...(i % 2 === 0 ? LGREY : WHITE)); doc.rect(startX, cy, colW, rh, 'F')
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
      doc.text(labelLines, startX + 2.5, cy + 4)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK)
      const val = doc.splitTextToSize(String(value), colW * 0.36)[0]
      doc.text(val, startX + colW - 2.5, cy + 4, { align: 'right' })
      cy += rh
    })
    if (col === 'left') leftY = cy + 3; else rightY = cy + 3
  })

  const photos = [
    ['Outside', ins.photo_outside_url], ['Inside', ins.photo_inside_url],
    ['Photo 1', ins.photo1_url], ['Photo 2', ins.photo2_url],
    ['Photo 3', ins.photo3_url], ['Photo 4', ins.photo4_url],
    ['Photo 5', ins.photo5_url], ['Photo 6', ins.photo6_url],
  ].filter(([, u]) => u)

  if (photos.length > 0) {
    const barY = Math.max(Math.max(leftY, rightY), H - FOOTER_CLEAR - 32 - 14)
    doc.setFillColor(...LGREY); doc.rect(ML, barY, CW, 7, 'F')
    doc.setFillColor(...NAVY); doc.rect(ML, barY, 3, 7, 'F')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
    doc.text('INSPECTION PHOTOGRAPHS', ML + 5.5, barY + 4.8)
    const PW = (CW - (3 * 4)) / 5
    for (let i = 0; i < Math.min(photos.length, 5); i++) {
      try {
        const img = await loadImage(photos[i][1])
        doc.addImage(img, 'JPEG', ML + i * (PW + 3), barY + 9, PW, 32)
      } catch (_) {}
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
      resolve(canvas.toDataURL('image/jpeg', 0.85))
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
      const trimmed = trimWhitespace(canvas)
      resolve({ dataUrl: trimmed.toDataURL('image/png'), width: trimmed.width, height: trimmed.height })
    }
    img.onerror = reject; img.src = url + (url.includes('?') ? '&' : '?') + `_=${Date.now()}`
  })
}

function trimWhitespace(canvas) {
  const ctx = canvas.getContext('2d'); const w = canvas.width; const h = canvas.height
  const data = ctx.getImageData(0, 0, w, h).data
  let top = h, bottom = 0, left = w, right = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; const a = data[i + 3]
      const r = data[i], g = data[i+1], b = data[i+2]
      if (a >= 15 && !(r > 238 && g > 238 && b > 238)) {
        if (y < top) top = y; if (y > bottom) bottom = y
        if (x < left) left = x; if (x > right) right = x
      }
    }
  }
  if (top > bottom || left > right) return canvas
  const pad = 6; const cx = Math.max(0, left - pad); const cy = Math.max(0, top - pad)
  const cw = Math.min(w, right - left + pad * 2 + 1); const ch = Math.min(h, bottom - top + pad * 2 + 1)
  const out = document.createElement('canvas'); out.width = cw; out.height = ch
  out.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch)
  return out
}