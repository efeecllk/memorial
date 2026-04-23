// All mock data. No backend, no fetching — just imported.

export type VitalTrend = number[];

export type Vitals = {
  hr: number;
  hrTrend: VitalTrend;
  bp: { systolic: number; diastolic: number };
  bpTrend: VitalTrend;
  spo2: number;
  spo2Trend: VitalTrend;
  temp: number;
  tempTrend: VitalTrend;
  rr: number;
};

export type AcuityFlag = 'critical' | 'monitor' | 'stable' | 'discharge';

export type Patient = {
  id: string;
  name: string;
  age: number;
  gender: 'M' | 'F';
  mrn: string;
  bed: string;
  diagnosis: string;
  attending: string;
  admittedDay: number;
  status: AcuityFlag;
  flag?: string;
  allergies: string[];
  codeStatus: 'Full Code' | 'DNR/DNI' | 'DNR';
  vitals: Vitals;
};

export type Medication = {
  name: string;
  dose: string;
  route: string;
  frequency: string;
  lastAdmin: string;
  nextDue: string;
  indication: string;
};

export type LabResult = {
  panel: string;
  value: string;
  unit: string;
  ref: string;
  flag?: 'high' | 'low' | 'critical';
  drawnAt: string;
};

export type Alert = {
  id: string;
  patientId: string;
  patientName: string;
  bed: string;
  type: 'critical-lab' | 'imaging' | 'pharmacy' | 'discharge' | 'family' | 'consult';
  title: string;
  detail: string;
  time: string;
  priority: 'urgent' | 'routine';
};

export type Appointment = {
  id: string;
  time: string;
  duration: number;
  title: string;
  subject: string;
  attendee: string;
  location: string;
  kind: 'round' | 'consult' | 'family' | 'discharge' | 'multi-d' | 'pharmacy' | 'procedure';
};

// Generate trend arrays — pseudo-random but deterministic per seed
function trend(base: number, variance: number, points = 12, seed = 1): number[] {
  const result: number[] = [];
  let v = base;
  for (let i = 0; i < points; i++) {
    const noise = Math.sin((seed + i) * 1.7) * variance;
    v = base + noise;
    result.push(Math.round(v * 10) / 10);
  }
  return result;
}

