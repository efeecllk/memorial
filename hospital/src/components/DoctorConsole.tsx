import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Paperclip, ArrowUp, ExternalLink, CheckCircle2, Loader2,
  Mic, X, AlertTriangle,
} from 'lucide-react'
import { todayMeta } from '../lib/data'
import {
  type DepartmentConfig,
  type DeptAISection,
  type DeptMessage,
  type DeptProvenanceModel,
} from '../lib/departments'
import {
  postDiagnose,
  DEMO_DOCTOR_ADDRESS,
  DEMO_CONSENT_REF_REAL,
  GatewayError,
  type DiagnoseResponseWire,
} from '../lib/gateway'

// ─────────────────────────────────────────────────────
// Color systems for visual hierarchy

const ROLE_COLORS = {
  'STT':           { primary: '#6B3F8A', soft: '#EFE6F7' },
  'Router':        { primary: '#1B6478', soft: '#E1EEF2' },
  'Vision base':   { primary: '#3B7338', soft: '#E8F0E5' },
  'Active LoRA':   { primary: '#B8732C', soft: '#F5EBD2' },
  'Reasoning':     { primary: '#B8862B', soft: '#F5EBD2' },
  'Aggregator':    { primary: '#A02520', soft: '#F4DCDA' },
  'KV / overhead': { primary: '#5A5246', soft: '#E8E2D4' },
} as const

const LORA_COLORS = {
  'abdominal_ct':    '#B8732C',
  'musculoskeletal': '#4F7338',
  'chest_xray':      '#962F2F',
  'retinal_oct':     '#B8862B',
  'brain_mri':       '#3B4F7C',
  'dermatology':     '#B8553F',
} as const

const TX_KIND_COLORS: Record<string, string> = {
  'reply attest':    '#A02520',
  'consent record':  '#1B6478',
  'cxr attest':      '#962F2F',
  'admit consent':   '#1B6478',
  'ct abd attest':   '#B8732C',
}

// ─────────────────────────────────────────────────────
// Props + component

type Props = {
  department: DepartmentConfig
}

