import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Inject hover styles once per page load
if (typeof document !== 'undefined' && !document.getElementById('fd-action-menu-style')) {
  const style = document.createElement('style')
  style.id = 'fd-action-menu-style'
  style.textContent = `
    .fd-action-item:hover { background: #162840 !important; color: #EEFF00 !important; }
    .fd-action-item.danger:hover { background: #2E0A0A !important; color: #F44336 !important; }
  `
  document.head.appendChild(style)
}

const styles = {
  btn:   { background: 'transparent', border: '1px solid #EEFF00', borderRadius: 6, padding: '4px 10px', color: '#EEFF00', fontSize: 13, fontWeight: 700, cursor: 'pointer', lineHeight: 1, letterSpacing: '0.1em' },
  menu:  { position: 'fixed', background: '#0D1F35', border: '1px solid #1A3A5C', borderRadius: 8, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 9999, overflow: 'hidden' },
  item:  { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '10px 14px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderBottom: '1px solid #162840' },
  danger:{ color: '#F44336' },
}

export default function ProjectActionsMenu({ project, onReinspect, onDelete }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const wrapRef = useRef(null)
  const btnRef = useRef(null)

  const openMenu = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const menuWidth = 180
      let left = r.right - menuWidth
      if (left < 8) left = 8
      if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8
      setPos({ top: r.bottom + 4, left })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const closeOnScroll = () => setOpen(false)
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('resize', closeOnScroll)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', closeOnScroll, true)
      window.removeEventListener('resize', closeOnScroll)
    }
  }, [open])

  const isCompleted = project.is_completed === true
  const isArchived  = project.is_archived === true

  const run = async (fn) => {
    setOpen(false)
    try { await fn() } catch (e) { console.error('Project action failed:', e) }
  }

  const toggleCompleted = () => run(async () => {
    await supabase.from('projects').update({ is_completed: !isCompleted }).eq('id', project.id)
  })
  const toggleArchived = () => run(async () => {
    await supabase.from('projects').update({ is_archived: !isArchived }).eq('id', project.id)
  })

  const stop = e => e.stopPropagation()

  return (
    <div
      ref={wrapRef}
      style={{ display: 'inline-block' }}
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <button ref={btnRef} type="button" style={styles.btn} onClick={() => open ? setOpen(false) : openMenu()} title="Actions">⋯</button>
      {open && (
        <div style={{ ...styles.menu, top: pos.top, left: pos.left }} onMouseDown={stop}>
          <button className="fd-action-item" style={styles.item} onClick={() => { setOpen(false); onReinspect?.(project) }}>
            Reinspect
          </button>
          <button className="fd-action-item" style={styles.item} onClick={toggleCompleted}>
            {isCompleted ? 'Mark as Active' : 'Mark Complete'}
          </button>
          <button className="fd-action-item" style={styles.item} onClick={toggleArchived}>
            {isArchived ? 'Unarchive' : 'Archive'}
          </button>
          {onDelete && (
            <button
              className="fd-action-item danger"
              style={{ ...styles.item, ...styles.danger, borderBottom: 'none' }}
              onClick={() => run(async () => onDelete(project))}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}
