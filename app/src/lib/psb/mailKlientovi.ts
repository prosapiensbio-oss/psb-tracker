/**
 * VÝPIS PRE KLIENTA — MAIL, KTORÝ SA DÁ ČÍTAŤ.
 *
 * Jerry si z piatich návrhov vybral tmavý zelený (29. 9. 2026): značka na
 * celej ploche, tri čísla o klientovi, časová os balíčka a platba ako jediná
 * svetlá vec v maili — tá má vyskočiť, lebo kvôli nej mail chodí.
 *
 * ČO V ŇOM ZÁMERNE NIE JE
 *
 *  • **Porovnanie s ostatnými.** Jerry ho pôvodne chcel, ale polovica ľudí je
 *    z definície pod priemerom — a práve tej polovici by veta „chodíš menej
 *    než ostatní" dala dôvod skončiť, nie kúpiť si ďalší balíček. V maili
 *    stoja jeho VLASTNÉ čísla.
 *  • **Bolesť.** Ponúkol som ju ako najsilnejší graf a bol to omyl:
 *    `klient_merania` je prázdna a zostane, Jerry meranie bolesti 24. 9. 2026
 *    zrušil. Nepripomínať a neponúkať.
 *  • **„Zostáva 0 h".** Jerry, 29. 9. 2026: „písať tam 0 h zostáva v balíčku
 *    mi príde zbytočné." Hovorí to nadpis.
 *  • **Zaokrúhlené tempo.** „4× mesačne" tiež odmietol; tempo sa píše na
 *    desatinu, v tom istom tvare ako v profile klienta („4,0").
 *  • **Stĺpce mesiacov.** Tri čísla hore povedia to isté kratšie.
 *
 * OBRÁZKY SÚ DVA A OBA IDÚ PRÍLOHOU S `Content-ID`.
 *
 * Logo aj QR. SVG ani dátovú adresu (`data:`) Gmail v obrázkoch nezobrazí;
 * `cid:` prejde všade. Viac obrázkov než tieto dva sem nepatrí — doména má
 * DMARC `p=none` a obrázkový mail je pre spamový filter horší.
 */

/** Farby značky. Tmavá zelená je pozadie, svetlá je platba. */
/**
 * Paleta oboch mailov klientovi — výpisu aj faktúry.
 *
 * Jerry, 29. 9. 2026 pri faktúre: „vyhráva 1, nech sú rovnaké." Rovnaké
 * znamená jeden zdroj farieb: mailFaktury si ich odtiaľto importuje,
 * takže zmena odtieňa tu prefarbí oba maily naraz.
 */
export const FARBY_MAILU = {
  pozadie: "#232b1c",
  karta: "#2c3524",
  linka: "#3a4630",
  text: "#e8ead9",
  slaba: "#8a9a72",
  slabsia: "#7e8b68",
  biela: "#ffffff",
  platba: "#d9e0c8",
  platbaText: "#232b1c",
  platbaSlaba: "#4d5940",
  minus: "#e2a07f",
} as const;
const F = FARBY_MAILU;

