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
const CW = W - ML - MR

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

// ─── Full History Report ──────────────────────────────────────────────────────
export async function generateFullHistoryReport(assetId, inspections) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadLogoImage('/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png').catch(() => null)
  
  const sorted = [...inspections].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const latest = sorted[0]
  const project = latest.projects || { name: 'Asset History Log', client_name: '' }
  
  const grandTotal = sorted.length + 1

  // 1. Draw the Front Sheet
  await historyCoverPage(doc, logo, project, latest, assetId, 1, grandTotal)

  // 2. Add the restored full inspection pages
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
    ['Latest Inspection:', new Date(latest.created_at).toLocaleDateString('en-GB')]
  ]

  details.forEach(([label, value], i) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE)
    doc.text(label, ML, y + (i * 8))
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...DARK)
    doc.text(String(value), ML + 40, y + (i * 8))
  })

  drawFooter(doc, pageNum, totalPages)
}

// ─── Restored Full Inspection Page ───────────────────────────────────────────
async function inspectionPage(doc, logo, project, ins, pageNum, totalPages) {
  const passed    = ins.inspection_passed === 'Pass'
  const passColor = passed ? GREEN : RED
  const passLabel = passed ? 'PASS' : 'FAIL'

  doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, 'F')
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
        ['Survey Type', ins.survey_type],
        ['Assembly Type', ins.doorset_assembly_type],
        ['Configuration', ins.doorset_configuration],
        ['Fire Rating', ins.fire_rating],
        ['ID Method', ins.fire_door_id_type],
        ['Leaf Sizes (mm)', ins.leaf_sizes_mm],
        ['Add-ons', ins.additional_addons],
        ['Fire Stopping', ins.fire_stopping_acceptable],
      ]
    },
    {
      title: 'Condition & Gaps',
      fields: [
        ['Glazing Intact', ins.glazing_free_from_damage],
        ['Structure Intact', ins.surrounding_structure_intact],
        ['Frame Condition', ins.condition_door_leaf_frame],
        ['3mm Tolerance', ins.gap_3mm_tolerance],
        ['Hinge Side Gap', ins.gap_hinge_side],
        ['Lock Side Gap', ins.gap_lock_side],
        ['Head Gap', ins.gap_head],
        ['Threshold Gap (mm)', ins.gap_threshold_mm],
        ['Threshold Tolerance', ins.threshold_gap_within_tolerance],
        ['Leaf Flush', ins.leaf_flush_to_rebates],
      ]
    },
    {
      title: 'Hardware & Seals',
      fields: [
        ['Self-Closer', ins.self_closing_device],
        ['Hinges', ins.hinges_condition_acceptable],
        ['Essential Hardware', ins.essential_hardware_acceptable],
        ['Correct Signage', ins.correct_signage_present],
        ['Intumescent Seals', ins.intumescent_seals_acceptable],
      ]
    },
    {
      title: 'Outcome & Actions',
      fields: [
        ['Recommended Action', ins.recommended_action],
        ['Remedials Done', ins.remedial_works_completed],
        ['Repair Actions', ins.recommended_repair_actions],
        ['Replacement Reason', ins.replacement_reason],
      ]
    },
  ]

  const colW = (CW - 4) / 2
  const ROW_H = 6; const SEC_H = 6.5
  let leftY = headY + 25, rightY = headY + 25

  sections.forEach(section => {
    const active = section.fields.filter(([, v]) => v)
    if (active.length === 0) return
    const sh = SEC_H + active.length * ROW_H + 3

    let startX = leftY <= rightY ? ML : ML + colW + 4
    let cy = leftY <= rightY ? leftY : rightY

    doc.setFillColor(...NAVY); doc.rect(startX, cy, colW, SEC_H, 'F')
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...YELLOW)
    doc.text(section.title.toUpperCase(), startX + 2.5, cy + 4.5); cy += SEC_H

    active.forEach(([label, value], i) => {
      doc.setFillColor(...(i % 2 === 0 ? LGREY : WHITE)); doc.rect(startX, cy, colW, ROW_H, 'F')
      doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SLATE)
      doc.text(label, startX + 2.5, cy + 4)
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK)
      doc.text(String(value), startX + colW - 2.5, cy + 4, { align: 'right' })
      cy += ROW_H
    })
    if (leftY <= rightY) leftY = cy + 4; else rightY = cy + 4
  })

  const photos = [
    ['Outside', ins.photo_outside_url], ['Inside', ins.photo_inside_url],
    ['Photo 1', ins.photo1_url], ['Photo 2', ins.photo2_url],
    ['Photo 3', ins.photo3_url], ['Photo 4', ins.photo4_url],
  ].filter(([, u]) => u)

  if (photos.length > 0) {
    const py = H - 60
    doc.setFillColor(...LGREY); doc.rect(ML, py, CW, 7, 'F')
    doc.setFontSize(6.5); doc.setTextColor(...NAVY); doc.text('INSPECTION PHOTOGRAPHS', ML+5, py+4.8)
    for (let i = 0; i < Math.min(photos.length, 4); i++) {
      try {
        const img = await loadImage(photos[i][1])
        doc.addImage(img, 'JPEG', ML + i * 45, py + 10, 40, 32)
      } catch (_) {}
    }
  }
  drawFooter(doc, pageNum, totalPages)
}

// ─── Shared Utilities (Headers, Footers, Loaders) ───────────────────────────
function drawPageHeader(doc, logo, title, sub, showLogo = true) {
  doc.setFillColor(...WHITE); doc.rect(0, 0, W, 24, 'F')
  if (showLogo && logo) {
    const h = 16, w = (logo.width / logo.height) * h
    doc.addImage(logo.dataUrl, 'PNG', ML, 4, w, h)
  }
  if (title) {
    doc.setFontSize(7.5); doc.setTextColor(...SLATE); doc.text(title, W - MR, 11, { align: 'right' })
  }
  if (sub) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DARK); doc.text(sub, W - MR, 19, { align: 'right' })
  }
}

function drawFooter(doc, pageNum, totalPages) {
  doc.setFillColor(...NAVY); doc.rect(0, H - 12, W, 12, 'F')
  doc.setFontSize(7); doc.setTextColor(130, 155, 175); doc.text('TF Jones  ·  Fire Door Inspection', ML, H - 4.5)
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE); doc.text(`Page ${pageNum} of ${totalPages}`, W - MR, H - 4.5, { align: 'right' })
}

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
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height
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