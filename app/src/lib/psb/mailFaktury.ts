import { FARBY_MAILU as FM, czk } from "./mailKlientovi";
import { DODAVATEL, den, suma, type Faktura } from "./vydanaFaktura";

/**
 * TEXT MAILU, KTORÝM ODCHÁDZA FAKTÚRA.
 *
 * Tón je odpozeraný z toho, ako Jerry píše z `info@prosapiens.cz`: klientom
 * TYKÁ („Ahoj Filip, … máme pro tebe něco navíc"), firmám nie. Predvolí sa
 * podľa toho, či je odberateľ firma — ale rozhodnutie zostáva na človeku,
 * lebo appka nevie, s kým si Jerry ako píše (Jerry, 26. 9. 2026: „daj mi
 * možnosť výberu tykanie aj vykanie").
 *
 * PODPIS PATRÍ TRÉNEROVI KLIENTA. „Niektorí klienti patria Terezke a niektorí
 * mne" — faktúra podpísaná cudzím menom je drobnosť, ktorá klienta zmätie.
 *
 * Jazyk je čeština: klienti sú Česi a Jerryho vlastné maily aj faktúry sú
 * české, aj keď v chate hovorí po slovensky.
 */

/**
 * Podpisy trénerov. Telefóny sú tie, ktoré naozaj používajú — Jerryho je
 * na faktúre, Terezkin v pätke jej mailov z info@.
 *
 * Terezkino priezvisko appka nikde nemá, preto sa pri formálnom podpise
 * uvádza krstným menom. Keď ho Jerry doplní, patrí SEM.
 */
export const TRENERI: Record<string, { krstne: string; formalne: string; telefon: string }> = {
  Jerry: { krstne: "Filip", formalne: DODAVATEL.meno, telefon: DODAVATEL.telefon },
  Terezka: { krstne: "Terezka", formalne: "Terezka", telefon: "+420 702 147 704" },
};

/** Krstné meno na oslovenie. Pri „Ing. arch. Anna Nová" je to Anna. */
export function krstne(meno: string): string {
  const kusy = meno.trim().split(/\s+/).filter((k) => !k.endsWith(".") && k.length > 1);
  return kusy[0] || meno.trim().split(/\s+/)[0] || "";
}

export type VolbyMailu = {
  /** „Jerry" | „Terezka"; čokoľvek iné sa berie ako Jerry. */
  trener?: string;
  /** Vykanie. Nezadané = podľa toho, či je odberateľ firma. */
  vykanie?: boolean;
};

export type MailFaktury = { predmet: string; telo: string; firme: boolean; vykanie: boolean };

export function mailFaktury(f: Faktura, volby: VolbyMailu = {}): MailFaktury {
  // Firma = odberateľ sa volá inak než človek, ktorý cvičí. Vtedy doklad
  // otvára účtovníčka, nie klient, a tykanie by bolo mimo.
  const firme = !!f.odberatel.firma && f.odberatel.firma !== f.klient;
  const vykanie = volby.vykanie ?? firme;
  const t = TRENERI[volby.trener || "Jerry"] || TRENERI.Jerry;
  const ciastka = `${suma(f.celkom)} Kč`;
  const podpis = [
    vykanie ? t.formalne : t.krstne,
    "ProSapiens Biomechanic",
    `${DODAVATEL.web} · ${t.telefon}`,
  ].join("\n");

  const telo = vykanie
    ? [
      "Dobrý den,",
      "",
      `posílám fakturu č. ${f.cislo} na ${ciastka} se splatností ${den(f.splatnost)} za ${f.popis}.`,
      "",
      "V příloze je PDF s QR platbou — po načtení v mobilním bankovnictví se částka",
      "i variabilní symbol předvyplní.",
      "",
      "Kdyby cokoliv nesedělo, stačí odpovědět na tento e-mail.",
      "",
      "S pozdravem",
      podpis,
    ].join("\n")
    : [
      `Ahoj ${krstne(f.klient)},`,
      "",
      `posílám fakturu č. ${f.cislo} na ${ciastka} se splatností ${den(f.splatnost)}.`,
      "",
      "V příloze je PDF a je na něm QR platba — stačí ho načíst v mobilním bankovnictví",
      "a částka i variabilní symbol se vyplní samy.",
      "",
      "Kdyby něco nesedělo, stačí odpovědět na tenhle mail.",
      "",
      "Díky!",
      podpis,
    ].join("\n");

  return { predmet: `Faktura ${f.cislo} — ProSapiens Biomechanic`, telo, firme, vykanie };
}

/** Ako sa bude volať priložený súbor. */
export const menoPrilohy = (cislo: string) => `Faktura ${cislo}.pdf`;

