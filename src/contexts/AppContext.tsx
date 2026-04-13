import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AppUser, PolicyMap, WFHRequest, Project } from '../types'
import {
  fetchEmployeeByEmail,
  fetchPolicies,
  fetchProjects,
  fetchMyRequests,
} from '../services/graph'

interface AppContextValue {
  appUser: AppUser | null
  policy: PolicyMap | null
  allProjects: Project[]
  myRequests: WFHRequest[]
  loading: boolean
  error: string | null
  refreshRequests: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal()
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [policy, setPolicy] = useState<PolicyMap | null>(null)
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [myRequests, setMyRequests] = useState<WFHRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    if (!accounts.length) return
    const email = accounts[0].username
    setLoading(true)
    setError(null)
    try {
      // Load in parallel
      const [employee, policies, projects, requests] = await Promise.all([
        fetchEmployeeByEmail(instance, email),
        fetchPolicies(instance),
        fetchProjects(instance),
        fetchMyRequests(instance, email),
      ])

      if (!employee) {
        setError('Your employee record was not found. Please contact HR to set up your WFH profile.')
        setLoading(false)
        return
      }

      const employeeGroup = employee.subsidiary === 'QAW' ? 'QAW' : 'General'

      let project: Project | undefined
      if (employeeGroup === 'QAW' && employee.projectCode) {
        project = projects.find(p => p.projectCode === employee.projectCode)
      }

      setAppUser({ employee: { ...employee, employeeGroup }, employeeGroup, project })
      setAllProjects(projects)
      setMyRequests(requests)

      // Build policy map
      const get = (key: string) => policies.find(p => p.policyKey === key && p.isActive)?.policyValue ?? ''
      setPolicy({
        adHocLeadDays: Number(get('AdHoc_LeadDays')) || 2,
        adHocMaxPerMonth: Number(get('AdHoc_MaxPerMonth')) || 1,
        recurringDeadlineDay: Number(get('Recurring_DeadlineDay')) || 15,
        qawAllowedDays: (get('QAW_AllowedDays') || 'Tue;Thu').split(';').filter(Boolean) as any,
        qawOfficeDays: (get('QAW_OfficeDays') || 'Mon;Wed;Fri').split(';').filter(Boolean) as any,
      })
    } catch (e: any) {
      setError(e.message || 'Failed to load app data.')
    } finally {
      setLoading(false)
    }
  }, [instance, accounts])

  useEffect(() => { loadData() }, [loadData])

  const refreshRequests = useCallback(async () => {
    if (!accounts.length) return
    const email = accounts[0].username
    const requests = await fetchMyRequests(instance, email)
    setMyRequests(requests)
  }, [instance, accounts])

  return (
    <AppContext.Provider value={{ appUser, policy, allProjects, myRequests, loading, error, refreshRequests }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
