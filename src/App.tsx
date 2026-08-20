import { lazy, Suspense, useEffect, useState } from 'react'
import { About } from './components/About.tsx'
import { CustomItineraries } from './components/CustomItineraries.tsx'
import { Dashboard } from './components/Dashboard.tsx'
import { EmptyState } from './components/EmptyState.tsx'
import { History } from './components/History.tsx'
import { ItineraryCard } from './components/ItineraryCard.tsx'
import { ItineraryDetail } from './components/ItineraryDetail.tsx'
import { ItineraryList } from './components/ItineraryList.tsx'
import { LocateButton } from './components/LocateButton.tsx'
import { NextOuting } from './components/NextOuting.tsx'
import { OfflineBanner } from './components/OfflineBanner.tsx'
import { RouteDrawer } from './components/RouteDrawer.tsx'
import { Settings } from './components/Settings.tsx'
import { TrackManager } from './components/TrackManager.tsx'
import { ZonePicker } from './components/ZonePicker.tsx'
import { useAppStore } from './store/appStore.ts'
import styles from './App.module.css'

// La carte (MapLibre, ~900 kB) est chargée à part : le tableau de bord et les
// listes sont utilisables immédiatement.
const MapView = lazy(() => import('./components/MapView.tsx'))

function App() {
  const init = useAppStore((s) => s.init)
  const dbWarning = useAppStore((s) => s.dbWarning)
  const hasZoneData = useAppStore((s) => s.itineraries.length > 0)
  const hasCustomData = useAppStore((s) => s.customItineraries.length > 0)
  const hasTracks = useAppStore((s) => s.tracks.length > 0)
  const zoneLoading = useAppStore((s) => s.zoneLoading)
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
        {/*
          Deux longueurs pour la même promesse : sur téléphone, la version
          longue se repliait sur sept lignes et consommait un cinquième de la
          hauteur d'écran (docs/AUDIT_MOBILE.md, constat M2). Le détail reste
          dans « À propos », qui l'explique déjà.
        */}
        <p className={styles.privacy}>
          <span className={styles.privacyLong}>
            Vos traces GPX ne quittent jamais votre navigateur — aucun compte,
            aucun serveur, aucune télémétrie.
          </span>
          <span className={styles.privacyShort}>
            Tout reste sur votre appareil.
          </span>
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

      <OfflineBanner />

      {dbWarning && (
        <p className={styles.dbWarning} role="alert">
          {dbWarning}
        </p>
      )}

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Panneau de contrôle">
          <ZonePicker />
          <TrackManager />
          <CustomItineraries />
          <Dashboard />
          <NextOuting />
          <History />
          <ItineraryList />
          <Settings />
          <footer className={styles.footer}>
            Itinéraires © les contributeurs OpenStreetMap (ODbL) · Fond de
            carte © IGN (Etalab 2.0) · GR®, GR de Pays® et PR® sont des
            marques de la FFRandonnée.
          </footer>
        </aside>
        <main className={styles.main}>
          <Suspense
            fallback={
              <p className={styles.mapLoading}>Chargement de la carte…</p>
            }
          >
            <MapView />
          </Suspense>
          {!hasZoneData && !hasCustomData && !hasTracks && !zoneLoading && (
            <EmptyState />
          )}
          <ItineraryCard />
          <ItineraryDetail />
          <RouteDrawer />
          <LocateButton />
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
