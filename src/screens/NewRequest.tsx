import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useApp } from '../contexts/AppContext'
import { ApprovalChain } from '../components/ApprovalChain'
import {
  Card, CardTitle, Button, FormLabel, Input, TextArea,
  Alert, PageHeader, Spinner
} from '../components/UI'
import { countBusinessDays, getAvailableQuarters, formatDate, formatPeriod } from '../utils/dates'
import { validateRecurringForm, validateAdHocForm } from '../utils/validation'
import { createRequest, triggerSubmitFlow } from '../services/graph'
import type { WFHDay, RecurringFormState, AdHocFormState, Project, QuarterInfo } from '../types'

const ALL_DAYS: WFHDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export function NewRequest() {
  const navigate = useNavigate()
  const { instance } = useMsal()
  const { appUser, policy, allProjects, myRequests, refreshRequests } = useApp()
  const [requestType, setRequestType] = useState<'Recurring' | 'AdHoc'>('Recurring')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'review' | 'submitted'>('form')
  const [submittedRef, setSubmittedRef] = useState<string>('')

  // ── Recurring State ──────────────────────────────────────────────────────
  const [recForm, setRecForm] = useState<RecurringFormState>({
    selectedQuarter: null,
    selectedDays: appUser?.employeeGroup === 'QAW' ? ['Tue', 'Thu'] : ['Mon', 'Tue'],
    isException: false,
    exceptionReasonType: null,
    exceptionReasonDetail: '',
    managerNote: '',
  })

  // ── Ad Hoc State ──────────────────────────────────────────────────────────
  const [adForm, setAdForm] = useState<AdHocFormState>({
    date: '',
    reason: '',
    managerNote: '',
    justification: '',
    isLate: false,
    bizDaysAhead: 0,
    selectedProjects: [],
  })
  const [projSearch, setProjSearch] = useState('')

  // ── Quarters ──────────────────────────────────────────────────────────────
  const quarters = useMemo(() =>
    getAvailableQuarters(myRequests, policy?.recurringDeadlineDay),
    [myRequests, policy]
  )

  useEffect(() => {
    if (quarters.length && !recForm.selectedQuarter) {
      const first = quarters.find(q => !q.isAlreadySubmitted) || quarters[0]
      setRecForm(f => ({ ...f, selectedQuarter: first, isException: first.isPastDeadline }))
    }
  }, [quarters])

  // ── Ad hoc lead time ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!adForm.date || !policy) return
    const days = countBusinessDays(new Date(), new Date(adForm.date))
    const isLate = days < policy.adHocLeadDays
    setAdForm(f => ({ ...f, bizDaysAhead: days, isLate }))
  }, [adForm.date, policy])

  // ── Monthly cap check ──────────────────────────────────────────────────────
  const adHocUsedThisMonth = useMemo(() => {
    const now = new Date()
    return myRequests.filter(r =>
      r.requestType === 'AdHoc' &&
      ['Pending', 'Approved'].includes(r.status) &&
      r.startDate &&
      new Date(r.startDate).getMonth() === now.getMonth() &&
      new Date(r.startDate).getFullYear() === now.getFullYear()
    ).length
  }, [myRequests])

  const adHocLimitReached = policy ? adHocUsedThisMonth >= policy.adHocMaxPerMonth : false

  // ── Day chip toggle ────────────────────────────────────────────────────────
  function toggleDay(day: WFHDay) {
    const isQAW = appUser?.employeeGroup === 'QAW'
    if (isQAW && !['Tue', 'Thu'].includes(day)) return
    setRecForm(f => {
      const has = f.selectedDays.includes(day)
      if (has) return { ...f, selectedDays: f.selectedDays.filter(d => d !== day) }
      if (!isQAW && f.selectedDays.length >= 2) return f
      return { ...f, selectedDays: [...f.selectedDays, day] }
    })
  }

  // ── Quarter select ─────────────────────────────────────────────────────────
  function selectQuarter(q: QuarterInfo) {
    if (q.isAlreadySubmitted) return
    setRecForm(f => ({
      ...f,
      selectedQuarter: q,
      isException: q.isPastDeadline,
      exceptionReasonType: null,
      exceptionReasonDetail: '',
    }))
  }

  // ── Project toggle ─────────────────────────────────────────────────────────
  function toggleProject(p: Project) {
    setAdForm(f => {
      const has = f.selectedProjects.some(x => x.projectCode === p.projectCode)
      return {
        ...f,
        selectedProjects: has
          ? f.selectedProjects.filter(x => x.projectCode !== p.projectCode)
          : [...f.selectedProjects, p],
      }
    })
  }

  const filteredProjects = allProjects.filter(p =>
    p.projectName.toLowerCase().includes(projSearch.toLowerCase()) ||
    p.projectCode.toLowerCase().includes(projSearch.toLowerCase())
  )

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!appUser || !policy) return
    setSubmitError(null)

    let validation
    if (requestType === 'Recurring') {
      validation = validateRecurringForm(recForm, appUser.employeeGroup)
    } else {
      validation = validateAdHocForm(adForm, appUser.employeeGroup, policy.adHocLeadDays)
    }

    if (!validation.valid) {
      setSubmitError(validation.errors.join(' '))
      return
    }

    setSubmitting(true)
    try {
      const isRec = requestType === 'Recurring'
      const q = recForm.selectedQuarter

      const approvalRoute = appUser.employeeGroup === 'General'
        ? 'LineManager'
        : isRec ? 'QAW_Recurring' : 'QAW_AdHoc'

      const fields: Record<string, any> = {
        EmployeeID: appUser.employee.email,
        EmployeeGroup: appUser.employeeGroup,
        RequestType: requestType,
        Status: 'Pending',
        SubmittedOn: new Date().toISOString(),
        ApprovalRoute: approvalRoute,
        ManagerNote: isRec ? recForm.managerNote : adForm.managerNote,
      }

      // Remove ManagerNote from base fields - only send if non-empty
      delete fields.ManagerNote
      if ((isRec ? recForm.managerNote : adForm.managerNote)?.trim()) {
        fields.ManagerNote = isRec ? recForm.managerNote : adForm.managerNote
      }

      if (isRec) {
        fields.QuarterPeriod = q?.code
        fields.StartDate = q?.startDate ? `${q.startDate}` : undefined
        fields.EndDate = q?.endDate ? `${q.endDate}` : undefined
        fields.WFH_Days = recForm.selectedDays.join(';')
        fields.IsException = recForm.isException
        fields.LateSubmission = recForm.isException
        if (recForm.exceptionReasonType) {
          fields.ExceptionReasonType = recForm.exceptionReasonType
        }
        if (recForm.exceptionReasonDetail?.trim()) {
          fields.ExceptionReasonDetail = recForm.exceptionReasonDetail
        }
        fields.ApproverEmail = appUser.employeeGroup === 'General'
          ? appUser.employee.managerEmail
          : appUser.project?.ctoEmail
        if (appUser.employeeGroup === 'QAW') {
          fields.CTOEmail = appUser.project?.ctoEmail
        }
      } else {
        fields.StartDate = adForm.date ? `${adForm.date}T00:00:00Z` : undefined
	fields.Reason = adForm.reason
        fields.LateSubmission = adForm.isLate
        if (adForm.justification?.trim()) {
          fields.Justification = adForm.justification
        }
        fields.ApproverEmail = appUser.employeeGroup === 'General'
          ? appUser.employee.managerEmail
          : undefined

        if (appUser.employeeGroup === 'QAW') {
          fields.ProjectCodes = adForm.selectedProjects.map(p => p.projectCode).join(';')
          fields.ProjectManagerEmails = adForm.selectedProjects.map(p => p.projectManagerEmail).join(';')
          fields.TechLeadEmails = adForm.selectedProjects.map(p => p.techLeadEmail).join(';')
          fields.CTOEmail = adForm.selectedProjects[0]?.ctoEmail
        }
      }

      // DEBUG — remove after confirming submission works
      console.log('SharePoint payload:', JSON.stringify(fields, null, 2))

      const created = await createRequest(instance, fields)
      await triggerSubmitFlow(instance, created.requestID, created.id)
      await refreshRequests()
      setSubmittedRef(created.requestID || created.id)
      setStep('submitted')
    } catch (e: any) {
      setSubmitError(e.message || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!appUser || !policy) return <div className="p-6"><Spinner /></div>

  if (step === 'review') return (
    <ReviewScreen
      appUser={appUser}
      requestType={requestType}
      recForm={recForm}
      adForm={adForm}
      submitting={submitting}
      onConfirm={handleSubmit}
      onEdit={() => setStep('form')}
    />
  )

  if (step === 'submitted') return (
    <SubmittedScreen
      requestType={requestType}
      recForm={recForm}
      adForm={adForm}
      submittedRef={submittedRef}
      onViewRequests={() => navigate('/requests')}
      onDashboard={() => navigate('/')}
    />
  )

  return (
    <div className="p-6">
      <PageHeader title="New WFH Request" subtitle="Submit a recurring or ad hoc work-from-home request" />

      {/* Type Toggle */}
      <div className="flex bg-bg-page rounded-lg p-1 gap-1 w-fit mb-5">
        {(['Recurring', 'AdHoc'] as const).map(t => (
          <button
            key={t}
            onClick={() => setRequestType(t)}
            className={`px-6 py-2 rounded-md text-sm transition-all font-medium
              ${requestType === t
                ? 'bg-white text-primary border border-border-default shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            {t === 'AdHoc' ? 'Ad hoc' : 'Recurring'}
          </button>
        ))}
      </div>

      {/* ── RECURRING ── */}
      {requestType === 'Recurring' && (
        <>
          {/* Quarter Selector */}
          <Card className="mb-3">
            <CardTitle>Select quarter <span className="text-danger">*</span></CardTitle>
            <p className="text-xs text-text-secondary mb-3">Only current and next quarter available. Dates are fixed.</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {quarters.map(q => (
                <div
                  key={q.code + q.tag}
                  onClick={() => selectQuarter(q)}
                  className={`border-2 rounded-xl p-3 transition-all
                    ${q.isAlreadySubmitted
                      ? 'opacity-50 cursor-not-allowed bg-bg-page'
                      : 'cursor-pointer'
                    }
                    ${recForm.selectedQuarter?.tag === q.tag && !q.isAlreadySubmitted
                      ? 'border-primary bg-primary-light'
                      : 'border-border-default bg-white hover:border-primary'
                    }`}
                >
                  <div className="text-[10px] text-text-muted font-medium mb-1">
                    {q.tag === 'current' ? 'Current quarter' : 'Next quarter'}
                  </div>
                  <div className={`text-xs font-bold ${recForm.selectedQuarter?.tag === q.tag ? 'text-primary' : 'text-text-primary'}`}>
                    {q.label}
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    {formatDate(q.startDate)} – {formatDate(q.endDate)}
                  </div>
                  <div className={`text-[10px] mt-1.5 font-medium
                    ${q.isAlreadySubmitted ? 'text-text-muted' : q.isPastDeadline ? 'text-danger' : 'text-success'}`}>
                    {q.isAlreadySubmitted
                      ? 'Already submitted — closed'
                      : q.isPastDeadline
                        ? `Deadline ${q.deadlineDate} passed — justification required`
                        : `Apply by ${q.deadlineDate} ✓`
                    }
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Exception Block */}
          {recForm.isException && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-3">
              <div className="text-xs font-semibold text-warning mb-2">⚑ Late / exception submission — reason required</div>
              <p className="text-xs text-text-secondary mb-2">The normal deadline has passed. Please select your reason:</p>
              <div className="flex gap-2 flex-wrap mb-2">
                {(['New joiner', 'Missed deadline', 'Other'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRecForm(f => ({ ...f, exceptionReasonType: r }))}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-all
                      ${recForm.exceptionReasonType === r
                        ? 'bg-warning-light text-warning border-amber-400 font-medium'
                        : 'bg-white text-text-secondary border-border-default hover:border-amber-300'
                      }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {(recForm.exceptionReasonType === 'Missed deadline' || recForm.exceptionReasonType === 'Other') && (
                <TextArea
                  rows={2}
                  placeholder="Explain the reason for late submission…"
                  value={recForm.exceptionReasonDetail}
                  onChange={e => setRecForm(f => ({ ...f, exceptionReasonDetail: e.target.value }))}
                />
              )}
              {recForm.exceptionReasonType === 'New joiner' && (
                <Alert variant="success">New joiner noted — your join date will be referenced automatically.</Alert>
              )}
            </div>
          )}

          {/* WFH Days */}
          <Card className="mb-3">
            <CardTitle>WFH days <span className="text-danger">*</span></CardTitle>
            {appUser.employeeGroup === 'QAW' && (
              <p className="text-xs text-danger font-medium mb-2">QAW group: restricted to Tuesday and Thursday only.</p>
            )}
            {appUser.employeeGroup === 'General' && (
              <p className="text-xs text-text-secondary mb-2">Select up to 2 days per week.</p>
            )}
            <div className="flex gap-2 flex-wrap">
              {ALL_DAYS.map(day => {
                const isQAW = appUser.employeeGroup === 'QAW'
                const isDisabled = isQAW && !['Tue', 'Thu'].includes(day)
                const isSelected = recForm.selectedDays.includes(day)
                return (
                  <button
                    key={day}
                    disabled={isDisabled}
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-all
                      ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                      ${isSelected && !isDisabled
                        ? 'bg-primary-light text-primary border-blue-300 font-medium'
                        : 'bg-white text-text-secondary border-border-default hover:border-primary'
                      }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Note */}
          <Card className="mb-3">
            <CardTitle>Note to approver</CardTitle>
            <TextArea
              rows={2}
              placeholder="Any additional context… (optional)"
              value={recForm.managerNote}
              onChange={e => setRecForm(f => ({ ...f, managerNote: e.target.value }))}
            />
          </Card>

          <ApprovalChain
            employeeGroup={appUser.employeeGroup}
            requestType="Recurring"
            selectedProjects={[]}
            managerEmail={appUser.employee.managerEmail}
          />
        </>
      )}

      {/* ── AD HOC ── */}
      {requestType === 'AdHoc' && (
        <>
          {adHocLimitReached ? (
            <div className="border-2 border-red-300 rounded-xl p-5 text-center mb-3">
              <div className="text-2xl mb-2">✕</div>
              <div className="text-sm font-semibold text-danger mb-1">Ad hoc limit reached for this month</div>
              <p className="text-xs text-text-secondary">
                You have already used your {policy.adHocMaxPerMonth} ad hoc WFH day for this month.
              </p>
            </div>
          ) : (
            <>
              {/* Date */}
              <Card className="mb-3">
                <div className="flex items-center justify-between mb-3">
                  <CardTitle>Request date</CardTitle>
                  <span className="text-[10px] bg-success-light text-success px-2 py-0.5 rounded-full font-medium">
                    {adHocUsedThisMonth} of {policy.adHocMaxPerMonth} used this month
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FormLabel required>Date <span className="text-text-muted font-normal">(weekdays only)</span></FormLabel>
                    <Input
                      type="date"
                      value={adForm.date}
                      onChange={e => setAdForm(f => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <FormLabel>Lead time</FormLabel>
                    <div className={`rounded-btn px-3 py-2 text-xs leading-relaxed
                      ${adForm.date ? (adForm.isLate ? 'bg-warning-light text-warning' : 'bg-success-light text-success') : 'bg-bg-page text-text-muted'}`}>
                      {adForm.date
                        ? adForm.isLate
                          ? `${adForm.bizDaysAhead} biz day(s) — justification required`
                          : `${adForm.bizDaysAhead} business days — policy satisfied ✓`
                        : 'Select a date above'
                      }
                    </div>
                  </div>
                </div>
              </Card>

              {/* Late justification */}
              {adForm.isLate && (
                <Card className="mb-3">
                  <CardTitle>Justification required — urgent submission</CardTitle>
                  <Alert variant="warning">Less than {policy.adHocLeadDays} business days ahead.</Alert>
                  <div className="mt-2">
                    <FormLabel required>Justification</FormLabel>
                    <TextArea
                      rows={2}
                      placeholder="Explain the reason for short-notice submission…"
                      value={adForm.justification}
                      onChange={e => setAdForm(f => ({ ...f, justification: e.target.value }))}
                    />
                  </div>
                </Card>
              )}

              {/* Projects (QAW only) */}
              {appUser.employeeGroup === 'QAW' && (
                <Card className="mb-3">
                  <CardTitle>Project(s) involved <span className="text-danger">*</span></CardTitle>
                  <p className="text-xs text-text-secondary mb-2">
                    PM and Tech Lead from every selected project must approve before the CTO.
                  </p>
                  <Input
                    placeholder="🔍  Search projects…"
                    value={projSearch}
                    onChange={e => setProjSearch(e.target.value)}
                    className="mb-2"
                  />
                  <div className="border border-border-default rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                    {filteredProjects.length === 0 && (
                      <div className="text-xs text-text-muted p-3 text-center">No projects found</div>
                    )}
                    {filteredProjects.map(p => {
                      const selected = adForm.selectedProjects.some(x => x.projectCode === p.projectCode)
                      return (
                        <div
                          key={p.projectCode}
                          onClick={() => toggleProject(p)}
                          className={`flex items-start gap-2 p-2.5 cursor-pointer border-b border-border-light last:border-0 transition-colors
                            ${selected ? 'bg-primary-light/50' : 'hover:bg-bg-surface'}`}
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-[1.5px] transition-all text-[9px] font-bold
                            ${selected ? 'bg-primary border-primary text-white' : 'border-border-default'}`}>
                            {selected && '✓'}
                          </div>
                          <div>
                            <div className="text-xs font-medium text-text-primary">{p.projectCode} — {p.projectName}</div>
                            <div className="text-[10px] text-text-muted mt-0.5">PM: {p.projectManagerEmail.split('@')[0]} · TL: {p.techLeadEmail.split('@')[0]}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {adForm.selectedProjects.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {adForm.selectedProjects.map(p => (
                        <span key={p.projectCode} className="bg-primary-light border border-blue-200 text-primary text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                          {p.projectCode} — {p.projectName}
                          <button onClick={() => toggleProject(p)} className="opacity-60 hover:opacity-100 text-xs">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <ApprovalChain
                    employeeGroup={appUser.employeeGroup}
                    requestType="AdHoc"
                    selectedProjects={adForm.selectedProjects}
                  />
                </Card>
              )}

              {/* Reason + Note */}
              <Card className="mb-3">
                <CardTitle>Request details</CardTitle>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FormLabel required>Reason</FormLabel>
                    <Input
                      placeholder="e.g. medical appointment, home delivery…"
                      value={adForm.reason}
                      onChange={e => setAdForm(f => ({ ...f, reason: e.target.value }))}
                    />
                  </div>
                  <div>
                    <FormLabel>Note to approver <span className="text-text-muted font-normal">(optional)</span></FormLabel>
                    <Input
                      placeholder="Any additional context…"
                      value={adForm.managerNote}
                      onChange={e => setAdForm(f => ({ ...f, managerNote: e.target.value }))}
                    />
                  </div>
                </div>
              </Card>

              {appUser.employeeGroup === 'General' && (
                <Alert variant="info">Your line manager will be notified via Microsoft Teams Approvals.</Alert>
              )}
            </>
          )}
        </>
      )}

      {/* Policy Reminder */}
      <Alert variant="error">
        <strong>Policy reminder:</strong> If a physical meeting falls on your approved WFH day,
        office attendance is required regardless of approval status.
      </Alert>

      {/* Error */}
      {submitError && (
        <Alert variant="error"><strong>Please fix:</strong> {submitError}</Alert>
      )}

      {/* Submit */}
      {!(requestType === 'AdHoc' && adHocLimitReached) && (
        <div className="flex gap-3 mt-4">
          <Button onClick={() => {
            // Validate first, then show review
            if (!appUser || !policy) return
            setSubmitError(null)
            const v = requestType === 'Recurring'
              ? validateRecurringForm(recForm, appUser.employeeGroup)
              : validateAdHocForm(adForm, appUser.employeeGroup, policy.adHocLeadDays)
            if (!v.valid) { setSubmitError(v.errors.join(' ')); return }
            setStep('review')
          }}>
            Review &amp; Submit →
          </Button>
          <Button variant="ghost" onClick={() => navigate('/')}>Cancel</Button>
        </div>
      )}
    </div>
  )
}

// ─── Review Screen ────────────────────────────────────────────────────────

function ReviewScreen({ appUser, requestType, recForm, adForm, onConfirm, onEdit, submitting }:
  { appUser: any; requestType: string; recForm: any; adForm: any; onConfirm: () => void; onEdit: () => void; submitting: boolean }) {
  const isRec = requestType === 'Recurring'
  const q = recForm.selectedQuarter
  const approvalRoute = appUser.employeeGroup === 'General' ? 'Line Manager'
    : isRec ? 'CTO (QAW Recurring)' : 'PM + Tech Lead → CTO'
  const approvalInfo = appUser.employeeGroup === 'General'
    ? 'Your line manager will be notified via Teams Approvals.'
    : isRec ? 'Your CTO will be notified via Teams Approvals.'
    : 'All PMs and Tech Leads notified in parallel. First rejection ends the request. CTO approves if all L1 approve.'

  return (
    <div className="p-6">
      <div className="text-xl font-bold text-text-primary mb-1 tracking-tight">Review your request</div>
      <div className="text-xs text-text-secondary mb-5">Check all details before submitting</div>
      <div className="bg-white border border-border-default rounded-card p-5 mb-4 shadow-sm">
        <div className="text-sm font-semibold text-text-primary mb-4">Request summary</div>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
          <tbody>
            {[
              ['Employee', appUser.employee.displayName],
              ['Group', `${appUser.employeeGroup} · ${appUser.employee.subsidiary} · ${appUser.employee.department}`],
              ['Request type', isRec ? 'Recurring WFH' : 'Ad hoc WFH'],
              ...(isRec ? [
                ['Quarter', q?.label || '—'],
                ['Period', q ? `${q.startDate} – ${q.endDate}` : '—'],
                ['WFH days', recForm.selectedDays.join(' & ') || '—'],
              ] : [
                ['Date', adForm.date ? formatDate(adForm.date) : '—'],
                ...( adForm.selectedProjects.length ? [['Projects', adForm.selectedProjects.map((p:any)=>p.projectCode).join(', ')]] : []),
                ['Reason', adForm.reason || '—'],
              ]),
              ['Approval route', approvalRoute],
            ].map(([label, value]) => (
              <tr key={label as string} style={{borderBottom:'1px solid #f0efe8'}}>
                <td style={{padding:'9px 0',color:'#73726c',width:'38%',fontWeight:500}}>{label}</td>
                <td style={{padding:'9px 0',fontWeight:600}}>{value}</td>
              </tr>
            ))}
            <tr>
              <td style={{padding:'9px 0',color:'#73726c',fontWeight:500}}>Status</td>
              <td style={{padding:'9px 0'}}><span style={{background:'#FFF0CC',color:'#7A5500',fontSize:'11px',padding:'3px 9px',borderRadius:'20px',fontWeight:600}}>Pending approval</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="bg-primary-light rounded-lg px-4 py-3 text-xs text-primary mb-3">{approvalInfo}</div>
      <div className="bg-danger-light rounded-lg px-4 py-3 text-xs text-danger mb-5">
        <strong>Reminder:</strong> Physical meetings on approved WFH days require office attendance regardless of this approval.
      </div>
      <div className="flex gap-3">
        <button onClick={onConfirm} disabled={submitting}
          className="bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-semibold cursor-pointer hover:bg-primary-dark disabled:opacity-50">
          {submitting ? 'Submitting…' : 'Confirm & Submit'}
        </button>
        <button onClick={onEdit}
          className="bg-white text-text-secondary border border-border-default rounded-lg px-5 py-2.5 text-sm font-medium cursor-pointer hover:bg-bg-page">
          ← Edit
        </button>
      </div>
    </div>
  )
}

// ─── Submitted Screen ─────────────────────────────────────────────────────

function SubmittedScreen({ requestType, recForm, adForm, submittedRef, onViewRequests, onDashboard }:
  { requestType: string; recForm: any; adForm: any; submittedRef: string; onViewRequests: () => void; onDashboard: () => void }) {
  const isRec = requestType === 'Recurring'
  const q = recForm.selectedQuarter
  const now = new Date().toLocaleString('en-GB', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})

  return (
    <div className="p-6 max-w-md">
      <div className="text-center py-6">
        <div className="w-14 h-14 rounded-full bg-success-light flex items-center justify-center mx-auto mb-4">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path d="M4 13l7 7 11-11" stroke="#1A6B3A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="text-xl font-bold text-text-primary mb-2">Request submitted</div>
        <div className="text-sm text-text-secondary leading-relaxed">
          Your approver has been notified and will respond within 1–2 working days.
        </div>
      </div>
      <div className="bg-white border border-border-default rounded-card p-5 mb-5 shadow-sm">
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
          <tbody>
            {[
              ['Reference', submittedRef || 'Processing…'],
              ['Type', isRec ? `Recurring · ${q?.code?.replace(/-/g,' ')}` : `Ad hoc · ${adForm.date ? formatDate(adForm.date) : '—'}`],
              [isRec ? 'Period' : 'Date', isRec ? (q ? `${formatDate(q.startDate)} – ${formatDate(q.endDate)}` : '—') : (adForm.date ? formatDate(adForm.date) : '—')],
              ['Submitted', now],
              ['Status', null],
            ].map(([label, value]) => (
              <tr key={label as string} style={{borderBottom:'1px solid #f0efe8'}}>
                <td style={{padding:'9px 0',color:'#73726c',width:'38%',fontWeight:500}}>{label}</td>
                <td style={{padding:'9px 0',fontWeight:600}}>
                  {label === 'Status'
                    ? <span style={{background:'#FFF0CC',color:'#7A5500',fontSize:'11px',padding:'3px 9px',borderRadius:'20px',fontWeight:600}}>Pending approval</span>
                    : value
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <button onClick={onViewRequests}
          className="bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-semibold cursor-pointer hover:bg-primary-dark">
          View my requests
        </button>
        <button onClick={onDashboard}
          className="bg-white text-text-secondary border border-border-default rounded-lg px-5 py-2.5 text-sm font-medium cursor-pointer hover:bg-bg-page">
          Back to dashboard
        </button>
      </div>
    </div>
  )
}
