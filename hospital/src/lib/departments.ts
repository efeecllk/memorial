// Per-department console configurations. Each department scopes its Doctor
// Console to a specific patient, a relevant subset of the 6 medvision LoRAs,
// an accent colour, and a pre-loaded opening conversation. Whisper (STT) is
// universally available in every department.

export type BodyRegion =
  | "abdominal_ct"
  | "musculoskeletal"
  | "chest_xray"
  | "retinal_oct"
  | "brain_mri"
  | "dermatology";

export type DepartmentId =
  | "internal_medicine"
  | "cardiology"
  | "neurology"
  | "oncology"
  | "emergency"
  | "surgery"
  | "pediatrics"
  | "icu";

export type DeptPatient = {
  name: string;
  initials: string;
  age: number;
  gender: "M" | "F";
  mrn: string;
  bed: string;
  diagnosis: string;
  attending: string;
  courseLabel: string;   // e.g. "POD 1 of expected 2" · "hospital day 5" · "arrival + 2h"
  allergies: string[];
  codeStatus: "Full Code" | "DNR/DNI" | "DNR";
  vitalsSummary: string; // one-line vitals
  meds: string[];
  studies: { date: string; study: string; read: string; lora: BodyRegion | null }[];
};

export type DeptProvenanceModel = {
  role: string;
  name: string;
  hash: string;
  invoked: boolean;
};

export type DeptAISection = {
  kind: "context" | "reasoning" | "findings" | "recommendation" | "provenance";
  title: string;
  body?: string;
  bullets?: string[];
  models?: DeptProvenanceModel[];
  attestation?: {
    status: "queued" | "confirmed";
    tx: string;
    block?: string;
    finality?: string;
  };
};

export type DeptMessage =
  | { id: string; from: "doctor"; text: string; time: string; viaVoice?: boolean }
  | { id: string; from: "ai"; sections: DeptAISection[]; time: string };

export type DeptFollowupResponse = {
  trigger: "default";                  // played whenever doctor sends a free-text or voice message
  viaVoiceTranscript: string;          // what Whisper will "transcribe" when mic is pressed
  response: Omit<DeptMessage & { from: "ai" }, "id" | "time">;
};

