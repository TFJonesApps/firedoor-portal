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

// ─── Full History Report (Updated with Front Sheet) ──────────────────────────
export async function generateFullHistoryReport(assetId, inspections) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogoImage('/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png').catch(() => null)
  
  const sorted = [...inspections].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const latest = sorted[0]
  const project = latest.projects || { name: 'Asset History Log', client_name: '' }
  
  // Total pages = 1 (Front Sheet) + number of inspections
  const grandTotal = sorted.length + 1

  // 1. Draw the Front Sheet
  await historyCoverPage(doc, logo, project, latest, assetId, 1, grandTotal)

  // 2. Add the inspection pages
  for (let i = 0; i < sorted.length; i++) {
    doc.addPage()
    await inspectionPage(doc, logo, project, sorted[i], i + 2, grandTotal)
  }

  doc.save(`History_${assetId}.pdf`)
}

// ─── History Front Sheet Logic ────────────────────────────────────────────────
async function historyCoverPage(doc, logo, project, latest, assetId, pageNum, totalPages) {
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  
  doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F')
  drawPageHeader(doc, logo, 'DOOR ASSET HISTORY LOG', dateStr)

  let y = 50
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
  doc.text('ASSET IDENTIFICATION', ML, y)
  
  y += 12
  doc.setFontSize(28); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  doc.text(assetId || 'N/A', ML, y)

  y += 10
  doc.setFontSize(14); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
  doc.text(latest.door_location || 'Location Not Specified', ML, y)

  // Compliance Status & Rating Cards
  y += 25
  const cardW = (CW - 5) / 2
  
  // Status Card
  doc.setFillColor(...LGREY); doc.roundedRect(ML, y, cardW, 25, 2, 2, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE)
  doc.text('CURRENT COMPLIANCE STATUS', ML + 5, y + 8)
  const isPass = latest.inspection_passed === 'Pass'
  doc.setFontSize(16); doc.setTextColor(...(isPass ? GREEN : RED))
  doc.text(latest.inspection_passed?.toUpperCase() || 'UNKNOWN', ML + 5, y + 18)

  // Fire Rating Card
  doc.setFillColor(...LGREY); doc.roundedRect(ML + cardW + 5, y, cardW, 25, 2, 2, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE)
  doc.text('ESTABLISHED FIRE RATING', ML + cardW + 10, y + 8)
  doc.setFontSize(16); doc.setTextColor(...NAVY)
  doc.text(latest.fire_rating || 'N/A', ML + cardW + 10, y + 18)

  // Detail Table
  y += 45
  doc.setFillColor(...NAVY); doc.rect(ML, y, 10, 1, 'F')
  y += 8
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  doc.text('REPORT DETAILS', ML, y)
  
  y += 8
  const details = [
    ['Client:', project.client_name || 'N/A'],
    ['Site Name:', project.name || 'N/A'],
    ['Total Records:', `${totalPages - 1} Inspections`],
    ['Latest Inspection:', new Date(latest.created_at).toLocaleDateString('en-GB')],
    ['Lead Engineer:', latest.engineer_name || 'N/A']
  ]

  details.forEach(([label, value], i) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE)
    doc.text(label, ML, y + (i * 8))
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK)
    doc.text(String(value), ML + 40, y + (i * 8))
  })

  drawFooter(doc, pageNum, totalPages)
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
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
      doc.text('TF JONES', ML, 14)
    }
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
  doc.setFillColor(...NAVY); doc.rect(0, H - 12, W, 12, 'F')
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 155, 175)
  doc.text('TF Jones  ·  Fire Door Inspection  ·  Confidential', ML, H - 4.5)
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text(`Page ${pageNum} of ${totalPages}`, W - MR, H - 4.5, { align: 'right' })
}

// ─── Summary table helpers ─────────────────────────────────────────────────────
const SUM_ROW_H  = 7
const SUM_HEAD_H = 8

function drawSummaryHeader(doc, y) {
  doc.setFillColor(...NAVY); doc.rect(ML, y, CW, SUM_HEAD_H, 'F')
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text('DOOR LOCATION', ML + 3, y + 5.5)
  doc.text('FIRE RATING',   ML + CW * 0.53, y + 5.5)
  doc.text('RESULT',        ML + CW - 3, y + 5.5, { align: 'right' })
  return y + SUM_HEAD_H
}

function drawSummaryRow(doc, ins, y, rowIndex) {
  const isPassed = ins.inspection_passed === 'Pass'
  doc.setFillColor(...(rowIndex % 2 === 0 ? WHITE : LGREY))
  doc.rect(ML, y, CW, SUM_ROW_H, 'F')
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK)
  doc.text(doc.splitTextToSize(ins.door_location || '—', CW * 0.5)[0], ML + 3, y + 5)
  doc.text(ins.fire_rating || '—', ML + CW * 0.53, y + 5)
  const bw = 16; const bx = ML + CW - 3 - bw
  doc.setFillColor(...(isPassed ? GREEN : RED))
  doc.roundedRect(bx, y + 1, bw, 5, 1.5, 1.5, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text(ins.inspection_passed || '—', bx + bw / 2, y + 5, { align: 'center' })
}

