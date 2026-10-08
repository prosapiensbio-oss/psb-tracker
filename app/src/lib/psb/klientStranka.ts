import type { VypisKlienta } from "./mailKlientovi";

/**
 * STRÁNKA ZA ODKAZOM V SMS — prehľad pre klienta.
 *
 * Jerry, 1. 10. 2026, nad pôvodnou podobou:
 *   • „sprav tú stránku česky a svetlú",
 *   • „stále vypisuješ celú históriu, prečo? Ľudí nezaujíma každý jeden
 *      tréning, zaujíma ich posledný balík",
 *   • „celá história by mala prísť na vyžiadanie a preto by v tom odkaze
 *      malo byť CTA na žiadosť o celú históriu",
 *   • „prečo tam nie je QR na platbu?"
 *
 * PREČO BOLA TMAVÁ A SLOVENSKÁ. Stránka recyklovala HTML z MAILU
 * (`mailKlientovi`), a ten nesie farby a jazyk appky. Mail zostáva, ako
 * bol — chodí z Kokpitu a je to iný okamih. Stránka má vlastnú sadzbu:
 * tú istú ako `/u/` pred úvodným tréningom, teda zo živého webu — biela,
 * `#1A2E24` na text, zelená `#2D7D5A`, Raleway a Open Sans, polomer 32 px.
 * Keď klient klikne z SMS, vidí tú istú značku ako na webe.
 *
 * PREČO QR CHÝBAL. Platobný blok sa kreslí len vtedy, keď klient dlží — QR
 * na nulu je výzva na omyl. Lenže dlh sa počítal len z balíčkov zapísaných
 * v Kokpite, kým väčšina dlhov sú otvorené poplatky z PTmindera. Rieši to
 * `dlhJednehoKlienta`; stránka aj karta dlžníkov odvtedy počítajú to isté.
 *
 * ŽIADNY JAVASCRIPT. Otvára sa z SMS, často v okne, ktoré si otvorí správa.
 */

const esc = (s: string) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * ZELENÁ — tie isté hodnoty, akými chodí celá história mailom
 * (`FARBY_MAILU`). Nie podobné, doslova tie isté.
 */
export const SADZBA = {
  pozadie: "#232b1c",
  text: "#e8ead9",
  biela: "#ffffff",
  tlmeny: "#94a37e",
  jemny: "#e8ead9",
  slabsia: "#94a080",
  ramik: "#3a4630",
  zelena: "#d9e0c8",
  plocha: "#2c3524",
  minus: "#e2a07f",
};

const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
const den = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
const DNI = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];

/** „4 h" / „0,5 h" — pol hodiny sa nezaokrúhľuje na nulu. */
const hod = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")} h`;

/**
 * Posledná slovenčina na povrchu. Popisy riadkov nesú názvy produktov
 * z PTmindera a tie sú miešané — „Doplnenie členstva" prechádza
 * `nazovProduktu` zámerne nezmenené (je to interný presun zostatku, nie
 * predaj). Na českej stránke to klient čítal po slovensky, takže tu stojí
 * slovníček pre POVRCH: v dátach ani v appke sa nič neprepisuje.
 *
 * Bez `\b` zámerne: v JS regexe nie je medzi „é" a medzerou hranica slova
 * (é nie je `\w`), takže `/\bzaplatené\b/` nenašlo nič.
 */
const cesky = (t: string) =>
  t
    .replace(/doplnenie\s+členstva/gi, "Doplnění hodin")
    .replace(/zaplatené/g, "zaplaceno")
    .replace(/koniec\s+platnosti/gi, "konec platnosti")
    .replace(/tréning/g, "trénink")
    .replace(/hodín/g, "hodin");

/**
 * Hlavné číslo hore. Tri stavy, tri vety — tá istá logika ako v SMS:
 * zostatok nad nulou, dochodený balíček a hodiny nad rámec nie sú to isté
 * a klient si to vie prerátať.
 */
