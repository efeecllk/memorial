# Plan: Clinical Decision Attestation Layer

Five specialist agents (contract · gateway · frontend · ethics · research) produced the design below. This document is the synthesis — what each specialist concluded, how the pieces interlock, and the build order.

---

## 0. Executive summary

The existing Polyglot-Attest on-chain layer captures what the AI said. This new layer captures **what the doctor actually decided** — and how they got there. One new contract (`ClinicalDecisionAttestation.sol`), one new API endpoint (`/decide`) plus four aggregate reads, a pre-fill-and-edit commit surface in the Doctor Console, a governance framework with HR firewall and kill-switch, and a validation pipeline (ABSI) that discriminates "fast-and-right" from "automation-biased".

**Thesis gear shift**: from "multi-LoRA ensemble attestation" to "multi-LoRA ensemble attestation **+** clinician deliberation attestation, linked atomically". Two novelties, not one. Strengthens the thesis from systems-design to socio-technical-systems contribution with a FAccT-adjacent publishability path.

**Core principle underpinning every design choice**: the clinician is the subject of the *protection*, not the subject of the *measurement*. Every control exists because the null hypothesis is that this measurement should not happen.

---

## 1. The novelty — stated at three levels

**Abstract**: extend the chain of cryptographic trust in medical AI past the inference boundary to include the clinician's act of deliberation, converting automation-bias observation from an academic subject into an operational audit primitive.

**Methods**: atomically link an attested multi-LoRA ensemble inference to a subsequent attested clinical-decision record, where the link itself (inference hash + timestamp ordering + doctor SBT equality + consent continuity) is enforced on-chain and atomically non-separable.

**Artefact**: three pieces — the existing `InferenceAttestation` contract (unchanged), the new `ClinicalDecisionAttestation` contract, and the **linking invariant** inside `attest()` that makes neither record valid in isolation.

---

## 2. The linking invariant (the single cryptographic claim)

Inside `ClinicalDecisionAttestation.attest()`, all must hold atomically or the tx reverts:

- `InferenceAttestation.exists(d.inferenceId)` is true
- `msg.sender` holds a valid `CredentialSBT` license
- `msg.sender == InferenceAttestation.doctorOf(d.inferenceId)` (MVP — care-team relaxation is Section 10)
- `d.timestamp > inference.timestamp` (commit after AI reply)
- `d.activeLoraAtDecision == inference.activeLoraHash` (no retroactive adapter swap)
- `d.consentRef` is still valid and not revoked at commit time
- Outcome–concordance coherence (e.g. `AGREED_VERBATIM ⇒ concordanceBps == 10000`)
- Override outcomes carry a non-zero reason hash and 4-byte tag
- `decisions[decisionId]` does not already exist (idempotency at chain level)

These are five pre-registered negative-control tests for the thesis evaluation. Each MUST revert.

---

## 3. Contract layer (from the Contract Architect)

### Struct (8 slots, packed)

```solidity
struct ClinicalDecision {
    bytes32 inferenceId;            // slot 0  — links to InferenceAttestation
    bytes32 chartEntryHash;         // slot 1  — keccak256(doctor's final chart text)
    bytes32 chartEntryRef;          // slot 2  — opaque hospital pointer (non-PHI)
    bytes32 overrideReasonHash;     // slot 3  — keccak256(free-text reason) or 0x0
    address doctor;                 // slot 4  — doctor wallet
    uint64  timestamp;              // slot 4  — block.timestamp
    uint16  concordanceBps;         // slot 4  — 0..10000
    uint32  deliberationMs;         // slot 5  — server-authoritative
    uint16  editDistanceBps;        // slot 5  — 0..10000
    uint8   followUpQuestionCount;  // slot 5
    uint8   regenerationCount;      // slot 5
    uint8   outcome;                // slot 5  — DecisionOutcome enum
    bytes4  overrideReasonTag;      // slot 5  — SAFE/EXPT/GUID/PT/CTX/OTHR
    bytes32 activeLoraAtDecision;   // slot 6  — denormalized from InferenceAttestation
    bytes32 departmentHash;         // slot 7  — keccak256("CARD") etc.
}
```

Two denormalizations (`activeLoraAtDecision`, `departmentHash`) are pragmatic: aggregate queries by LoRA/department are the thesis's highest-value analytics, and a cross-contract SLOAD per row makes those queries gas-infeasible.

### Functions

