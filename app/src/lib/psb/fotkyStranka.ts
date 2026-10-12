import { SADZBA } from "./klientStranka";

/**
 * STRÁNKA S FOTKAMI PRE KLIENTA — `/f/<token>` (Jerry, 12. 10. 2026).
 *
 * Návrh `navrhy-kokpitu/odkaz-fotky-klientovi.html`, podoba A (olivová ako
 * stránka klienta). Jerryho úpravy k návrhu:
 *   • správa navrchu je VŠEOBECNÁ — platí aj pre klienta, ktorý chodí tri roky
 *     („z dřívějšího a z nedávného focení… alespoň malé zlepšení"),
 *   • čísla „pred → po" len keď ich vyplní — inak nie sú,
 *   • fotky sa dajú prepnúť: NAJPRV čisté, posunom doprava s rozborom
 *     (Jerry, 12. 10.: „najprv vidieť pred a po bez čiar a kliknutím doprava
 *     sa zobrazí s čiarami"),
 *   • „Na čem budeme pracovat dál" ostáva, ale len keď je čo napísať,
 *   • súhlas so zverejnením a stiahnutie ostávajú,
 *   • nové pole „Chceš se na něco zeptat?" — odpoveď ide trénerovi do
 *     notifikácií a do profilu klienta.
 *
 * Bez prihlásenia a takmer bez JavaScriptu (otvára sa z SMS): prepínač je
 * čisté CSS (radio), formuláre sú obyčajný POST.
 */

export const vychodiskovaSprava = (krstne: string) =>
  `Ahoj${krstne ? ` ${krstne}` : ""}, posílám ti fotky z dřívějšího a z nedávného focení. Podívej se na ně — věřím, že tam uvidíš alespoň malé zlepšení.`;

export type CisloKarty = { nazov: string; pred: string; po: string };
export type KartaFotky = { id: string; popis: string; maCiste: boolean; cisla: CisloKarty[] };
export type FotkyStrankaVstup = {
  token: string;
  trener: string;
  poslane: string; // RRRR-MM-DD
  platiDo: string; // RRRR-MM-DD
  sprava: string;
  dalej: string[];
  karty: KartaFotky[];
  suhlas: "ano" | "ne" | null;
  /** Čo klient už napísal (len časy — text sa mu späť neukazuje celý, len potvrdenie). */
  odpovede: { kedy: string }[];
  hlaska?: string;
  logoUrl?: string;
};

const esc = (s: string) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const den = (d: string) => {
  const [r, m, dd] = d.slice(0, 10).split("-");
  return r && m && dd ? `${Number(dd)}. ${Number(m)}. ${r}` : d;
};
/** Vyplnené čísla — prázdny riadok (bez názvu alebo bez oboch hodnôt) sa nekreslí. */
export const vyplneneCisla = (c: CisloKarty[] | undefined) =>
  (c || []).map((x) => ({ nazov: String(x.nazov || "").trim(), pred: String(x.pred || "").trim(), po: String(x.po || "").trim() }))
    .filter((x) => x.nazov && (x.pred || x.po));