export const patients: Patient[] = [
  {
    id: 'p001',
    name: 'Eleanor Voss',
    age: 67,
    gender: 'F',
    mrn: 'MRN-8847-K',
    bed: 'Ward 4B · 12',
    diagnosis: 'Acute decompensated heart failure',
    attending: 'Chen',
    admittedDay: 4,
    status: 'monitor',
    flag: 'Diuresing well · 2.3 L net negative',
    allergies: ['Penicillin (rash)', 'Iodine contrast'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 88, hrTrend: trend(88, 4, 12, 3),
      bp: { systolic: 134, diastolic: 82 },
      bpTrend: trend(134, 8, 12, 7),
      spo2: 94, spo2Trend: trend(94, 1.5, 12, 11),
      temp: 36.9, tempTrend: trend(36.9, 0.2, 12, 13),
      rr: 18,
    },
  },
  {
    id: 'p002',
    name: 'Mateo Ramírez',
    age: 54,
    gender: 'M',
    mrn: 'MRN-7321-J',
    bed: 'Ward 4B · 08',
    diagnosis: 'Post-op CABG · day 3',
    attending: 'Patel',
    admittedDay: 3,
    status: 'stable',
    flag: 'Mobilising · chest tube out',
    allergies: ['NKDA'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 76, hrTrend: trend(76, 3, 12, 5),
      bp: { systolic: 118, diastolic: 74 },
      bpTrend: trend(118, 5, 12, 9),
      spo2: 97, spo2Trend: trend(97, 0.8, 12, 17),
      temp: 36.7, tempTrend: trend(36.7, 0.15, 12, 21),
      rr: 16,
    },
  },
  {
    id: 'p003',
    name: 'Aiyana Whitehorse',
    age: 41,
    gender: 'F',
    mrn: 'MRN-9112-L',
    bed: 'Ward 4B · 15',
    diagnosis: 'DKA · resolving',
    attending: 'Chen',
    admittedDay: 2,
    status: 'monitor',
    allergies: ['NKDA'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 92, hrTrend: trend(92, 5, 12, 23),
      bp: { systolic: 122, diastolic: 78 },
      bpTrend: trend(122, 6, 12, 27),
      spo2: 98, spo2Trend: trend(98, 0.6, 12, 31),
      temp: 36.8, tempTrend: trend(36.8, 0.18, 12, 33),
      rr: 17,
    },
  },
  {
    id: 'p004',
    name: 'Yusuf Karaman',
    age: 73,
    gender: 'M',
    mrn: 'MRN-6655-H',
    bed: 'ICU · 04',
    diagnosis: 'Septic shock · pulmonary source',
    attending: 'Lindqvist',
    admittedDay: 6,
    status: 'critical',
    flag: 'Norepi 0.18 mcg/kg/min · lactate trending down',
    allergies: ['Sulfa drugs'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 112, hrTrend: trend(112, 6, 12, 41),
      bp: { systolic: 96, diastolic: 58 },
      bpTrend: trend(96, 8, 12, 43),
      spo2: 91, spo2Trend: trend(91, 2, 12, 47),
      temp: 38.4, tempTrend: trend(38.4, 0.3, 12, 51),
      rr: 24,
    },
  },
  {
    id: 'p005',
    name: 'Priya Subramanian',
    age: 29,
    gender: 'F',
    mrn: 'MRN-9988-M',
    bed: 'Ward 4B · 03',
    diagnosis: 'Community-acquired pneumonia',
    attending: 'Patel',
    admittedDay: 2,
    status: 'stable',
    allergies: ['NKDA'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 84, hrTrend: trend(84, 3, 12, 53),
      bp: { systolic: 116, diastolic: 72 },
      bpTrend: trend(116, 4, 12, 57),
      spo2: 96, spo2Trend: trend(96, 1, 12, 61),
      temp: 37.2, tempTrend: trend(37.2, 0.25, 12, 67),
      rr: 18,
    },
  },
  {
    id: 'p006',
    name: 'Hannah Lindqvist',
    age: 58,
    gender: 'F',
    mrn: 'MRN-7766-K',
    bed: 'Ward 4B · 19',
    diagnosis: 'Atrial fibrillation w/ RVR',
    attending: 'Chen',
    admittedDay: 1,
    status: 'monitor',
    flag: 'Awaiting TEE · rate-controlled',
    allergies: ['Aspirin (GI)'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 98, hrTrend: trend(98, 6, 12, 71),
      bp: { systolic: 138, diastolic: 84 },
      bpTrend: trend(138, 7, 12, 73),
      spo2: 97, spo2Trend: trend(97, 0.7, 12, 79),
      temp: 36.6, tempTrend: trend(36.6, 0.1, 12, 83),
      rr: 18,
    },
  },
  {
    id: 'p007',
    name: 'Marcus Chen',
    age: 81,
    gender: 'M',
    mrn: 'MRN-5544-G',
    bed: 'Ward 4B · 02',
    diagnosis: 'COPD exacerbation',
    attending: 'Okonkwo',
    admittedDay: 5,
    status: 'monitor',
    allergies: ['Codeine (nausea)'],
    codeStatus: 'DNR/DNI',
    vitals: {
      hr: 86, hrTrend: trend(86, 4, 12, 89),
      bp: { systolic: 128, diastolic: 76 },
      bpTrend: trend(128, 5, 12, 97),
      spo2: 92, spo2Trend: trend(92, 1.2, 12, 101),
      temp: 36.9, tempTrend: trend(36.9, 0.15, 12, 103),
      rr: 22,
    },
  },
  {
    id: 'p008',
    name: 'Beatrice Albright',
    age: 45,
    gender: 'F',
    mrn: 'MRN-8211-K',
    bed: 'Ward 4B · 11',
    diagnosis: 'Cellulitis · LLE · IV abx',
    attending: 'Patel',
    admittedDay: 3,
    status: 'stable',
    allergies: ['Latex'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 78, hrTrend: trend(78, 3, 12, 107),
      bp: { systolic: 124, diastolic: 78 },
      bpTrend: trend(124, 4, 12, 109),
      spo2: 98, spo2Trend: trend(98, 0.5, 12, 113),
      temp: 37.4, tempTrend: trend(37.4, 0.2, 12, 127),
      rr: 16,
    },
  },
  {
    id: 'p009',
    name: 'Tomás Espinoza',
    age: 62,
    gender: 'M',
    mrn: 'MRN-7799-J',
    bed: 'Ward 4B · 07',
    diagnosis: 'Acute pancreatitis · gallstone',
    attending: 'Chen',
    admittedDay: 2,
    status: 'monitor',
    flag: 'NPO · awaiting surgical consult',
    allergies: ['NKDA'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 90, hrTrend: trend(90, 5, 12, 131),
      bp: { systolic: 130, diastolic: 80 },
      bpTrend: trend(130, 6, 12, 137),
      spo2: 96, spo2Trend: trend(96, 0.9, 12, 139),
      temp: 37.6, tempTrend: trend(37.6, 0.22, 12, 149),
      rr: 18,
    },
  },
  {
    id: 'p010',
    name: 'Naima Abdullahi',
    age: 34,
    gender: 'F',
    mrn: 'MRN-9234-L',
    bed: 'Ward 4B · 05',
    diagnosis: 'Migraine workup · negative imaging',
    attending: 'Okonkwo',
    admittedDay: 1,
    status: 'discharge',
    flag: 'Pending pharmacy reconciliation',
    allergies: ['NKDA'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 72, hrTrend: trend(72, 2, 12, 151),
      bp: { systolic: 114, diastolic: 70 },
      bpTrend: trend(114, 3, 12, 157),
      spo2: 99, spo2Trend: trend(99, 0.4, 12, 163),
      temp: 36.7, tempTrend: trend(36.7, 0.1, 12, 167),
      rr: 14,
    },
  },
  {
    id: 'p011',
    name: 'Walter Hartmann',
    age: 78,
    gender: 'M',
    mrn: 'MRN-6122-H',
    bed: 'Ward 4B · 18',
    diagnosis: 'NSTEMI · awaiting cath',
    attending: 'Lindqvist',
    admittedDay: 1,
    status: 'critical',
    flag: 'Troponin 4.21 ng/mL · cath lab activated',
    allergies: ['Statin (myalgia)'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 102, hrTrend: trend(102, 5, 12, 173),
      bp: { systolic: 152, diastolic: 92 },
      bpTrend: trend(152, 8, 12, 179),
      spo2: 95, spo2Trend: trend(95, 1, 12, 181),
      temp: 36.8, tempTrend: trend(36.8, 0.12, 12, 191),
      rr: 20,
    },
  },
  {
    id: 'p012',
    name: 'Camille Beaufort',
    age: 51,
    gender: 'F',
    mrn: 'MRN-8901-K',
    bed: 'Ward 4B · 10',
    diagnosis: 'Acute cholecystitis · pre-op',
    attending: 'Patel',
    admittedDay: 1,
    status: 'monitor',
    allergies: ['Morphine (itching)'],
    codeStatus: 'Full Code',
    vitals: {
      hr: 82, hrTrend: trend(82, 3, 12, 193),
      bp: { systolic: 128, diastolic: 78 },
      bpTrend: trend(128, 5, 12, 197),
      spo2: 98, spo2Trend: trend(98, 0.5, 12, 199),
      temp: 37.5, tempTrend: trend(37.5, 0.2, 12, 211),
      rr: 17,
    },
  },
];

