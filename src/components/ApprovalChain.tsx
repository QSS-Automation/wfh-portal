import type { Project, EmployeeGroup, RequestType } from '../types'

interface Props {
  employeeGroup: EmployeeGroup
  requestType: RequestType
  selectedProjects: Project[]
  managerEmail?: string
}

export function ApprovalChain({ employeeGroup, requestType, selectedProjects, managerEmail }: Props) {
  if (employeeGroup === 'General') {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
        <div className="text-[10px] font-semibold text-primary mb-2 tracking-wide">APPROVAL CHAIN</div>
        <div className="flex items-start gap-2 text-xs">
          <div className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5">
            ✓
          </div>
          <div>
            <div className="font-medium text-text-primary">Line Manager</div>
            <div className="text-text-muted text-[10px] mt-0.5">
              {managerEmail || '[Manager email]'} — single level approval
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (requestType === 'Recurring') {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
        <div className="text-[10px] font-semibold text-primary mb-2 tracking-wide">APPROVAL CHAIN</div>
        <div className="flex items-start gap-2 text-xs">
          <div className="w-5 h-5 rounded-full bg-purple-700 text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5">
            CTO
          </div>
          <div>
            <div className="font-medium text-text-primary">CTO — direct approval</div>
            <div className="text-text-muted text-[10px] mt-0.5">QAW recurring goes straight to the CTO</div>
          </div>
        </div>
      </div>
    )
  }

  // QAW AdHoc
  if (!selectedProjects.length) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
        <div className="text-[10px] font-semibold text-primary mb-1 tracking-wide">APPROVAL CHAIN</div>
        <div className="text-xs text-text-muted">Select at least one project to see the approval chain.</div>
      </div>
    )
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
      <div className="text-[10px] font-semibold text-primary mb-2 tracking-wide">APPROVAL CHAIN</div>

      {/* L1 */}
      <div className="flex items-start gap-2 text-xs mb-2">
        <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5">
          L1
        </div>
        <div className="flex-1">
          <div className="font-medium text-text-primary">All must approve (parallel — first rejection wins)</div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {selectedProjects.map(p => (
              <span key={p.projectCode + '-pm'} className="bg-white border border-blue-200 rounded-full px-2 py-0.5 text-[10px] text-primary">
                {p.projectManagerName} (PM·{p.projectName})
              </span>
            ))}
            {selectedProjects.map(p => (
              <span key={p.projectCode + '-tl'} className="bg-white border border-blue-200 rounded-full px-2 py-0.5 text-[10px] text-primary">
                {p.techLeadName} (TL·{p.projectName})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Connector */}
      <div className="w-px h-3 bg-blue-200 ml-2.5 mb-2" />

      {/* L2 */}
      <div className="flex items-start gap-2 text-xs">
        <div className="w-5 h-5 rounded-full bg-purple-700 text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5">
          L2
        </div>
        <div>
          <div className="font-medium text-text-primary">CTO — final approver</div>
          <div className="text-text-muted text-[10px] mt-0.5">Only reached if all L1 approvals granted</div>
          {selectedProjects[0]?.ctoEmail && (
            <div className="flex mt-1">
              <span className="bg-white border border-blue-200 rounded-full px-2 py-0.5 text-[10px] text-primary">
                {selectedProjects[0].ctoName} (CTO)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
