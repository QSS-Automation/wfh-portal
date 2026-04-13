# Quandatics WFH Portal

React + TypeScript web app for managing Work From Home requests.
Authenticates via Azure AD, reads/writes data via Microsoft Graph API to SharePoint lists,
and triggers Power Automate flows for approvals.

---

## Prerequisites

- Node.js 18+ installed on your machine ([nodejs.org](https://nodejs.org))
- Access to Quandatics Microsoft 365 admin centre
- Access to Azure Portal ([portal.azure.com](https://portal.azure.com))
- GitHub account (for deployment)

---

## Step 1 — Create SharePoint Lists

Go to: `https://quandatics.sharepoint.com/sites/QuandaticsPortal-Admin`

Create these 4 lists **in order**. Full column definitions are in the SharePoint Schema document.

1. `WFH_Policy` — enter all 13 seed rows after creating
2. `WFH_Projects` — one row per active QAW project
3. `WFH_Employees` — one row per employee
4. `WFH_Requests` — leave empty (app writes to this)

**Get the Site ID** — you'll need it for `.env`:
```
https://graph.microsoft.com/v1.0/sites/quandatics.sharepoint.com:/sites/QuandaticsPortal-Admin
```
Call this URL in Graph Explorer (https://developer.microsoft.com/en-us/graph/graph-explorer)
after signing in. Copy the `id` field from the response.

---

## Step 2 — Register Azure AD App

1. Go to [Azure Portal](https://portal.azure.com) → **Azure Active Directory** → **App registrations**
2. Click **New registration**
3. Fill in:
   - Name: `Quandatics WFH Portal`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: **Single-page application (SPA)** → `http://localhost:3000`
4. Click **Register**
5. Copy the **Application (client) ID** → this is `VITE_AZURE_CLIENT_ID`
6. Copy the **Directory (tenant) ID** → this is `VITE_AZURE_TENANT_ID`

### Add API Permissions
In your new app registration → **API permissions** → **Add a permission** → **Microsoft Graph**:

| Permission | Type |
|---|---|
| `User.Read` | Delegated |
| `Sites.ReadWrite.All` | Delegated |
| `offline_access` | Delegated |

Click **Grant admin consent for Quandatics**.

### Add redirect URIs for production
When you have your deployed URL, add it:
- **Authentication** → **Add URI** → `https://YOUR_DEPLOYED_URL`

---

## Step 3 — Set up Power Automate Flows

See the **Power Automate Logic** document for full step-by-step flow configuration.

Quick summary — create these 3 flows:
1. **WFH-Submit-Request** — trigger: HTTP request → sends M365 Approval → updates SharePoint
2. **WFH-Approval-Outcome** — trigger: M365 Approvals response → updates Status → notifies employee
3. **WFH-Mark-Completed** — trigger: daily schedule → marks expired requests as Completed

After creating Flow 1, copy its **HTTP POST URL** → this is `VITE_FLOW_SUBMIT_URL`

---

## Step 4 — Configure the App

```bash
# Clone or download this repository
cd quandatics-wfh

# Copy the env file
cp .env.example .env
```

Edit `.env` with your real values:

```env
VITE_AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_SHAREPOINT_SITE_URL=https://quandatics.sharepoint.com/sites/QuandaticsPortal-Admin
VITE_SHAREPOINT_SITE_ID=quandatics.sharepoint.com,xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx,xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_FLOW_SUBMIT_URL=https://prod-xx.westus.logic.azure.com/workflows/...
```

---

## Step 5 — Run Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open `http://localhost:3000` — you should see the Quandatics login page.
Sign in with your Quandatics M365 account.

### First time test checklist
- [ ] Login works — you're redirected to the dashboard
- [ ] Your employee record loads (name shows in sidebar)
- [ ] Policy values load (check browser console — no errors)
- [ ] Quarter selector shows correct quarters
- [ ] Can submit a recurring request — row appears in My Requests
- [ ] Power Automate flow triggers — approval appears in Teams
- [ ] Approver receives notification in Teams
- [ ] After approval — status updates to Approved in My Requests

---

## Step 6 — Deploy to Azure Static Web Apps

### Create the Static Web App
1. Go to [Azure Portal](https://portal.azure.com) → **Create a resource** → **Static Web App**
2. Fill in:
   - **Resource group**: Create new → `quandatics-wfh-rg`
   - **Name**: `quandatics-wfh`
   - **Plan type**: Free
   - **Region**: Southeast Asia (or closest to Malaysia)
   - **Source**: GitHub
3. Authorise GitHub → select your repo → branch: `main`
4. **Build details**:
   - Build preset: **Vite**
   - App location: `/`
   - Output location: `dist`
5. Click **Review + Create** → **Create**

Azure automatically creates a GitHub Actions workflow that deploys on every push to main.

### Add environment variables to Azure
In your Static Web App → **Configuration** → **Application settings**:

Add all 5 variables from your `.env` file.

### Get your deployed URL
After first deployment: **Overview** → copy the URL e.g. `https://quandatics-wfh.azurestaticapps.net`

### Update Azure AD redirect URI
Back in Azure AD → App registrations → your app → **Authentication**:
- Add redirect URI: `https://quandatics-wfh.azurestaticapps.net`

---

## Step 7 — Add as Microsoft Teams Tab

1. Go to [Teams Developer Portal](https://dev.teams.microsoft.com)
2. Click **Apps** → **Import app** → upload `teams/manifest.json`
3. Edit the manifest — replace all `YOUR_DEPLOYED_URL` placeholders with your real URL
4. Replace `YOUR_AZURE_CLIENT_ID` with your client ID
5. Upload two icon files (192x192 colour PNG + 32x32 outline PNG) named `icon-color.png` and `icon-outline.png`
6. Click **Preview in Teams** to test
7. Click **Publish** → **Publish to your org** when ready

Employees will find it in Teams → Apps → Built for Quandatics → WFH Portal.

---

## Project Structure

```
quandatics-wfh/
├── src/
│   ├── components/
│   │   ├── UI.tsx              # Shared UI components (Badge, Card, Button etc.)
│   │   ├── Sidebar.tsx         # Navigation sidebar
│   │   ├── RequestRow.tsx      # Reusable request list row
│   │   └── ApprovalChain.tsx   # Approval chain preview
│   ├── screens/
│   │   ├── Dashboard.tsx       # Screen 1 — home + upcoming list
│   │   ├── NewRequest.tsx      # Screen 2 — recurring + ad hoc form
│   │   ├── MyRequests.tsx      # Screen 3 — request history
│   │   └── RequestDetail.tsx   # Screen 4 — detail + timeline
│   ├── contexts/
│   │   └── AppContext.tsx      # Global state (user, policy, requests)
│   ├── services/
│   │   └── graph.ts            # All Microsoft Graph API calls
│   ├── config/
│   │   └── auth.ts             # MSAL + SharePoint config
│   ├── types/
│   │   └── index.ts            # All TypeScript interfaces
│   ├── utils/
│   │   ├── dates.ts            # Business days, quarter logic, formatters
│   │   └── validation.ts       # Form validation rules
│   ├── App.tsx                 # Router + auth wrapper
│   ├── main.tsx                # Entry point
│   └── index.css               # Tailwind base styles
├── public/
│   └── favicon.svg
├── teams/
│   └── manifest.json           # Teams app manifest
├── .env.example                # Environment variable template
├── staticwebapp.config.json    # Azure SWA routing
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## Key Business Rules Implemented

### Recurring WFH
- Fixed quarterly periods (Q1–Q4) — employees cannot pick custom dates
- Only current + next quarter shown — past quarters hidden
- Current quarter closed if already submitted (Pending/Approved)
- Deadline = 15th of preceding month — late submission triggers exception block
- Exception types: New joiner (no detail needed) / Missed deadline / Other (free text required)
- QAW group: Tue & Thu only
- General group: any 2 weekdays (enforced at 2-day max)
- Once approved, employee cannot withdraw (withdraw only works for Pending)

### Ad hoc WFH
- 1 request per calendar month — blocked with clear message if limit reached
- Min 2 business days lead time — below this, justification required
- Reason always mandatory
- QAW: must select project(s) — PM + TL from all selected projects approve in parallel, first rejection wins → CTO
- General: line manager only

### Approval routing
| Group | Type | Route |
|---|---|---|
| General | Recurring | Line Manager |
| General | Ad hoc | Line Manager |
| QAW | Recurring | CTO direct |
| QAW | Ad hoc | All PMs + TLs (parallel) → CTO |

---

## Troubleshooting

**"Your employee record was not found"**
→ Add the employee's row to WFH_Employees in SharePoint with their M365 email in the Email column.

**Login popup blocked**
→ Allow popups for localhost:3000 (or the deployed URL) in the browser.

**Graph API 401 Unauthorized**
→ Check that admin consent was granted for the API permissions in Azure AD.

**Graph API 403 Forbidden**
→ The user doesn't have permission to the SharePoint site. Add them as a Member in the site settings.

**Quarters not showing correctly**
→ Check that WFH_Policy has `Recurring_DeadlineDay = 15` entered correctly.

**Power Automate not triggering**
→ Verify `VITE_FLOW_SUBMIT_URL` is set correctly and the flow is turned on in Power Automate.

---

## Support

For technical issues with the app, contact your IT administrator.
For WFH policy questions, contact HR.