// ─── Cover page (Project Report) ──────────────────────────────────────────────
async function coverPage(doc, logo, clientLogo, project, inspections) {
  const passed   = inspections.filter(i => i.inspection_passed === 'Pass').length
  const failed   = inspections.filter(i => i.inspection_passed === 'Fail').length
  const total    = inspections.length
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
  const dateStr  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

  const FOOTER_CLEAR = 14
  const STATIC_BOTTOM = 185
  const rowsOnCover   = Math.max(0, Math.floor((H - FOOTER_CLEAR - STATIC_BOTTOM) / SUM_ROW_H))
  const overflow      = Math.max(0, total - rowsOnCover)
  const overflowPages = overflow > 0 ? Math.ceil(overflow / Math.floor((H - FOOTER_CLEAR - 38) / SUM_ROW_H)) : 0
  const grandTotal    = 1 + overflowPages + inspections.length

  doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F')
  drawPageHeader(doc, logo, 'FIRE DOOR INSPECTION REPORT', dateStr)

  let y = 34
  const logoBoxX = W - MR - 55
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
  doc.text('PREPARED FOR', logoBoxX, y + 10)

  if (clientLogo) {
    const ratio = clientLogo.width / clientLogo.height
    let dw = 55, dh = dw / ratio
    if (dh > 22) { dh = 22; dw = dh * ratio }
    doc.addImage(clientLogo.dataUrl, 'PNG', logoBoxX, y + 15, dw, dh)
  }

  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  const nameLines = doc.splitTextToSize(project.name || 'Untitled Project', logoBoxX - ML - 8)
  doc.text(nameLines, ML, y + 10)
  let nameBottom = y + 10 + nameLines.length * 9
  if (project.address) {
    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
    doc.text(project.address, ML, nameBottom + 3); nameBottom += 6
  }
  
  y = Math.max(nameBottom + 6, y + 57)
  const statW = (CW - 9) / 4
  const stats = [
    { label: 'Total Doors', value: total, color: NAVY },
    { label: 'Passed', value: passed, color: GREEN },
    { label: 'Failed', value: failed, color: RED },
    { label: 'Pass Rate', value: `${passRate}%`, color: NAVY }
  ]
  stats.forEach((s, i) => {
    const bx = ML + i * (statW + 3)
    doc.setFillColor(...LGREY); doc.roundedRect(bx, y, statW, 17, 1.5, 1.5, 'F')
    doc.setFillColor(...s.color); doc.rect(bx, y, statW, 2.5, 'F')
    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(...s.color)
    doc.text(String(s.value), bx + statW/2, y + 10.5, {align:'center'})
    doc.setFontSize(6); doc.setTextColor(...SLATE); doc.text(s.label.toUpperCase(), bx+statW/2, y+14.5, {align:'center'})
  })

  y += 26; doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text('Project Information', ML, y)
  y += 4; doc.setFillColor(...MGREY); doc.rect(ML, y, CW, 0.4, 'F'); y += 0.4
  const info = [['Client', project.client_name], ['Inspector', project.engineer_name], ['Report Date', dateStr]]
  info.forEach(([l, v], i) => {
    const ry = y + i * 8.5; doc.setFillColor(...(i%2===0?LGREY:WHITE)); doc.rect(ML, ry, CW, 8.5, 'F')
    doc.setFontSize(7.5); doc.setTextColor(...SLATE); doc.text(l, ML+3, ry+5.8)
    doc.setTextColor(...DARK); doc.text(v||'—', ML+CW-3, ry+5.8, {align:'right'})
  })
  
  y += info.length * 8.5 + 8; doc.setFontSize(9); doc.text('Inspection Summary', ML, y); y += 4
  let currentPage = 1; y = drawSummaryHeader(doc, y)
  inspections.forEach((ins, i) => {
    if (y + SUM_ROW_H > H - FOOTER_CLEAR - 2) {
      drawFooter(doc, currentPage, grandTotal); doc.addPage(); currentPage++
      drawPageHeader(doc, logo, project.name, 'SUMMARY CONT.')
      y = 34; y = drawSummaryHeader(doc, y)
    }
    drawSummaryRow(doc, ins, y, i); y += SUM_ROW_H
  })
  drawFooter(doc, currentPage, grandTotal)
  return currentPage
}

