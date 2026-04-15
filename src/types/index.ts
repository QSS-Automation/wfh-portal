// ─── Enums / Union Types ───────────────────────────────────────────────────

export type EmployeeGroup = 'QAW' | 'General'
export type Subsidiary = 'QSS' | 'QM' | 'QAW'
export type Department = 'Finance' | 'HR' | 'Operation' | 'Sales' | 'BTO' | 'Presales' | 'PMO' | 'Tech'
export type RequestType = 'Recurring' | 'AdHoc'
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Completed' | 'Cancelled'
export type ApprovalRoute = 'LineManager' | 'QAW_Recurring' | 'QAW_AdHoc'
export type QuarterPeriod = 'Q1-Jan-Mar' | 'Q2-Apr-Jun' | 'Q3-Jul-Sep' | 'Q4-Oct-Dec'
export type ExceptionReasonType = 'New joiner' | 'Missed deadline' | 'Other'
export type WFHDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'

// ─── SharePoint List Items ─────────────────────────────────────────────────

export interface Employee {
  id: string
  displayName: string
  email: string
  subsidiary: Subsidiary
  employeeGroup: EmployeeGroup
  department: Department
  managerEmail: string
  joinDate?: string
  projectCode?: string
  isActive: boolean
}

export interface Project {
  id: string
  projectCode: string
  projectName: string
  projectManagerEmail: string
  projectManagerName: string
  techLeadEmail: string
  techLeadName: string
  ctoEmail: string
  ctoName: string
  isActive: boolean
}

export interface PolicyRule {
  id: string
  policyKey: string
  policyValue: string
  appliesTo: 'All' | 'QAW' | 'General'
  description: string
  isActive: boolean
}

export interface WFHRequest {
  id: string
  requestID: string
  employeeID: string
  employeeGroup: EmployeeGroup
  requestType: RequestType
  status: RequestStatus
  wfhDays?: WFHDay[]
  quarterPeriod?: QuarterPeriod
  startDate?: string
  endDate?: string
  submittedOn: string
  lateSubmission: boolean
  justification?: string
  isException: boolean
  exceptionReasonType?: ExceptionReasonType
  exceptionReasonDetail?: string
  managerNote?: string
  approvalRoute: ApprovalRoute
  approverEmail?: string
  projectCodes?: string
  projectManagerEmails?: string
  techLeadEmails?: string
  ctoEmail?: string
  approvalOutcome?: 'Approved' | 'Rejected'
  approvalComment?: string
  approvedOn?: string
  approvalID?: string
  l1PMOutcome?: 'Approved' | 'Rejected'
  l1TLOutcome?: 'Approved' | 'Rejected'
  l1RejectedBy?: string
  l2CTOOutcome?: 'Approved' | 'Rejected'
}

// ─── App State ─────────────────────────────────────────────────────────────

export interface AppUser {
  employee: Employee
  employeeGroup: EmployeeGroup
  project?: Project
}

export interface PolicyMap {
  adHocLeadDays: number
  adHocMaxPerMonth: number
  recurringDeadlineDay: number
  qawAllowedDays: WFHDay[]
  qawOfficeDays: WFHDay[]
}

export interface QuarterInfo {
  label: string
  code: QuarterPeriod
  startDate: string
  endDate: string
  deadlineDate: string
  isPastDeadline: boolean
  isAlreadySubmitted: boolean
  tag: 'current' | 'next'
}

// ─── Form State ────────────────────────────────────────────────────────────

export interface RecurringFormState {
  selectedQuarter: QuarterInfo | null
  selectedDays: WFHDay[]
  isException: boolean
  exceptionReasonType: ExceptionReasonType | null
  exceptionReasonDetail: string
  managerNote: string
}

export interface AdHocFormState {
  date: string
  reason: string
  managerNote: string
  justification: string
  isLate: boolean
  bizDaysAhead: number
  selectedProjects: Project[]
}

// ─── Timeline Step ─────────────────────────────────────────────────────────

export interface TimelineStep {
  label: string
  sublabel: string
  status: 'done' | 'pending' | 'rejected'
  timestamp?: string
  comment?: string
}