- **Write**: `attest(bytes32 decisionId, ClinicalDecision calldata d)` — the only mutator
- **Permissionless reads**: `getDecision(id)`, `decisionsByInference(inferenceId)`
- **Self-only**: `doctorSelfRead(offset, limit)` — gated by `msg.sender == caller` (implicit)
- **Quality-board gated**: `doctorOverrideRate(doctor, start, end)`, `doctorDeliberationStats(...)`
- **k-anonymous aggregates** (reverts if `n < K_ANON_MIN`): `overrideRateForLora`, `overrideRateForDepartment`, `avgDeliberationMs`, `systemWideOutcomeHistogram`

`QualityBoardSBT` is a separate ERC-721 soulbound token mirroring `CredentialSBT`.

### Edit distance: off-chain + bounds check

Computed server-side by the gateway, passed as `uint16` bps. Defended on gas grounds (on-chain token-set Jaccard ≈ 200k calldata gas alone) and on trust coherence (every other field is already gateway-signed; making one field on-chain-verifiable without the others is incoherent). Dispute protocol: auditor subpoenas plain text, recomputes per the published spec (§4 below).

### Events

```solidity
event DecisionAttested(
  bytes32 indexed decisionId,
  address indexed doctor,
  uint8   indexed outcome,
  bytes32 inferenceId, bytes32 activeLoraAtDecision,
  uint16 concordanceBps, uint32 deliberationMs, uint64 timestamp
);

event DecisionOverridden(
  bytes32 indexed decisionId, address indexed doctor, bytes4 indexed overrideReasonTag,
  bytes32 inferenceId, bytes32 overrideReasonHash
);

event AggregateQueried(address indexed caller, bytes32 indexed subjectHash, uint64 windowStart, uint64 windowEnd);
// surveilling the surveillers — every individual-level aggregate read is itself audited
```

### Gas + cost

~215k gas per attestation (8 cold SSTOREs + running accumulators + 2 events + validation). At 1 gwei and a placeholder MON ≈ $0.50, ≈ $0.000108 per record, ≈ $7.85 per hospital per year at 200 decisions/day. Monad's throughput headroom is not a constraint.

### Test plan (22 Foundry tests)

Happy paths (verbatim + override), all validation-rule reverts, access-control rejections on quality-board views, k-anonymity guard below threshold, correctness of aggregation functions, invariant tests (concordance ≤ 10000, override-outcome ⇒ non-zero reason hash), event-indexing sanity, fuzz round-trip.

### Deploy / integration

Additive to existing suite. `InferenceAttestation.sol` untouched — new contract reads it through `IInferenceAttestation` view-only. Requires `exists`, `doctorOf`, `timestampOf`, `activeLoraHashOf` as views on `InferenceAttestation` (add if missing). Deploy sequence: `QualityBoardSBT` first (new), then `ClinicalDecisionAttestation`. Gateway env adds two addresses. Dual-write period of 2 weeks before mainnet promotion.

---

## 4. Gateway layer (from the API Architect)

### Endpoints

| Method | Path | Purpose | Gate |
|---|---|---|---|
| POST | `/decide` | Commit decision + deliberation signals | Doctor JWT |
| GET | `/deliberation/self` | Doctor's own history | Self JWT |
| GET | `/deliberation/department/{id}` | Dept aggregate | `n ≥ 20` |
| GET | `/deliberation/lora/{hash}` | Per-LoRA aggregate | `n ≥ 30` |
| GET | `/deliberation/drift/{setup}` | Time-series | `n ≥ 20` per bucket |

### The concordance algorithm (canonical spec, thesis appendix A.3)

```
INPUT:  ai_text, chart_text
1. s := NFC(s); s := casefold(s)
2. replace char in PUNCT=[.,;:!?()[]{}"'] with ' '
3. collapse \s+ → ' ', strip
4. tokenise by ' '; drop empties
5. D := token-level Levenshtein (Wagner–Fischer; ins/del/sub cost 1)
6. L := max(len(ai), len(chart))
7. edit_distance_bps := min(10000, round(10000*D/L))
8. concordance_bps := 10000 - edit_distance_bps
```

Chosen over ROUGE-L / embedding cosine because: (i) reproducible by any auditor with stdlib, (ii) no recursive "attest the embedding model" dependency, (iii) interpretable as "X of Y tokens changed". **Known limitation — negation trap**: "no evidence of MI" vs "evidence of MI" scores ~95% concordant but means the opposite. Concordance is therefore framed as a **surface audit-trail metric, not a safety metric**. The override-reason code is the explanation carrier; concordance is only the prompt.

