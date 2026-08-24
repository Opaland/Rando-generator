import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { About } from './components/About.tsx'
import { Backup } from './components/Backup.tsx'
import { CustomItineraries } from './components/CustomItineraries.tsx'
import { Dashboard } from './components/Dashboard.tsx'
import { EmptyState } from './components/EmptyState.tsx'
import { Enregistreur } from './components/Enregistreur.tsx'
import { temoinDeSortie } from './core/sortieEnCours.ts'
import { PoigneeTexte } from './components/PoigneeTexte.tsx'
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
  ancreDeLOnglet,
  ancreDeSection,
  dispositionDemandee,
  positionInitiale,
  positionPourOnglet,
  sectionsDeLOnglet,
  type Onglet,
  type PositionFeuille,
  type SectionApp,
} from './core/maquetteOnglets.ts'
import { ZonePicker } from './components/ZonePicker.tsx'
import { useEcranCompact } from './lib/ecran.ts'
import { pourcentageMesurable } from './core/milestones.ts'
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

/**
 * Le conteneur qui porte le repère d'une section.
 *
 * Un `div` neutre plutôt qu'un attribut posé dans chacun des onze
 * composants : le repère vient de `core/maquetteOnglets`, et il n'a à être
 * lu qu'à un seul endroit. Onze littéraux recopiés auraient été la
 * quatrième garde oubliée de CLAUDE.md §4 — celle qu'on découvre en
 * cherchant pourquoi un onglet ne mène nulle part.
 *
 * Le panneau est une grille : un enveloppement par section garde une case
 * par section, donc les mêmes gouttières qu'avant.
 */
function Ancre({
  section,
  children,
}: {
  section: SectionApp
  children: ReactNode
}) {
  return <div data-ancre={ancreDeSection(section)}>{children}</div>
}

