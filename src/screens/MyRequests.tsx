import { useState, useMemo } from 'react'
import { useMsal } from '@azure/msal-react'
import { useApp } from '../contexts/AppContext'
import { StatusBadge, PageHeader, Button, EmptyState, Alert } from '../components/UI'
import { formatDate, formatDateTime, formatPeriod, formatWFHDays } from '../utils/dates'
import { updateRequest } from '../services/graph'
import { useNavigate } from 'react-router-dom'
import type { WFHRequest, RequestStatus, TimelineStep } from '../types'

type Filter = 'All' | 'Active' | 'Past'
const ACTIVE_STATUSES: RequestStatus[] = ['Pending', 'Approved']
const PAST_STATUSES: RequestStatus[] = ['Completed', 'Rejected', 'Cancelled']

export function MyRequests() {
  const navigate = useNavigate()
  const { instance } = useMsal()
  const { myRequests, refreshRequests } = useApp()
  const [filter, setFilter] = useState<Filter>('All')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => myRequests.filter(r => {
    if (filter === 'Active') return ACTIVE_STATUSES.includes(r.status)
    if (filter === 'Past') return PAST_STATUSES.includes(r.status)
    return true
  }), [myRequests, filter])

  async function handleWithdraw(r: WFHRequest) {
    if (!window.confirm('Withdraw this request?')) return
    await updateRequest(instance, r.id, { Status: 'Cancelled' })
    await refreshRequests()
    setExpandedId(null)
  }

  return (
    <div className="p-6">
      <PageHeader title="My Requests" subtitle="All your WFH submissions" />
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['All', 'Active', 'Past'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs border transition-all
                ${filter === f
                  ? 'bg-primary text-white border-primary font-semibold'
                  : 'bg-white text-text-secondary border-border-default hover:border-primary'}`}>
              {f}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => navigate('/new')}>+ New Request</Button>
      </div>
      <div className="bg-white border border-border-default rounded-card overflow-hidden shadow-sm">
        {filtered.length === 0
          ? <EmptyState message={filter === 'Active' ? 'No active requests.' : filter === 'Past' ? 'No past requests.' : 'No requests yet.'} />
          : filtered.map(r => (
            <RequestItem key={r.id} request={r}
              isOpen={expandedId === r.id}
              onToggle={() => setExpandedId(prev => prev === r.id ? null : r.id)}
              onWithdraw={() => handleWithdraw(r)}
              onResubmit={() => navigate('/new')} />
          ))
        }
      </div>
    </div>
  )
}

function RequestItem({ request: r, isOpen, onToggle, onWithdraw, onResubmit }:
  { request: WFHRequest; isOpen: boolean; onToggle: () => void; onWithdraw: () => void; onResubmit: () => void }) {
  const isRec = r.requestType === 'Recurring'
  const title = isRec
    ? `Recurring · ${r.quarterPeriod?.replace(/-/g, ' ')} · ${formatWFHDays(r.wfhDays)}`
    : `Ad hoc · ${r.startDate ? formatDate(r.startDate) : '—'}`
  const subtitle = isRec
    ? formatPeriod(r.startDate, r.endDate)
    : [r.projectCodes, r.managerNote].filter(Boolean).join(' · ')
  const timeline = buildTimeline(r)

  return (
    <div className={`border-b border-border-light last:border-0 ${isOpen ? 'bg-bg-surface' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg-surface transition-colors" onClick={onToggle}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0
          ${isRec ? 'bg-primary-light text-primary' : 'bg-success-light text-success'}`}>
          {isRec ? 'REC' : 'AD'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-text-primary truncate">
            {title}
            <span className={`ml-2 text-[10px] text-text-muted inline-block transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5 truncate">{subtitle}</div>
          <div className="text-[10px] text-text-muted mt-0.5">Submitted {r.submittedOn ? formatDate(r.submittedOn) : '—'}</div>
        </div>
        <StatusBadge status={r.status} />
      </div>

      {isOpen && (
        <div className="px-4 pb-4 pt-3 border-t border-border-light bg-bg-surface">
          {/* Detail grid */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <DetailCell label="Reference" value={r.requestID || r.id} />
            <DetailCell label="Type" value={isRec ? 'Recurring' : 'Ad hoc'} />
            {isRec ? (
              <>
                <DetailCell label="Quarter" value={r.quarterPeriod?.replace(/-/g, ' ') || '—'} />
                <DetailCell label="WFH days" value={formatWFHDays(r.wfhDays)} />
                <DetailCell label="Period" value={formatPeriod(r.startDate, r.endDate)} span={2} />
                <DetailCell label="Submitted" value={r.submittedOn ? formatDateTime(r.submittedOn) : '—'} span={2} />
              </>
            ) : (
              <>
                <DetailCell label="Date" value={r.startDate ? formatDate(r.startDate) : '—'} />
                <DetailCell label="Submitted" value={r.submittedOn ? formatDateTime(r.submittedOn) : '—'} />
                {r.projectCodes && <DetailCell label="Projects" value={r.projectCodes} span={2} />}
                {r.managerNote && <DetailCell label="Reason" value={r.managerNote} span={2} />}
              </>
            )}
            <DetailCell label="Route" value={
              r.approvalRoute === 'LineManager' ? 'Line Manager'
              : r.approvalRoute === 'QAW_Recurring' ? 'CTO (QAW Recurring)'
              : 'PM + TL → CTO'} span={2} />
          </div>

          {/* Rejection note */}
          {r.status === 'Rejected' && r.approvalComment && (
            <div className="bg-danger-light border border-red-200 rounded-lg p-3 mb-3">
              <div className="text-xs font-semibold text-danger mb-1">Rejection reason</div>
              <p className="text-xs text-text-primary">"{r.approvalComment}"</p>
              {r.l1RejectedBy && <p className="text-[10px] text-text-muted mt-1">Rejected by: {r.l1RejectedBy}</p>}
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white border border-border-light rounded-lg p-3 mb-3">
            <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-3">Approval timeline</div>
            {timeline.map((step, i) => (
              <div key={i}>
                {i > 0 && <div className="w-px h-3 bg-border-default ml-2.5 my-1" />}
                <div className="flex items-start gap-2.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5
                    ${step.status === 'done' ? 'bg-success-light text-success'
                    : step.status === 'rejected' ? 'bg-danger-light text-danger'
                    : 'bg-warning-light text-warning'}`}>
                    {step.status === 'done' ? '✓' : step.status === 'rejected' ? '✕' : '…'}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-text-primary">{step.label}</div>
                    <div className="text-[10px] text-text-secondary mt-0.5">{step.sublabel}</div>
                    {step.comment && <div className="text-[10px] text-text-secondary mt-1 italic">"{step.comment}"</div>}
                  </div>
                  {step.timestamp && <div className="text-[10px] text-text-muted flex-shrink-0">{step.timestamp}</div>}
                </div>
              </div>
            ))}
          </div>

          {r.status === 'Approved' && (
            <Alert variant="warning">Reminder: physical meetings require office attendance regardless of this approval.</Alert>
          )}

          <div className="flex gap-2 mt-3 pt-3 border-t border-border-light">
            {r.status === 'Pending' && (
              <button onClick={e => { e.stopPropagation(); onWithdraw() }}
                className="bg-white text-danger border border-red-300 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-danger-light cursor-pointer">
                Withdraw request
              </button>
            )}
            {r.status === 'Rejected' && (
              <button onClick={e => { e.stopPropagation(); onResubmit() }}
                className="bg-white text-text-secondary border border-border-default rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-bg-page cursor-pointer">
                Resubmit for another date
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DetailCell({ label, value, span = 1 }: { label: string; value: string; span?: number }) {
  return (
    <div className={`bg-white border border-border-light rounded-lg p-2.5 col-span-${span}`}>
      <div className="text-[10px] text-text-muted mb-1">{label}</div>
      <div className="text-xs font-semibold text-text-primary">{value}</div>
    </div>
  )
}

function buildTimeline(r: WFHRequest): TimelineStep[] {
  const steps: TimelineStep[] = []
  steps.push({ label: 'Submitted', sublabel: 'Request created via Quandatics WFH Portal', status: 'done', timestamp: r.submittedOn ? formatDateTime(r.submittedOn) : undefined })
  if (r.approvalRoute === 'QAW_AdHoc') {
    const l1Done = r.l1PMOutcome === 'Approved' && r.l1TLOutcome === 'Approved'
    const l1Rejected = r.status === 'Rejected' && !!r.l1RejectedBy
    steps.push({
      label: l1Rejected ? 'L1 — rejected (first rejection wins)' : l1Done ? 'L1 — all PMs and Tech Leads approved' : 'L1 — awaiting PM and Tech Lead approvals',
      sublabel: l1Rejected ? `Rejected by: ${r.l1RejectedBy}` : r.projectCodes ? `Projects: ${r.projectCodes}` : 'All approvers notified via Teams',
      status: l1Rejected ? 'rejected' : l1Done ? 'done' : 'pending',
      comment: l1Rejected ? r.approvalComment : undefined,
    })
    if (!l1Rejected) steps.push({
      label: r.l2CTOOutcome === 'Approved' ? 'CTO approved' : r.l2CTOOutcome === 'Rejected' ? 'CTO rejected' : 'Awaiting CTO approval (L2)',
      sublabel: l1Done ? 'Final approval' : 'Only reached once all L1 approvals granted',
      status: r.l2CTOOutcome === 'Approved' ? 'done' : r.l2CTOOutcome === 'Rejected' ? 'rejected' : 'pending',
      timestamp: r.approvedOn ? formatDateTime(r.approvedOn) : undefined,
      comment: r.approvalComment,
    })
  } else {
    const lbl = r.approvalRoute === 'QAW_Recurring' ? 'CTO' : 'Line Manager'
    steps.push({
      label: r.approvalOutcome === 'Approved' ? `${lbl} approved` : r.approvalOutcome === 'Rejected' ? `${lbl} rejected` : `Awaiting ${lbl} approval`,
      sublabel: r.approverEmail || 'Notified via Microsoft Teams Approvals',
      status: r.approvalOutcome === 'Approved' ? 'done' : r.approvalOutcome === 'Rejected' ? 'rejected' : 'pending',
      timestamp: r.approvedOn ? formatDateTime(r.approvedOn) : undefined,
      comment: r.approvalComment,
    })
  }
  if (r.status === 'Completed') steps.push({ label: 'Quarter completed', sublabel: 'Auto-marked completed by the system', status: 'done' })
  return steps
}
