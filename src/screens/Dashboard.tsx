import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import { StatCard, PageHeader, Button, Alert } from '../components/UI'
import { isSameCalendarMonth, getCalendarDayType } from '../utils/dates'
import type { CalDayType } from '../utils/dates'

// ─── Day colour classes ────────────────────────────────────────────────────

const DAY_CLASSES: Record<CalDayType, string> = {
  recurring: 'bg-[#D6F0E0] text-[#1A6B3A]',
  adhoc:     'bg-[#FFF0CC] text-[#7A5500]',
  office:    'bg-[#DDEEFF] text-[#1A5C99]',
  none:      'bg-[#f5f4f0] text-[#aaa8a0]',
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

// ─── Single month calendar component ─────────────────────────────────────

interface MonthCalProps {
  year: number
  month: number       // 1-indexed
  showPrev?: boolean
  showNext?: boolean
  onPrev?: () => void
  onNext?: () => void
  requests: ReturnType<typeof useApp>['myRequests']
  employeeGroup: 'QAW' | 'General'
  qawOfficeDays: string[]
}

function MonthCal({ year, month, showPrev, showNext, onPrev, onNext, requests, employeeGroup, qawOfficeDays }: MonthCalProps) {
  const today = new Date()
  const firstDay = new Date(year, month - 1, 1).getDay()
  // Mon=0 offset
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  const totalDays = new Date(year, month, 0).getDate()

  // Build cells — weekdays only (Mon–Fri)
  const cells: { day: number | null }[] = []
  for (let i = 0; i < startOffset; i++) cells.push({ day: null })
  for (let d = 1; d <= totalDays; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) cells.push({ day: d })
  }

  return (
    <div className="bg-white border border-border-default rounded-xl p-3 shadow-sm flex-1">
      {/* Nav row */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={onPrev}
          className={`w-7 h-7 rounded-lg border border-border-default text-xs text-text-secondary flex items-center justify-center transition-colors
            ${showPrev ? 'hover:bg-bg-page cursor-pointer' : 'opacity-0 pointer-events-none'}`}
        >‹</button>
        <div className="text-xs font-semibold text-text-primary">{MONTHS[month - 1]} {year}</div>
        <button
          onClick={onNext}
          className={`w-7 h-7 rounded-lg border border-border-default text-xs text-text-secondary flex items-center justify-center transition-colors
            ${showNext ? 'hover:bg-bg-page cursor-pointer' : 'opacity-0 pointer-events-none'}`}
        >›</button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-5 gap-1 mb-1">
        {['M','T','W','T','F'].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold text-text-muted py-0.5">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-5 gap-1">
        {cells.map((cell, i) => {
          if (!cell.day) return <div key={i} className="rounded py-1" />
          const date = new Date(year, month - 1, cell.day)
          const type = getCalendarDayType(date, requests, employeeGroup, qawOfficeDays)
          const isToday = cell.day === today.getDate() && month - 1 === today.getMonth() && year === today.getFullYear()
          return (
            <div
              key={i}
              className={`rounded text-center text-[11px] font-medium py-1 leading-tight
                ${DAY_CLASSES[type]}
                ${isToday ? 'ring-2 ring-primary ring-offset-1 font-bold' : ''}`}
            >
              {cell.day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate()
  const { appUser, myRequests, policy } = useApp()
  const [calBase, setCalBase] = useState<{ year: number; month: number }>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  })

  if (!appUser) return null

  const qawOfficeDays = policy?.qawOfficeDays?.map(String) ?? ['Mon', 'Wed', 'Fri']

  const wfhThisMonth = myRequests.filter(r =>
    r.status === 'Approved' && r.startDate && isSameCalendarMonth(r.startDate)
  ).length
  const pending  = myRequests.filter(r => r.status === 'Pending').length
  const approved = myRequests.filter(r => r.status === 'Approved').length

  // Build 3 consecutive months from calBase
  const months = [0, 1, 2].map(offset => {
    let m = calBase.month + offset
    let y = calBase.year
    if (m > 12) { m -= 12; y++ }
    return { year: y, month: m }
  })

  function prevMonth() {
    setCalBase(prev => {
      let m = prev.month - 1, y = prev.year
      if (m < 1) { m = 12; y-- }
      return { year: y, month: m }
    })
  }

  function nextMonth() {
    setCalBase(prev => {
      let m = prev.month + 1, y = prev.year
      if (m > 12) { m = 1; y++ }
      return { year: y, month: m }
    })
  }

  return (
    <div className="p-6">
      <PageHeader
        title={`Good morning, ${appUser.employee.displayName.split(' ')[0]}`}
        subtitle={`${appUser.employeeGroup} Group · ${appUser.employee.subsidiary} · ${appUser.employee.department}`}
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard value={wfhThisMonth} label="WFH days this month" color="text-primary" />
        <StatCard value={pending}      label="Pending approval"    color="text-warning" />
        <StatCard value={approved}     label="Total approved"      color="text-success" />
      </div>

      {/* 3-month calendar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">WFH Calendar</div>
          <Button size="sm" onClick={() => navigate('/new')}>+ New Request</Button>
        </div>

        <div className="flex gap-3">
          {months.map((m, i) => (
            <MonthCal
              key={`${m.year}-${m.month}`}
              year={m.year}
              month={m.month}
              showPrev={i === 0}
              showNext={i === 2}
              onPrev={prevMonth}
              onNext={nextMonth}
              requests={myRequests}
              employeeGroup={appUser.employeeGroup}
              qawOfficeDays={qawOfficeDays}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-3 px-1 flex-wrap">
          {[
            { color: '#D6F0E0', border: '#5DCAA5', label: 'Recurring WFH' },
            { color: '#FFF0CC', border: '#F5C842', label: 'Ad hoc WFH' },
            { color: '#DDEEFF', border: '#85B7EB', label: 'Office day' },
          ].map(leg => (
            <div key={leg.label} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: leg.color, border: `1px solid ${leg.border}` }} />
              {leg.label}
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-[10px] text-text-secondary">
            <div className="w-3 h-3 rounded-sm flex-shrink-0 bg-white ring-2 ring-primary ring-offset-0" />
            Today
          </div>
        </div>
      </div>

      {/* Policy Banner */}
      <Alert variant="warning">
        <strong>Physical meeting policy:</strong> If any physical meeting is scheduled on your approved WFH day,
        you must attend the office — regardless of approval status.
      </Alert>
    </div>
  )
}
