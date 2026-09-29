/**
 * VÝPIS PRE KLIENTA — MAIL, KTORÝ SA DÁ ČÍTAŤ.
 *
 * Jerry, 28. 9. 2026: „vedeli by sme ten mail spraviť nejako pekne vizuálne?
 * A okrem dochádzky a QR platby dať nejaké grafy?" Doteraz odchádzal holý
 * text — presný, ale vyzeral ako výpis z terminálu.
 *
 * ČO V ŇOM ZÁMERNE NIE JE
 *
 *  • **Porovnanie s ostatnými.** Jerry ho pôvodne chcel, ale polovica ľudí je
 *    z definície pod priemerom — a práve tej polovici by veta „chodíš menej
 *    než ostatní" dala dôvod skončiť, nie kúpiť si ďalší balíček. V maili
 *    stoja jeho VLASTNÉ čísla: koľko chodil po mesiacoch a koľko odtrénoval
 *    spolu. To je príbeh „posunul si sa", nie „si podpriemerný".
 *  • **Bolesť.** Ponúkol som ju ako najsilnejší graf — a bol to omyl:
 *    `klient_merania` je prázdna a zostane, Jerry meranie bolesti 24. 9. 2026
 *    zrušil. Nepripomínať a neponúkať.
 *  • **Obrázky okrem QR.** Čím viac obrázkov, tým vyššia šanca na spam,
 *    a doména PSB má DMARC `p=none`. Grafy sú preto poskladané z tabuliek
 *    s farebným pozadím — vykreslí ich aj Gmail, aj Outlook, a nič sa
 *    nesťahuje zvonku.
 *  • **Naše písmo.** Agrandir mailová čítačka nemá a webové písmo Gmail
 *    ignoruje. Zostáva systémové; farby značky nesie zvyšok.
 */

/** Farby značky. Tie isté, aké nesie faktúra. */
const F = {
  zelena: "#3d4a2f",
  svetla: "#7d8a6a",
  papier: "#f6f4ec",
  text: "#2b2b28",
  slaba: "#6b7560",
  linka: "#d8d3c2",
} as const;

/**
 * Jeden bod na osi. Je to ten istý riadok, aký vidí Jerry v profile —
 * len bez vecí, ktoré klientovi nič nehovoria.
 */
export type BodOsi = {
  den: string;
  /** Čas tréningu, keď ho poznáme. */
  cas?: string;
  /** Čo sa stalo — názov balíčka, „tréning", „zaplatené". */
  popis: string;
  druh: "balicekOd" | "trening" | "platba" | "balicekDo";
  /** Koľká hodina balíčka to bola (stav PRED tréningom). */
  zostatok?: number | null;
  /** Koľkátý tréning bez krytia — kreslí sa ako −1, −2. */
  dlh?: number | null;
};

export type VypisKlienta = {
  klient: string;
  /** Oslovenie — krstné meno. */
  oslovenie: string;
  trener: string;
  /** Osobná veta na začiatok; keď je prázdna, mail začne rovno vecou. */
  odkaz?: string;
  /** Os času od začiatku posledného balíčka po dnešok. */
  os: BodOsi[];
  /** Koľko hodín zostáva; `null` = appka to nevie povedať. */
  zostatok: number | null;
  /** Odtrénované hodiny spolu a odkedy klient chodí. */
  hodinSpolu: number;
  odkedy: string;
  /**
   * Koľko tréningov mesačne chodí za posledné obdobie.
   *
   * Jerry, 29. 9. 2026: „k odtrénovaným hodinám by som pridal ešte tempo."
   * Súčet hovorí, koľko toho má za sebou; tempo hovorí, ako chodí TERAZ —
   * a to je číslo, z ktorého si klient sám odvodí, kedy mu balíček dôjde.
   * `0` = nekreslí sa.
   */
  tempo?: number;
  /** Sedenia po mesiacoch — vstup do stĺpcov. */
  mesacne: { mesiac: string; pocet: number }[];
  /**
   * Platba za ďalší balíček; bez nej sa QR ani suma nekreslia.
   *
   * `sprava` je to, čo má klient napísať do poznámky pre príjemcu — a je to
   * jeho MENO, nie variabilný symbol. Kokpit páruje bankové príjmy podľa
   * mena v texte platby; číslo, ktoré nikto nikam nezapíše, by párovaniu
   * nepomohlo a klienta by len mýlilo.
   */
  platba?: { popis: string; suma: number; ucet: string; sprava: string };
  /** `cid` obrázka s QR kódom — vkladá ho odosielateľ. */
  qrCid?: string;
};

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MESIACE = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];

const denSK = (iso: string) => {
  const d = (iso || "").slice(0, 10).split("-");
  return d.length === 3 ? `${Number(d[2])}. ${Number(d[1])}. ${d[0]}` : iso;
};
const mesiacSK = (kluc: string) => {
  const [r, m] = (kluc || "").split("-");
  return MESIACE[Number(m) - 1] ? `${MESIACE[Number(m) - 1]} ${r}` : kluc;
};
/**
 * Tempo ľudsky. „2,3 tréningu mesačne" nikto nepovie — povie sa „zhruba
 * raz týždenne". Číslo zostáva v zátvorke pre toho, kto ho chce presne.
 */
