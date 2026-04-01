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

// ─── Full History Report (NEW) ────────────────────────────────────────────────
export async function generateFullHistoryReport(assetId, inspections) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogoImage('/tfj_logo.png').catch(() => null)
  
  // Sort inspections by date descending (latest first)
  const sorted = [...inspections].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const project = sorted[0].projects || {}
  const totalPages = sorted.length + 1 // +1 for the history cover

  // 1. Generate History Cover/Summary Page
  drawPageHeader(doc, logo, 'DOOR ASSET HISTORY', assetId)
  
  let y = 40
  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  doc.text(`Asset History: ${assetId}`, ML, y)
  
  y += 12
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
  doc.text(`${sorted[0].door_location || 'No Location Provided'}`, ML, y)
  
  y += 15
  // Quick Stats for this door
  const passCount = sorted.filter(i => i.inspection_passed === 'Pass').length
  const rate = Math.round((passCount / sorted.length) * 100)

  doc.setFillColor(...LGREY); doc.roundedRect(ML, y, CW, 25, 2, 2, 'F')
  
  doc.setFontSize(8); doc.setTextColor(...SLATE); doc.text('TOTAL INSPECTIONS', ML + 10, y + 10)
  doc.setFontSize(14); doc.setTextColor(...NAVY); doc.text(String(sorted.length), ML + 10, y + 18)

  doc.setFontSize(8); doc.setTextColor(...SLATE); doc.text('CURRENT STATUS', ML + 60, y + 10)
  const isLatestPass = sorted[0].inspection_passed === 'Pass'
  doc.setTextColor(...(isLatestPass ? GREEN : RED))
  doc.text(sorted[0].inspection_passed.toUpperCase(), ML + 60, y + 18)

  doc.setFontSize(8); doc.setTextColor(...SLATE); doc.text('LIFETIME PASS RATE', ML + 110, y + 10)
  doc.setTextColor(...NAVY); doc.text(`${rate}%`, ML + 110, y + 18)

  y += 35
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  doc.text('Chronological Inspection Log', ML, y)
  y += 6
  
  y = drawSummaryHeader(doc, y)
  sorted.forEach((ins, i) => {
    drawSummaryRow(doc, ins, y, i)
    y += 7
  })

  drawFooter(doc, 1, totalPages)

  // 2. Add full detailed pages for each inspection
  for (let i = 0; i < sorted.length; i++) {
    doc.addPage()
    await inspectionPage(doc, logo, project, sorted[i], i + 2, totalPages)
  }

  doc.save(`History - ${assetId}.pdf`)
}

// ─── Project Report ───────────────────────────────────────────────────────────
export async function generateProjectReport(project, inspections) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo       = await loadLogoImage('/tfj_logo.png').catch(() => null)
  const clientLogo = project.client_logo
    ? await loadLogoImage(`/${project.client_logo}`).catch(() => null)
    : null

  let pageNum = 1
  const summaryPages = await coverPage(doc, logo, clientLogo, project, inspections, pageNum)
  const grandTotal = summaryPages + inspections.length

  for (let i = 0; i < inspections.length; i++) {
    doc.addPage()
    await inspectionPage(doc, logo, project, inspections[i], summaryPages + i + 1, grandTotal)
  }

  const parts = [project.client_name, project.name, project.postcode || project.address]
    .filter(Boolean).map(s => s.trim())
  const filename = parts.join(' - ').replace(/[/\\?%*:|"<>]/g, '') + '.pdf'
  doc.save(filename)
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function drawPageHeader(doc, logo, rightTitle, rightSub, showLogo = true) {
  doc.setFillColor(...WHITE); doc.rect(0, 0, W, 24, 'F')
  if (showLogo && logo) {
    const h = 14; const w = (logo.width / logo.height) * h
    doc.addImage(logo.dataUrl, 'PNG', ML, 5, w, h)
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

function drawFooter(doc, pageNum, totalPages) {
  doc.setFillColor(...NAVY); doc.rect(0, H - 12, W, 12, 'F')
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(130, 155, 175)
  doc.text('TF Jones  ·  Fire Door Inspection History', ML, H - 4.5)
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text(`Page ${pageNum} of ${totalPages}`, W - MR, H - 4.5, { align: 'right' })
}

function drawSummaryHeader(doc, y) {
  doc.setFillColor(...NAVY); doc.rect(ML, y, CW, 8, 'F')
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text('DATE', ML + 3, y + 5.5)
  doc.text('PROJECT', ML + 45, y + 5.5)
  doc.text('RESULT', ML + CW - 3, y + 5.5, { align: 'right' })
  return y + 8
}

function drawSummaryRow(doc, ins, y, rowIndex) {
  const isPassed = ins.inspection_passed === 'Pass'
  doc.setFillColor(...(rowIndex % 2 === 0 ? WHITE : LGREY)); doc.rect(ML, y, CW, 7, 'F')
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK)
  
  const date = new Date(ins.created_at).toLocaleDateString('en-GB')
  doc.text(date, ML + 3, y + 5)
  doc.text(ins.projects?.name || '—', ML + 45, y + 5)

  const bw = 16; const bx = (ML + CW - 3) - bw
  doc.setFillColor(...(isPassed ? GREEN : RED)); doc.roundedRect(bx, y + 1, bw, 5, 1.5, 1.5, 'F')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text(ins.inspection_passed || '—', bx + bw / 2, y + 5, { align: 'center' })
}

// ─── Cover page (for project reports) ─────────────────────────────────────────
async function coverPage(doc, logo, clientLogo, project, inspections) {
  const total = inspections.length
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  drawPageHeader(doc, logo, 'FIRE DOOR INSPECTION REPORT', dateStr)
  
  // (Simplified cover logic for the sake of the paste, retaining your branding)
  doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  doc.text(project.name || 'Project Report', ML, 50)
  
  return 1 
}

// ─── Inspection Page (Used by Single and History) ─────────────────────────────
async function inspectionPage(doc, logo, project, ins, pageNum, totalPages) {
  const passed = ins.inspection_passed === 'Pass'
  const passColor = passed ? GREEN : RED

  drawPageHeader(doc, logo, project.name || 'History', ins.door_asset_id, false)

  // Door heading card
  doc.setFillColor(...LGREY); doc.rect(ML, 30, CW, 20, 'F')
  doc.setFillColor(...passColor); doc.rect(ML, 30, 3.5, 20, 'F')
  
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY)
  doc.text(ins.door_location || 'Unknown Location', ML + 7, 39)
  
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
  doc.text(`Asset ID: ${ins.door_asset_id}   ·   Rating: ${ins.fire_rating}   ·   Date: ${new Date(ins.created_at).toLocaleDateString('en-GB')}`, ML + 7, 46)

  // This section would continue with your detailed "Two-column field sections" and "Photos"
  // logic from your original snippet. I have abbreviated for the paste, 
  // but you should keep your existing sections/photo logic here.

  drawFooter(doc, pageNum, totalPages)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject; img.src = url
  })
}

async function loadLogoImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      const trimmed = trimWhitespace(canvas)
      resolve({ dataUrl: trimmed.toDataURL('image/png'), width: trimmed.width, height: trimmed.height })
    }
    img.onerror = reject; img.src = url
  })
}

function trimWhitespace(canvas) {
  return canvas // Simplified trim for paste
}