/**
 * HTML PODOBA MAILU S FAKTÚROU — NÁVRH 1, „RODINA“.
 *
 * Jerry si 29. 9. 2026 vybral z piatich návrhov ten v šate výpisového mailu:
 * „vyhráva 1, nech sú rovnaké." Preto tu nie je vlastná paleta ani vlastný
 * skelet — farby sú `FARBY_MAILU` z mailKlientovi a stavba je tá istá:
 * značka, nadpis, tri dlaždice, svetlý blok platby s QR, podpis.
 *
 * ČO TU ZÁMERNE NIE JE: rozpis dodávateľa a odberateľa. Ten nesie PDF
 * v prílohe — mail je list, doklad je doklad. QR v maili je ten istý SPAYD
 * ako na faktúre (suma, VS, splatnosť), takže klient zaplatí z náhľadu
 * mailu bez otvárania prílohy.
 *
 * Text/plain podobu skladá `mailFaktury` — tá zostáva pre staré čítačky
 * a ako telo, ktoré vidí Jerry pred odoslaním.
 */
const escH = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 2026-10-11 → „11. 10. 2026“ (v dlaždici bez roka: „11. 10.“). */
const denCz = (iso: string, sRokom = true): string => {
  const [r, m, d] = String(iso || "").slice(0, 10).split("-");
  return r && m && d ? `${Number(d)}. ${Number(m)}.${sRokom ? ` ${r}` : ""}` : String(iso);
};

export type VolbyHtmlMailu = VolbyMailu & {
  /** Osobná veta na začiatok; prázdna = predvolená podľa oslovenia. */
  uvod?: string;
  qrCid?: string;
  logoCid?: string;
};

export function mailFakturyHtml(f: Faktura, volby: VolbyHtmlMailu = {}): string {
  const firme = !!f.odberatel.firma && f.odberatel.firma !== f.klient;
  const vykanie = volby.vykanie ?? firme;
  const t = TRENERI[volby.trener || "Jerry"] || TRENERI.Jerry;

  // Oslovenie ako v textovom maili: tykanie krstným menom, vykanie bez mena.
  const oslovenie = vykanie ? "Dobrý den" : krstne(f.klient);
  const uvod = volby.uvod?.trim() || (vykanie
    ? `posílám fakturu č. ${f.cislo} — PDF je v příloze a platbu předvyplní QR kód níže.`
    : "posílám fakturu — PDF je v příloze a zaplatit můžeš rovnou přes QR níž.");

  const dlazdice: [string, string][] = [
    [czk(f.celkom), "celkem"],
    [denCz(f.splatnost, false), "splatnost"],
    [f.cislo, "variabilní symbol"],
  ];

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${FM.pozadie}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${FM.pozadie}">
<tr><td align="center" style="padding:30px 14px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">

  <tr><td align="center" style="padding-bottom:24px">
    ${volby.logoCid
    ? `<img src="cid:${escH(volby.logoCid)}" width="200" alt="ProSapiens Biomechanic" style="display:block;border:0">`
    : `<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${FM.slaba}">ProSapiens Biomechanic</div>`}
  </td></tr>

  <tr><td style="text-align:center;font-size:32px;font-weight:700;color:${FM.biela};line-height:1.15;padding-bottom:8px">Faktura</td></tr>
  <tr><td style="text-align:center;font-size:15px;color:${FM.slaba};line-height:1.6;padding-bottom:24px">
    ${escH(oslovenie)}, ${escH(uvod)}
  </td></tr>

  <tr><td style="padding-bottom:20px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      ${dlazdice.map(([cislo, popis], i) => `${i ? '<td width="10"></td>' : ""}<td width="33%" style="padding:16px 8px;background:${FM.karta};border-radius:12px;text-align:center">
        <div style="font-size:21px;font-weight:700;color:${FM.biela};line-height:1.1;white-space:nowrap">${escH(cislo)}</div>
        <div style="font-size:11px;color:${FM.slaba};margin-top:5px;line-height:1.4">${escH(popis)}</div>
      </td>`).join("")}
    </tr></table>
  </td></tr>

  <tr><td>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${FM.platba};border-radius:14px">
      <tr>
        <td style="padding:20px 22px;font-size:14px;color:${FM.platbaText};line-height:1.7">
          ${escH(f.popis)}${f.ks > 1 ? ` · ${f.ks} ks` : ""}<br><b style="font-size:24px">${czk(f.celkom)}</b><br>
          <span style="color:${FM.platbaSlaba}">Účet ${escH(DODAVATEL.ucet)}<br>VS ${escH(f.cislo)} · splatnost ${escH(denCz(f.splatnost))}</span>
        </td>
        ${volby.qrCid ? `<td width="128" style="padding:20px 22px 20px 0;text-align:right">
          <img src="cid:${escH(volby.qrCid)}" width="110" height="110" alt="QR platba" style="display:block;background:#fff;padding:5px;border-radius:8px;margin-left:auto;border:0">
        </td>` : ""}
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:14px 4px 0;font-size:12px;color:${FM.slabsia}">V příloze: ${escH(menoPrilohy(f.cislo))} — stejná QR platba je i na dokladu.</td></tr>
  <tr><td style="padding:22px 4px 0;font-size:15px;color:${FM.biela}">${escH(vykanie ? t.formalne : t.krstne)}</td></tr>
  <tr><td style="padding:6px 4px 0;font-size:11.5px;color:${FM.slabsia}">ProSapiens Biomechanic · ${escH(DODAVATEL.web)} · ${escH(t.telefon)}</td></tr>

</table>
</td></tr></table>
</body></html>`;
}
