import { describe, it, expect } from 'vitest'

/**
 * Le plafond des composants (revue technique du 30/09).
 *
 * `ItineraryList.tsx` (950 lignes) et `ItineraryDetail.tsx` (945 lignes)
 * sont les deuxième et troisième plus gros fichiers du dépôt, juste derrière
 * `appStore.ts` — qui, lui, a un plafond testé depuis #155
 * (`plafondDuStore.test.ts`) précisément parce qu'un fichier qu'on ne mesure
 * qu'une fois par cycle regrossit tranquillement entre deux mesures. Aucun
 * garde-fou ne surveillait ces deux-là.
 *
 * Même mécanisme que `plafondDuStore.test.ts`, étendu à `src/components/` :
 * chaque fichier du dossier doit déclarer un plafond, posé au-dessus de sa
 * taille mesurée et laissant quelques dizaines de lignes — assez pour un
 * commentaire ou une garde, pas assez pour y loger une fonctionnalité
 * entière sans que personne ne le remarque.
 *
 * `src/components/map/` n'est pas couvert : ce sont des modules de rendu de
 * carte, pas des composants React, et ils n'ont pas la même forme.
 */

const fichiers: Record<string, string> = import.meta.glob<string>(
  '../../src/components/*.tsx',
  { query: '?raw', import: 'default', eager: true },
)

