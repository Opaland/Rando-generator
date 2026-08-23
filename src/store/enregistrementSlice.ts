import {
  abandonner as abandonnerEnregistrement,
  ajouterPoint,
  demarrer as demarrerEnregistrement,
  enregistreurVide,
  reprendre as reprendreEnregistrement,
  suspendre as suspendreEnregistrement,
  terminer as terminerEnregistrement,
  type Enregistrement,
} from '../core/recorder.ts'
import {
  entete,
  pointsAEcrire,
  reprendreApresInterruption,
} from '../core/reprise.ts'
import { versTrace } from '../core/sortieEnCours.ts'
import { geolocationErrorMessage } from '../core/geolocation.ts'
import type { Track } from '../core/types.ts'
import type { SentiersDb } from '../db/database.ts'
import type { VeilleGeo } from './veilleGeo.ts'

/**
 * L'enregistrement d'une sortie, côté application (issue #152).
 *
 * Cette tranche vivait dans `appStore.ts`, qu'elle a fait passer de 2 110 à
 * 2 398 lignes en une nuit — l'issue #155 signalait déjà ce fichier comme
 * gênant. Elle en sort avec **des ports étroits** plutôt qu'avec le store
 * entier : elle ne sait rien des zones, des itinéraires ni de la carte, et
 * ce qu'elle demande à l'extérieur tient en cinq fonctions.
 *
 * Le gain n'est pas la taille du fichier. C'est que tout ce qui suit
 * s'éprouve **sans navigateur** : la file d'écriture, le compteur de points
 * déjà écrits, la reprise après un onglet tué, le passage en pause sur
 * erreur GPS. Chacune de ces mécaniques s'est cassée au moins une fois
 * cette nuit, et chacune n'était gardée que par un test e2e.
 */

/** Ce que la tranche pose dans le store. */
export interface EtatSortie {
  enregistrement: Enregistrement
  /**
   * Vrai quand la sortie a été retrouvée après une interruption, et pas
   * démarrée par un geste. L'écran le dit : reprendre en pause sans
   * expliquer pourquoi ressemblerait à un défaut.
   */
  sortieReprise: boolean
  sortieErreur: string | null
}

export function etatSortieInitial(): EtatSortie {
  return {
    enregistrement: enregistreurVide(),
    sortieReprise: false,
    sortieErreur: null,
  }
}

/**
 * Tout ce que la tranche demande au reste de l'application.
 *
 * Cinq fonctions, et pas le store : c'est ce qui permet de la dérouler
 * entière dans un test avec une base en mémoire et une veille factice.
 */
export interface PortsSortie {
  lire: () => EtatSortie
  poser: (partiel: Partial<EtatSortie>) => void
  /** `null` quand le stockage local est indisponible. */
  base: () => SentiersDb | null
  /** Range la trace produite avec les autres, et relance l'appariement. */
  rangerTrace: (trace: Track) => Promise<void>
  /** La démonstration s'efface au premier geste réel (issue #172). */
  quitterDemonstration: () => void
  veille: VeilleGeo
  /** Injectable pour les tests : `Date.now` par défaut. */
  maintenant?: () => number
}

export interface ActionsSortie {
  demarrerSortie: () => void
  suspendreSortie: () => void
  poursuivreSortie: () => void
  terminerSortie: () => Promise<void>
  abandonnerSortie: () => Promise<void>
}

export interface TrancheSortie {
  actions: ActionsSortie
  /** Branché sur la veille partagée par le store. */
  surPosition: (position: GeolocationPosition) => void
  surErreurGeo: (erreur: GeolocationPositionError) => void
  /** Au démarrage : retrouve une sortie que personne n'a terminée. */
  reprendreAuDemarrage: (base: SentiersDb) => Promise<void>
  /** Attend que les écritures en attente soient allées au disque. */
  ecrituresTerminees: () => Promise<void>
}

const MESSAGE_SANS_GEOLOCALISATION =
  'Votre navigateur ne fournit pas la localisation.'

