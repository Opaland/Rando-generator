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
import { ModeSwitch } from './components/ModeSwitch.tsx'
import { sectionsVisibles } from './core/affichage.ts'
import { BarreOnglets } from './components/BarreOnglets.tsx'
import {
  maquetteDemandee,
  sectionsDeLOnglet,
  type Onglet,
  type SectionApp,
} from './core/maquetteOnglets.ts'
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
  const modeAffichage = useAppStore((s) => s.modeAffichage)
  const grosTexte = useAppStore((s) => s.grosTexte)
  const sections = sectionsVisibles(modeAffichage)

  // Prototype de navigation par onglets (issue #171), servi uniquement sur
  // `?maquette=onglets` — #177 interdit de l'industrialiser avant la session
  // E2, mais une session ne se conduit pas sans quelque chose qui s'utilise.
  // Lu une seule fois : le drapeau ne change pas en cours de session.
  const [maquette] = useState(() =>
    typeof window === 'undefined' ? false : maquetteDemandee(window.location.search),
  )
  const [ongletActif, setOngletActif] = useState<Onglet>('carte')
  // Sans maquette, `visible` dit oui à tout : l'empilement d'origine est
  // rendu exactement comme avant, sans une condition de plus à son sujet.
  const visible = (section: SectionApp): boolean =>
    !maquette || sectionsDeLOnglet(ongletActif).includes(section)

  // Les deux modes se posent sur la racine du document plutôt que sur un
  // conteneur : le gros texte doit atteindre les dialogues et les surcouches
  // de carte, qui sortent de l'arbre du panneau (issue #173).
  // Posé sur la racine plutôt que passé en classe : la barre d'onglets est
  // en position fixe, et c'est la feuille — ailleurs dans l'arbre — qui doit
  // lui réserver sa hauteur (prototype #171).
  useEffect(() => {
    if (maquette) document.documentElement.dataset['maquette'] = 'onglets'
  }, [maquette])

  useEffect(() => {
    const racine = document.documentElement
    racine.dataset['mode'] = modeAffichage
    racine.dataset['grosTexte'] = grosTexte ? 'oui' : 'non'
  }, [modeAffichage, grosTexte])
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
          {/* Le mode simple cache, il n'enlève pas : la carte, les traces et
              le tableau de bord restent, tout le reste se replie (#173). */}
          {sections.zone && visible('zone') && <ZonePicker />}
          {sections.traces && visible('traces') && <TrackManager />}
          {sections.itineraires && visible('itinerairesPerso') && (
            <CustomItineraries />
          )}
          {sections.tableauDeBord && visible('tableauDeBord') && <Dashboard />}
          {sections.objectifs && visible('objectifs') && <Objectifs />}
          {sections.prochaineSortie && visible('prochaineSortie') && (
            <NextOuting />
          )}
          {sections.historique && visible('historique') && <History />}
          {sections.itineraires && visible('listeItineraires') && (
            <ItineraryList />
          )}
          {sections.reglages && visible('reglages') && <Settings />}
          {sections.sauvegarde && visible('sauvegarde') && <Backup />}
          <ModeSwitch />
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

      {maquette && (
        <BarreOnglets actif={ongletActif} onChange={setOngletActif} />
      )}

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
