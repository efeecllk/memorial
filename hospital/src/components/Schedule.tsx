import { motion } from 'motion/react'
import { schedule, todayMeta } from '../lib/data'

const kindColor: Record<string, string> = {
  round: 'var(--ink)',
  consult: 'var(--ocean)',
  family: 'var(--ochre)',
  discharge: 'var(--moss)',
  'multi-d': 'var(--ocean)',
  pharmacy: 'var(--ink-soft)',
  procedure: 'var(--blood)',
}

const kindLabel: Record<string, string> = {
  round: 'Round',
  consult: 'Consult',
  family: 'Family',
  discharge: 'Discharge',
  'multi-d': 'Multi-D',
  pharmacy: 'Pharmacy',
  procedure: 'Procedure',
}

export function Schedule() {
  // Build hours 07 — 19
  const hours = Array.from({ length: 13 }, (_, i) => 7 + i)

  function getRowStart(time: string) {
    const [h, m] = time.split(':').map(Number)
    return (h - 7) * 60 + m // minutes from 07:00
  }

  return (
    <div className="px-10 py-8 max-w-[1480px] mx-auto">
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-9"
      >
        <div className="flex items-end justify-between mb-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">
            {todayMeta.hospital} · Vol. {todayMeta.vol} · No. {todayMeta.issue}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">
            {todayMeta.shift}
          </div>
        </div>

        <div className="rule-double mb-4" />

        <div className="flex items-baseline justify-between">
          <div>
            <h1
              className="font-display"
              style={{
                fontSize: '4.6rem',
                lineHeight: 0.92,
                fontWeight: 700,
                letterSpacing: '-0.035em',
                fontVariationSettings: '"opsz" 144',
              }}
            >
              The Day's Programme
            </h1>
            <p className="italic-serif text-[20px] text-ink-soft mt-3">
              {todayMeta.date} · {schedule.length} entries listed
            </p>
          </div>

          <div className="text-right pb-2">
            <div className="font-mono text-[10px] smallcaps text-smoke mb-1">Now</div>
            <div className="font-display text-[28px] tnum" style={{ fontWeight: 600, fontVariationSettings: '"opsz" 144' }}>
              08:42
            </div>
          </div>
        </div>

        <div className="rule-thick mt-5" />
      </motion.header>

      <div className="grid grid-cols-12 gap-10">
        <section className="col-span-8">
          <div className="flex items-baseline justify-between border-b border-ink/40 pb-2 mb-6">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blood">§ 01</span>
              <h2 className="font-display text-[22px]" style={{ fontWeight: 700 }}>Programme</h2>
            </div>
            <div className="italic-serif text-[12px] text-ink-soft">Hour by hour</div>
          </div>

          {/* Timeline */}
          <div className="relative" style={{ height: `${13 * 64}px` }}>
            {/* Hour gridlines */}
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 flex items-center"
                style={{ top: `${(h - 7) * 64}px`, height: '64px' }}
              >
                <div className="w-16 shrink-0 font-mono text-[10px] tnum text-smoke pt-0.5">
                  {String(h).padStart(2, '0')}:00
                </div>
                <div className="flex-1 border-t border-rule-soft" />
              </div>
            ))}

            {/* "Now" indicator at 08:42 */}
            <div
              className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
              style={{ top: `${(8 - 7) * 64 + (42 / 60) * 64}px` }}
            >
              <div className="w-16 shrink-0 font-mono text-[10px] tnum text-blood font-semibold">
                08:42
              </div>
              <div className="flex-1 border-t border-blood relative">
                <span className="absolute -top-1 -left-0.5 w-2 h-2 rounded-full bg-blood" />
              </div>
            </div>

            {/* Appointments */}
            {schedule.map((a, i) => {
              const top = (getRowStart(a.time) / 60) * 64
              const height = (a.duration / 60) * 64 - 4
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.05 }}
                  className="absolute"
                  style={{ top: `${top}px`, height: `${height}px`, left: '64px', right: '0' }}
                >
                  <div
                    className="h-full pl-4 pr-4 py-2.5 group cursor-pointer transition-colors hover:bg-cream/60"
                    style={{ borderLeft: `3px solid ${kindColor[a.kind]}` }}
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-[11px] tnum text-ink-soft">
                          {a.time}<span className="text-smoke"> · {a.duration}m</span>
                        </span>
                        <span
                          className="font-mono text-[9px] uppercase tracking-wider"
                          style={{ color: kindColor[a.kind] }}
                        >
                          {kindLabel[a.kind]}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-smoke italic">{a.location}</span>
                    </div>

                    <div className="font-display text-[16px] leading-tight group-hover:underline underline-offset-4 decoration-rule" style={{ fontWeight: 600 }}>
                      {a.title}
                    </div>
                    <div className="italic-serif text-[12.5px] text-ink-soft leading-snug">
                      {a.subject} · {a.attendee}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </section>

        {/* Right rail: Today at a glance */}
        <aside className="col-span-4">
          <div className="border-l border-ink/40 pl-6">
            <div className="smallcaps text-[10px] text-smoke mb-3">Today's tally</div>
            <div className="space-y-3">
              {[
                { label: 'Rounds', count: 1 },
                { label: 'Consults', count: 3 },
                { label: 'Procedures', count: 1 },
                { label: 'Family meetings', count: 1 },
                { label: 'Discharges planned', count: 2 },
                { label: 'Multi-D meetings', count: 1 },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 pb-2 border-b border-rule-soft">
                  <span className="italic-serif text-[14px] text-ink-soft">{row.label}</span>
                  <span className="font-display text-[18px] tnum" style={{ fontWeight: 600 }}>
                    {row.count}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-5 border-t border-rule">
              <div className="smallcaps text-[10px] text-smoke mb-3">On-call after 19:00</div>
              <div className="space-y-2 text-[13px]">
                {[
                  { role: 'Hospitalist', name: 'Dr. R. Kapoor', pager: '8847' },
                  { role: 'Cardiology', name: 'Dr. T. Lindqvist', pager: '8221' },
                  { role: 'Surgery', name: 'Dr. K. Hayashi', pager: '8109' },
                  { role: 'Pharmacy', name: 'PharmD M. Rios', pager: '8442' },
                ].map((p) => (
                  <div key={p.role} className="flex items-baseline justify-between gap-2 pb-1">
                    <span className="font-mono text-[10px] smallcaps text-smoke w-20 shrink-0">{p.role}</span>
                    <span className="font-display flex-1 truncate" style={{ fontWeight: 600 }}>{p.name}</span>
                    <span className="font-mono text-[11px] text-ink-soft tnum shrink-0">{p.pager}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="italic-serif text-[12px] text-smoke mt-8 leading-relaxed">
              Programme entries are advisory; actual order of work is determined by acuity and the editor on duty.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