export const medicationsByPatient: Record<string, Medication[]> = {
  p001: [
    { name: 'Furosemide', dose: '40 mg', route: 'IV', frequency: 'BID', lastAdmin: '08:00', nextDue: '20:00', indication: 'Diuresis · CHF' },
    { name: 'Lisinopril', dose: '10 mg', route: 'PO', frequency: 'QD', lastAdmin: '09:15', nextDue: 'Tomorrow 09:00', indication: 'Afterload reduction' },
    { name: 'Metoprolol succinate', dose: '25 mg', route: 'PO', frequency: 'BID', lastAdmin: '08:00', nextDue: '20:00', indication: 'Rate control · GDMT' },
    { name: 'Apixaban', dose: '5 mg', route: 'PO', frequency: 'BID', lastAdmin: '09:15', nextDue: '21:00', indication: 'AFib stroke prevention' },
    { name: 'Spironolactone', dose: '25 mg', route: 'PO', frequency: 'QD', lastAdmin: '09:15', nextDue: 'Tomorrow 09:00', indication: 'GDMT · CHF' },
    { name: 'Atorvastatin', dose: '40 mg', route: 'PO', frequency: 'QHS', lastAdmin: 'Yesterday 21:00', nextDue: 'Tonight 21:00', indication: 'Hyperlipidaemia' },
    { name: 'Pantoprazole', dose: '40 mg', route: 'IV', frequency: 'QD', lastAdmin: '07:30', nextDue: 'Tomorrow 07:30', indication: 'GI prophylaxis' },
  ],
  p011: [
    { name: 'Aspirin', dose: '325 mg', route: 'PO', frequency: 'Once', lastAdmin: '04:42', nextDue: '—', indication: 'NSTEMI · loaded' },
    { name: 'Ticagrelor', dose: '180 mg', route: 'PO', frequency: 'Once', lastAdmin: '04:45', nextDue: '—', indication: 'NSTEMI · loaded' },
    { name: 'Heparin', dose: '60 U/kg bolus', route: 'IV', frequency: 'Continuous', lastAdmin: '04:48', nextDue: 'Per aPTT', indication: 'NSTEMI · anticoag' },
    { name: 'Metoprolol tartrate', dose: '25 mg', route: 'PO', frequency: 'BID', lastAdmin: '08:00', nextDue: '20:00', indication: 'Rate control' },
    { name: 'Atorvastatin', dose: '80 mg', route: 'PO', frequency: 'QD', lastAdmin: '09:00', nextDue: 'Tomorrow', indication: 'High-intensity statin' },
  ],
};

