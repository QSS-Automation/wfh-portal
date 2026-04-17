import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from '@azure/msal-react'
import { PublicClientApplication, InteractionStatus } from '@azure/msal-browser'
import { msalConfig, loginRequest } from './config/auth'
import { AppProvider, useApp } from './contexts/AppContext'
import { Sidebar } from './components/Sidebar'
import { Spinner } from './components/UI'
import { Dashboard } from './screens/Dashboard'
import { NewRequest } from './screens/NewRequest'
import { MyRequests } from './screens/MyRequests'
import { Help } from './screens/Help'

const msalInstance = new PublicClientApplication(msalConfig)

// ─── Login Page ────────────────────────────────────────────────────────────
console.log("ENV DEBUG:");
console.log("TENANT ID:", import.meta.env.VITE_AZURE_TENANT_ID);
console.log("CLIENT ID:", import.meta.env.VITE_AZURE_CLIENT_ID);
console.log("SITE URL:", import.meta.env.VITE_SHAREPOINT_SITE_URL);
console.log("SITE ID:", import.meta.env.VITE_SHAREPOINT_SITE_ID);
console.log("FLOW URL:", import.meta.env.VITE_FLOW_SUBMIT_URL);
function LoginPage() {
  const { instance } = useMsal()

  function handleLogin() {
    instance.loginPopup(loginRequest).catch(console.error)
  }

  return (
    <div className="min-h-screen bg-bg-page flex items-center justify-center">
      <div className="bg-white border border-border-default rounded-card p-10 max-w-sm w-full text-center shadow-sm">
        <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-lg">Q</span>
        </div>
        <h1 className="text-xl font-bold text-text-primary mb-1">Quandatics WFH Portal</h1>
        <p className="text-xs text-text-secondary mb-6">
          Sign in with your Quandatics Microsoft 365 account to access the Work From Home request system.
        </p>
        <button
          onClick={handleLogin}
          className="w-full bg-primary text-white rounded-btn py-3 text-sm font-semibold hover:bg-primary-dark transition-colors"
        >
          Sign in with Microsoft
        </button>
        <p className="text-[10px] text-text-muted mt-4">
          Uses your existing quandatics.com credentials — no separate login required.
        </p>
      </div>
    </div>
  )
}

// ─── App Shell (authenticated) ─────────────────────────────────────────────

function AppShell() {
  const { loading, error } = useApp()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-page flex items-center justify-center flex-col gap-3">
        <Spinner size="lg" />
        <p className="text-xs text-text-muted">Loading your WFH profile…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-page flex items-center justify-center">
        <div className="bg-white border border-red-200 rounded-card p-8 max-w-sm text-center">
          <div className="text-danger text-2xl mb-3">⚠</div>
          <h2 className="text-sm font-semibold text-text-primary mb-2">Unable to load</h2>
          <p className="text-xs text-text-secondary">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-bg-page overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewRequest />} />
          <Route path="/requests" element={<MyRequests />} />
  	  <Route path="/help" element={<Help />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────

function Root() {
  const { instance, accounts, inProgress } = useMsal();
  const [ssoAttempted, setSsoAttempted] = useState(false);

  // ✅ Always sync active account
  useEffect(() => {
    if (accounts.length > 0) {
      instance.setActiveAccount(accounts[0]);
    }
  }, [accounts, instance]);

  // ✅ Handle redirect login result (VERY IMPORTANT)
  useEffect(() => {
    instance.handleRedirectPromise().then((response) => {
      if (response?.account) {
        instance.setActiveAccount(response.account);
      }
    });
  }, [instance]);

  // ✅ SSO / login flow
  useEffect(() => {
    if (
      inProgress !== InteractionStatus.None ||
      accounts.length > 0 ||
      ssoAttempted
    ) return;

    setSsoAttempted(true);

    instance
      .ssoSilent(loginRequest)
      .then((response) => {
        instance.setActiveAccount(response.account);
      })
      .catch(() => {
        instance.loginRedirect(loginRequest).catch(console.error);
      });
  }, [instance, accounts, inProgress, ssoAttempted]);

  return (
    <>
      <AuthenticatedTemplate>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <div className="min-h-screen bg-bg-page flex items-center justify-center flex-col gap-3">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-2">
            <span className="text-white font-bold text-lg">Q</span>
          </div>

          <p className="text-sm font-semibold text-text-primary">
            Quandatics WFH Portal
          </p>

          <p className="text-xs text-text-muted">
            Signing in with your Microsoft 365 account…
          </p>

          <Spinner size="lg" />
        </div>
      </UnauthenticatedTemplate>
    </>
  );
}

export default function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </MsalProvider>
  )
}
