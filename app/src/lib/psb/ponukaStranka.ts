import { TRENERI } from "./mailFaktury";
import { casHHMM, denCz, type CasPonuky } from "./ponukaTerminov";

/**
 * STRÁNKA PONUKY TERMÍNOV pre klienta — `/t/<token>` (variant B1, Jerry
 * 7. 10. 2026: „A1 a B1"). Dni pod sebou, časy ako tlačidlá, klepni a potvrď.
 *
 * Ako `/u/` a pocitovka: BEZ JavaScriptu (otvára sa z SMS, často v okne
 * správy), výber je `<input type=radio>` a viditeľný cez `:checked + span`,
 * odoslanie je obyčajný formulár. Sadzba zo živého webu (biela, #1A2E24,
 * akcent #2D7D5A, Raleway a Open Sans).
 */

export type StavStranky =
  | { druh: "vyber"; volne: CasPonuky[]; platiDo: string; chyba?: string }
  | { druh: "vybrane"; cas: CasPonuky }
  | { druh: "neplati"; preco: "vyprsala" | "zrusene" | "obsadene" };

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cislo = (t: string) => t.replace(/[^\d+]/g, "");

export function ponukaStrankaHtml(v: { token: string; oslovenie: string; trener: string; logoUrl: string; stav: StavStranky; typ: string }): string {
  const t = TRENERI[v.trener] ? v.trener : "Jerry";
  const tr = TRENERI[t];
  const komu = t === "Terezka" ? "Terezce" : "Filipovi";
  const smsNehodi = `sms:${cislo(tr.telefon)}?&body=${encodeURIComponent("Dobrý den, z poslaných termínů se mi nehodí žádný. Šlo by to jindy?")}`;
  const nadpisUvod = v.typ === "uvodny" ? "Váš úvodní trénink" : "Volné termíny pro vás";
  let telo = "";

  if (v.stav.druh === "vyber") {
    const dni = [...new Set(v.stav.volne.map((c) => c.zaciatok.slice(0, 10)))];
    const [, m, d] = v.stav.platiDo.split("-").map(Number);
    telo = `
<h1>${esc(nadpisUvod)}</h1>
<p class="veta">${v.oslovenie ? `${esc(v.oslovenie)}, v` : "V"}yberte si jeden z termínů. Nabídka platí do neděle ${d}. ${m}. nebo do obsazení.</p>
${v.stav.chyba ? `<p class="chyba">${esc(v.stav.chyba)}</p>` : ""}
<form method="post">
${dni.map((den) => `
<div class="den"><div class="d">${esc(denCz(den))}</div><div class="casy">
${v.stav.druh === "vyber" ? v.stav.volne.filter((c) => c.zaciatok.slice(0, 10) === den).map((c) => `<label><input type="radio" name="cas" value="${esc(c.id)}" required><span>${esc(casHHMM(c.zaciatok))}</span></label>`).join("") : ""}
</div></div>`).join("")}
<div class="spodok">
<button type="submit">Potvrdit termín</button>
<a class="nehodi" href="${esc(smsNehodi)}">Nehodí se mi ani jeden — napsat ${esc(komu)}</a>
</div>
</form>`;
  } else if (v.stav.druh === "vybrane") {
    const c = v.stav.cas;
    telo = `
<div class="hotovo">
<div class="fajka">✓</div>
<h1>Máte zarezervováno</h1>
<p class="veta">Těšíme se na vás. Kdyby se něco změnilo, stačí napsat.</p>
<div class="kedy">${esc(denCz(c.zaciatok))}<br>${esc(casHHMM(c.zaciatok))}–${esc(casHHMM(c.koniec))}<small>${esc(t === "Terezka" ? "Terezka" : "Filip")} · ProSapiens Biomechanic</small></div>
<a class="tlacidlo tmave" href="/t/${esc(v.token)}?ics=1">Přidat do kalendáře</a>
<a class="nehodi" href="sms:${esc(cislo(tr.telefon))}">Napsat ${esc(komu)}</a>
</div>`;
  } else {
    const veta = v.stav.preco === "obsadene"
      ? "Všechny nabídnuté termíny jsou už obsazené."
      : "Tato nabídka termínů už neplatí.";
    telo = `
<h1>${esc(veta)}</h1>
<p class="veta">Napište ${esc(komu)} a pošle vám nové.</p>
<div class="spodok"><a class="tlacidlo" href="${esc(smsNehodi)}">Napsat ${esc(komu)}</a></div>`;
  }

  return `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(nadpisUvod)} — ProSapiens Biomechanic</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&family=Raleway:wght@600;700&display=swap">
<style>
body{margin:0;background:#fff;color:#1A2E24;font-family:'Open Sans',Arial,sans-serif}
.obal{max-width:460px;margin:0 auto;padding:26px 22px 40px}
.logo{height:26px;display:block}
h1{font-family:'Raleway',sans-serif;font-weight:700;font-size:28px;line-height:1.15;margin:22px 0 8px}
.veta{margin:0;font-size:15px;line-height:1.55;color:#5b6b63}
.chyba{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:#fdecea;color:#8a2a1f;font-size:14px;line-height:1.5}
.den{margin-top:22px}
.den .d{font-family:'Raleway',sans-serif;font-weight:700;font-size:16px;margin-bottom:10px}
.casy{display:flex;flex-wrap:wrap;gap:9px}
.casy label{cursor:pointer}
.casy input{position:absolute;opacity:0;pointer-events:none}
.casy span{display:inline-block;padding:13px 18px;border-radius:32px;border:1.5px solid #e3e7e4;font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
.casy input:checked + span{background:#2D7D5A;border-color:#2D7D5A;color:#fff}
.casy input:focus-visible + span{outline:3px solid #8FD3A8;outline-offset:2px}
.spodok{position:sticky;bottom:0;margin-top:26px;padding:14px 0 6px;background:linear-gradient(rgba(255,255,255,0),#fff 28%)}
button,.tlacidlo{display:block;width:100%;box-sizing:border-box;padding:16px;border:0;border-radius:32px;background:#2D7D5A;color:#fff;font:700 16px 'Open Sans',Arial,sans-serif;text-align:center;text-decoration:none;cursor:pointer}
.tmave{background:#1A2E24}
.nehodi{display:block;margin-top:12px;text-align:center;color:#2D7D5A;font-size:14px;font-weight:600;text-decoration:none}
.hotovo{text-align:center;padding-top:30px}
.fajka{width:76px;height:76px;margin:0 auto;border-radius:50%;background:#2D7D5A;color:#fff;font-size:40px;line-height:76px}
.kedy{margin:22px 0;padding:18px;border-radius:22px;background:#e7f2ec;font-family:'Raleway',sans-serif;font-weight:700;font-size:20px;line-height:1.35}
.kedy small{display:block;margin-top:6px;font-family:'Open Sans',Arial,sans-serif;font-weight:400;font-size:13px;color:#5b6b63}
</style>
</head><body><div class="obal">
<img class="logo" src="${esc(v.logoUrl)}" alt="ProSapiens Biomechanic">
${telo}
</div></body></html>`;
}
