import { CELKOVO, POSUN, POZNAMKA, STUPNICA, TAZKOST, type Meranie } from "./pocitovka";

const esc = (s: string) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
 */
export function blokPocitovky(v: {
  /** Oblasti z anamnézy. Keď nie sú, pýta sa jeden všeobecný riadok. */
  oblasti?: string[];
  /** Čo klient klepol dnes — aby videl, čo už povedal, a mohol to zmeniť. */
  dnesne?: Meranie;
  /** Po odoslaní: poďakovanie namiesto ticha. */
  vdaka?: boolean;
}): string {
  const oblasti = (v.oblasti || []).filter(Boolean);
  const riadky = oblasti.length ? oblasti : [CELKOVO];

  /**
   * KLEPNUTIE MUSÍ BYŤ VIDNO. Predvýber sa kreslí zo servera (`checked`),
   * ale to platí len pre to, čo klient poslal minule — kým je na stránke,
   * klepol by na číslo a nestalo by sa nič viditeľné a odoslal by naslepo.
   * `:checked + span` to rieši BEZ skriptu, takže to funguje aj v okne,
   * ktoré si otvorí správa.
   */
  const styl = `<style>
.psb-stupnica input:checked + span { background:#c98b3a !important; border-color:#c98b3a !important; color:#232b1c !important; font-weight:700 !important }
.psb-stupnica input:focus-visible + span { outline:2px solid #c98b3a; outline-offset:2px }
</style>`;

  const stupnica = (pole: string, teraz: number | null, min: number, max: number, sirka: number) =>
    Array.from({ length: max - min + 1 }, (_, i) => {
      const n = min + i;
      const vybrane = teraz === n;
      return `<label class="psb-stupnica" style="display:inline-block;margin:0 2px 5px 0">
<input type="radio" name="${esc(pole)}" value="${n}" ${vybrane ? "checked" : ""} style="position:absolute;opacity:0;width:0;height:0">
<span style="display:inline-block;min-width:${sirka}px;padding:8px 0;text-align:center;border-radius:7px;font-size:13px;border:1px solid ${vybrane ? "#c98b3a" : "#3c472f"};background:${vybrane ? "#c98b3a" : "transparent"};color:${vybrane ? "#232b1c" : "#d7d3c2"};font-weight:${vybrane ? 700 : 400}">${n}</span>
</label>`;
    }).join("");

  const min = (t: string) => `${STUPNICA.min} = ${esc(t)}`;
  const max = (t: string) => `${STUPNICA.max} = ${esc(t)}`;
  const popisok = (nizke: string, vysoke: string) =>
    `<div style="font-size:11px;color:#9aa284;margin-top:2px">${min(nizke)} · ${max(vysoke)}</div>`;

  const bolesti = riadky.map((o, i) => {
    const teraz = v.dnesne?.oblasti.find((x) => x.oblast === o)?.sila ?? null;
    const nadpis = o === CELKOVO ? "Koľko ťa to bolí?" : `${esc(o)} — koľko to bolí?`;
    return `<div style="margin-bottom:16px">
<input type="hidden" name="oblast_meno" value="${esc(o)}">
<div style="font-size:14px;line-height:1.45;margin-bottom:7px">${nadpis}</div>
<div>${stupnica(`oblast_sila_${i}`, teraz, STUPNICA.min, STUPNICA.max, 21)}</div>
${popisok(STUPNICA.nizke, STUPNICA.vysoke)}
</div>`;
  }).join("");

  const uvodOblasti = oblasti.length
    ? `<div style="font-size:12px;color:#9aa284;margin-bottom:12px">Pýtame sa na to, s čím si prišiel — tie isté miesta, ktoré si označil na úvodnom. Vďaka tomu vieme po pár mesiacoch ukázať, čo sa naozaj zmenilo.</div>`
    : `<div style="font-size:12px;color:#9aa284;margin-bottom:12px">Tri otázky, pár klepnutí. Vidí to len tvoj tréner.</div>`;

  const posun = `<div style="margin-bottom:16px">
<div style="font-size:14px;line-height:1.45;margin-bottom:7px">${esc(POSUN.text)}</div>
<div>${POSUN.moznosti.map((x) => {
    const vybrane = v.dnesne?.posun === x.hodnota;
    return `<label class="psb-stupnica" style="display:inline-block;margin:0 5px 5px 0">
<input type="radio" name="posun" value="${x.hodnota}" ${vybrane ? "checked" : ""} style="position:absolute;opacity:0;width:0;height:0">
<span style="display:inline-block;padding:9px 16px;text-align:center;border-radius:8px;font-size:13.5px;border:1px solid ${vybrane ? "#c98b3a" : "#3c472f"};background:${vybrane ? "#c98b3a" : "transparent"};color:${vybrane ? "#232b1c" : "#d7d3c2"};font-weight:${vybrane ? 700 : 400}">${esc(x.text)}</span>
</label>`;
  }).join("")}</div>
</div>`;

  const odkaz = `<div style="margin-bottom:16px">
<div style="font-size:14px;line-height:1.45;margin-bottom:4px">${esc(POZNAMKA.text)}</div>
<div style="font-size:11px;color:#9aa284;margin-bottom:7px">${esc(POZNAMKA.pomoc)}</div>
<textarea name="poznamka" rows="3" style="width:100%;box-sizing:border-box;padding:9px 10px;border-radius:9px;border:1px solid #3c472f;background:#1e2418;color:#f2f0e4;font-family:inherit;font-size:14px;line-height:1.45;resize:vertical">${esc(v.dnesne?.poznamka || "")}</textarea>
</div>`;

  const hlaska = v.vdaka
    ? `<div style="background:#2f3b25;border-left:3px solid #8fae54;padding:10px 12px;border-radius:8px;margin-bottom:14px;font-size:14px">Ďakujeme — máme to zapísané. Zmeniť sa to dá kedykoľvek, stačí klepnúť znova.</div>`
    : v.dnesne
      ? `<div style="font-size:12px;color:#9aa284;margin-bottom:12px">Dnes si už odpovedal. Keď to chceš prepísať, klepni inak a odošli.</div>`
      : "";

  return `${styl}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0"><tr><td style="background:#262f1f;border:1px solid #3c472f;border-radius:12px;padding:16px 16px 14px">
<div style="font-size:16px;font-weight:700;margin-bottom:3px">Ako ti je?</div>
${uvodOblasti}
${hlaska}
<form method="post">
${bolesti}
<div style="margin-bottom:16px">
<div style="font-size:14px;line-height:1.45;margin-bottom:7px">${esc(TAZKOST.text)}</div>
<div>${stupnica("tazkost", v.dnesne?.tazkost ?? null, STUPNICA.min, STUPNICA.max, 21)}</div>
${popisok(TAZKOST.nizke, TAZKOST.vysoke)}
</div>
${posun}
${odkaz}
<button type="submit" style="background:#c98b3a;color:#232b1c;border:none;border-radius:9px;padding:11px 20px;font-size:14px;font-weight:700;cursor:pointer">Odoslať</button>
</form>
</td></tr></table>`;
}