export function tempoSK(zaMesiac: number): string {
  const t = Math.round(zaMesiac * 10) / 10;
  const slovom = t >= 7 ? "takmer obdeň"
    : t >= 5.5 ? "zhruba 1,5× týždenne"
      : t >= 3.4 ? "zhruba raz týždenne"
        : t >= 1.6 ? "zhruba každé dva týždne"
          : t >= 0.8 ? "zhruba raz mesačne"
            : "menej než raz mesačne";
  return `${slovom} (${t.toLocaleString("sk-SK")}× mesačne)`;
}

export const czk = (n: number) => `${Math.round(n).toLocaleString("sk-SK").replace(/ /g, " ")} Kč`;

/**
 * Jeden stĺpec grafu ako tabuľka.
 *
 * `<div>` so šírkou v percentách Outlook ignoruje, tabuľková bunka nie —
 * preto je to takto rozpísané, hoci to v kóde vyzerá starosvetsky.
 */
function stlpec(popis: string, hodnota: number, max: number): string {
  const pct = max > 0 ? Math.max(3, Math.round((hodnota / max) * 100)) : 3;
  return `<tr>
  <td style="padding:3px 10px 3px 0;font-size:13px;color:${F.slaba};white-space:nowrap">${esc(popis)}</td>
  <td style="padding:3px 0" width="100%">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td bgcolor="${F.svetla}" width="${pct}%" style="height:12px;line-height:12px;font-size:0;border-radius:3px">&nbsp;</td>
      <td>&nbsp;</td>
    </tr></table>
  </td>
  <td style="padding:3px 0 3px 10px;font-size:13px;font-weight:700;color:${F.text};text-align:right">${hodnota}</td>
</tr>`;
}