function hlavnyStav(v: VypisKlienta): { velke: string; pod: string } {
  if (v.zostatok == null) return { velke: "Tvoje tréninky", pod: "Přehled posledního balíčku." };
  if (v.zostatok > 0) return { velke: `Zbývá ti ${hod(v.zostatok)}`, pod: "z posledního balíčku" };
  if (v.zostatok === 0) return { velke: "Poslední hodina", pod: "balíček máš dochozený" };
  return { velke: `Nad rámec ${hod(-v.zostatok)}`, pod: "odtrénováno nad zaplacený balíček" };
}

/**
 * PLATBA BITCOINOM — namiesto bankového QR lightningová faktúra.
 *
 * Jerry, 5. 10. 2026: „mám časť klientov, ktorí platia v BTC — vedeli by sme
 * im namiesto QR na bankový účet generovať QR na LN adresu?" Vedeli, a so
 * sumou predvyplnenou: faktúra sa vyrobí v Blinku pri otvorení stránky.
 *
 * Píše sa pri tom VŠETKO, čo z čísla robí overiteľné číslo — pôvodná cena,
 * zľava, suma v korunách, suma v satoshi a kurz s časom. Klient tak vidí,
 * prečo platí práve toľko, a nemusí veriť appke na slovo.
 *
 * Pod QR stojí statická adresa: faktúra po hodine vyprší, adresa nie.
 */
function blokLightning(v: VypisKlienta, qrUrl?: string): string {
  const s = SADZBA;
  const l = v.lightning;
  if (!l) return "";
  const qr = qrUrl
    ? `<div style="margin-top:16px;background:#ffffff;border-radius:14px;padding:12px;display:inline-block">
<img src="${esc(qrUrl)}" alt="QR na platbu přes Lightning" width="200" style="display:block;width:200px;height:auto">
</div>`
    : "";
  const ulozQr = qrUrl
    ? `<div style="margin-top:14px">
<a href="${esc(qrUrl)}" download="platba-lightning.gif" style="display:inline-block;text-decoration:none;border:2px solid ${s.pozadie};border-radius:999px;padding:11px 22px;font-size:14px;font-weight:700;color:${s.pozadie}">Uložit QR do fotek</a>
</div>`
    : "";
  return `<div style="margin-top:26px;background:${s.zelena};border-radius:18px;padding:20px;text-align:center">
<div style="font-size:11px;letter-spacing:2.4px;color:#4d5940;text-transform:uppercase">${v.platba?.novy === false ? "K úhradě" : "Nový balíček"} · bitcoin</div>
<div style="margin-top:5px;font-family:'Raleway',sans-serif;font-weight:800;font-size:36px;line-height:1.1;color:${s.pozadie}">${esc(l.sats)} sats</div>
<div style="margin-top:3px;font-size:14px;color:#4d5940">${esc(kc(l.czk))}${l.zlava ? ` · sleva ${l.zlava} % z ${esc(kc(l.plnaCena))}` : ""}</div>
${qr}
${l.bolt11 ? `<div style="margin-top:12px;font-size:13px;line-height:1.6;color:${s.pozadie}">Načti QR v Lightning peněžence. Faktura má omezenou platnost — když ji peněženka odmítne, stačí stránku obnovit.</div>` : ""}
<label style="display:block;margin-top:12px;text-align:left">
<span style="display:block;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#4d5940">${l.bolt11 ? "Nebo pošli na adresu" : "Pošli na adresu"}</span>
<input value="${esc(l.adresa)}" readonly inputmode="none" onfocus="this.select()" style="width:100%;box-sizing:border-box;margin-top:5px;padding:11px 12px;border:1px solid #4d5940;border-radius:10px;background:transparent;color:${s.pozadie};font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700;text-align:center">
</label>
${l.bolt11 ? "" : `<div style="margin-top:8px;font-size:12.5px;line-height:1.5;color:#4d5940">Částku ${esc(l.sats)} sats zadej v peněžence sám.</div>`}
${ulozQr}
<div style="margin-top:14px;font-size:11.5px;line-height:1.5;color:#4d5940">kurz ${esc(l.kurz)} Kč/BTC${l.kurzKedy ? ` · ${esc(l.kurzKedy)}` : ""}</div>
</div>`;
}

