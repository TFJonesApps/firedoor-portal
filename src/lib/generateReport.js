import jsPDF from 'jspdf'

// Brand colours as RGB
const NAVY   = [13,  31,  53]
const BLUE   = [26,  58,  92]
const YELLOW = [238, 255, 0]
const WHITE  = [255, 255, 255]
const LGREY  = [245, 247, 250]
const GREY   = [138, 155, 173]
const DKGREY = [80,  90,  100]
const GREEN  = [46,  125, 50]
const LGREEN = [232, 245, 233]
const RED    = [198, 40,  40]
const LRED   = [255, 235, 238]
const BLACK  = [20,  20,  30]

const W = 210
const H = 297
const ML = 14  // margin left
const MR = 14  // margin right
const CW = W - ML - MR  // content width

// ─── Public entry point ──────────────────────────────────────────────────────
export async function generateProjectReport(project, inspections) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const logo = await loadImage('/tfj_logo.png')

  coverPage(doc, logo, project, inspections)

  for (let i = 0; i < inspections.length; i++) {
    doc.addPage()
    await inspectionPage(doc, logo, project, inspections[i], i + 2, inspections.length + 1)
  }

  const filename = `${project.name.replace(/[^a-z0-9 ]/gi, '')} - Fire Door Report.pdf`
  doc.save(filename)
}

// ─── Cover page ──────────────────────────────────────────────────────────────
function coverPage(doc, logo, project, inspections) {
  const passed   = inspections.filter(i => i.inspection_passed === 'Pass').length
  const failed   = inspections.filter(i => i.inspection_passed === 'Fail').length
  const total    = inspections.length
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0

  // ── Full-height navy sidebar ──────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, 68, H, 'F')

  // Yellow accent bar on sidebar
  doc.setFillColor(...YELLOW)
  doc.rect(65, 0, 3, H, 'F')

  // ── Sidebar content ───────────────────────────────────────────────────────
  // Logo
  doc.addImage(logo, 'PNG', 8, 18, 50, 18)

  // Divider
  doc.setFillColor(...BLUE)
  doc.rect(8, 44, 50, 0.5, 'F')

  // Tagline
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GREY)
  doc.text('ENHANCING BUILDING SAFETY', 34, 51, { align: 'center' })

  // Stat boxes on sidebar
  const stats = [
    { label: 'TOTAL DOORS',  value: total,    color: BLUE,  light: [30, 60, 90]  },
    { label: 'PASSED',       value: passed,   color: GREEN, light: [40, 100, 55] },
    { label: 'FAILED',       value: failed,   color: RED,   light: [160, 40, 40] },
    { label: 'PASS RATE',    value: `${passRate}%`, color: BLUE, light: [30, 60, 90] },
  ]
  stats.forEach((s, i) => {
    const y = 75 + i * 42
    doc.setFillColor(...s.light)
    roundedRect(doc, 8, y, 50, 34, 3)
    doc.setFontSize(i === 3 ? 22 : 26)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...WHITE)
    doc.text(String(s.value), 33, y + 20, { align: 'center' })
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...GREY)
    doc.text(s.label, 33, y + 29, { align: 'center' })
  })

  // Report type label at bottom of sidebar
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GREY)
  doc.text('FIRE DOOR', 33, H - 40, { align: 'center' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...YELLOW)
  doc.text('INSPECTION REPORT', 33, H - 33, { align: 'center' })

  // Date at very bottom of sidebar
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GREY)
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  doc.text(dateStr, 33, H - 10, { align: 'center' })

  // ── Main content area (right of sidebar) ─────────────────────────────────
  const cx = 78  // content x start
  const cw = W - cx - 10  // content width

  // Report heading
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...GREY)
  doc.text('FIRE DOOR INSPECTION REPORT', cx, 28)

  // Project name
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  const nameLines = doc.splitTextToSize(project.name, cw)
  doc.text(nameLines, cx, 42)

  const afterNameY = 42 + nameLines.length * 10

  // Yellow accent under name
  doc.setFillColor(...YELLOW)
  doc.rect(cx, afterNameY + 2, 40, 2.5, 'F')

  // Address / postcode
  let infoY = afterNameY + 14
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DKGREY)
  if (project.address) { doc.text(project.address, cx, infoY); infoY += 7 }
  if (project.postcode) { doc.text(project.postcode, cx, infoY); infoY += 7 }

  infoY += 8

  // ── Project details card ──────────────────────────────────────────────────
  doc.setFillColor(...LGREY)
  doc.rect(cx, infoY, cw, 0.3, 'F')

  const detailRows = [
    ['Client',          project.client_name   || '—'],
    ['Lead Engineer',   project.engineer_name || '—'],
    ['Report Date',     new Date().toLocaleDateString('en-GB')],
    ['Total Inspections', String(total)],
  ]

  detailRows.forEach(([label, value], i) => {
    const y = infoY + 4 + i * 11
    if (i % 2 === 0) {
      doc.setFillColor(...LGREY)
      doc.rect(cx, y - 4, cw, 11, 'F')
    }
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...DKGREY)
    doc.text(label.toUpperCase(), cx + 3, y + 2.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    doc.text(value, cx + cw - 3, y + 2.5, { align: 'right' })
  })

  infoY += 4 + detailRows.length * 11 + 4
  doc.setFillColor(...LGREY)
  doc.rect(cx, infoY, cw, 0.3, 'F')

  // ── Inspections summary table ─────────────────────────────────────────────
  infoY += 16

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  doc.text('Inspection Summary', cx, infoY)

  infoY += 8

  // Table header
  doc.setFillColor(...NAVY)
  doc.rect(cx, infoY, cw, 8, 'F')
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text('DOOR LOCATION', cx + 3, infoY + 5.5)
  doc.text('ASSET ID',  cx + 68, infoY + 5.5)
  doc.text('RATING',    cx + 96, infoY + 5.5)
  doc.text('INSPECTOR', cx + 114, infoY + 5.5)
  doc.text('RESULT',    cx + cw - 3, infoY + 5.5, { align: 'right' })

  infoY += 8

  inspections.forEach((ins, i) => {
    const rowH = 8
    const y = infoY + i * rowH
    const isPassed = ins.inspection_passed === 'Pass'

    doc.setFillColor(...(i % 2 === 0 ? WHITE : LGREY))
    doc.rect(cx, y, cw, rowH, 'F')

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...BLACK)
    const loc = doc.splitTextToSize(ins.door_location || '—', 62)[0]
    doc.text(loc, cx + 3, y + 5.5)
    doc.text(ins.door_asset_id || '—', cx + 68, y + 5.5)
    doc.text(ins.fire_rating   || '—', cx + 96, y + 5.5)
    const eng = (ins.engineer_name || '—').split(' ')[0]
    doc.text(eng, cx + 114, y + 5.5)

    // Result badge
    doc.setFillColor(...(isPassed ? LGREEN : LRED))
    doc.rect(cx + cw - 22, y + 1.5, 19, 5.5, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...(isPassed ? GREEN : RED))
    doc.text(ins.inspection_passed || '—', cx + cw - 12.5, y + 5.5, { align: 'center' })
  })

  // Bottom border of table
  const tableBottom = infoY + inspections.length * 8
  doc.setFillColor(...LGREY)
  doc.rect(cx, tableBottom, cw, 0.3, 'F')
}