export const labsByPatient: Record<string, LabResult[]> = {
  p001: [
    { panel: 'NT-proBNP', value: '4,820', unit: 'pg/mL', ref: '< 450', flag: 'high', drawnAt: '06:12' },
    { panel: 'Creatinine', value: '1.42', unit: 'mg/dL', ref: '0.6 – 1.2', flag: 'high', drawnAt: '06:12' },
    { panel: 'K⁺', value: '3.6', unit: 'mmol/L', ref: '3.5 – 5.1', drawnAt: '06:12' },
    { panel: 'Na⁺', value: '136', unit: 'mmol/L', ref: '135 – 145', drawnAt: '06:12' },
    { panel: 'Hgb', value: '11.4', unit: 'g/dL', ref: '12.0 – 16.0', flag: 'low', drawnAt: '06:12' },
    { panel: 'WBC', value: '7.8', unit: '×10⁹/L', ref: '4.0 – 11.0', drawnAt: '06:12' },
    { panel: 'Lactate', value: '1.4', unit: 'mmol/L', ref: '< 2.0', drawnAt: '06:12' },
  ],
  p011: [
    { panel: 'Troponin I', value: '4.21', unit: 'ng/mL', ref: '< 0.04', flag: 'critical', drawnAt: '04:18' },
    { panel: 'Troponin I', value: '5.84', unit: 'ng/mL', ref: '< 0.04', flag: 'critical', drawnAt: '07:18' },
    { panel: 'CK-MB', value: '38.6', unit: 'ng/mL', ref: '< 6.3', flag: 'high', drawnAt: '07:18' },
    { panel: 'Creatinine', value: '1.18', unit: 'mg/dL', ref: '0.7 – 1.3', drawnAt: '04:18' },
    { panel: 'BNP', value: '612', unit: 'pg/mL', ref: '< 100', flag: 'high', drawnAt: '04:18' },
  ],
};

export const alerts: Alert[] = [
  {
    id: 'a1',
    patientId: 'p011',
    patientName: 'Walter Hartmann',
    bed: '4B · 18',
    type: 'critical-lab',
    title: 'Troponin I · 5.84 ng/mL',
    detail: '↑ from 4.21 · Ref < 0.04 · Cath lab activated',
    time: '07:24',
    priority: 'urgent',
  },
  {
    id: 'a2',
    patientId: 'p001',
    patientName: 'Eleanor Voss',
    bed: '4B · 12',
    type: 'imaging',
    title: 'CT Chest available',
    detail: 'Reading: pulmonary congestion, bilateral effusions',
    time: '07:51',
    priority: 'routine',
  },
  {
    id: 'a3',
    patientId: 'p008',
    patientName: 'Beatrice Albright',
    bed: '4B · 11',
    type: 'pharmacy',
    title: 'Vancomycin trough callback',
    detail: 'Pharmacy requests dose adjustment · trough 9.2 mcg/mL',
    time: '08:03',
    priority: 'routine',
  },
  {
    id: 'a4',
    patientId: 'p010',
    patientName: 'Naima Abdullahi',
    bed: '4B · 05',
    type: 'discharge',
    title: 'Discharge ready',
    detail: 'Workup complete · awaiting med rec & transport',
    time: '08:14',
    priority: 'routine',
  },
  {
    id: 'a5',
    patientId: 'p007',
    patientName: 'Marcus Chen',
    bed: '4B · 02',
    type: 'family',
    title: 'Family update requested',
    detail: 'Daughter Sarah · prefers afternoon · 415-555-0149',
    time: '08:22',
    priority: 'routine',
  },
  {
    id: 'a6',
    patientId: 'p009',
    patientName: 'Tomás Espinoza',
    bed: '4B · 07',
    type: 'consult',
    title: 'Surgery consult pending',
    detail: 'Awaiting Dr. Hayashi · expected before noon',
    time: '08:31',
    priority: 'routine',
  },
];

