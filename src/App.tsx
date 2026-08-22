import { lazy, Suspense, useEffect, useRef, useState } from 'react'
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
import {
  guideDemarrageVisible,
  rappelGuideVisible,
  sectionsVisibles,
} from './core/affichage.ts'
import { BarreOnglets } from './components/BarreOnglets.tsx'
import {
  dispositionDemandee,
  positionPourOnglet,
  sectionsDeLOnglet,
  type Onglet,
  type PositionFeuille,
  type SectionApp,
} from './core/maquetteOnglets.ts'
import { ZonePicker } from './components/ZonePicker.tsx'
import { useEcranCompact } from './lib/ecran.ts'
import { formatPct } from './lib/format.ts'
import { useAppStore } from './store/appStore.ts'
import styles from './App.module.css'

// La carte (MapLibre, ~900 kB) est chargée à part : le tableau de bord et les
// listes sont utilisables immédiatement.
const MapView = lazy(() => import('./components/MapView.tsx'))

/*
 * Les positions de la feuille du panneau sur téléphone (voir .sidebar dans
 * App.module.css) sont définies dans core/maquetteOnglets : une règle les
 * consulte pour décider où poser la feuille en changeant d'onglet, et cette
 * règle s'éprouve sans DOM. Sur grand écran la feuille n'existe pas : le
 * panneau est une colonne, et cet état n'a aucun effet.
 */

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
  const guideFerme = useAppStore((s) => s.guideFerme)
  const setGuideFerme = useAppStore((s) => s.setGuideFerme)
  const panneauReplie = useAppStore((s) => s.panneauReplie)
  const setPanneauReplie = useAppStore((s) => s.setPanneauReplie)
  const sections = sectionsVisibles(modeAffichage)
  const donnees = {
    itineraires: hasZoneData,
    itinerairesPerso: hasCustomData,
    traces: hasTracks,
    chargement: zoneLoading,
  }

  // Navigation par onglets (issue #171), disposition par défaut depuis que
  // la porte de #177 a été levée. Les accordéons restent servis par
  // `?maquette=accordeons` — ce qui laisse la session E2 conduisible et un
  // retour en arrière possible. Lu une seule fois : la disposition ne change
  // pas en cours de session.
  const [maquette] = useState(
    () =>
      typeof window !== 'undefined' &&
      dispositionDemandee(window.location.search) === 'onglets',
  )
  const [ongletActif, setOngletActif] = useState<Onglet>('carte')
  const panneauRef = useRef<HTMLElement>(null)
  // La barre n'existe qu'en dessous du point de rupture : au-dessus, le
  // panneau colonne montre tout. Sans cette condition, le filtrage par
  // onglet s'appliquait aussi sur grand écran, où la barre est masquée —
  // une seule section visible et aucun moyen d'en changer.
  const compact = useEcranCompact()
  const onglets = maquette && compact
  // Le repli du panneau ne concerne que la colonne. En dessous du point de
  // rupture c'est une feuille glissante, qui a déjà ses trois positions :
  // deux mécanismes concurrents sur la même surface se contrediraient.
  const panneauLarge = !compact
  // En accordéons, `visible` dit oui à tout : l'empilement d'origine est
  // rendu exactement comme avant, sans une condition de plus à son sujet.
  const visible = (section: SectionApp): boolean =>
    !onglets || sectionsDeLOnglet(ongletActif).includes(section)

  // Les deux modes se posent sur la racine du document plutôt que sur un
  // conteneur : le gros texte doit atteindre les dialogues et les surcouches
  // de carte, qui sortent de l'arbre du panneau (issue #173).
  // Posé sur la racine plutôt que passé en classe : la barre d'onglets est
  // en position fixe, et c'est la feuille — ailleurs dans l'arbre — qui doit
  // lui réserver sa hauteur (prototype #171).
  useEffect(() => {
    if (onglets) document.documentElement.dataset['maquette'] = 'onglets'
    else delete document.documentElement.dataset['maquette']
  }, [onglets])

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

  /**
   * Changer d'onglet, c'est demander à voir ce qu'il contient.
   *
   * Trois onglets sur quatre n'ont rien à montrer hors de la feuille : y
   * arriver feuille fermée donnait un écran identique à celui qu'on quittait,
   * l'onglet allumé et rien d'autre (AUDIT_UX.md, constat U3). La règle qui
   * décide de la position vit dans core/maquetteOnglets, où elle s'éprouve.
   *
   * Le défilement repart du haut : la feuille est un cadre commun aux quatre
   * onglets, et sa position de défilement lui appartient, pas au contenu.
   * Sans cela, on arrivait au milieu de la liste des itinéraires parce qu'on
   * avait fait défiler celle des traces.
   */
  const changerDOnglet = (onglet: Onglet) => {
    setOngletActif(onglet)
    setFeuille(positionPourOnglet(onglet, position))
    panneauRef.current?.scrollTo({ top: 0 })
  }

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
          ref={panneauRef}
          className={`${styles.sidebar} ${styles[position]}`}
          aria-label={onglets ? 'Contenu de l’onglet' : 'Panneau de contrôle'}
          data-testid="sidebar"
          data-position={position}
          id="panneau-de-controle"
          hidden={panneauLarge && panneauReplie}
        >
          {/*
            Repli du panneau sur grand écran. Sous 800 px la poignée fait
            déjà ce travail depuis l'audit mobile ; au-dessus, la colonne
            prenait 390 px de carte sans qu'aucun geste ne puisse la rendre.
            Ce bouton n'existe qu'au-dessus du point de rupture, et son
            pendant `.rendrePanneau` n'existe qu'une fois replié : les deux
            conditions dérivent du même booléen, jamais recopiées.
          */}
          <button
            type="button"
            className={styles.replier}
            data-testid="panneau-replier"
            aria-label="Replier le panneau et agrandir la carte"
            aria-controls="panneau-de-controle"
            aria-expanded={true}
            onClick={() => {
              void setPanneauReplie(true)
            }}
          >
            ‹
          </button>
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
        {panneauLarge && panneauReplie && (
          <button
            type="button"
            className={styles.rendrePanneau}
            data-testid="panneau-rendre"
            aria-label="Rouvrir le panneau de contrôle"
            aria-controls="panneau-de-controle"
            aria-expanded={false}
            onClick={() => {
              void setPanneauReplie(false)
            }}
          >
            ›
          </button>
        )}
        <main className={styles.main}>
          <Suspense
            fallback={
              <p className={styles.mapLoading}>Chargement de la carte…</p>
            }
          >
            <MapView />
          </Suspense>
          {guideDemarrageVisible(donnees, guideFerme) && <EmptyState />}
          {rappelGuideVisible(donnees, guideFerme) && (
            <button
              type="button"
              className={styles.rappelGuide}
              data-testid="onboarding-rouvrir"
              onClick={() => {
                void setGuideFerme(false)
              }}
            >
              Guide de démarrage
            </button>
          )}
          <ItineraryCard />
          <ItineraryDetail />
          <RouteDrawer />
          <LocateButton />
        </main>
      </div>

      {onglets && (
        <BarreOnglets actif={ongletActif} onChange={changerDOnglet} />
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
