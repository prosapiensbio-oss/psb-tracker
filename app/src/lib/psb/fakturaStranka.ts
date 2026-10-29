import { blokPlatby, SADZBA } from "./klientStranka";
import { DODAVATEL, klientiNaDoklade, polozkyFaktury, type Faktura } from "./vydanaFaktura";

/**
 * STRÁNKA FAKTÚRY ZA ODKAZOM Z SMS (`/v/fa…`, Jerry 29. 10. 2026).
 *
 * To isté, čo nesie doklad — číslo, odberateľ, položky, suma, splatnosť,
 * QR s variabilným symbolom — v sadzbe stránky klienta, aby sa dala čítať
 * na telefóne. Doklad sám je za tlačidlom ako PDF.
 *
 * Položky sa ukazujú ako na doklade: kto nemá byť na faktúre menom
 * (`naDoklade`), nie je ani tu — odkaz môže skončiť u účtovníčky firmy.
 * Žiadny JavaScript: otvára sa z SMS.
 */
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ").replace(/\s/g, " ")} Kč`;
const datum = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}`;

export function fakturaStranka(f: Faktura & { qrUrl?: string; logoUrl?: string; pdfUrl: string; dnes: string }): string {
  const s = SADZBA;
  const polozky = polozkyFaktury(f);
  const sMenami = klientiNaDoklade(f).length > 1;
  const stav = f.stornoAt
    ? { velke: "Faktura stornována", pod: "Tuto fakturu neplaťte." }
    : f.uhradeneAt
      ? { velke: "Faktura je uhrazena", pod: `Zaplaceno ${datum(f.uhradeneAt.slice(0, 10))} — děkujeme.` }
      : { velke: kc(f.celkom), pod: `${f.splatnost < f.dnes ? "Po splatnosti od" : "Splatnost"} ${datum(f.splatnost)}` };
  const odb = f.odberatel;
  const odberatel = [odb.firma || f.klient, [odb.ulica, [odb.psc, odb.mesto].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    [odb.ico ? `IČO ${odb.ico}` : "", odb.dic ? `DIČ ${odb.dic}` : ""].filter(Boolean).join(" · ")].filter(Boolean);
  const riadky = polozky.map((p) => `<div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-top:1px solid ${s.ramik}">
<span>${esc(p.popis)}${p.ks !== 1 ? ` · ${esc(String(p.ks).replace(".", ","))}×` : ""}${sMenami && !p.bezMena ? `<span style="display:block;font-size:12.5px;color:${s.tlmeny}">${esc(p.klient)}</span>` : ""}</span>
<b style="white-space:nowrap;color:${s.biela}">${esc(kc(p.celkom))}</b></div>`).join("\n");
  const platba = !f.stornoAt && !f.uhradeneAt
    ? blokPlatby({
      klient: f.klient, oslovenie: "", trener: "", os: [], zostatok: null, hodinSpolu: 0, odkedy: "",
      platba: { popis: `Faktura ${f.cislo}`, suma: f.celkom, ucet: DODAVATEL.ucet, sprava: `Faktura ${f.cislo} PSB`, vs: f.cislo, splatnost: f.splatnost, odpocet: 0, novy: false },
    } as never, f.qrUrl)
    : "";
  const logo = f.logoUrl
    ? `<img src="${esc(f.logoUrl)}" alt="ProSapiens Biomechanic" width="200" style="width:200px;max-width:62%;height:auto;display:block">`
    : `<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:12px;letter-spacing:3.4px;color:${s.tlmeny}">PROSAPIENS BIOMECHANIC</div>`;
  return `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Faktura ${esc(f.cislo)} — ProSapiens Biomechanic</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Raleway:wght@600;700;800&display=swap">
<style>body{margin:0;background:${s.pozadie}}a{color:${s.zelena}}</style>
</head>
<body>
<div style="max-width:560px;margin:0 auto;padding:0 22px 48px;box-sizing:border-box;font-family:'Open Sans',sans-serif;color:${s.text};background:${s.pozadie}">
<div style="padding:26px 0 20px">${logo}</div>
<div style="font-size:12px;letter-spacing:2.4px;text-transform:uppercase;color:${s.tlmeny}">Faktura ${esc(f.cislo)}</div>
<h1 style="margin:6px 0 0;font-family:'Raleway',sans-serif;font-weight:800;font-size:34px;line-height:1.15;color:${s.biela}">${esc(stav.velke)}</h1>
<div style="margin-top:6px;font-size:15px;color:${s.tlmeny}">${esc(stav.pod)}</div>

<a href="${esc(f.pdfUrl)}" style="display:block;margin-top:20px;padding:14px 18px;border-radius:999px;background:${s.zelena};color:${s.pozadie};text-align:center;text-decoration:none;font-weight:700;font-size:15px">Stáhnout fakturu (PDF)</a>

<div style="margin-top:26px;padding:16px 18px;border-radius:18px;background:${s.plocha};font-size:14.5px;line-height:1.55">
<div style="font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${s.tlmeny};margin-bottom:6px">Odběratel</div>
${odberatel.map((x, i) => `<div style="${i ? `color:${s.tlmeny};font-size:13.5px` : `color:${s.biela};font-weight:600`}">${esc(x)}</div>`).join("\n")}
<div style="font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${s.tlmeny};margin:16px 0 2px">Položky</div>
${riadky}
<div style="display:flex;justify-content:space-between;gap:14px;padding:10px 0 0;border-top:1px solid ${s.ramik};font-size:16px"><span>Celkem</span><b style="color:${s.biela}">${esc(kc(f.celkom))}</b></div>
<div style="margin-top:12px;font-size:12.5px;color:${s.tlmeny}">Vystaveno ${esc(datum(f.vystavene))} · ${esc(DODAVATEL.dph)}</div>
</div>

${platba}

<div style="margin-top:38px;padding-top:22px;border-top:1px solid ${s.ramik};font-size:13.5px;line-height:1.6;color:${s.tlmeny}">
<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:18px;color:${s.biela}">${esc(DODAVATEL.meno)}</div>
IČ ${esc(DODAVATEL.ico)} · ${esc(DODAVATEL.ulica)}, ${esc(DODAVATEL.psc)} ${esc(DODAVATEL.mesto)}<br>
${esc(DODAVATEL.telefon)} · ${esc(DODAVATEL.email)}
</div>
</div>
</body></html>`;
}