export type BodOsi = {
  den: string;
  /** Čas tréningu, keď ho poznáme. */
  cas?: string;
  /** Čo sa stalo — názov balíčka, „tréning", „zaplatené". */
  popis: string;
  druh: "balicekOd" | "trening" | "platba" | "balicekDo" | "dalsi";
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
  /** Tréningov mesačne — ten istý výpočet a tvar ako v profile („4,0"). */
  tempo?: number;
  /** Koľko mesiacov u nás chodí. */
  mesiacov?: number;
  /**
   * Platba za ďalší balíček; bez nej sa QR ani suma nekreslia.
   *
   * `sprava` je to, čo má klient napísať do poznámky pre príjemcu — a je to
   * jeho MENO, nie variabilný symbol. Kokpit páruje bankové príjmy podľa
   * mena v texte platby.
   */
  platba?: { popis: string; suma: number; ucet: string; sprava: string };
  /**
   * Celá história na vyžiadanie klienta.
   *
   * Jerry, 29. 9. 2026: „možnosť pre klienta na vyžiadanie — celá história
   * hodín aj platieb do mailu." Je to ten istý mail, len sa inak volá
   * („Celá história", nie „Balíček dochodený" — klient si pýtal prehľad,
   * nie upomienku), v dlaždiciach je namiesto tempa zaplatená suma a os
   * nesie všetko od prvého tréningu vrátane platieb.
   */
  uplna?: boolean;
  /** Zaplatené spolu (Kč) — dlaždica pri úplnej histórii. */
  zaplateneSpolu?: number;

  /**
   * Dnešný dátum (YYYY-MM-DD).
   *
   * Mail pôvodne písal „dnes si mal poslednú hodinu" vždy, keď bol zostatok
   * nula — aj Vítězslavovi, ktorý dochodil 15. 9. a píše sa mu 29. Veta
   * o dnešku v maili, ktorý príde o dva týždne, je nepravda o tom, čo sa
   * stalo. Bez tohto poľa sa na dnešok nikde neodvoláva.
   */
  dnes?: string;
  /**
   * Najbližší dohodnutý termín z kalendára (ISO `2026-10-06T10:30`).
   *
   * Jerry, 29. 9. 2026: „môže tam byť aj poznámka typu a najbližšie ste
   * dohodnutý na tento termín." Mail hovorí o tom, čo sa minulo, a končí
   * výzvou zaplatiť — bez tejto vety je to účet. S ňou je to prehľad:
   * tu si bol, toto zostalo, tu sa vidíme. Keď termín dohodnutý nie je,
   * nepíše sa nič a je to samo osebe informácia.
   */
  dalsi?: string;
  /** `cid` obrázkov — vkladá ich odosielateľ. */
  qrCid?: string;
  logoCid?: string;
};

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const denSK = (iso: string) => {
  const d = (iso || "").slice(0, 10).split("-");
  return d.length === 3 ? `${Number(d[2])}. ${Number(d[1])}. ${d[0]}` : iso;
};
const denKratko = (iso: string) => {
  const d = (iso || "").slice(0, 10).split("-");
  return d.length === 3 ? `${Number(d[2])}. ${Number(d[1])}.` : iso;
};
export const czk = (n: number) => `${Math.round(n).toLocaleString("sk-SK").replace(/ /g, " ")} Kč`;

/**
 * Tempo na desatinu — ten istý tvar, aký stojí v profile klienta.
 *
 * Jerry, 29. 9. 2026: „4× mesačne mi príde zbytočné, páči sa mi, ako je to
 * vyjadrené v profile — 3,9 mesačne." Zaokrúhlenie na celé robí z čísla
 * dojem odhadu; desatina hovorí, že sa to naozaj počítalo.
 */
export const tempoSK = (zaMesiac: number): string => zaMesiac.toFixed(1).replace(".", ",");

const mesiacovSK = (n: number) => `${n} ${n === 1 ? "mesiac" : n < 5 ? "mesiace" : "mesiacov"}`;

/**
 * „zostáva 1 h", „zostávajú 2 h", „zostáva 5 h".
 *
 * Sloveso sa v slovenčine pri dvoch až štyroch mení a mail, ktorý číta
 * zákazník, si to nemôže dovoliť zle. Tú istú vetu používa aj SMS.
 */
export const zostavaHodin = (n: number): string => `${n >= 2 && n <= 4 ? "zostávajú" : "zostáva"} ${n} h`;

/**
 * Predmet žiadosti o históriu — podľa NEHO Kokpit žiadosť spozná pri čítaní
 * schránky (`jeZiadostOHistoriu` v mailDopyt.ts). Meniť ich treba spolu.
 */
export const PREDMET_HISTORIE = "Celá história tréningov a platieb";
export const ADRESA_HISTORIE = "info@prosapiens.cz";

const mailtoHistoria = (klient: string): string => {
  const subject = encodeURIComponent(`${PREDMET_HISTORIE} — ${klient}`);
  const body = encodeURIComponent("Dobrý den, prosím o celou historii mých tréninků a plateb.");
  return `mailto:${ADRESA_HISTORIE}?subject=${subject}&amp;body=${body}`;
};

