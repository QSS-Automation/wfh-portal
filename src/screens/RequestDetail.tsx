import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useApp } from '../contexts/AppContext'
import { StatusBadge, Button, Alert, Spinner, Card, CardTitle } from '../components/UI'
import { formatDate, formatDateTime, formatPeriod, formatWFHDays } from '../utils/dates'
import { updateRequest } from '../services/graph'
import type { TimelineStep, WFHRequest } from '../types'

export function RequestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { instance } = useMsal()
  const { myRequests, refreshRequests } = useApp()

  const request = myRequests.find(r => r.id === id)

  const timeline = useMemo(() => buildTimeline(request), [request])

  async function handleWithdraw() {
    if (!request) return
    if (!window.confirm('Withdraw this request?')) return
    await updateRequest(instance, request.id, { Status: 'Cancelled' })
    await refreshRequests()
    navigate('/requests')
  }

  if (!request) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/requests')}>← Back</Button>
        <div className="mt-4 text-sm text-text-secondary">Request not found.</div>
      </div>
    )
  }

  const isRec = request.requestType === 'Recurring'

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <Button variant="ghost" size="sm" onClick={() => navigate('/requests')}>← Back</Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-text-primary">
            {isRec
              ? `Recurring WFH · ${request.quarterPeriod?.replace(/-/g, ' ')}`
              : `Ad hoc WFH · ${request.startDate ? formatDate(request.startDate) : '—'}`
            }
          </h1>
          <p className="text-xs text-text-muted mt-0.5">Ref: {request.requestID || request.id}</p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <DetailItem label="Type" value={isRec ? 'Recurring' : 'Ad hoc'} />
        {isRec ? (
          <>
            <DetailItem label="Quarter" value={request.quarterPeriod?.replace(/-/g, ' ') || '—'} />
            <DetailItem label="Period" value={formatPeriod(request.startDate, request.endDate)} span={2} />
            <DetailItem label="WFH days" value={formatWFHDays(request.wfhDays)} />
          </>
        ) : (
          <>
            <DetailItem label="Date" value={request.startDate ? formatDate(request.startDate) : '—'} />
            <DetailItem label="Reason" value={request.managerNote || '—'} span={2} />
            {request.projectCodes && (
              <DetailItem label="Projects" value={request.projectCodes} span={2} />
            )}
          </>
        )}
        <DetailItem label="Submitted" value={request.submittedOn ? formatDateTime(request.submittedOn) : '—'} span={2} />
        <DetailItem label="Approval route" value={
          request.approvalRoute === 'LineManager' ? 'Line Manager'
          : request.approvalRoute === 'QAW_Recurring' ? 'CTO (QAW Recurring)'
          : 'PM + TL → CTO (QAW Ad hoc)'
        } span={2} />
      </div>

      {/* Exception info */}
      {request.isException && (
        <Card className="mb-4">
          <CardTitle>Late / exception submission</CardTitle>
          <div className="text-xs text-text-secondary">
            <span className="font-medium">Reason: </span>{request.exceptionReasonType}
            {request.exceptionReasonDetail && (
              <p className="mt-1">{request.exceptionReasonDetail}</p>
            )}
          </div>
        </Card>
      )}

      {/* Rejection note */}
      {request.status === 'Rejected' && request.approvalComment && (
        <div className="bg-danger-light border border-red-200 rounded-xl p-3 mb-4">
          <div className="text-xs font-semibold text-danger mb-1">Rejection reason</div>
          <p className="text-xs text-text-primary">"{request.approvalComment}"</p>
          {request.l1RejectedBy && (
            <p className="text-[10px] text-text-muted mt-1">Rejected by: {request.l1RejectedBy}</p>
          )}
        </div>
      )}

      {/* Approval Timeline */}
      <Card className="mb-4">
        <CardTitle>Approval timeline</CardTitle>
        <div className="space-y-0">
          {timeline.map((step, i) => (
            <div key={i}>
              {i > 0 && <div className="w-px h-3 bg-border-default ml-2.5 my-1" />}
              <TimelineRow step={step} />
            </div>
          ))}
        </div>
      </Card>

      {/* Policy reminder */}
      {request.status === 'Approved' && (
        <Alert variant="warning">
          <strong>Reminder:</strong> Physical meetings on this WFH day require office attendance regardless of this approval.
        </Alert>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        {request.status === 'Pending' && request.requestType === 'Recurring' && (
          <Button variant="danger" onClick={handleWithdraw}>Withdraw request</Button>
        )}
        {request.status === 'Rejected' && (
          <Button variant="ghost" onClick={() => navigate('/new')}>Resubmit for another date</Button>
        )}
      </div>
    </div>
  )
}

