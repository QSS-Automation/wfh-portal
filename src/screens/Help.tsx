import { useState, useRef } from 'react'

type Section = 'user-guide' | 'policy' | 'faq'

const TOC: { id: Section; label: string }[] = [
  { id: 'user-guide', label: 'User Guide' },
  { id: 'policy',     label: 'Policy' },
  { id: 'faq',        label: 'FAQ' },
]

export function Help() {
  const [active, setActive] = useState<Section>('user-guide')
  const contentRef = useRef<HTMLDivElement>(null)

  function scrollTo(id: Section) {
    setActive(id)
    const el = document.getElementById(id)
    if (el && contentRef.current) {
      contentRef.current.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' })
    }
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* TOC */}
      <div className="w-36 flex-shrink-0 border-r border-border-default py-4 overflow-y-auto">
        <div className="px-3 py-1 text-[10px] font-semibold text-text-muted tracking-widest uppercase mb-1">
          Contents
        </div>
        {TOC.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => scrollTo(id)}
            className={`w-full text-left px-3 py-2 text-xs border-l-2 transition-colors
              ${active === id
                ? 'text-primary font-semibold border-primary bg-primary-light'
                : 'text-text-secondary border-transparent hover:bg-bg-page hover:text-text-primary'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-5">

        <div className="mb-5">
          <h1 className="text-xl font-bold text-text-primary">User Manual &amp; Policy</h1>
          <p className="text-[11px] text-text-muted mt-0.5">Version 1.0 · April 2026</p>
        </div>

        {/* ── USER GUIDE ── */}
        <div id="user-guide" className="mb-7">
          <div className="text-sm font-semibold text-text-primary border-b border-border-light pb-2 mb-4">
            User Guide
          </div>

          <SubHead>What is the WFH Portal?</SubHead>
          <p className="text-xs text-text-secondary leading-relaxed mb-3">
            The Quandatics WFH Portal is where you submit, track, and manage your Work From Home requests.
            All requests must go through this portal — requests via WhatsApp, email, or verbally are not valid.
            Sign in automatically with your Quandatics M365 account.
          </p>

          <SubHead>Your employee group</SubHead>
          <p className="text-xs text-text-secondary leading-relaxed mb-2">
            You are assigned to one of two groups by HR. Your group determines your permitted WFH days and approval route.
            Check the bottom of the sidebar to see your group.
          </p>
          <ManualTable
            headers={['', 'General Group', 'QAW Group']}
            rows={[
              ['Who', 'Non-QAW subsidiaries', 'QAW subsidiary'],
              ['Permitted WFH days', 'Any weekday, up to 2 per week', 'Tuesday and/or Thursday only'],
              ['Recurring approved by', 'Line Manager', 'CTO'],
              ['Ad hoc approved by', 'Line Manager', 'PM + TL → CTO'],
            ]}
          />

          <SubHead>The dashboard</SubHead>
          <p className="text-xs text-text-secondary leading-relaxed mb-2">
            Shows WFH days this month, pending approvals, total approved, and a 3-month calendar.
            Green = approved recurring, yellow = approved ad hoc, blue = office day.
          </p>
          <InfoBanner>The calendar only shows <strong>approved</strong> requests. Pending requests appear after approval.</InfoBanner>

          <SubHead>Submitting a recurring request</SubHead>
          <Steps items={[
            <>Click <strong>New Request</strong> → select <strong>Recurring</strong> tab</>,
            <>Choose a quarter. If deadline passed, select a late submission reason.</>,
            <>Select WFH days. General: 1–2 days Mon–Fri. QAW: Tue &amp; Thu pre-selected. To change selection, deselect first before selecting a new day.</>,
            <>Add optional note → <strong>Review &amp; Submit</strong> → <strong>Confirm &amp; Submit</strong></>,
          ]} />
          <ManualTable
            headers={['Quarter', 'Period', 'Submit by']}
            rows={[
              ['Q1', '1 Jan – 31 Mar', '15 December'],
              ['Q2', '1 Apr – 30 Jun', '15 March'],
              ['Q3', '1 Jul – 30 Sep', '15 June'],
              ['Q4', '1 Oct – 31 Dec', '15 September'],
            ]}
          />

          <SubHead>Submitting an ad hoc request</SubHead>
          <Steps items={[
            <>Click <strong>New Request</strong> → select <strong>Ad hoc</strong> tab</>,
            <>Pick a date (weekdays only). QAW: must be Tue or Thu. Less than 2 business days ahead requires a written justification.</>,
            <><strong>[QAW only]</strong> Select project(s) — all PMs and TLs from selected projects will be notified.</>,
            <>Enter a reason → optional note → <strong>Review &amp; Submit</strong> → <strong>Confirm &amp; Submit</strong></>,
          ]} />

          <p className="text-xs text-text-secondary mb-2 mt-3"><strong>QAW ad hoc approval chain:</strong></p>
          <ApprovalChainDiagram />

          <SubHead>Tracking requests</SubHead>
          <p className="text-xs text-text-secondary leading-relaxed mb-3">
            Go to <strong>My Requests</strong>. Filter by All, Active, or Past. Click any row to expand —
            full details, approval timeline (✓ approved / ✕ rejected / … pending), and rejection reason if applicable.
          </p>

          <SubHead>Withdrawing or cancelling</SubHead>
          <p className="text-xs text-text-secondary leading-relaxed">
            You can withdraw a <strong>Pending</strong> request or cancel an <strong>Approved</strong> request
            from My Requests. Expand the request, click <strong>Withdraw request</strong> or <strong>Cancel request</strong>,
            then confirm. Your approver will be notified.
          </p>
        </div>

        {/* ── POLICY ── */}
        <div id="policy" className="mb-7">
          <div className="text-sm font-semibold text-text-primary border-b border-border-light pb-2 mb-4">
            Policy
          </div>
          <WarnBanner><strong>Physical meetings override WFH.</strong> You must attend the office if a meeting or client visit is scheduled on your approved WFH day.</WarnBanner>
          <ul className="mt-3 space-y-2">
            {[
              <><strong>One recurring request per quarter.</strong> No overlapping arrangements.</>,
              <><strong>Ad hoc limit.</strong> Maximum 1 per calendar month. Form locks when reached.</>,
              <><strong>QAW days are fixed.</strong> Only Tuesday and Thursday are covered under this policy.</>,
              <><strong>Portal only.</strong> Requests not submitted through the portal are not valid.</>,
              <><strong>Late submissions</strong> require a stated reason and are subject to approver discretion.</>,
            ].map((item, i) => (
              <li key={i} className="flex gap-2 text-xs text-text-secondary leading-relaxed">
                <span className="text-text-muted mt-0.5">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── FAQ ── */}
        <div id="faq" className="mb-7">
          <div className="text-sm font-semibold text-text-primary border-b border-border-light pb-2 mb-4">
            FAQ
          </div>
          {[
            ['My approver hasn\'t responded. What should I do?', 'Follow up directly — they received a Teams Approvals notification. If no response after 2 working days, contact them.'],
            ['I selected the wrong days. Can I edit my request?', 'No — submitted requests cannot be edited. Withdraw and resubmit with the correct details.'],
            ['My request is Pending but not on the calendar.', 'The calendar only shows approved requests. It will appear once approved.'],
            ['The ad hoc form is locked.', 'You\'ve reached the monthly limit of 1 ad hoc request. You can submit again from the 1st of next month.'],
            ['[QAW] Do I need to select projects for a recurring request?', 'No. Recurring requests go straight to the CTO — no project selection needed.'],
            ['[QAW] One of my PMs rejected. Can I appeal?', 'No appeal process in the portal. Speak directly with your PM, then resubmit.'],
            ['My name or group is wrong.', 'Contact HR — your employee record needs to be updated.'],
            ['I can\'t log in / portal shows an error.', 'Contact the BTO team for technical support.'],
          ].map(([q, a]) => (
            <div key={q} className="mb-4">
              <div className="text-xs font-semibold text-text-primary mb-1">{q}</div>
              <div className="text-xs text-text-secondary leading-relaxed">{a}</div>
            </div>
          ))}
        </div>

        <div className="border-t border-border-light pt-3 text-[11px] text-text-muted">
          Profile or record issues → contact HR &nbsp;·&nbsp; Technical issues → contact BTO team
        </div>

      </div>
    </div>
  )
}

// ─── Small helper components ───────────────────────────────────────────────

function SubHead({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-text-primary mt-4 mb-1.5">{children}</div>
}

function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-primary-light border-l-2 border-primary rounded-r-lg px-3 py-2 text-xs text-primary leading-relaxed mb-3">
      {children}
    </div>
  )
}

function WarnBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-warning-light border-l-2 border-warning rounded-r-lg px-3 py-2 text-xs text-warning leading-relaxed">
      {children}
    </div>
  )
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5 mb-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 items-start text-xs text-text-secondary leading-relaxed">
          <span className="w-4 h-4 rounded-full bg-primary-light text-primary text-[9px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
            {i + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  )
}

function ManualTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="border border-border-light rounded-lg overflow-hidden mb-3 text-xs">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 text-[10px] font-semibold text-text-muted bg-bg-page border-b border-border-light">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border-light last:border-0">
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-2 text-text-secondary leading-relaxed ${j === 0 ? 'font-semibold text-text-primary' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ApprovalChainDiagram() {
  return (
    <div className="mb-3">
      <div className="border border-border-default rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-bg-page border-b border-border-light">
          <span className="text-[10px] font-semibold bg-primary-light text-primary px-2 py-0.5 rounded-full">Level 1</span>
          <span className="text-xs font-semibold text-text-primary">Project Manager &amp; Tech Lead</span>
          <span className="text-[10px] text-text-muted ml-auto">all notified in parallel</span>
        </div>
        <div className="flex flex-wrap gap-2 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] text-text-secondary border border-border-light rounded-md px-2 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
            Project Manager (per project)
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-text-secondary border border-border-light rounded-md px-2 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0" />
            Tech Lead (per project)
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 py-1.5 px-4">
        <div className="flex-1 h-px bg-border-default max-w-[60px]" />
        <span className="text-[10px] text-text-muted">↓ all must approve to proceed</span>
        <div className="flex-1 h-px bg-border-default max-w-[60px]" />
      </div>
      <div className="border border-border-default rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-bg-page">
          <span className="text-[10px] font-semibold bg-success-light text-success px-2 py-0.5 rounded-full">Level 2</span>
          <span className="text-xs font-semibold text-text-primary">CTO</span>
          <span className="text-[10px] text-text-muted ml-auto">final approval</span>
        </div>
      </div>
      <p className="text-[11px] text-text-muted mt-1.5">If any Level 1 approver rejects, the request is rejected immediately — CTO is not notified.</p>
    </div>
  )
}