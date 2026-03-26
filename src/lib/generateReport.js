import jsPDF from 'jspdf'

// ─── Brand palette ────────────────────────────────────────────────────────────
const NAVY   = [13,  31,  53]
const YELLOW = [238, 255, 0]
const WHITE  = [255, 255, 255]
const LGREY  = [247, 248, 250]
const MGREY  = [213, 219, 227]
const SLATE  = [100, 116, 135]
const DARK   = [30,  40,  55]
const GREEN  = [22,  101, 52]
const LGREEN = [220, 252, 231]
const RED    = [153, 27,  27]
const LRED   = [254, 226, 226]
const ACCENT = [238, 255, 0]   // yellow highlight

const W  = 210
const H  = 297
const ML = 16
const MR = 16
const CW = W - ML - MR   // 178mm

// ─── Entry point ──────────────────────────────────────────────────────────────
export async function generateProjectReport(project, inspections) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadImage('/tfj_logo.png').catch(() => null)

  await coverPage(doc, logo, project, inspections)

  for (let i = 0; i < inspections.length; i++) {
    doc.addPage()
    await inspectionPage(doc, logo, project, inspections[i], i + 2, inspections.length + 1)
  }

  const parts = [project.client_name, project.name, project.postcode || project.address]
    .filter(Boolean).map(s => s.trim())
  const filename = parts.join(' - ').replace(/[/\\?%*:|"<>]/g, '') + '.pdf'
  doc.save(filename)
}

// ─── Cover page ───────────────────────────────────────────────────────────────
async function coverPage(doc, logo, project, inspections) {
  const passed   = inspections.filter(i => i.inspection_passed === 'Pass').length
  const failed   = inspections.filter(i => i.inspection_passed === 'Fail').length
  const total    = inspections.length
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0

  // White page
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, W, H, 'F')

  // ── Top header band ─────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 42, 'F')

  // Logo left-aligned in header
  if (logo) {
    doc.addImage(logo, 'PNG', ML, 10, 52, 18)
  } else {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...WHITE)
    doc.text('TF JONES', ML + 2, 22)
  }

  // "Fire Door Inspection Report" right-aligned in header
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 195, 210)
  doc.text('FIRE DOOR INSPECTION REPORT', W - MR, 17, { align: 'right' })

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(dateStr, W - MR, 27, { align: 'right' })

  // Yellow accent bar
  doc.setFillColor(...YELLOW)
  doc.rect(0, 42, W, 3, 'F')

  // ── Hero section ─────────────────────────────────────────────────────────────
  let y = 58

  // "Prepared for"
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...SLATE)
  doc.text('PREPARED FOR', ML, y)

  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...DARK)
  doc.text(project.client_name || 'Client', ML, y)

  y += 12

  // Project name — large
  doc.setFontSize(26)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  const nameLines = doc.splitTextToSize(project.name || 'Untitled Project', CW)
  doc.text(nameLines, ML, y)
  y += nameLines.length * 10

  // Thin yellow bar under name
  doc.setFillColor(...YELLOW)
  doc.rect(ML, y, 60, 2, 'F')
  y += 8

  // Address
  const addrParts = [project.address, project.postcode].filter(Boolean)
  if (addrParts.length) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...SLATE)
    doc.text(addrParts.join('  ·  '), ML, y)
    y += 8
  }

  y += 4

  // ── Stat row ─────────────────────────────────────────────────────────────────
  const statBoxW = (CW - 9) / 4
  const stats = [
    { label: 'Total Doors', value: total,         color: NAVY  },
    { label: 'Passed',      value: passed,        color: GREEN },
    { label: 'Failed',      value: failed,        color: RED   },
    { label: 'Pass Rate',   value: `${passRate}%`, color: NAVY },
  ]
  stats.forEach((s, i) => {
    const bx = ML + i * (statBoxW + 3)
    // Box bg
    doc.setFillColor(...LGREY)
    doc.roundedRect(bx, y, statBoxW, 26, 2, 2, 'F')
    // Top colour bar
    doc.setFillColor(...s.color)
    doc.roundedRect(bx, y, statBoxW, 4, 2, 2, 'F')
    doc.rect(bx, y + 2, statBoxW, 2, 'F')  // square bottom of top bar
    // Value
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...s.color)
    doc.text(String(s.value), bx + statBoxW / 2, y + 16, { align: 'center' })
    // Label
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...SLATE)
    doc.text(s.label.toUpperCase(), bx + statBoxW / 2, y + 22.5, { align: 'center' })
  })
  y += 34

  // ── Project info card ─────────────────────────────────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  doc.text('Project Information', ML, y)
  y += 5

  // Top rule
  doc.setFillColor(...MGREY)
  doc.rect(ML, y, CW, 0.4, 'F')
  y += 0.4

  const infoRows = [
    ['Client',        project.client_name   || '—'],
    ['Lead Engineer', project.engineer_name || '—'],
    ['Address',       [project.address, project.postcode].filter(Boolean).join(', ') || '—'],
    ['Report Date',   new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })],
    ['Total Inspections', String(total)],
  ]
  infoRows.forEach(([label, value], i) => {
    const ry = y + i * 9
    doc.setFillColor(...(i % 2 === 0 ? LGREY : WHITE))
    doc.rect(ML, ry, CW, 9, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...SLATE)
    doc.text(label, ML + 3, ry + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...DARK)
    const val = doc.splitTextToSize(value, CW * 0.55)[0]
    doc.text(val, ML + CW - 3, ry + 6, { align: 'right' })
  })
  y += infoRows.length * 9

  // Bottom rule
  doc.setFillColor(...MGREY)
  doc.rect(ML, y, CW, 0.4, 'F')
  y += 10

  // ── Summary table ──────────────────────────────────────────────────────────
  if (inspections.length > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text('Inspection Summary', ML, y)
    y += 5

    // Header
    doc.setFillColor(...NAVY)
    doc.rect(ML, y, CW, 8, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...WHITE)
    const c1 = ML + 3
    const c2 = ML + CW * 0.55
    const c3 = ML + CW - 3
    doc.text('DOOR LOCATION', c1, y + 5.5)
    doc.text('FIRE RATING',   c2, y + 5.5)
    doc.text('RESULT',        c3, y + 5.5, { align: 'right' })
    y += 8

    const maxRows = Math.floor((H - y - 28) / 7.5)
    const rows = inspections.slice(0, maxRows)

    rows.forEach((ins, i) => {
      const rowH = 7.5
      const isPassed = ins.inspection_passed === 'Pass'
      doc.setFillColor(...(i % 2 === 0 ? WHITE : LGREY))
      doc.rect(ML, y, CW, rowH, 'F')

      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...DARK)

      const loc = doc.splitTextToSize(ins.door_location || '—', CW * 0.52)[0]
      doc.text(loc, c1, y + 5)
      doc.text(ins.fire_rating || '—', c2, y + 5)

      // Solid badge
      const bw = 16
      const bx = c3 - bw
      doc.setFillColor(...(isPassed ? GREEN : RED))
      doc.roundedRect(bx, y + 1.2, bw, 5, 1.5, 1.5, 'F')
      doc.setFontSize(6.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...WHITE)
      doc.text(ins.inspection_passed || '—', bx + bw / 2, y + 5, { align: 'center' })
      y += rowH
    })

    if (inspections.length > maxRows) {
      doc.setFontSize(7)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(...SLATE)
      doc.text(`+ ${inspections.length - maxRows} more — see following pages`, ML + 3, y + 5)
      y += 8
    }

    // Bottom rule
    doc.setFillColor(...MGREY)
    doc.rect(ML, y, CW, 0.4, 'F')
  }

  drawFooter(doc, 1, inspections.length + 1)
}

