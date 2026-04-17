import { IPublicClientApplication } from '@azure/msal-browser'
import { loginRequest, GRAPH_BASE, SP_SITE_ID, LIST_NAMES } from '../config/auth'
import { format } from 'date-fns'
import type {
  Employee, Project, PolicyRule, WFHRequest,
  Subsidiary, Department, EmployeeGroup,
  RequestType, RequestStatus, ApprovalRoute,
  QuarterPeriod, WFHDay, ExceptionReasonType
} from '../types'

// ─── Token Helper ──────────────────────────────────────────────────────────

async function getToken(msalInstance: IPublicClientApplication): Promise<string> {
  const accounts = msalInstance.getAllAccounts()
  if (!accounts.length) throw new Error('No authenticated account found')
  const result = await msalInstance.acquireTokenSilent({
    ...loginRequest,
    account: accounts[0],
  })
  return result.accessToken
}

async function graphFetch(
  msalInstance: IPublicClientApplication,
  url: string,
  options: RequestInit = {}
): Promise<any> {
  const token = await getToken(msalInstance)
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Graph API error ${res.status}: ${err}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ─── List URL Helper ───────────────────────────────────────────────────────

function listUrl(listName: string): string {
  return `${GRAPH_BASE}/sites/${SP_SITE_ID}/lists/${listName}/items`
}

function listItemUrl(listName: string, itemId: string): string {
  return `${GRAPH_BASE}/sites/${SP_SITE_ID}/lists/${listName}/items/${itemId}`
}

// ─── Paginated fetch — handles lists with >100 items ──────────────────────
// Fetches all pages and returns the combined value array.
// Used instead of server-side $filter on non-indexed columns.

async function fetchAllItems(
  msal: IPublicClientApplication,
  baseUrl: string
): Promise<any[]> {
  const all: any[] = []
  let url: string | null = baseUrl
  while (url) {
    const data = await graphFetch(msal, url)
    all.push(...(data.value ?? []))
    url = data['@odata.nextLink'] ?? null
  }
  return all
}

async function getUserName(msal: IPublicClientApplication, email?: string) {
  if (!email) return ''

  const token = await msal.acquireTokenSilent({
    scopes: ['User.Read']
  })

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${email}`, {
    headers: {
      Authorization: `Bearer ${token.accessToken}`
    }
  })

  const data = await res.json()
  return data.displayName || ''
}

// ─── WFH_Policy ────────────────────────────────────────────────────────────

export async function fetchPolicies(msal: IPublicClientApplication): Promise<PolicyRule[]> {
  // Small list (~13 rows) — fetch all, no filter needed
  const url = `${listUrl(LIST_NAMES.POLICY)}?expand=fields&$top=100`
  const data = await graphFetch(msal, url)
  return data.value.map((item: any): PolicyRule => ({
    id: item.id,
    policyKey: item.fields.Title ?? '',
    policyValue: item.fields.PolicyValue ?? '',
    appliesTo: item.fields.AppliesTo ?? 'All',
    description: item.fields.Description ?? '',
    isActive: item.fields.IsActive ?? true,
  }))
}

// ─── WFH_Projects ──────────────────────────────────────────────────────────

export async function fetchProjects(msal: IPublicClientApplication): Promise<Project[]> {
  // IsActive is a Yes/No (boolean) column — safe to filter server-side as it
  // is always indexed by SharePoint. Fetch all active projects.
  const url = `${listUrl(LIST_NAMES.PROJECTS)}?expand=fields&$top=100`
  const items = await fetchAllItems(msal, url)
  return items
    .filter((item: any) => item.fields.IsActive !== false)
    .map((item: any): Project => ({
      id: item.id,
      projectCode: item.fields.Title ?? '',
      projectName: item.fields.ProjectName ?? '',
      projectManagerEmail: item.fields.ProjectManagerEmail ?? '',
      projectManagerName: item.fields.ProjectManager?.DisplayName ?? item.fields.ProjectManagerEmail?.split('@')[0] ?? '',
      techLeadEmail: item.fields.TechLeadEmail ?? '',
      techLeadName: await getUserName(msal, item.fields.TechLeadEmail),
      ctoEmail: item.fields.CTOEmail ?? '',
      ctoName: item.fields.CTO?.LookupValue ?? item.fields.CTOEmail?.split('@')[0] ?? '',
      isActive: item.fields.IsActive ?? true,
    }))
}

// ─── WFH_Employees ─────────────────────────────────────────────────────────
//
// WHY NO SERVER-SIDE FILTER:
// The Email column in WFH_Employees is a plain-text column and is NOT indexed
// by default in SharePoint. Filtering on non-indexed columns via the Graph API
// returns a 400 error: "Field cannot be referenced in filter or orderby as it
// is not indexed."
//
// FIX: Fetch all employee rows (small list, typically <100) and filter
// client-side by email. This is reliable regardless of indexing.
//
// OPTIONAL PERMANENT FIX: In SharePoint → WFH_Employees → List settings →
// Indexed columns → Add the Email column as an index. Once indexed, the
// server-side filter will work. The code below is safe either way.

export async function fetchEmployeeByEmail(
  msal: IPublicClientApplication,
  email: string
): Promise<Employee | null> {
  // Fetch all active employees (no server-side filter on Email)
  const url = `${listUrl(LIST_NAMES.EMPLOYEES)}?expand=fields&$top=500`
  const items = await fetchAllItems(msal, url)

  // Filter client-side — case-insensitive email match
  const match = items.find(
    (item: any) =>
      (item.fields.Email ?? '').toLowerCase() === email.toLowerCase() &&
      item.fields.IsActive !== false
  )

  if (!match) return null
  const f = match.fields
  return {
    id: match.id,
    displayName: f.Title ?? '',
    email: f.Email ?? '',
    subsidiary: (f.Subsidiary ?? 'QSS') as Subsidiary,
    employeeGroup: (f.EmployeeGroup ?? 'General') as EmployeeGroup,
    department: (f.Department ?? 'Finance') as Department,
    managerEmail: f.ManagerEmail ?? '',
    joinDate: f.JoinDate ?? undefined,
    projectCode: f.ProjectCode ?? undefined,
    isActive: f.IsActive ?? true,
  }
}

export async function patchEmployee(
  msal: IPublicClientApplication,
  itemId: string,
  fields: Record<string, any>
): Promise<void> {
  await graphFetch(msal, listItemUrl(LIST_NAMES.EMPLOYEES, itemId), {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  })
}

// ─── WFH_Requests ──────────────────────────────────────────────────────────

function mapRequestItem(item: any): WFHRequest {
  const f = item.fields
  return {
    id: item.id,
    requestID: f.Title ?? '',
    employeeID: f.EmployeeID ?? '',
    employeeGroup: (f.EmployeeGroup ?? 'General') as EmployeeGroup,
    requestType: (f.RequestType ?? 'AdHoc') as RequestType,
    status: (f.Status ?? 'Pending') as RequestStatus,
    wfhDays: f.WFH_Days ? (f.WFH_Days as string).split(';').filter(Boolean) as WFHDay[] : undefined,
    quarterPeriod: (f.QuarterPeriod ?? undefined) as QuarterPeriod | undefined,
    startDate: f.StartDate ? format(new Date(f.StartDate), 'yyyy-MM-dd') : undefined,
    endDate: f.EndDate ? format(new Date(f.EndDate), 'yyyy-MM-dd') : undefined,
    submittedOn: f.SubmittedOn ?? '',
    lateSubmission: f.LateSubmission ?? false,
    justification: f.Justification ?? undefined,
    isException: f.IsException ?? false,
    exceptionReasonType: (f.ExceptionReasonType ?? undefined) as ExceptionReasonType | undefined,
    exceptionReasonDetail: f.ExceptionReasonDetail ?? undefined,
    managerNote: f.ManagerNote ?? undefined,
    approvalRoute: (f.ApprovalRoute ?? 'LineManager') as ApprovalRoute,
    approverEmail: f.ApproverEmail ?? undefined,
    projectCodes: f.ProjectCodes ?? undefined,
    projectManagerEmails: f.ProjectManagerEmails ?? undefined,
    techLeadEmails: f.TechLeadEmails ?? undefined,
    ctoEmail: f.CTOEmail ?? undefined,
    approvalOutcome: f.ApprovalOutcome ?? undefined,
    approvalComment: f.ApprovalComment ?? undefined,
    approvedOn: f.ApprovedOn ?? undefined,
    approvalID: f.ApprovalID ?? undefined,
    l1PMOutcome: f.L1_PMOutcome ?? undefined,
    l1TLOutcome: f.L1_TLOutcome ?? undefined,
    l1RejectedBy: f.L1_RejectedBy ?? undefined,
    l2CTOOutcome: f.L2_CTOOutcome ?? undefined,
  }
}

// WHY NO SERVER-SIDE FILTER on EmployeeID:
// Same reason as Email above — EmployeeID is a plain-text column and not
// indexed by default. Filtering on it returns a 400 error.
//
// FIX: Fetch all requests for $top=500, sort by SubmittedOn descending,
// filter client-side by employeeID (email).
//
// OPTIONAL PERMANENT FIX: Index the EmployeeID column in SharePoint →
// WFH_Requests → List settings → Indexed columns. The code below works
// either way.

export async function fetchMyRequests(
  msal: IPublicClientApplication,
  email: string
): Promise<WFHRequest[]> {
  // Fetch all requests — sort by SubmittedOn desc server-side using the
  // built-in Created column which is always indexed, then filter client-side
  const url = `${listUrl(LIST_NAMES.REQUESTS)}?expand=fields&$orderby=fields/Created desc&$top=500`
  const items = await fetchAllItems(msal, url)

  console.log('abc:', items[0]?.fields)
  return items
    .filter(
      (item: any) =>
        (item.fields.EmployeeID ?? '').toLowerCase() === email.toLowerCase()
    )
    .map(mapRequestItem)
}

export async function createRequest(
  msal: IPublicClientApplication,
  fields: Record<string, any>
): Promise<WFHRequest> {
  const data = await graphFetch(msal, listUrl(LIST_NAMES.REQUESTS), {
    method: 'POST',
    body: JSON.stringify({ fields }),
  })
  return mapRequestItem(data)
}

export async function updateRequest(
  msal: IPublicClientApplication,
  itemId: string,
  fields: Record<string, any>
): Promise<void> {
  await graphFetch(msal, listItemUrl(LIST_NAMES.REQUESTS, itemId), {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  })
}

// ─── Power Automate Trigger ────────────────────────────────────────────────

export async function triggerSubmitFlow(
  msal: IPublicClientApplication,
  requestId: string,
  spItemId: string
): Promise<void> {
  const token = await getToken(msal)
  const flowUrl = import.meta.env.VITE_FLOW_SUBMIT_URL
  if (!flowUrl) {
    console.warn('VITE_FLOW_SUBMIT_URL not set — skipping Power Automate trigger')
    return
  }
  await fetch(flowUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId,
      spItemId,
      submittedBy: token ? 'authenticated' : 'unknown',
    }),
  })
}
