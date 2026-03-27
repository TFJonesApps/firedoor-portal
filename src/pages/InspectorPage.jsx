import { supabase } from '../lib/supabase'

export default function InspectorPage() {
  return (
    <div style={s.page}>
      <div style={s.card}>
        <img src="/tfj_logo.png" alt="TF Jones" style={s.logo} />
        <div style={s.bar} />
        <h2 style={s.title}>Inspector Portal</h2>
        <p style={s.text}>
          Inspections are conducted via the TF Jones mobile app.
          Please use the app on your device to carry out and submit inspections.
        </p>
        <div style={s.appIcon}>📱</div>
        <button style={s.signOut} onClick={() => supabase.auth.signOut()}>Sign Out</button>
      </div>
    </div>
  )
}

const s = {
  page:    { minHeight: '100vh', background: '#0D1F35', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card:    { background: '#162840', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 400, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' },
  logo:    { height: 48, objectFit: 'contain', marginBottom: 16 },
  bar:     { width: 48, height: 3, background: '#EEFF00', borderRadius: 2, margin: '0 auto 24px' },
  title:   { color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 12px' },
  text:    { color: '#8A9BAD', fontSize: 15, lineHeight: 1.6, margin: '0 0 28px' },
  appIcon: { fontSize: 48, marginBottom: 28 },
  signOut: { background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '10px 24px', color: '#fff', fontSize: 14, cursor: 'pointer' },
}