export function fotkyStranka(v: FotkyStrankaVstup): string {
  const s = SADZBA;
  const t = encodeURIComponent(v.token);
  const adresa = (id: string, ciste: boolean, stiahnut = false) =>
    `/f/${t}?foto=${encodeURIComponent(id)}${ciste ? "&ciste=1" : ""}${stiahnut ? "&stahnout=1" : ""}`;
  const logo = v.logoUrl
    // Logo je tmavozelené (#1A2E24) — na olivovom podklade by zmizlo; filter ho zosvetlí.
    ? `<img src="${esc(v.logoUrl)}" alt="ProSapiens Biomechanic" width="190" style="width:190px;max-width:60%;height:auto;display:block;filter:brightness(0) invert(.88)">`
    : `<div class="znacka">PROSAPIENS BIOMECHANIC</div>`;

  const karty = v.karty.map((k, i) => {
    const cisla = vyplneneCisla(k.cisla);
    const obrazok = (ciste: boolean, stitok = "") =>
      `<a class="foto" href="${adresa(k.id, ciste)}" target="_blank" rel="noopener"><img src="${adresa(k.id, ciste)}" alt="Srovnání předtím a potom ${i + 1}${stitok ? ` — ${stitok}` : ""}" loading="${i ? "lazy" : "eager"}"><span class="zvacsit" aria-hidden="true">⤢</span>${stitok ? `<span class="stitok">${stitok}</span>` : ""}</a>`;
    // Dve podoby: čistá prvá, s rozborom za ňou — posun prstom alebo šípkou.
    const snimky = k.maCiste
      ? `<div class="listovanie"><div class="snimky" onscroll="psbBodky(this)">${obrazok(true, "bez čar")}${obrazok(false, "s rozborem")}</div>
<button type="button" class="dalsia" aria-label="S rozborem" onclick="psbListuj(this)">›</button>
<div class="bodky"><span class="on"></span><span></span></div></div>`
      : obrazok(false);
    return `<div class="karta">
${snimky}
${k.popis || cisla.length ? `<div class="telo">
${k.popis ? `<p>${esc(k.popis).replace(/\n/g, "<br>")}</p>` : ""}
${cisla.length ? `<div class="cisla">${cisla.map((c) => `<span class="cislo">${esc(c.nazov)} ${c.pred ? `<b>${esc(c.pred)}</b>` : ""}${c.pred && c.po ? `<span class="sip">→</span>` : ""}${c.po ? `<b>${esc(c.po)}</b>` : ""}</span>`).join("")}</div>` : ""}
</div>` : ""}
</div>`;
  }).join("\n");

  const dalej = v.dalej.map((x) => x.trim()).filter(Boolean);
  const suhlasBlok = v.suhlas
    ? `<div class="souhlas"><h4>${v.suhlas === "ano" ? "Díky, smíme je ukázat" : "Fotky zůstanou jen pro tebe"}</h4>
<p>${v.suhlas === "ano" ? "Vždy bez obličeje a bez jména." : "Nikde je nezveřejníme."} Rozmyslel sis to?</p>
<form method="post"><input type="hidden" name="akcia" value="suhlas"><input type="hidden" name="hodnota" value="${v.suhlas === "ano" ? "ne" : "ano"}">
<button class="ne" type="submit">${v.suhlas === "ano" ? "Ne, raději jen pro mě" : "Ano, bez obličeje můžete"}</button></form></div>`
    : `<div class="souhlas"><h4>Smíme tvé srovnání ukázat?</h4>
<p>Bez obličeje a bez jména, na našem Instagramu nebo webu. Když nic nezvolíš, fotky zůstanou jen pro tebe.</p>
<form method="post" class="tl"><input type="hidden" name="akcia" value="suhlas">
<button class="ano" type="submit" name="hodnota" value="ano">Ano, bez obličeje</button>
<button class="ne" type="submit" name="hodnota" value="ne">Ne, jen pro mě</button></form></div>`;

  const posledna = v.odpovede.length ? v.odpovede[v.odpovede.length - 1].kedy : "";
  const odpovedBlok = `<div class="odpoved" id="odpoved"><h4>Chceš se na něco zeptat?</h4>
<p>Napiš, co na fotky říkáš, nebo cokoli, co tě k nim napadá. Přijde to ${esc(v.trener || "trenérovi")}.</p>
${posledna ? `<div class="odeslano">✓ Zpráva odeslána ${esc(den(posledna))}. Můžeš napsat i další.</div>` : ""}
<form method="post"><input type="hidden" name="akcia" value="odpoved">
<textarea name="text" rows="4" maxlength="2000" required placeholder="Tvoje zpráva…"></textarea>
<button type="submit">Odeslat</button></form></div>`;

  const stiahnut = v.karty.map((k, i) => `<a class="stiahnut-jeden" href="${adresa(k.id, false, true)}" download="srovnani-${i + 1}.jpg">↓ Fotka ${i + 1}</a>`).join("");

  return `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Tvoje fotky — ProSapiens Biomechanic</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Raleway:wght@600;700;800&display=swap">
<style>
body{margin:0;background:${s.pozadie}}
.obal{max-width:560px;margin:0 auto;padding:0 20px 44px;box-sizing:border-box;font-family:'Open Sans',sans-serif;color:${s.text};font-size:15px;line-height:1.55}
.znacka{font-family:Raleway,sans-serif;font-weight:700;font-size:11px;letter-spacing:3.2px;color:${s.tlmeny}}
.nadtitul{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${s.tlmeny};font-weight:600}
h1{margin:6px 0 0;font-family:Raleway,sans-serif;font-weight:700;font-size:32px;line-height:1.12;color:${s.biela}}
.kedy{margin-top:6px;font-size:14px;color:${s.tlmeny}}
.vzkaz{margin-top:20px;padding:16px;border-radius:16px;background:${s.plocha}}
.vzkaz .kto{display:flex;align-items:center;gap:10px;margin-bottom:9px}
.avatar{width:34px;height:34px;border-radius:50%;background:${s.zelena};color:${s.pozadie};display:flex;align-items:center;justify-content:center;font-family:Raleway,sans-serif;font-weight:800;font-size:14px}
.vzkaz .kto b{display:block;font-size:14.5px;color:${s.biela}}
.vzkaz .kto small{font-size:12.5px;color:${s.tlmeny}}
.vzkaz p{margin:0}
.listovanie{position:relative}
.snimky{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.snimky::-webkit-scrollbar{display:none}
.snimky .foto{flex:0 0 100%;scroll-snap-align:start}
.stitok{position:absolute;left:10px;bottom:10px;padding:4px 10px;border-radius:99px;background:rgba(20,20,20,.6);color:#fff;font-size:12px;font-weight:600}
.dalsia{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;border:0;background:rgba(20,20,20,.55);color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:0 0 4px}
.bodky{position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:6px;pointer-events:none}
.bodky span{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.5)}
.bodky span.on{background:#fff}
.karta{margin-top:16px;border-radius:18px;overflow:hidden;background:${s.plocha}}
.foto{position:relative;display:block}
.foto img{display:block;width:100%;height:auto;background:#fff}
.zvacsit{position:absolute;right:10px;top:10px;width:32px;height:32px;border-radius:50%;background:rgba(20,20,20,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px}
.telo{padding:14px 16px 16px}
.telo p{margin:0}
.cisla{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
.cislo{display:inline-flex;align-items:baseline;gap:6px;padding:6px 11px;border-radius:99px;border:1px solid ${s.ramik};font-size:13px;color:${s.tlmeny}}
.cislo b{color:${s.biela};font-family:Raleway,sans-serif;font-weight:700;font-size:14px}
.sip{color:#e8893a;font-weight:700}
h4{margin:0;font-family:Raleway,sans-serif;font-weight:700;font-size:19px}
.dalej{margin-top:26px}
.dalej h4{margin-bottom:8px;color:${s.biela}}
.dalej ol{margin:0;padding:0;list-style:none;counter-reset:k}
.dalej li{counter-increment:k;position:relative;padding:10px 0 10px 38px;border-top:1px solid ${s.ramik}}
.dalej li::before{content:counter(k);position:absolute;left:0;top:10px;width:26px;height:26px;border-radius:50%;border:1.5px solid ${s.zelena};color:${s.zelena};font-family:Raleway,sans-serif;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center}
.odpoved{margin-top:26px;padding:18px 16px;border-radius:18px;background:${s.plocha}}
.odpoved h4{color:${s.biela}}
.odpoved p{margin:6px 0 12px;font-size:14px;color:${s.tlmeny}}
.odpoved textarea{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid ${s.ramik};background:${s.pozadie};color:${s.text};font:inherit;font-size:15px;resize:vertical}
.odpoved button{margin-top:10px;width:100%;border:0;border-radius:99px;padding:12px;background:${s.zelena};color:${s.pozadie};font:inherit;font-weight:700;font-size:15px;cursor:pointer}
.odeslano{margin:-4px 0 12px;font-size:14px;color:${s.zelena}}
.souhlas{margin-top:18px;padding:18px 16px;border-radius:18px;background:${s.zelena};color:${s.pozadie}}
.souhlas p{margin:6px 0 14px;font-size:14px;opacity:.85}
.souhlas form{display:flex;flex-direction:column;gap:8px}
.souhlas button{border:0;border-radius:99px;padding:12px 16px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer}
.souhlas .ano{background:${s.pozadie};color:${s.zelena}}
.souhlas .ne{background:transparent;color:inherit;border:1.5px solid currentColor}
.stiahnut{margin-top:18px}
.stiahnut summary{list-style:none;cursor:pointer;text-align:center;padding:13px;border-radius:99px;border:1.5px solid ${s.zelena};color:${s.zelena};font-weight:600}
.stiahnut summary::-webkit-details-marker{display:none}
.stiahnut .zoznam{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:10px}
.stiahnut-jeden{padding:8px 14px;border-radius:99px;background:${s.plocha};color:${s.zelena};text-decoration:none;font-size:14px}
.hlaska{margin-top:16px;padding:12px 14px;border-radius:12px;background:${s.zelena};color:${s.pozadie};font-weight:600}
.pata{margin-top:26px;padding-top:16px;border-top:1px solid ${s.ramik};font-size:12.5px;color:${s.tlmeny};line-height:1.6}
</style>
</head>
<body>
<div class="obal">
<div style="padding:24px 0 18px">${logo}</div>
<div class="nadtitul">Tvoje fotky z tréninku</div>
<h1>Tvoje srovnání</h1>
<div class="kedy">Poslal ${esc(v.trener || "trenér")} · ${esc(den(v.poslane))}</div>
${v.hlaska ? `<div class="hlaska">${esc(v.hlaska)}</div>` : ""}
${v.sprava.trim() ? `<div class="vzkaz"><div class="kto"><div class="avatar">${esc((v.trener || "P").slice(0, 1).toUpperCase())}</div><div><b>${esc(v.trener || "Tvůj trenér")}</b><small>tvůj trenér</small></div></div><p>${esc(v.sprava.trim()).replace(/\n/g, "<br>")}</p></div>` : ""}
<div class="karty">
${karty}
</div>
${dalej.length ? `<div class="dalej"><h4>Na čem budeme pracovat dál</h4><ol>${dalej.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>` : ""}
${odpovedBlok}
${suhlasBlok}
${v.karty.length ? `<details class="stiahnut"><summary>↓ Stáhnout fotky</summary><div class="zoznam">${stiahnut}</div></details>` : ""}
<script>
function psbListuj(b){var s=b.parentNode.querySelector('.snimky');var na=s.scrollLeft<s.clientWidth/2;s.scrollTo({left:na?s.clientWidth:0,behavior:'smooth'});}
function psbBodky(s){var i=Math.round(s.scrollLeft/s.clientWidth);var w=s.parentNode;var b=w.querySelectorAll('.bodky span');for(var k=0;k<b.length;k++)b[k].className=k===i?'on':'';var t=w.querySelector('.dalsia');t.textContent=i?'‹':'›';t.setAttribute('aria-label',i?'Bez čar':'S rozborem');}
</script>
<div class="pata">Fotky vidíš jen ty přes tento odkaz. Jsou zašifrované a bez tvého souhlasu je nikde nezveřejníme. Odkaz platí do ${esc(den(v.platiDo))}.</div>
</div>
</body></html>`;
}

/** Stránka, keď odkaz neplatí (zrušený, po platnosti, neexistuje). */
export function fotkyNeplati(dovod: "neexistuje" | "zruseny" | "vyprsal"): string {
  const s = SADZBA;
  const text = dovod === "vyprsal"
    ? "Platnost odkazu skončila. Napiš svému trenérovi a pošle ti nový."
    : "Tento odkaz už neplatí. Napiš svému trenérovi, pošle ti nový.";
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>ProSapiens Biomechanic</title></head>
<body style="margin:0;background:${s.pozadie};color:${s.text};font-family:'Open Sans',Arial,sans-serif"><div style="max-width:420px;margin:90px auto;padding:0 22px;text-align:center;font-size:15.5px;line-height:1.6">${text}</div></body></html>`;
}