function blokPlatby(v: VypisKlienta, qrUrl?: string): string {
  if (!v.platba || v.platba.suma <= 0) return "";
  const s = SADZBA;
  const qr = qrUrl
    ? `<div style="margin-top:14px;text-align:center">
<img src="${esc(qrUrl)}" alt="QR platba" width="190" height="190" style="width:190px;height:190px;display:inline-block;border-radius:10px;background:#FFFFFF">
<div style="margin-top:6px;font-size:12px;color:#4d5940">Načti QR v bankovní aplikaci</div>
</div>`
    : "";
  /**
   * ULOŽIŤ QR DO FOTIEK.
   *
   * Jerry, 2. 10. 2026: „bolo by super, keby pri tom QR bola možnosť kliknúť
   * a predvyplnilo by sa to v ebankingu."
   *
   * ODKAZ, KTORÝ OTVORÍ BANKU S PREDVYPLNENOU PLATBOU, V ČESKU NEEXISTUJE.
   * SPAYD je štandard pre obsah QR kódu, nie pre adresu; banky nemajú
   * spoločnú schému a každá vlastná by u ostatných neurobila nič.
   *
   * Čo funguje všade: stiahnuť QR do fotiek a v bankovej aplikácii ho načítať
   * z galérie — to vedia všetky české banky. Klient tak nepotrebuje druhý
   * telefón, čo bol jediný praktický dôvod, prečo QR na vlastnom mobile
   * nepoužil.
   *
   * `download` na `data:` adrese funguje bez JavaScriptu. Keď ho prehliadač
   * ignoruje (staršie Safari), obrázok sa otvorí a dá sa podržať prstom —
   * horší, ale stále priechodný koniec.
   */
  const ulozQr = qrUrl
    ? `<div style="margin-top:14px">
<a href="${esc(qrUrl)}" download="platba-prosapiens.gif" style="display:inline-block;text-decoration:none;border:2px solid ${s.pozadie};border-radius:999px;padding:11px 22px;font-size:14px;font-weight:700;color:${s.pozadie}">Uložit QR do fotek</a>
<div style="margin-top:7px;font-size:12px;line-height:1.5;color:#4d5940">V bankovní aplikaci pak dej „načíst QR z galerie" — umí to všechny české banky.</div>
</div>`
    : "";

  return `<div style="margin-top:26px;background:${s.zelena};border-radius:18px;padding:20px;text-align:center">
<div style="font-size:11px;letter-spacing:2.4px;color:#4d5940;text-transform:uppercase">${v.platba.novy ? "Nový balíček" : "K úhradě"}</div>
<div style="margin-top:5px;font-family:'Raleway',sans-serif;font-weight:800;font-size:36px;line-height:1.1;color:${s.pozadie}">${esc(kc(v.platba.suma))}</div>
<div style="margin-top:3px;font-size:14px;color:#4d5940">${esc(cesky(v.platba.popis))}${v.platba.odpocet ? ` · ${esc(hod(v.platba.odpocet))} se hned odečte` : ""}</div>
${qr}
<div style="margin-top:14px;font-size:13px;line-height:1.6;color:${s.pozadie}">
Do zprávy pro příjemce napiš <b>${esc(v.platba.sprava)}</b> — podle toho platbu spárujeme.
</div>
<!-- Číslo účtu v poli, nie v texte: dlhé podržanie ponúkne Kopírovať bez
     toho, aby klient trafil presne začiatok a koniec čísla. Prepísať sa
     nedá (readonly) a klávesnica na telefóne nevyskočí (inputmode none).
     onfocus je len uľahčenie — keď skript nebeží, pole sa označí prstom
     ako ktorýkoľvek iný text. Nič tu na JavaScripte nestojí; to je pri
     stránke, ktorá sa otvára z SMS, podmienka. -->
<label style="display:block;margin-top:12px;text-align:left">
<span style="display:block;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#4d5940">Číslo účtu — ťukni a zkopíruj</span>
<input value="${esc(v.platba.ucet)}" readonly inputmode="none" onfocus="this.select()" style="width:100%;box-sizing:border-box;margin-top:5px;padding:11px 12px;border:1px solid #4d5940;border-radius:10px;background:transparent;color:${s.pozadie};font-family:ui-monospace,Menlo,monospace;font-size:16px;font-weight:700;text-align:center">
</label>
${ulozQr}
</div>`;
}

