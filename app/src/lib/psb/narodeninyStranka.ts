import { DODAVATEL } from "./vydanaFaktura";
import { krstneMeno, zastupcaKlienta } from "./narodeniny";

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Stránka za odkazom `/v/na…`. Bez skriptu, otvára sa z SMS. Uložený dátum sa
 * neukazuje: odkaz sa dá preposlať a dátum narodenia je osobný údaj.
 */
export function narodeninyStranka(v: { klient: string; dnes: string; stav: "otazka" | "hotovo" | "uzMame" | "chyba" }): string {
  const dieta = zastupcaKlienta(v.klient) ? krstneMeno(v.klient) : "";
  const telo = v.stav === "hotovo" ? `<h1>Díky, máme to.</h1><p>Datum narození jsme si zapsali. Víc nic není potřeba.</p>`
    : v.stav === "uzMame" ? `<h1>Tohle už máme.</h1><p>Datum narození už v evidenci je, není potřeba nic vyplňovat. Díky.</p>`
      : `<h1>Datum narození</h1>
<p>${dieta ? `Doplňujeme si evidenci. Vyplň prosím datum narození: <b>${esc(dieta)}</b>.` : "Doplňujeme si evidenci. Vyplň prosím své datum narození."}</p>
${v.stav === "chyba" ? `<p class="chyba">Tohle datum nesedí, zkontroluj ho prosím.</p>` : ""}
<form method="post">
<label for="narodeniny">Datum narození</label>
<input id="narodeniny" type="date" name="narodeniny" required min="1920-01-01" max="${esc(v.dnes)}" autocomplete="bday">
<button type="submit">Uložit</button>
</form>`;
  return `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Datum narození — ProSapiens Biomechanic</title>
<style>
body{margin:0;background:#fff;color:#1A2E24;font-family:'Open Sans',Arial,sans-serif}
.obal{max-width:460px;margin:0 auto;padding:30px 22px 40px}
.znacka{font-size:13px;font-weight:700;color:#2D7D5A}
h1{font-size:28px;line-height:1.15;margin:20px 0 10px}
p{margin:0 0 14px;font-size:15px;line-height:1.55;color:#5b6b63}
p b{color:#1A2E24}
.chyba{color:#b4472f}
label{display:block;font-size:13px;font-weight:600;margin:18px 0 6px}
input{display:block;width:100%;box-sizing:border-box;padding:14px;border:2px solid #d5e4dc;border-radius:16px;font:16px Arial,sans-serif;background:#fff;color:#1A2E24;min-height:52px}
button{display:block;width:100%;margin-top:16px;padding:16px;border:0;border-radius:32px;background:#2D7D5A;color:#fff;font:700 16px Arial,sans-serif;cursor:pointer}
.mala{margin-top:26px;font-size:13px;color:#7c8a83}
</style></head><body><div class="obal">
<div class="znacka">ProSapiens Biomechanic</div>
${telo}
<div class="mala">Dotaz? ${esc(DODAVATEL.telefon)}</div>
</div></body></html>`;
}
