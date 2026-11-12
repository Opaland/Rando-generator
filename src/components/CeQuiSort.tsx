/**
 * « Ce qui sort de votre appareil, et pour qui » : la liste nominative des
 * tiers, dans « À propos ».
 *
 * Sortie d'`About.tsx` le 11/11, quand Claude (#673) l'aurait porté au-delà de
 * son plafond de 271 lignes — la réponse honnête de
 * `plafondDesComposants.test.ts` : un sous-composant cohérent plutôt qu'un
 * plafond relevé. Le texte est déplacé tel quel ; seule l'entrée de Claude
 * s'y ajoute.
 */
export function CeQuiSort() {
  return (
    <section data-testid="about-sortant">
      <h3>Ce qui sort de votre appareil, et pour qui</h3>
      <p>
        Sentiers n’a pas de serveur, mais il interroge des services publics
        tiers pour faire son travail. Ces services voient donc passer
        quelque chose. Ce n’est pas un aveu&nbsp;: c’est le fonctionnement
        normal d’une application cartographique sans serveur, et il vaut
        mieux le nommer que le laisser supposer.
      </p>
      <ul>
        <li>
          <strong>Overpass</strong> (overpass-api.de, avec un miroir chez
          kumi.systems) reçoit la <strong>zone demandée</strong>, la{' '}
          <strong>référence tapée</strong> («&nbsp;GR&nbsp;7&nbsp;») ou un{' '}
          <strong>rayon autour d’un point</strong>, quand vous chargez une
          zone ou lancez une recherche (12&nbsp;km, puis 25&nbsp;km si rien
          n’y est trouvé). C’est de là que viennent les tracés.
          Overpass reçoit aussi, en plusieurs boîtes qui suivent le
          tracé, la <strong>forme de l’itinéraire dont vous ouvrez la
          fiche</strong> — pour y chercher les points d’intérêt à
          proximité. Cela vaut aussi pour un itinéraire que vous avez{' '}
          <strong>importé</strong>.
        </li>
        <li>
          La <strong>Géoplateforme IGN</strong> reçoit les{' '}
          <strong>coordonnées des tuiles que vous regardez</strong>, en
          continu tant que la carte est affichée. Autrement dit&nbsp;: où
          vous préparez vos sorties. Quand vous <strong>emportez</strong>{' '}
          un itinéraire, elle reçoit aussi celles de tout son corridor,
          que vous ne regardez pas. Pour une <strong>fiche ouverte</strong>,
          la tuile du départ, qui dit si le plan couvre l’itinéraire.
        </li>
        <li>
          <strong>OpenStreetMap</strong> reçoit la même chose, mais
          seulement en <strong>repli</strong>, si le fond IGN ne répond pas.
        </li>
        <li>
          Le service d’<strong>altimétrie</strong> de la Géoplateforme IGN
          reçoit{' '}
          <strong>
            jusqu’à cent points de l’itinéraire dont vous ouvrez le profil
          </strong>{' '}
          — assez pour savoir précisément lequel c’est. Cela vaut aussi pour
          un itinéraire que vous avez <strong>importé</strong> dans
          «&nbsp;Mes itinéraires&nbsp;», et pour un parcours que vous tracez
          à la main. Vos <strong>sorties</strong>, elles, ne partent
          jamais vers ce service.
        </li>
        <li>
          L’<strong>API Adresse</strong> (Base Adresse Nationale) reçoit le{' '}
          <strong>nom de commune que vous tapez</strong>, et rien d’autre —
          ni vos traces, ni votre position.
        </li>
        <li>
          <strong>Claude</strong> (api.anthropic.com), seulement si vous avez
          collé votre propre clé d’API dans Réglages et demandé un texte.
          Pour le récit d’une sortie, il reçoit sa{' '}
          <strong>longueur, son dénivelé, son mois</strong>, les zones
          prédéfinies traversées et les itinéraires balisés publics qu’elle a
          fait avancer — jamais ceux
          que vous avez créés ou importés. Pour un bilan, il reçoit les{' '}
          <strong>totaux de l’année</strong> —
          sorties, kilomètres, dénivelé, mois, noms des zones prédéfinies
          que vos sorties traversent (départements, Parc du Pilat…) —,
          montrés avant l’envoi. Jamais une trace, une position, une date
          précise ni le nom de vos fichiers.
        </li>
        <li>
          Enfin, le site est servi par <strong>GitHub Pages</strong>, qui
          voit passer la demande de la page et de ses fichiers, comme tout
          hébergeur. Nous n’y avons ni compte utilisateur ni mesure
          d’audience, mais nous ne pouvons pas prétendre que personne ne
          sait que vous êtes venu.
        </li>
      </ul>
      <p>
        Votre <strong>position GPS</strong>, quand vous l’activez, reste
        dans le navigateur&nbsp;: elle sert à vous placer sur la carte et
        n’est envoyée à aucun de ces services.
      </p>
    </section>
  )
}
