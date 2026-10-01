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

export const SADZBA = {
  text: "#1A2E24",
  tlmeny: "#5B6B60",
  jemny: "#3C4C42",
  ramik: "#DCE3DD",
  zelena: "#2D7D5A",
  plocha: "#F6F8F6",
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
  if (v.zostatok === 0) return { velke: "Balíček máš dochozený", pod: "poslední hodina je vyčerpaná" };
  return { velke: `${hod(-v.zostatok)} nad rámec`, pod: "odtrénováno nad zaplacený balíček" };
}

function blokPlatby(v: VypisKlienta, qrUrl?: string): string {
  if (!v.platba || v.platba.suma <= 0) return "";
  const s = SADZBA;
  const qr = qrUrl
    ? `<div style="margin-top:14px;text-align:center">
<img src="${esc(qrUrl)}" alt="QR platba" width="190" height="190" style="width:190px;height:190px;display:inline-block;border-radius:10px;background:#FFFFFF">
<div style="margin-top:6px;font-size:12px;color:${s.tlmeny}">Načti QR v bankovní aplikaci</div>
</div>`
    : "";
  return `<div style="margin-top:26px;border:2px solid ${s.zelena};border-radius:18px;padding:18px 18px 20px">
<div style="font-size:12px;letter-spacing:2.2px;color:${s.tlmeny};text-transform:uppercase">K úhradě</div>
<div style="margin-top:6px;font-family:'Raleway',sans-serif;font-weight:700;font-size:34px;line-height:1.1;color:${s.zelena}">${esc(kc(v.platba.suma))}</div>
<div style="margin-top:4px;font-size:15px;color:${s.jemny}">${esc(cesky(v.platba.popis))}</div>
${qr}
<div style="margin-top:14px;font-size:13px;line-height:1.6;color:${s.jemny}">
Účet <b>${esc(v.platba.ucet)}</b><br>
Do zprávy pro příjemce napiš <b>${esc(v.platba.sprava)}</b> — podle toho platbu spárujeme.
</div>
</div>`;
}

/** Os času POSLEDNÉHO balíčka. Celá história chodí mailom na vyžiadanie. */
function blokOsi(v: VypisKlienta): string {
  const s = SADZBA;
  if (!v.os.length) return "";
  const riadky = [...v.os].reverse().map((b) => {
    const jeTrening = b.druh === "trening";
    const vpravo = jeTrening && b.zostatok != null
      ? `<span style="font-weight:700;color:${s.text};white-space:nowrap">${esc(hod(b.zostatok))}</span>`
      : b.dlh ? `<span style="font-weight:700;color:#B4522F;white-space:nowrap">−${b.dlh}</span>` : "";
    const d = new Date(`${b.den}T12:00:00Z`);
    const popis = jeTrening ? "trénink" : cesky(b.popis);
    return `<tr>
<td style="padding:7px 0;border-bottom:1px solid ${s.ramik};vertical-align:top">
<div style="font-size:15px;color:${s.text}">${esc(popis)}</div>
<div style="font-size:12.5px;color:${s.tlmeny}">${esc(DNI[d.getUTCDay()])} ${esc(den(b.den))}${b.cas ? ` · ${esc(b.cas)}` : ""}</div>
</td>
<td style="padding:7px 0;border-bottom:1px solid ${s.ramik};text-align:right;vertical-align:top;font-size:14px">${vpravo}</td>
</tr>`;
  }).join("");
  return `<div style="margin-top:30px">
<div style="font-size:12px;letter-spacing:2.2px;color:${s.tlmeny};text-transform:uppercase">Poslední balíček</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${riadky}</table>
</div>`;
}

/**
 * CTA na celú históriu. Je to `<form>`, nie odkaz: posielanie mailu je
 * zmena, nie čítanie — a odkaz, ktorý niečo odošle, raz odošle aj robot,
 * čo si stránku načíta dopredu.
 */
function blokHistorie(poslane: boolean): string {
  const s = SADZBA;
  if (poslane) {
    return `<div style="margin-top:26px;background:${s.plocha};border-left:3px solid ${s.zelena};border-radius:10px;padding:14px 16px;font-size:15px;line-height:1.55;color:${s.jemny}">
Poslali jsme ti celou historii na e-mail. Kdyby nedorazila, mrkni do spamu.</div>`;
  }
  return `<div style="margin-top:26px;background:${s.plocha};border:1px solid ${s.ramik};border-radius:14px;padding:18px">
<div style="font-size:16px;font-weight:600;color:${s.text}">Chceš celou historii?</div>
<div style="margin-top:4px;font-size:14px;line-height:1.55;color:${s.jemny}">Všechny tréninky i platby od začátku ti pošleme na e-mail.</div>
<form method="post" style="margin-top:12px">
<input type="hidden" name="akcia" value="historia">
<button type="submit" style="background:transparent;border:2px solid ${s.text};color:${s.text};border-radius:32px;padding:12px 24px;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">Poslat na e-mail</button>
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
    : `<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:13px;letter-spacing:3.6px;color:${s.tlmeny}">PROSAPIENS BIOMECHANIC</div>`;

  const dalsi = v.dalsi
    ? `<div style="margin-top:8px;font-size:15px;color:${s.jemny}">Další trénink: <b style="color:${s.text}">${esc(DNI[new Date(`${v.dalsi.slice(0, 10)}T12:00:00Z`).getUTCDay()])} ${esc(den(v.dalsi))}</b>${v.dalsi.length > 10 ? ` · ${esc(v.dalsi.slice(11, 16))}` : ""}</div>`
    : "";

  return `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Tvoje tréninky — ProSapiens Biomechanic</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Raleway:wght@600;700&display=swap">
<style>
body{margin:0;background:#FFFFFF}
a{color:${s.zelena}}
a:hover{color:${s.text}}
</style>
</head>
<body>
<div style="max-width:560px;margin:0 auto;padding:0 22px 48px;box-sizing:border-box;font-family:'Open Sans',sans-serif;color:${s.text};background:#FFFFFF">

<div style="padding:26px 0 20px">${logo}</div>

<h1 style="margin:0;font-family:'Raleway',sans-serif;font-weight:700;font-size:32px;line-height:1.15">${esc(stav.velke)}</h1>
<div style="margin-top:5px;font-size:16px;color:${s.jemny}">${esc(stav.pod)}</div>
${dalsi}

${blokPlatby(v, v.qrUrl)}
${blokOsi(v)}
${blokHistorie(!!v.historiaPoslana)}
${v.pocitovka || ""}

<div style="margin-top:38px;padding-top:24px;border-top:1px solid ${s.ramik}">
<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:22px;line-height:1.2">${esc(v.trener)}</div>
<div style="font-size:15px;color:${s.tlmeny};margin-top:3px">ProSapiens Biomechanic</div>
</div>

</div>
</body></html>`;
}