/**
 * OS ČASU POSLEDNÉHO BALÍČKA. Celá história chodí mailom na vyžiadanie.
 *
 * DVE PODOBY, DVE RÔZNE OTÁZKY (Jerry, 2. 10. 2026).
 *
 *  • **Vodorovná**, hneď viditeľná: vľavo to, čo bolo NAPOSLEDY, a čím
 *    ďalej doprava, tým hlbšie do minulosti. Odpovedá na „čo bolo teraz".
 *  • **Zvislá**, za rozbaľovačkou: zhora nadol ako príbeh — vznik balíčka,
 *    platba, tréningy, prečerpanie. Čísla VĽAVO, popisy VPRAVO.
 *
 * Posuvník je skrytý zámerne: sivá čiarka pod osou vyzerá ako ďalší jej
 * prvok. Že sa dá ťahať, hovorí veta pod ňou.
 *
 * Žiadny JavaScript — rozbaľovanie je `<details>`. Stránka sa otvára z SMS,
 * často v okne, ktoré si otvorí samotná správa.
 */
type BodOsi = VypisKlienta["os"][number];

/** Veľká bodka = balíček alebo platba, malá = tréning. */
const jeMedznik = (b: BodOsi) => b.druh === "balicekOd" || b.druh === "platba";

/**
 * MÍNUS LEN TAM, KDE HODINA NAOZAJ NIE JE.
 *
 * Tréning, na ktorý balíček hodinu má, je obyčajný bod — aj keď sa v ten deň
 * ešte nezaplatilo. Že sa platilo neskôr, je vec medzi Jerrym a klientom,
 * nie dôvod svietiť na klientovej stránke červeným mínusom za hodinu, ktorú
 * má zaplatenú.
 */
const maHodinu = (b: BodOsi) => b.druh === "trening" && b.zostatok != null;

const farbaBodu = (b: BodOsi): string =>
  b.dlh && !maHodinu(b) ? SADZBA.minus
    : b.druh === "balicekOd" ? SADZBA.biela
      : b.druh === "platba" ? SADZBA.zelena
        : SADZBA.tlmeny;

/**
 * ODPOČET 6, 5, 4, 3, 2, 1 JE PEVNÝ A NEPRETRHNE SA.
 *
 * Jerry, 3. 10. 2026: „6h 5h 4h 3h 2h 1h sú pevne dané, tie sa vždy
 * odpočítavajú za sebou v rade. −1 −2 −3 sa pri vzniku balíčka upravuje
 * a dosadzuje sa tam 6h 5h 4h."
 *
 * Presne to appka aj počíta: keď balíček prevezme tréningy, na ktoré
 * predošlý nemal hodinu, dostanú hodiny nového (24. 7. = 6 h, 26. 7. = 5 h).
 * Lenže bod kreslil prednostne DLH — poradové číslo tréningu bez krytia —
 * takže na mieste šestky svietilo −1 a rad vyzeral deravý. Hodina má
 * prednosť; mínus zostáva len tam, kde hodina naozaj nie je.
 */
function cisloBodu(b: BodOsi): string {
  const s = SADZBA;
  // Mínus a hodina stoja VEDĽA SEBA, nie jedno namiesto druhého (Jerry,
  // 3. 10. 2026). Mínus hovorí „tento tréning balíček nemal", hodina hovorí,
  // ktorou hodinou je — alebo sa ňou stane, keď klient zaplatí.
  const minus = b.dlh ? `<span style="color:${s.minus}">−${b.dlh}</span>` : "";
  const hodina = maHodinu(b)
    ? `<span>${esc(hod(b.zostatok as number))}</span>`
    : b.buduca != null ? `<span style="color:${s.tlmeny}">${esc(hod(b.buduca))}</span>` : "";
  /**
   * ČÍSLO PATRÍ LEN TRÉNINGU.
   *
   * Pri balíčku stálo vľavo „6 h" a hneď vedľa „6h Předplatné" — to isté
   * dvakrát. Jerry, 3. 10. 2026: „tu je zbytočné 6h, pretože to je
   * předplatné a je tam vidieť, že 4 h je 9. 9." Platba číslo nikdy nemala.
   * Ľavý stĺpec je teda odpočet hodín a nič iné: 6, 5, 4, 3, 2, 1 a mínusy.
   */
  // Staré obdobie z PTmindera: tréning nad rámec nie je mínus ani plus.
  if (b.vyrovnane) return `<span style="color:${s.tlmeny}">—</span>`;
  const doplnenie = b.zDoplnenia ? `<span style="color:${s.tlmeny};font-size:12px;font-weight:400">doplnění</span>` : "";
  return [minus, hodina, doplnenie].filter(Boolean).join(" ");
}

