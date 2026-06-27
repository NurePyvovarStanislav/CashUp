import { useLiveQuery } from 'dexie-react-hooks'

import './App.css'
import { db } from './db/database'
import type { BudgetPeriod } from './domain/models'
import { DashboardScreen } from './features/dashboard/DashboardScreen'
import { OnboardingScreen } from './features/onboarding/OnboardingScreen'

function App() {
  const activePeriod = useLiveQuery(
    async () =>
      (await db.periods.where('status').equals('active').first()) ?? null,
    [],
    undefined,
  )

  if (activePeriod === undefined) {
    return (
      <main className="app-shell app-shell--centered">
        <div className="spinner" aria-label="Загрузка" />
      </main>
    )
  }

  if (activePeriod === null) {
    return <OnboardingScreen />
  }

  return <DashboardScreen period={activePeriod as BudgetPeriod & { id: number }} />
}

export default App
