import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ClientLoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate                = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }

    // Check role — clients go to scan, admins go to admin portal
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profile?.role === 'admin') {
      navigate('/')
    } else {
      navigate('/client/scan')
    }
    setLoading(false)
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <img src="/NEW - TFJ Logo - Enhancing Building Safety Logo Transparent - Blue and White.png"
          alt="TF Jones" style={s.logo} />

        <h1 style={s.title}>Door Inspection Portal</h1>
        <p style={s.sub}>Sign in to check fire door status</p>

        <form onSubmit={handleLogin} style={s.form}>
          <input
            style={s.input}
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            style={s.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <p style={s.error}>{error}</p>}
          <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

const s = {
  page:  { minHeight: '100vh', background: '#0D1F35', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card:  { background: '#162840', borderRadius: 20, padding: '40px 28px', width: '100%', maxWidth: 400, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
  logo:  { width: '100%', maxWidth: 180, display: 'block', margin: '0 auto 24px' },
  title: { color: '#fff', fontSize: 22, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' },
  sub:   { color: '#8A9BAD', fontSize: 14, textAlign: 'center', margin: '0 0 28px' },
  form:  { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { background: '#0D1F35', border: '1px solid #1A3A5C', borderRadius: 10, padding: '14px 16px', color: '#fff', fontSize: 16, outline: 'none' },
  btn:   { background: '#EEFF00', color: '#0D1F35', border: 'none', borderRadius: 10, padding: 16, fontSize: 16, fontWeight: 700, marginTop: 4 },
  error: { color: '#F44336', fontSize: 13, textAlign: 'center', margin: 0 },
}
