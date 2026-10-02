import { CELKOVO, POSUN, POZNAMKA, STUPNICA, type Meranie } from "./pocitovka";

const esc = (s: string) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * ZELENÁ SADZBA — tá istá, akou chodí celá história mailom.
 *
 * Blok sedí vnútri stránky klienta, takže farby musí mať jej. 1. 10. 2026
 * boli svetlé („sprav tú stránku česky a svetlú"), lenže Jerry 2. 10. nad
 * hotovou stránkou: „prečo sa z toho zeleného návrhu stal tento biely?"
 * Z tej vety vyšlo najavo, že svetlá mala byť ČITATEĽNOSŤ a čeština, nie
 * nová paleta — a že plochy majú vyzerať rovnako. Celá história chodí
 * mailom v `FARBY_MAILU` a stránka sa k nim vracia.
 *
 * Stránka pred úvodným (`uvodnaStranka.ts`) svetlá ZOSTÁVA: tú Jerry
 * schválil, ako je. Nie je to nedôslednosť, je to rozhodnutie.
 */
const TEXT = "#e8ead9";
const TLMENY = "#8a9a72";
const RAMIK = "#3a4630";
const ZELENA = "#d9e0c8";
const PLOCHA = "#2c3524";
/** Pozadie políčok a text na svetlozelenom tlačidle — na tmavom nefunguje biela. */
const VNUTRO = "#232b1c";
const NA_ZELENEJ = "#232b1c";

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
.psb-stupnica input:checked + span { background:${ZELENA} !important; border-color:${ZELENA} !important; color:${NA_ZELENEJ} !important; font-weight:700 !important }
.psb-stupnica input:focus-visible + span { outline:2px solid ${ZELENA}; outline-offset:2px }
</style>`;

  const den = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

  const stupnica = (pole: string, minula?: { hodnota: number; datum: string }) => {
    const cisla = Array.from({ length: STUPNICA.max - STUPNICA.min + 1 }, (_, i) => {
      const n = STUPNICA.min + i;
      const bolo = minula?.hodnota === n;
      return `<label class="psb-stupnica" style="display:inline-block;margin:0 2px 4px 0">
<input type="radio" name="${esc(pole)}" value="${n}" style="position:absolute;opacity:0;width:0;height:0">
<span style="display:inline-block;min-width:21px;padding:8px 0;text-align:center;border-radius:7px;font-size:13px;border:1px ${bolo ? "dashed" : "solid"} ${bolo ? ZELENA : RAMIK};background:${VNUTRO};color:${TEXT}">${n}</span>
</label>`;
    }).join("");
    // „najlepšie" a „najhoršie" pod krajnými číslami — vedľa seba sa im na
    // 375 px nezmestia tak, aby na číslo zostal palec.
    const kraje = `<div style="display:flex;justify-content:space-between;font-size:11px;color:${TLMENY};margin-top:1px">
<span>${esc(STUPNICA.nizke)}</span><span>${esc(STUPNICA.vysoke)}</span></div>`;
    const minulaVeta = minula
      ? `<div style="font-size:11px;color:${TLMENY};margin-top:4px">minule ${minula.hodnota} · ${den(minula.datum)}</div>`
      : "";
    return `<div>${cisla}</div>${kraje}${minulaVeta}`;
  };

  const bolesti = riadky.map((o, i) => {
    const nadpis = o === CELKOVO ? "Jak moc to bolí?" : `${esc(o)} — jak moc to bolí?`;
    return `<div style="margin-bottom:16px">
<input type="hidden" name="oblast_meno" value="${esc(o)}">
<div style="font-size:14px;line-height:1.45;margin-bottom:7px">${nadpis}</div>
${stupnica(`oblast_sila_${i}`, minule[o])}
</div>`;
  }).join("");

  const uvod = oblasti.length
    ? `Ptáme se na to, s čím jsi přišel — na stejná místa, která jsi označil na úvodní lekci.`
    : `Když budeš chtít, ťukni. Vidí to jen tvůj trenér.`;

  const minulyPosun = minule[POSUN.id];
  const posun = `<div style="margin-bottom:16px">
<div style="font-size:14px;line-height:1.45;margin-bottom:7px">${esc(POSUN.text)}</div>
<div>${POSUN.moznosti.map((x) => {
    const bolo = minulyPosun?.hodnota === x.hodnota;
    return `<label class="psb-stupnica" style="display:inline-block;margin:0 5px 5px 0">
<input type="radio" name="posun" value="${x.hodnota}" style="position:absolute;opacity:0;width:0;height:0">
<span style="display:inline-block;padding:9px 16px;text-align:center;border-radius:8px;font-size:13.5px;border:1px ${bolo ? "dashed" : "solid"} ${bolo ? ZELENA : RAMIK};background:${VNUTRO};color:${TEXT}">${esc(x.text)}</span>
</label>`;
  }).join("")}</div>
${minulyPosun ? `<div style="font-size:11px;color:${TLMENY};margin-top:2px">minule ${esc(POSUN.moznosti.find((m) => m.hodnota === minulyPosun.hodnota)?.text || "")} · ${den(minulyPosun.datum)}</div>` : ""}
</div>`;

  const odkaz = `<div style="margin-bottom:16px">
<div style="font-size:14px;line-height:1.45;margin-bottom:4px">${esc(POZNAMKA.text)}</div>
<div style="font-size:11px;color:${TLMENY};margin-bottom:7px">${esc(POZNAMKA.pomoc)}</div>
${v.poslednyOdkaz ? `<div style="font-size:11.5px;color:${TLMENY};margin-bottom:7px;padding-left:8px;border-left:2px solid ${RAMIK};line-height:1.45">minule jsi napsal: „${esc(v.poslednyOdkaz.text)}“ · ${den(v.poslednyOdkaz.datum)}</div>` : ""}
<textarea name="poznamka" rows="3" style="width:100%;box-sizing:border-box;padding:9px 10px;border-radius:9px;border:1px solid ${RAMIK};background:${VNUTRO};color:${TEXT};font-family:inherit;font-size:14px;line-height:1.45;resize:vertical"></textarea>
</div>`;

  const hlaska = v.vdaka
    ? `<div style="background:${PLOCHA};border-left:3px solid ${ZELENA};padding:10px 12px;border-radius:8px;margin-bottom:14px;font-size:14px">Díky — máme to zapsané. Změnit se to dá kdykoliv, stačí ťuknout znovu.</div>`
    : "";

  return `${styl}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0"><tr><td style="background:${PLOCHA};border:1px solid ${RAMIK};border-radius:14px;padding:18px 16px 16px">
<div style="margin-bottom:10px">
<span style="font-size:16px;font-weight:700">Jak ti je?</span>
<span style="font-size:12px;color:${TLMENY};margin-left:8px">nepovinné — jen když se ti chce</span>
</div>
<div style="font-size:12px;color:${TLMENY};margin-bottom:12px">${uvod}</div>
${hlaska}
<form method="post">
${bolesti}
${posun}
${odkaz}
<button type="submit" style="background:${ZELENA};color:${NA_ZELENEJ};border:none;border-radius:32px;padding:13px 26px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">Odeslat</button>
</form>
</td></tr></table>`;
}
