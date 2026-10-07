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
  'ItineraryList.tsx': 970,
  'ItineraryDetail.tsx': 965,
  'TrackManager.tsx': 580,
  'ElevationChart.tsx': 495,
  'ZonePicker.tsx': 400,
  'About.tsx': 325,
  'Dashboard.tsx': 295,
  'Enregistreur.tsx': 225,
  'CustomItineraries.tsx': 195,
  'BoutonEmporter.tsx': 180,
  'MapView.tsx': 175,
  'Settings.tsx': 175,
  'RouteDrawer.tsx': 170,
  'Backup.tsx': 165,
  'Objectifs.tsx': 160,
  'InstallButton.tsx': 150,
  'History.tsx': 150,
  'DeclarerParcouru.tsx': 135,
  'SortiesReseau.tsx': 135,
  'ItineraryCard.tsx': 130,
  'MapLegend.tsx': 120,
  'OfflineBanner.tsx': 115,
  'NextOuting.tsx': 115,
  'EmptyState.tsx': 105,
  'BarreOnglets.tsx': 150,
  'UpdateBanner.tsx': 80,
  'BalisePeinte.tsx': 80,
  'ModeSwitch.tsx': 80,
  'ConfirmDeleteButton.tsx': 75,
  'LocateButton.tsx': 65,
  'ProgressBalise.tsx': 60,
  'DemoBanner.tsx': 55,
  'DemarrerRapide.tsx': 55,
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