const popisBodu = (b: BodOsi) => (b.druh === "trening" ? "trénink" : cesky(b.popis));

/**
 * ŽIADNA VETA O PREVZATÝCH HODINÁCH.
 *
 * „2 h padly na tréninky 25. 8. a 3. 9." tu stála dva dni. Odkedy nesie
 * tréning obe čísla (−1 a 6 h), hovorí to isté dvakrát — Jerry, 3. 10. 2026:
 * „týmto zápiskom je tá veta zbytočná." Dáta (`prevzate`, `prevzateDni`)
 * zostávajú, číta ich stôl klienta.
 */



const denPlne = (b: BodOsi) =>
  `${DNI[new Date(`${b.den}T12:00:00Z`).getUTCDay()]} ${den(b.den)}${b.cas ? ` · ${b.cas}` : ""}`;

/** Vodorovná os: najnovšie vľavo, doprava do minulosti. */
function osVodorovna(os: BodOsi[]): string {
  const s = SADZBA;
  const karty = [...os].reverse().map((b, i) => {
    const p = jeMedznik(b) ? 13 : 10;
    const cislo = cisloBodu(b);
    const hlavicka = i === 0
      ? `<div style="font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:${b.dlh && !maHodinu(b) ? s.minus : s.tlmeny};margin-bottom:3px">naposledy</div>`
      : `<div style="height:16px"></div>`;
    return `<div style="flex:0 0 120px;scroll-snap-align:start">${hlavicka}
<div style="height:50px;display:flex;flex-direction:column;justify-content:flex-end;padding:0 10px 7px 0">
<div style="font-size:12.5px;color:${jeMedznik(b) ? s.biela : s.text};line-height:1.25${jeMedznik(b) ? ";font-weight:700" : ""}">${esc(popisBodu(b))}</div>
<div style="font-size:11px;color:${s.slabsia}">${esc(denPlne(b))}</div>
</div>
<div style="height:14px;display:flex;align-items:center"><div style="width:${p}px;height:${p}px;border-radius:50%;background:${farbaBodu(b)}"></div></div>
<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:14.5px;margin-top:9px;color:${s.text}">${cislo}</div></div>`;
  }).join("");
  return `<div class="psb-os" style="position:relative;margin:0 -22px;padding:0 22px;overflow-x:auto;-webkit-overflow-scrolling:touch">
<div style="display:flex;position:relative;min-width:max-content;padding-bottom:4px">
<div style="position:absolute;left:0;right:0;top:72px;height:2px;background:${s.ramik}"></div>
${karty}</div></div>
<div style="font-size:11.5px;color:${s.slabsia};margin-top:10px">← posouvej doprava, jdeš do minulosti</div>`;
}

/** Zvislý rozpis: najstaršie hore, čísla vľavo, popisy vpravo. */
function osZvisla(os: BodOsi[]): string {
  const s = SADZBA;
  return os.map((b, i) => {
    const p = jeMedznik(b) ? 13 : 10;
    const prvy = i === 0;
    const posledny = i === os.length - 1;
    return `<div style="display:flex;align-items:center;min-height:52px">
<div style="flex:1;text-align:right;padding-right:15px;font-family:'Raleway',sans-serif;font-weight:700;font-size:15px;color:${s.text}">${cisloBodu(b)}</div>
<div style="width:15px;flex-shrink:0;align-self:stretch;display:flex;flex-direction:column;align-items:center">
<div style="width:2px;flex:1;background:${prvy ? "transparent" : s.ramik}"></div>
<div style="width:${p}px;height:${p}px;border-radius:50%;background:${farbaBodu(b)};flex-shrink:0"></div>
<div style="width:2px;flex:1;background:${posledny ? "transparent" : s.ramik}"></div></div>
<div style="flex:1;padding-left:15px">
<div style="font-size:14.5px;color:${jeMedznik(b) ? s.biela : s.text};line-height:1.3${jeMedznik(b) ? ";font-weight:700" : ""}">${esc(popisBodu(b))}</div>
<div style="font-size:11.5px;color:${s.slabsia}">${esc(denPlne(b))}</div>
</div></div>`;
  }).join("");
}

