import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, AlertTriangle, ShieldAlert, Pill, FlaskConical, Activity, FileText } from 'lucide-react'
import { patients, medicationsByPatient, labsByPatient, todayMeta } from '../lib/data'
import type { Medication, LabResult, Patient } from '../lib/data'
import { VitalCard } from './VitalCard'
import { Sparkline } from './Sparkline'

type Props = {
  patientId: string
  onBack: () => void
}

type Tab = 'overview' | 'meds' | 'labs' | 'imaging' | 'notes'

export function PatientDetail({ patientId, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const patient = patients.find((p) => p.id === patientId) || patients[0]
  const meds = medicationsByPatient[patient.id] || medicationsByPatient.p001
  const labs = labsByPatient[patient.id] || labsByPatient.p001

  const isCritical = patient.status === 'critical'

  return (
    <div className="px-10 py-8 max-w-[1480px] mx-auto">
      {/* Breadcrumb / back */}
      <motion.button
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        onClick={onBack}
        className="flex items-center gap-2 mb-6 italic-serif text-[13px] text-ink-soft hover:text-ink transition-colors group"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        <span className="underline underline-offset-4 decoration-rule">Return to Ward Round</span>
      </motion.button>

      {/* Patient masthead */}
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke mb-2">
          Patient Record · Issue {todayMeta.issue} · Day {patient.admittedDay} of admission
        </div>

        <div className="rule-double mb-5" />

        <div className="grid grid-cols-12 gap-8 items-end">
          <div className="col-span-7">
            <h1
              className="font-display"
              style={{
                fontSize: '4.0rem',
                lineHeight: 0.94,
                fontWeight: 700,
                letterSpacing: '-0.035em',
                fontVariationSettings: '"opsz" 144',
              }}
            >
              {patient.name}
            </h1>
            <p className="italic-serif text-[18px] text-ink-soft mt-2">
              {patient.diagnosis}
            </p>
          </div>

          <div className="col-span-5">
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              <DataPair label="MRN" value={patient.mrn} />
              <DataPair label="Bed" value={patient.bed} />
              <DataPair label="Age · Sex" value={`${patient.age} · ${patient.gender}`} />
              <DataPair label="Attending" value={`Dr. ${patient.attending}`} />
              <DataPair label="Code" value={patient.codeStatus} accent={patient.codeStatus !== 'Full Code' ? 'blood' : 'ink'} />
              <DataPair label="LOS" value={`${patient.admittedDay} d`} />
            </div>
          </div>
        </div>

        <div className="rule-thick mt-6" />
      </motion.header>

      {/* Banners */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-5 grid grid-cols-2 gap-px bg-ink/15"
      >
        {/* Allergies */}
        <div className="bg-bone p-5 flex items-start gap-3">
          <AlertTriangle size={18} strokeWidth={1.4} className="text-blood mt-0.5 shrink-0" />
          <div>
            <div className="smallcaps text-[10px] text-blood mb-1">Allergies</div>
            <div className="font-display text-[15px] leading-snug" style={{ fontWeight: 500 }}>
              {patient.allergies.join(' · ')}
            </div>
          </div>
        </div>

        {/* Active concerns */}
        <div className="bg-bone p-5 flex items-start gap-3">
          <ShieldAlert size={18} strokeWidth={1.4} className={isCritical ? 'text-blood mt-0.5 shrink-0' : 'text-ochre mt-0.5 shrink-0'} />
          <div>
            <div className="smallcaps text-[10px] mb-1" style={{ color: isCritical ? 'var(--blood)' : 'var(--ochre)' }}>
              Active concern
            </div>
            <div className="font-display text-[15px] leading-snug" style={{ fontWeight: 500 }}>
              {patient.flag || 'No active escalations · routine monitoring'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Vitals row */}
      <section className="mt-10">
        <SectionHeader number="§ 01" title="Vital Signs" subtitle="Live · last 12 readings · refreshed every 5 min" />

        <div className="mt-5 grid grid-cols-5 gap-px bg-ink/15">
          <VitalCard
            index={0}
            label="Heart rate"
            value={String(patient.vitals.hr)}
            unit="bpm"
            trend={patient.vitals.hrTrend}
            status={patient.vitals.hr > 100 ? 'caution' : patient.vitals.hr > 110 ? 'critical' : 'normal'}
            ref="60 — 100"
          />
          <VitalCard
            index={1}
            label="Blood pressure"
            value={`${patient.vitals.bp.systolic}/${patient.vitals.bp.diastolic}`}
            unit="mmHg"
            trend={patient.vitals.bpTrend}
            status={patient.vitals.bp.systolic > 140 ? 'caution' : patient.vitals.bp.systolic < 100 ? 'caution' : 'normal'}
            ref="< 140 / < 90"
          />
          <VitalCard
            index={2}
            label="SpO₂"
            value={String(patient.vitals.spo2)}
            unit="%"
            trend={patient.vitals.spo2Trend}
            status={patient.vitals.spo2 < 92 ? 'critical' : patient.vitals.spo2 < 95 ? 'caution' : 'normal'}
            ref="≥ 95"
          />
          <VitalCard
            index={3}
            label="Temperature"
            value={patient.vitals.temp.toFixed(1)}
            unit="°C"
            trend={patient.vitals.tempTrend}
            status={patient.vitals.temp > 38.0 ? 'caution' : 'normal'}
            ref="36.1 — 37.5"
          />
          <VitalCard
            index={4}
            label="Resp. rate"
            value={String(patient.vitals.rr)}
            unit="/min"
            trend={[patient.vitals.rr, patient.vitals.rr - 1, patient.vitals.rr, patient.vitals.rr + 1, patient.vitals.rr, patient.vitals.rr - 1, patient.vitals.rr, patient.vitals.rr, patient.vitals.rr - 1, patient.vitals.rr + 1, patient.vitals.rr, patient.vitals.rr]}
            status={patient.vitals.rr > 20 ? 'caution' : 'normal'}
            ref="12 — 20"
          />
        </div>
      </section>

      {/* Tabs */}
      <section className="mt-12">
        <div className="flex items-end justify-between border-b-2 border-ink mb-6">
          <div className="flex items-end">
            <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<FileText size={13} strokeWidth={1.5} />}>
              Overview
            </TabButton>
            <TabButton active={tab === 'meds'} onClick={() => setTab('meds')} icon={<Pill size={13} strokeWidth={1.5} />}>
              Medications <span className="font-mono text-[10px] text-smoke ml-1.5 tnum">{meds.length}</span>
            </TabButton>
            <TabButton active={tab === 'labs'} onClick={() => setTab('labs')} icon={<FlaskConical size={13} strokeWidth={1.5} />}>
              Labs <span className="font-mono text-[10px] text-smoke ml-1.5 tnum">{labs.length}</span>
            </TabButton>
            <TabButton active={tab === 'imaging'} onClick={() => setTab('imaging')} icon={<Activity size={13} strokeWidth={1.5} />}>
              Imaging
            </TabButton>
            <TabButton active={tab === 'notes'} onClick={() => setTab('notes')} icon={<FileText size={13} strokeWidth={1.5} />}>
              Notes
            </TabButton>
          </div>

          <div className="font-mono text-[10px] smallcaps text-smoke pb-3">
            Reading time · approx 4 min
          </div>
        </div>

        <AnimatePresence mode="wait">
          {tab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <Overview patient={patient} />
            </motion.div>
          )}
          {tab === 'meds' && (
            <motion.div
              key="meds"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <Medications meds={meds} />
            </motion.div>
          )}
          {tab === 'labs' && (
            <motion.div
              key="labs"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <Labs labs={labs} />
            </motion.div>
          )}
          {tab === 'imaging' && (
            <motion.div
              key="imaging"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <ImagingTab />
            </motion.div>
          )}
          {tab === 'notes' && (
            <motion.div
              key="notes"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <NotesTab patientName={patient.name} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}

function DataPair({ label, value, accent = 'ink' }: { label: string; value: string; accent?: 'ink' | 'blood' }) {
  return (
    <div className="leading-tight">
      <div className="font-mono text-[9px] smallcaps text-smoke mb-0.5">{label}</div>
      <div
        className="font-display text-[14px]"
        style={{ fontWeight: 600, color: accent === 'blood' ? 'var(--blood)' : 'var(--ink)' }}
      >
        {value}
      </div>
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
      {subtitle && <div className="italic-serif text-[12px] text-ink-soft">{subtitle}</div>}
    </div>
  )
}

function TabButton({ children, active, onClick, icon }: { children: React.ReactNode; active?: boolean; onClick?: () => void; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-5 pb-3 pt-2 font-display text-[14px] transition-colors ${
        active ? 'text-ink' : 'text-ink-soft hover:text-ink'
      }`}
      style={{ fontWeight: active ? 600 : 500 }}
    >
      {icon}
      {children}
      {active && <span className="absolute -bottom-[2px] left-0 right-0 h-[3px] bg-blood" />}
    </button>
  )
}

// Tab content components

function Overview({ patient }: { patient: Patient }) {
  return (
    <div className="grid grid-cols-12 gap-10">
      <div className="col-span-7">
        <article className="dropcap font-body text-[15px] leading-relaxed text-ink-soft">
          <span className="font-display text-ink" style={{ fontWeight: 600 }}>{patient.name}</span> is a {patient.age}-year-old {patient.gender === 'F' ? 'female' : 'male'} admitted to {patient.bed} on day {patient.admittedDay} for{' '}
          <em className="text-ink">{patient.diagnosis.toLowerCase()}</em>. The presentation has been{' '}
          {patient.status === 'critical' ? 'severe and warrants close hour-by-hour reassessment' : patient.status === 'monitor' ? 'consistent with the working diagnosis and is responding to therapy as expected' : 'stable and uncomplicated, with steady clinical improvement'}.
          {patient.flag && (<> Notable today: <span className="italic text-ochre">{patient.flag.toLowerCase()}</span>.</>)}
          <br /><br />
          The patient remains under the care of <span className="font-display text-ink" style={{ fontWeight: 600 }}>Dr. {patient.attending}</span>, with input from the on-call team. Code status is documented as <span className="font-display text-ink" style={{ fontWeight: 600 }}>{patient.codeStatus}</span>. Allergy list reviewed at admission and confirmed at this morning's round.
        </article>

        <div className="mt-8 pt-5 border-t border-rule">
          <div className="smallcaps text-[10px] text-smoke mb-3">Active problems</div>
          <ul className="space-y-2.5 italic-serif text-[14px]">
            <li className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] text-blood tnum w-6">1.</span>
              <span>Acute decompensated heart failure with preserved ejection fraction · diuresis ongoing</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] text-blood tnum w-6">2.</span>
              <span>Atrial fibrillation · rate-controlled · therapeutic on apixaban</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] text-blood tnum w-6">3.</span>
              <span>Chronic kidney disease, stage 3a · Cr trending stable</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] text-blood tnum w-6">4.</span>
              <span>Type 2 diabetes mellitus · sliding scale insulin · A1c 7.4% on admission</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="col-span-5">
        <div className="border-l border-ink/40 pl-6">
          <div className="smallcaps text-[10px] text-smoke mb-3">Plan for today</div>
          <ul className="space-y-3 italic-serif text-[14px] text-ink-soft">
            <li className="flex items-baseline gap-3">
              <span className="font-display text-ochre">·</span>
              <span>Continue diuresis · target net 1.5 L negative</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-display text-ochre">·</span>
              <span>Recheck BMP at 14:00 · monitor K⁺ &amp; Cr</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-display text-ochre">·</span>
              <span>Echo today if cath lab schedule permits</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-display text-ochre">·</span>
              <span>Family meeting · 13:30 · goals of care</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="font-display text-ochre">·</span>
              <span>Anticipated discharge in 2 — 3 days pending diuresis</span>
            </li>
          </ul>

          <div className="mt-8 pt-5 border-t border-rule">
            <div className="smallcaps text-[10px] text-smoke mb-3">Care team</div>
            <div className="space-y-2 text-[13px]">
              {[
                { role: 'Attending', name: 'Dr. M. Chen', tag: 'Hospitalist' },
                { role: 'Resident', name: 'Dr. S. Whitford', tag: 'PGY-2' },
                { role: 'Nurse', name: 'A. Okafor', tag: 'RN · 4B days' },
                { role: 'PharmD', name: 'J. Walker', tag: 'Floor pharmacist' },
                { role: 'Case mgr', name: 'L. Hidalgo', tag: 'MSW' },
              ].map((m) => (
                <div key={m.role} className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] smallcaps text-smoke w-16 shrink-0">{m.role}</span>
                  <span className="font-display flex-1 truncate" style={{ fontWeight: 600 }}>{m.name}</span>
                  <span className="italic-serif text-[11px] text-ink-soft shrink-0">{m.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Medications({ meds }: { meds: Medication[] }) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_90px_60px_70px_120px_120px_1fr] gap-4 px-3 pb-2 border-b border-ink/40 smallcaps text-[9.5px] text-smoke">
        <div>Drug</div>
        <div>Dose</div>
        <div>Route</div>
        <div>Freq.</div>
        <div>Last given</div>
        <div>Next due</div>
        <div>Indication</div>
      </div>

      {meds.map((m, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.04 }}
          className="grid grid-cols-[1fr_90px_60px_70px_120px_120px_1fr] gap-4 items-baseline py-3 px-3 border-b border-rule-soft hover:bg-cream/40 transition-colors"
        >
          <div className="font-display text-[15px]" style={{ fontWeight: 600 }}>
            {m.name}
          </div>
          <div className="font-mono text-[12px] tnum">{m.dose}</div>
          <div className="font-mono text-[11px] uppercase text-ink-soft">{m.route}</div>
          <div className="font-mono text-[11px] uppercase text-ink-soft">{m.frequency}</div>
          <div className="font-mono text-[11px] tnum text-ink-soft">{m.lastAdmin}</div>
          <div className="font-mono text-[11px] tnum text-ochre">{m.nextDue}</div>
          <div className="italic-serif text-[12.5px] text-ink-soft">{m.indication}</div>
        </motion.div>
      ))}

      <div className="mt-6 italic-serif text-[12px] text-smoke">
        Showing active medications only · discontinued drugs available in the pharmacy ledger.
      </div>
    </div>
  )
}

function Labs({ labs }: { labs: LabResult[] }) {
  return (
    <div className="grid grid-cols-12 gap-10">
      <div className="col-span-8">
        <div className="grid grid-cols-[1fr_100px_80px_120px_70px] gap-4 px-3 pb-2 border-b border-ink/40 smallcaps text-[9.5px] text-smoke">
          <div>Panel</div>
          <div className="text-right">Value</div>
          <div>Unit</div>
          <div>Reference</div>
          <div className="text-right">Drawn</div>
        </div>

        {labs.map((l, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.04 }}
            className="grid grid-cols-[1fr_100px_80px_120px_70px] gap-4 items-baseline py-3 px-3 border-b border-rule-soft"
          >
            <div className="font-display text-[14.5px]" style={{ fontWeight: 600 }}>
              {l.panel}
              {l.flag === 'critical' && (
                <span className="font-mono text-[9px] uppercase tracking-wider text-blood ml-2 px-1.5 py-0.5 border border-blood">crit</span>
              )}
            </div>
            <div
              className="font-display text-[18px] text-right tnum"
              style={{
                fontWeight: 600,
                color: l.flag === 'critical' ? 'var(--blood)' : l.flag === 'high' || l.flag === 'low' ? 'var(--ochre)' : 'var(--ink)',
              }}
            >
              {l.value}
              {l.flag === 'high' && <span className="text-[12px] ml-0.5 text-ochre">↑</span>}
              {l.flag === 'low' && <span className="text-[12px] ml-0.5 text-ochre">↓</span>}
            </div>
            <div className="font-mono text-[11px] text-ink-soft">{l.unit}</div>
            <div className="font-mono text-[11px] text-smoke">{l.ref}</div>
            <div className="font-mono text-[11px] text-smoke text-right tnum">{l.drawnAt}</div>
          </motion.div>
        ))}
      </div>

      <aside className="col-span-4">
        <div className="border-l border-ink/40 pl-6">
          <div className="smallcaps text-[10px] text-smoke mb-3">Trend · NT-proBNP</div>
          <div className="font-display text-[36px] leading-none tnum" style={{ fontWeight: 600, fontVariationSettings: '"opsz" 144' }}>
            4,820
          </div>
          <div className="italic-serif text-[12px] text-ochre mt-1">↓ from 6,140 yesterday</div>
          <div className="mt-4">
            <Sparkline data={[6800, 6500, 6140, 5900, 5400, 5100, 4980, 4900, 4850, 4830, 4820, 4820]} width={240} height={48} color="var(--ochre)" strokeWidth={1.5} fill />
          </div>

          <div className="mt-8 pt-5 border-t border-rule">
            <div className="smallcaps text-[10px] text-smoke mb-3">Pending</div>
            <ul className="space-y-2 italic-serif text-[13px]">
              <li className="flex items-baseline justify-between gap-2">
                <span>BMP · 14:00</span>
                <span className="font-mono text-[10px] text-smoke">in 5h 18m</span>
              </li>
              <li className="flex items-baseline justify-between gap-2">
                <span>Coag · 18:00</span>
                <span className="font-mono text-[10px] text-smoke">in 9h 18m</span>
              </li>
            </ul>
          </div>
        </div>
      </aside>
    </div>
  )
}

function ImagingTab() {
  return (
    <div className="grid grid-cols-3 gap-6">
      {[
        { study: 'CT · Chest', date: '23 Apr · 07:51', read: 'Pulmonary congestion with bilateral pleural effusions, right greater than left. Cardiomegaly. No acute consolidation.' },
        { study: 'Echo · TTE', date: '21 Apr · 14:02', read: 'LVEF 35%. Severe diastolic dysfunction. Mild MR. Right ventricular function preserved.' },
        { study: 'CXR · Portable', date: '20 Apr · 22:18', read: 'Improving pulmonary vascular congestion. Stable cardiac silhouette.' },
      ].map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.08 }}
          className="border-t-2 border-ink pt-3"
        >
          <div className="hatch h-44 mb-4 flex items-center justify-center relative">
            <span className="font-display text-[42px] text-ink/30" style={{ fontWeight: 700 }}>
              {s.study.split(' · ')[0]}
            </span>
            <span className="absolute bottom-2 right-2 font-mono text-[9px] text-smoke">DICOM · ANON</span>
          </div>
          <div className="font-display text-[15px] mb-1" style={{ fontWeight: 600 }}>{s.study}</div>
          <div className="font-mono text-[10px] smallcaps text-smoke mb-2">{s.date}</div>
          <div className="italic-serif text-[12.5px] text-ink-soft leading-snug">{s.read}</div>
        </motion.div>
      ))}
    </div>
  )
}

function NotesTab({ patientName }: { patientName: string }) {
  return (
    <div className="grid grid-cols-12 gap-10">
      <article className="col-span-8 dropcap font-body text-[15px] leading-relaxed text-ink-soft">
        Progress note · 23 April, 08:42 · M. Chen, MD.
        <br /><br />
        {patientName} continues to respond well to ongoing diuresis. Net negative 2.3 L over the past 24 hours with improving exercise tolerance reported on morning round. Auscultation reveals reduced bibasilar crackles compared with prior; jugular venous pressure now 7 cm. The patient denies new chest pain, dyspnoea at rest, or palpitations. Appetite improving.
        <br /><br />
        Renal function remains stable; creatinine has plateaued at 1.42 mg/dL with potassium replaced as required. NT-proBNP showing favourable trend. Plan to continue current GDMT, recheck BMP this afternoon, and pursue echocardiography at first availability. Family meeting arranged for 13:30 to discuss goals of care and anticipated discharge planning over the next 48 — 72 hours.
        <br /><br />
        Of note, the patient's daughter, Sarah, has expressed concern regarding home support after discharge. Case management notified; outpatient resources to be coordinated.
      </article>

      <aside className="col-span-4">
        <div className="border-l border-ink/40 pl-6">
          <div className="smallcaps text-[10px] text-smoke mb-3">Earlier notes</div>
          <ul className="space-y-3 text-[13px]">
            {[
              { date: '22 Apr · 09:12', author: 'Dr. M. Chen', preview: 'Diuresis tolerated well overnight…' },
              { date: '21 Apr · 19:48', author: 'Dr. S. Whitford', preview: 'Evening progress · vital signs stable…' },
              { date: '21 Apr · 08:30', author: 'Dr. M. Chen', preview: 'Initial admission assessment complete…' },
              { date: '20 Apr · 22:14', author: 'Dr. K. Reyes', preview: 'ED handoff · admitted for ADHF…' },
            ].map((n, i) => (
              <li key={i} className="pb-3 border-b border-rule-soft">
                <div className="font-mono text-[10px] text-smoke">{n.date}</div>
                <div className="font-display text-[13px] mt-0.5" style={{ fontWeight: 600 }}>{n.author}</div>
                <div className="italic-serif text-[12px] text-ink-soft mt-0.5">{n.preview}</div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