function App() {
  const init = useAppStore((s) => s.init)
  const dbWarning = useAppStore((s) => s.dbWarning)
  const hasZoneData = useAppStore((s) => s.itineraries.length > 0)
  const hasCustomData = useAppStore((s) => s.customItineraries.length > 0)
  const hasTracks = useAppStore((s) => s.tracks.length > 0)
  const zoneLoading = useAppStore((s) => s.zoneLoading)
  /**
   * Le pourcentage global, ou `null` quand il n'y a rien à mesurer.
   *
   * `pct` vaut 0 dès que le calcul tourne, même sur un ensemble vide : la
   * poignée accueillait donc les nouveaux venus par « 0 % parcourus » alors
   * qu'aucune zone n'était chargée (AUDIT_UX.md, constat U5). Ce n'est pas
   * décourageant, c'est faux — il n'y a pas 0 % de parcouru, il n'y a rien
   * à parcourir. `pourcentageMesurable` porte la question une seule fois.
   */
  const globalPct = useAppStore((s) =>
    pourcentageMesurable(s.matching?.global) ? (s.matching?.global.pct ?? null) : null,
  )
  const zoneRestoredAtStartup = useAppStore((s) => s.zoneRestoredAtStartup)
  const modeAffichage = useAppStore((s) => s.modeAffichage)
  const grosTexte = useAppStore((s) => s.grosTexte)
  const guideFerme = useAppStore((s) => s.guideFerme)
  const setGuideFerme = useAppStore((s) => s.setGuideFerme)
  const panneauReplie = useAppStore((s) => s.panneauReplie)
  const setPanneauReplie = useAppStore((s) => s.setPanneauReplie)
  const sections = sectionsVisibles(modeAffichage)
  const enregistrement = useAppStore((s) => s.enregistrement)
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
  /**
   * Section à rejoindre au prochain rendu, ou `null` quand il n'y a rien à
   * rejoindre. Une référence et non un état : la vider est un ménage, pas un
   * fait dont un rendu dépend, et l'y mettre déclencherait le rendu en
   * cascade que le lint interdit à juste titre.
   */
  const ancreVisee = useRef<string | null>(null)
  /**
   * Le compteur, lui, est un état : c'est lui qui dit « on vient de demander
   * ». Sans lui, l'effet devrait dépendre de l'onglet actif, et il se
   * relancerait au dépliage du panneau — quelqu'un qui replie puis rend sa
   * colonne perdrait sa place dans la liste sans avoir rien demandé.
   */
  const [demandeDAncre, setDemandeDAncre] = useState(0)
  const panneauRef = useRef<HTMLElement>(null)
  const detailOuvert = useAppStore((s) => s.detailItineraryId)
  const compact = useEcranCompact()
  // La barre existe à toutes les largeurs depuis le 23/08 : sur PC aussi, la
  // navigation principale doit être visible sans qu'on la cherche.
  //
  // Ce qu'elle *fait*, en revanche, dépend de la place. Sur téléphone elle
  // filtre les sections, comme depuis #171. Sur grand écran, filtrer a été
  // essayé et rendu : le panneau colonne a la place de tout montrer, et
  // n'en montrer qu'un quart cachait les trois autres derrière un onglet
  // sans rien gagner — une soixantaine de tests de bout en bout perdaient
  // l'accès aux panneaux, ce qui est la même chose vue d'en face. L'onglet
  // y devient donc un repère : il amène à sa première section.
  //
  // Deux booléens plutôt qu'un, parce que ce sont deux questions : « la
  // barre est-elle là » et « filtre-t-elle ». Les confondre est exactement
  // ce qui avait masqué la barre à 800 px pile (AUDIT_UX.md, constat U2).
  const onglets = maquette
  const filtrage = maquette && compact
  // Le repli du panneau ne concerne que la colonne. En dessous du point de
  // rupture c'est une feuille glissante, qui a déjà ses trois positions :
  // deux mécanismes concurrents sur la même surface se contrediraient.
  const panneauLarge = !compact
  // En accordéons, `visible` dit oui à tout : l'empilement d'origine est
  // rendu exactement comme avant, sans une condition de plus à son sujet.
  const visible = (section: SectionApp): boolean =>
    !filtrage || sectionsDeLOnglet(ongletActif).includes(section)

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

  /*
    Une fiche ouverte occupe un coin de la carte, et les commandes ancrées à
    ce coin doivent s'écarter. Posé sur la racine plutôt que passé en
    propriété : `LocateButton` est ailleurs dans l'arbre, et c'est déjà là
    que vivent `data-mode` et `data-maquette`.

    Une seule source — l'identifiant de la fiche ouverte — plutôt qu'une
    condition recopiée dans chaque commande qui doit bouger (CLAUDE.md §4).
  */
  useEffect(() => {
    const racine = document.documentElement
    if (detailOuvert !== null) racine.dataset['fiche'] = 'ouverte'
    else delete racine.dataset['fiche']
  }, [detailOuvert])
  const [aboutOpen, setAboutOpen] = useState(false)
  /**
   * null = personne n'a touché la poignée, la position se déduit de l'état
   * (voir `positionInitiale`, qui porte les raisons). Dès qu'on la touche,
   * c'est ce choix-là qui vaut.
   */
  const [feuille, setFeuille] = useState<PositionFeuille | null>(null)
  const position: PositionFeuille =
    feuille ??
    positionInitiale({
      guideAffiche: guideDemarrageVisible(donnees, guideFerme),
      zoneRestauree: zoneRestoredAtStartup,
    })

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
    if (filtrage) {
      setFeuille(positionPourOnglet(onglet, position))
      panneauRef.current?.scrollTo({ top: 0 })
      return
    }
    // Sur grand écran rien n'est caché : il n'y a rien à ouvrir, il y a un
    // endroit où aller. Le panneau replié se rend d'abord, sinon on ferait
    // défiler une colonne absente — et l'effet ci-dessous attend ce rendu
    // plutôt que de parier sur une image.
    if (panneauReplie) void setPanneauReplie(false)
    ancreVisee.current = ancreDeLOnglet(onglet)
    setDemandeDAncre((n) => n + 1)
  }

  /**
   * Amener à la section visée, une fois qu'elle est là.
   *
   * Le défilement ne peut pas se faire dans le gestionnaire de clic : quand
   * le panneau était replié, il n'est pas encore dans le document au moment
   * où l'on clique. Attendre une image (`requestAnimationFrame`) aurait
   * marché la plupart du temps — c'est-à-dire aurait échoué sous charge, et
   * seulement en suite complète (CLAUDE.md §6ter). L'effet, lui, se déclenche
   * *parce que* le panneau vient d'être rendu.
   */
  useEffect(() => {
    const ancre = ancreVisee.current
    if (ancre === null) return
    if (panneauLarge && panneauReplie) return
    const cible = panneauRef.current?.querySelector(`[data-ancre="${ancre}"]`)
    cible?.scrollIntoView({ block: 'start' })
    ancreVisee.current = null
  }, [demandeDAncre, panneauLarge, panneauReplie])

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

      <div className={styles.layout} data-testid="layout">
        <aside
          ref={panneauRef}
          className={`${styles.sidebar} ${styles[position]}`}
          aria-label={filtrage ? 'Contenu de l’onglet' : 'Panneau de contrôle'}
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
            <span className={styles.poigneeTexte} data-testid="sheet-handle-texte">
              <PoigneeTexte pourcentage={globalPct} />
            </span>
          </button>
          <DemoBanner />
          {/* Le mode simple cache, il n'enlève pas : la carte, les traces et
              le tableau de bord restent, tout le reste se replie (#173). */}
          {sections.zone && visible('zone') && (
            <Ancre section="zone">
              <ZonePicker />
            </Ancre>
          )}
          {sections.enregistrement && visible('enregistrement') && (
            <Ancre section="enregistrement">
              <Enregistreur />
            </Ancre>
          )}
          {sections.traces && visible('traces') && (
            <Ancre section="traces">
              <TrackManager />
            </Ancre>
          )}
          {sections.itineraires && visible('itinerairesPerso') && (
            <Ancre section="itinerairesPerso">
              <CustomItineraries />
            </Ancre>
          )}
          {sections.tableauDeBord && visible('tableauDeBord') && (
            <Ancre section="tableauDeBord">
              <Dashboard />
            </Ancre>
          )}
          {sections.objectifs && visible('objectifs') && (
            <Ancre section="objectifs">
              <Objectifs />
            </Ancre>
          )}
          {sections.prochaineSortie && visible('prochaineSortie') && (
            <Ancre section="prochaineSortie">
              <NextOuting />
            </Ancre>
          )}
          {sections.historique && visible('historique') && (
            <Ancre section="historique">
              <History />
            </Ancre>
          )}
          {sections.itineraires && visible('listeItineraires') && (
            <Ancre section="listeItineraires">
              <ItineraryList />
            </Ancre>
          )}
          {sections.reglages && visible('reglages') && (
            <Ancre section="reglages">
              <Settings />
            </Ancre>
          )}
          {sections.sauvegarde && visible('sauvegarde') && (
            <Ancre section="sauvegarde">
              <Backup />
            </Ancre>
          )}
          <ModeSwitch />
          <InstallButton />
          <footer className={styles.footer} data-testid="pied-panneau">
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
            aria-controls="panneau-de-controle"
            aria-expanded={false}
            onClick={() => {
              void setPanneauReplie(false)
            }}
          >
            {/*
              Un chevron sans nom, large de 28 px, collé au bord : replier le
              panneau se fait par curiosité, le retrouver était plus difficile
              (AUDIT_UX.md, constat U13 — défaut introduit la veille par la
              PR #213). Il se nomme maintenant, et il porte ce que le panneau
              contient plutôt qu'un mot d'interface : c'est la même phrase que
              la poignée de la feuille sur téléphone, pour la même raison.

              Et c'est désormais le **même composant**, ce que le commentaire
              ci-dessus promettait déjà. Sur grand écran, panneau replié, rien
              ne disait qu'une sortie s'enregistrait : la barre d'onglets, qui
              porte le témoin sur téléphone, n'existe pas à cette largeur. Deux
              surfaces, une seule règle.
            */}
            <span aria-hidden="true">›</span>
            <span
              className={styles.rendrePanneauTexte}
              data-testid="panneau-rendre-texte"
            >
              <PoigneeTexte pourcentage={globalPct} />
            </span>
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
        <BarreOnglets
          actif={ongletActif}
          onChange={changerDOnglet}
          sortie={temoinDeSortie(enregistrement)}
        />
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
