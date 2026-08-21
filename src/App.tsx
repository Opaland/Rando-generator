import { lazy, Suspense, useEffect, useState } from 'react'
import { About } from './components/About.tsx'
import { Backup } from './components/Backup.tsx'
import { CustomItineraries } from './components/CustomItineraries.tsx'
import { Dashboard } from './components/Dashboard.tsx'
import { EmptyState } from './components/EmptyState.tsx'
import { History } from './components/History.tsx'
import { ItineraryCard } from './components/ItineraryCard.tsx'
import { ItineraryDetail } from './components/ItineraryDetail.tsx'
import { ItineraryList } from './components/ItineraryList.tsx'
import { LocateButton } from './components/LocateButton.tsx'
import { NextOuting } from './components/NextOuting.tsx'
import { Objectifs } from './components/Objectifs.tsx'
import { OfflineBanner } from './components/OfflineBanner.tsx'
import { RouteDrawer } from './components/RouteDrawer.tsx'
import { Settings } from './components/Settings.tsx'
import { TrackManager } from './components/TrackManager.tsx'
import { DemoBanner } from './components/DemoBanner.tsx'
import { InstallButton } from './components/InstallButton.tsx'
import { ZonePicker } from './components/ZonePicker.tsx'
import { formatPct } from './lib/format.ts'
import { useAppStore } from './store/appStore.ts'
import styles from './App.module.css'

// La carte (MapLibre, ~900 kB) est chargée à part : le tableau de bord et les
// listes sont utilisables immédiatement.
const MapView = lazy(() => import('./components/MapView.tsx'))

/**
 * Positions de la feuille du panneau sur téléphone (voir .sidebar dans
 * App.module.css). Sur grand écran la feuille n'existe pas : le panneau est
 * une colonne, et cet état n'a aucun effet.
 */
type PositionFeuille = 'repliee' | 'moitie' | 'pleine'

const SUIVANTE: Record<PositionFeuille, PositionFeuille> = {
  repliee: 'moitie',
  moitie: 'pleine',
  pleine: 'repliee',
}

const ACTION: Record<PositionFeuille, string> = {
  repliee: 'Ouvrir le panneau de contrôle',
  moitie: 'Agrandir le panneau de contrôle',
  pleine: 'Réduire le panneau de contrôle',
}

function App() {
  const init = useAppStore((s) => s.init)
  const dbWarning = useAppStore((s) => s.dbWarning)
  const hasZoneData = useAppStore((s) => s.itineraries.length > 0)
  const hasCustomData = useAppStore((s) => s.customItineraries.length > 0)
  const hasTracks = useAppStore((s) => s.tracks.length > 0)
  const zoneLoading = useAppStore((s) => s.zoneLoading)
  const globalPct = useAppStore((s) => s.matching?.global.pct ?? null)
  const zoneRestoredAtStartup = useAppStore((s) => s.zoneRestoredAtStartup)
  const [aboutOpen, setAboutOpen] = useState(false)
  /**
   * null = suivre l'état des données. Au retour sur l'application, une zone
   * est déjà en cache : on vient regarder sa carte, la feuille reste basse.
   * À la première visite il n'y a rien à voir sur la carte, et tout à faire
   * dans le panneau : elle s'ouvre à mi-hauteur.
   */
  const [feuille, setFeuille] = useState<PositionFeuille | null>(null)
  const position: PositionFeuille =
    feuille ?? (zoneRestoredAtStartup ? 'repliee' : 'moitie')

  // Choisir un itinéraire dans la liste, c'est demander à le voir sur la
  // carte. La feuille se replie donc : sinon la fiche résumé qui s'ouvre en
  // surimpression se retrouve dessous, hors d'atteinte. On s'abonne au store
  // plutôt que de dériver d'un rendu : c'est le geste qui compte, pas l'état.
  useEffect(
    () =>
      useAppStore.subscribe((etat, precedent) => {
        if (
          etat.selectedItineraryId !== null &&
          etat.selectedItineraryId !== precedent.selectedItineraryId
        ) {
          setFeuille('repliee')
        }
      }),
    [],
  )

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
            Vos traces restent sur votre appareil.
          </span>
        </p>
        {/*
          Une vraie page, servie telle quelle : un lien partagé doit s'ouvrir
          chez quelqu'un qui n'a rien installé, et être indexable. C'est le
          seul endroit qui explique ce que le produit fait de différent.

          Sur téléphone il vit dans le pied du panneau, pas ici : mesuré, il
          coûtait 50 px de carte dans l'en-tête, et une page marketing ne
          passe pas avant la carte (docs/AUDIT_MOBILE.md, constat M2).
        */}
        <a
          className={styles.pourquoiEntete}
          href="pourquoi.html"
          data-testid="pourquoi-link"
        >
          Pourquoi Sentiers
        </a>
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
        <aside
          className={`${styles.sidebar} ${styles[position]}`}
          aria-label="Panneau de contrôle"
          data-testid="sidebar"
          data-position={position}
        >
          {/*
            Poignée de la feuille : n'existe qu'en dessous de 800 px (masquée
            en CSS au-dessus). Un seul bouton pour trois positions, dont le
            libellé annonce ce qu'il va faire plutôt que l'état courant.
          */}
          <button
            type="button"
            className={styles.poignee}
            data-testid="sheet-handle"
            aria-label={ACTION[position]}
            aria-expanded={position !== 'repliee'}
            onClick={() => {
              setFeuille(SUIVANTE[position])
            }}
          >
            <span className={styles.poigneeBarre} aria-hidden="true" />
            <span className={styles.poigneeTexte}>
              {globalPct === null
                ? 'Zones, traces et réglages'
                : `${formatPct(globalPct)} parcourus`}
            </span>
          </button>
          <DemoBanner />
          <ZonePicker />
          <TrackManager />
          <CustomItineraries />
          <Dashboard />
          <Objectifs />
          <NextOuting />
          <History />
          <ItineraryList />
          <Settings />
          <Backup />
          <InstallButton />
          <footer className={styles.footer}>
            <a
              className={styles.pourquoiPied}
              href="pourquoi.html"
              data-testid="pourquoi-link-pied"
            >
              Pourquoi Sentiers&nbsp;?
            </a>
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