/**
 * Celý blok osi. Pri dlhu sa SKLADÁ: navrchu stránky vtedy stojí suma s QR
 * a história je kontext, nie hlavná vec (Jerry, 2. 10. 2026).
 */
/**
 * Ako sa volá to, čo klient na osi vidí.
 *
 * Jerry určuje rozsah v okne pred odoslaním SMS, takže nadpis nesmie tvrdiť
 * „Poslední balíček", keď sú na osi dva — pri Hanusovi by to bola presne tá
 * nejasnosť, kvôli ktorej sa rozsah zavádzal.
 */
function nazovRozsahu(balickov: number | undefined): string {
  const n = balickov ?? 1;
  if (n === 0) return "Celá historie";
  if (n === 1) return "Poslední balíček";
  if (n === 2) return "Poslední dva balíčky";
  if (n === 3) return "Poslední tři balíčky";
  return `Posledních ${n} balíčků`;
}

function blokOsi(v: VypisKlienta, zlozena: boolean): string {
  const s = SADZBA;
  if (!v.os.length) return "";
  const nazov = nazovRozsahu(v.balickov);
  const rozbal = (v.balickov ?? 1) === 1 ? "Rozbalit celý balíček pod sebou" : "Rozbalit vše pod sebou";
  const rozpis = `<details style="margin-top:16px;border-top:1px solid ${s.ramik};padding-top:14px">
<summary style="font-size:13.5px;font-weight:600;color:${s.zelena}"><span class="psb-sip">▸</span>${esc(rozbal)}</summary>
<div style="margin-top:16px">${osZvisla(v.os)}</div></details>`;
  if (zlozena) {
    return `<div style="margin-top:28px">
<details style="border-top:1px solid ${s.ramik};border-bottom:1px solid ${s.ramik};padding:14px 0">
<summary style="font-size:14px;font-weight:600;color:${s.zelena}"><span class="psb-sip">▸</span>${esc(nazov)} — co se stalo</summary>
<div style="margin-top:18px">${osVodorovna(v.os)}${rozpis}</div></details></div>`;
  }
  return `<div style="margin-top:30px">
<div style="font-size:11px;letter-spacing:2.4px;color:${s.tlmeny};text-transform:uppercase;margin-bottom:12px">${esc(nazov)}</div>
${osVodorovna(v.os)}${rozpis}</div>`;
}

/**
 * CTA na celú históriu. Je to `<form>`, nie odkaz: posielanie mailu je
 * zmena, nie čítanie — a odkaz, ktorý niečo odošle, raz odošle aj robot,
 * čo si stránku načíta dopredu.
 */
function blokHistorie(poslane: boolean): string {
  const s = SADZBA;
  if (poslane) {
    return `<div style="margin-top:26px;background:${s.plocha};border-left:3px solid ${s.zelena};border-radius:10px;padding:14px 16px;font-size:15px;line-height:1.55;color:${s.text}">
Poslali jsme ti celou historii na e-mail. Kdyby nedorazila, mrkni do spamu.</div>`;
  }
  return `<div style="margin-top:26px;padding-top:20px;border-top:1px solid ${s.ramik};text-align:center">
<div style="font-size:15px;font-weight:700;color:${s.biela}">Chceš celou historii?</div>
<div style="margin-top:4px;font-size:13.5px;line-height:1.55;color:${s.tlmeny}">Všechny tréninky i platby od začátku ti pošleme na e-mail.</div>
<form method="post" style="margin-top:12px">
<input type="hidden" name="akcia" value="historia">
<button type="submit" style="background:transparent;border:2px solid ${s.zelena};color:${s.zelena};border-radius:32px;padding:12px 26px;font-size:14.5px;font-weight:700;cursor:pointer;font-family:inherit">Poslat na e-mail</button>
</form>
</div>`;
}

