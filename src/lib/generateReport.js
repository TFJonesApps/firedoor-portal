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

// ─── Entry point ──────────────────────────────────────────────────────────────
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

// ─── Page header (shared) ─────────────────────────────────────────────────────
// Logo sits on WHITE, so the black-background PNG renders cleanly.
// A thin navy rule + yellow stripe sits below to anchor the header visually.
function drawPageHeader(doc, logo, rightTitle, rightSub) {
  // White header zone
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, W, 24, 'F')

  // TFJ wordmark — fixed height 16mm, width calculated from aspect ratio
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

  // Right side text
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
  // Return header bottom Y
  return 25.5

  // Thin navy rule
  doc.setFillColor(...NAVY)
  doc.rect(0, 24, W, 1.5, 'F')
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

  // Solid PASS/FAIL badge
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
// Returns number of pages used (1 + overflow pages)
async function coverPage(doc, logo, clientLogo, project, inspections) {
  const passed   = inspections.filter(i => i.inspection_passed === 'Pass').length
  const failed   = inspections.filter(i => i.inspection_passed === 'Fail').length
  const total    = inspections.length
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
  const dateStr  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

  // We need totalPages at the end — do a first pass to count, then we'll stamp footers last.
  // For now we stamp footer as we go, with placeholders updated at the end via a re-render.
  // Simpler: just count how many summary pages we need first.

  const FOOTER_CLEAR = 14
  const AVAIL_COVER  = H - FOOTER_CLEAR

  // How much vertical space does the static cover content take?
  // Header: 27mm, hero: ~52mm, stats: 28mm, info card: ~58mm, section label: 12mm, table header: 8mm
  // Rough: static content ends around y = 27 + 52 + 28 + 58 + 12 + 8 = 185mm  → rows start at ~185
  // Each row = 7mm → floor((AVAIL_COVER - 185) / 7) rows fit on cover
  const STATIC_BOTTOM = 185
  const rowsOnCover   = Math.max(0, Math.floor((AVAIL_COVER - STATIC_BOTTOM) / SUM_ROW_H))
  const overflow      = Math.max(0, total - rowsOnCover)
  const overflowPages = overflow > 0 ? Math.ceil(overflow / Math.floor((AVAIL_COVER - 38) / SUM_ROW_H)) : 0
  const grandTotal    = 1 + overflowPages + inspections.length

  // ── Draw cover ──────────────────────────────────────────────────────────────
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, W, H, 'F')

  drawPageHeader(doc, logo, 'FIRE DOOR INSPECTION REPORT', dateStr)

  let y = 34

  // ── Right column: PREPARED FOR + client logo ─────────────────────────────
  // All logos fit into a fixed 55×22mm box (scaled to fit, centred in box)
  const LOGO_BOX_W = 55
  const LOGO_BOX_H = 22
  const logoBoxX   = W - MR - LOGO_BOX_W

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...SLATE)
  doc.text('PREPARED FOR', logoBoxX, y)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  const clientLabel = project.client_name || '—'
  doc.text(clientLabel, logoBoxX, y + 5)

  if (clientLogo) {
    // Fixed 40×20mm box for all logos — scale to fit, preserve aspect ratio
    const BOX_W = 40, BOX_H = 20
    const ratio = clientLogo.width / clientLogo.height
    let dw = BOX_W, dh = BOX_W / ratio
    if (dh > BOX_H) { dh = BOX_H; dw = dh * ratio }
    doc.addImage(clientLogo.dataUrl, 'PNG', logoBoxX, y + 9, dw, dh)
  }

  // ── Left column: project name + address ──────────────────────────────────
  const leftW = logoBoxX - ML - 8   // stop well before the right column

  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  const nameLines = doc.splitTextToSize(project.name || 'Untitled Project', leftW)
  doc.text(nameLines, ML, y + 10)

  const nameBottom = y + 10 + nameLines.length * 9

  // Address — tight under project name
  const addr = [project.address, project.postcode].filter(Boolean).join('   ·   ')
  if (addr) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...SLATE)
    doc.text(addr, ML, nameBottom + 3)
  }

  // Advance y past whichever column is taller (right col: label 5 + name 5 + logo 20 + gap 6 = 36)
  y = Math.max(nameBottom + (addr ? 10 : 4), y + 36)

  y += 4

  // ── Stat strip ──────────────────────────────────────────────────────────────
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
    // Top colour bar
    doc.setFillColor(...s.color)
    doc.roundedRect(bx, y, statW, 2.5, 1.5, 1.5, 'F')
    doc.rect(bx, y + 1.2, statW, 1.3, 'F')
    // Value
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...s.color)
    doc.text(String(s.value), bx + statW / 2, y + 10.5, { align: 'center' })
    // Label
    doc.setFontSize(6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...SLATE)
    doc.text(s.label.toUpperCase(), bx + statW / 2, y + 14.5, { align: 'center' })
  })
  y += 22

  // ── Project info card ────────────────────────────────────────────────────────
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

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...SLATE)
    doc.text(label, ML + 3, ry + 5.8)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK)
    const val = doc.splitTextToSize(value, CW * 0.55)[0]
    doc.text(val, ML + CW - 3, ry + 5.8, { align: 'right' })
  })
  y += infoRows.length * 8.5

  doc.setFillColor(...MGREY)
  doc.rect(ML, y, CW, 0.4, 'F')
  y += 8

  // ── Inspection Summary section label ─────────────────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  doc.text('Inspection Summary', ML, y)
  y += 4

  // ── Draw summary table rows — paginating as needed ───────────────────────────
  let rowIndex    = 0
  let currentPage = 1
  let pageNums    = [1]  // track pages used for summary

  // First: draw header on cover page
  y = drawSummaryHeader(doc, y)

  for (let i = 0; i < inspections.length; i++) {
    // Check if this row fits above the footer
    if (y + SUM_ROW_H > H - FOOTER_CLEAR - 2) {
      // Stamp footer on current page
      drawFooter(doc, currentPage, grandTotal)

      // New page
      doc.addPage()
      currentPage++
      pageNums.push(currentPage)

      doc.setFillColor(...WHITE)
      doc.rect(0, 0, W, H, 'F')
      drawPageHeader(doc, logo, `${project.name}`, 'INSPECTION SUMMARY (CONTINUED)')

      y = 34
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...NAVY)
      doc.text('Inspection Summary (continued)', ML, y)
      y += 4
      y = drawSummaryHeader(doc, y)
    }

    drawSummaryRow(doc, inspections[i], y, rowIndex)
    y += SUM_ROW_H
    rowIndex++
  }

  // Bottom rule
  doc.setFillColor(...MGREY)
  doc.rect(ML, y, CW, 0.4, 'F')

  // Stamp footer on last summary page
  drawFooter(doc, currentPage, grandTotal)

  return currentPage  // number of cover/summary pages used
}

