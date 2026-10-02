import { TRENERI } from "./mailFaktury";

/**
 * STRÁNKA ZA ODKAZOM V SMS — pred úvodným tréningom a po ňom.
 *
 * Jerry, 1. 10. 2026: text, ktorý dnes posiela pred úvodným, má 780 znakov,
 * teda šesť SMS. To nie je správa, to je webová stránka poslaná po kúskoch —
 * klient ju dostane rozsypanú na šesť bubliniek a odkaz na video sa v nich
 * môže zalomiť. Odteraz chodí jedna veta s odkazom a za odkazom je toto.
 *
 * Znenie je Jerryho, nezmenené. Zmenilo sa len poradie: termín a adresa sú
 * prvé a najväčšie, zvyšok pod nimi po kúskoch, a potvrdenie termínu je
 * tlačidlo, ktoré otvorí správu s vyplneným číslom aj textom.
 *
 * Sadzba je zo ŽIVÉHO WEBU, nie vymyslená: biele pozadie, `#1A2E24` na text,
 * zelená `#2D7D5A` na akcenty, Raleway na nadpisy, Open Sans na text,
 * tlačidlá s polomerom 32 px. Keď to klient otvorí, je to tá istá značka ako
 * stránka, na ktorú sa pozeral pred tým, než zavolal.
 */

export const MIESTO = {
  ulica: "Fanderlíkova 70",
  mesto: "Brno-Žabovřesky",
  upresnenie: "přízemí, první dveře vpravo",
  mapa: "https://maps.google.com/?q=Fanderl%C3%ADkova+70+Brno",
};

/**
 * Úvodný tréning — bežná cena a dĺžka. V CENNIK-u nie je: ten nesie balíčky.
 *
 * Cena je tu len ako VÝCHODISKO. Jerry, 1. 10. 2026: „niekedy sa môže stať,
 * že chceme dať klientovi za úvodný tréning zľavu — a vtedy by sa mala
 * upraviť aj cena v tom odkaze." Skutočná cena preto patrí k odkazu (stĺpec
 * `cena_czk` v `uvodne_odkazy`), nie do konštanty.
 */
export const UVODNY = { minut: 60, cenaCzk: 1100 };

export const ODKAZY = {
  video: "https://youtu.be/A_yymlfMJes",
  /**
   * Ceník je na /sluzby/, nie na /jak-to-funguje/ (Jerry, 1. 10. 2026).
   * `#cenik` je kotva na obrazovke s cenami — téma webu ju vie nájsť
   * (`anchorGo` v app.js), takže klient pristane rovno na cenách a nemusí
   * listovať. Kotva je v `parts/sluzby.html` v téme psb-spready.
   */
  cennik: "https://www.prosapiens.cz/sluzby/#cenik",
  profil: "https://www.prosapiens.cz/o-nas/",
  poUvodnej: "https://www.prosapiens.cz/informace-po-uvodni-lekci/",
  coOcekavat: "https://www.prosapiens.cz/co-ocekavat-od-biomechanickeho-treninku/",
  idealniPristup: "https://www.prosapiens.cz/idealni-pristup-2/",
};

const DNI = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
const MESIACE = ["ledna", "února", "března", "dubna", "května", "června",
  "července", "srpna", "září", "října", "listopadu", "prosince"];

export type Termin = { den: string; datum: string; cas: string };

/**
 * „úterý · 14. října · 10:00" z ISO času udalosti.
 *
 * Čas sa berie DOSLOVNE z reťazca, neprevádza sa cez `Date` — kalendár ukladá
 * pražský čas a prevod cez UTC by hodinu posunul práve na prelomoch letného
 * času, teda vtedy, keď na tom záleží najviac.
 */
