import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <img src="/tfj_logo.png" alt="TF Jones" style={styles.logo} />
          <div style={styles.bar} />
          <p style={styles.subtitle}>Fire Door Inspection Portal</p>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          {error && <p style={styles.error}>{error}</p>}

          <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0D1F35',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    background: '#162840',
    borderRadius: 16,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  header: { textAlign: 'center', marginBottom: 32 },
  logo: { height: 48, maxWidth: 200, objectFit: 'contain', marginBottom: 16 },
  subtitle: { color: '#8A9BAD', fontSize: 14, marginTop: 10 },
  bar: { width: 48, height: 3, background: '#EEFF00', borderRadius: 2, margin: '0 auto' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { color: '#8A9BAD', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  input: {
    background: '#0D1F35',
    border: '1px solid #1A3A5C',
    borderRadius: 8,
    padding: '12px 14px',
    color: '#fff',
    fontSize: 15,
    outline: 'none',
  },
  error: { color: '#F44336', fontSize: 13 },
  btn: {
    marginTop: 8,
    background: '#EEFF00',
    color: '#0D1F35',
    border: 'none',
    borderRadius: 8,
    padding: '13px',
    fontSize: 15,
    fontWeight: 700,
  },
}