// ─── Inspection page ──────────────────────────────────────────────────────────
async function inspectionPage(doc, logo, project, ins, pageNum, totalPages) {
  const passed    = ins.inspection_passed === 'Pass'
  const passColor = passed ? GREEN : RED
  const passLabel = passed ? 'PASS' : 'FAIL'

  doc.setFillColor(...WHITE)
  doc.rect(0, 0, W, H, 'F')

  drawPageHeader(doc, logo, project.name, project.client_name || '')

  // ── Door heading card ────────────────────────────────────────────────────────
  const headY = 30
  const headH = 20

  doc.setFillColor(...LGREY)
  doc.rect(ML, headY, CW, headH, 'F')

  // Left colour strip (pass/fail)
  doc.setFillColor(...passColor)
  doc.rect(ML, headY, 3.5, headH, 'F')

  // Location
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  const locLines = doc.splitTextToSize(ins.door_location || 'Unknown Location', CW - 52)
  doc.text(locLines, ML + 7, headY + 9)

  // PASS/FAIL badge
  const badgeW = 24
  const badgeX = ML + CW - badgeW
  doc.setFillColor(...passColor)
  doc.roundedRect(badgeX, headY + 3.5, badgeW, 11, 2, 2, 'F')
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(passLabel, badgeX + badgeW / 2, headY + 11, { align: 'center' })

  // Meta
  const meta = [
    ins.door_asset_id && `Asset ID: ${ins.door_asset_id}`,
    ins.fire_rating,
    new Date(ins.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    ins.engineer_name && `Inspector: ${ins.engineer_name}`,
  ].filter(Boolean).join('   ·   ')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...SLATE)
  doc.text(meta, ML + 7, headY + headH - 4)

  // ── Two-column field sections ─────────────────────────────────────────────
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

  const GAP    = 4
  const colW   = (CW - GAP) / 2
  const leftX  = ML
  const rightX = ML + colW + GAP
  const ROW_H  = 6
  const SEC_H  = 6.5

  const FOOTER_H     = 13
  const PHOTO_BLOCK  = 44  // header(7) + photo(32) + label(5)
  const FOOTER_CLEAR = FOOTER_H + 4
  const maxFieldY    = H - FOOTER_CLEAR - PHOTO_BLOCK - 4

  let leftY  = headY + headH + 5
  let rightY = headY + headH + 5

  sections.forEach(section => {
    const active = section.fields.filter(([, v]) => v)
    if (active.length === 0) return
    // Estimate height: questions may wrap to 2 lines
    const sh = SEC_H + active.reduce((sum, [label]) => {
      const lines = Math.ceil(label.length / 38)  // rough chars per line at 60% of colW
      return sum + Math.max(ROW_H, lines * 4.5 + 2.5)
    }, 0) + 3

    let startX, col
    if (leftY <= rightY && leftY + sh <= maxFieldY) {
      col = 'left'; startX = leftX
    } else if (rightY + sh <= maxFieldY) {
      col = 'right'; startX = rightX
    } else {
      col = leftY <= rightY ? 'left' : 'right'
      startX = col === 'left' ? leftX : rightX
    }
    let cy = col === 'left' ? leftY : rightY

    // Section heading — navy bar with yellow text
    doc.setFillColor(...NAVY)
    doc.rect(startX, cy, colW, SEC_H, 'F')
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...YELLOW)
    doc.text(section.title.toUpperCase(), startX + 2.5, cy + 4.5)
    cy += SEC_H

    active.forEach(([label, value], i) => {
      doc.setFontSize(6.5)
      doc.setFont('helvetica', 'normal')

      // Question wraps over ~60% of col width; answer right-aligned in ~38%
      const labelLines = doc.splitTextToSize(label, colW * 0.60)
      const rh = Math.max(ROW_H, labelLines.length * 4.5 + 2.5)

      doc.setFillColor(...(i % 2 === 0 ? LGREY : WHITE))
      doc.rect(startX, cy, colW, rh, 'F')

      doc.setTextColor(...SLATE)
      doc.text(labelLines, startX + 2.5, cy + 4)

      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK)
      const maxVW = colW * 0.36
      const val = doc.splitTextToSize(String(value), maxVW)[0]
      doc.text(val, startX + colW - 2.5, cy + 4, { align: 'right' })
      cy += rh
    })

    cy += 3
    if (col === 'left') leftY = cy
    else rightY = cy
  })

  const contentBottom = Math.max(leftY, rightY) + 3

  // ── Photos ─────────────────────────────────────────────────────────────────
  const photos = [
    ['Outside', ins.photo_outside_url],
    ['Inside',  ins.photo_inside_url],
    ['Photo 1', ins.photo1_url],
    ['Photo 2', ins.photo2_url],
    ['Photo 3', ins.photo3_url],
    ['Photo 4', ins.photo4_url],
    ['Photo 5', ins.photo5_url],
    ['Photo 6', ins.photo6_url],
  ].filter(([, u]) => u)

  if (photos.length > 0) {
    const PGAP   = 3
    const MAX_PH = 5
    const PHOTO_H = 32
    const PW     = (CW - PGAP * (MAX_PH - 1)) / MAX_PH
    const count  = Math.min(photos.length, MAX_PH)

    const barY = Math.max(contentBottom, H - FOOTER_CLEAR - PHOTO_H - 14)
    const phY  = barY + 9

    // Section bar
    doc.setFillColor(...LGREY)
    doc.rect(ML, barY, CW, 7, 'F')
    doc.setFillColor(...NAVY)
    doc.rect(ML, barY, 3, 7, 'F')
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text('SITE PHOTOGRAPHS', ML + 5.5, barY + 4.8)

    for (let i = 0; i < count; i++) {
      const [label, url] = photos[i]
      const px = ML + i * (PW + PGAP)
      try {
        const img = await loadImage(url)
        doc.addImage(img, 'JPEG', px, phY, PW, PHOTO_H)
        doc.setDrawColor(...MGREY)
        doc.setLineWidth(0.3)
        doc.rect(px, phY, PW, PHOTO_H)
        doc.setFontSize(6)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...SLATE)
        doc.text(label, px + PW / 2, phY + PHOTO_H + 4, { align: 'center' })
      } catch (_) {}
    }
  }

  drawFooter(doc, pageNum, totalPages)
}

// ─── Image loaders ────────────────────────────────────────────────────────────

// For photos — JPEG compression
async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.width
      canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = url + (url.includes('?') ? '&' : '?') + `_=${Date.now()}`
  })
}

// For logos with transparency — PNG to preserve alpha channel
// Returns { dataUrl, width, height } so caller can size by aspect ratio
async function loadLogoImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = img.width
      canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.width, height: img.height })
    }
    img.onerror = reject
    img.src = url + (url.includes('?') ? '&' : '?') + `_=${Date.now()}`
  })
}
