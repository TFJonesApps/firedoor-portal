import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ClientLoginPage from './pages/ClientLoginPage'
import ClientScanPage from './pages/ClientScanPage'
import DoorResultPage from './pages/DoorResultPage'
import UsersPage from './pages/UsersPage'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [role, setRole]       = useState(undefined) // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) initUser(data.session.user)
      else { setSession(null); setRole(null) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) initUser(s.user)
      else setRole(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function initUser(user) {
    // Upsert email then fetch role
    await supabase.from('user_profiles').upsert(
      { id: user.id, email: user.email },
      { onConflict: 'id', ignoreDuplicates: false }
    )
    const { data } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    setRole(data?.role || 'client')
  }

  if (session === undefined || (session && role === undefined)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0D1F35' }}>
        <Spinner />
      </div>
    )
  }

  const isAdmin = session && role === 'admin'

  return (
    <BrowserRouter>
      <Routes>
        {/* Admin routes — only accessible by admins */}
        <Route path="/login"       element={!session ? <LoginPage />         : <Navigate to={isAdmin ? '/' : '/client/scan'} />} />
        <Route path="/"            element={isAdmin  ? <ProjectsPage />      : <Navigate to={session ? '/client/scan' : '/login'} />} />
        <Route path="/project/:id" element={isAdmin  ? <ProjectDetailPage /> : <Navigate to={session ? '/client/scan' : '/login'} />} />
        <Route path="/users"       element={isAdmin  ? <UsersPage />         : <Navigate to={session ? '/client/scan' : '/login'} />} />

        {/* Client routes */}
        <Route path="/client/login"         element={!session ? <ClientLoginPage /> : <Navigate to={isAdmin ? '/' : '/client/scan'} />} />
        <Route path="/client/scan"          element={session  ? <ClientScanPage />  : <Navigate to="/client/login" />} />
        <Route path="/client/door/:assetId" element={session  ? <DoorResultPage />  : <Navigate to="/client/login" />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to={session ? (isAdmin ? '/' : '/client/scan') : '/login'} />} />
      </Routes>
    </BrowserRouter>
  )
}

function Spinner() {
  return <div style={{ width: 40, height: 40, border: '3px solid #162840', borderTop: '3px solid #EEFF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
}
