"""Zostaví editory do public/editor/ (foto.html, video.html).

Editor fotiek aj editor videa sú samostatné stránky — karta Editor vo
Workspace ich otvorí v rámiku (iframe), každú zvlášť, a obe nechá
načítané, aby sa prepnutím nestratila rozrobená práca.

Stránky nie sú React: sú to náčrty, ktoré si Jerry vyskúšal (6. 10. 2026)
a ktoré sa tak preniesli do Kokpitu. Spoločné časti sú v tomto priečinku
a do stránok sa VKLADAJÚ (jedna stránka = jeden súbor):

  jadro.js / jadro.css  — fotkový editor (štvorec, výrez, mriežka, čiary)
  ui.css                — panel, skupiny, tlačidlá, zásobník
  sklad.js              — zásobník snímok (IndexedDB), spoločný pre oba editory

Po každej zmene:  python3 editor/zostav.py   (z priečinka app/)
Test `src/lib/psb/editorZostava.test.ts` stráži, že public/editor je zostavený z aktuálnych častí.
"""
import re, pathlib
tu = pathlib.Path(__file__).parent
von = tu.parent / "public" / "editor"
von.mkdir(parents=True, exist_ok=True)
js = {"jadro-js": (tu / "jadro.js").read_text(), "sklad-js": (tu / "sklad.js").read_text()}
css = {"jadro-css": (tu / "jadro.css").read_text(), "ui-css": (tu / "ui.css").read_text()}
for sablona, ciel in [("foto.sablona.html", "foto.html"), ("video.sablona.html", "video.html")]:
    s = (tu / sablona).read_text()
    # V <script> je značka HTML komentár (prehliadač ho tam berie ako riadkový komentár).
    for k, v in js.items():
        s = re.sub(rf"<!--{k}-->.*?<!--/{k}-->", lambda m: f"<!--{k}-->\n{v}<!--/{k}-->", s, flags=re.S)
    # V <style> musia byť značky CSS komentáre — HTML komentár by pokazil prvé pravidlo.
    for k, v in css.items():
        s = re.sub(rf"/\*{k}\*/.*?/\*/{k}\*/", lambda m: f"/*{k}*/\n{v}/*/{k}*/", s, flags=re.S)
    (von / ciel).write_text(s)
    print("zostavené:", von / ciel)
