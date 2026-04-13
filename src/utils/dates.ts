import { format, addMonths, isWeekend, differenceInCalendarDays, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import type { QuarterInfo, QuarterPeriod, WFHRequest } from '../types'

// ─── Business Day Calculator ───────────────────────────────────────────────

export function countBusinessDays(from: Date, to: Date): number {
  let count = 0
  const cur = new Date(from)
  cur.setHours(0, 0, 0, 0)
  const target = new Date(to)
  target.setHours(0, 0, 0, 0)
  while (cur < target) {
    cur.setDate(cur.getDate() + 1)
    if (!isWeekend(cur)) count++
  }
  return count
}

// ─── Quarter Definitions ───────────────────────────────────────────────────

interface QuarterDef {
  code: QuarterPeriod
  label: string
  startMonth: number // 0-indexed
  endMonth: number
  deadlineMonth: number // preceding month, 0-indexed
  deadlineDay: number
}

const QUARTERS: QuarterDef[] = [
  { code: 'Q1-Jan-Mar', label: 'Q1 — Jan to Mar', startMonth: 0, endMonth: 2, deadlineMonth: 11, deadlineDay: 15 },
  { code: 'Q2-Apr-Jun', label: 'Q2 — Apr to Jun', startMonth: 3, endMonth: 5, deadlineMonth: 2, deadlineDay: 15 },
  { code: 'Q3-Jul-Sep', label: 'Q3 — Jul to Sep', startMonth: 6, endMonth: 8, deadlineMonth: 5, deadlineDay: 15 },
  { code: 'Q4-Oct-Dec', label: 'Q4 — Oct to Dec', startMonth: 9, endMonth: 11, deadlineMonth: 8, deadlineDay: 15 },
]

export function getCurrentQuarterIndex(date: Date = new Date()): number {
  const m = date.getMonth()
  if (m <= 2) return 0
  if (m <= 5) return 1
  if (m <= 8) return 2
  return 3
}

export function getQuarterInfo(
  qIdx: number,
  year: number,
  tag: 'current' | 'next',
  submittedQuarterCodes: string[],
  deadlineDay: number = 15
): QuarterInfo {
  const q = QUARTERS[qIdx % 4]
  const qYear = qIdx >= 4 ? year + 1 : year

  // Deadline is in previous year for Q1
  const deadlineYear = q.deadlineMonth === 11 ? qYear - 1 : qYear
  const deadlineDate = new Date(deadlineYear, q.deadlineMonth, deadlineDay)
  const startDate = new Date(qYear, q.startMonth, 1)

  // Last day of end month
  const endDate = endOfMonth(new Date(qYear, q.endMonth, 1))

  const isPastDeadline = new Date() > deadlineDate
  const codeWithYear = `${q.code}-${qYear}`
  const isAlreadySubmitted = submittedQuarterCodes.includes(codeWithYear)

  return {
    label: `${q.label} ${qYear}`,
    code: q.code,
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd'),
    deadlineDate: format(deadlineDate, 'd MMM yyyy'),
    isPastDeadline,
    isAlreadySubmitted,
    tag,
  }
}

export function getAvailableQuarters(
  existingRequests: WFHRequest[],
  deadlineDay: number = 15
): QuarterInfo[] {
  const today = new Date()
  const year = today.getFullYear()
  const currentQIdx = getCurrentQuarterIndex(today)
  const nextQIdx = (currentQIdx + 1) % 4

  // Build list of already-submitted quarter codes
  const submittedCodes = existingRequests
    .filter(r => r.requestType === 'Recurring' && r.quarterPeriod &&
      ['Pending', 'Approved'].includes(r.status))
    .map(r => {
      // Determine year from startDate
      const yr = r.startDate ? new Date(r.startDate).getFullYear() : year
      return `${r.quarterPeriod}-${yr}`
    })

  const current = getQuarterInfo(currentQIdx, year, 'current', submittedCodes, deadlineDay)
  const nextYear = nextQIdx < currentQIdx ? year + 1 : year
  const next = getQuarterInfo(nextQIdx, nextYear, 'next', submittedCodes, deadlineDay)

  return [current, next]
}

// ─── Format Helpers ────────────────────────────────────────────────────────

export function formatDate(dateStr: string): string {
  try { return format(parseISO(dateStr), 'd MMM yyyy') } catch { return dateStr }
}

export function formatDateLong(dateStr: string): string {
  try { return format(parseISO(dateStr), 'EEEE, d MMMM yyyy') } catch { return dateStr }
}

export function formatDateTime(dateStr: string): string {
  try { return format(parseISO(dateStr), 'd MMM yyyy, hh:mm a') } catch { return dateStr }
}

export function formatPeriod(startDate?: string, endDate?: string): string {
  if (!startDate) return '—'
  if (!endDate) return formatDate(startDate)
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

export function formatWFHDays(days?: string[]): string {
  if (!days || !days.length) return '—'
  return days.join(' & ')
}

export function isSameCalendarMonth(dateStr: string, ref: Date = new Date()): boolean {
  try {
    const d = parseISO(dateStr)
    return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear()
  } catch { return false }
}

// ─── Calendar Day Classification ───────────────────────────────────────────

export type CalDayType = 'recurring' | 'adhoc' | 'office' | 'none'

/**
 * Given a date and the employee's approved requests,
 * returns the colour classification for that calendar day.
 */
export function getCalendarDayType(
  date: Date,
  requests: WFHRequest[],
  employeeGroup: 'QAW' | 'General',
  qawOfficeDays: string[] = ['Mon', 'Wed', 'Fri']
): CalDayType {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayName = dayNames[date.getDay()]
  const dateStr = format(date, 'yyyy-MM-dd')

  // Check if it falls within an approved recurring WFH period
  const recurringMatch = requests.find(r =>
    r.requestType === 'Recurring' &&
    r.status === 'Approved' &&
    r.startDate && r.endDate &&
    dateStr >= r.startDate && dateStr <= r.endDate &&
    r.wfhDays?.includes(dayName as any)
  )
  if (recurringMatch) return 'recurring'

  // Check if it's an approved ad hoc WFH day
  const adhocMatch = requests.find(r =>
    r.requestType === 'AdHoc' &&
    r.status === 'Approved' &&
    r.startDate === dateStr
  )
  if (adhocMatch) return 'adhoc'

  // For QAW: office days are Mon/Wed/Fri
  if (employeeGroup === 'QAW' && qawOfficeDays.includes(dayName)) return 'office'

  // For General: any weekday not WFH is office
  if (employeeGroup === 'General') return 'office'

  return 'none'
}