// ─── Inspection page ──────────────────────────────────────────────────────────
async function inspectionPage(doc, logo, project, ins, pageNum, totalPages) {
  const passed    = ins.inspection_passed === 'Pass'
  const passColor = passed ? GREEN : RED
  const passLight = passed ? LGREEN : LRED
  const passLabel = passed ? 'PASS' : 'FAIL'

  // White page
  doc.setFillColor(...WHITE)
  doc.rect(0, 0, W, H, 'F')

  // ── Header band ─────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 20, 'F')

  if (logo) doc.addImage(logo, 'PNG', ML, 3.5, 40, 13)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(project.name || '', W - MR, 10, { align: 'right' })
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(160, 180, 200)
  doc.text(project.client_name || '', W - MR, 17, { align: 'right' })

  doc.setFillColor(...YELLOW)
  doc.rect(0, 20, W, 2.5, 'F')

  // ── Door heading card ────────────────────────────────────────────────────────
  const headY = 27
  const headH = 22

  doc.setFillColor(...LGREY)
  doc.rect(ML, headY, CW, headH, 'F')

  // Left colour strip
  doc.setFillColor(...passColor)
  doc.rect(ML, headY, 4, headH, 'F')

  // Door location
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  const locLines = doc.splitTextToSize(ins.door_location || 'Unknown Location', CW - 60)
  doc.text(locLines, ML + 8, headY + 10)

  // PASS/FAIL badge
  const badgeW = 28
  const badgeX = ML + CW - badgeW
  doc.setFillColor(...passColor)
  doc.roundedRect(badgeX, headY + 3, badgeW, 13, 2, 2, 'F')
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(passLabel, badgeX + badgeW / 2, headY + 12, { align: 'center' })

  // Meta info
  const meta = [
    ins.door_asset_id && `Asset ID: ${ins.door_asset_id}`,
    ins.fire_rating,
    new Date(ins.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    ins.engineer_name && `Inspector: ${ins.engineer_name}`,
  ].filter(Boolean).join('   ·   ')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...SLATE)
  doc.text(meta, ML + 8, headY + headH - 5)

  // ── Two-column field sections ─────────────────────────────────────────────
  const sections = [
    {
      title: 'Door Details',
      fields: [
        ['Survey Type',       ins.survey_type],
        ['Assembly Type',     ins.doorset_assembly_type],
        ['Configuration',     ins.doorset_configuration],
        ['Fire Rating',       ins.fire_rating],
        ['Door ID Type',      ins.fire_door_id_type],
        ['Leaf Sizes (mm)',   ins.leaf_sizes_mm],
        ['Add-ons',           ins.additional_addons],
        ['Fire Stopping',     ins.fire_stopping_acceptable],
      ]
    },
    {
      title: 'Condition & Gaps',
      fields: [
        ['Glazing',              ins.glazing_free_from_damage],
        ['Structure',            ins.surrounding_structure_intact],
        ['Door/Frame Condition', ins.condition_door_leaf_frame],
        ['3mm Gap Tolerance',    ins.gap_3mm_tolerance],
        ['Hinge Side Gap',       ins.gap_hinge_side],
        ['Lock Side Gap',        ins.gap_lock_side],
        ['Head Gap',             ins.gap_head],
        ['Threshold Gap (mm)',   ins.gap_threshold_mm],
        ['Threshold Tolerance',  ins.threshold_gap_within_tolerance],
        ['Flush to Rebates',     ins.leaf_flush_to_rebates],
      ]
    },
    {
      title: 'Hardware & Certification',
      fields: [
        ['Self-Closing Device',  ins.self_closing_device],
        ['Hinges',               ins.hinges_condition_acceptable],
        ['Essential Hardware',   ins.essential_hardware_acceptable],
        ['Signage',              ins.correct_signage_present],
        ['Intumescent Seals',    ins.intumescent_seals_acceptable],
      ]
    },
    {
      title: 'Outcome & Actions',
      fields: [
        ['Recommended Action',   ins.recommended_action],
        ['Remedial Works Done',  ins.remedial_works_completed],
        ['Repair Actions',       ins.recommended_repair_actions],
        ['Replacement Reason',   ins.replacement_reason],
      ]
    },
  ]

  const GAP    = 4
  const colW   = (CW - GAP) / 2
  const leftX  = ML
  const rightX = ML + colW + GAP
  const ROW_H  = 6.5
  const SEC_H  = 7

  const FOOTER_H = 14
  const PHOTO_H  = 36
  const FOOTER_CLEAR = FOOTER_H + 6

  let leftY  = headY + headH + 6
  let rightY = headY + headH + 6
  const maxY = H - FOOTER_CLEAR - PHOTO_H - 10

  sections.forEach(section => {
    const active = section.fields.filter(([, v]) => v)
    if (active.length === 0) return
    const sh = SEC_H + active.length * ROW_H + 3

    let startX, col
    if (leftY <= rightY && leftY + sh <= maxY) {
      col = 'left'; startX = leftX
    } else if (rightY + sh <= maxY) {
      col = 'right'; startX = rightX
    } else {
      col = leftY <= rightY ? 'left' : 'right'
      startX = col === 'left' ? leftX : rightX
    }
    let cy = col === 'left' ? leftY : rightY

    // Section heading
    doc.setFillColor(...NAVY)
    doc.rect(startX, cy, colW, SEC_H, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...YELLOW)
    doc.text(section.title.toUpperCase(), startX + 3, cy + 5)
    cy += SEC_H

    active.forEach(([label, value], i) => {
      doc.setFillColor(...(i % 2 === 0 ? LGREY : WHITE))
      doc.rect(startX, cy, colW, ROW_H, 'F')

      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...SLATE)
      doc.text(label, startX + 2.5, cy + 4.5)

      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DARK)
      const maxVW = colW * 0.44
      const val = doc.splitTextToSize(String(value), maxVW)[0]
      doc.text(val, startX + colW - 2.5, cy + 4.5, { align: 'right' })
      cy += ROW_H
    })

    cy += 3

    if (col === 'left') leftY = cy
    else rightY = cy
  })

  const contentBottom = Math.max(leftY, rightY) + 4

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
    const PGAP  = 3
    const maxPh = 5
    const PW    = (CW - PGAP * (maxPh - 1)) / maxPh
    const count = Math.min(photos.length, maxPh)

    // Pin photos above footer with some padding — never overlap footer
    const photosBarY = Math.max(contentBottom + 4, H - FOOTER_CLEAR - PHOTO_H - 14)
    const photosY    = photosBarY + 8

    // Photos section heading
    doc.setFillColor(...LGREY)
    doc.rect(ML, photosBarY, CW, 7, 'F')
    doc.setFillColor(...NAVY)
    doc.rect(ML, photosBarY, 3, 7, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...NAVY)
    doc.text('SITE PHOTOGRAPHS', ML + 6, photosBarY + 5)

    for (let i = 0; i < count; i++) {
      const [label, url] = photos[i]
      const px = ML + i * (PW + PGAP)
      try {
        const img = await loadImage(url)
        doc.addImage(img, 'JPEG', px, photosY, PW, PHOTO_H)
        // Subtle border
        doc.setDrawColor(...MGREY)
        doc.setLineWidth(0.3)
        doc.rect(px, photosY, PW, PHOTO_H)
        doc.setFontSize(6.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...SLATE)
        doc.text(label, px + PW / 2, photosY + PHOTO_H + 4.5, { align: 'center' })
      } catch (_) {}
    }
  }

  drawFooter(doc, pageNum, totalPages)
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function drawFooter(doc, pageNum, totalPages) {
  // Thin yellow rule, then navy band
  doc.setFillColor(...MGREY)
  doc.rect(0, H - 15, W, 0.4, 'F')
  doc.setFillColor(...NAVY)
  doc.rect(0, H - 14, W, 14, 'F')
  doc.setFillColor(...YELLOW)
  doc.rect(0, H - 15, W, 1, 'F')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(140, 160, 180)
  doc.text('TF Jones  ·  Fire Door Inspection Services  ·  Confidential', ML, H - 5.5)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(`${pageNum} / ${totalPages}`, W - MR, H - 5.5, { align: 'right' })
}

// ─── Image loader ─────────────────────────────────────────────────────────────
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
