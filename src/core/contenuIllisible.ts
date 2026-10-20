/**
 * Ce qu'est un fichier quand ce n'est pas du XML (#567, point 3).
 *
 * L'aiguillage de `store/lecture.ts` confie au lecteur GPX tout ce qui n'est
 * ni FIT ni TCX. Pour un contenu qui n'est pas du XML du tout, le lecteur GPX
 * répondait « Vérifiez qu’il s’agit bien d’un export GPX » — à un ZIP vide,
 * à un faux `.fit`, à un `.gz` : un conseil hors sujet. Ici, on dit ce qu'on
 * reconnaît ; ce qui ressemble à du XML reste au lecteur GPX, dont le message
 * est alors le bon.
 */

/** L'en-tête de fin d'une archive ZIP — seul, il fait une archive vide. */
const SIGNATURE_ZIP_FIN = 0x06054b50

/** Les deux premiers octets de tout flux gzip (RFC 1952, §2.3.1). */
const GZIP = [0x1f, 0x8b] as const

/**
 * Le message pour un contenu qu'aucun lecteur ne prendra, ou `null` quand il
 * ressemble à du XML et que le lecteur GPX doit en juger.
 */
export function pourquoiIllisible(
  buffer: ArrayBuffer,
  texte: string,
): string | null {
  const octets = new Uint8Array(buffer)
  if (
    octets.length >= 4 &&
    new DataView(buffer).getUint32(0, true) === SIGNATURE_ZIP_FIN
  ) {
    return 'Cette archive ZIP est vide : elle ne contient aucun fichier.'
  }
  if (octets[0] === GZIP[0] && octets[1] === GZIP[1]) {
    return 'Ce fichier est compressé (gzip). Les .gz se lisent à l’intérieur d’une archive ZIP, pas seuls : décompressez-le d’abord, ou déposez l’archive d’origine.'
  }
  // La marque d'ordre d'octets et les blancs ne disent rien du format.
  const debut = texte.replace(/^\uFEFF/, '').trimStart()
  if (debut === '') return 'Ce fichier est vide.'
  if (debut.startsWith('<')) return null
  return 'Ce fichier n’est ni un GPX, ni un FIT, ni un TCX : son contenu n’est reconnu comme aucun de ces formats.'
}
