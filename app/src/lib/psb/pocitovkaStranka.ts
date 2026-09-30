import { CELKOVO, POSUN, POZNAMKA, STUPNICA, type Meranie } from "./pocitovka";

const esc = (s: string) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ZELENA_TLMENA = "#8b9a72";

/**
 * Blok „Ako ti je?" na verejnej stránke klienta.
 *
 * Je to obyčajný `<form method="post">` s prepínačmi — žiadny JavaScript.
 * Stránka sa otvára z SMS na telefóne, často v okne, ktoré si otvorí
 * správa; skript, ktorý sa nenačíta, by z otázok spravil mŕtve políčka
 * a klient by nemal ako zistiť, že sa nič neodoslalo.
 *
 * Otázky sú PERSONALIZOVANÉ: pýtajú sa na oblasti z jeho vlastnej anamnézy.
 * Meno oblasti ide do skrytého políčka a hodnota vedľa neho podľa PORADIA —
 * „hrudní páteř" ani „lokty / zápěstí" sa do názvu poľa dať nedajú.
 *
 * NIČ SA NEPREDKLEPÁVA. Minulá odpoveď sa kreslí ako obrys; predvybraná by
 * sa odoslala aj vtedy, keď sa jej klient ani nedotkol.
 */
export function blokPocitovky(v: {
  /** Oblasti z anamnézy. Keď nie sú, pýta sa jeden všeobecný riadok. */
  oblasti?: string[];
  /** Posledná známa odpoveď na každú oblasť (a na „posun") — len ako obrys. */
  minule?: Record<string, { hodnota: number; datum: string }>;
  /** Po odoslaní: poďakovanie namiesto ticha. */
  vdaka?: boolean;
  /** Čo klient napísal naposledy — ukáže sa ako citát, nie ako predvyplnený text. */
  poslednyOdkaz?: { datum: string; text: string };
}): string {
  const oblasti = (v.oblasti || []).filter(Boolean);
  const riadky = oblasti.length ? oblasti : [CELKOVO];
  const minule = v.minule || {};

  /**
   * Minulá odpoveď je OBRYS, dnešné klepnutie je plná farba. Rozdiel medzi
   * nimi musí byť vidno bez vysvetľovania — a musí fungovať bez skriptu,
   * lebo stránka sa často otvára v okne, ktoré si otvorí správa.
   */
  const styl = `<style>
.psb-stupnica input:checked + span { background:#c98b3a !important; border-color:#c98b3a !important; color:#232b1c !important; font-weight:700 !important }
.psb-stupnica input:focus-visible + span { outline:2px solid #c98b3a; outline-offset:2px }
</style>`;

  const den = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

  const stupnica = (pole: string, minula?: { hodnota: number; datum: string }) => {
    const cisla = Array.from({ length: STUPNICA.max - STUPNICA.min + 1 }, (_, i) => {
      const n = STUPNICA.min + i;
      const bolo = minula?.hodnota === n;
      return `<label class="psb-stupnica" style="display:inline-block;margin:0 2px 4px 0">
<input type="radio" name="${esc(pole)}" value="${n}" style="position:absolute;opacity:0;width:0;height:0">
<span style="display:inline-block;min-width:21px;padding:8px 0;text-align:center;border-radius:7px;font-size:13px;border:1px ${bolo ? "dashed" : "solid"} ${bolo ? ZELENA_TLMENA : "#3c472f"};background:transparent;color:${bolo ? "#d7d3c2" : "#d7d3c2"}">${n}</span>
</label>`;
    }).join("");
    // „najlepšie" a „najhoršie" pod krajnými číslami — vedľa seba sa im na
    // 375 px nezmestia tak, aby na číslo zostal palec.
    const kraje = `<div style="display:flex;justify-content:space-between;font-size:11px;color:${ZELENA_TLMENA};margin-top:1px">
<span>${esc(STUPNICA.nizke)}</span><span>${esc(STUPNICA.vysoke)}</span></div>`;
    const minulaVeta = minula
      ? `<div style="font-size:11px;color:${ZELENA_TLMENA};margin-top:4px">minule ${minula.hodnota} · ${den(minula.datum)}</div>`
      : "";
    return `<div>${cisla}</div>${kraje}${minulaVeta}`;
  };

  const bolesti = riadky.map((o, i) => {
    const nadpis = o === CELKOVO ? "Koľko ťa to bolí?" : `${esc(o)} — koľko to bolí?`;
    return `<div style="margin-bottom:16px">
<input type="hidden" name="oblast_meno" value="${esc(o)}">
<div style="font-size:14px;line-height:1.45;margin-bottom:7px">${nadpis}</div>
${stupnica(`oblast_sila_${i}`, minule[o])}
</div>`;
  }).join("");

  const uvod = oblasti.length
    ? `Pýtame sa na to, s čím si prišiel — tie isté miesta, ktoré si označil na úvodnom.`
    : `Keď budeš chcieť, klepni. Vidí to len tvoj tréner.`;

  const minulyPosun = minule[POSUN.id];
  const posun = `<div style="margin-bottom:16px">
<div style="font-size:14px;line-height:1.45;margin-bottom:7px">${esc(POSUN.text)}</div>
<div>${POSUN.moznosti.map((x) => {
    const bolo = minulyPosun?.hodnota === x.hodnota;
    return `<label class="psb-stupnica" style="display:inline-block;margin:0 5px 5px 0">
<input type="radio" name="posun" value="${x.hodnota}" style="position:absolute;opacity:0;width:0;height:0">
<span style="display:inline-block;padding:9px 16px;text-align:center;border-radius:8px;font-size:13.5px;border:1px ${bolo ? "dashed" : "solid"} ${bolo ? ZELENA_TLMENA : "#3c472f"};background:transparent;color:#d7d3c2">${esc(x.text)}</span>
</label>`;
  }).join("")}</div>
${minulyPosun ? `<div style="font-size:11px;color:${ZELENA_TLMENA};margin-top:2px">minule ${esc(POSUN.moznosti.find((m) => m.hodnota === minulyPosun.hodnota)?.text || "")} · ${den(minulyPosun.datum)}</div>` : ""}
</div>`;

  const odkaz = `<div style="margin-bottom:16px">
<div style="font-size:14px;line-height:1.45;margin-bottom:4px">${esc(POZNAMKA.text)}</div>
<div style="font-size:11px;color:${ZELENA_TLMENA};margin-bottom:7px">${esc(POZNAMKA.pomoc)}</div>
${v.poslednyOdkaz ? `<div style="font-size:11.5px;color:${ZELENA_TLMENA};margin-bottom:7px;padding-left:8px;border-left:2px solid #3c472f;line-height:1.45">minule si napísal: „${esc(v.poslednyOdkaz.text)}“ · ${den(v.poslednyOdkaz.datum)}</div>` : ""}
<textarea name="poznamka" rows="3" style="width:100%;box-sizing:border-box;padding:9px 10px;border-radius:9px;border:1px solid #3c472f;background:#1e2418;color:#f2f0e4;font-family:inherit;font-size:14px;line-height:1.45;resize:vertical"></textarea>
</div>`;

  const hlaska = v.vdaka
    ? `<div style="background:#2f3b25;border-left:3px solid #8fae54;padding:10px 12px;border-radius:8px;margin-bottom:14px;font-size:14px">Ďakujeme — máme to zapísané. Zmeniť sa to dá kedykoľvek, stačí klepnúť znova.</div>`
    : "";

  return `${styl}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0"><tr><td style="background:#262f1f;border:1px solid #3c472f;border-radius:12px;padding:16px 16px 14px">
<div style="margin-bottom:10px">
<span style="font-size:16px;font-weight:700">Ako ti je?</span>
<span style="font-size:12px;color:${ZELENA_TLMENA};margin-left:8px">nepovinné — len ak sa ti chce</span>
</div>
<div style="font-size:12px;color:${ZELENA_TLMENA};margin-bottom:12px">${uvod}</div>
${hlaska}
<form method="post">
${bolesti}
${posun}
${odkaz}
<button type="submit" style="background:#c98b3a;color:#232b1c;border:none;border-radius:9px;padding:11px 20px;font-size:14px;font-weight:700;cursor:pointer">Odoslať</button>
</form>
</td></tr></table>`;
}
