/**
 * Stránky za odkazom z mailu: odhlásenie a potvrdenie darčeka. Český text, žiadna
 * ponuka navyše: kto sa odhlasuje, chce sa odhlásiť.
 */
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ram = (titulok: string, vnutro: string, skript = "") => `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulok)}</title><style>@font-face{font-family:Agrandir;src:url(/agrandir.woff2) format("woff2");font-weight:100 900}*{box-sizing:border-box}body{margin:0;background:#E9E5D8;color:#1A2E24;font:16px/1.6 'Open Sans',Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}main{background:#F6F3EA;border-radius:18px;max-width:480px;width:100%;padding:32px 28px}h1{font:700 28px/1.15 Agrandir,Arial,sans-serif;margin:0 0 12px}p{margin:0 0 16px}button,.tl{display:inline-block;background:#2D7D5A;color:#fff;border:0;border-radius:32px;padding:14px 24px;font:700 15px/1 'Open Sans',Arial,sans-serif;text-decoration:none;cursor:pointer}.druhe{background:none;color:#2D7D5A;padding:0;font-weight:600;text-decoration:underline}.mala{font-size:13px;color:#5B6B60;margin:18px 0 0}</style></head><body><main>${vnutro}</main>${skript}</body></html>`;

export const strankaNeplati = () =>
  ram("Odkaz neplatí", `<h1>Tento odkaz už neplatí.</h1><p>Pokud chceš něco změnit, napiš na <a href="mailto:info@prosapiens.cz">info@prosapiens.cz</a>.</p>`);

/**
 * Odhlásenie jedným klikom. Odkaz samotný nič nezapíše, lebo poštové filtre si
 * odkazy otvárajú samy a odhlásili by človeka bez jeho vedomia. Zapíše to až skript
 * v stránke, ktorý filter nespúšťa; bez skriptu ostáva tlačidlo.
 */
export const strankaOdhlasit = (token: string) => ram("Odhlášení",
  `<h1>Odhlašujeme tě…</h1><form method="post" id="f"><input type="hidden" name="akcia" value="odhlasit"><noscript><p>Potvrď to prosím tlačítkem.</p></noscript><button>Odhlásit se</button></form>`,
  `<script>document.getElementById('f').submit()</script>`);

export const strankaOdhlaseny = (skuska: boolean) => ram("Odhlášeno",
  `<h1>Hotovo, odhlášeno.</h1><p>${skuska ? "Tohle byl zkušební e-mail, takže se nic nezapsalo." : "Další hromadné e-maily ti nepošleme. Faktury a zprávy k tréninku chodí dál, pokud k nám chodíš."}</p>${skuska ? "" : `<form method="post"><input type="hidden" name="akcia" value="spat"><button class="druhe">Omyl? Přihlásit zpět</button></form>`}`);

export const strankaSpat = () => ram("Přihlášeno zpět", `<h1>Přihlášeno zpět.</h1><p>Díky, zase se ozveme.</p>`);

export const strankaPotvrdit = (darcek: string) => ram("Potvrzení odběru",
  `<h1>Ještě jeden klik.</h1><p>Potvrď, že chceš dostávat e-maily od ProSapiens Biomechanic${darcek ? `, a stáhni si ${esc(darcek)}` : ""}.</p><form method="post"><input type="hidden" name="akcia" value="potvrdit"><button>${darcek ? "Potvrdit a stáhnout dárek" : "Potvrdit odběr"}</button></form><p class="mala">Odhlásit se můžeš jedním klikem v každém e-mailu.</p>`);

export const strankaPotvrdene = (darcek: string, url: string) => ram("Hotovo",
  `<h1>Díky, je to potvrzené.</h1>${darcek && url ? `<p>Tady je tvůj dárek:</p><p><a class="tl" href="${esc(url)}">Stáhnout ${esc(darcek)}</a></p>` : `<p>Zase se ozveme, až bude o čem.</p>`}<p class="mala">Odhlásit se můžeš jedním klikem v každém e-mailu.</p>`);