export function DoctorConsole({ department }: Props) {
  const [messages, setMessages] = useState<DeptMessage[]>(department.initialMessages)
  const [composer, setComposer] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [voiceState, setVoiceState] = useState<'idle' | 'listening'>('idle')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [voiceElapsed, setVoiceElapsed] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const followupsPlayed = useRef(0)

  // reset conversation when department changes
  useEffect(() => {
    setMessages(department.initialMessages)
    setComposer('')
    setIsThinking(false)
    setVoiceState('idle')
    setLiveTranscript('')
    followupsPlayed.current = 0
  }, [department.id])

  // auto-scroll on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isThinking])

  // confirm queued attestations after 4s
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last?.from !== 'ai') return
    const provSec = last.sections.find((s) => s.kind === 'provenance')
    if (!provSec?.attestation || provSec.attestation.status !== 'queued') return

    const t = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === last.id && m.from === 'ai'
            ? {
                ...m,
                sections: m.sections.map((s) =>
                  s.kind === 'provenance' && s.attestation
                    ? { ...s, attestation: { ...s.attestation, status: 'confirmed', block: '1,847,481', finality: '0.7 s' } }
                    : s,
                ),
              }
            : m,
        ),
      )
    }, 4000)
    return () => clearTimeout(t)
  }, [messages])

  // voice listening simulation — builds the department's scripted transcript
  useEffect(() => {
    if (voiceState !== 'listening') return
    setLiveTranscript('')
    setVoiceElapsed(0)

    const script = department.followup.viaVoiceTranscript
    let i = 0
    const tick = setInterval(() => setVoiceElapsed((e) => e + 1), 100)
    const chars = setInterval(() => {
      if (i >= script.length) {
        clearInterval(chars)
        return
      }
      setLiveTranscript(script.slice(0, i + 1))
      i += Math.random() > 0.7 ? 2 : 1
    }, 35)

    return () => {
      clearInterval(chars)
      clearInterval(tick)
    }
  }, [voiceState, department.id, department.followup.viaVoiceTranscript])

  function startVoice() {
    setVoiceState('listening')
  }

  function stopVoice() {
    setComposer((prev) => (prev ? prev + ' ' + liveTranscript : liveTranscript))
    setVoiceState('idle')
    setLiveTranscript('')
  }

  function cancelVoice() {
    setVoiceState('idle')
    setLiveTranscript('')
  }

  function playScriptedFallback(reason: string, time: string) {
    const fu = department.followup
    const sections: DeptAISection[] = [
      {
        kind: 'context',
        title: 'Scripted demo response',
        body: `Gateway unreachable (${reason}). Showing the department's pre-recorded follow-up so the UI remains useful offline.`,
      },
      ...fu.response.sections,
    ]
    setMessages((prev) => [
      ...prev,
      { id: `ai-${Date.now()}`, from: 'ai', time, sections } as DeptMessage,
    ])
    followupsPlayed.current++
  }

  function buildLiveMessage(wire: DiagnoseResponseWire, time: string): DeptMessage {
    const sections: DeptAISection[] = []

    if (wire.routing) {
      sections.push({
        kind: 'context',
        title: 'Routing decision',
        body: `Image classified as ${wire.routing.region} (confidence ${(
          wire.routing.confidence * 100
        ).toFixed(1)}%).`,
      })
    }

    if (wire.vision_output) {
      sections.push({
        kind: 'findings',
        title: 'Vision specialist findings',
        body: wire.vision_output,
      })
    }

    if (wire.reasoning_output) {
      // strip <think>…</think> for display; keep the conclusion paragraph only
      const cleaned = wire.reasoning_output.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      sections.push({
        kind: 'reasoning',
        title: 'Clinical reasoning',
        body: cleaned || wire.reasoning_output,
      })
    }

    sections.push({
      kind: 'recommendation',
      title: 'Aggregated reply',
      body: wire.final_output,
    })

    const models: DeptProvenanceModel[] = wire.provenance.map((p) => ({
      role: p.role,
      name: p.name,
      hash: p.hash,
      invoked: p.invoked,
    }))

    sections.push({
      kind: 'provenance',
      title: 'Ensemble provenance · live',
      models,
      attestation: {
        status: 'confirmed',
        tx: wire.attestation.tx_hash,
        block:
          wire.attestation.block_number !== null && wire.attestation.block_number !== undefined
            ? wire.attestation.block_number.toLocaleString()
            : undefined,
        finality:
          wire.attestation.finality_seconds !== null &&
          wire.attestation.finality_seconds !== undefined
            ? `${wire.attestation.finality_seconds} s`
            : undefined,
      },
    })

    return { id: `ai-${Date.now()}`, from: 'ai', time, sections }
  }

  async function send(viaVoice = false) {
    const text = composer.trim()
    if (!text) return
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    setMessages((prev) => [
      ...prev,
      { id: `m-${Date.now()}`, from: 'doctor', text, time, viaVoice } as DeptMessage,
    ])
    setComposer('')
    setIsThinking(true)

    try {
      const wire = await postDiagnose(
        {
          text,
          consent_ref: DEMO_CONSENT_REF_REAL,
          doctor_address: DEMO_DOCTOR_ADDRESS,
        },
        { timeoutMs: 90_000 },
      )
      setIsThinking(false)
      setMessages((prev) => [...prev, buildLiveMessage(wire, time)])
      followupsPlayed.current++
    } catch (err) {
      setIsThinking(false)
      const reason =
        err instanceof GatewayError
          ? `${err.kind}${err.status ? ' ' + err.status : ''}`
          : 'unknown'
      playScriptedFallback(reason, time)
    }
  }

  return (
    <div className="px-10 py-7 max-w-[1640px] mx-auto">
      <PatientMasthead department={department} />
      <KeyContextStrip department={department} />

      <div className="grid grid-cols-12 gap-8 mt-8" style={{ minHeight: 'calc(100vh - 420px)' }}>
        <section className="col-span-7 flex flex-col min-h-0">
          <SectionHeader
            number="§ 01"
            title="Reading-Room Conversation"
            subtitle={
              voiceState === 'listening'
                ? 'voice intake · audio kept local'
                : `${department.label.toLowerCase()} · attested · scoped to this patient`
            }
            accent={department.accent}
          />

          <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 mt-5 space-y-8 min-h-0" style={{ maxHeight: 'calc(100vh - 540px)' }}>
            {messages.map((m, i) => (
              <MessageBubble key={m.id} message={m} index={i} department={department} />
            ))}
            {isThinking && <ThinkingIndicator />}
          </div>

          <Composer
            department={department}
            value={composer}
            onChange={setComposer}
            onSend={() => send(false)}
            disabled={isThinking || voiceState === 'listening'}
            voiceState={voiceState}
            liveTranscript={liveTranscript}
            voiceElapsed={voiceElapsed}
            onStartVoice={startVoice}
            onStopVoice={() => {
              stopVoice()
              setTimeout(() => send(true), 80)
            }}
            onCancelVoice={cancelVoice}
          />
        </section>

        <aside className="col-span-5">
          <EnsembleConsolePanel department={department} />
        </aside>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Patient masthead

function PatientMasthead({ department }: { department: DepartmentConfig }) {
  const p = department.patient
  return (
    <motion.header initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <div className="flex items-end justify-between mb-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">
            {todayMeta.hospital} · {department.caseLabel}
          </span>
          <DepartmentBadge label={department.label} color={department.accent} />
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">
            {p.courseLabel}
          </span>
        </div>
      </div>

      <div className="rule-double mb-5" />

      <div className="grid grid-cols-12 gap-8 items-end">
        <div className="col-span-7 flex items-end gap-5">
          <div
            className="w-[72px] h-[88px] border flex items-center justify-center shrink-0 relative bg-cream"
            style={{ borderColor: 'var(--ink)' }}
          >
            <span className="font-display text-[34px]" style={{ fontWeight: 700, fontVariationSettings: '"opsz" 144' }}>
              {p.initials}
            </span>
            <span
              className="absolute -bottom-px left-1 right-1 h-px"
              style={{ backgroundColor: department.accent }}
            />
          </div>

          <div className="leading-tight">
            <h1
              className="font-display"
              style={{
                fontSize: '3.6rem',
                lineHeight: 0.95,
                fontWeight: 700,
                letterSpacing: '-0.035em',
                fontVariationSettings: '"opsz" 144',
              }}
            >
              {p.name}
            </h1>
            <p className="italic-serif text-[17px] text-ink-soft mt-2">{p.diagnosis}</p>
          </div>
        </div>

        <div className="col-span-5">
          <div className="grid grid-cols-3 gap-x-6 gap-y-3">
            <DataPair label="MRN" value={p.mrn} />
            <DataPair label="Age · Sex" value={`${p.age} · ${p.gender}`} />
            <DataPair label="Bed" value={p.bed} />
            <DataPair label="Attending" value={`Dr. ${p.attending}`} />
            <DataPair label="Code" value={p.codeStatus} />
            <DataPair label="Course" value={p.courseLabel} />
          </div>
        </div>
      </div>

      <div className="rule-thick mt-6" />
    </motion.header>
  )
}

function DepartmentBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 border"
      style={{ color, borderColor: color, backgroundColor: `${color}14`, fontWeight: 600 }}
    >
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────
// Key context strip (allergies / meds / vitals)

function KeyContextStrip({ department }: { department: DepartmentConfig }) {
  const p = department.patient
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="mt-5 grid grid-cols-3 gap-px bg-ink/15"
    >
      <ContextCell
        icon={<AlertTriangle size={15} strokeWidth={1.4} className="text-blood mt-0.5" />}
        label="Allergies"
        body={p.allergies.join(' · ')}
        labelColor="blood"
      />
      <ContextCell label="Active medications" list={p.meds} />
      <ContextCell label="Most recent vitals" body={p.vitalsSummary} footer="updated · stable" />
    </motion.div>
  )
}

