import qrcode from "qrcode-generator";

import { DODAVATEL, den, spayd, suma, type Faktura } from "./vydanaFaktura";

/**
 * Faktúra ako tlačiteľný dokument.
 *
 * Rovnaká cesta ako pri reporte: appka zloží HTML a tlač prehliadača z neho
 * urobí PDF. Knižnica na PDF by musela ťahať font kvôli českým znakom
 * a tabuľky by sadzala horšie než prehliadač.
 *
 * Rozloženie je zámerne blízke tomu, čo Jerry posielal z iDokladu — klienti
 * ten papier poznajú a faktúra nie je miesto na prekvapenia. Pribudla jediná
 * vec navyše: QR platba.
 */

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Farby z palety appky (svetlá), nie vymyslené — doklad patrí k značke. */
const B = {
  text: "#2c3524",
  zelen: "#5e7c38",
  zelenTmava: "#456127",
  linka: "#c8c2ae",
  slaba: "#6b7560",
  slabsia: "#8a9280",
} as const;

/** QR platba ako SVG. Vkladá sa priamo do dokumentu — žiadny externý obrázok. */
export function qrSvg(text: string, velkost = 3): string {
  const q = qrcode(0, "M");
  q.addData(text, "Byte");
  q.make();
  return q.createSvgTag({ cellSize: velkost, margin: velkost * 2, scalable: true });
}

/** Riadky adresy, prázdne sa vynechajú. */
const adresa = (r: (string | undefined)[]) =>
  r.filter((x) => x && String(x).trim()).map((x) => `${esc(String(x))}<br>`).join("");

/** Značka a figúra sa berú zo súborov, ktoré appka už serveruje. */
const ZNACKA = "/znacka-napis.svg";
const FIGURA = "/znacka-figura.svg";

