import { motion } from 'motion/react'
import type { Alert } from '../lib/data'

const typeLabel: Record<Alert['type'], string> = {
  'critical-lab': 'Critical lab',
  'imaging': 'Imaging',
  'pharmacy': 'Pharmacy',
  'discharge': 'Discharge',
  'family': 'Family',
  'consult': 'Consult',
}

const typeGlyph: Record<Alert['type'], string> = {
  'critical-lab': '◆',
  'imaging': '◐',
  'pharmacy': '℞',
  'discharge': '⇢',
  'family': '☎',
  'consult': '§',
}

type Props = {
  alert: Alert
  index?: number
}

export function AlertItem({ alert, index = 0 }: Props) {
  const isUrgent = alert.priority === 'urgent'
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: 0.2 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative pt-3 pb-3.5 pl-4 pr-3 border-t border-rule cursor-pointer transition-colors ${
        isUrgent ? 'pulse-blood' : 'hover:bg-cream/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className="font-display text-base leading-none mt-0.5"
          style={{ color: isUrgent ? 'var(--blood)' : 'var(--ochre)' }}
          aria-hidden
        >
          {typeGlyph[alert.type]}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <span className="smallcaps text-[9.5px] text-ink-soft">{typeLabel[alert.type]}</span>
            <span className="font-mono text-[10px] text-smoke shrink-0">{alert.time}</span>
          </div>

          <div className="font-display text-[15px] leading-tight mb-1" style={{ fontWeight: 600, fontVariationSettings: '"opsz" 14' }}>
            {alert.title}
          </div>

          <div className="italic-serif text-[12.5px] text-ink-soft leading-snug">
            {alert.detail}
          </div>

          <div className="mt-1.5 font-mono text-[10px] text-smoke">
            {alert.patientName} · {alert.bed}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
