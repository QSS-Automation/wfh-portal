import { useNavigate } from 'react-router-dom'
import type { WFHRequest } from '../types'
import { StatusBadge } from './UI'
import { formatDate, formatPeriod, formatWFHDays } from '../utils/dates'

interface Props {
  request: WFHRequest
  showMeta?: boolean
}

export function RequestRow({ request, showMeta = true }: Props) {
  const navigate = useNavigate()
  const isRec = request.requestType === 'Recurring'

  const title = isRec
    ? `Recurring · ${request.quarterPeriod?.replace(/-/g, ' ')} · ${formatWFHDays(request.wfhDays)}`
    : `Ad hoc · ${request.startDate ? formatDate(request.startDate) : '—'}`

  const subtitle = isRec
    ? formatPeriod(request.startDate, request.endDate)
    : [request.projectCodes, request.managerNote].filter(Boolean).join(' · ')

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b border-border-light last:border-0
        cursor-pointer hover:bg-bg-surface transition-colors"
      onClick={() => navigate(`/requests/${request.id}`)}
    >
      {/* Icon */}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0
        ${isRec ? 'bg-primary-light text-primary' : 'bg-success-light text-success'}`}>
        {isRec ? 'REC' : 'AD'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-text-primary truncate">{title}</div>
        <div className="text-[11px] text-text-secondary mt-0.5 truncate">{subtitle}</div>
        {showMeta && (
          <div className="text-[10px] text-text-muted mt-0.5">
            Submitted {request.submittedOn ? formatDate(request.submittedOn) : '—'}
          </div>
        )}
      </div>

      {/* Badge */}
      <StatusBadge status={request.status} />
    </div>
  )
}