export const schedule: Appointment[] = [
  { id: 's1', time: '08:00', duration: 60, title: 'Ward Round', subject: 'All patients · 4B', attendee: 'Internal Medicine team', location: 'Ward 4B', kind: 'round' },
  { id: 's2', time: '09:30', duration: 30, title: 'Cardiology consult', subject: 'Walter Hartmann · NSTEMI', attendee: 'Dr. Lindqvist', location: 'Ward 4B · 18', kind: 'consult' },
  { id: 's3', time: '10:30', duration: 20, title: 'Wound check', subject: 'Mateo Ramírez · Post-CABG', attendee: 'Surgery follow-up', location: 'Ward 4B · 08', kind: 'consult' },
  { id: 's4', time: '11:00', duration: 30, title: 'Pharmacy round', subject: 'Med reconciliation · 6 patients', attendee: 'PharmD Walker', location: 'Conference 4B-A', kind: 'pharmacy' },
  { id: 's5', time: '12:00', duration: 45, title: 'Cath lab', subject: 'Walter Hartmann · LHC + PCI', attendee: 'Cath lab 2', location: 'CV Suite', kind: 'procedure' },
  { id: 's6', time: '13:30', duration: 45, title: 'Family meeting', subject: 'Voss family · goals of care', attendee: 'Social work + chaplain', location: 'Family room 4B', kind: 'family' },
  { id: 's7', time: '14:30', duration: 30, title: 'Discharge planning', subject: 'Naima Abdullahi', attendee: 'Case management', location: 'Ward 4B · 05', kind: 'discharge' },
  { id: 's8', time: '15:30', duration: 60, title: 'Multi-D meeting', subject: 'Oncology cases · weekly', attendee: 'Oncology + Pall care', location: 'Conference 5A', kind: 'multi-d' },
  { id: 's9', time: '17:00', duration: 20, title: 'GI consult', subject: 'Tomás Espinoza · pancreatitis', attendee: 'Dr. Hayashi', location: 'Ward 4B · 07', kind: 'consult' },
];

export const departments = [
  { id: 'medicine', name: 'Internal Medicine', count: 42, active: true },
  { id: 'cardiology', name: 'Cardiology', count: 28 },
  { id: 'neurology', name: 'Neurology', count: 19 },
  { id: 'oncology', name: 'Oncology', count: 24 },
  { id: 'emergency', name: 'Emergency', count: 17 },
  { id: 'surgery', name: 'Surgery', count: 31 },
  { id: 'pediatrics', name: 'Pediatrics', count: 22 },
  { id: 'icu', name: 'Intensive Care', count: 14 },
];

export const utilities = [
  { id: 'imaging', name: 'Imaging' },
  { id: 'pharmacy', name: 'Pharmacy' },
  { id: 'pathology', name: 'Pathology' },
  { id: 'records', name: 'Records' },
];

export const todayMeta = {
  date: 'Wednesday, 23 April 2026',
  dateShort: '23 · IV · MMXXVI',
  weekday: 'Wednesday',
  dayOfYear: 113,
  shift: 'Day shift · 07:00 – 19:00',
  vol: 'XXVII',
  issue: '142',
  hospital: 'Memorial General',
  unit: 'Internal Medicine · Ward 4B',
  attending: 'Dr. M. Chen',
  attendingTitle: 'Hospitalist · Attending',
};
