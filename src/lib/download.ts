/**
 * Déclenche le téléchargement d'un fichier généré dans le navigateur.
 * Le contenu ne transite par aucun serveur : il est fabriqué en mémoire,
 * conformément à la promesse « rien ne quitte votre navigateur ».
 */
export function downloadTextFile(
  filename: string,
  text: string,
  mimeType = 'application/gpx+xml',
): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Libère l'URL une fois le téléchargement démarré.
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