export function fakturaDocument(f: Faktura): string {
  const platba = spayd({
    suma: f.celkom,
    vs: f.cislo,
    sprava: `Faktura ${f.cislo} PSB`,
    splatnost: f.splatnost,
    prijemca: DODAVATEL.meno,
  });
  const o = f.odberatel;
  const odberatel = o.firma || f.klient;
  const ic = [o.ico && `IČ ${esc(o.ico)}`, o.dic && `DIČ ${esc(o.dic)}`].filter(Boolean).join(" · ");
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<title>Faktura ${esc(f.cislo)}</title>
<style>
  /* Písmo značky. Keď sa nenačíta (tlač z iného zariadenia), doklad vyzerá
     inak, ale zostane čitateľný — preto rozumný záložný rad, nie serif. */
  @font-face { font-family: "Agrandir"; src: url("/agrandir.woff2") format("woff2"); font-weight: 100 900; font-display: swap; }
  @page { size: A4; margin: 0; }
  @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Agrandir", "Helvetica Neue", -apple-system, "Segoe UI", Roboto, sans-serif;
         color: ${B.text}; -webkit-font-smoothing: antialiased; }
  .list { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; display: flex; }
  /* Pásik so značkou. Jerry si ho vybral 26. 9. 2026 z piatich návrhov:
     „vyhráva 4, zelený pásik." Vyzerá to ako hlavičkový papier, na ktorom je
     faktúra len obsah. */
  .pasik { flex: 0 0 34mm; background: ${B.zelenTmava}; color: #fbfaf2; padding: 14mm 6mm;
           display: flex; flex-direction: column; justify-content: space-between; align-items: center; }
  .telo { flex: 1; padding: 14mm 14mm 12mm; position: relative; }
  .stitok { font-size: 7.5pt; letter-spacing: 1.4pt; text-transform: uppercase; color: ${B.slaba}; font-weight: 600; }
  .n { font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 7.5pt; letter-spacing: 1.4pt; text-transform: uppercase; color: ${B.slaba};
       font-weight: 600; text-align: right; padding-bottom: 3mm; }
  th:first-child, td:first-child { text-align: left; }
  th + th, td + td { padding-left: 7mm; }
  td { padding: 3.5mm 0; text-align: right; font-size: 10.5pt;
       border-top: 1px solid ${B.linka}; border-bottom: 1px solid ${B.linka}; }
  .suma { border: 1px solid ${B.linka}; border-left: 4px solid ${B.zelen}; padding: 5mm 6mm;
          margin: 8mm 0 10mm; display: flex; justify-content: space-between; align-items: center; }
  .qr { width: 30mm; height: 30mm; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .storno { color: #b23b2c; font-weight: 700; letter-spacing: 2pt; }
</style>
</head>
<body>
<div class="list">
  <div class="pasik">
    <img src="${FIGURA}" alt="" style="width:100%;height:40mm;object-fit:contain;filter:brightness(0) invert(1)">
    <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:8pt;letter-spacing:3pt;text-transform:uppercase;opacity:.7">Biomechanika pohybu</div>
    <div style="font-size:7.5pt;text-align:center;opacity:.75;line-height:1.6">${esc(DODAVATEL.web)}</div>
  </div>
  <div class="telo">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:9mm">
      <div>
        <img src="${ZNACKA}" alt="ProSapiens Biomechanic" style="width:46mm;display:block">
        <div style="font-size:9pt;letter-spacing:3pt;text-transform:uppercase;color:${B.zelen};margin-top:4mm">
          Faktura <b class="n" style="color:${B.text};letter-spacing:0">${esc(f.cislo)}</b>
          ${f.stornoAt ? '<span class="storno">· STORNO</span>' : ""}
        </div>
      </div>
      <div style="font-size:9.5pt;line-height:1.7;color:${B.slaba};text-align:right">
        <div>Datum vystavení <b style="color:${B.text}">${den(f.vystavene)}</b></div>
        <div>Datum splatnosti <b style="color:${B.text}">${den(f.splatnost)}</b></div>
        <div>Způsob platby převodem</div>
      </div>
    </div>

    <div style="display:flex;gap:8mm;margin-bottom:8mm">
      <div style="flex:1">
        <div class="stitok" style="margin-bottom:2mm">Dodavatel</div>
        <div style="font-size:11pt;font-weight:700">${esc(DODAVATEL.meno)}</div>
        <div style="font-size:9.5pt;line-height:1.6;color:${B.slaba}">
          ${esc(DODAVATEL.ulica)}, ${esc(DODAVATEL.psc)} ${esc(DODAVATEL.mesto)}<br>
          IČ ${esc(DODAVATEL.ico)} · ${esc(DODAVATEL.dph)}
        </div>
      </div>
      <div style="flex:1">
        <div class="stitok" style="margin-bottom:2mm">Odběratel</div>
        <div style="font-size:11pt;font-weight:700">${esc(odberatel)}</div>
        <div style="font-size:9.5pt;line-height:1.6;color:${B.slaba}">
          ${adresa([o.ulica, [o.psc, o.mesto].filter(Boolean).join(" ")])}
          ${ic ? `${ic}<br>` : ""}
          ${odberatel !== f.klient ? `Za: ${esc(f.klient)}` : ""}
        </div>
      </div>
    </div>

    <table>
      <thead><tr><th style="width:52%">Označení dodávky</th><th>Počet m. j.</th><th>Cena za m. j.</th><th>Celkem</th></tr></thead>
      <tbody><tr>
        <td>${esc(f.popis)}</td>
        <td class="n">${suma(f.ks)}</td>
        <td class="n">${suma(f.cena)}</td>
        <td class="n">${suma(f.celkom)}</td>
      </tr></tbody>
    </table>

    <div class="suma">
      <div style="font-size:9.5pt;line-height:1.6">
        <div><span class="stitok">Účet</span> <b>${esc(DODAVATEL.ucet)}</b></div>
        <div><span class="stitok">VS</span> <b class="n">${esc(f.cislo)}</b> ·
             <span class="stitok">Splatnost</span> <b>${den(f.splatnost)}</b></div>
      </div>
      <div style="text-align:right">
        <div class="stitok">Celkem k úhradě</div>
        <div style="font-size:21pt;font-weight:800" class="n">${suma(f.celkom)} Kč</div>
      </div>
    </div>

    <div style="display:flex;gap:6mm;align-items:flex-start">
      <div class="qr">${qrSvg(platba)}</div>
      <div style="max-width:70mm">
        <div class="stitok" style="margin-bottom:1.5mm">QR platba</div>
        <div style="font-size:9pt;line-height:1.5;color:${B.slaba}">Načtěte kód v mobilním bankovnictví —
        částka, účet i variabilní symbol se předvyplní.</div>
        ${f.poznamka ? `<div style="font-size:9.5pt;margin-top:3mm">${esc(f.poznamka)}</div>` : ""}
      </div>
    </div>

    <div style="position:absolute;left:14mm;right:14mm;bottom:10mm;font-size:8pt;color:${B.slabsia}">
      ${esc(DODAVATEL.meno)} · ${esc(DODAVATEL.email)} · ${esc(DODAVATEL.telefon)}
    </div>
  </div>
</div>
</body>
</html>`;
}

/**
 * Otvorí tlač faktúry. Rovnaký trik ako pri reporte: skrytý rám, aby sa
 * neotváralo okno navyše, ktoré musí človek zavrieť.
 */
export function vytlacFakturu(f: Faktura): void {
  const ram = document.createElement("iframe");
  ram.setAttribute("aria-hidden", "true");
  ram.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
  document.body.appendChild(ram);
  const uprac = () => setTimeout(() => ram.remove(), 1000);
  ram.onload = () => {
    const w = ram.contentWindow;
    if (!w) { uprac(); return; }
    w.focus();
    setTimeout(() => { try { w.print(); } finally { uprac(); } }, 120);
  };
  ram.srcdoc = fakturaDocument(f);
}