function ContextCell({
  icon, label, body, list, footer, labelColor,
}: { icon?: React.ReactNode; label: string; body?: string; list?: string[]; footer?: string; labelColor?: 'blood' | 'smoke' }) {
  return (
    <div className="bg-bone p-4 flex items-start gap-3">
      {icon}
      <div className="flex-1 min-w-0">
        <div
          className="smallcaps text-[10px] mb-2"
          style={{ color: labelColor === 'blood' ? 'var(--blood)' : 'var(--smoke)' }}
        >
          {label}
        </div>
        {body && (
          <div className="font-display text-[14px] leading-snug" style={{ fontWeight: 500 }}>
            {body}
          </div>
        )}
        {list && (
          <ul className="space-y-1">
            {list.map((m, i) => (
              <li key={i} className="font-display text-[13px] leading-snug" style={{ fontWeight: 500 }}>
                <span className="text-smoke font-mono text-[10px] mr-2 tnum">{String(i + 1).padStart(2, '0')}</span>
                {m}
              </li>
            ))}
          </ul>
        )}
        {footer && (
          <div className="font-mono text-[10px] text-smoke mt-2 pt-2 border-t border-rule-soft">{footer}</div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Shared primitives

function SectionHeader({
  number, title, subtitle, accent,
}: { number: string; title: string; subtitle?: string; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink/40 pb-2">
      <div className="flex items-baseline gap-3">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{ color: accent ?? 'var(--blood)' }}
        >
          {number}
        </span>
        <h2 className="font-display text-[20px]" style={{ fontWeight: 700, fontVariationSettings: '"opsz" 24' }}>
          {title}
        </h2>
      </div>
      {subtitle && <div className="italic-serif text-[12px] text-ink-soft">{subtitle}</div>}
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

// ─────────────────────────────────────────────────────
// Messages

function MessageBubble({
  message, index, department,
}: { message: DeptMessage; index: number; department: DepartmentConfig }) {
  if (message.from === 'doctor') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.05 + index * 0.05 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%]">
          <div className="flex items-baseline justify-end gap-3 mb-1">
            {message.viaVoice && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-ochre flex items-center gap-1">
                <Mic size={9} strokeWidth={1.8} /> dictated
              </span>
            )}
            <span className="italic-serif text-[12px] text-ink-soft">— attending</span>
            <span className="font-mono text-[10px] text-smoke tnum">{message.time}</span>
          </div>
          <div className="border-r-2 border-ink pr-4 py-1">
            <p className="italic-serif text-[15px] leading-relaxed text-ink text-right">{message.text}</p>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05 + index * 0.05 }}
      className="border-l-2 pl-5"
      style={{ borderColor: department.accent }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: department.accent, fontWeight: 600 }}
          >
            {department.label} · ensemble reply
          </span>
          <span className="italic-serif text-[12px] text-ink-soft">
            scoped to {department.patient.name.split(' ')[0]}'s chart
          </span>
        </div>
        <span className="font-mono text-[10px] text-smoke tnum">{message.time}</span>
      </div>

      <div className="space-y-5">
        {message.sections.map((s, i) => (
          <AISectionBlock key={i} section={s} index={i} accent={department.accent} />
        ))}
      </div>
    </motion.div>
  )
}