export function creerTrancheSortie(ports: PortsSortie): TrancheSortie {
  const maintenant = ports.maintenant ?? (() => Date.now())

  /**
   * Toutes les écritures de la sortie passent par ici, dans l'ordre.
   *
   * Elles ne peuvent pas se chevaucher, et ce n'est pas une précaution
   * théorique : la première version effaçait l'ancien tampon **en
   * parallèle** des premières positions, et l'effacement gagnait la course.
   * Une sortie démarrée puis rechargée revenait vide — mesuré, quatre
   * points écrits, zéro relu. Le défaut ne se voyait qu'au rechargement,
   * c'est-à-dire au seul moment qui compte.
   */
  let chaine: Promise<void> = Promise.resolve()

  function enfiler(tache: () => Promise<void>): Promise<void> {
    const suivante = chaine.then(tache, tache).catch(() => {
      // Une écriture ratée — quota, base fermée — ne bloque pas les suivantes.
    })
    chaine = suivante
    return suivante
  }

  /**
   * Combien de points de la sortie en cours sont déjà sur le disque.
   *
   * `null` veut dire « on ne sait plus » : la valeur sera relue en base au
   * prochain tour. C'est l'état après une écriture ratée, et c'est le seul
   * moment où la question se repose.
   *
   * Ce compteur remplace une lecture de `count()` avant **chaque** point.
   * Mesuré sur une sortie de deux mille points : les cent dernières
   * écritures coûtaient 95 ms contre 23 ms pour les cent premières — un
   * facteur quatre qui grandissait avec la sortie, c'est-à-dire qui
   * s'aggravait à mesure que la batterie baissait. Ce n'était pas l'ajout
   * qui coûtait, c'était le comptage.
   *
   * Il reste exact parce que la file sérialise tout : il n'avance qu'après
   * une écriture réussie, et se remet à `null` sinon.
   */
  let pointsEcrits: number | null = null

  function ecrireEntete(e: Enregistrement): Promise<void> {
    return enfiler(async () => {
      const base = ports.base()
      if (!base) return
      await base.ecrireEntete(entete(e, maintenant()))
    })
  }

  function viderLeTampon(): Promise<void> {
    return enfiler(async () => {
      const base = ports.base()
      if (!base) return
      await base.effacerEnregistrement()
      pointsEcrits = 0
    })
  }

  /** Écrit sur le disque les points que le disque n'a pas encore vus. */
  function ecrirePointsEnAttente(e: Enregistrement): Promise<void> {
    return enfiler(async () => {
      const base = ports.base()
      if (!base) return
      try {
        pointsEcrits ??= await base.compterPointsEnregistres()
        const aEcrire = pointsAEcrire(e, pointsEcrits)
        await base.ajouterPointsEnregistres(aEcrire)
        pointsEcrits += aEcrire.length
      } catch {
        // Quota ou base fermée : la sortie continue en mémoire, et on ne
        // sait plus où en est le disque. Le prochain point relira le compte
        // et réécrira ce qui manque.
        pointsEcrits = null
      }
    })
  }

  const actions: ActionsSortie = {
    /**
     * Démarrer une sortie.
     *
     * Le tampon est effacé d'abord : une nouvelle sortie remplace
     * l'ancienne, et laisser traîner un tampon à moitié écrit ferait
     * proposer une reprise pour une randonnée déjà rangée.
     */
    demarrerSortie() {
      if (ports.lire().enregistrement.etat !== 'repos') return
      if (!ports.veille.demarrer('sortie')) {
        ports.poser({ sortieErreur: MESSAGE_SANS_GEOLOCALISATION })
        return
      }
      // La démonstration s'efface au premier geste réel — c'est ce que fait
      // déjà l'import d'un fichier depuis l'issue #172, et démarrer une
      // sortie est plus réel encore : ça enregistre une position toutes les
      // quelques secondes. Sans cela, une vraie trace allait se ranger à
      // côté de trois sorties fictives, dans le même pourcentage.
      ports.quitterDemonstration()
      const debut = demarrerEnregistrement(enregistreurVide(), maintenant())
      ports.poser({
        enregistrement: debut,
        sortieReprise: false,
        sortieErreur: null,
      })
      void viderLeTampon()
      void ecrireEntete(debut)
    },

    suspendreSortie() {
      const suspendu = suspendreEnregistrement(
        ports.lire().enregistrement,
        maintenant(),
      )
      ports.poser({ enregistrement: suspendu })
      void ecrireEntete(suspendu)
    },

    poursuivreSortie() {
      const repris = reprendreEnregistrement(
        ports.lire().enregistrement,
        maintenant(),
      )
      if (repris.etat === 'enregistrement') ports.veille.demarrer('sortie')
      ports.poser({ enregistrement: repris, sortieReprise: false })
      void ecrireEntete(repris)
    },

    /**
     * Finir la sortie, et la ranger avec les autres.
     *
     * C'est le point de jonction : à partir d'ici, une sortie enregistrée
     * est une trace comme une autre — appariée, comptée, exportable — et
     * rien en aval n'a besoin de savoir d'où elle vient.
     */
    async terminerSortie() {
      const fini = terminerEnregistrement(
        ports.lire().enregistrement,
        maintenant(),
      )
      ports.veille.arreter('sortie')
      const trace = versTrace(fini, `sortie-${String(fini.demarreA ?? 0)}`)
      ports.poser({ enregistrement: enregistreurVide(), sortieReprise: false })
      await viderLeTampon()
      // Une sortie sans le moindre point ne produit rien : il n'y a rien à
      // apparier, et une trace vide dans l'historique ne dit rien à personne.
      if (!trace) return
      await ports.rangerTrace(trace)
    },

    async abandonnerSortie() {
      ports.veille.arreter('sortie')
      ports.poser({
        enregistrement: abandonnerEnregistrement(ports.lire().enregistrement),
        sortieReprise: false,
        sortieErreur: null,
      })
      await viderLeTampon()
    },
  }

  return {
    actions,

    surPosition(position) {
      const enCours = ports.lire().enregistrement
      // Pas de garde sur l'état ici : `ajouterPoint` refuse déjà tout ce
      // qui n'arrive pas pendant l'enregistrement — en pause comme au
      // repos — et rend l'objet inchangé. Un second garde à cet endroit
      // n'a pas survécu à la mutation : le remplacer par n'importe quoi
      // ne changeait aucun résultat. Une règle, un endroit (CLAUDE.md §4).
      const suivant = ajouterPoint(enCours, {
        lon: position.coords.longitude,
        lat: position.coords.latitude,
        instant: position.timestamp,
        precisionMetres: position.coords.accuracy,
        altitude: position.coords.altitude,
      })
      if (suivant === enCours) return
      ports.poser({ enregistrement: suivant })
      void ecrirePointsEnAttente(suivant)
    },

    surErreurGeo(erreur) {
      // L'enregistrement n'est pas jeté : ce qui a été marché a été écrit.
      // Il passe en pause, comme après un onglet tué, et attend.
      const enCours = ports.lire().enregistrement
      if (enCours.etat !== 'enregistrement') return
      const suspendu = suspendreEnregistrement(enCours, maintenant())
      ports.poser({
        enregistrement: suspendu,
        sortieErreur: geolocationErrorMessage(erreur.code),
      })
      void ecrireEntete(suspendu)
    },

    /**
     * Une sortie qu'on n'a jamais terminée attend en base. On la retrouve
     * **en pause** : l'onglet a pu mourir il y a trois heures, et personne
     * ne sait ce qui s'est passé pendant ce temps (`core/reprise.ts`
     * explique pourquoi ce choix-là).
     *
     * Elle ne s'impose qu'à un enregistreur au repos : si la personne a déjà
     * démarré une sortie pendant que la base s'ouvrait, c'est la sienne qui
     * compte — la même course que sur les réglages, réglée de la même façon.
     */
    async reprendreAuDemarrage(base) {
      try {
        const tete = await base.lireEntete()
        if (!tete) return
        const repris = reprendreApresInterruption(
          tete,
          await base.lirePointsEnregistres(),
        )
        if (!repris) return
        if (ports.lire().enregistrement.etat !== 'repos') return
        // Ce qui a été relu est exactement ce qui est sur le disque.
        pointsEcrits = repris.points.length
        ports.poser({ enregistrement: repris, sortieReprise: true })
        await ecrireEntete(repris)
      } catch {
        // Un tampon illisible ne doit pas empêcher l'application d'ouvrir.
      }
    },

    ecrituresTerminees: () => chaine,
  }
}