export function klientStranka(v: VypisKlienta & {
  /** QR ako `data:` adresa; bez neho sa nakreslí len suma a účet. */
  qrUrl?: string;
  /** HTML bloku „Jak ti je?" — skladá ho `pocitovkaStranka`. */
  pocitovka?: string;
  /** Logo v hlavičke. */
  logoUrl?: string;
  /** `true` = práve sme odoslali celú históriu mailom. */
  historiaPoslana?: boolean;
}): string {
  const s = SADZBA;
  const stav = hlavnyStav(v);
  const logo = v.logoUrl
    ? `<img src="${esc(v.logoUrl)}" alt="ProSapiens Biomechanic" width="200" style="width:200px;max-width:62%;height:auto;display:block">`
    : `<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:12px;letter-spacing:3.4px;color:${s.tlmeny}">PROSAPIENS BIOMECHANIC</div>`;

  /**
   * STRÁNKA VYZERÁ VŽDY ROVNAKO. MENÍ SA LEN NADPIS.
   *
   * Jerry, 2. 10. 2026: „balíček došiel je východzia SMS-ka, čiže je tam
   * časová os, je tam QR platba, sú tam otázky a je tam žiadosť o celú
   * históriu… okrem toho sa už len upravuje nadpis — a to je definované
   * počtom a aktuálnou situáciou, pričom obsah odkazu vyzerá vždy rovnako."
   *
   * Nahrádza to pravidlá z predchádzajúceho dňa (os sa pri dlhu skladala,
   * pocitovka sa pýtala len pri dochodenom balíčku). Jedna podoba stránky
   * znamená, že sa SMS a stránka nemajú ako rozísť — a presne to sa pri
   * Lukášovi Hanusovi stalo.
   *
   * Tri nadpisy podľa stavu: „Zbývá ti 4 h", „Poslední hodina",
   * „Nad rámec 3 h".
   */
  const pocitovka = v.pocitovka || "";

  const dalsi = v.dalsi
    ? `<div style="margin-top:9px;font-size:15px;color:${s.tlmeny}">Další trénink: <b style="color:${s.biela}">${esc(DNI[new Date(`${v.dalsi.slice(0, 10)}T12:00:00Z`).getUTCDay()])} ${esc(den(v.dalsi))}</b>${v.dalsi.length > 10 ? ` · ${esc(v.dalsi.slice(11, 16))}` : ""}</div>`
    : "";

  return `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Tvoje tréninky — ProSapiens Biomechanic</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Raleway:wght@600;700&display=swap">
<style>
body{margin:0;background:${s.pozadie}}
a{color:${s.zelena}}
a:hover{color:${s.biela}}
summary{list-style:none;cursor:pointer}
summary::-webkit-details-marker{display:none}
.psb-sip{display:inline-block;transition:transform .15s;margin-right:8px}
details[open] .psb-sip{transform:rotate(90deg)}
/* Posuvník preč: sivá čiarka pod osou vyzerá ako ďalší jej prvok. */
.psb-os{scrollbar-width:none;-ms-overflow-style:none}
.psb-os::-webkit-scrollbar{display:none;height:0}
</style>
</head>
<body>
<div style="max-width:560px;margin:0 auto;padding:0 22px 48px;box-sizing:border-box;font-family:'Open Sans',sans-serif;color:${s.text};background:${s.pozadie}">

<div style="padding:26px 0 20px">${logo}</div>

<h1 style="margin:0;font-family:'Raleway',sans-serif;font-weight:700;font-size:32px;line-height:1.15;color:${s.biela}">${esc(stav.velke)}</h1>
<div style="margin-top:6px;font-size:15px;color:${s.tlmeny}">${esc(stav.pod)}</div>
${dalsi}

${blokOsi(v, false)}
${v.lightning ? blokLightning(v, v.qrUrl) : blokPlatby(v, v.qrUrl)}
${pocitovka}
${blokHistorie(!!v.historiaPoslana)}

<div style="margin-top:38px;padding-top:24px;border-top:1px solid ${s.ramik}">
<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:22px;line-height:1.2;color:${s.biela}">${esc(v.trener)}</div>
<div style="font-size:15px;color:${s.tlmeny};margin-top:3px">ProSapiens Biomechanic</div>
</div>

</div>
</body></html>`;
}
