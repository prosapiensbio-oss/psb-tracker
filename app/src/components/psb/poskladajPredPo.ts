import { PLATNO, polovice, vyrezCover } from "../../lib/psb/porovnaniePredPo";

/**
 * Poskladá fotku před (vľavo) a po (vpravo) do jedného porovnania.
 * `imageOrientation: "from-image"` — fotka z iPadu na výšku by inak prišla
 * naležato (rovnaké pravidlo ako v kartotéke).
 */
export async function poskladajPredPo(pred: Blob, po: Blob): Promise<Blob> {
  const platno = document.createElement("canvas");
  platno.width = PLATNO.sirka;
  platno.height = PLATNO.vyska;
  const g = platno.getContext("2d");
  if (!g) throw new Error("Prehliadač nevie kresliť do plátna.");
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, PLATNO.sirka, PLATNO.vyska);
  const casti = polovice();
  const obrazky = await Promise.all([pred, po].map((b) => createImageBitmap(b, { imageOrientation: "from-image" })));
  obrazky.forEach((o, i) => {
    const c = casti[i];
    const v = vyrezCover(o.width, o.height, c.s, c.v);
    g.drawImage(o, v.sx, v.sy, v.sw, v.sh, c.x, c.y, c.s, c.v);
    // Štítok vľavo dole: PŘED / PO — klient vie, ktorá je ktorá, aj bez textu pod fotkou.
    const text = i === 0 ? "PŘED" : "PO";
    g.font = "700 46px Arial, Helvetica, sans-serif";
    const w = g.measureText(text).width + 52;
    g.fillStyle = "rgba(26,46,36,0.86)";
    g.beginPath();
    g.roundRect(c.x + 28, c.v - 28 - 76, w, 76, 38);
    g.fill();
    g.fillStyle = "#FFFFFF";
    g.fillText(text, c.x + 28 + 26, c.v - 28 - 22);
    o.close();
  });
  return await new Promise<Blob>((ok, chyba) =>
    platno.toBlob((b) => (b ? ok(b) : chyba(new Error("Porovnanie sa nepodarilo uložiť."))), "image/jpeg", 0.88));
}
