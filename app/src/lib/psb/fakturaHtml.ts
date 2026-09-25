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

/** QR platba ako SVG. Vkladá sa priamo do dokumentu — žiadny externý obrázok. */
export function qrSvg(text: string, velkost = 3): string {
  const q = qrcode(0, "M");
  q.addData(text, "Byte");
  q.make();
  return q.createSvgTag({ cellSize: velkost, margin: velkost * 2, scalable: true });
}

/** Riadky adresy, prázdne sa vynechajú. */
const adresa = (r: (string | undefined)[]) =>
  r.filter((x) => x && String(x).trim()).map((x) => `<div>${esc(String(x))}</div>`).join("");

export function fakturaDocument(f: Faktura): string {
  const platba = spayd({
    suma: f.celkom,
    vs: f.cislo,
    sprava: `Faktura ${f.cislo} PSB`,
    splatnost: f.splatnost,
    prijemca: DODAVATEL.meno,
  });
  const o = f.odberatel;
  const mestoRiadok = [o.psc, o.mesto].filter(Boolean).join(" ");
  const ic = [o.ico && `IČ: ${esc(o.ico)}`, o.dic && `DIČ: ${esc(o.dic)}`].filter(Boolean).join(" &nbsp; ");
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<title>Faktura ${esc(f.cislo)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm 14mm; }
  @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  :root { --text: #1d2420; --slaba: #6b7a72; --linka: #d8e0da; --zvyraz: #2d7d5a; }
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--text); font-size: 10.5pt; line-height: 1.5;
         font-family: "Helvetica Neue", -apple-system, "Segoe UI", Roboto, sans-serif; }
  h1 { margin: 0 0 2mm; font-size: 20pt; letter-spacing: -0.3pt; }
  .hlavicka { display: flex; justify-content: space-between; align-items: flex-start;
              border-bottom: 2px solid var(--zvyraz); padding-bottom: 4mm; margin-bottom: 6mm; }
  .cislo { font-size: 12pt; color: var(--slaba); }
  .strany { display: flex; gap: 10mm; margin-bottom: 7mm; }
  .strana { flex: 1; }
  .nadpis { font-size: 8pt; letter-spacing: 1.1pt; text-transform: uppercase;
            color: var(--slaba); margin-bottom: 2mm; }
  .meno { font-weight: 700; font-size: 11.5pt; }
  .slaba { color: var(--slaba); }
  .pasik { display: flex; gap: 10mm; padding: 3mm 0; border-top: 1px solid var(--linka);
           border-bottom: 1px solid var(--linka); margin-bottom: 6mm; }
  .pasik div { flex: 1; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  th { text-align: right; font-size: 8pt; letter-spacing: 1pt; text-transform: uppercase;
       color: var(--slaba); border-bottom: 1px solid var(--linka); padding: 0 0 2mm; }
  th:first-child, td:first-child { text-align: left; }
  td { padding: 3mm 0; text-align: right; vertical-align: top; border-bottom: 1px solid var(--linka); }
  .spolu { display: flex; justify-content: flex-end; align-items: baseline; gap: 6mm; margin-bottom: 8mm; }
  .spolu .suma { font-size: 17pt; font-weight: 700; }
  .platba { display: flex; gap: 8mm; align-items: flex-start; }
  .platba svg { width: 34mm; height: 34mm; }
  .patka { margin-top: 10mm; padding-top: 3mm; border-top: 1px solid var(--linka);
           font-size: 8.5pt; color: var(--slaba); display: flex; justify-content: space-between; }
  .storno { color: #b23b2c; font-weight: 700; letter-spacing: 2pt; }
</style>
</head>
<body>
  <div class="hlavicka">
    <div>
      <h1>Faktura</h1>
      <div class="cislo">č. ${esc(f.cislo)}${f.stornoAt ? ' <span class="storno">STORNO</span>' : ""}</div>
    </div>
    <div style="text-align:right" class="slaba">
      <div>Datum vystavení: <b style="color:var(--text)">${den(f.vystavene)}</b></div>
      <div>Datum splatnosti: <b style="color:var(--text)">${den(f.splatnost)}</b></div>
      <div>Způsob platby: převodem</div>
    </div>
  </div>

  <div class="strany">
    <div class="strana">
      <div class="nadpis">Dodavatel</div>
      <div class="meno">${esc(DODAVATEL.meno)}</div>
      ${adresa([DODAVATEL.ulica, `${DODAVATEL.psc} ${DODAVATEL.mesto}`, DODAVATEL.stat])}
      <div style="margin-top:2mm">IČ: ${esc(DODAVATEL.ico)}</div>
      <div>${esc(DODAVATEL.dph)}</div>
      <div class="slaba" style="margin-top:2mm">${esc(DODAVATEL.email)} · ${esc(DODAVATEL.telefon)}</div>
      <div class="slaba">${esc(DODAVATEL.web)}</div>
    </div>
    <div class="strana">
      <div class="nadpis">Odběratel</div>
      <div class="meno">${esc(o.firma || f.klient)}</div>
      ${adresa([o.ulica, mestoRiadok, o.stat])}
      ${ic ? `<div style="margin-top:2mm">${ic}</div>` : ""}
      ${o.firma && o.firma !== f.klient ? `<div class="slaba" style="margin-top:2mm">Za: ${esc(f.klient)}</div>` : ""}
    </div>
  </div>

  <div class="pasik">
    <div><span class="slaba">Bankovní účet</span><br><b>${esc(DODAVATEL.ucet)}</b><br>
      <span class="slaba">IBAN ${esc(DODAVATEL.iban)} · ${esc(DODAVATEL.swift)}</span></div>
    <div><span class="slaba">Variabilní symbol</span><br><b>${esc(f.cislo)}</b></div>
  </div>

  <div style="font-weight:600;margin-bottom:2mm">Fakturujeme Vám za dodané služby:</div>
  <table>
    <thead><tr><th>Označení dodávky</th><th>Počet m. j.</th><th>Cena za m. j.</th><th>Celkem</th></tr></thead>
    <tbody><tr>
      <td>${esc(f.popis)}</td>
      <td>${suma(f.ks).replace(",00", ",00")}</td>
      <td>${suma(f.cena)}</td>
      <td>${suma(f.celkom)}</td>
    </tr></tbody>
  </table>

  <div class="spolu"><span class="slaba">Celkem k úhradě</span><span class="suma">${suma(f.celkom)} Kč</span></div>

  <div class="platba">
    ${qrSvg(platba)}
    <div>
      <div class="nadpis">QR platba</div>
      <div class="slaba" style="max-width:80mm">Načtěte kód v mobilním bankovnictví — částka, účet
      i variabilní symbol se předvyplní.</div>
      ${f.poznamka ? `<div style="margin-top:4mm">${esc(f.poznamka)}</div>` : ""}
    </div>
  </div>

  <div class="patka">
    <span>${esc(DODAVATEL.meno)} · IČ ${esc(DODAVATEL.ico)} · ${esc(DODAVATEL.dph)}</span>
    <span>Vystaveno v Kokpitu</span>
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