// ─── Individual inspection page ───────────────────────────────────────────────
async function inspectionPage(doc, logo, project, ins, pageNum, totalPages) {
  const passed     = ins.inspection_passed === 'Pass'
  const passColor  = passed ? GREEN : RED
  const passLight  = passed ? LGREEN : LRED
  const passLabel  = passed ? 'PASS' : 'FAIL'

  // ── Header bar ────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 20, 'F')
  doc.addImage(logo, 'PNG', ML, 3.5, 32, 12)

  // Project name in header
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(project.name, W - MR, 9, { align: 'right' })
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GREY)
  doc.text('Fire Door Inspection Report', W - MR, 15, { align: 'right' })

  // Yellow accent line
  doc.setFillColor(...YELLOW)
  doc.rect(0, 20, W, 2, 'F')

  // ── Door heading ──────────────────────────────────────────────────────────
  // Coloured left accent bar
  doc.setFillColor(...passColor)
  doc.rect(ML, 26, 3, 22, 'F')

  doc.setFontSize(17)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...NAVY)
  const locLines = doc.splitTextToSize(ins.door_location || 'Unknown Location', CW - 50)
  doc.text(locLines, ML + 7, 34)

  // Pass/Fail badge
  doc.setFillColor(...passLight)
  roundedRect(doc, W - MR - 34, 25, 34, 12, 2)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...passColor)
  doc.text(passLabel, W - MR - 17, 33, { align: 'center' })

  // Meta line (asset ID | fire rating | date)
  const meta = [
    ins.door_asset_id && `ID: ${ins.door_asset_id}`,
    ins.fire_rating,
    new Date(ins.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  ].filter(Boolean).join('   ·   ')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...DKGREY)
  doc.text(meta, ML + 7, 42)

  // Divider
  doc.setFillColor(...LGREY)
  doc.rect(ML, 50, CW, 0.4, 'F')

  // ── Field sections ────────────────────────────────────────────────────────
  const sections = [
    {
      title: 'Door Details',
      fields: [
        ['Survey Type',        ins.survey_type],
        ['Assembly Type',      ins.doorset_assembly_type],
        ['Configuration',      ins.doorset_configuration],
        ['Fire Rating',        ins.fire_rating],
        ['Fire Door ID Type',  ins.fire_door_id_type],
        ['Leaf Sizes (mm)',    ins.leaf_sizes_mm],
        ['Additional Add-ons', ins.additional_addons],
        ['Fire Stopping',      ins.fire_stopping_acceptable],
      ]
    },
    {
      title: 'Condition & Gaps',
      fields: [
        ['Glazing OK',              ins.glazing_free_from_damage],
        ['Structure Intact',        ins.surrounding_structure_intact],
        ['Door/Frame Condition',    ins.condition_door_leaf_frame],
        ['3mm Gap Tolerance',       ins.gap_3mm_tolerance],
        ['Gap — Hinge Side',        ins.gap_hinge_side],
        ['Gap — Lock Side',         ins.gap_lock_side],
        ['Gap — Head',              ins.gap_head],
        ['Gap — Threshold (mm)',    ins.gap_threshold_mm],
        ['Threshold Within Tol.',   ins.threshold_gap_within_tolerance],
        ['Leaf Flush to Rebates',   ins.leaf_flush_to_rebates],
      ]
    },
    {
      title: 'Hardware & Certification',
      fields: [
        ['Self-Closing Device',    ins.self_closing_device],
        ['Hinges Acceptable',      ins.hinges_condition_acceptable],
        ['Essential Hardware',     ins.essential_hardware_acceptable],
        ['Correct Signage',        ins.correct_signage_present],
        ['Intumescent Seals',      ins.intumescent_seals_acceptable],
      ]
    },
    {
      title: 'Outcome & Actions',
      fields: [
        ['Inspection Result',       ins.inspection_passed],
        ['Recommended Action',      ins.recommended_action],
        ['Remedial Works',          ins.remedial_works_completed],
        ['Repair Actions',          ins.recommended_repair_actions],
        ['Replacement Reason',      ins.replacement_reason],
        ['Inspector',               ins.engineer_name],
      ]
    },
  ]

  let y = 55
  const colW = (CW - 4) / 2
  let col = 0

  // Draw sections in two-column layout
  sections.forEach(section => {
    const activeFields = section.fields.filter(([, v]) => v)
    if (activeFields.length === 0) return

    const sectionH = 7 + activeFields.length * 6.5

    // If we're mid-right-column, or section is tall and we're near bottom, force new column
    if (col === 1 && y + sectionH > H - 70) {
      col = 0
      y = 55
    }
    if (col === 0 && y + sectionH > H - 70) {
      col = 1
      y = 55
    }

    const sx = ML + col * (colW + 4)

    // Section heading
    doc.setFillColor(...NAVY)
    doc.rect(sx, y, colW, 6, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...YELLOW)
    doc.text(section.title.toUpperCase(), sx + 3, y + 4.2)

    y += 6

    activeFields.forEach(([label, value], i) => {
      doc.setFillColor(...(i % 2 === 0 ? WHITE : LGREY))
      doc.rect(sx, y, colW, 6.5, 'F')

      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...DKGREY)
      doc.text(label, sx + 2, y + 4.5)

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...BLACK)
      const val = doc.splitTextToSize(String(value), colW * 0.42)[0]
      doc.text(val, sx + colW - 2, y + 4.5, { align: 'right' })

      y += 6.5
    })

    y += 5  // gap between sections

    // Switch to second column after first two sections
    if (col === 0 && sections.indexOf(section) === 1) {
      col = 1
      y = 55
    }
  })

  // ── Photos ────────────────────────────────────────────────────────────────
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
    const photoAreaY = H - 62
    doc.setFillColor(...NAVY)
    doc.rect(0, photoAreaY, W, 7, 'F')
    doc.setFillColor(...YELLOW)
    doc.rect(0, photoAreaY, 3, 7, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...WHITE)
    doc.text('SITE PHOTOS', ML + 4, photoAreaY + 4.8)

    const photoW  = 33
    const photoH  = 33
    const photoGap = 3
    const photoY  = photoAreaY + 9

    for (let i = 0; i < Math.min(photos.length, 5); i++) {
      const [label, url] = photos[i]
      const px = ML + i * (photoW + photoGap)
      try {
        const img = await loadImage(url)
        doc.addImage(img, 'JPEG', px, photoY, photoW, photoH)
        // Label below photo
        doc.setFontSize(6.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(...DKGREY)
        doc.text(label, px + photoW / 2, photoY + photoH + 4, { align: 'center' })
      } catch (_) {}
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(0, H - 14, W, 14, 'F')
  doc.setFillColor(...YELLOW)
  doc.rect(0, H - 15, W, 1, 'F')

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GREY)
  doc.text('TF Jones  |  Enhancing Building Safety  |  tfjones.co.uk', ML, H - 6)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...WHITE)
  doc.text(`Page ${pageNum} of ${totalPages}`, W - MR, H - 6, { align: 'right' })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function roundedRect(doc, x, y, w, h, r) {
  doc.roundedRect(x, y, w, h, r, r, 'F')
}

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
    img.src = url + (url.includes('?') ? '&' : '?') + `t=${Date.now()}`
  })
}
