import { motion } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import { patients, alerts, todayMeta } from '../lib/data'
import { KPICard } from './KPICard'
import { AlertItem } from './AlertItem'
import { Sparkline } from './Sparkline'

type Props = {
  onPatientSelect: (id: string) => void
}

const statusGlyph = {
  critical: '●',
  monitor: '◐',
  stable: '○',
  discharge: '◇',
}

const statusColor = {
  critical: 'var(--blood)',
  monitor: 'var(--ochre)',
  stable: 'var(--moss)',
  discharge: 'var(--ocean)',
}

const statusLabel = {
  critical: 'critical',
  monitor: 'monitor',
  stable: 'stable',
  discharge: 'discharge',
}

export function Dashboard({ onPatientSelect }: Props) {
  const census = patients.length
  const acute = patients.filter((p) => p.status === 'critical' || p.status === 'monitor').length
  const critical = patients.filter((p) => p.status === 'critical').length
  const dischargeReady = patients.filter((p) => p.status === 'discharge').length

  return (
    <div className="px-10 py-8 max-w-[1480px] mx-auto">
      {/* Editorial Masthead */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-9"
      >
        <div className="flex items-end justify-between mb-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">
            {todayMeta.hospital} · Vol. {todayMeta.vol} · No. {todayMeta.issue}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">
            Day {todayMeta.dayOfYear} of MMXXVI · pp. 01—04
          </div>
        </div>

        <div className="rule-double mb-4" />

        <div className="flex items-baseline justify-between gap-8">
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
              The Ward Round
            </h1>
            <p className="italic-serif text-[20px] text-ink-soft mt-3">
              Wednesday, the twenty-third of April · {todayMeta.unit}
            </p>
          </div>

          <div className="text-right shrink-0 pb-2">
            <div className="font-mono text-[10px] smallcaps text-smoke mb-1">Editor on duty</div>
            <div className="font-display text-[18px]" style={{ fontWeight: 600 }}>
              Dr. M. Chen
            </div>
            <div className="italic-serif text-[12px] text-ink-soft">Hospitalist · Attending</div>
          </div>
        </div>

        <div className="rule-thick mt-5" />
      </motion.header>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-px bg-ink/15 mb-10">
        <div className="bg-bone">
          <KPICard
            index={0}
            label="Census"
            value={census}
            unit="pts"
            caption="Stable on the unit · 2 admits expected by EOD"
            delta={{ dir: 'up', value: '+3 since yesterday' }}
          />
        </div>
        <div className="bg-bone">
          <KPICard
            index={1}
            label="Acute"
            value={acute}
            unit="active"
            caption="Patients requiring close observation or escalation"
            delta={{ dir: 'flat', value: 'unchanged' }}
            accent="ochre"
          />
        </div>
        <div className="bg-bone">
          <KPICard
            index={2}
            label="Pending orders"
            value={23}
            unit="open"
            caption="Awaiting pharmacy verification or clinician sign-off"
            delta={{ dir: 'down', value: '−7 since 06:00' }}
            accent="ocean"
          />
        </div>
        <div className="bg-bone">
          <KPICard
            index={3}
            label="Critical"
            value={critical}
            unit="signal"
            caption="Walter Hartmann · NSTEMI cath en route. Karaman ICU stable."
            delta={{ dir: 'up', value: '+1 overnight' }}
            accent="blood"
          />
        </div>
      </div>

      {/* Two-column main */}
      <div className="grid grid-cols-12 gap-10">
        {/* Census table */}
        <section className="col-span-8">
          <SectionHeader
            number="§ 01"
            title="Today's Census"
            subtitle={`${census} patients · admitted by service · last refreshed 08:42`}
          />

          <div className="mt-5">
            {/* Header row */}
            <div className="grid grid-cols-[28px_72px_1fr_120px_72px_56px_120px] gap-3 px-2 pb-2 border-b border-ink/40">
              <div />
              <div className="smallcaps text-[9.5px] text-smoke">Bed</div>
              <div className="smallcaps text-[9.5px] text-smoke">Patient · Diagnosis</div>
              <div className="smallcaps text-[9.5px] text-smoke">Vital trend</div>
              <div className="smallcaps text-[9.5px] text-smoke text-right tnum">HR</div>
              <div className="smallcaps text-[9.5px] text-smoke text-right tnum">SpO₂</div>
              <div className="smallcaps text-[9.5px] text-smoke text-right">Status</div>
            </div>

            {patients.map((p, i) => (
              <motion.button
                key={p.id}
                onClick={() => onPatientSelect(p.id)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.04 }}
                whileHover={{ backgroundColor: 'rgba(236, 231, 219, 0.5)' }}
                className="grid grid-cols-[28px_72px_1fr_120px_72px_56px_120px] gap-3 items-center w-full text-left py-3 px-2 border-b border-rule-soft transition-colors group"
              >
                <span
                  className="font-display text-[14px] leading-none"
                  style={{ color: statusColor[p.status] }}
                  aria-hidden
                >
                  {statusGlyph[p.status]}
                </span>

                <div className="font-mono text-[11px] text-ink-soft tnum leading-tight">
                  <div>{p.bed.split('·')[1]?.trim()}</div>
                  <div className="text-[9px] text-smoke">{p.bed.split('·')[0]?.trim()}</div>
                </div>

                <div className="leading-tight min-w-0">
                  <div className="font-display text-[15px] truncate group-hover:underline underline-offset-4 decoration-rule" style={{ fontWeight: 600 }}>
                    {p.name}
                    <span className="font-mono text-[10px] text-smoke ml-2">
                      {p.age}{p.gender}
                    </span>
                  </div>
                  <div className="italic-serif text-[12.5px] text-ink-soft truncate">
                    {p.diagnosis} {p.flag && <span className="text-ochre">· {p.flag}</span>}
                  </div>
                </div>

                <div className="flex items-center">
                  <Sparkline data={p.vitals.hrTrend} width={110} height={22} color={statusColor[p.status]} strokeWidth={1} />
                </div>

                <div className="text-right font-mono tnum text-[13px]" style={{ color: statusColor[p.status] }}>
                  {p.vitals.hr}
                </div>

                <div className="text-right font-mono tnum text-[13px] text-ink-soft">
                  {p.vitals.spo2}
                </div>

                <div className="text-right">
                  <span
                    className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border"
                    style={{
                      color: statusColor[p.status],
                      borderColor: statusColor[p.status],
                      backgroundColor: p.status === 'critical' ? 'rgba(122,31,31,0.06)' : 'transparent',
                    }}
                  >
                    {statusLabel[p.status]}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Footnote bar */}
          <div className="mt-4 flex items-baseline justify-between text-[11px] text-smoke italic-serif">
            <div>
              ◆ critical · ◐ monitor · ○ stable · ◇ discharge ready
            </div>
            <button className="font-mono uppercase tracking-wider not-italic text-[10px] hover:text-ink underline underline-offset-4 decoration-rule flex items-center gap-1">
              View full census <ArrowUpRight size={11} strokeWidth={1.5} />
            </button>
          </div>
        </section>

        {/* Right rail: Alerts */}
        <aside className="col-span-4">
          <SectionHeader
            number="§ 02"
            title="Active Signals"
            subtitle={`${alerts.length} entries · sorted by priority`}
          />

          <div className="mt-5 border-b border-ink/40">
            {alerts.map((a, i) => (
              <AlertItem key={a.id} alert={a} index={i} />
            ))}
          </div>

          <div className="mt-4 italic-serif text-[11px] text-smoke">
            See sidebar for ward-wide signal feed. Urgent items pulse on the page until acknowledged by the editor on duty.
          </div>
        </aside>
      </div>

      {/* Recent imaging strip */}
      <section className="mt-12">
        <SectionHeader
          number="§ 03"
          title="Recent Imaging Studies"
          subtitle="Reading queue · auto-prioritised by acuity"
        />

        <div className="mt-5 grid grid-cols-4 gap-px bg-ink/15">
          {[
            { study: 'CT · Chest', subject: 'Eleanor Voss', mrn: 'MRN-8847-K', read: 'Pulmonary congestion · bilateral effusions', time: '07:51', acuity: 'routine' },
            { study: 'CT · Coronary', subject: 'Walter Hartmann', mrn: 'MRN-6122-H', read: 'Triple-vessel disease · LAD subtotal', time: '06:18', acuity: 'critical' },
            { study: 'MRI · Brain', subject: 'Naima Abdullahi', mrn: 'MRN-9234-L', read: 'No acute intracranial process', time: '04:12', acuity: 'routine' },
            { study: 'US · Abdomen', subject: 'Camille Beaufort', mrn: 'MRN-8901-K', read: 'Cholelithiasis · pericholecystic fluid', time: '03:44', acuity: 'urgent' },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 + i * 0.08 }}
              className="bg-bone p-5 group cursor-pointer hover:bg-cream/50 transition-colors"
            >
              <div className="hatch h-24 mb-4 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-display text-[28px] text-ink/30" style={{ fontWeight: 700 }}>
                    {s.study.split(' · ')[0]}
                  </span>
                </div>
                <span
                  className="absolute top-2 right-2 font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5"
                  style={{
                    color: s.acuity === 'critical' ? 'var(--blood)' : s.acuity === 'urgent' ? 'var(--ochre)' : 'var(--smoke)',
                    backgroundColor: s.acuity === 'critical' ? 'rgba(244,241,234,0.95)' : 'rgba(244,241,234,0.85)',
                  }}
                >
                  {s.acuity}
                </span>
              </div>
              <div className="font-mono text-[10px] smallcaps text-smoke mb-1">{s.study}</div>
              <div className="font-display text-[15px] mb-1" style={{ fontWeight: 600 }}>
                {s.subject}
              </div>
              <div className="italic-serif text-[12.5px] text-ink-soft leading-snug mb-2">
                {s.read}
              </div>
              <div className="font-mono text-[10px] text-smoke flex items-center justify-between pt-2 border-t border-rule-soft">
                <span>{s.mrn}</span>
                <span>read {s.time}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="mt-14 pt-6 border-t-2 border-ink flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-smoke">
        <span>Memorial General · Internal Medicine · Floor IV — Wing B</span>
        <span>Editor on duty · M. Chen · Pager 8842 · Issue closes 19:00</span>
      </footer>
    </div>
  )
}

function SectionHeader({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink/40 pb-2">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blood">{number}</span>
        <h2 className="font-display text-[22px]" style={{ fontWeight: 700, fontVariationSettings: '"opsz" 24' }}>
          {title}
        </h2>
      </div>
      {subtitle && (
        <div className="italic-serif text-[12px] text-ink-soft">{subtitle}</div>
      )}
    </div>
  )
}
