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
        fields.StartDate = q?.startDate ? `${q.startDate}T00:00:00Z` : undefined
        fields.EndDate = q?.endDate ? `${q.endDate}T00:00:00Z` : undefined
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
    <div style={{padding:'26px 30px', maxWidth:'680px'}}>
      <div style={{fontSize:'20px',fontWeight:700,color:'#1a1a18',marginBottom:'4px',letterSpacing:'-0.3px'}}>New WFH Request</div>
      <div style={{fontSize:'13px',color:'#73726c',marginBottom:'22px'}}>Submit a recurring or ad hoc work-from-home request</div>

      {/* Type Toggle — matches mockup .seg/.sb */}
      <div style={{display:'flex',background:'#f5f4f0',borderRadius:'8px',padding:'3px',gap:'3px',width:'fit-content',marginBottom:'18px'}}>
        {(['Recurring', 'AdHoc'] as const).map(t => (
          <button
            key={t}
            onClick={() => setRequestType(t)}
            style={{
              padding:'8px 26px', fontSize:'13px', borderRadius:'6px', cursor:'pointer',
              border: requestType === t ? '1px solid #e8e7e0' : 'none',
              background: requestType === t ? '#fff' : 'none',
              color: requestType === t ? '#185FA5' : '#73726c',
              fontWeight: requestType === t ? 500 : 400,
              fontFamily:'inherit', transition:'all 0.15s'
            }}
          >
            {t === 'AdHoc' ? 'Ad hoc' : 'Recurring'}
          </button>
        ))}
      </div>

      {/* ── RECURRING ── */}
      {requestType === 'Recurring' && (
        <>
          {/* Quarter Selector */}
          <div style={{background:'#fff',border:'1px solid #e8e7e0',borderRadius:'12px',padding:'16px 20px',marginBottom:'12px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div style={{fontSize:'13px',fontWeight:600,color:'#1a1a18',marginBottom:'4px'}}>Select quarter<span style={{color:'#A32D2D',marginLeft:'2px'}}>*</span></div>
            <div style={{fontSize:'12px',color:'#73726c',marginBottom:'12px'}}>Only current and next quarter are available. Fixed dates cannot be changed.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'4px'}}>
              {quarters.map(q => {
                const isSelected = recForm.selectedQuarter?.tag === q.tag && !q.isAlreadySubmitted
                return (
                  <div
                    key={q.code + q.tag}
                    onClick={() => selectQuarter(q)}
                    style={{
                      border: isSelected ? '1.5px solid #185FA5' : '1.5px solid #d3d1c7',
                      borderRadius:'10px', padding:'14px 16px',
                      cursor: q.isAlreadySubmitted ? 'not-allowed' : 'pointer',
                      background: isSelected ? '#EBF3FF' : q.isAlreadySubmitted ? '#f5f4f0' : '#fff',
                      opacity: q.isAlreadySubmitted ? 0.5 : 1,
                      boxShadow: isSelected ? '0 0 0 3px rgba(24,95,165,0.08)' : 'none',
                      transition:'all 0.15s'
                    }}
                  >
                    <div style={{fontSize:'12px',color:'#888780',fontWeight:500,marginBottom:'3px'}}>
                      {q.tag === 'current' ? 'Current quarter' : 'Next quarter'}
                    </div>
                    <div style={{fontSize:'13px',fontWeight:600,color: isSelected ? '#185FA5' : '#1a1a18',marginBottom:'4px'}}>
                      {q.label}
                    </div>
                    <div style={{fontSize:'12px',color:'#5f5e5a'}}>
                      {formatDate(q.startDate)} – {formatDate(q.endDate)}
                    </div>
                    <div style={{fontSize:'11px',marginTop:'6px',fontWeight:500,
                      color: q.isAlreadySubmitted ? '#888780' : q.isPastDeadline ? '#A32D2D' : '#1A6B3A'}}>
                      {q.isAlreadySubmitted
                        ? 'Already submitted — closed'
                        : q.isPastDeadline
                          ? `Deadline ${q.deadlineDate} passed — justification required`
                          : `Apply by ${q.deadlineDate} ✓`
                      }
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Exception Block */}
          {recForm.isException && (
            <div style={{background:'#fffbf0',border:'1px solid #FAC775',borderRadius:'10px',padding:'14px 16px',marginBottom:'12px'}}>
              <div style={{fontSize:'12px',fontWeight:600,color:'#633806',marginBottom:'10px'}}>⚑ Late / exception submission — reason required</div>
              <div style={{fontSize:'12px',color:'#5f5e5a',marginBottom:'10px',lineHeight:1.6}}>The normal deadline for this quarter has passed. Please select your reason:</div>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'10px'}}>
                {(['New joiner', 'Missed deadline', 'Other'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRecForm(f => ({ ...f, exceptionReasonType: r }))}
                    style={{
                      padding:'6px 13px', borderRadius:'20px', fontSize:'12px', cursor:'pointer',
                      border: recForm.exceptionReasonType === r ? '1px solid #BA7517' : '1px solid #d3d1c7',
                      background: recForm.exceptionReasonType === r ? '#FAEEDA' : '#fff',
                      color: recForm.exceptionReasonType === r ? '#633806' : '#5f5e5a',
                      fontWeight: recForm.exceptionReasonType === r ? 500 : 400,
                      fontFamily:'inherit', transition:'all 0.1s'
                    }}
                  >
                    {r === 'New joiner' ? 'New joiner (mid-quarter)' : r === 'Other' ? 'Other reason' : r}
                  </button>
                ))}
              </div>
              {(recForm.exceptionReasonType === 'Missed deadline' || recForm.exceptionReasonType === 'Other') && (
                <div>
                  <label style={{fontSize:'12px',color:'#73726c',fontWeight:500,display:'block',marginBottom:'5px'}}>Details<span style={{color:'#A32D2D',marginLeft:'2px'}}>*</span></label>
                  <textarea
                    rows={2}
                    placeholder="Explain the reason for your late submission…"
                    value={recForm.exceptionReasonDetail}
                    onChange={e => setRecForm(f => ({ ...f, exceptionReasonDetail: e.target.value }))}
                    style={{padding:'9px 12px',borderRadius:'8px',border:'1px solid #d3d1c7',fontSize:'13px',background:'#fff',color:'#1a1a18',width:'100%',fontFamily:'inherit',resize:'vertical'}}
                  />
                </div>
              )}
              {recForm.exceptionReasonType === 'New joiner' && (
                <div style={{background:'#D6F0E0',borderRadius:'6px',padding:'8px 12px',fontSize:'12px',color:'#1A6B3A',marginTop:'8px'}}>
                  New joiner exception noted — your join date will be referenced automatically.
                </div>
              )}
            </div>
          )}

          {/* WFH Days */}
          <div style={{background:'#fff',border:'1px solid #e8e7e0',borderRadius:'12px',padding:'16px 20px',marginBottom:'12px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div style={{fontSize:'13px',fontWeight:600,color:'#1a1a18',marginBottom:'10px'}}>WFH days<span style={{color:'#A32D2D',marginLeft:'2px'}}>*</span></div>
            {appUser.employeeGroup === 'QAW' && (
              <div style={{fontSize:'12px',color:'#A32D2D',marginBottom:'10px',fontWeight:500}}>QAW group: restricted to Tuesday and Thursday only.</div>
            )}
            {appUser.employeeGroup === 'General' && (
              <div style={{fontSize:'12px',color:'#73726c',marginBottom:'10px'}}>Select up to 2 days per week.</div>
            )}
            <div style={{display:'flex',gap:'7px',flexWrap:'wrap'}}>
              {ALL_DAYS.map(day => {
                const isQAW = appUser.employeeGroup === 'QAW'
                const isDisabled = isQAW && !['Tue', 'Thu'].includes(day)
                const isSelected = recForm.selectedDays.includes(day)
                return (
                  <button
                    key={day}
                    disabled={isDisabled}
                    onClick={() => toggleDay(day)}
                    style={{
                      padding:'7px 13px', borderRadius:'20px', fontSize:'12px', fontFamily:'inherit',
                      border: isSelected && !isDisabled ? '1px solid #85B7EB' : '1px solid #d3d1c7',
                      background: isSelected && !isDisabled ? '#E6F1FB' : '#fff',
                      color: isSelected && !isDisabled ? '#0C447C' : '#5f5e5a',
                      fontWeight: isSelected && !isDisabled ? 500 : 400,
                      opacity: isDisabled ? 0.3 : 1,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      transition:'all 0.1s', userSelect:'none'
                    }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Note */}
          <div style={{background:'#fff',border:'1px solid #e8e7e0',borderRadius:'12px',padding:'16px 20px',marginBottom:'12px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            <div style={{fontSize:'13px',fontWeight:600,color:'#1a1a18',marginBottom:'12px'}}>Note to approver</div>
            <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
              <label style={{fontSize:'12px',color:'#73726c',fontWeight:500}}>Note <span style={{fontWeight:400,color:'#b4b2a9',marginLeft:'4px'}}>optional</span></label>
              <textarea
                rows={2}
                placeholder="Any additional context…"
                value={recForm.managerNote}
                onChange={e => setRecForm(f => ({ ...f, managerNote: e.target.value }))}
                style={{padding:'9px 12px',borderRadius:'8px',border:'1px solid #d3d1c7',fontSize:'13px',background:'#fff',color:'#1a1a18',width:'100%',fontFamily:'inherit',resize:'vertical'}}
              />
            </div>
          </div>

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
            <div>
              <div style={{background:'#fff',border:'1.5px solid #F09595',borderRadius:'12px',padding:'22px',textAlign:'center',marginBottom:'12px'}}>
                <div style={{width:'44px',height:'44px',borderRadius:'50%',background:'#FCEBEB',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 10px',fontSize:'18px',color:'#A32D2D',fontWeight:700}}>✕</div>
                <div style={{fontSize:'14px',fontWeight:600,color:'#A32D2D',marginBottom:'5px'}}>Ad hoc limit reached for this month</div>
                <div style={{fontSize:'12px',color:'#73726c',lineHeight:1.6}}>
                  You have already submitted {policy.adHocMaxPerMonth} ad hoc request for this month.<br/>
                  Limit is {policy.adHocMaxPerMonth} per calendar month. You may submit again from next month.
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Date */}
              <div style={{background:'#fff',border:'1px solid #e8e7e0',borderRadius:'12px',padding:'16px 20px',marginBottom:'12px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                  <div style={{fontSize:'13px',fontWeight:600,color:'#1a1a18'}}>Request date</div>
                  <div style={{fontSize:'11px',background:'#D6F0E0',color:'#1A6B3A',padding:'3px 10px',borderRadius:'20px',fontWeight:500}}>
                    {adHocUsedThisMonth} of {policy.adHocMaxPerMonth} used this month
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                  <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                    <label style={{fontSize:'12px',color:'#73726c',fontWeight:500}}>Date<span style={{color:'#A32D2D',marginLeft:'2px'}}>*</span> <span style={{fontWeight:400,color:'#b4b2a9'}}>weekdays only · no overlap with recurring WFH</span></label>
                    <input
                      type="date"
                      value={adForm.date}
                      onChange={e => setAdForm(f => ({ ...f, date: e.target.value }))}
                      style={{padding:'9px 12px',borderRadius:'8px',border:'1px solid #d3d1c7',fontSize:'13px',background:'#fff',color:'#1a1a18',width:'100%',fontFamily:'inherit'}}
                    />
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                    <label style={{fontSize:'12px',color:'#73726c',fontWeight:500}}>Lead time status</label>
                    <div style={{
                      padding:'9px 12px', borderRadius:'8px', fontSize:'12px', lineHeight:1.5,
                      background: adForm.date ? (adForm.isLate ? '#FFF0CC' : '#D6F0E0') : '#f5f4f0',
                      color: adForm.date ? (adForm.isLate ? '#7A5500' : '#1A6B3A') : '#b4b2a9'
                    }}>
                      {adForm.date
                        ? adForm.isLate
                          ? `${adForm.bizDaysAhead} biz day(s) — justification required`
                          : `${adForm.bizDaysAhead} business days ahead — policy satisfied.`
                        : 'Select a date above'
                      }
                    </div>
                  </div>
                </div>
              </div>

              {/* Late justification */}
              {adForm.isLate && (
                <div style={{background:'#fff',border:'1px solid #e8e7e0',borderRadius:'12px',padding:'16px 20px',marginBottom:'12px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                  <div style={{fontSize:'13px',fontWeight:600,color:'#A32D2D',marginBottom:'10px'}}>Justification required — urgent submission</div>
                  <div style={{background:'#FFF0CC',borderRadius:'8px',padding:'10px 14px',fontSize:'12px',color:'#7A5500',marginBottom:'10px',lineHeight:1.6}}>
                    Date is less than {policy.adHocLeadDays} business days away.
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                    <label style={{fontSize:'12px',color:'#73726c',fontWeight:500}}>Justification<span style={{color:'#A32D2D',marginLeft:'2px'}}>*</span></label>
                    <textarea
                      rows={2}
                      placeholder="Explain the reason for short-notice submission…"
                      value={adForm.justification}
                      onChange={e => setAdForm(f => ({ ...f, justification: e.target.value }))}
                      style={{padding:'9px 12px',borderRadius:'8px',border:'1px solid #d3d1c7',fontSize:'13px',background:'#fff',color:'#1a1a18',width:'100%',fontFamily:'inherit',resize:'vertical'}}
                    />
                  </div>
                </div>
              )}

              {/* Projects (QAW only) */}
              {appUser.employeeGroup === 'QAW' && (
                <div style={{background:'#fff',border:'1px solid #e8e7e0',borderRadius:'12px',padding:'16px 20px',marginBottom:'12px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                  <div style={{fontSize:'13px',fontWeight:600,color:'#1a1a18',marginBottom:'4px'}}>Project(s) involved<span style={{color:'#A32D2D',marginLeft:'2px'}}>*</span></div>
                  <div style={{fontSize:'12px',color:'#73726c',marginBottom:'10px'}}>
                    PM and Tech Lead from every selected project must approve before the CTO.
                  </div>
                  <div style={{position:'relative',marginBottom:'8px'}}>
                    <span style={{position:'absolute',left:'10px',top:'50%',transform:'translateY(-50%)',color:'#b4b2a9',fontSize:'14px',pointerEvents:'none'}}>⌕</span>
                    <input
                      placeholder="Search projects…"
                      value={projSearch}
                      onChange={e => setProjSearch(e.target.value)}
                      style={{padding:'9px 12px 9px 34px',borderRadius:'8px',border:'1px solid #d3d1c7',fontSize:'13px',background:'#fff',color:'#1a1a18',width:'100%',fontFamily:'inherit'}}
                    />
                  </div>
                  <div style={{border:'1px solid #d3d1c7',borderRadius:'8px',overflow:'hidden',background:'#fff',maxHeight:'200px',overflowY:'auto',boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}}>
                    {filteredProjects.length === 0 && (
                      <div style={{fontSize:'12px',color:'#b4b2a9',padding:'10px 12px'}}>No projects found</div>
                    )}
                    {filteredProjects.map(p => {
                      const selected = adForm.selectedProjects.some(x => x.projectCode === p.projectCode)
                      return (
                        <div
                          key={p.projectCode}
                          onClick={() => toggleProject(p)}
                          style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'10px 12px',cursor:'pointer',
                            background: selected ? '#f0f6ff' : '#fff',
                            borderBottom:'1px solid #f0efe8', transition:'background 0.1s'}}
                        >
                          <div style={{width:'16px',height:'16px',borderRadius:'4px',border: selected ? '1.5px solid #185FA5' : '1.5px solid #d3d1c7',
                            display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                            background: selected ? '#185FA5' : 'transparent',
                            color:'#fff',fontSize:'10px',fontWeight:700,marginTop:'2px'}}>
                            {selected && '✓'}
                          </div>
                          <div>
                            <div style={{fontSize:'13px',color:'#1a1a18',fontWeight:500}}>{p.projectCode} — {p.projectName}</div>
                            <div style={{fontSize:'11px',color:'#73726c',marginTop:'2px'}}>PM: {p.projectManagerEmail.split('@')[0]} · TL: {p.techLeadEmail.split('@')[0]}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {adForm.selectedProjects.length > 0 && (
                    <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginTop:'8px'}}>
                      {adForm.selectedProjects.map(p => (
                        <span key={p.projectCode} style={{display:'flex',alignItems:'center',gap:'5px',background:'#E6F1FB',border:'1px solid #B5D4F4',borderRadius:'20px',padding:'4px 10px',fontSize:'12px',color:'#0C447C',fontWeight:500}}>
                          {p.projectCode} — {p.projectName}
                          <button onClick={(e) => { e.stopPropagation(); toggleProject(p) }} style={{cursor:'pointer',opacity:0.6,fontSize:'13px',lineHeight:1,background:'none',border:'none',color:'inherit',padding:0}}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <ApprovalChain
                    employeeGroup={appUser.employeeGroup}
                    requestType="AdHoc"
                    selectedProjects={adForm.selectedProjects}
                  />
                </div>
              )}

              {/* Reason + Note */}
              <div style={{background:'#fff',border:'1px solid #e8e7e0',borderRadius:'12px',padding:'16px 20px',marginBottom:'12px',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'#1a1a18',marginBottom:'12px'}}>Request details</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                  <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                    <label style={{fontSize:'12px',color:'#73726c',fontWeight:500}}>Reason<span style={{color:'#A32D2D',marginLeft:'2px'}}>*</span></label>
                    <input
                      placeholder="e.g. medical appointment, home delivery…"
                      value={adForm.reason}
                      onChange={e => setAdForm(f => ({ ...f, reason: e.target.value }))}
                      style={{padding:'9px 12px',borderRadius:'8px',border:'1px solid #d3d1c7',fontSize:'13px',background:'#fff',color:'#1a1a18',width:'100%',fontFamily:'inherit'}}
                    />
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:'5px'}}>
                    <label style={{fontSize:'12px',color:'#73726c',fontWeight:500}}>Note to approver <span style={{fontWeight:400,color:'#b4b2a9',marginLeft:'4px'}}>optional</span></label>
                    <input
                      placeholder="Any additional context…"
                      value={adForm.managerNote}
                      onChange={e => setAdForm(f => ({ ...f, managerNote: e.target.value }))}
                      style={{padding:'9px 12px',borderRadius:'8px',border:'1px solid #d3d1c7',fontSize:'13px',background:'#fff',color:'#1a1a18',width:'100%',fontFamily:'inherit'}}
                    />
                  </div>
                </div>
              </div>

              {appUser.employeeGroup === 'General' && (
                <div style={{background:'#E6F1FB',borderRadius:'8px',padding:'10px 14px',fontSize:'12px',color:'#0C447C',marginBottom:'12px',lineHeight:1.6}}>
                  Your line manager will be notified via Microsoft Teams Approvals.
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Policy Reminder */}
      <div style={{background:'#FCEBEB',borderRadius:'8px',padding:'10px 14px',fontSize:'12px',color:'#791F1F',marginBottom:'12px',lineHeight:1.6}}>
        <strong>Policy reminder:</strong> If a physical meeting falls on your approved WFH day, office attendance is required regardless of approval status.
      </div>

      {/* Error */}
      {submitError && (
        <div style={{background:'#FCEBEB',borderRadius:'8px',padding:'10px 14px',fontSize:'12px',color:'#791F1F',marginBottom:'12px',lineHeight:1.6}}>
          <strong>Please fix:</strong> {submitError}
        </div>
      )}

      {/* Submit */}
      {!(requestType === 'AdHoc' && adHocLimitReached) && (
        <div style={{display:'flex',gap:'10px',marginTop:'4px'}}>
          <button
            style={{background:'#185FA5',color:'#fff',border:'none',borderRadius:'8px',padding:'10px 22px',fontSize:'13px',fontWeight:600,cursor:'pointer',fontFamily:'inherit',letterSpacing:'0.1px'}}
            onClick={() => {
              if (!appUser || !policy) return
              setSubmitError(null)
              const v = requestType === 'Recurring'
                ? validateRecurringForm(recForm, appUser.employeeGroup)
                : validateAdHocForm(adForm, appUser.employeeGroup, policy.adHocLeadDays)
              if (!v.valid) { setSubmitError(v.errors.join(' ')); return }
              setStep('review')
            }}
          >
            Review &amp; Submit →
          </button>
          <button
            style={{background:'#fff',color:'#5f5e5a',border:'1px solid #d3d1c7',borderRadius:'8px',padding:'9px 18px',fontSize:'13px',cursor:'pointer',fontFamily:'inherit'}}
            onClick={() => navigate('/')}
          >
            Cancel
          </button>
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
    <div className="p-6 max-w-2xl">
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