### Server-authoritative `deliberation_ms`

Measured from server timestamp at `/diagnose` flush to server timestamp at `/decide` body parse. Client-side `ai_shown_ts_ms` logged for analysis, never on-chain. A `deliberation_session_id` cookie binds all follow-ups so the clock cannot be reset by issuing a fresh follow-up immediately before committing.

### Degraded-privacy mode

If the client withholds raw chart text and sends only `final_output_hash`, gateway writes `concordance_bps = 0xFFFF` as a sentinel with a `concordance_available = false` flag. Most production deployments will prefer this mode — chart text never transits.

### Idempotency

`client_decision_id = keccak256(inference_id ‖ final_output_hash ‖ doctor_wallet ‖ deliberation_session_id)` — deterministic. Double clicks return the prior receipt.

### Submission queue

SQLite-backed FIFO with exponential-retry (5s → 6h, max 10 attempts). On permanent failure the decision is locally valid but **explicitly unattested** — documented in thesis as a degraded-trust state.

### Privacy invariants (enforced in CI)

1. Chart text never leaves gateway memory + trace store
2. Free-text override reason hashed in-process; raw text trace-only
3. Patient pseudonym stripped from all `/deliberation/*` responses
4. Doctor name / employee ID never on-chain (wallet only)
5. Aggregate queries below cohort floor return 409, never a redacted partial
6. Zero-width chars stripped before hashing (no steganographic leak)
7. Trace raw-text TTL 90 days; hashes indefinite

### Indexing

Sidecar Postgres indexer consumes `DecisionAttested` WebSocket stream, writes `pending` at depth 1, promotes to `confirmed` at depth 3. Nightly reconciliation samples 1% of rows against chain.

### Observability

Langfuse trace per `deliberation_session_id`. Prometheus metrics: `decide_latency_seconds`, `concordance_bps` histogram, `onchain_submission_success_total`, `cohort_suppression_total{endpoint}`. **Fast-commit (`deliberation_ms < 2000`) telemetry logs but does not block** — the UI warns, the gateway records, no forced delay.

---

## 5. Frontend layer (from the UX Architect)

### Design philosophy (load-bearing)

1. Language is neutral. No "agreement scores", no green/red badges. Overlap is geometric, not ethical.
2. No surveillance affordances. Nothing should feel like it is being reported upward.
3. Editorial restraint. Fraunces / Newsreader / JetBrains Mono, aged paper, department accents, marks `§ ◆ ○` sparingly. No emoji. No celebratory language. Ever.

### Commit surface — pre-fill + edit paradigm

A bound panel slides up below the latest AI reply, separated by a hairline rule and a `§`. The textarea **pre-fills with the AI's Impression** at 70% opacity; touching it snaps to full opacity. The doctor's position is revealed by their edits, not by a three-button (accept / edit / override) choice — that framing was explicitly rejected as coercive.

### Concordance preview — with a 10-second blackout

Thin 4px horizontal bar, department accent fill, JetBrains Mono number to the right. Copy: *"Your note overlaps 71% with the most recent AI reply."* — chosen over "You agree with the AI 74%" (surveillance-flavoured) and "Concordance: 0.71" (cold). **Hidden for the first 10 seconds** after AI reply so the meter doesn't anchor the doctor before they've formed a position. Below 20% typed content: shows `—`, not a number.

### Override reason modal — tag chips, not radios

Triggered below 60% concordance OR outcome ≥ `PARTIAL_OVERRIDE`. Title: *"§ A note on your reasoning"*. Tag chips (multi-select, optional), not radio buttons — radios imply mutually-exclusive and feel bureaucratic. Free-text field is 280 chars, italic Newsreader. **Skip button is always available** — skipping records `reason: null`, no nagging.

### Deliberation signals footer

One line, 11px mono, muted: `○ 2m 14s since reply · 3 follow-ups · 1 regeneration`. Timer does not tick in real-time past 60s (no stopwatch feel). Never red, never amber. Informational only.

### "Your Ledger" — personal dashboard

New left-rail item. Explicit privacy statement at top (54 words): *"This page is visible only to you. No supervisor, scheduler, or administrator sees what appears here…"*. Every metric has a `?` hover with a *"what this does NOT mean"* disclaimer. No sort-by-concordance (invites self-ranking). Recent-overrides list shows date + reason code + one-line rationale.

