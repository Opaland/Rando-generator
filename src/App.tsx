import { useEffect } from 'react'
import { MapView } from './components/MapView.tsx'
import { ZonePicker } from './components/ZonePicker.tsx'
import { useAppStore } from './store/appStore.ts'
import styles from './App.module.css'

function App() {
  const init = useAppStore((s) => s.init)
  const dbWarning = useAppStore((s) => s.dbWarning)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className="balise" aria-hidden="true">
            <span />
            <span />
          </span>
          <h1 className={styles.brandName}>Sentiers</h1>
        </div>
        <p className={styles.privacy}>
          Vos traces GPX ne quittent jamais votre navigateur — aucun compte,
          aucun serveur, aucune télémétrie.
        </p>
      </header>

      {dbWarning && (
        <p className={styles.dbWarning} role="alert">
          {dbWarning}
        </p>
      )}

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Panneau de contrôle">
          <ZonePicker />
        </aside>
        <main className={styles.main}>
          <MapView />
        </main>
      </div>
    </div>
  )
}

export default App
