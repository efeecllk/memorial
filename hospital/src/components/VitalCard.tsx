import { motion } from 'motion/react'
import { Sparkline } from './Sparkline'

type Props = {
  label: string
  value: string
  unit: string
  trend: number[]
  status: 'normal' | 'caution' | 'critical'
  ref?: string
  index?: number
}

const statusColor = {
  normal: 'var(--ink)',
  caution: 'var(--ochre)',
  critical: 'var(--blood)',
}

const statusLabel = {
  normal: 'within range',
  caution: 'caution',
  critical: 'critical',
}

export function VitalCard({ label, value, unit, trend, status, ref, index = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.1 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="relative bg-cream/40 border-t-2 border-ink pt-4 pb-5 px-5"
    >
      {status === 'critical' && (
        <span className="absolute top-0 left-0 w-full h-1 bg-blood" />
      )}

      <div className="flex items-baseline justify-between mb-3">
        <span className="smallcaps text-[10px] text-ink-soft">{label}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: statusColor[status] }}>
          {statusLabel[status]}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 mb-3">
        <div className="leading-none">
          <span
            className="font-display tnum"
            style={{
              fontSize: '2.6rem',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              color: statusColor[status],
              fontVariationSettings: '"opsz" 144',
            }}
          >
            {value}
          </span>
          <span className="font-display italic-serif text-smoke text-sm ml-1.5">{unit}</span>
        </div>
        <Sparkline
          data={trend}
          width={92}
          height={28}
          color={statusColor[status]}
          strokeWidth={1.2}
          fill
        />
      </div>

      {ref && (
        <div className="font-mono text-[10px] text-smoke pt-2 border-t border-rule-soft">
          ref · {ref}
        </div>
      )}
    </motion.div>
  )
}