### Commit button states (exact copy)

- `Commit to chart →`
- `Signing attestation…`
- `Broadcasting to Monad…`
- `Committed at 14:22:07` (fades to mono after)
- `Retrying · attempt 2 of 5` (warm amber, not red)
- `Queued locally · will attest when connection returns`

### Post-commit

Chart panel collapses to a printed card (serif body retained, timestamp mono). Sliver toast bottom-right: `◆ Attested · Decision 0x7a3f…9f3b · Block 14,228,771 · final in 1.2s · View on Monad explorer →`. 6s auto-dismiss. **No confetti. No checkmarks. No sound.** This is a medical attestation, not a task completion.

### Accessibility

Keyboard flow enumerated, ARIA labels spelt out, colour-blind safe concordance bar (numeric label + hash-pattern texture at threshold), `prefers-reduced-motion` disables pulse + modal-frame animation, focus rings 2px solid department accent never removed.

### Failure modes — explicit

IndexedDB write first, always, before any network call. Retries every 30s with 5-min cap. Idempotent double-commit. 90s timeout → queued state. Override modal saves reason locally on timeout and attaches on retry. Draft corruption offers raw text via `<details>` — we never silently drop work.

---

## 6. Ethics + governance (from the Compliance Architect)

### Access matrix (10 roles × 8 data views — cell values)

- Individual doctor (self): ALLOW on everything of their own, including their personal aggregate and free-text reasons
- Care-team peer: ALLOW on the case-bound decision record only; DENY all historical views
- **Quality Improvement Board**: ALLOW on dept / LoRA / system aggregates with cohort floors; WITH-DOCTOR-CONSENT on personal aggregate; AUDIT-ON-REQUEST on individual (logged, subject notified within 72h)
- Department head: same as QIB on aggregates; DENY on personal
- **Hospital IT security**: DENY on all behavioural data; ALLOW only on hash stream + system counts
- Insurance auditor: AGGREGATE-ONLY at `n ≥ 200`; DENY on everything else
- External regulator (KVKK / OCR): AUDIT-ON-REQUEST with warrant / DPA notice
- **Research board (IRB)**: WITH-IRB-APPROVAL on individual, re-consent required; ALLOW on aggregates
- **Outside public**: DENY on individual; AGGREGATE-ONLY at `n ≥ 500` with ε ≤ 1.0 differential privacy, annual cadence

### Cohort floors

- Department: `n ≥ 30` per 90-day window
- LoRA: `n ≥ 50` per 30-day window
- Hospital-wide: `n ≥ 100` per month
- Insurance: `n ≥ 200`
- Public release: `n ≥ 500` with DP noise

### Three-layer consent

1. **Patient** — explicit new checkbox ("a cryptographic record will be created showing whether my doctor agreed with, modified, or overrode the AI's suggestion"). Declining the attestation layer does not deny AI-assisted care; the inference runs, the attestation doesn't.
2. **Doctor** — institution-wide opt-in at onboarding + per-case `SUPPRESS_ATTESTATION` toggle with no justification required. Fully revocable. Sample wording explicitly reads: *"these records cannot be used in any employment, credentialing, disciplinary, or compensation proceeding against me, and the hospital accepts this limitation contractually."*
3. **Institutional** — 5-way sign-off (CMO + DPO + ethics committee + medical board + doctor-union rep) plus DPIA + IRB review plus Charter of Adoption.

### Retention lifecycle

- On-chain hashes: forever
- Wallet ↔ doctor mapping in hospital HSM: employment + 10 years, then key-shredded
- Individual-level query access expires at 24 months (query-layer enforcement)
- **Right-to-be-forgotten**: EDPB Opinion 28/2022 position — severable cryptographic hashes are not personal data once the mapping is destroyed. Documented in VERBIS filing + consent form.

### HR firewall (the most critical single control)

- **Contractual**: non-negotiable clause in the collective-bargaining agreement with liquidated damages for breach
- **Technical**: HSM holding mapping key is 2-of-3 multisig (DPO + medical-board + union); VLAN segmentation from HR systems; role-denied API (HR tokens cannot reach individual-level endpoints — tested in CI); immutable access log; 72-hour subject-notification on any individual-level read
- **External audit**: annual ISO 27001-scope audit verifies firewall intact
- **Breach response**: liquidated damages trigger, kill-switch engages, 72h KVKK notification, union-chaired incident review, hospital charter revocable