function AISectionBlock({
  section, index, accent,
}: { section: DeptAISection; index: number; accent: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.15 + index * 0.12 }}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-display text-[15px]" style={{ fontWeight: 700, color: accent }}>
          §
        </span>
        <h3 className="smallcaps text-[11px] text-ink">{section.title}</h3>
      </div>

      {section.body && (
        <p className="font-body text-[14.5px] leading-relaxed text-ink-soft">{section.body}</p>
      )}

      {section.bullets && (
        <ul className="space-y-1.5 mt-1">
          {section.bullets.map((b, i) => (
            <li key={i} className="flex items-baseline gap-3 font-body text-[14px] text-ink-soft leading-relaxed">
              <span className="font-mono text-[10px] tnum text-smoke shrink-0 w-5">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {section.models && (
        <div className="mt-2">
          <div className="grid grid-cols-[110px_1fr_120px_60px] gap-3 py-1 px-1 text-[10px] smallcaps text-smoke border-b border-rule-soft">
            <div>Role</div>
            <div>Model</div>
            <div>Hash</div>
            <div className="text-right">Used</div>
          </div>
          {section.models.map((m, i) => (
            <div key={i} className="grid grid-cols-[110px_1fr_120px_60px] gap-3 py-1.5 px-1 items-baseline border-b border-rule-soft/50">
              <div className="font-mono text-[10px] uppercase text-smoke tracking-wider">{m.role}</div>
              <div className={`font-display text-[13px] ${m.invoked ? '' : 'text-smoke italic'}`} style={{ fontWeight: 500 }}>
                {m.name}
              </div>
              <div className="font-mono text-[10px] text-ink-soft tnum truncate">
                {m.hash.length > 14 ? m.hash.slice(0, 8) + '…' + m.hash.slice(-4) : m.hash}
              </div>
              <div className="text-right">
                {m.invoked ? (
                  <span className="font-mono text-[10px] text-moss">●</span>
                ) : (
                  <span className="font-mono text-[10px] text-rule">○</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {section.attestation && <AttestationRow attestation={section.attestation} />}
    </motion.div>
  )
}

function AttestationRow({ attestation }: { attestation: NonNullable<DeptAISection['attestation']> }) {
  const isConfirmed = attestation.status === 'confirmed'
  return (
    <div className="mt-3 pt-3 border-t border-ink/30">
      <div className="flex items-start gap-3">
        <AnimatePresence mode="wait">
          {isConfirmed ? (
            <motion.div
              key="confirmed"
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <CheckCircle2 size={18} strokeWidth={1.4} className="text-moss mt-0.5 shrink-0" />
            </motion.div>
          ) : (
            <motion.div
              key="queued"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 size={18} strokeWidth={1.4} className="text-ochre mt-0.5 shrink-0" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="smallcaps text-[10px] text-ink">
              {isConfirmed ? 'Attestation · confirmed' : 'Attestation · queued'}
            </span>
            <span className="font-mono text-[10px] text-smoke">Monad mainnet</span>
          </div>
          <div className="font-mono text-[11px] text-ink-soft tnum leading-relaxed">
            tx {attestation.tx}
            {attestation.block && (<><span className="text-smoke"> · </span>block {attestation.block}</>)}
            {attestation.finality && (<><span className="text-smoke"> · </span>finality {attestation.finality}</>)}
          </div>
          {isConfirmed && (
            <button className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ocean hover:text-ink underline underline-offset-4 decoration-ocean/40 flex items-center gap-1">
              View on monad explorer <ExternalLink size={10} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-l-2 border-blood/40 pl-5"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <motion.span className="w-1.5 h-1.5 rounded-full bg-ink-soft" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0 }} />
          <motion.span className="w-1.5 h-1.5 rounded-full bg-ink-soft" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }} />
          <motion.span className="w-1.5 h-1.5 rounded-full bg-ink-soft" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }} />
        </div>
        <span className="italic-serif text-[12.5px] text-ink-soft">
          Loading patient context · invoking reasoning specialist…
        </span>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────
// Composer — includes Whisper voice mode

function Composer({
  department, value, onChange, onSend, disabled,
  voiceState, liveTranscript, voiceElapsed,
  onStartVoice, onStopVoice, onCancelVoice,
}: {
  department: DepartmentConfig
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  voiceState: 'idle' | 'listening'
  liveTranscript: string
  voiceElapsed: number
  onStartVoice: () => void
  onStopVoice: () => void
  onCancelVoice: () => void
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  if (voiceState === 'listening') {
    const seconds = Math.floor(voiceElapsed / 10)
    const tenths = voiceElapsed % 10
    return (
      <div className="mt-5 pt-4 border-t-2 border-ink">
        <div className="bg-cream/50 border p-5" style={{ borderColor: department.accent }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <motion.span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: department.accent }}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.0, repeat: Infinity }}
              />
              <span className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: department.accent }}>
                Listening · Whisper on workstation
              </span>
            </div>
            <span className="font-mono text-[12px] tnum text-ink-soft">
              {String(seconds).padStart(2, '0')}.{tenths} s
            </span>
          </div>

          <div className="min-h-[56px] mb-4">
            {liveTranscript ? (
              <p className="font-body text-[15px] leading-relaxed text-ink">
                {liveTranscript}
                <motion.span
                  className="inline-block w-[2px] h-[15px] bg-ink ml-0.5 align-middle"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              </p>
            ) : (
              <p className="italic-serif text-[14px] text-smoke">
                Speak when ready — transcript will appear as you talk.
              </p>
            )}
          </div>

          <div className="flex items-end justify-center gap-[3px] h-9 mb-4">
            {Array.from({ length: 36 }).map((_, i) => (
              <motion.span
                key={i}
                className="w-[3px] bg-ink/70"
                animate={{
                  height: [4, 6 + Math.abs(Math.sin(i * 0.7 + voiceElapsed * 0.4)) * 26, 4],
                }}
                transition={{
                  duration: 0.4 + (i % 5) * 0.05,
                  repeat: Infinity,
                  delay: i * 0.02,
                  ease: 'easeInOut',
                }}
                style={{ minHeight: '4px' }}
              />
            ))}
          </div>

          <div className="flex items-baseline justify-between font-mono text-[10px] text-smoke pt-3 border-t border-rule-soft">
            <span>Whisper-large-v3-turbo · medical fine-tune · 0x9f3a…c2b1</span>
            <span>transcript will be hashed + attested with reply</span>
          </div>

          <div className="flex items-center justify-end gap-3 mt-4">
            <button
              onClick={onCancelVoice}
              className="px-4 py-2 border border-ink/30 hover:border-ink text-ink-soft hover:text-ink font-display text-[13px] flex items-center gap-2 transition-colors"
              style={{ fontWeight: 500 }}
            >
              <X size={13} strokeWidth={1.5} />
              Cancel
            </button>
            <button
              onClick={onStopVoice}
              disabled={!liveTranscript}
              className="px-4 py-2 text-bone font-display text-[13px] flex items-center gap-2 transition-colors disabled:cursor-not-allowed"
              style={{
                backgroundColor: liveTranscript ? 'var(--ink)' : 'var(--rule)',
                fontWeight: 500,
              }}
            >
              Stop & send
              <ArrowUp size={13} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="flex items-baseline justify-between mt-3 italic-serif text-[11.5px] text-smoke">
          <span>Audio is processed on this workstation; only the transcript and reply hashes ever leave.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-5 pt-4 border-t-2 border-ink">
      <div className="flex items-end gap-3">
        <div className="flex-1 relative">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            rows={2}
            placeholder={`Ask about ${department.patient.name.split(' ')[0]} · attach a study · or press the mic to dictate…`}
            className="w-full bg-cream/40 border border-ink/20 px-4 py-3 font-body text-[14.5px] leading-relaxed text-ink resize-none outline-none focus:border-ink/60 placeholder:italic placeholder:text-smoke transition-colors"
          />
          <div className="absolute top-2 right-3 font-mono text-[9px] smallcaps text-smoke">
            shift + ↵ for newline
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            className="w-10 h-10 border border-ink/30 hover:border-ink/60 flex items-center justify-center text-ink-soft hover:text-ink transition-colors"
            title="Attach study"
          >
            <Paperclip size={15} strokeWidth={1.5} />
          </button>
          <button
            onClick={onStartVoice}
            disabled={disabled}
            className="w-10 h-10 border flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: department.accent,
              borderColor: department.accent + '66',
            }}
            title="Dictate via Whisper · stays on workstation"
          >
            <Mic size={15} strokeWidth={1.6} />
          </button>
          <button
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className="w-10 h-10 bg-ink text-bone hover:bg-blood disabled:bg-rule disabled:text-smoke disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            title="Send"
          >
            <ArrowUp size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between mt-3 italic-serif text-[11.5px] text-smoke">
        <span>
          Replies are scoped to {department.patient.name.split(' ')[0]}'s chart; every reply hashes (input · output · model versions · doctor signature) and writes one attestation to Monad.
        </span>
        <span className="font-mono not-italic text-[10px] uppercase tracking-wider">
          Whisper · {department.allowedLoras.length}&nbsp;LoRAs · reasoner · aggregator · ready
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Right rail — ensemble console scoped to the department

const ALL_LORAS: (keyof typeof LORA_COLORS)[] = [
  'abdominal_ct', 'musculoskeletal', 'chest_xray', 'retinal_oct', 'brain_mri', 'dermatology',
]

function EnsembleConsolePanel({ department }: { department: DepartmentConfig }) {
  return (
    <div className="bg-cream/80 border-l-4 relative h-full pl-7 pr-5 py-6 -my-7 -mr-10" style={{ borderColor: department.accent }}>
      <div className="mb-7">
        <div className="flex items-baseline justify-between mb-2">
          <h2
            className="font-display leading-none"
            style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.025em' }}
          >
            Ensemble Console
          </h2>
          <LiveBadge color={department.accent} />
        </div>
        <div className="rule-double mb-2" />
        <p className="italic-serif text-[12.5px] text-ink-soft">
          Whisper always-on · {department.allowedLoras.length} of 6 LoRAs active for {department.label} · attesting to Monad
        </p>
      </div>

      {/* Models loaded */}
      <PanelSection title="Models loaded" tally="5 / 5 warm" tallyColor="#3B7338">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="grid grid-cols-2 gap-2"
        >
          {[
            { role: 'STT' as const, name: 'Whisper large-v3-turbo', vram: '1.6 GB' },
            { role: 'Router' as const, name: 'ModernBERT', vram: '0.3 GB' },
            { role: 'Vision base' as const, name: 'MedGemma-4B', vram: '3.0 GB' },
            { role: 'Reasoning' as const, name: 'R1-Distill-7B', vram: '4.5 GB' },
            { role: 'Aggregator' as const, name: 'Meerkat-7B', vram: '4.5 GB' },
            { role: 'KV / overhead' as const, name: 'paged · vLLM', vram: '6.0 GB' },
          ].map((m) => {
            const c = ROLE_COLORS[m.role]
            return (
              <div
                key={m.role}
                className="relative bg-bone p-3 pl-3.5 border border-ink/15"
                style={{ borderLeft: `3px solid ${c.primary}` }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="font-mono text-[9px] uppercase tracking-[0.14em] px-1.5 py-px"
                    style={{ color: c.primary, backgroundColor: c.soft }}
                  >
                    {m.role}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#3B7338' }} />
                </div>
                <div className="font-display text-[13px] leading-tight" style={{ fontWeight: 700 }}>
                  {m.name}
                </div>
                <div className="font-mono text-[10px] text-ink-soft mt-1.5 tnum">{m.vram}</div>
              </div>
            )
          })}
        </motion.div>
      </PanelSection>

      {/* LoRA shelf — department filters visibility */}
      <PanelSection
        title="LoRA shelf"
        tally={`${department.allowedLoras.length} active for ${department.label.toLowerCase()}`}
        tallyColor={department.accent}
      >
        <div className="space-y-1">
          {ALL_LORAS.map((name) => {
            const color = LORA_COLORS[name]
            const allowed = department.allowedLoras.includes(name)
            const usedInStudy = department.patient.studies.some((s) => s.lora === name)
            return (
              <div
                key={name}
                className="flex items-center justify-between py-1.5 px-2 bg-bone border-l-[3px] transition-colors"
                style={{
                  borderLeftColor: allowed ? color : 'var(--rule)',
                  opacity: allowed ? 1 : 0.42,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: allowed ? color : 'var(--rule)',
                      boxShadow: usedInStudy ? `0 0 0 2px ${color}33` : 'none',
                    }}
                  />
                  <span
                    className="font-display text-[13px]"
                    style={{
                      fontWeight: allowed ? 700 : 500,
                      color: allowed ? 'var(--ink)' : 'var(--smoke)',
                    }}
                  >
                    {name}
                  </span>
                </div>
                <span
                  className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-px"
                  style={{
                    color: allowed ? '#fff' : 'var(--smoke)',
                    backgroundColor: allowed ? color : 'transparent',
                    border: allowed ? 'none' : '1px solid var(--rule)',
                  }}
                >
                  {usedInStudy ? 'used' : allowed ? 'active' : 'n/a'}
                </span>
              </div>
            )
          })}
        </div>
      </PanelSection>

      {/* Studies */}
      <PanelSection title="Studies on file" tally="this admission" tallyColor="#5A5246">
        <div className="space-y-2.5">
          {department.patient.studies.map((s, i) => {
            const color = s.lora ? LORA_COLORS[s.lora] : '#5A5246'
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
                className="bg-bone border-l-[3px] pl-3.5 pr-3 py-3 hover:bg-cream/40 cursor-pointer transition-colors"
                style={{ borderLeftColor: color }}
              >
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="font-display text-[14px]" style={{ fontWeight: 700 }}>
                    {s.study}
                  </span>
                  <span className="font-mono text-[10px] text-smoke tnum">{s.date}</span>
                </div>
                <p className="italic-serif text-[12.5px] text-ink-soft leading-snug mb-2">{s.read}</p>
                <div className="flex items-baseline justify-between">
                  <span
                    className="font-mono text-[9.5px] uppercase tracking-wider px-1.5 py-0.5"
                    style={{
                      color: color,
                      backgroundColor: `${color}1A`,
                    }}
                  >
                    via · {s.lora ?? 'text only'}
                  </span>
                  <span className="font-mono text-[10px] flex items-center gap-1" style={{ color: '#3B7338' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#3B7338' }} />{' '}
                    attested
                  </span>
                </div>
              </motion.div>
            )
          })}
        </div>
      </PanelSection>

      {/* On-chain ledger */}
      <PanelSection title="On-chain ledger" tally="this chart" tallyColor="#1B6478">
        <ul className="space-y-1">
          {[
            { block: '1,847,481', kind: 'reply attest', tx: '0x9b77…ea12' },
            { block: '1,847,405', kind: 'consent record', tx: '0x5a2b…918f' },
            { block: '1,847,312', kind: 'cxr attest', tx: '0x2e09…bf67' },
            { block: '1,847,201', kind: 'admit consent', tx: '0x8d61…a04e' },
            { block: '1,847,094', kind: 'ct abd attest', tx: '0xc712…3b95' },
          ].map((h, i) => {
            const color = TX_KIND_COLORS[h.kind] ?? '#5A5246'
            return (
              <li
                key={i}
                className="grid grid-cols-[78px_1fr_auto] gap-2 items-baseline py-1.5 px-2 bg-bone border-l-[3px]"
                style={{ borderLeftColor: color }}
              >
                <span className="font-mono text-[10.5px] text-ink-soft tnum">blk {h.block}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider truncate" style={{ color }}>
                  {h.kind}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-ink-soft tnum">{h.tx}</span>
                  <span className="text-[11px] leading-none" style={{ color: '#3B7338' }}>✓</span>
                </div>
              </li>
            )
          })}
        </ul>

        <p className="italic-serif text-[11.5px] text-smoke mt-4 leading-relaxed">
          Audio, raw images and identifiers stay on this workstation. Only hashes,
          signatures and consent references reach Monad.
        </p>
      </PanelSection>
    </div>
  )
}

function LiveBadge({ color = '#3B7338' }: { color?: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 bg-bone border" style={{ borderColor: color }}>
      <div className="relative flex items-center justify-center w-2 h-2">
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
        <span className="relative w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color, fontWeight: 600 }}>
        live
      </span>
    </div>
  )
}

function PanelSection({
  title, tally, tallyColor = '#5A5246', children,
}: {
  title: string
  tally?: string
  tallyColor?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b-2 border-ink">
        <h3 className="font-display text-[14.5px] uppercase" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>
          {title}
        </h3>
        {tally && (
          <span
            className="font-mono text-[9.5px] uppercase tracking-[0.14em]"
            style={{ color: tallyColor, fontWeight: 600 }}
          >
            {tally}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
