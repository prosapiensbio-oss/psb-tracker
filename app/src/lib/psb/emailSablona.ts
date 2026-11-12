/**
 * ODPOVEĎ Z KARTY EMAIL — návrh A „Svetlý list ako web“ (Jerry, 12. 11. 2026:
 * „vyhráva A“, `navrhy-kokpitu/email-dizajn.html`).
 *
 * Biely mail, tenký tmavozelený pás s logom, text, podpis s okrúhlou fotkou
 * toho, kto odpisuje, pôvodná správa ako citát, svetlá pätička so štúdiom.
 * Tabuľky a inline štýly — Outlook ani Gmail iné nepoznajú; obrázky idú ako
 * prílohy s `cid:` (dátovú adresu Gmail zahodí). Písmo Arial: Agrandir
 * čítačky mailov nemajú.
 */

export type Podpisujuci = { meno: string; rola: string; telefon: string; foto: string };

export const PODPISUJUCI: Record<string, Podpisujuci> = {
  "Terézia Zaťková": { meno: "Terézia Zaťková", rola: "trenérka", telefon: "+420 702 147 704", foto: "/mail/terezia.jpg" },
  "Filip Stráňavský": { meno: "Filip Stráňavský", rola: "trenér", telefon: "+420 702 090 289", foto: "/mail/filip.jpg" },
};
export const PREDVOLENY_PODPIS = "Terézia Zaťková";

const Z = { tmava: "#1A2E24", akcent: "#2D7D5A", slaba: "#5d6b60", linka: "#e3e8e1", patka: "#f3f5f1", citat: "#7a857c" } as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Text bez podpisu na konci — v HTML ho nahrádza blok s fotkou, inak by
 * meno stálo pod sebou dvakrát. „S pozdravem“ ostáva, to je veta, nie podpis.
 */
export function bezPodpisu(text: string, meno: string): string {
  const riadky = text.replace(/\r\n/g, "\n").split("\n");
  const prec = new Set([meno.toLowerCase(), "prosapiens biomechanic"]);
  while (riadky.length && (riadky[riadky.length - 1].trim() === "" || prec.has(riadky[riadky.length - 1].trim().toLowerCase()))) riadky.pop();
  return riadky.join("\n");
}

/** Odseky z obyčajného textu: prázdny riadok = nový odsek, riadok = <br>. */
function odseky(text: string): string {
  return text.trim().split(/\n{2,}/).map((o) => `<p style="margin:0 0 12px">${esc(o.trim()).replace(/\n/g, "<br>")}</p>`).join("");
}

export function odpovedHtml(v: {
  text: string; podpis: string; citatHlavicka?: string; citat?: string; logoCid?: string; fotoCid?: string;
}): string {
  const p = PODPISUJUCI[v.podpis] || PODPISUJUCI[PREDVOLENY_PODPIS];
  const telo = odseky(bezPodpisu(v.text, p.meno));
  const tel = p.telefon.replace(/[^\d+]/g, "");
  const logo = v.logoCid
    ? `<img src="cid:${v.logoCid}" alt="ProSapiens Biomechanic" height="22" style="height:22px;display:block;border:0">`
    : `<span style="color:#ffffff;font-size:15px;letter-spacing:2px">PROSAPIENS BIOMECHANIC</span>`;
  const foto = v.fotoCid
    ? `<td style="padding-right:14px;vertical-align:middle"><img src="cid:${v.fotoCid}" alt="" width="64" height="64" style="border-radius:50%;display:block;border:0"></td>`
    : "";
  const citat = v.citat
    ? `<div style="border-left:3px solid #d5dbd2;padding-left:10px;color:${Z.citat};font-size:13px;line-height:1.5;margin-top:18px">${v.citatHlavicka ? `${esc(v.citatHlavicka)}<br>` : ""}${esc(v.citat.trim().slice(0, 6000)).replace(/\n/g, "<br>")}</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:16px 8px;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="border-collapse:separate;max-width:600px;width:100%;border:1px solid ${Z.linka};border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${Z.tmava}">
<tr><td style="background:${Z.tmava};padding:16px 24px">${logo}</td></tr>
<tr><td style="padding:24px 24px 8px">
${telo}
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px"><tr>
${foto}<td style="vertical-align:middle;line-height:1.35">
<b style="font-size:15px">${esc(p.meno)}</b><br>
<span style="color:${Z.slaba};font-size:13px">${esc(p.rola)} · ProSapiens Biomechanic</span><br>
<a href="tel:${tel}" style="color:${Z.akcent};font-size:13px;text-decoration:none">${esc(p.telefon)}</a>
</td></tr></table>
${citat}
</td></tr>
<tr><td style="background:${Z.patka};padding:14px 24px;font-size:12px;color:${Z.slaba};line-height:1.5">
<b style="color:${Z.tmava}">Studio ProSapiens Biomechanic</b> · Fanderlíkova 70, Brno-Žabovřesky<br>
Po–Pá 7:00–20:00 · Ne 8:00–14:00 · <a href="https://prosapiens.cz" style="color:${Z.akcent}">prosapiens.cz</a> · <a href="https://www.instagram.com/prosapiens.biomechanic/" style="color:${Z.akcent}">Instagram</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
