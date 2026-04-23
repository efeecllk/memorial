import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { Dashboard } from './components/Dashboard'
import { PatientDetail } from './components/PatientDetail'
import { Schedule } from './components/Schedule'
import { DoctorConsole } from './components/DoctorConsole'
import { DEFAULT_DEPARTMENT, type DepartmentId, departmentConfigs } from './lib/departments'

export type View = 'console' | 'dashboard' | 'patient' | 'schedule'

export default function App() {
  const [view, setView] = useState<View>('console')
  const [departmentId, setDepartmentId] = useState<DepartmentId>(DEFAULT_DEPARTMENT)
  const [patientId, setPatientId] = useState<string | null>(null)

  function navigate(v: View) {
    setView(v)
    if (v !== 'patient') setPatientId(null)
  }

  function openDepartment(id: DepartmentId) {
    setDepartmentId(id)
    setView('console')
    setPatientId(null)
  }

  function selectPatient(id: string) {
    setPatientId(id)
    setView('patient')
  }

  function back() {
    setView('dashboard')
    setPatientId(null)
  }

  const department = departmentConfigs[departmentId]

  return (
    <div className="flex h-full">
      <Sidebar
        view={view}
        departmentId={departmentId}
        onNavigate={navigate}
        onOpenDepartment={openDepartment}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {view === 'console' && (
              <motion.div
                key={`console-${departmentId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <DoctorConsole department={department} />
              </motion.div>
            )}
            {view === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Dashboard onPatientSelect={selectPatient} />
              </motion.div>
            )}
            {view === 'patient' && patientId && (
              <motion.div
                key={`patient-${patientId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <PatientDetail patientId={patientId} onBack={back} />
              </motion.div>
            )}
            {view === 'schedule' && (
              <motion.div
                key="schedule"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Schedule />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
