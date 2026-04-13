import type { RecurringFormState, AdHocFormState, EmployeeGroup, Project } from '../types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validateRecurringForm(
  form: RecurringFormState,
  employeeGroup: EmployeeGroup
): ValidationResult {
  const errors: string[] = []

  if (!form.selectedQuarter) {
    errors.push('Please select a quarter.')
  }

  if (form.selectedQuarter?.isAlreadySubmitted) {
    errors.push('You have already submitted a request for this quarter.')
  }

  if (!form.selectedDays.length) {
    errors.push('Please select at least one WFH day.')
  }

  if (employeeGroup === 'General' && form.selectedDays.length > 2) {
    errors.push('Maximum 2 WFH days per week allowed.')
  }

  if (employeeGroup === 'QAW') {
    const invalidDays = form.selectedDays.filter(d => !['Tue', 'Thu'].includes(d))
    if (invalidDays.length) {
      errors.push('QAW group can only select Tuesday and Thursday.')
    }
  }

  if (form.isException) {
    if (!form.exceptionReasonType) {
      errors.push('Please select a reason for late submission.')
    }
    if (
      (form.exceptionReasonType === 'Missed deadline' || form.exceptionReasonType === 'Other') &&
      !form.exceptionReasonDetail.trim()
    ) {
      errors.push('Please provide details for the exception reason.')
    }
  }

  return { valid: errors.length === 0, errors }
}

export function validateAdHocForm(
  form: AdHocFormState,
  employeeGroup: EmployeeGroup,
  adHocLeadDays: number
): ValidationResult {
  const errors: string[] = []

  if (!form.date) {
    errors.push('Please select a date.')
  }

  if (!form.reason.trim()) {
    errors.push('Reason is required for ad hoc WFH requests.')
  }

  if (form.isLate && !form.justification.trim()) {
    errors.push(`Date is less than ${adHocLeadDays} business days away — justification is required.`)
  }

  if (employeeGroup === 'QAW' && !form.selectedProjects.length) {
    errors.push('Please select at least one project.')
  }

  return { valid: errors.length === 0, errors }
}

export function isWeekday(dateStr: string): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d.getDay() !== 0 && d.getDay() !== 6
}