/** Predmet, textová aj HTML podoba tej istej správy. */
export function mailKlientovi(v: VypisKlienta): { predmet: string; text: string; html: string } {
  const treningy = v.os.filter((b) => b.druh === "trening");
  const posledny = treningy[treningy.length - 1]?.den || "";
  const doslo = v.zostatok !== null && v.zostatok <= 0;

  const predmet = v.uplna
    ? "Tvoje tréningy a platby — ProSapiens"
    : doslo ? "Balíček dochodený — výpis a platba" : "Tvoja dochádzka v ProSapiens";
  const nadpis = v.uplna ? "Celá história" : doslo ? "Balíček dochodený" : "Tvoja dochádzka";
  const dnesnaHodina = !!v.dnes && !!posledny && posledny.slice(0, 10) === v.dnes;
  /**
   * Hodiny NAD RÁMEC balíčka. Tie sa nesmú schovať za „dochodený": klient
   * ich odtrénoval a sú v ďalšej platbe. Povedať to rovno je slušnejšie
   * než nechať ho zistiť to z čísla na faktúre.
   */
  const navyse = v.zostatok !== null && v.zostatok < 0 ? -v.zostatok : 0;
  // Pri úplnej histórii sa nehovorí o dochodenom balíčku — klient si pýtal
  // prehľad; stav balíčka aj tak vidí na konci osi.
  const uvod = v.uplna
    ? "posielam celú históriu tréningov aj platieb."
    : navyse
    ? `${dnesnaHodina ? "dnes si mal" : "mal si"} ${navyse === 1 ? "hodinu" : `${navyse} hodiny`} nad rámec balíčka — ${navyse === 1 ? "je" : "sú"} v ďalšej platbe.`
    : doslo
      ? dnesnaHodina
        ? "dnes si mal poslednú hodinu z balíčka."
        : posledny
          ? `balíček máš dochodený — posledná hodina bola ${denSK(posledny)}.`
          : "balíček máš dochodený."
      : v.zostatok !== null ? `v balíčku ti ${zostavaHodin(v.zostatok)}.` : "posielam ti prehľad tréningov.";

  /**
   * OS KONČÍ TÝM, ČO KLIENTA ZAUJÍMA — koľko mu zostáva.
   *
   * Obrazovka posiela len to, čo sa naozaj stalo (balíček, tréningy, platby);
   * poslednú bodku dopĺňa mail, lebo je to odpoveď, nie udalosť — a nemá
   * dátum, aby nevyzerala ako ďalší tréning. Keď appka zostatok nevie
   * (`null`), bodka tam nie je; vymyslené číslo ide von k zákazníkovi.
   */
  const os = [
    ...(v.zostatok === null || v.os[v.os.length - 1]?.druh === "balicekDo"
      ? v.os
      : [...v.os, {
        den: "",
        popis: v.zostatok <= 0 ? "Balíček dochodený" : zostavaHodin(v.zostatok).replace(/^./, (z) => z.toUpperCase()),
        druh: "balicekDo" as const,
      }]),
    // Najbližší termín je posledný bod osi, lebo ňou naozaj je — os ide
    // ďalej, nekončí účtom.
    ...(v.dalsi ? [{
      den: v.dalsi.slice(0, 10),
      cas: v.dalsi.length > 10 ? v.dalsi.slice(11, 16) : undefined,
      popis: "Najbližší tréning",
      druh: "dalsi" as const,
    }] : []),
  ];

  /** Tri čísla, ktoré o klientovi niečo hovoria. „0 h zostáva" medzi ne nepatrí. */
  const staty: [string, string][] = [
    [`${v.hodinSpolu} h`, "odtrénované spolu"],
    // Úplná história je odpoveď aj na „koľko som u vás nechal" — tempo by tu
    // bolo vata, zaplatená suma je to, čo si klient pýtal.
    ...(v.uplna && v.zaplateneSpolu
      ? [[czk(v.zaplateneSpolu), "zaplatené spolu"] as [string, string]]
      : v.tempo ? [[tempoSK(v.tempo), "tréningov mesačne"] as [string, string]] : []),
    ...(v.mesiacov ? [[mesiacovSK(v.mesiacov), v.odkedy ? `chodíš od ${denSK(v.odkedy)}` : "chodíš u nás"] as [string, string]] : []),
  ];

  // ── textová podoba: to isté, len bez ozdôb ────────────────────────────
  /**
   * `null` = časť, ktorá tam teraz nie je (odkaz, platba); prázdny reťazec je
   * naschvál prázdny riadok. Pôvodne sa filtrovalo na `!== ""` a vypadli aj
   * tie — textová podoba bola jeden zlepenec bez medzier.
   */
  const text = [
    `Ahoj ${v.oslovenie},`,
    "",
    v.odkaz || null,
    uvod,
    "",
    v.uplna ? "Tréningy a platby:" : "Ako sa míňal balíček:",
    ...os.map((b) => {
      const cislo = b.druh !== "trening" ? "" : [
        b.zostatok != null ? `${b.zostatok} h` : "",
        b.dlh ? `−${b.dlh}` : "",
      ].filter(Boolean).join(", ");
      const kedy = b.den ? `${denSK(b.den)}${b.cas ? ` · ${b.cas}` : ""} — ` : "";
      return `  ${kedy}${b.popis}${cislo ? ` (${cislo})` : ""}`;
    }),
    "",
    ...staty.map(([cislo, popis]) => `${popis}: ${cislo}`),
    v.platba
      ? `\n${v.platba.popis}: ${czk(v.platba.suma)}\nÚčet ${v.platba.ucet}, do poznámky uveď: ${v.platba.sprava}`
      : null,
    v.uplna ? null : `\nChceš celú históriu tréningov a platieb? Napíš na ${ADRESA_HISTORIE}.`,
    "",
    v.trener,
    "ProSapiens Biomechanic",
  ].filter((x) => x !== null).join("\n");

  /**
   * ČASOVÁ OS S ČIAROU.
   *
   * Jerry, 29. 9. 2026: „pridaj mi tam tú časovú os." Bodky bez čiary sú
   * zoznam s odrážkami; čiara z nich robí os, na ktorej je vidieť, že medzi
   * dvoma tréningami niečo bolo — napríklad platba.
   *
   * Čiara je `border-left` na ľavej bunke, bodka na nej sedí cez záporný
   * okraj. Outlook záporné okraje ani zaoblenie nepozná, takže tam z bodky
   * bude malý štvorček vedľa čiary — čitateľné to zostane.
   */
  const riadkyOsi = os.map((b, i) => {
    const posledna = i === os.length - 1;
    const velka = b.druh !== "trening";
    const cislo = b.druh !== "trening" ? "" : [
      b.zostatok != null ? `<b>${b.zostatok} h</b>` : "",
      b.dlh ? `<span style="color:${F.minus};font-weight:700">−${b.dlh}</span>` : "",
    ].filter(Boolean).join(" ");
    /**
     * Posledná bodka čiaru KONČÍ. Keby aj pod ňou pokračovala, os by vyzerala
     * useknutá uprostred — akoby ďalšie body boli a len sa nezmestili.
     * Preto tam namiesto rámika ide kúsok čiary nad bodkou.
     */
    const bodka = `<div style="width:${velka ? 11 : 8}px;height:${velka ? 11 : 8}px;background:${velka ? F.text : F.slaba};border-radius:50%`;
    const lavy = posledna
      ? `<td width="20" valign="top" style="padding:0">
        <div style="width:2px;height:${velka ? 5 : 7}px;background:${F.linka};font-size:0;line-height:0">&nbsp;</div>
        ${bodka};margin:0 0 0 ${velka ? -4 : -3}px"></div>
      </td>`
      : `<td width="20" valign="top" style="border-left:2px solid ${F.linka};padding:0">
        ${bodka};margin:${velka ? 5 : 7}px 0 0 ${velka ? -6 : -5}px"></div>
      </td>`;
    return `<tr>
      ${lavy}
      <td style="padding:0 0 ${posledna ? 0 : 13}px 6px">
        <div style="font-size:14px;color:${velka ? F.biela : F.text};line-height:1.35">${esc(b.popis)}</div>
        ${b.den ? `<div style="font-size:12px;color:${F.slabsia};line-height:1.35">${denKratko(b.den)}${b.cas ? ` · ${esc(b.cas)}` : ""}</div>` : ""}
      </td>
      <td width="56" valign="top" style="padding:0 0 ${posledna ? 0 : 13}px 8px;text-align:right;font-size:14px;color:${F.text};white-space:nowrap">${cislo}</td>
    </tr>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${F.pozadie}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${F.pozadie}">
<tr><td align="center" style="padding:30px 14px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">

  <tr><td align="center" style="padding-bottom:24px">
    ${v.logoCid
    ? `<img src="cid:${esc(v.logoCid)}" width="200" alt="ProSapiens Biomechanic" style="display:block;border:0">`
    : `<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${F.slaba}">ProSapiens Biomechanic</div>`}
  </td></tr>

  <tr><td style="text-align:center;font-size:32px;font-weight:700;color:${F.biela};line-height:1.15;padding-bottom:8px">${esc(nadpis)}</td></tr>
  <tr><td style="text-align:center;font-size:15px;color:${F.slaba};line-height:1.6;padding-bottom:24px">
    ${esc(v.oslovenie)}, ${esc(v.odkaz || uvod)}
  </td></tr>

  ${staty.length ? `<tr><td style="padding-bottom:20px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      ${staty.map(([cislo, popis], i) => `${i ? '<td width="10"></td>' : ""}<td width="33%" style="padding:16px 8px;background:${F.karta};border-radius:12px;text-align:center">
        <div style="font-size:23px;font-weight:700;color:${F.biela};line-height:1.1">${esc(cislo)}</div>
        <div style="font-size:11px;color:${F.slaba};margin-top:5px;line-height:1.4">${esc(popis)}</div>
      </td>`).join("")}
    </tr></table>
  </td></tr>` : ""}

  <tr><td>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${F.karta};border-radius:14px">
      <tr><td style="padding:20px 22px">
        <div style="font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:${F.slaba};padding-bottom:14px">${v.uplna ? "Tréningy a platby" : "Ako sa míňal balíček"}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${riadkyOsi}</table>
      </td></tr>
    </table>
  </td></tr>

  ${v.platba ? `<tr><td style="padding:22px 0 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${F.platba};border-radius:14px">
      <tr>
        <td style="padding:20px 22px;font-size:14px;color:${F.platbaText};line-height:1.7">
          Ďalší ${esc(v.platba.popis.toLowerCase())}<br><b style="font-size:24px">${czk(v.platba.suma)}</b><br>
          <span style="color:${F.platbaSlaba}">${esc(v.platba.ucet)}<br>do poznámky: ${esc(v.platba.sprava)}</span>
        </td>
        ${v.qrCid ? `<td width="128" style="padding:20px 22px 20px 0;text-align:right">
          <img src="cid:${esc(v.qrCid)}" width="110" height="110" alt="QR platba" style="display:block;background:#fff;padding:5px;border-radius:8px;margin-left:auto;border:0">
        </td>` : ""}
      </tr>
    </table>
  </td></tr>` : ""}

  ${v.uplna ? "" : `<tr><td align="center" style="padding:26px 0 2px">
    <!--
      Tlačidlo pre KLIENTA (Jerry, 29. 9. 2026: „aby na neho mohol klient
      kliknúť"). Je to mailto, nie odkaz na server: klik otvorí klientovi
      rozpísaný mail na info@ s predmetom, podľa ktorého žiadosť spozná
      Kokpit pri čítaní schránky. Verejná adresa s históriou klienta by
      musela byť podpísaná a aj tak by ju otvárali antivírusy — mailto
      nič neposiela, kým klient sám nestlačí Odoslať.
    -->
    <a href="${mailtoHistoria(v.klient)}" style="display:inline-block;background:${F.karta};border:1px solid ${F.linka};border-radius:10px;padding:11px 20px;font-size:13px;font-weight:600;color:${F.text};text-decoration:none">Chcem celú históriu tréningov a platieb</a>
  </td></tr>
  <tr><td align="center" style="font-size:11px;color:${F.slabsia};padding-bottom:2px">jedným klikom si ju vyžiadaš mailom — pošleme ti ju v tomto istom prehľade</td></tr>`}

  <tr><td style="padding:24px 4px 0;font-size:15px;color:${F.biela}">${esc(v.trener)}</td></tr>
  <tr><td style="padding:16px 4px 0;font-size:11.5px;color:${F.slabsia}">
    ProSapiens Biomechanic${posledny ? ` · posledný tréning ${denSK(posledny)}` : ""}
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  return { predmet, text, html };
}
