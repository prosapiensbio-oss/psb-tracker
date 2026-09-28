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

export type TreningRiadok = { den: string; cas?: string; trener?: string };

export type VypisKlienta = {
  klient: string;
  /** Oslovenie — krstné meno. */
  oslovenie: string;
  trener: string;
  /** Osobná veta na začiatok; keď je prázdna, mail začne rovno vecou. */
  odkaz?: string;
  treningy: TreningRiadok[];
  /** Koľko hodín zostáva; `null` = appka to nevie povedať. */
  zostatok: number | null;
  /** Odtrénované hodiny spolu a odkedy klient chodí. */
  hodinSpolu: number;
  odkedy: string;
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
  const posledny = v.treningy[0]?.den || "";
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
    "Tréningy:",
    ...v.treningy.map((t) => `  ${denSK(t.den)}${t.cas ? ` · ${t.cas}` : ""}`),
    "",
    `Spolu odtrénované: ${v.hodinSpolu} h${v.odkedy ? ` od ${denSK(v.odkedy)}` : ""}`,
    v.platba ? `\n${v.platba.popis}: ${czk(v.platba.suma)}\nÚčet ${v.platba.ucet}, do poznámky uveď: ${v.platba.sprava}` : "",
    "",
    v.trener,
    "ProSapiens Biomechanic",
  ].filter((x) => x !== "").join("\n");

  const maxMesiac = Math.max(1, ...v.mesacne.map((m) => m.pocet));
  const riadkyTreningov = v.treningy.map((t) => `<tr>
    <td style="padding:6px 0;border-bottom:1px solid ${F.linka};font-size:14px;color:${F.text}">${denSK(t.den)}</td>
    <td style="padding:6px 0;border-bottom:1px solid ${F.linka};font-size:14px;color:${F.slaba};text-align:right">${esc(t.cas || "")}</td>
  </tr>`).join("");

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

    <div style="margin-top:22px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${F.slaba}">Tréningy</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px">${riadkyTreningov}</table>

    ${v.mesacne.length > 1 ? `
    <div style="margin-top:24px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${F.slaba}">Koľko si chodil po mesiacoch</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px">
      ${v.mesacne.map((m) => stlpec(mesiacSK(m.mesiac), m.pocet, maxMesiac)).join("")}
    </table>` : ""}

    <div style="margin-top:22px;padding:12px 14px;background:${F.papier};border-radius:8px;font-size:14px;color:${F.text}">
      Spolu odtrénované: <b>${v.hodinSpolu} h</b>${v.odkedy ? ` <span style="color:${F.slaba}">od ${denSK(v.odkedy)}</span>` : ""}
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
