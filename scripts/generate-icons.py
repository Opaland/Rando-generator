#!/usr/bin/env python3
"""Génère les icônes PNG de l'application à partir du dessin de public/icon.svg.

Aucune bibliothèque d'image n'est requise : un PNG RVB non filtré tient en
quelques dizaines de lignes (zlib + CRC32 de la bibliothèque standard). Les
icônes sont commitées ; ce script sert à les régénérer si le logo change.

    python3 scripts/generate-icons.py
"""

import struct
import zlib
from pathlib import Path

# Mêmes couleurs et proportions que public/icon.svg (dessiné sur 512×512).
FOND = (0x1E, 0x2B, 0x23)
BLANC = (0xFF, 0xFF, 0xFF)
ROUGE = (0xC8, 0x10, 0x2E)
REFERENCE = 512
BANDE_X = (96, 416)
BANDE_BLANCHE_Y = (160, 248)
BANDE_ROUGE_Y = (264, 352)


def couleur(x: int, y: int, echelle: float) -> tuple[int, int, int]:
    """Couleur du pixel (x, y), ramené au repère 512×512 du logo."""
    rx, ry = x / echelle, y / echelle
    dans_x = BANDE_X[0] <= rx < BANDE_X[1]
    if dans_x and BANDE_BLANCHE_Y[0] <= ry < BANDE_BLANCHE_Y[1]:
        return BLANC
    if dans_x and BANDE_ROUGE_Y[0] <= ry < BANDE_ROUGE_Y[1]:
        return ROUGE
    return FOND


def chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def png(size: int) -> bytes:
    echelle = size / REFERENCE
    lignes = bytearray()
    for y in range(size):
        lignes.append(0)  # filtre « None » pour cette ligne
        for x in range(size):
            lignes.extend(couleur(x, y, echelle))
    entete = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # RVB 8 bits
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", entete)
        + chunk(b"IDAT", zlib.compress(bytes(lignes), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    public = Path(__file__).resolve().parent.parent / "public"
    for size in (192, 512):
        cible = public / f"icon-{size}.png"
        cible.write_bytes(png(size))
        print(f"{cible.name} : {cible.stat().st_size} octets")


if __name__ == "__main__":
    main()
