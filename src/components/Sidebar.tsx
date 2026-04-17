import { NavLink } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import { GroupBadge } from './UI'

const navItems = [
  { to: '/',        label: 'Dashboard',   icon: GridIcon },
  { to: '/new',     label: 'New Request', icon: PlusIcon },
  { to: '/requests',label: 'My Requests', icon: ListIcon },
]

export function Sidebar() {
  const { appUser } = useApp()

  return (
    <aside className="w-48 bg-white border-r border-border-default flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border-light">
        <div className="text-sm font-bold text-primary">Quandatics WFH</div>
        <div className="text-xs text-text-muted mt-0.5">Employee Portal</div>
      </div>

      {/* Nav */}
      <div className="flex-1 py-3">
        <div className="px-3 py-1 text-[10px] font-semibold text-text-muted tracking-widest uppercase">Menu</div>
        <nav className="mt-1 space-y-0.5 px-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors
                ${isActive
                  ? 'bg-primary-light text-primary font-semibold'
                  : 'text-text-secondary hover:bg-bg-page hover:text-text-primary'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User Manual & Policy */}
      <div className="px-2 pb-1 border-t border-border-default pt-2">
        <NavLink
          to="/help"
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors
            ${isActive
              ? 'bg-primary-light text-primary font-semibold'
              : 'text-text-secondary hover:bg-bg-page hover:text-text-primary'
            }`
          }
        >
          <BookIcon className="w-3.5 h-3.5 flex-shrink-0" />
          User Manual &amp; Policy
        </NavLink>
      </div>

     
      
      {/* Footer */}
      {appUser && (
        <div className="border-t border-border-default px-4 py-3">
          <div className="text-xs font-semibold text-text-primary truncate">{appUser.employee.displayName}</div>
          <div className="text-[10px] text-text-muted mt-0.5 truncate">
            {appUser.employee.subsidiary} · {appUser.employee.department}
          </div>
          <div className="mt-1.5">
            <GroupBadge group={appUser.employeeGroup} />
          </div>
        </div>
      )}
    </aside>
  )
}

// ─── Icons ─────────────────────────────────────────────────────────────────

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" opacity=".8"/>
      <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity=".8"/>
      <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity=".8"/>
      <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" opacity=".8"/>
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="8" y1="5" x2="8" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="5" y1="9.5" x2="9" y2="9.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}


function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="5" y1="5.5" x2="11" y2="5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="5" y1="10.5" x2="8" y2="10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}