### Regulatory alignment

- HIPAA: BAA + Minimum Necessary satisfied by on-chain hashing; audit controls satisfied by immutable access log
- GDPR Art. 22 (automated decision-making): AI is decision support, attestation is evidence of human-in-the-loop
- GDPR Art. 88 (employment context): the HR firewall is the direct response to "suitable and specific measures"
- EU AI Act Art. 12 (logging), 14 (human oversight), 72 (post-market monitoring): attestation is the canonical audit artefact
- ISO 27789: complementary EHR audit trail with cross-reference
- KVKK: explicit consent basis + VERBIS filing on pseudonymity interpretation

### Kill-switch

On-chain `PAUSED` flag toggled by 3-of-5 multisig (medical-board chair + union rep + ethics-committee chair + DPO + external technical auditor). In-flight commit txs revert; clinical decisions proceed unattested; existing records remain queryable at reduced scope. Resumption requires public CAGC report + remediation + re-vote + doctor re-consent option.

### Research permissions

- No IRB: fully-anonymised aggregates at `n ≥ 500`, internal LoRA retrain signals
- IRB-required: linkage studies to patient outcomes, longitudinal per-clinician cohorts, cross-institution pooling, plain-text override reasons
- Public release: synthetic-only via PATE-GAN / DP tabular synthesiser (ε ≤ 1.0, δ ≤ 1e-6), datasheet per Gebru et al. standard, CAGC pre-approval

### Oversight — Clinical Attestation Governance Committee

7 seats: (1) rotating chair (medical-board ↔ union), (2) union rep, (3) independent bioethicist, (4) patient advocate, (5) DPO, (6) IT-sec lead (non-voting on doctor items), (7) IRB liaison. Quarterly substantive review. Annual public report. Complaint channel via union rep. Retaliation against a complaining doctor is a contract breach.

---

## 7. Research framing (from the Research Analyst)

### The gap, precisely bounded

No prior system attests *both* (a) the full provenance of a medical AI inference — including which LoRA adapter analysed which image, atop which quantised base — *and* (b) the deliberation pattern of the clinician who received that inference, with cryptographic integrity preventing retrospective alteration by vendor or institution.

- Medical-blockchain prior art (**MedRec, BurstIQ, Patientory, Avaneer**): attests data access and consent. Not AI computation, not clinician response.
- Verifiable-inference prior art (**zkML / EZKL, Ritual, Modulus, OpenGradient**): attests that specific weights evaluated. Does not cover composite adapter architectures. Terminates at the model output; clinician boundary out of scope.
- Automation-bias and trust-calibration prior art (**Goddard, Lyell, Tschandl, Reverberi, Bond, Gaube**): measures clinician behaviour in lab studies with post-hoc self-report. No tamper-evident record.
- Deliberation-metric prior art (**Wang 2021, Agarwal 2023, Vasey DECIDE-AI 2022**): defines what to measure. No cryptographic integrity, no linkage to exact model provenance at measurement time.

Joint closure of all four boundaries is the thesis contribution.

### Research questions the layer makes answerable

1. Does a specific LoRA adapter yield a different doctor-override rate than others?
2. Does deliberation time correlate with override rate?
3. Does the reasoning-chain byte-length predict follow-up question count?
4. Do voice-dictated queries produce different deliberation patterns than typed ones?
5. Does per-doctor concordance decrease over the first N days (healthy scepticism learning curve)?
6. Does concordance shift at model-version transitions (change-point analysis)?
7. Does aggregate ABSI correlate with independent expert-reviewed accuracy?
8. When outcome is ESCALATED, does a second attested inference from a different specialty adapter follow within the same consent session?

### ABSI — Automation-Bias Susceptibility Index

`ABSI = w1·(−deliberationMs_z) + w2·concordance_z + w3·(−followupCount_z) + w4·(−regenerationCount_z) + w5·overrideRate_inverse_z`

Weights are learned, not assumed. The function deliberately conflates "fast-and-agreeing" and "anchored" — **the validation pipeline separates them**.

### Validation methodology

**Primary — expert ground truth anchored.** Stratified random sample of 300 attested decisions re-reviewed by two blinded clinician experts. Regress ABSI on expert-accuracy. Examine interaction term `ABSI × (AI_was_wrong)`. A fast-and-correct clinician shows high accuracy when AI is wrong (they caught it); an automation-biased clinician shows an accuracy collapse when AI is wrong. **Metric is validated iff ABSI predicts the accuracy collapse, not overall accuracy.**

