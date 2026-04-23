import { motion } from 'motion/react'

type Props = {
  label: string
  value: string | number
  unit?: string
  caption?: string
  delta?: { dir: 'up' | 'down' | 'flat'; value: string }
  accent?: 'ink' | 'blood' | 'ocean' | 'moss' | 'ochre'
  index?: number
}

const accentColor = {
  ink: 'var(--ink)',
  blood: 'var(--blood)',
  ocean: 'var(--ocean)',
  moss: 'var(--moss)',
  ochre: 'var(--ochre)',
} as const

export function KPICard({ label, value, unit, caption, delta, accent = 'ink', index = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 + index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className="relative pt-5 pb-4 pl-5 pr-4 border-t border-ink"
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="smallcaps text-[10px] text-ink-soft">{label}</span>
        {delta && (
          <span className="font-mono text-[10px] text-smoke">
            {delta.dir === 'up' ? '↑' : delta.dir === 'down' ? '↓' : '→'} {delta.value}
          </span>
        )}
      </div>

      <div className="flex items-end gap-2 leading-none">
        <span
          className="font-display tnum"
          style={{
            fontSize: '4.2rem',
            fontWeight: 600,
            letterSpacing: '-0.04em',
            color: accentColor[accent],
            fontVariationSettings: '"opsz" 144',
          }}
        >
          {value}
        </span>
        {unit && (
          <span className="font-display italic-serif text-smoke text-lg pb-2">{unit}</span>
        )}
      </div>

      {caption && (
        <div className="mt-3 italic-serif text-[12.5px] text-ink-soft leading-snug max-w-[18ch]">
          {caption}
        </div>
      )}
    </motion.div>
  )
}
