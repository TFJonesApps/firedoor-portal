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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0D1F35' }}>
        <Spinner />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Admin routes — /login is the TF Jones entry point */}
        <Route path="/login"       element={!session ? <LoginPage />       : <Navigate to="/" />} />
        <Route path="/"            element={session  ? <ProjectsPage />    : <Navigate to="/login" />} />
        <Route path="/project/:id" element={session  ? <ProjectDetailPage /> : <Navigate to="/login" />} />

        {/* Client routes — /client/login is the client entry point */}
        <Route path="/client/login"         element={!session ? <ClientLoginPage /> : <Navigate to="/client/scan" />} />
        <Route path="/client/scan"          element={session  ? <ClientScanPage />  : <Navigate to="/client/login" />} />
        <Route path="/client/door/:assetId" element={session  ? <DoorResultPage />  : <Navigate to="/client/login" />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to={session ? '/' : '/login'} />} />
      </Routes>
    </BrowserRouter>
  )
}

function Spinner() {
  return <div style={{ width: 40, height: 40, border: '3px solid #162840', borderTop: '3px solid #EEFF00', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
}
