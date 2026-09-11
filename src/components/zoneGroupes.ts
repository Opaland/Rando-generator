import type { ZoneGroup } from '../core/overpass.ts'

/**
 * Les groupes de zones, dans l'ordre où ils s'affichent dans `ZonePicker`.
 *
 * Deux blocs identiques étaient copiés-collés dans le composant — le même
 * `<p>`, le même `<div role="group">`, le même bouton, à un filtre près.
 * Ajouter le massif vosgien (#286) en aurait fait un troisième, et la
 * troisième copie est toujours celle qui diverge (CLAUDE.md §4) : c'est ce
 * qui a fait naître cette table.
 *
 * Extrait du composant pour qu'un test puisse le comparer aux groupes
 * réellement portés par `ZONES` sans importer React ni le CSS du panneau
 * (issue #505) — `ZonePicker` ne rend que les zones dont le groupe figure
 * ici : un groupe ajouté à `ZONES` sans entrée ici ne s'affiche jamais,
 * silencieusement (CLAUDE.md §4ter). `tests/unit/overpass.test.ts` garde
 * l'accord entre les deux.
 *
 * L'identifiant du groupe sert aussi d'ancre `aria-labelledby`, ce qui
 * garantit qu'un groupe ajouté ici arrive nommé pour un lecteur d'écran, et
 * pas seulement peint.
 */
export const GROUPES: { id: ZoneGroup; titre: string }[] = [
  { id: 'proche', titre: 'Autour de chez moi' },
  { id: 'aura', titre: 'Auvergne-Rhône-Alpes, par département' },
  { id: 'vosges', titre: 'Massif vosgien, par département' },
  { id: 'nc', titre: 'Nouvelle-Calédonie' },
]
