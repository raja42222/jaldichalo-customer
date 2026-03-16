import { Component } from 'react'
import { useAuth } from './context/AuthContext'
import AuthPage from './pages/AuthPage'
import GoogleSetup from './pages/GoogleSetup'
import PassengerApp from './pages/PassengerApp'
import PWAInstallBanner from './components/PWAInstallBanner'
import { AppSkeleton } from './components/Skeleton'

class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={{ position:'fixed', inset:0, background:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ fontSize:40, marginBottom:16 }}>⚠️</div>
        <div style={{ fontWeight:700, fontSize:18, marginBottom:8, textAlign:'center' }}>Something went wrong</div>
        <div style={{ fontSize:13, color:'#888', marginBottom:24, textAlign:'center', lineHeight:1.6 }}>{this.state.err?.message || 'Unexpected error'}</div>
        <button onClick={() => { this.setState({ err:null }); window.location.reload() }}
          style={{ padding:'14px 28px', background:'linear-gradient(135deg,#FF5F1F,#FF8C00)', color:'#fff', border:'none', borderRadius:14, fontWeight:700, fontSize:15, cursor:'pointer' }}>
          Reload App
        </button>
      </div>
    )
  }
}

function Splash() {
  return <AppSkeleton isDriver={false} />
}

function AppContent() {
  const { profile, loading, oauthUser } = useAuth()

  if (loading) return <Splash />

  if (oauthUser && !profile) {
    return (
      <>
        <ErrorBoundary><GoogleSetup /></ErrorBoundary>
        <PWAInstallBanner />
      </>
    )
  }

  if (profile) {
    return (
      <ErrorBoundary>
        <PassengerApp />
        <PWAInstallBanner />
      </ErrorBoundary>
    )
  }

  return (
    <>
      <AuthPage />
      <PWAInstallBanner />
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}