/** Les plafonds, en lignes — voir plafondDuStore.test.ts pour la méthode. */
const PLAFONDS: Record<string, number> = {
  // Panneau « Trouver une sortie » sorti dans DiscoveryFiltersPanel.tsx
  // (dette du 17/10, le plafond approchait 970 avec 5 lignes de marge).
  'ItineraryList.tsx': 625,
  'DiscoveryFiltersPanel.tsx': 410,
  // Section « Points d'intérêt » sortie dans PoiSection.tsx (dette du
  // 17/10, même mouvement que DiscoveryFiltersPanel.tsx).
  'ItineraryDetail.tsx': 790,
  'PoiSection.tsx': 250,
  'TrackManager.tsx': 580,
  'ElevationChart.tsx': 495,
  'ZonePicker.tsx': 400,
  // « Données et licences » sortie dans DonneesEtLicences.tsx le 18/10 : le
  // PDIPR de l'Isère (#87) portait About.tsx à 342 lignes. Redescendu de 325
  // à 270 (253 après) : un plafond qu'on ne redescend pas après un découpage
  // autorise à reprendre ce qu'on vient de rendre. 271 le 31/10 : la liste de
  // ce qui sort doit nommer la sonde IGN et le rayon élargi (#642). 210 le
  // 11/11 (206 après) : « Ce qui sort » part dans CeQuiSort.tsx quand Claude
  // (#673) s'y ajoute.
  'About.tsx': 210,
  // La liste nominative des tiers, sortie d'About.tsx le 11/11 : 88 lignes.
  // Une entrée par tiers, et chacun coûte une dizaine de lignes.
  'CeQuiSort.tsx': 110,
  'BoutonObjectif.tsx': 45,
  // 95 le 09/11 (91 après la sortie des PDIPR) : redescendu, comme About.tsx.
  'DonneesEtLicences.tsx': 95,
  // Les PDIPR départementaux, sortis de DonneesEtLicences.tsx le 09/11
  // quand le Rhône l'a porté à 134 lignes : 59 pour trois départements,
  // environ sept de plus par département. 70 le 10/11 avec le Puy-de-Dôme
  // (onze de plus, import sur plusieurs lignes compris) : 100 en laisse
  // passer trois ou quatre ; au-delà, c'est le signal d'en faire une liste de données
  // plutôt qu'une phrase écrite par département. Tranché au jugement (§2).
  'ReseauxDepartementaux.tsx': 100,
  'Dashboard.tsx': 295,
  'Enregistreur.tsx': 225,
  // #541 : la source déclarée d'un import, visible dans la liste plutôt que
  // seulement dans la fiche détaillée — quatre lignes de JSX et un commentaire.
  'CustomItineraries.tsx': 200,
  'BoutonEmporter.tsx': 180,
  'MapView.tsx': 175,
  'Settings.tsx': 175,
  // Claude, la clé de chacun (#673) : un formulaire et deux états. 75 lignes
  // le 11/11 ; 90 laisse la place d'une phrase d'aide, pas d'un second
  // usage — le récit de sortie et les questions auront leur composant.
  'ReglageClaude.tsx': 90,
  // Le bilan de saison (#673) : 148 lignes le 11/11, puis 61 le 12/11 quand
  // la demande et ses gardes sont parties dans RedactionClaude.tsx.
  'BilanDeSaison.tsx': 75,
  // Demander un texte à Claude, commun au bilan et au récit (#673) : 131
  // lignes le 12/11, cinq états et les gardes qui ne doivent vivre qu'ici.
  'RedactionClaude.tsx': 150,
  // Le récit d'une sortie (#673) : 39 lignes, les faits et l'appel.
  'RecitDeSortie.tsx': 55,
  'RouteDrawer.tsx': 170,
  'Backup.tsx': 165,
  'Objectifs.tsx': 160,
  'InstallButton.tsx': 150,
  'History.tsx': 150,
  'DeclarerParcouru.tsx': 135,
  'SortiesReseau.tsx': 135,
  'ItineraryCard.tsx': 130,
  // Relevé de 120 à 135 le 18/10 : le réseau de fond PDIPR (#87) est une
  // couche de plus sur la carte, et nommer ce qui est peint est exactement
  // le travail de ce composant — l'entrée a sa place ici, pas ailleurs.
  'MapLegend.tsx': 135,
  'OfflineBanner.tsx': 115,
  'NextOuting.tsx': 115,
  'EmptyState.tsx': 105,
  'BarreOnglets.tsx': 155,
  'UpdateBanner.tsx': 80,
  'BalisePeinte.tsx': 80,
  'ModeSwitch.tsx': 80,
  'ConfirmDeleteButton.tsx': 75,
  'LocateButton.tsx': 65,
  'ProgressBalise.tsx': 60,
  'DemoBanner.tsx': 50,
  // L'avis de fin sorti de DemoBanner.tsx (#657) : ramené dans le champ au
  // téléphone, il portait DemoBanner au-delà de son plafond.
  'FinDeDemonstration.tsx': 35,
  'DemarrerRapide.tsx': 48,
  'PoigneeTexte.tsx': 40,
}

describe('les composants ne regrossissent pas en silence', () => {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    const nom = chemin.split('/').pop() ?? chemin
    const plafond = PLAFONDS[nom]

    /*
      Un composant ajouté sans plafond passerait inaperçu, et le prochain
      millier de lignes s'y installerait tranquillement — exactement le
      trou que #155 avait laissé entre deux mesures manuelles de
      `appStore.ts`. Même règle, même remède (CLAUDE.md §4).
    */
    it(`${nom} a un plafond`, () => {
      expect(
        plafond,
        `${nom} est dans src/components/ sans plafond : ajoutez-en un dans PLAFONDS, au-dessus de sa taille actuelle et au-dessous de ce qu'on accepterait`,
      ).toBeDefined()
    })

    if (plafond === undefined) continue

    it(`${nom} tient sous ${String(plafond)} lignes`, () => {
      const lignes = contenu.split('\n').length
      expect(
        lignes,
        `${nom} fait ${String(lignes)} lignes pour un plafond de ${String(plafond)}. ` +
          `Deux réponses honnêtes : en extraire un sous-composant, ou relever le ` +
          `plafond en disant pourquoi ces lignes ont leur place ici. Pas de troisième.`,
      ).toBeLessThanOrEqual(plafond)
    })
  }
})