export function termin(iso: string | null | undefined): Termin | null {
  const s = String(iso || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  const [, r, mes, d, h, min] = m;
  const mesIdx = Number(mes) - 1;
  if (mesIdx < 0 || mesIdx > 11) return null;
  const den = DNI[new Date(Date.UTC(Number(r), mesIdx, Number(d))).getUTCDay()];
  return { den, datum: `${Number(d)}. ${MESIACE[mesIdx]}`, cas: `${h}:${min}` };
}

const esc = (s: string) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Telefón do `tel:` a `sms:` — bez medzier, s predvoľbou. */
const cisloDoOdkazu = (t: string) => t.replace(/[^\d+]/g, "");

export type VolbyStranky = {
  druh: "pred" | "po";
  /** „Jerry" | „Terezka"; čokoľvek iné sa berie ako Jerry. */
  trener: string;
  /** Termín, o ktorom stránka hovorí. Keď chýba, blok s dátumom sa nekreslí. */
  kedy?: string | null;
  /**
   * Cena pre TOHTO klienta. `null`/`undefined` = bežná. Nula je platná
   * hodnota — tréning zadarmo je rozhodnutie, nie chýbajúci údaj.
   */
  cenaCzk?: number | null;
  /** Adresa loga na tom istom webe (Kokpit ho servíruje z `public/`). */
  logoUrl: string;
  /**
   * Odkaz na anamnézu (`/a/<token>`) — druhé CTA vedľa videa.
   *
   * Jerry, 2. 10. 2026: „nemala by byť v tej SMS pred úvodným vedľa pustiť
   * video ďalšia CTA, zelená, vyplňte 3 otázky?" Odkaz sa dovtedy kopíroval
   * ručne z karty Anamnézy, takže klientovi často neprišiel vôbec. Bez
   * tokenu sa tlačidlo NEKRESLÍ — odkaz, ktorý nikam nevedie, je horší než
   * žiadny.
   */
  anamnezaUrl?: string | null;
  /** `true` = klient práve odoslal odpoveď; namiesto poľa sa poďakuje. */
  odpovedPoslana?: boolean;
};

const sipka = `<svg width="9" height="15" viewBox="0 0 9 15" aria-hidden="true" style="flex-shrink:0"><path d="M1 1 L7.5 7.5 L1 14" fill="none" stroke="#2D7D5A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

const riadokOdkazu = (href: string, nadpis: string, popis: string) =>
  `<a href="${esc(href)}" style="display:flex;align-items:center;gap:12px;text-decoration:none;border:1px solid #DCE3DD;border-radius:16px;padding:16px 18px;margin-top:12px">
<span style="flex-grow:1;min-width:0">
<span style="display:block;font-size:17px;font-weight:600;color:#1A2E24">${esc(nadpis)}</span>
<span style="display:block;font-size:14px;color:#5B6B60;margin-top:2px">${esc(popis)}</span>
</span>${sipka}</a>`;

/**
 * Celá stránka ako jeden HTML dokument.
 *
 * Žiadny JavaScript: otvára sa z SMS, často v okne, ktoré si otvorí správa.
 * Skript, ktorý sa nenačíta, by z tlačidiel spravil mŕtve obdĺžniky.
 */
export function uvodnaStrankaHtml(v: VolbyStranky): string {
  const t = TRENERI[v.trener] ? v.trener : "Jerry";
  const tr = TRENERI[t];
  const tel = cisloDoOdkazu(tr.telefon);
  const kedy = termin(v.kedy);
  const predUvodnym = v.druh === "pred";

  // Potvrdenie otvorí SPRÁVU s vyplneným číslom aj textom. Odoslať ju musí
  // človek — to je zámer, inak by chodili potvrdenia od omylom klepnutých.
  const textPotvrdenia = kedy
    ? `Potvrzuji termín ${predUvodnym ? "úvodního tréninku" : "tréninku"} ${kedy.datum} v ${kedy.cas}.`
    : "Potvrzuji termín.";
  const smsHref = `sms:${tel}?&body=${encodeURIComponent(textPotvrdenia)}`;

  const hlavicka = kedy
    ? `<div style="margin-top:26px;font-size:11px;letter-spacing:2.4px;color:#9FBCA9">${predUvodnym ? "ÚVODNÍ TRÉNINK" : "PRVNÍ DALŠÍ TRÉNINK"}</div>
<div style="margin-top:8px;font-family:'Raleway',sans-serif;font-weight:700;font-size:40px;line-height:1.05">${esc(kedy.den)}<br>${esc(kedy.datum)}</div>
<div style="margin-top:10px;font-family:'Raleway',sans-serif;font-weight:700;font-size:32px;color:#8FD3A8">${esc(kedy.cas)}</div>`
    : `<div style="margin-top:26px;font-family:'Raleway',sans-serif;font-weight:700;font-size:34px;line-height:1.15">${predUvodnym ? "Váš úvodní trénink" : "Po úvodní lekci"}</div>
<div style="margin-top:10px;font-size:15px;color:#C9D8CE">Termín Vám potvrdíme zprávou.</div>`;

  // Zľava sa NEZAMLČÍ: keď je cena nižšia než bežná, pôvodná zostane
  // prečiarknutá vedľa nej. Klient tak vidí, že dostal zľavu, a nie len
  // iné číslo, než aké mu niekto povedal po telefóne.
  const cena = v.cenaCzk == null ? UVODNY.cenaCzk : v.cenaCzk;
  const cenaText = cena === 0
    ? "zdarma"
    : cena < UVODNY.cenaCzk
      ? `<s style="color:#9FBCA9;font-weight:400">${UVODNY.cenaCzk} Kč</s> ${cena} Kč`
      : `${cena} Kč`;
  const cenaDlzka = predUvodnym
    ? `<div style="margin-top:22px;display:flex;gap:30px">
<div><div style="font-size:10px;letter-spacing:2px;color:#9FBCA9">DÉLKA</div><div style="font-size:17px;font-weight:600;margin-top:3px">${UVODNY.minut} minut</div></div>
<div><div style="font-size:10px;letter-spacing:2px;color:#9FBCA9">CENA</div><div style="font-size:17px;font-weight:600;margin-top:3px">${cenaText}</div></div>
</div>`
    : "";

  const telo = predUvodnym
    ? `<div style="font-size:11px;letter-spacing:2.2px;color:#5B6B60">KDE</div>
<div style="margin-top:6px;font-family:'Raleway',sans-serif;font-weight:700;font-size:22px;line-height:1.3">${esc(MIESTO.ulica)}<br>${esc(MIESTO.mesto)}</div>
<div style="margin-top:5px;font-size:15px;color:#3C4C42">${esc(MIESTO.upresnenie)}</div>
<a href="${esc(MIESTO.mapa)}" style="display:inline-block;margin-top:10px;font-size:15px;font-weight:600">Ukázat na mapě</a>

<h2 style="margin:30px 0 7px;font-family:'Raleway',sans-serif;font-weight:700;font-size:19px">Co si vzít</h2>
<p style="margin:0;font-size:16px;line-height:1.65;color:#3C4C42">Nezapomeňte si prosím sportovní oblečení – ideálně krátké legíny, šortky nebo jiné přiléhavé oblečení, aby bylo dobře vidět držení těla.</p>

<h2 style="margin:26px 0 7px;font-family:'Raleway',sans-serif;font-weight:700;font-size:19px">Před lekcí</h2>
<p style="margin:0 0 12px;font-size:16px;line-height:1.65;color:#3C4C42">Podívejte se prosím na toto krátké video. Připravíte se tak lépe na to, co budeme společně zkoumat.</p>
<div style="display:flex;gap:10px;flex-wrap:wrap">
<a href="${esc(ODKAZY.video)}" style="display:inline-block;text-decoration:none;border:2px solid #1A2E24;border-radius:32px;padding:12px 22px;font-size:15px;font-weight:600;color:#1A2E24">Pustit video · 3 min</a>
${v.anamnezaUrl ? `<a href="${esc(v.anamnezaUrl)}" style="display:inline-block;text-decoration:none;background:#1A2E24;border-radius:32px;padding:14px 24px;font-size:15px;font-weight:600;color:#FFFFFF">Vyplnit 3 otázky</a>` : ""}
</div>
${v.anamnezaUrl ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#5B6B60">Otázky jsou o tom, co Vás trápí — ať nemusíme ztrácet čas na místě.</p>` : ""}

${riadokOdkazu(ODKAZY.cennik, "Ceník", "co stojí tréninky a balíčky")}

<div style="margin-top:26px;display:flex;gap:11px;align-items:center;border:1px solid #DCE3DD;border-radius:18px;padding:16px 18px">
<span style="font-size:26px;line-height:1" role="img" aria-label="pes">🐕</span>
<span style="flex-grow:1;min-width:0;font-size:16px;line-height:1.55;color:#3C4C42">Chceme Vás také upozornit, že tady máme psa.</span>
</div>`
    : `<h1 style="margin:0 0 8px;font-family:'Raleway',sans-serif;font-weight:700;font-size:28px;line-height:1.2">Jak se dnes cítíte?</h1>
<p style="margin:0;font-size:16px;line-height:1.65;color:#3C4C42">Děkuji za účast a jsem rád, že jsme domluvili pokračování.</p>

${v.odpovedPoslana
  ? `<div style="margin-top:22px;border-left:3px solid #2D7D5A;background:#F6F8F6;border-radius:10px;padding:14px 16px;font-size:15px;line-height:1.6;color:#3C4C42">Děkuji, přečtu si to.</div>`
  : `<form method="post" style="margin-top:22px;border:1px solid #DCE3DD;border-radius:18px;padding:18px">
<div style="font-size:15.5px;line-height:1.6;color:#3C4C42">Napište mi pár slov — co Vás překvapilo, co bolí, na co se ptáte. Nemusíte psát nic.</div>
<textarea name="odpoved" rows="4" maxlength="1000" placeholder="pár slov stačí…" style="width:100%;box-sizing:border-box;margin-top:12px;padding:13px 14px;border:1px solid #DCE3DD;border-radius:12px;font-family:inherit;font-size:15px;color:#1A2E24;line-height:1.6;resize:vertical"></textarea>
<div style="margin-top:12px"><button type="submit" style="border:0;background:#1A2E24;color:#FFFFFF;border-radius:32px;padding:13px 26px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer">Odeslat ${esc(tr.krstne)}</button></div>
<div style="font-size:13px;color:#5B6B60;margin-top:11px;line-height:1.55">Přijde to rovnou ${esc(tr.krstne)}, nikam jinam.</div>
</form>`}

<h2 style="margin:28px 0 7px;font-family:'Raleway',sans-serif;font-weight:700;font-size:19px">Souhrn z dnešní lekce</h2>
<p style="margin:0;font-size:16px;line-height:1.65;color:#3C4C42">Všechno, co jsem Vám dnes říkal, je sepsané tady.</p>
${riadokOdkazu(ODKAZY.poUvodnej, "Informace po úvodní lekci", "souhrn z dnešního tréninku")}

<h2 style="margin:28px 0 7px;font-family:'Raleway',sans-serif;font-weight:700;font-size:19px">K lepšímu pochopení</h2>
<p style="margin:0;font-size:16px;line-height:1.65;color:#3C4C42">Dvě věci k naší spolupráci. Dají se přečíst i poslechnout.</p>
${riadokOdkazu(ODKAZY.coOcekavat, "Co očekávat od biomechanického tréninku", "číst i poslechnout")}
${riadokOdkazu(ODKAZY.idealniPristup, "Ideální přístup", "číst i poslechnout")}`;

  const zaver = predUvodnym
    ? `<p style="margin:20px 0 0;font-size:16px;line-height:1.65;color:#3C4C42">Pokud budete mít jakékoli dotazy, napište mi kdykoliv.</p>
<p style="margin:18px 0 0;font-family:'Raleway',sans-serif;font-weight:700;font-size:22px;line-height:1.35">Děkuji a těším se na setkání!</p>`
    : `<p style="margin:20px 0 0;font-size:16px;line-height:1.65;color:#3C4C42">V případě otázek mě neváhejte kontaktovat.</p>
<p style="margin:18px 0 0;font-family:'Raleway',sans-serif;font-weight:700;font-size:22px;line-height:1.35">Těším se na další trénink!</p>`;

  return `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${predUvodnym ? "Váš úvodní trénink" : "Po úvodní lekci"} — ProSapiens Biomechanic</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Raleway:wght@600;700&display=swap">
<style>
body{margin:0;background:#FFFFFF}
a{color:#2D7D5A}
a:hover{color:#1A2E24}
</style>
</head>
<body>
<div style="max-width:560px;margin:0 auto;box-sizing:border-box;font-family:'Open Sans',sans-serif;color:#1A2E24;background:#FFFFFF">

<div style="background:#1A2E24;color:#FFFFFF;padding:26px 24px 30px">
<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:13px;letter-spacing:3.6px;color:#9FBCA9">PROSAPIENS BIOMECHANIC</div>
${hlavicka}
${cenaDlzka}
</div>

<!-- Jeden oblúk, nič viac: zelená plocha končí, biela na ňu nasadá. -->
<div style="height:26px;background:#1A2E24"><div style="height:26px;background:#FFFFFF;border-radius:26px 26px 0 0"></div></div>

<div style="padding:6px 24px 48px">
${telo}

<div style="margin-top:34px;display:flex;flex-direction:column;gap:11px">
<a href="${esc(smsHref)}" style="display:block;text-align:center;text-decoration:none;background:#2D7D5A;color:#FFFFFF;font-size:17px;font-weight:600;padding:19px 24px;border-radius:32px">Potvrdit termín</a>
<a href="tel:${esc(tel)}" style="display:block;text-align:center;text-decoration:none;border:2px solid #1A2E24;color:#1A2E24;font-size:17px;font-weight:600;padding:17px 24px;border-radius:32px">Zavolat ${esc(tr.krstne === "Filip" ? "Jerrymu" : tr.krstne)}</a>
</div>

<div style="margin-top:36px;padding-top:26px;border-top:1px solid #DCE3DD">
<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:26px;line-height:1.2">${esc(tr.krstne === "Filip" ? "Filip Stráňavský" : tr.formalne)}</div>
<div style="font-size:16px;color:#5B6B60;margin-top:4px">${esc(t === "Jerry" ? "Jerry · váš trenér" : "váš trenér")}</div>
<div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:10px">
<a href="${esc(ODKAZY.profil)}" style="display:inline-block;text-decoration:none;border:1px solid #DCE3DD;border-radius:32px;padding:11px 20px;font-size:15px;font-weight:600;color:#1A2E24">Profil trenéra</a>
<a href="tel:${esc(tel)}" style="display:inline-block;text-decoration:none;border:1px solid #DCE3DD;border-radius:32px;padding:11px 20px;font-size:15px;font-weight:600;color:#1A2E24">${esc(tr.telefon)}</a>
</div>
${zaver}
</div>

<div style="margin-top:42px;padding-top:30px;border-top:1px solid #DCE3DD;text-align:center">
<img src="${esc(v.logoUrl)}" alt="ProSapiens Biomechanic" style="width:200px;max-width:72%;height:auto">
</div>
</div>

</div>
</body></html>`;
}