// ─── Inspection Page Logic (Two Columns) ──────────────────────────────────────
async function inspectionPage(doc, logo, project, ins, pageNum, totalPages) {
  const passed = ins.inspection_passed === 'Pass'
  const passColor = passed ? GREEN : RED

  doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F')
  drawPageHeader(doc, logo, project.name, project.client_name || '', false)

  const headY = 30
  doc.setFillColor(...LGREY); doc.rect(ML, headY, CW, 20, 'F')
  doc.setFillColor(...passColor); doc.rect(ML, headY, 3.5, 20, 'F')
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  doc.text(doc.splitTextToSize(ins.door_location || 'Unknown', CW - 52), ML + 7, headY + 9)
  
  const badgeX = ML + CW - 24
  doc.setFillColor(...passColor); doc.roundedRect(badgeX, headY + 3.5, 24, 11, 2, 2, 'F')
  doc.setFontSize(10); doc.setTextColor(255, 255, 255); doc.text(passed?'PASS':'FAIL', badgeX + 12, headY + 11, {align:'center'})

  const meta = [`Asset ID: ${ins.door_asset_id || '—'}`, ins.fire_rating, new Date(ins.created_at).toLocaleDateString('en-GB')].join('  ·  ')
  doc.setFontSize(7); doc.setTextColor(...SLATE); doc.text(meta, ML + 7, headY + 16)

  const sections = [
    { title: 'Door Details', fields: [['Survey Type', ins.survey_type], ['Configuration', ins.doorset_configuration], ['Fire Rating', ins.fire_rating]] },
    { title: 'Condition & Gaps', fields: [['Structure Intact', ins.surrounding_structure_intact], ['Gap Tolerance', ins.gap_3mm_tolerance], ['Threshold Gap', ins.gap_threshold_mm]] },
    { title: 'Hardware', fields: [['Self Closer', ins.self_closing_device], ['Hinges', ins.hinges_condition_acceptable], ['Signage', ins.correct_signage_present]] }
  ]

  let leftY = headY + 25, rightY = headY + 25
  sections.forEach(sec => {
    let startX = leftY <= rightY ? ML : ML + (CW/2) + 2
    let cy = leftY <= rightY ? leftY : rightY
    doc.setFillColor(...NAVY); doc.rect(startX, cy, (CW/2)-2, 6.5, 'F')
    doc.setFontSize(6.5); doc.setTextColor(...YELLOW); doc.text(sec.title.toUpperCase(), startX + 2.5, cy + 4.5)
    cy += 6.5
    sec.fields.forEach(([l, v], i) => {
      doc.setFillColor(...(i%2===0?LGREY:WHITE)); doc.rect(startX, cy, (CW/2)-2, 6, 'F')
      doc.setTextColor(...SLATE); doc.text(l, startX + 2.5, cy + 4)
      doc.setTextColor(...DARK); doc.text(String(v||'—'), startX + (CW/2)-4.5, cy + 4, {align:'right'})
      cy += 6
    })
    if (leftY <= rightY) leftY = cy + 4; else rightY = cy + 4
  })

  const photos = [['Outside', ins.photo_outside_url], ['Inside', ins.photo_inside_url], ['Detail', ins.photo1_url]].filter(p => p[1])
  if (photos.length > 0) {
    const py = H - 60
    doc.setFillColor(...LGREY); doc.rect(ML, py, CW, 7, 'F')
    doc.setFontSize(6.5); doc.setTextColor(...NAVY); doc.text('INSPECTION PHOTOGRAPHS', ML+5, py+4.5)
    for (let i=0; i<Math.min(photos.length, 4); i++) {
      try {
        const img = await loadImage(photos[i][1])
        doc.addImage(img, 'JPEG', ML + i*45, py+10, 40, 30)
      } catch(e){}
    }
  }
  drawFooter(doc, pageNum, totalPages)
}

// ─── Image Helpers ────────────────────────────────────────────────────────────
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
      const trimmed = trimWhitespace(canvas)
      resolve({ dataUrl: trimmed.toDataURL('image/png'), width: trimmed.width, height: trimmed.height })
    }
    img.onerror = reject; img.src = url + (url.includes('?') ? '&' : '?') + `_=${Date.now()}`
  })
}

function trimWhitespace(canvas) {
  const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height
  const data = ctx.getImageData(0,0,w,h).data
  let t=h, b=0, l=w, r=0
  for(let y=0; y<h; y++) for(let x=0; x<w; x++) {
    const i = (y*w+x)*4
    if(data[i+3] > 20) { if(y<t) t=y; if(y>b) b=y; if(x<l) l=x; if(x>r) r=x; }
  }
  const out = document.createElement('canvas')
  out.width = Math.max(1, r-l+12); out.height = Math.max(1, b-t+12)
  out.getContext('2d').drawImage(canvas, l-6, t-6, out.width, out.height, 0, 0, out.width, out.height)
  return out
}