**Secondary — injected-error time-to-detect.** Pre-registered synthetic inferences with known plausible errors routed through the system during evaluation. Time-to-detect measured from inference to first attested regeneration / follow-up / override. Low-ABSI clinicians should detect faster and more often. Falsifiable prediction.

**Cohort power.** Cohen's d = 0.4, target ≈ 100 clinicians × 30 decisions each, ≥ 10% injected-error cases. Prototype uses synthetic cohort at this size.

**Stated limitations**: ABSI cannot (i) distinguish agreement from inattention when AI is correct, (ii) separate principled scepticism from contrarianism, (iii) observe offline reasoning (corridor consults, paper sketches), (iv) detect coordinated gaming (deliberate stalling). ABSI is a **screening instrument for cohort-level patterns, not a per-clinician performance score** — and the governance framework (Section 6) enforces that use.

### Thesis chapter outline

- **Ch 1** — Introduction (trust boundary collapse; contribution at three levels)
- **Ch 2** — Background (SLMs, LoRA, on-chain primitives, clinical-AI ethics)
- **Ch 3** — Multi-LoRA ensemble design (Whisper / ModernBERT / MedGemma + 6 adapters / DeepSeek-R1 / Meerkat-7B)
- **Ch 4** — Inference attestation schema with `isLoraOfBase` invariant
- **Ch 5** *(new)* — Clinical decision attestation schema + linking invariant + negative controls
- **Ch 6** *(new / expanded)* — Privacy, ethics, governance framework
- **Ch 7** — Implementation (Monad, Solidity 0.8.24, Foundry) + evaluation (synthetic cycles + ABSI validation)
- **Ch 8** — Limitations: proof-of-inference gap (zk-ML not closed for composite LoRA ensembles), metric validation at scale, drift
- **Ch 9** — Conclusion

### Publication targets

AMIA Annual Symposium · ACM FAccT · CHIL · IEEE S&P · npj Digital Medicine · MICCAI TMI/FAIMI workshops · EMNLP Industry

### Key citations

Goddard 2012/2014 (automation bias · JAMIA) · Lyell & Coiera 2017 (verification complexity · JAMIA) · Lyell Magrabi Coiera 2018 (cognitive load · JBI) · Tschandl 2020 (skin cancer · Nature Med) · Reverberi 2022 (fake AI advice · Sci Rep) · Bond 2023 (incorrect AI advice · Radiology) · Gaube 2023 (specialty modulation · Sci Rep) · Ly Shekelle Song 2023 (anchoring · JAMA IM) · Vasey 2022 (DECIDE-AI · Nature Med) · Agarwal 2023 (deferral metrics · npj Digital Med) · Azaria 2016 (MedRec · OBD) · Kuo Rojas Ohno-Machado 2019 (blockchain survey · JAMIA) · Hasselgren 2020 (blockchain scoping · IJMI) · Kang 2022 (trustless DNN · arXiv) · Ajunwa Crawford Schultz 2017 (workplace monitoring · Cal LR) · Adler-Milstein 2020 (EHR burnout · JGIM) · NASEM 2019 (clinician burnout) · Tversky Kahneman 1974 (anchoring · Science) · Croskerry 2003 (diagnostic dispositions · Acad Med) · Okamura Yamada 2024 (trust calibration · JMIR FR) · Rajpurkar 2023 (stakeholder trust · Eur Radiol).

---

## 8. Build sequence (dependency-ordered, no time estimates)

### Phase A · Foundation

- Draft `ClinicalDecisionAttestation.sol` per the struct + function spec
- Draft `QualityBoardSBT.sol` (mirrors `CredentialSBT`)
- Extend `InferenceAttestation.sol` view surface if `exists`, `doctorOf`, `timestampOf`, `activeLoraHashOf` are missing
- Write 22 Foundry tests (happy paths, every validation rule, access control, k-anonymity guard, invariants, fuzz round-trip)
- Deploy to Monad testnet; verify gas profile matches ≈ 215k target

### Phase B · Gateway

