import { POCITOVKA, type Meranie } from "./pocitovka";

/**
 * Blok „Ako ti je?" na verejnej stránke klienta.
 *
 * Je to obyčajný `<form method="post">` s prepínačmi — žiadny JavaScript.
 * Stránka sa otvára z SMS na telefóne, často v okne, ktoré si otvorí
 * správa; skript, ktorý sa nenačíta, by z otázok spravil mŕtve políčka
 * a klient by nemal ako zistiť, že sa nič neodoslalo.
 *
 * Sadzba je tá istá ako v maili (tabuľky, inline štýly, bez webových
 * písem) — stránku skladá mailKlientovi a tento blok sa do nej vkladá.
 */
export function blokPocitovky(v: {
  /** Čo klient klepol dnes — aby videl, čo už povedal, a mohol to zmeniť. */
  dnesne?: Meranie;
  /** Po odoslaní: poďakovanie namiesto ticha. */
  vdaka?: boolean;
}): string {
  const uvod = v.vdaka
    ? `<div style="background:#2f3b25;border-left:3px solid #8fae54;padding:10px 12px;border-radius:8px;margin-bottom:14px;font-size:14px">Ďakujeme — máme to zapísané. Zmeniť sa to dá kedykoľvek, stačí klepnúť znova.</div>`
    : v.dnesne
      ? `<div style="font-size:12px;color:#9aa284;margin-bottom:12px">Dnes si už odpovedal. Keď to chceš prepísať, klepni inak a odošli.</div>`
      : "";

  const otazky = POCITOVKA.map((o) => {
    const teraz = v.dnesne?.[o.id] ?? null;
    const body = Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      const vybrane = teraz === n;
      // Desať čísel musí sadnúť do JEDNÉHO riadku aj na 375 px — inak
      // desiatka prepadne pod stupnicu a vyzerá ako iná otázka.
      return `<label class="psb-stupnica" style="display:inline-block;margin:0 2px 5px 0">
<input type="radio" name="${o.id}" value="${n}" ${vybrane ? "checked" : ""} style="position:absolute;opacity:0;width:0;height:0">
<span style="display:inline-block;min-width:24px;padding:8px 0;text-align:center;border-radius:7px;font-size:13px;border:1px solid ${vybrane ? "#c98b3a" : "#3c472f"};background:${vybrane ? "#c98b3a" : "transparent"};color:${vybrane ? "#232b1c" : "#d7d3c2"};font-weight:${vybrane ? 700 : 400}">${n}</span>
</label>`;
    }).join("");
    return `<div style="margin-bottom:16px">
<div style="font-size:14px;line-height:1.45;margin-bottom:7px">${o.text}</div>
<div>${body}</div>
<div style="font-size:11px;color:#9aa284;margin-top:2px">1 = ${o.nizke} · 10 = ${o.vysoke}</div>
</div>`;
  }).join("");

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

  return `${styl}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0"><tr><td style="background:#262f1f;border:1px solid #3c472f;border-radius:12px;padding:16px 16px 14px">
<div style="font-size:16px;font-weight:700;margin-bottom:3px">Ako ti je?</div>
<div style="font-size:12px;color:#9aa284;margin-bottom:12px">Tri otázky, tri klepnutia. Vidí to len tvoj tréner — je to preto, aby sme po pár mesiacoch vedeli ukázať, čo sa naozaj zmenilo.</div>
${uvod}
<form method="post">
${otazky}
<button type="submit" style="background:#c98b3a;color:#232b1c;border:none;border-radius:9px;padding:11px 20px;font-size:14px;font-weight:700;cursor:pointer">Odoslať</button>
</form>
</td></tr></table>`;
}
