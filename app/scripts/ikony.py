#!/usr/bin/env python3
"""Ikona Kokpitu na plochu — z tých istých vrstiev ako pozadie appky.

Jerry, 31. 8. 2026: „nedala by sa spraviť v tom istom štýle design ako je
Kokpit?" Prvá ikona bola prevzatá z favicony: zelený rámik a „PSB" v Arial
Bold. So vzhľadom appky nemala spoločné nič — Kokpit je jantárový na tmavom
skle, nie zelený v rámiku.

Hodnoty NIE SÚ odhadnuté z obrázka, sú opísané zo `styles.css`, motív
„Živé sklo · Tmavý" (:root[data-psb-theme="sklo"]) — teda ten, ktorý je
východiskový a ktorý Jerry používa:

    --c-base1 #14180f  --c-base2 #1c2216   linear-gradient(160deg)
    --c-mesh1 #4a5c2e  15% 8%   do 45 %
    --c-mesh2 #5c6b3a  88% 12%  do 50 %
    --c-mesh3 #2e3a1c  45% 95%  do 55 %
    --c-accent #e2914e                      farba nápisu „Kokpit"

Písmo je SF (system-ui), rovnaké ako v appke — nie náhrada.

Púšťa sa ručne pri zmene vzhľadu:  python3 scripts/ikony.py
"""
import math
from PIL import Image, ImageDraw, ImageFont

BASE1, BASE2 = (0x14, 0x18, 0x0F), (0x1C, 0x22, 0x16)
MESH = [((0x4A, 0x5C, 0x2E), 0.15, 0.08, 0.45),
        ((0x5C, 0x6B, 0x3A), 0.88, 0.12, 0.50),
        ((0x2E, 0x3A, 0x1C), 0.45, 0.95, 0.55)]
AKCENT = (0xE2, 0x91, 0x4E)
SILA_ZIARY = 0.55
SF = "/System/Library/Fonts/SFNS.ttf"


def pozadie(n: int) -> Image.Image:
    """Tri radiálne žiary nad lineárnym prechodom — presne ako body::before."""
    im = Image.new("RGB", (n, n))
    px = im.load()
    # 160° v CSS meria od osi Y v smere hodinových ručičiek.
    uhol = math.radians(160 - 90)
    dx, dy = math.cos(uhol), math.sin(uhol)
    dlzka = abs(dx) + abs(dy)
    for y in range(n):
        for x in range(n):
            t = ((x / (n - 1) - 0.5) * dx + (y / (n - 1) - 0.5) * dy) / dlzka + 0.5
            r, g, b = (int(a + (c - a) * t) for a, c in zip(BASE1, BASE2))
            for (mr, mg, mb), cx, cy, dosah in MESH:
                # `circle` bez veľkosti = po najvzdialenejší roh.
                roh = max(math.hypot(cx - u, cy - v) for u in (0, 1) for v in (0, 1))
                d = math.hypot(x / (n - 1) - cx, y / (n - 1) - cy) / (roh * dosah)
                if d >= 1:
                    continue
                # Na ploche telefónu má ikona 60 px a jantár na plnej olivovej
                # je málo čitateľný. Žiara sa preto tlmí — atmosféra zostane,
                # základ ostane tmavý ako v appke pod kartami.
                a = (1 - d) * SILA_ZIARY
                r, g, b = int(r + (mr - r) * a), int(g + (mg - g) * a), int(b + (mb - b) * a)
            px[x, y] = (r, g, b)
    return im


def ikona(px: int, znak: str = "K", podiel: float = 0.56, orez: float = 0.0) -> Image.Image:
    """`orez` = koľko okraja si smie systém odrezať (maskable ikona)."""
    S = px * 4
    im = pozadie(160).resize((S, S), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(SF, int(S * podiel * (1 - orez)))
    f.set_variation_by_name("Heavy")   # v appke je fontWeight 800
    l, t, r, b = d.textbbox((0, 0), znak, font=f)
    d.text(((S - (r - l)) / 2 - l, (S - (b - t)) / 2 - t), znak, font=f, fill=AKCENT)
    return im.resize((px, px), Image.LANCZOS)


if __name__ == "__main__":
    ikona(180).save("public/apple-touch-icon.png", optimize=True)
    ikona(192).save("public/ikona-192.png", optimize=True)
    ikona(512).save("public/ikona-512.png", optimize=True)
    # maskable: obsah v bezpečnej zóne 80 %, okraje sa môžu orezať do kruhu
    ikona(512, orez=0.28).save("public/ikona-512-maskable.png", optimize=True)
    print("hotovo")
