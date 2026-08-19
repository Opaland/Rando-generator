import { useEffect, useState } from 'react'
import { About } from './components/About.tsx'
import { Dashboard } from './components/Dashboard.tsx'
import { ItineraryCard } from './components/ItineraryCard.tsx'
import { ItineraryList } from './components/ItineraryList.tsx'
import { MapView } from './components/MapView.tsx'
import { Settings } from './components/Settings.tsx'
import { TrackManager } from './components/TrackManager.tsx'
import { ZonePicker } from './components/ZonePicker.tsx'
import { useAppStore } from './store/appStore.ts'
import styles from './App.module.css'

function App() {
  const init = useAppStore((s) => s.init)
  const dbWarning = useAppStore((s) => s.dbWarning)
  const [aboutOpen, setAboutOpen] = useState(false)

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
        <button
          type="button"
          className={styles.aboutLink}
          data-testid="about-open"
          onClick={() => {
            setAboutOpen(true)
          }}
        >
          À propos
        </button>
      </header>

      {dbWarning && (
        <p className={styles.dbWarning} role="alert">
          {dbWarning}
        </p>
      )}

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Panneau de contrôle">
          <ZonePicker />
          <TrackManager />
          <Dashboard />
          <ItineraryList />
          <Settings />
          <footer className={styles.footer}>
            Itinéraires © les contributeurs OpenStreetMap (ODbL) · Fond de
            carte © IGN (Etalab 2.0) · GR®, GR de Pays® et PR® sont des
            marques de la FFRandonnée.
          </footer>
        </aside>
        <main className={styles.main}>
          <MapView />
          <ItineraryCard />
        </main>
      </div>

      <About
        open={aboutOpen}
        onClose={() => {
          setAboutOpen(false)
        }}
      />
    </div>
  )
}

export default App
