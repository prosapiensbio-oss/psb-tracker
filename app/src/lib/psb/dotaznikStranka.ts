/**
 * STRÁNKA ANONYMNÉHO DOTAZNÍKA — `/d/<token>` (9. 10. 2026).
 *
 * Tá istá sadzba ako stránka klienta `/v/` (tmavozelená, Raleway + Open Sans),
 * lebo klient ju otvára z tej istej SMS brány. Bez JavaScriptu: klepnutie
 * na číslo je vidno cez `:checked + span`, formulár sa odošle obyčajným POST.
 * Všetko je nepovinné — prázdny dotazník sa len neuloží.
 */
import { OTAZKY, type OtazkaDotazniku } from "./dotaznik";
import { SADZBA } from "./klientStranka";
import { DODAVATEL } from "./vydanaFaktura";

const esc = (s: string) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const s = SADZBA;

function obal(obsah: string, logoUrl?: string): string {
  return `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Dotazník — ProSapiens Biomechanic</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Raleway:wght@600;700;800&display=swap">
<style>
body{margin:0;background:${s.pozadie};color:${s.text};font-family:'Open Sans',Arial,sans-serif}
.psb-volba input{position:absolute;opacity:0;width:1px;height:1px}
.psb-volba span{display:inline-block;min-width:34px;padding:9px 0;border:1px solid ${s.ramik};border-radius:10px;text-align:center;font-size:15px;color:${s.text};background:${s.plocha};cursor:pointer}
.psb-volba input:checked + span{background:${s.zelena};border-color:${s.zelena};color:${s.pozadie};font-weight:700}
.psb-volba input:focus-visible + span{outline:2px solid ${s.zelena};outline-offset:2px}
.psb-cip span{min-width:0;padding:9px 13px;text-align:left}
textarea{width:100%;box-sizing:border-box;min-height:84px;padding:11px 12px;border:1px solid ${s.ramik};border-radius:10px;background:${s.plocha};color:${s.text};font-family:inherit;font-size:15px;line-height:1.5}
</style>
</head><body>
<div style="max-width:520px;margin:0 auto;padding:28px 18px 48px">
${logoUrl ? `<img src="${esc(logoUrl)}" alt="ProSapiens Biomechanic" width="200" style="width:200px;max-width:62%;height:auto;display:block;margin-bottom:24px">` : `<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:12px;letter-spacing:3.4px;color:${s.tlmeny};margin-bottom:24px">PROSAPIENS BIOMECHANIC</div>`}
${obsah}
<div style="margin-top:34px;font-size:12px;color:${s.tlmeny}">ProSapiens Biomechanic · ${esc(DODAVATEL.telefon)}</div>
</div></body></html>`;
}

function otazka(q: OtazkaDotazniku, i: number): string {
  const nadpis = `<div style="font-family:'Raleway',sans-serif;font-weight:700;font-size:17px;line-height:1.35;color:${s.biela}">${i + 1}. ${esc(q.text)}${q.druh === "text" && q.nepovinne ? ` <span style="font-weight:600;font-size:13px;color:${s.tlmeny}">(nepovinné)</span>` : ""}</div>`;
  if (q.druh === "skala") {
    const n = q.do - q.od + 1;
    const volby = Array.from({ length: n }, (_, k) => q.od + k)
      .map((v) => `<label class="psb-volba" style="flex:1 1 0;min-width:0"><input type="radio" name="${q.id}" value="${v}"><span style="width:100%;min-width:0">${v}</span></label>`)
      .join("");
    return `${nadpis}
<div style="display:flex;gap:${n > 6 ? 4 : 8}px;margin-top:12px">${volby}</div>
<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:${s.tlmeny}"><span>${esc(q.vlavo)}</span><span>${esc(q.vpravo)}</span></div>`;
  }
  if (q.druh === "vyber") {
    const volby = q.moznosti
      .map((m) => `<label class="psb-volba psb-cip"><input type="checkbox" name="${q.id}" value="${m.id}"><span>${esc(m.text)}</span></label>`)
      .join("");
    return `${nadpis}
<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">${volby}</div>`;
  }
  return `${nadpis}
<textarea name="${q.id}" maxlength="1000" style="margin-top:12px"></textarea>
<div style="margin-top:6px;font-size:12px;line-height:1.5;color:${s.tlmeny}">Když popíšete konkrétní příhodu nebo den, můžeme poznat, o koho jde. Pokud chcete zůstat v anonymitě, pište obecně.</div>`;
}

/** Formulár dotazníka. */
export function dotaznikStranka(v: { logoUrl?: string; chyba?: string; nahlad?: boolean }): string {
  const otazky = OTAZKY.map((q, i) => `<div style="margin-top:30px">${otazka(q, i)}</div>`).join("\n");
  const pruh = v.nahlad
    ? `<div style="margin-bottom:18px;padding:10px 14px;border-radius:12px;background:${s.zelena};color:${s.pozadie};font-size:13px;font-weight:600">Náhľad pre Kokpit — takto stránku uvidí klient. Odoslanie odtiaľto nič neuloží.</div>`
    : "";
  return obal(`${pruh}<div style="font-size:11px;letter-spacing:2.4px;text-transform:uppercase;color:${s.tlmeny}">Krátký dotazník · 2 minuty</div>
<h1 style="margin:8px 0 0;font-family:'Raleway',sans-serif;font-weight:800;font-size:28px;line-height:1.15;color:${s.biela}">Jak se vám u nás trénuje?</h1>
<div style="margin-top:14px;padding:14px 16px;border-radius:14px;background:${s.plocha};font-size:14px;line-height:1.6">
Dotazník je <b>anonymní</b>. Odkaz je osobní jen proto, aby se dalo odpovědět jednou — odpovědi ukládáme odděleně a nevíme, kdo co napsal. Výsledky uvidíme až souhrnně, když odpoví aspoň pět lidí. Žádná otázka není povinná.
</div>
${v.chyba ? `<div style="margin-top:16px;font-size:14px;color:${s.zelena}">${esc(v.chyba)}</div>` : ""}
<form method="post" style="margin:0">
${otazky}
<button type="submit" style="margin-top:34px;width:100%;padding:15px 18px;border:none;border-radius:999px;background:${s.zelena};color:${s.pozadie};font-family:'Raleway',sans-serif;font-weight:800;font-size:16px;cursor:pointer">Odeslat</button>
</form>`, v.logoUrl);
}

/** Po odoslaní, alebo keď už odkaz bol použitý. */
export function dotaznikHotovo(v: { logoUrl?: string; uzPredtym?: boolean }): string {
  return obal(`<h1 style="margin:40px 0 0;font-family:'Raleway',sans-serif;font-weight:800;font-size:28px;line-height:1.2;color:${s.biela}">Děkujeme!</h1>
<div style="margin-top:14px;font-size:15px;line-height:1.6">${v.uzPredtym
    ? "Z tohoto odkazu už odpověď přišla. Každý odkaz jde použít jen jednou — právě proto, aby byl dotazník anonymní a zároveň férový."
    : "Vaše odpovědi jsme uložili — bez jména a bez vazby na odkaz. Moc nám pomůžou."}</div>`, v.logoUrl);
}

/** Neplatný alebo uzavretý odkaz. */
export function dotaznikNeplati(v: { logoUrl?: string; uzavrete?: boolean }): string {
  return obal(`<div style="margin-top:40px;font-size:15px;line-height:1.6">${v.uzavrete
    ? "Tento dotazník už je uzavřený. Děkujeme za zájem!"
    : "Tento odkaz neplatí."}</div>`, v.logoUrl);
}
