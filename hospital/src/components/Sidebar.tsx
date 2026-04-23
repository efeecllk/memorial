import { motion } from 'motion/react'
import { utilities, todayMeta } from '../lib/data'
import { type DepartmentId, departmentList } from '../lib/departments'

type View = 'console' | 'dashboard' | 'patient' | 'schedule'

type Props = {
  view: View
  departmentId: DepartmentId
  onNavigate: (v: View) => void
  onOpenDepartment: (id: DepartmentId) => void
}

export function Sidebar({ view, departmentId, onNavigate, onOpenDepartment }: Props) {
  return (
    <aside className="w-[240px] shrink-0 h-full bg-cream/30 border-r border-ink/15 flex flex-col">
      {/* Crest */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-12 border border-ink flex items-center justify-center bg-bone">
            <span className="font-display text-[28px] leading-none" style={{ fontWeight: 800 }}>M</span>
            <span className="absolute -bottom-px left-1 right-1 h-px bg-blood" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-[15px]" style={{ fontWeight: 700, letterSpacing: '0.01em' }}>
              Memorial
            </div>
            <div className="italic-serif text-[12px] text-ink-soft -mt-0.5">general hospital</div>
          </div>
        </div>
      </div>

      <div className="mx-5 rule-double mb-3" />

      {/* Vol / Issue */}
      <div className="px-5 mb-5">
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-smoke">
          Vol. {todayMeta.vol} · No. {todayMeta.issue}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-smoke mt-0.5">
          {todayMeta.dateShort}
        </div>
      </div>

      <nav className="px-5 flex-1 overflow-y-auto pb-4">
        {/* Top-level views */}
        <SectionLabel>Today</SectionLabel>
        <NavItem
          active={view === 'dashboard'}
          onClick={() => onNavigate('dashboard')}
          number="01"
        >
          Ward Round
        </NavItem>
        <NavItem active={view === 'schedule'} onClick={() => onNavigate('schedule')} number="02">
          Schedule
        </NavItem>
        <NavItem number="03">Handoff</NavItem>

        <div className="h-5" />

        {/* Departments — each is a clickable AI console */}
        <SectionLabel>
          <span className="flex items-baseline justify-between gap-2">
            Departments
            <span className="font-mono text-[8px] text-blood border border-blood/40 px-1 leading-tight">
              ai
            </span>
          </span>
        </SectionLabel>
        {departmentList.map((d, i) => {
          const isActive = view === 'console' && departmentId === d.id
          return (
            <DepartmentItem
              key={d.id}
              number={String(i + 1).padStart(2, '0')}
              label={d.label}
              patientHint={d.patient.name.split(' ')[0]}
              active={isActive}
              color={d.accent}
              onClick={() => onOpenDepartment(d.id)}
            />
          )
        })}

        <div className="h-5" />
        <SectionLabel>Utilities</SectionLabel>
        {utilities.map((u) => (
          <NavItem key={u.id}>{u.name}</NavItem>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-5 py-4 border-t border-ink/15">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-ocean/15 border border-ocean/30 flex items-center justify-center">
            <span className="font-display text-[14px]" style={{ fontWeight: 600, color: 'var(--ocean)' }}>
              MC
            </span>
          </div>
          <div className="leading-tight">
            <div className="font-display text-[13px]" style={{ fontWeight: 600 }}>
              {todayMeta.attending}
            </div>
            <div className="italic-serif text-[11px] text-ink-soft">{todayMeta.attendingTitle}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="smallcaps text-[10px] text-smoke pb-1 mb-1.5 border-b border-rule-soft">
      {children}
    </div>
  )
}

type NavItemProps = {
  children: React.ReactNode
  active?: boolean
  number?: string
  onClick?: () => void
}

function NavItem({ children, active, number, onClick }: NavItemProps) {
  return (
    <motion.button
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className={`group flex items-baseline justify-between w-full text-left py-1 ${
        active ? 'text-ink' : 'text-ink-soft hover:text-ink'
      }`}
    >
      <div className="flex items-baseline gap-2 min-w-0">
        {number && (
          <span className={`font-mono text-[9px] tnum shrink-0 ${active ? 'text-blood' : 'text-smoke'}`}>
            {number}
          </span>
        )}
        <span
          className={`font-display text-[14px] truncate ${active ? '' : 'group-hover:underline underline-offset-4'}`}
          style={{ fontWeight: active ? 600 : 400 }}
        >
          {children}
        </span>
      </div>
      {active && <span className="absolute left-0 w-[3px] h-5 bg-blood -ml-5" />}
    </motion.button>
  )
}

function DepartmentItem({
  number, label, patientHint, active, color, onClick,
}: {
  number: string
  label: string
  patientHint: string
  active?: boolean
  color: string
  onClick: () => void
}) {
  return (
    <motion.button
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className="group w-full text-left py-1.5 relative"
    >
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="font-mono text-[9px] tnum shrink-0"
            style={{ color: active ? color : 'var(--smoke)', fontWeight: active ? 600 : 400 }}
          >
            {number}
          </span>
          <div className="min-w-0">
            <div
              className={`font-display text-[14px] truncate ${
                active ? '' : 'text-ink-soft group-hover:text-ink group-hover:underline underline-offset-4'
              }`}
              style={{ fontWeight: active ? 700 : 500, color: active ? 'var(--ink)' : undefined }}
            >
              {label}
            </div>
            <div
              className="italic-serif text-[11px] truncate"
              style={{ color: active ? color : 'var(--smoke)' }}
            >
              {patientHint}
            </div>
          </div>
        </div>
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
          style={{ backgroundColor: active ? color : 'var(--rule)' }}
        />
      </div>
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] -ml-5"
          style={{ backgroundColor: color }}
        />
      )}
    </motion.button>
  )
}
