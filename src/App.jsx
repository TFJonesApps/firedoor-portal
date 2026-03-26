import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ClientLoginPage from './pages/ClientLoginPage'
import ClientScanPage from './pages/ClientScanPage'
import DoorResultPage from './pages/DoorResultPage'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [role, setRole]       = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await fetchRole(data.session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      if (s) await fetchRole(s.user.id)
      else setRole(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchRole(userId) {
    const { data } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single()
    setRole(data?.role || 'client')
  }

  if (session === undefined) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0D1F35' }}>
        <Spinner />
      </div>
    )
  }

  const isAdmin  = session && role === 'admin'
  const isClient = session && role === 'client'

  return (
    <BrowserRouter>
      <Routes>
        {/* Admin routes */}
        <Route path="/login"        element={isAdmin  ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/"             element={isAdmin  ? <ProjectsPage />    : <Navigate to={session ? '/client/scan' : '/client/login'} />} />
        <Route path="/project/:id"  element={isAdmin  ? <ProjectDetailPage /> : <Navigate to={session ? '/client/scan' : '/client/login'} />} />

        {/* Client routes */}
        <Route path="/client/login" element={session  ? <Navigate to={isAdmin ? '/' : '/client/scan'} /> : <ClientLoginPage />} />
        <Route path="/client/scan"  element={session  ? <ClientScanPage />  : <Navigate to="/client/login" />} />
        <Route path="/client/door/:assetId" element={session ? <DoorResultPage /> : <Navigate to="/client/login" />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to={session ? (isAdmin ? '/' : '/client/scan') : '/client/login'} />} />
      </Routes>
    </BrowserRouter>
  )
}

function Spinner() {
  return <div style={{ width: 40, height: 40, border: '3px solid #162840', borderTop: '3px solid #EEFF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
}