// ─── Detail Item ───────────────────────────────────────────────────────────

function DetailItem({ label, value, span = 1 }: { label: string; value: string; span?: number }) {
  return (
    <div className={`bg-bg-surface border border-border-light rounded-lg p-2.5 col-span-${span}`}>
      <div className="text-[10px] text-text-muted mb-1">{label}</div>
      <div className="text-xs font-medium text-text-primary">{value}</div>
    </div>
  )
}

// ─── Timeline Row ──────────────────────────────────────────────────────────

function TimelineRow({ step }: { step: TimelineStep }) {
  const dotStyle = {
    done:     'bg-success-light text-success',
    pending:  'bg-warning-light text-warning',
    rejected: 'bg-danger-light text-danger',
  }[step.status]

  const dotIcon = { done: '✓', pending: '…', rejected: '✕' }[step.status]

  return (
    <div className="flex items-start gap-2.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5 ${dotStyle}`}>
        {dotIcon}
      </div>
      <div className="flex-1 pb-1">
        <div className="text-xs font-medium text-text-primary">{step.label}</div>
        <div className="text-[10px] text-text-muted mt-0.5">{step.sublabel}</div>
        {step.comment && (
          <div className="text-[10px] text-text-secondary mt-1 italic">"{step.comment}"</div>
        )}
      </div>
      {step.timestamp && (
        <div className="text-[10px] text-text-muted flex-shrink-0">{step.timestamp}</div>
      )}
    </div>
  )
}

// ─── Build Timeline ────────────────────────────────────────────────────────

function buildTimeline(r?: WFHRequest): TimelineStep[] {
  if (!r) return []
  const steps: TimelineStep[] = []

  steps.push({
    label: 'Submitted',
    sublabel: 'Request created via Quandatics WFH Portal',
    status: 'done',
    timestamp: r.submittedOn ? formatDateTime(r.submittedOn) : undefined,
  })

  if (r.approvalRoute === 'QAW_AdHoc') {
    const l1Done = r.l1PMOutcome === 'Approved' && r.l1TLOutcome === 'Approved'
    const l1Rejected = r.status === 'Rejected' && !!r.l1RejectedBy

    steps.push({
      label: l1Rejected
        ? 'L1 — rejected (first rejection wins)'
        : l1Done
          ? 'L1 — all PMs and Tech Leads approved'
          : 'L1 — awaiting PM and Tech Lead approvals',
      sublabel: l1Rejected
        ? `Rejected by: ${r.l1RejectedBy}`
        : r.projectCodes
          ? `Projects: ${r.projectCodes}`
          : 'All approvers notified via Teams',
      status: l1Rejected ? 'rejected' : l1Done ? 'done' : 'pending',
      comment: l1Rejected ? r.approvalComment : undefined,
    })

    if (!l1Rejected) {
      steps.push({
        label: r.l2CTOOutcome === 'Approved'
          ? 'L2 — CTO approved'
          : r.l2CTOOutcome === 'Rejected'
            ? 'L2 — CTO rejected'
            : 'L2 — awaiting CTO approval',
        sublabel: l1Done ? 'Final approval' : 'Only reached once all L1 approvals granted',
        status: r.l2CTOOutcome === 'Approved' ? 'done' : r.l2CTOOutcome === 'Rejected' ? 'rejected' : 'pending',
        timestamp: r.approvedOn ? formatDateTime(r.approvedOn) : undefined,
        comment: r.approvalComment,
      })
    }
  } else {
    const approverLabel = r.approvalRoute === 'QAW_Recurring' ? 'CTO' : 'Line Manager'

    steps.push({
      label: r.approvalOutcome === 'Approved'
        ? `${approverLabel} approved`
        : r.approvalOutcome === 'Rejected'
          ? `${approverLabel} rejected`
          : `Awaiting ${approverLabel} approval`,
      sublabel: r.approverEmail || 'Notified via Microsoft Teams Approvals',
      status: r.approvalOutcome === 'Approved' ? 'done' : r.approvalOutcome === 'Rejected' ? 'rejected' : 'pending',
      timestamp: r.approvedOn ? formatDateTime(r.approvedOn) : undefined,
      comment: r.approvalComment,
    })
  }

  if (r.status === 'Completed') {
    steps.push({
      label: 'Quarter completed',
      sublabel: 'Auto-marked completed by the system',
      status: 'done',
    })
  }

  return steps
}
