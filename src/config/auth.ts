import { Configuration, PopupRequest } from '@azure/msal-browser'

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}

// Scopes required for Microsoft Graph API + SharePoint
export const loginRequest: PopupRequest = {
  scopes: [
    'openid',
    'profile',
    'email',
    'User.Read',
    'Sites.ReadWrite.All',
    'offline_access',
  ],
}

// Graph API base URL
export const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

// SharePoint site
export const SP_SITE_URL = import.meta.env.VITE_SHAREPOINT_SITE_URL as string
export const SP_SITE_ID = import.meta.env.VITE_SHAREPOINT_SITE_ID as string

// List names — must match exactly what's in SharePoint
export const LIST_NAMES = {
  POLICY: 'WFH_Policy',
  PROJECTS: 'WFH_Projects',
  EMPLOYEES: 'WFH_Employees',
  REQUESTS: 'WFH_Requests',
} as const

// Power Automate HTTP trigger URLs
export const FLOW_URLS = {
  SUBMIT: import.meta.env.VITE_FLOW_SUBMIT_URL as string,
} as const