/** Predmet, textová aj HTML podoba tej istej správy. */
export function mailKlientovi(v: VypisKlienta): { predmet: string; text: string; html: string } {
  const treningy = v.os.filter((b) => b.druh === "trening");
  const posledny = treningy[treningy.length - 1]?.den || "";
  const doslo = v.zostatok !== null && v.zostatok <= 0;
  const predmet = doslo
    ? "Balíček dochodený — výpis a platba"
    : "Tvoja dochádzka v ProSapiens";

  const uvod = doslo
    ? `dnes si mal poslednú hodinu z balíčka.`
    : v.zostatok !== null
      ? `v balíčku ti zostáva ${v.zostatok} h.`
      : `posielam ti prehľad tréningov.`;

  // ── textová podoba: to isté, len bez ozdôb ────────────────────────────
  const text = [
    `Ahoj ${v.oslovenie},`,
    "",
    v.odkaz ? `${v.odkaz}\n` : "",
    uvod,
    "",
    "Ako sa míňal balíček:",
    ...v.os.map((b) => {
      const cislo = b.druh !== "trening" ? "" : [
        b.zostatok != null ? `${b.zostatok} h` : "",
        b.dlh ? `−${b.dlh}` : "",
      ].filter(Boolean).join(", ");
      return `  ${denSK(b.den)}${b.cas ? ` · ${b.cas}` : ""} — ${b.popis}${cislo ? ` (${cislo})` : ""}`;
    }),
    "",
    `Spolu odtrénované: ${v.hodinSpolu} h${v.odkedy ? ` od ${denSK(v.odkedy)}` : ""}`,
    v.tempo ? `Tempo: ${tempoSK(v.tempo)}` : "",
    v.platba ? `\n${v.platba.popis}: ${czk(v.platba.suma)}\nÚčet ${v.platba.ucet}, do poznámky uveď: ${v.platba.sprava}` : "",
    "",
    v.trener,
    "ProSapiens Biomechanic",
  ].filter((x) => x !== "").join("\n");

  const maxMesiac = Math.max(1, ...v.mesacne.map((m) => m.pocet));
  /**
   * OS ČASU S BODKAMI.
   *
   * Jerry, 28. 9. 2026: „páčilo by sa mi, keby si z toho spravil časovú os,
   * čiaru s bodkami — 6 h posledného balíka, deň a dátum, hodina, bodka,
   * ďalšia bodka bude platba, a potom klasicky 5 h, 4 h."
   *
   * Zoznam dátumov hovorí, KEDY klient bol. Os hovorí, ako sa balíček míňal —
   * a to je to, kvôli čomu mail chodí.
   *
   * Čiara je `border-left` na ľavej bunke, bodka na nej sedí cez záporný
   * okraj. Outlook záporné okraje ani zaoblenie nepozná, takže tam z bodky
   * bude malý štvorček vedľa čiary — čitateľné to zostane.
   */
  const bodka = (b: BodOsi) => (b.druh === "platba" ? F.zelena : b.druh === "trening" ? F.svetla : F.zelena);
  const riadkyOsi = v.os.map((b, i) => {
    const posledna = i === v.os.length - 1;
    /**
     * HODINY A MÍNUS STOJA VEDĽA SEBA, NIE JEDNO NAMIESTO DRUHÉHO.
     *
     * Jerry, 28. 9. 2026: „ak nezaplatil, bude tam 6 h − 1, a potom platba
     * a potom klasicky 5 h, 4 h." Sú to dve rôzne veci: koľká hodina balíčka
     * to bola, a koľký tréning to bol bez krytia. Prvá verzia mínusom hodiny
     * prekryla a z osi zmizlo, že balíček vtedy ešte plný bol.
     */
    const cislo = b.druh !== "trening" ? "" : [
      b.zostatok != null ? `<b>${b.zostatok} h</b>` : "",
      b.dlh ? `<span style="color:#b4674a;font-weight:700">−${b.dlh}</span>` : "",
    ].filter(Boolean).join(" ");
    const velka = b.druh !== "trening";
    return `<tr>
      <td width="22" valign="top" style="border-left:2px solid ${F.linka};padding:0">
        <div style="width:${velka ? 11 : 9}px;height:${velka ? 11 : 9}px;background:${bodka(b)};border-radius:50%;margin:${velka ? 5 : 6}px 0 0 ${velka ? -6 : -5}px"></div>
      </td>
      <td style="padding:0 0 ${posledna ? 0 : 14}px 4px">
        <div style="font-size:14px;color:${F.text};line-height:1.35">${esc(b.popis)}</div>
        <div style="font-size:12.5px;color:${F.slaba};line-height:1.35">${denSK(b.den)}${b.cas ? ` · ${esc(b.cas)}` : ""}</div>
      </td>
      <td width="52" valign="top" style="padding:0 0 ${posledna ? 0 : 14}px 8px;text-align:right;font-size:14px;color:${F.text};white-space:nowrap">${cislo}</td>
    </tr>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${F.papier}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${F.papier}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">

  <tr><td style="background:${F.zelena};padding:18px 24px">
    <div style="font-size:17px;font-weight:700;color:#ffffff;letter-spacing:.3px">ProSapiens Biomechanic</div>
  </td></tr>

  <tr><td style="padding:24px">
    <div style="font-size:15px;color:${F.text};line-height:1.6">Ahoj ${esc(v.oslovenie)},</div>
    ${v.odkaz ? `<div style="font-size:15px;color:${F.text};line-height:1.6;margin-top:10px">${esc(v.odkaz)}</div>` : ""}
    <div style="font-size:15px;color:${F.text};line-height:1.6;margin-top:10px">${esc(uvod)}</div>

    <div style="margin-top:22px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${F.slaba}">Ako sa míňal balíček</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:10px">${riadkyOsi}</table>

    ${v.mesacne.length > 1 ? `
    <div style="margin-top:24px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${F.slaba}">Koľko si chodil po mesiacoch</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px">
      ${v.mesacne.map((m) => stlpec(mesiacSK(m.mesiac), m.pocet, maxMesiac)).join("")}
    </table>` : ""}

    <div style="margin-top:22px;padding:12px 14px;background:${F.papier};border-radius:8px;font-size:14px;color:${F.text}">
      Spolu odtrénované: <b>${v.hodinSpolu} h</b>${v.odkedy ? ` <span style="color:${F.slaba}">od ${denSK(v.odkedy)}</span>` : ""}
      ${v.tempo ? `<br>Tempo: <b>${tempoSK(v.tempo)}</b>` : ""}
      ${v.zostatok !== null && v.zostatok > 0 ? `<br>V balíčku zostáva: <b>${v.zostatok} h</b>` : ""}
    </div>

    ${v.platba ? `
    <div style="margin-top:24px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${F.slaba}">Ďalší balíček</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px">
      <tr>
        <td style="vertical-align:top;font-size:14px;color:${F.text};line-height:1.7">
          ${esc(v.platba.popis)}<br>
          <b style="font-size:19px">${czk(v.platba.suma)}</b><br>
          <span style="color:${F.slaba}">Účet ${esc(v.platba.ucet)}<br>Do poznámky uveď: ${esc(v.platba.sprava)}</span>
        </td>
        ${v.qrCid ? `<td width="132" style="text-align:right;vertical-align:top">
          <img src="cid:${esc(v.qrCid)}" width="120" height="120" alt="QR platba" style="display:block;border:0;margin-left:auto">
          <div style="font-size:11px;color:${F.slaba};margin-top:4px">naskenuj v bankovej appke</div>
        </td>` : ""}
      </tr>
    </table>` : ""}

    <div style="margin-top:26px;font-size:15px;color:${F.text};line-height:1.6">${esc(v.trener)}</div>
  </td></tr>

  <tr><td style="padding:14px 24px;border-top:1px solid ${F.linka};font-size:12px;color:${F.slaba}">
    ProSapiens Biomechanic${posledny ? ` · posledný tréning ${denSK(posledny)}` : ""}
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return { predmet, text, html };
}