- Add Pydantic schemas (`DecisionCommitRequest`, `DecisionAttestationReceipt`, `SelfDecisionRecord`, `DepartmentAggregates`, `ConcordanceDistribution`)
- Implement the canonical concordance algorithm (appendix A.3) with unit tests on known vectors
- Implement server-authoritative `deliberation_ms` tracking via `deliberation_session_id` cookie
- Implement the six override-reason-code taxonomy with sanitisation pipeline (NFC + zero-width strip + 512-char cap)
- Implement signing + idempotent submission queue (SQLite FIFO, exponential retry)
- Add `/decide` endpoint; add the four `/deliberation/*` read endpoints with cohort-floor enforcement
- Add privacy-invariants CI test (7 invariants, fixture with PHI-shaped content)
- Deploy sidecar Postgres indexer; verify chain-event → index latency

### Phase C · Frontend

- Build the chart-entry commit panel with pre-fill + edit + draft persistence (IndexedDB)
- Implement concordance bar with 10-second blackout and live throttled updates
- Implement inline diff view (single-column, department accent additions, strike-through removals)
- Build the override-reason modal with tag chips + optional free-text + skip button
- Add deliberation-signals footer (mono, muted, non-ticking past 60s)
- Build "Your Ledger" personal dashboard with metric-honesty tooltips and privacy statement
- Wire commit button through all 7 states with exact copy
- Implement failure-mode handling (IndexedDB-first, queued state, idempotent double-commit)
- Full a11y audit (ARIA, colour-blind safety, reduced-motion variants, focus rings)

### Phase D · Governance & ethics

- Draft Charter of Adoption + contractual clause + consent wordings (patient, doctor, institutional)
- Set up CAGC membership + operating procedures
- Implement HR-firewall technical enforcement (keystore multisig, VLAN rules, role-denied API policy, access-log publishing)
- Deploy kill-switch multisig (3-of-5) + tested pause/resume drill
- Publish DPIA + VERBIS filing per KVKK
- File IRB protocol (the measurement layer is human-subjects research regardless of framing)

### Phase E · Evaluation

- Build synthetic scenario generator (3 case distributions × 3 doctor profiles × 500 cycles)
- Run ablation (with vs without decision layer)
- Run all five negative-control tests
- Run ABSI validation on synthetic cohort (primary: expert ground truth on 300 sampled decisions; secondary: injected-error time-to-detect)
- Write up Ch 5, Ch 6, Ch 7 of thesis

### Phase F · Publication

- AMIA full-paper submission (systems + evaluation)
- FAccT submission (governance framing + socio-technical contribution)
- npj Digital Medicine or Lancet Digital Health (applied clinical framing)

---

## 9. Open questions the thesis does not answer

1. **Cheaper proxies for clinician independence** — can observational, non-cryptographic logging approximate ABSI well enough for small clinics that cannot host chain infrastructure?
2. **Personalised clinician training** — should curricula adapt to individual deliberation profiles, and does adapting training shift ABSI without inducing metric gaming?
3. **Multi-reviewer workflows** — extending the decision-attestation schema to tumour boards and multi-disciplinary teams where one inference informs many clinicians who debate before a consensus commit.
4. **Legal evidentiary weight** — admissibility and weight of on-chain attestations in malpractice and regulatory-enforcement contexts is a legal-scholarship question the thesis raises but does not settle.
5. **Ambient mode** — extending to always-on ambient STT / vision where "commit" is not a discrete event but a continuous stream, without inflating chain footprint or surveillance surface.
6. **Adversarial gaming** — if clinicians learn the ABSI formula, can they trivially game it? Commit-reveal on deliberation time may preserve signal; untested.
7. **Proof-of-inference closure** — integrating zk-ML attestation for composite LoRA ensembles (current EZKL / Modulus toolchains don't natively support adapter-merge operation).
8. **Care-team attestation** — MVP restricts `msg.sender == inference.doctor`. Night-shift covering physicians and tumour boards need a care-team multisig. Proposed `CareTeamRegistry` sidecar contract; punted to v1.1.

---

## 10. Go / no-go criteria before thesis defence

- All 22 Foundry tests pass on mainnet deployment
- Seven privacy invariants enforced in gateway CI
- ABSI validated on synthetic cohort (primary validation interaction significant at p < 0.05)
- All five negative controls revert atomically as specified
- HR firewall external-audit letter obtained
- CAGC charter signed by all 5 institutional stakeholders
- Patient consent wording approved by IRB
- Doctor consent wording approved by union (or faculty association)
- Kill-switch pause/resume drill executed and documented

Any single failed criterion blocks defence — not because the committee will enforce them, but because the thesis's contribution claim collapses without them. The design is the defence.
