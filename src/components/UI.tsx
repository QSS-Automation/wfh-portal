import React from 'react'
import type { RequestStatus } from '../types'

// ─── Badge ─────────────────────────────────────────────────────────────────

const statusStyles: Record<RequestStatus, string> = {
  Pending:   'bg-warning-light text-warning',
  Approved:  'bg-success-light text-success',
  Rejected:  'bg-danger-light text-danger',
  Completed: 'bg-neutral-light text-neutral',
  Cancelled: 'bg-neutral-light text-neutral',
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusStyles[status]}`}>
      {status}
    </span>
  )
}

export function GroupBadge({ group }: { group: string }) {
  const style = group === 'QAW'
    ? 'bg-primary-light text-primary'
    : 'bg-success-light text-success'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style}`}>
      {group}
    </span>
  )
}

// ─── Card ──────────────────────────────────────────────────────────────────

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-border-default rounded-card p-4 ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold text-text-primary mb-3">{children}</div>
}

// ─── Buttons ───────────────────────────────────────────────────────────────

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }: BtnProps) {
  const base = 'rounded-btn font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-dark border-0',
    ghost:   'bg-white text-text-secondary border border-border-default hover:bg-bg-page',
    danger:  'bg-white text-danger border border-red-300 hover:bg-danger-light',
  }
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-5 py-2.5 text-sm' }
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}

// ─── Stat Card ─────────────────────────────────────────────────────────────

export function StatCard({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div className="bg-white border border-border-default rounded-card p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-text-secondary mt-1">{label}</div>
    </div>
  )
}

// ─── Form Controls ─────────────────────────────────────────────────────────

export function FormLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs font-semibold text-text-secondary block mb-1">
      {children}
      {required && <span className="text-danger ml-0.5">*</span>}
    </label>
  )
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`w-full border border-border-default rounded-btn px-3 py-2 text-sm text-text-primary bg-white
        focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${className}`}
      {...props}
    />
  )
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
export function TextArea({ className = '', ...props }: TextAreaProps) {
  return (
    <textarea
      className={`w-full border border-border-default rounded-btn px-3 py-2 text-sm text-text-primary bg-white
        focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none ${className}`}
      {...props}
    />
  )
}

// ─── Alert Boxes ───────────────────────────────────────────────────────────

type AlertVariant = 'info' | 'success' | 'warning' | 'error'

const alertStyles: Record<AlertVariant, string> = {
  info:    'bg-primary-light text-primary',
  success: 'bg-success-light text-success',
  warning: 'bg-warning-light text-warning',
  error:   'bg-danger-light text-danger',
}

export function Alert({ variant, children }: { variant: AlertVariant; children: React.ReactNode }) {
  return (
    <div className={`rounded-btn px-3 py-2 text-xs leading-relaxed ${alertStyles[variant]}`}>
      {children}
    </div>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-10 text-text-muted text-sm">{message}</div>
  )
}

// ─── Loading Spinner ───────────────────────────────────────────────────────

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className={`${sizes[size]} border-2 border-border-default border-t-primary rounded-full animate-spin`} />
  )
}

// ─── Page Header ───────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold text-text-primary">{title}</h1>
      {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ─── Section Title ─────────────────────────────────────────────────────────

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{children}</div>
      {action}
    </div>
  )
}