export type DepartmentConfig = {
  id: DepartmentId;
  label: string;
  accent: string;           // hex; used for department badge + section accents
  caseLabel: string;        // e.g. "Case #7842"
  patient: DeptPatient;
  allowedLoras: BodyRegion[];
  caption: string;          // sub-heading next to patient name
  initialMessages: DeptMessage[];
  followup: DeptFollowupResponse;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared model hashes — keccak256(canonical_name) — match contracts + gateway
// (these are placeholder-consistent values; production replaces with
// keccak256 of the actual weights file).

export const MODEL_HASHES = {
  whisper:   "0x51b05038f78116fd3684ef56fe18dd92a387c6d8972db45099b0b0305331d8f2",
  router:    "0x41becc0a63267de354ce4021a77da64559c6d3862ca68207a32ef9b1a1f5d83a",
  base:      "0xad3e4a69987dde09cc714ba5d7b228c480cdb462a047fa7409534bdece769d1d",
  reasoning: "0xdc891f7806d1aa933e114ee30e2b806f82b6c687f10cbf3a198188c5eb339ef9",
  aggregator:"0xa7c84ea696f6a210594714644177f597b9f55bb7ba17a8a5d97120359d93cc14",
  loras: {
    abdominal_ct:    "0xe85c7d1bfadd8590bee9bf1c27026f18e9970e7e07ebc908257ad69508a8b413",
    musculoskeletal: "0x840b938fd94cebffff68823662b361888d1d8d6b62275466ceed5160682cab54",
    chest_xray:      "0xa1c88cd242533086628642ce871ae89e10de950fb8c92cafde61fe8edd03b0eb",
    retinal_oct:     "0xddc84f467b23fcc6e5d671ee52e41d7aa811d6c70c6d8ad5cb00ebfa72e0e580",
    brain_mri:       "0x25001dda8e338a8f4421601191e725f4e3d3461aded7a8f68f510d1e4476f540",
    dermatology:     "0x6e911953b4c0e435af065ac8caa1ff5d9d3316ce0c52c9bdc9584b69306d8f3f",
  } as Record<BodyRegion, string>,
};

export const MODEL_NAMES = {
  whisper:   "openai/whisper-large-v3-turbo",
  router:    "answerdotai/ModernBERT-base",
  base:      "google/medgemma-4b-it",
  reasoning: "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
  aggregator:"dmis-lab/Meerkat-7B",
  loras: {
    abdominal_ct:    "efecelik/medgemma-abdominal-ct-lora",
    musculoskeletal: "efecelik/medgemma-musculoskeletal-lora",
    chest_xray:      "efecelik/medgemma-chest-xray-lora",
    retinal_oct:     "efecelik/medgemma-retinal-oct-lora",
    brain_mri:       "efecelik/medgemma-brain-mri-lora",
    dermatology:     "efecelik/medgemma-dermatology-lora",
  } as Record<BodyRegion, string>,
};

// Helper — builds a provenance chain with the given LoRA/STT invocation flags.
function makeChain(opts: {
  sttInvoked: boolean;
  routerInvoked: boolean;
  baseInvoked: boolean;
  loraInvokedRegion?: BodyRegion | null;
  reasoningInvoked?: boolean;
}): DeptProvenanceModel[] {
  const loraRegion = opts.loraInvokedRegion ?? null;
  return [
    { role: "STT", name: MODEL_NAMES.whisper, hash: MODEL_HASHES.whisper, invoked: opts.sttInvoked },
    { role: "Router", name: MODEL_NAMES.router, hash: MODEL_HASHES.router, invoked: opts.routerInvoked },
    { role: "Vision base", name: MODEL_NAMES.base, hash: MODEL_HASHES.base, invoked: opts.baseInvoked },
    {
      role: "Active LoRA",
      name: loraRegion ? MODEL_NAMES.loras[loraRegion] : "none · text follow-up",
      hash: loraRegion ? MODEL_HASHES.loras[loraRegion] : "—",
      invoked: !!loraRegion,
    },
    { role: "Reasoning", name: MODEL_NAMES.reasoning, hash: MODEL_HASHES.reasoning, invoked: opts.reasoningInvoked ?? true },
    { role: "Aggregator", name: MODEL_NAMES.aggregator, hash: MODEL_HASHES.aggregator, invoked: true },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Department configurations

export const departmentConfigs: Record<DepartmentId, DepartmentConfig> = {
  internal_medicine: {
    id: "internal_medicine",
    label: "Internal Medicine",
    accent: "#1B6478",
    caseLabel: "Case #7842",
    allowedLoras: ["chest_xray", "abdominal_ct", "musculoskeletal"],
    caption: "Post-op day 1 · laparoscopic appendectomy",
    patient: {
      name: "Efe Çelik",
      initials: "EÇ",
      age: 23,
      gender: "M",
      mrn: "MRN-2026-EC",
      bed: "4B · 09",
      diagnosis: "Post-op day 1 · laparoscopic appendectomy",
      attending: "R. Patel",
      courseLabel: "POD 1 of expected 2",
      allergies: ["NKDA"],
      codeStatus: "Full Code",
      vitalsSummary: "HR 78 · BP 122 / 76 · SpO₂ 98 · T 37.0 °C",
      meds: [
        "Cefazolin 1 g IV q8h",
        "Morphine PCA 1 mg q10m lockout",
        "Ondansetron 4 mg IV PRN",
        "Acetaminophen 1 g PO q6h",
      ],
      studies: [
        { date: "22 Apr · 19:08", study: "CT Abdomen · contrast", read: "Acute appendicitis · 11 mm appendix · no abscess", lora: "abdominal_ct" },
        { date: "23 Apr · 06:14", study: "CXR · portable", read: "Post-op · clear lung fields · no pneumoperitoneum", lora: "chest_xray" },
      ],
    },
    initialMessages: [
      {
        id: "im1",
        from: "doctor",
        time: "08:34",
        text:
          "Quick post-op check on Efe. POD 1, vitals stable. He mentioned new right shoulder discomfort overnight — is this expected after laparoscopy or should we work it up?",
      },
      {
        id: "im2",
        from: "ai",
        time: "08:35",
        sections: [
          {
            kind: "context",
            title: "Patient context loaded",
            body:
              "Efe Çelik · 23 M · MRN-2026-EC. POD 1 from uncomplicated laparoscopic appendectomy (22 Apr, 21:14). Pre-op CT showed an 11 mm inflamed appendix without perforation. No allergies. Vitals stable.",
          },
          {
            kind: "reasoning",
            title: "Clinical reasoning",
            body:
              "Right shoulder pain after laparoscopic surgery is caused by residual CO₂ irritating the diaphragm, referred via the phrenic nerve to the C3–C5 dermatomes. Onset 12–48 h post-op, resolves spontaneously over 2–4 days. No dependence on the surgical site.",
          },
          {
            kind: "findings",
            title: "Features that would change the picture",
            bullets: [
              "Pleuritic component, dyspnoea, or hypoxia → consider pneumothorax · obtain CXR.",
              "Localised tenderness, erythema or fever spike → wound or intra-abdominal collection · re-examine.",
              "Calf swelling, asymmetric leg pain → DVT / PE workup.",
              "None of the above currently documented for Efe.",
            ],
          },
          {
            kind: "recommendation",
            title: "Recommendation",
            body:
              "Reassure. Continue current analgesia. Early ambulation, position changes and deep breathing to accelerate CO₂ resorption. Reassess at evening round.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: false, routerInvoked: false, baseInvoked: false, loraInvokedRegion: null }),
            attestation: { status: "confirmed", tx: "0x4c12…a8b9", block: "1,847,392", finality: "0.6 s" },
          },
        ],
      },
    ],
    followup: {
      trigger: "default",
      viaVoiceTranscript:
        "Patient asking about discharge timing. Run through what we should be flagging before sending him home tomorrow.",
      response: {
        from: "ai",
        sections: [
          { kind: "context", title: "Voice intake", body: "Transcript captured locally via Whisper-large-v3-turbo. Audio stayed on the workstation." },
          {
            kind: "reasoning",
            title: "Discharge readiness · POD 2 outlook",
            body:
              "Young, otherwise healthy patient after uncomplicated lap appy — POD 2 discharge is reasonable provided GI function, oral analgesia, ambulation, and absence of red flags.",
          },
          {
            kind: "findings",
            title: "Discharge checklist",
            bullets: [
              "Tolerating clear → soft diet · no nausea.",
              "Pain controlled on oral analgesia (NSAID + paracetamol) · PCA off.",
              "Ambulating independently · voiding without difficulty.",
              "Afebrile 24 h · WBC trending down.",
              "Wound sites clean, dry, no erythema.",
              "Patient understands return precautions.",
            ],
          },
          {
            kind: "recommendation",
            title: "Practical next steps",
            body:
              "D/C PCA at 14:00 · advance to soft diet · trend WBC & CRP at 06:00 · book transport · 7-day oral analgesia prescription · surgery-clinic follow-up in 10–14 days.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: true, routerInvoked: false, baseInvoked: false, loraInvokedRegion: null }),
            attestation: { status: "queued", tx: "0x7a92…f4e1" },
          },
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  cardiology: {
    id: "cardiology",
    label: "Cardiology",
    accent: "#962F2F",
    caseLabel: "Case #8109",
    allowedLoras: ["chest_xray"],
    caption: "NSTEMI · day 1 post-PCI",
    patient: {
      name: "Walter Hartmann",
      initials: "WH",
      age: 78,
      gender: "M",
      mrn: "MRN-6122-H",
      bed: "4B · 18",
      diagnosis: "NSTEMI · day 1 post-PCI of LAD subtotal",
      attending: "T. Lindqvist",
      courseLabel: "Hospital day 2",
      allergies: ["Statin (myalgia)"],
      codeStatus: "Full Code",
      vitalsSummary: "HR 72 · BP 128 / 74 · SpO₂ 96 · T 36.8 °C",
      meds: [
        "Aspirin 81 mg PO QD",
        "Ticagrelor 90 mg PO BID",
        "Metoprolol tartrate 25 mg PO BID",
        "Atorvastatin 80 mg PO QD",
        "Enoxaparin 40 mg SC QD",
      ],
      studies: [
        { date: "22 Apr · 04:18", study: "Troponin I", read: "4.21 → peak 5.84 ng/mL · declining", lora: null },
        { date: "22 Apr · 12:00", study: "LHC · PCI LAD", read: "DES to mid-LAD 90% lesion · TIMI 3 flow", lora: null },
        { date: "23 Apr · 06:44", study: "CXR · portable", read: "Mild pulmonary vascular congestion · no effusion", lora: "chest_xray" },
      ],
    },
    initialMessages: [
      {
        id: "cd1",
        from: "doctor",
        time: "08:12",
        text:
          "Reviewing Walter day 1 post-PCI. Troponin trending down, but morning CXR shows subtle congestion. He has new mild DOE. Need you to read the film and tell me if we should start gentle diuresis.",
      },
      {
        id: "cd2",
        from: "ai",
        time: "08:14",
        sections: [
          {
            kind: "context",
            title: "Patient context loaded",
            body:
              "Walter Hartmann · 78 M · MRN-6122-H. NSTEMI managed with PCI to LAD (22 Apr). Troponin peak 5.84 → declining. Echo pending. Allergic to statin (myalgia — now tolerating atorvastatin 80). No prior CHF diagnosis.",
          },
          {
            kind: "findings",
            title: "Chest film (chest-xray-lora)",
            bullets: [
              "Mild pulmonary venous congestion · upper-lobe redistribution.",
              "Cardiothoracic ratio 0.55 · borderline cardiomegaly.",
              "No focal consolidation · no pleural effusion.",
              "No pneumothorax. Heart silhouette sharp.",
            ],
          },
          {
            kind: "reasoning",
            title: "Clinical interpretation",
            body:
              "Post-MI mild congestion + new DOE in a 78-year-old is consistent with early post-infarct LV dysfunction. Echo is indicated to quantify EF. Low-dose loop diuretic is reasonable if JVP is elevated and the patient is symptomatic; start cautiously to preserve preload in a freshly stented patient.",
          },
          {
            kind: "recommendation",
            title: "Recommendation",
            body:
              "Obtain TTE today. Start furosemide 20 mg IV once, reassess in 4 h. Strict I&Os. Daily weights. Continue current GDMT. Hold diuresis if SBP < 100 or Cr rises > 0.3.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: false, routerInvoked: true, baseInvoked: true, loraInvokedRegion: "chest_xray" }),
            attestation: { status: "confirmed", tx: "0x8c3e…a201", block: "1,847,410", finality: "0.7 s" },
          },
        ],
      },
    ],
    followup: {
      trigger: "default",
      viaVoiceTranscript:
        "What's the evidence that we should start a mineralocorticoid receptor antagonist this admission or wait for outpatient follow-up?",
      response: {
        from: "ai",
        sections: [
          { kind: "context", title: "Voice intake", body: "Transcript captured locally via Whisper-large-v3-turbo." },
          {
            kind: "reasoning",
            title: "MRA after STEMI / NSTEMI",
            body:
              "EPHESUS showed eplerenone reduces all-cause mortality in post-MI patients with LVEF ≤ 40% and either heart failure or diabetes. Benefit is greatest when started 3–14 days post-infarct. In-hospital initiation is favoured when the patient is euvolaemic and renal function permits.",
          },
          {
            kind: "findings",
            title: "Start criteria · current patient",
            bullets: [
              "LVEF ≤ 40% on TTE (pending) → meets primary trigger.",
              "HF symptoms post-MI (mild DOE, early congestion) → likely meets.",
              "K⁺ < 5.0, Cr < 2.0 mg/dL (or eGFR > 30) → safe to start.",
              "No concurrent K-sparing diuretic.",
            ],
          },
          {
            kind: "recommendation",
            title: "Plan",
            body:
              "Defer MRA until TTE confirms LVEF. If ≤ 40%, start eplerenone 25 mg PO QD before discharge with BMP re-check at 72 h and 7 days. Document rationale in the discharge summary for the outpatient cardiologist.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: true, routerInvoked: false, baseInvoked: false, loraInvokedRegion: null }),
            attestation: { status: "queued", tx: "0xfd71…bc0e" },
          },
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  neurology: {
    id: "neurology",
    label: "Neurology",
    accent: "#3B4F7C",
    caseLabel: "Case #9234",
    allowedLoras: ["brain_mri"],
    caption: "Atypical migraine · MRI pending read",
    patient: {
      name: "Naima Abdullahi",
      initials: "NA",
      age: 34,
      gender: "F",
      mrn: "MRN-9234-L",
      bed: "4B · 05",
      diagnosis: "Atypical migraine with aura · first lifetime event",
      attending: "B. Okonkwo",
      courseLabel: "Hospital day 1",
      allergies: ["NKDA"],
      codeStatus: "Full Code",
      vitalsSummary: "HR 72 · BP 114 / 70 · SpO₂ 99 · T 36.7 °C",
      meds: [
        "Sumatriptan 6 mg SC PRN (used once)",
        "Ondansetron 4 mg IV PRN",
        "Ketorolac 30 mg IV q6h × 24 h",
        "IV fluids @ 75 mL/h",
      ],
      studies: [
        { date: "22 Apr · 22:18", study: "CT head · non-contrast", read: "No acute intracranial process", lora: null },
        { date: "23 Apr · 04:12", study: "MRI brain · w/ and w/o contrast", read: "Awaiting formal read", lora: "brain_mri" },
      ],
    },
    initialMessages: [
      {
        id: "nr1",
        from: "doctor",
        time: "09:02",
        text:
          "Naima's MRI from overnight is ready. Can you walk me through the sequences and tell me if there's anything we should escalate before the neuro attending reviews?",
      },
      {
        id: "nr2",
        from: "ai",
        time: "09:03",
        sections: [
          {
            kind: "context",
            title: "Patient context loaded",
            body:
              "Naima Abdullahi · 34 F · first lifetime migraine-with-aura–like presentation. Overnight CT head negative for acute process. MRI ordered to rule out structural cause given atypical presentation at this age.",
          },
          {
            kind: "findings",
            title: "MRI brain findings (brain-mri-lora)",
            bullets: [
              "No acute infarct on DWI. ADC map normal.",
              "No mass effect, no midline shift.",
              "No intracranial haemorrhage. SWI negative.",
              "No aneurysmal dilation on MRA TOF.",
              "Minor non-specific T2/FLAIR hyperintensity, right subcortical — likely chronic small-vessel, but unusual at this age.",
            ],
          },
          {
            kind: "reasoning",
            title: "Clinical reasoning",
            body:
              "Negative acute imaging is reassuring and supports a primary headache diagnosis. The subcortical FLAIR finding is non-specific; in a 34-year-old it warrants targeted workup (vascular risk factors, thrombophilia, lupus anticoagulant) rather than acute intervention.",
          },
          {
            kind: "recommendation",
            title: "Recommendation",
            body:
              "Cleared from neurosurgery standpoint. Proceed with discharge planning for migraine workup. Outpatient MRA follow-up in 3 months if symptoms recur. Order lipid panel, HbA1c, APS screen today before discharge.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: false, routerInvoked: true, baseInvoked: true, loraInvokedRegion: "brain_mri" }),
            attestation: { status: "confirmed", tx: "0x1e4f…9b32", block: "1,847,415", finality: "0.8 s" },
          },
        ],
      },
    ],
    followup: {
      trigger: "default",
      viaVoiceTranscript:
        "Is the subcortical FLAIR finding something I need to flag to the neuro attending today, or can this be an outpatient thing?",
      response: {
        from: "ai",
        sections: [
          { kind: "context", title: "Voice intake", body: "Transcript captured locally via Whisper-large-v3-turbo." },
          {
            kind: "reasoning",
            title: "Clinical judgement",
            body:
              "An isolated, sub-centimetre, non-enhancing subcortical T2/FLAIR focus in a neurologically intact 34-year-old with a normal exam and a negative vessel study is usually classified as 'T2 hyperintensity of uncertain significance' (TUS). It is rarely a surgical emergency but does warrant dedicated outpatient workup.",
          },
          {
            kind: "findings",
            title: "What to document today",
            bullets: [
              "Describe lesion location and size in the chart.",
              "Note MRA negativity and absence of neurological deficit.",
              "List differential (demyelinating · vasculitic · chronic microvascular · post-migrainous).",
              "Record that patient was counselled and accepted outpatient follow-up.",
            ],
          },
          {
            kind: "recommendation",
            title: "Plan",
            body:
              "Phone the neuro attending as a courtesy (not as an escalation). Add a 'brain MRI in 3 months with FLAIR + post-gadolinium' recommendation to the discharge summary. Flag to outpatient neurology scheduling.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: true, routerInvoked: false, baseInvoked: false, loraInvokedRegion: null }),
            attestation: { status: "queued", tx: "0x6a28…11cd" },
          },
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  oncology: {
    id: "oncology",
    label: "Oncology",
    accent: "#B8862B",
    caseLabel: "Case #5511",
    allowedLoras: ["chest_xray", "abdominal_ct", "brain_mri"],
    caption: "Diffuse large B-cell lymphoma · re-staging",
    patient: {
      name: "Margaret Osei",
      initials: "MO",
      age: 61,
      gender: "F",
      mrn: "MRN-5511-Q",
      bed: "Onc · 14",
      diagnosis: "DLBCL · after cycle 3 R-CHOP · re-staging",
      attending: "D. Vasquez",
      courseLabel: "Cycle 3 · day 14",
      allergies: ["Contrast iodine (mild urticaria)"],
      codeStatus: "Full Code",
      vitalsSummary: "HR 88 · BP 118 / 72 · SpO₂ 97 · T 37.1 °C",
      meds: [
        "Allopurinol 300 mg PO QD",
        "Valacyclovir 500 mg PO QD (prophylaxis)",
        "Pantoprazole 40 mg PO QD",
        "Ondansetron 8 mg PO PRN",
      ],
      studies: [
        { date: "20 Apr · 09:10", study: "CT chest/abd/pelvis · contrast", read: "Awaiting specialist read", lora: "abdominal_ct" },
        { date: "21 Apr · 14:00", study: "MRI brain (baseline CNS)", read: "No leptomeningeal enhancement", lora: "brain_mri" },
        { date: "22 Apr · 08:33", study: "CXR · routine", read: "Clear lung fields", lora: "chest_xray" },
      ],
    },
    initialMessages: [
      {
        id: "on1",
        from: "doctor",
        time: "10:08",
        text:
          "Margaret's re-staging CT is in. I want to compare disease burden to the baseline — specifically is the mesenteric node conglomerate smaller, and are there any new lesions I'm missing?",
      },
      {
        id: "on2",
        from: "ai",
        time: "10:10",
        sections: [
          {
            kind: "context",
            title: "Patient context loaded",
            body:
              "Margaret Osei · 61 F · DLBCL stage III at diagnosis (large mesenteric conglomerate, multiple retroperitoneal nodes, LDH 612). R-CHOP × 3 with excellent tolerance. Cycle 3 was 14 days ago. Contrast-related urticaria, pre-medicated today.",
          },
          {
            kind: "findings",
            title: "CT chest / abdomen / pelvis (abdominal-ct-lora)",
            bullets: [
              "Mesenteric conglomerate reduced from 8.4 × 5.9 cm → 3.1 × 2.4 cm · PR per Lugano.",
              "Retroperitoneal nodes all < 1.2 cm short-axis.",
              "Liver, spleen unremarkable · no new FDG-avid lesions flagged on fused PET review.",
              "No pulmonary nodules. No pleural effusion. No bony lytic lesion.",
              "Trace pelvic free fluid — likely physiologic given cycle timing.",
            ],
          },
          {
            kind: "reasoning",
            title: "Interpretation",
            body:
              "Interim PET/CT after 2–3 cycles of R-CHOP is a major prognostic checkpoint. The size reduction here is consistent with a Deauville 3–4 partial response pending PET SUVmax. No new disease, no extranodal progression. Continuing with cycles 4–6 is standard.",
          },
          {
            kind: "recommendation",
            title: "Recommendation",
            body:
              "Confirm PET SUVmax ≤ 4× liver uptake to call Deauville ≤ 3. Proceed with cycle 4 next week. Repeat full re-staging after cycle 6. Maintain allopurinol through cycle 4 given tumour lysis risk remains while disease is bulky. Continue PJP / VZV prophylaxis.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: false, routerInvoked: true, baseInvoked: true, loraInvokedRegion: "abdominal_ct" }),
            attestation: { status: "confirmed", tx: "0xa905…ee21", block: "1,847,398", finality: "0.8 s" },
          },
        ],
      },
    ],
    followup: {
      trigger: "default",
      viaVoiceTranscript:
        "If the PET comes back Deauville 4, do we need to change therapy mid-cycle, or complete six cycles then reassess?",
      response: {
        from: "ai",
        sections: [
          { kind: "context", title: "Voice intake", body: "Transcript captured locally via Whisper-large-v3-turbo." },
          {
            kind: "reasoning",
            title: "Interim PET Deauville-based decision",
            body:
              "In DLBCL treated with R-CHOP, PET-adapted protocols suggest Deauville 4 at interim is a warning but not definitive. Most cooperative-group trials complete the planned six cycles and reassess with end-of-treatment PET, because early switching has not shown a reliable survival benefit outside of specific risk subgroups.",
          },
          {
            kind: "findings",
            title: "Factors that would tilt towards early intensification",
            bullets: [
              "CNS involvement at baseline (none in Margaret).",
              "Double- / triple-hit cytogenetics (MYC + BCL2/6) — check FISH.",
              "High IPI score with extranodal sites.",
              "Persistent bulky disease despite three cycles.",
            ],
          },
          {
            kind: "recommendation",
            title: "Plan",
            body:
              "Complete six cycles. Interim PET informs vigilance but not a therapy switch unless FISH demonstrates high-grade features. End-of-treatment PET at cycle 6 week 3 will drive consolidation decisions (auto-HSCT only if refractory).",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: true, routerInvoked: false, baseInvoked: false, loraInvokedRegion: null }),
            attestation: { status: "queued", tx: "0x28a1…5f67" },
          },
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  emergency: {
    id: "emergency",
    label: "Emergency",
    accent: "#A02520",
    caseLabel: "Case #ED-4421",
    allowedLoras: ["chest_xray", "abdominal_ct", "brain_mri", "musculoskeletal"],
    caption: "MVC polytrauma · secondary survey in progress",
    patient: {
      name: "Linus Fischer",
      initials: "LF",
      age: 42,
      gender: "M",
      mrn: "MRN-ED-4421",
      bed: "ED Trauma · 2",
      diagnosis: "MVC polytrauma · haemodynamically stable",
      attending: "G. Rivera",
      courseLabel: "Arrival + 38 min",
      allergies: ["NKDA"],
      codeStatus: "Full Code",
      vitalsSummary: "HR 104 · BP 128 / 82 · SpO₂ 95 · T 36.9 °C",
      meds: [
        "IV fluids 1 L NS bolus",
        "Fentanyl 50 mcg IV q15m PRN",
        "Ondansetron 4 mg IV PRN",
        "Tetanus booster IM",
      ],
      studies: [
        { date: "23 Apr · 08:12", study: "FAST exam", read: "Negative for free fluid", lora: null },
        { date: "23 Apr · 08:28", study: "CXR · supine", read: "Awaiting read", lora: "chest_xray" },
        { date: "23 Apr · 08:31", study: "CT head · non-contrast", read: "Awaiting read", lora: "brain_mri" },
        { date: "23 Apr · 08:36", study: "CT chest/abd/pelvis · contrast", read: "Awaiting read", lora: "abdominal_ct" },
      ],
    },
    initialMessages: [
      {
        id: "ed1",
        from: "doctor",
        time: "08:41",
        text:
          "Polytrauma coming in. 42 M head-on MVC, belted, airbag deployed, GCS 15 on scene. FAST is negative but CXR and pan-scan just posted. Walk me through the films in order of acuity.",
      },
      {
        id: "ed2",
        from: "ai",
        time: "08:43",
        sections: [
          {
            kind: "context",
            title: "Patient context loaded",
            body:
              "Linus Fischer · 42 M · restrained driver in MVC. GCS 15, mild neck and thoracic tenderness on primary survey. No abdominal tenderness. Stable vitals with mild tachycardia likely sympathetic. Blood type cross-matched, 2 units on hold.",
          },
          {
            kind: "findings",
            title: "Chest radiograph (chest-xray-lora)",
            bullets: [
              "No pneumothorax. No haemothorax. No widened mediastinum (MPR ratio 0.23).",
              "Lung fields clear. No pulmonary contusion.",
              "Minor left 7th rib non-displaced fracture.",
              "No cardiac or diaphragmatic abnormality.",
            ],
          },
          {
            kind: "findings",
            title: "CT head · non-contrast (brain-mri-lora · applied to CT head window)",
            bullets: [
              "No acute intracranial haemorrhage.",
              "No cerebral contusion, mass effect, or midline shift.",
              "No skull fracture. Calvarium intact.",
              "Paranasal sinuses clear.",
            ],
          },
          {
            kind: "findings",
            title: "CT chest / abdomen / pelvis (abdominal-ct-lora)",
            bullets: [
              "Small grade I splenic laceration · no active extravasation.",
              "No solid organ vascular blush. No retroperitoneal haematoma.",
              "Bowel appears unremarkable. No free air.",
              "Left non-displaced 7th rib fracture confirmed.",
              "Trace perisplenic fluid (< 30 mL).",
            ],
          },
          {
            kind: "reasoning",
            title: "Acuity synthesis",
            body:
              "Blunt polytrauma with isolated grade I splenic laceration, negative FAST, stable vitals, and no intracranial or great-vessel injury. Non-operative management is appropriate. Close observation for haemodynamic change, serial abdominal exams, and interval haemoglobin every 6 h for 24 h.",
          },
          {
            kind: "recommendation",
            title: "Recommendation",
            body:
              "Admit to step-down trauma unit. Bed rest × 24 h. Serial HCTs q6h × 4. Type & screen updated. Hold anticoagulation. Surgical consult on-call notified. Pain control with fentanyl then transition to oral. Repeat CT abdomen if HCT drops > 2 points or haemodynamics change.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: false, routerInvoked: true, baseInvoked: true, loraInvokedRegion: "abdominal_ct" }),
            attestation: { status: "confirmed", tx: "0x0d21…1e09", block: "1,847,433", finality: "0.7 s" },
          },
        ],
      },
    ],
    followup: {
      trigger: "default",
      viaVoiceTranscript:
        "He's asking for discharge. Can we treat this grade I splenic lac outpatient if his bloodwork stays stable, or does it really need 24 h observation?",
      response: {
        from: "ai",
        sections: [
          { kind: "context", title: "Voice intake", body: "Transcript captured locally via Whisper-large-v3-turbo." },
          {
            kind: "reasoning",
            title: "Outpatient management · grade I splenic laceration",
            body:
              "Selected low-grade splenic injuries in stable adults with reliable home observation can be considered for short-stay (6–24 h) management, but the predominant AAST and EAST guidelines still recommend at least 24 h of inpatient monitoring, because up to 5 % of grade I–II patients deteriorate between 6–24 h post-injury.",
          },
          {
            kind: "findings",
            title: "Specific risks in Linus's case",
            bullets: [
              "Solo traveller with no in-home observer documented.",
              "Mild tachycardia on admission — could mask early hypovolaemia.",
              "Single haemoglobin on file — no trend yet.",
              "Pre-existing anticoagulation? — confirm (currently none charted).",
            ],
          },
          {
            kind: "recommendation",
            title: "Recommendation",
            body:
              "Decline early discharge. Minimum 24 h observation with serial HCT and abdominal exam. If stable at 24 h and oral intake tolerated, discharge with explicit return precautions and activity restriction (no contact sport × 6 weeks). Document the conversation in the chart.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: true, routerInvoked: false, baseInvoked: false, loraInvokedRegion: null }),
            attestation: { status: "queued", tx: "0xb44e…c018" },
          },
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  surgery: {
    id: "surgery",
    label: "Surgery",
    accent: "#4F7338",
    caseLabel: "Case #6681",
    allowedLoras: ["abdominal_ct", "musculoskeletal", "chest_xray"],
    caption: "Post-CABG day 3 · stepping down",
    patient: {
      name: "Mateo Ramírez",
      initials: "MR",
      age: 54,
      gender: "M",
      mrn: "MRN-7321-J",
      bed: "4B · 08",
      diagnosis: "Post-CABG × 3 · day 3",
      attending: "R. Patel",
      courseLabel: "POD 3 of expected 5",
      allergies: ["NKDA"],
      codeStatus: "Full Code",
      vitalsSummary: "HR 76 · BP 118 / 74 · SpO₂ 97 · T 36.7 °C",
      meds: [
        "Aspirin 81 mg PO QD",
        "Atorvastatin 80 mg PO QD",
        "Metoprolol succinate 50 mg PO QD",
        "Furosemide 20 mg PO QD",
        "Oxycodone 5 mg PO PRN",
      ],
      studies: [
        { date: "22 Apr · 07:00", study: "CXR · portable", read: "Chest tube out · no pneumothorax", lora: "chest_xray" },
        { date: "23 Apr · 06:12", study: "CXR · portable", read: "Awaiting read · mild bibasilar atelectasis?", lora: "chest_xray" },
      ],
    },
    initialMessages: [
      {
        id: "sg1",
        from: "doctor",
        time: "07:48",
        text:
          "Mateo is mobilising well, but his morning sat dropped to 93% on ambulation and today's film is up. Walk me through — is this atelectasis or something worse?",
      },
      {
        id: "sg2",
        from: "ai",
        time: "07:50",
        sections: [
          {
            kind: "context",
            title: "Patient context loaded",
            body:
              "Mateo Ramírez · 54 M · POD 3 post-CABG × 3 vessels. Chest tube out POD 1. Ambulating with PT. Incentive spirometer in use but baseline adherence limited by sternal pain.",
          },
          {
            kind: "findings",
            title: "Morning CXR (chest-xray-lora)",
            bullets: [
              "Mild bibasilar subsegmental atelectasis · new compared with POD 2.",
              "No pleural effusion.",
              "No pneumothorax (post-chest-tube site clean).",
              "Cardiac silhouette stable. Sternal wires intact.",
              "No consolidation to suggest pneumonia.",
            ],
          },
          {
            kind: "reasoning",
            title: "Clinical interpretation",
            body:
              "Post-CABG atelectasis is common through POD 3–5, driven by splinting from sternal pain. Transient desaturation on ambulation in this context is expected. Concerning features would include focal consolidation, new effusion, or haemodynamic compromise — none present here.",
          },
          {
            kind: "recommendation",
            title: "Recommendation",
            body:
              "Optimise pain control so incentive spirometry is effective · schedule oxycodone before chest physio · aggressive IS q1h awake · encourage ambulation × 3 today · recheck sat on room air at 11:00. No need for antibiotics or repeat imaging unless fever develops.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: false, routerInvoked: true, baseInvoked: true, loraInvokedRegion: "chest_xray" }),
            attestation: { status: "confirmed", tx: "0x7b02…6d15", block: "1,847,441", finality: "0.6 s" },
          },
        ],
      },
    ],
    followup: {
      trigger: "default",
      viaVoiceTranscript:
        "Family is asking when he can expect to leave. Give me a realistic discharge timeline and what has to be true before he can go home.",
      response: {
        from: "ai",
        sections: [
          { kind: "context", title: "Voice intake", body: "Transcript captured locally via Whisper-large-v3-turbo." },
          {
            kind: "reasoning",
            title: "Standard post-CABG discharge arc",
            body:
              "Uncomplicated CABG patients usually discharge POD 5–7. Criteria group into functional (walk, eat, voiding, pain), haemodynamic (off pressors for 24 h, stable rate control), and safety (clean wound, no new rhythm, normal renal function).",
          },
          {
            kind: "findings",
            title: "Checklist for Mateo",
            bullets: [
              "Ambulating 200 m without desaturation — not yet.",
              "Oral analgesia only for 24 h — currently yes.",
              "Afebrile for 24 h · WBC trending to baseline.",
              "No new atrial fibrillation in past 24 h (monitor review).",
              "Sternal wound clean · no drainage.",
              "Echo before discharge documenting LVEF.",
              "Cardiac rehab referral in place.",
            ],
          },
          {
            kind: "recommendation",
            title: "Practical plan",
            body:
              "Target POD 5 discharge if ambulation test passes and no new arrhythmia overnight. Otherwise POD 6. Family can start packing for day-after-tomorrow. Cardiac rehab intake already scheduled.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: true, routerInvoked: false, baseInvoked: false, loraInvokedRegion: null }),
            attestation: { status: "queued", tx: "0x3e77…a482" },
          },
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  pediatrics: {
    id: "pediatrics",
    label: "Pediatrics",
    accent: "#B8553F",
    caseLabel: "Case #PED-1807",
    allowedLoras: ["chest_xray", "abdominal_ct", "dermatology"],
    caption: "Bronchiolitis · day 2",
    patient: {
      name: "Mila Chen",
      initials: "MC",
      age: 2,
      gender: "F",
      mrn: "MRN-PED-1807",
      bed: "Peds · 03",
      diagnosis: "RSV bronchiolitis · mild-moderate",
      attending: "H. Patel",
      courseLabel: "Hospital day 2",
      allergies: ["NKDA"],
      codeStatus: "Full Code",
      vitalsSummary: "HR 132 · BP 94 / 58 · SpO₂ 95 RA · T 37.8 °C",
      meds: [
        "Nasal saline q2h + bulb suction",
        "Ibuprofen 10 mg/kg PO q6h PRN",
        "IV maintenance fluids (D5½NS) @ 40 mL/h",
      ],
      studies: [
        { date: "22 Apr · 21:40", study: "CXR · AP upright", read: "Hyperinflation · no focal consolidation", lora: "chest_xray" },
        { date: "23 Apr · 09:00", study: "RSV swab", read: "Positive", lora: null },
      ],
    },
    initialMessages: [
      {
        id: "pd1",
        from: "doctor",
        time: "09:22",
        text:
          "Mila's been working a bit harder this morning — retractions more pronounced, sats running 93–95% on room air. Read yesterday's film and tell me if we should bump to HFNC or hold steady.",
      },
      {
        id: "pd2",
        from: "ai",
        time: "09:23",
        sections: [
          {
            kind: "context",
            title: "Patient context loaded",
            body:
              "Mila Chen · 2 F · RSV-positive bronchiolitis, hospital day 2. No comorbidities. Eating 70 % of baseline, wet nappies appropriate. No apnoeic events.",
          },
          {
            kind: "findings",
            title: "Chest X-ray (chest-xray-lora)",
            bullets: [
              "Marked hyperinflation.",
              "No focal consolidation or opacity to suggest bacterial pneumonia.",
              "Peribronchial cuffing consistent with viral process.",
              "No pleural effusion.",
            ],
          },
          {
            kind: "reasoning",
            title: "Clinical interpretation",
            body:
              "Radiograph supports pure viral bronchiolitis without secondary bacterial infection. Increased work of breathing without hypoxia usually responds to supportive care and gentle nasal suction; HFNC is reserved for persistent tachypnoea > 70, sats < 92 on room air after suctioning, or true accessory muscle use with retractions at rest.",
          },
          {
            kind: "recommendation",
            title: "Recommendation",
            body:
              "Hold HFNC. Intensify toileting: aggressive nasal saline + bulb suction before feeds, reassess in 1 h. Trend HR and WOB. Threshold: HFNC if sats persistently < 92 % despite suctioning, RR > 70 sustained, or apnoea. No antibiotics (film does not support bacterial superinfection).",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: false, routerInvoked: true, baseInvoked: true, loraInvokedRegion: "chest_xray" }),
            attestation: { status: "confirmed", tx: "0x51fa…c321", block: "1,847,452", finality: "0.7 s" },
          },
        ],
      },
    ],
    followup: {
      trigger: "default",
      viaVoiceTranscript:
        "Parents are very anxious. Give me a simple explanation I can share with them about why we're not giving antibiotics and what they should watch for at home.",
      response: {
        from: "ai",
        sections: [
          { kind: "context", title: "Voice intake", body: "Transcript captured locally via Whisper-large-v3-turbo." },
          {
            kind: "reasoning",
            title: "Plain-language summary",
            body:
              "Mila has a viral chest cold (RSV). Antibiotics only work on bacteria, not viruses, and giving them when they aren't needed can cause side effects and make bacteria stronger later. Her body is doing the right thing — we support her with fluids, rest, and suction until the virus clears.",
          },
          {
            kind: "findings",
            title: "Red flags for parents",
            bullets: [
              "Fast breathing that doesn't improve with suctioning.",
              "Skin pulling in between the ribs at rest.",
              "Bluish tinge around the lips or fingers.",
              "Pauses in breathing · very sleepy · won't wake for feeds.",
              "Fewer than three wet nappies in 24 h.",
            ],
          },
          {
            kind: "recommendation",
            title: "Discharge prep",
            body:
              "Consider discharge when RR < 50 at rest on room air, sats ≥ 95 %, feeding ≥ 75 % baseline, and no apnoea for 12 h. Give bulb-suction demo, written red-flag list, and scheduled paediatrician follow-up in 24–48 h.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: true, routerInvoked: false, baseInvoked: false, loraInvokedRegion: null }),
            attestation: { status: "queued", tx: "0x8c14…d905" },
          },
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  icu: {
    id: "icu",
    label: "Intensive Care",
    accent: "#6B3F8A",
    caseLabel: "Case #ICU-0412",
    allowedLoras: ["chest_xray", "abdominal_ct", "brain_mri"],
    caption: "Septic shock · pulmonary source · stabilising",
    patient: {
      name: "Yusuf Karaman",
      initials: "YK",
      age: 73,
      gender: "M",
      mrn: "MRN-6655-H",
      bed: "ICU · 04",
      diagnosis: "Septic shock · pulmonary source · day 6",
      attending: "T. Lindqvist",
      courseLabel: "ICU day 6",
      allergies: ["Sulfa drugs"],
      codeStatus: "Full Code",
      vitalsSummary: "HR 104 · MAP 72 · SpO₂ 93 on 40 % FiO₂ · T 37.6 °C",
      meds: [
        "Norepinephrine 0.08 mcg/kg/min",
        "Piperacillin-tazobactam 4.5 g IV q6h",
        "Sedation · propofol 15 mcg/kg/min",
        "Heparin 5 000 IU SC BID (DVT prophylaxis)",
      ],
      studies: [
        { date: "22 Apr · 05:40", study: "CXR · portable", read: "Bilateral patchy opacities · improving", lora: "chest_xray" },
        { date: "21 Apr · 23:12", study: "CT head · non-contrast", read: "No acute process", lora: "brain_mri" },
        { date: "20 Apr · 10:02", study: "CT chest · contrast", read: "Consolidation left lower lobe · small effusion", lora: "chest_xray" },
      ],
    },
    initialMessages: [
      {
        id: "ic1",
        from: "doctor",
        time: "07:04",
        text:
          "Yusuf is stepping down — norepi halving, lactate normalised, FiO₂ coming off. Compare today's film to day 3 and tell me if we're truly out of the woods pulmonary-wise.",
      },
      {
        id: "ic2",
        from: "ai",
        time: "07:06",
        sections: [
          {
            kind: "context",
            title: "Patient context loaded",
            body:
              "Yusuf Karaman · 73 M · septic shock from LLL pneumonia, ICU day 6. Trend: norepi 0.24 → 0.08 mcg/kg/min, lactate 4.2 → 1.3 mmol/L, FiO₂ 80 → 40 %. Cultures growing S. pneumoniae, pip-tazo on target per susceptibilities.",
          },
          {
            kind: "findings",
            title: "Morning CXR vs day-3 baseline (chest-xray-lora)",
            bullets: [
              "Left lower lobe consolidation now markedly reduced · air bronchograms less prominent.",
              "Right lower lobe patchy opacities clearing.",
              "Small left effusion stable, not enlarging.",
              "Endotracheal tube 4 cm above carina · centred.",
              "Central line tip in lower SVC.",
            ],
          },
          {
            kind: "reasoning",
            title: "Clinical interpretation",
            body:
              "Radiographic trajectory mirrors the clinical picture — responding to therapy. No new infiltrate, no VAP signal. Effusion is parapneumonic and not expanding; diagnostic tap not indicated while afebrile and inflammatory markers falling.",
          },
          {
            kind: "recommendation",
            title: "Recommendation",
            body:
              "Continue current antibiotic course to complete 7 days. Plan spontaneous breathing trial in 4 h if vent mechanics remain favourable. Wean propofol in parallel. Norepi off likely this afternoon. Nutrition goals met via enteral feed.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: false, routerInvoked: true, baseInvoked: true, loraInvokedRegion: "chest_xray" }),
            attestation: { status: "confirmed", tx: "0xe802…ff54", block: "1,847,460", finality: "0.8 s" },
          },
        ],
      },
    ],
    followup: {
      trigger: "default",
      viaVoiceTranscript:
        "What's the plan if he fails his SBT this afternoon — straight back to AC or try another round tomorrow?",
      response: {
        from: "ai",
        sections: [
          { kind: "context", title: "Voice intake", body: "Transcript captured locally via Whisper-large-v3-turbo." },
          {
            kind: "reasoning",
            title: "SBT failure pathway",
            body:
              "If the SBT fails, the priority is to return the patient to a rested support mode (AC-VC or PSV with pressure support ≥ 10 cmH₂O), diagnose the failure mechanism (cardiac vs respiratory vs neuromuscular vs fluid balance), and correct before re-attempting in 24 h.",
          },
          {
            kind: "findings",
            title: "Likely failure mechanisms in Yusuf",
            bullets: [
              "Residual secretions — aggressive suctioning, consider bronchoscopy if mucus plugging.",
              "Fluid overload — he is ~3 L net positive since admission.",
              "Diaphragmatic weakness — protocolised mobilisation, limit sedation.",
              "Cardiac contribution — TTE showed LVEF 50 %, unlikely.",
            ],
          },
          {
            kind: "recommendation",
            title: "Plan",
            body:
              "If SBT fails: rest overnight on PSV with pressure support 10 / PEEP 5, start gentle diuresis 20 mg furosemide IV, hold sedation breaks, re-trial tomorrow 06:00 with SAT + SBT combined. If two consecutive failures: consider post-extubation NIV bridge or tracheostomy discussion at day 10.",
          },
          {
            kind: "provenance",
            title: "Ensemble provenance",
            models: makeChain({ sttInvoked: true, routerInvoked: false, baseInvoked: false, loraInvokedRegion: null }),
            attestation: { status: "queued", tx: "0xc511…9e07" },
          },
        ],
      },
    },
  },
};

export const DEFAULT_DEPARTMENT: DepartmentId = "internal_medicine";

export const departmentList: DepartmentConfig[] = [
  departmentConfigs.internal_medicine,
  departmentConfigs.cardiology,
  departmentConfigs.neurology,
  departmentConfigs.oncology,
  departmentConfigs.emergency,
  departmentConfigs.surgery,
  departmentConfigs.pediatrics,
  departmentConfigs.icu,
];
