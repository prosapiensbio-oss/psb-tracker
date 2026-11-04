import { oslovenieKlienta } from "./oslovenie";

/**
 * VZHĽAD MAILU A — zelená hlavička, krémové telo (Jerry, 4. 11. 2026: „vzhľad A",
 * „dúfam že ten mail nebude text na bielom pozadí").
 *
 * Text sa píše obyčajne, šablónu nikto neupravuje:
 *   Ahoj {oslovení},           {oslovení} doplní meno v 5. páde
 *   **tučné**                  tučné písmo
 *   [text](https://…)          odkaz; ak je sám na riadku, je z neho tlačidlo
 *   > Veta                     zvýraznená veta so zelenou čiarou
 *   ## Nadpis + riadky „- "    zelený box s fajkami
 *   ![popis](https://…)        obrázok
 *
 * Označenie a odhlásenie sú navrchu aj v päte (Jerry, 4. 11. 2026). Všetko je
 * escapované: text mailu sa nedá zneužiť na vloženie HTML.
 */

export const DRUHY_MAILU: Record<string, string> = {
  bolest: "PROČ TĚ TO BOLÍ",
  pribeh: "PŘÍBĚH KLIENTA",
  zaujimavost: "ZAJÍMAVOST Z TĚLA",
  mytus: "MÝTUS",
  novinka: "NOVINKA",
  otazka: "OTÁZKA",
  darcek: "DÁREK",
};

export type VstupMailu = {
  druh: string;
  predmet?: string;
  nadpis: string;
  predhlavicka?: string;
  telo: string;
  meno?: string;
  odhlasitUrl: string;
  /** „kvůli tréninku u nás" — prečo to ten človek dostáva. */
  dovodVMaili?: string;
  /** Základ adresy, z ktorej sa berie logo a písmo. */
  zaklad?: string;
  /** Potvrdzovací mail nie je obchodné oznámenie a nemá odhlásenie. */
  bezOznacenia?: boolean;
  /** Text pod tlačidlom v päte potvrdzovacieho mailu. */
  pataText?: string;
};

const ZAKLAD = "https://kokpit.prosapiensbio.workers.dev";
const SANS = "'Open Sans',Arial,Helvetica,sans-serif";
const HEAD = "Agrandir,'Helvetica Neue',Arial,sans-serif";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const bezpecnaUrl = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : "");

/** „Ahoj {oslovení}," → „Ahoj Martine,"; bez mena „Ahoj,". */
export function dosadOslovenie(text: string, meno?: string): string {
  const o = oslovenieKlienta(meno || "");
  return text
    .replace(/[ \t]*\{osloven[ií]\}/giu, o ? ` ${o}` : "")
    .replace(/^ +/gm, "");
}

const riadok = (s: string): string => {
  let v = esc(s);
  v = v.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  v = v.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t: string, u: string) => {
    const url = bezpecnaUrl(u.replace(/&amp;/g, "&"));
    return url ? `<a href="${esc(url)}" style="color:#2D7D5A;font-weight:700">${t}</a>` : t;
  });
  return v;
};

export type BlokMailu =
  | { typ: "odsek"; riadky: string[] }
  | { typ: "veta"; text: string }
  | { typ: "box"; nadpis: string; polozky: string[] }
  | { typ: "tlacidlo"; text: string; url: string }
  | { typ: "obrazok"; popis: string; url: string };

export function blokyMailu(telo: string): BlokMailu[] {
  const bloky: BlokMailu[] = [];
  for (const kus of String(telo || "").replace(/\r/g, "").split(/\n{2,}/)) {
    const riadky = kus.split("\n").map((r) => r.trim()).filter(Boolean);
    if (!riadky.length) continue;
    const tl = riadky.length === 1 ? /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(riadky[0]) : null;
    if (tl && bezpecnaUrl(tl[2])) { bloky.push({ typ: "tlacidlo", text: tl[1], url: bezpecnaUrl(tl[2]) }); continue; }
    const ob = riadky.length === 1 ? /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(riadky[0]) : null;
    if (ob && bezpecnaUrl(ob[2])) { bloky.push({ typ: "obrazok", popis: ob[1], url: bezpecnaUrl(ob[2]) }); continue; }
    if (riadky.every((r) => r.startsWith(">"))) {
      bloky.push({ typ: "veta", text: riadky.map((r) => r.replace(/^>\s*/, "")).join(" ") });
      continue;
    }
    const polozky = riadky.filter((r) => /^[-–•]\s+/.test(r));
    const hlavicka = riadky.find((r) => r.startsWith("## "));
    if (polozky.length && polozky.length + (hlavicka ? 1 : 0) === riadky.length) {
      bloky.push({
        typ: "box",
        nadpis: hlavicka ? hlavicka.slice(3).trim() : "",
        polozky: polozky.map((r) => r.replace(/^[-–•]\s+/, "")),
      });
      continue;
    }
    bloky.push({ typ: "odsek", riadky });
  }
  return bloky;
}

const blokHtml = (b: BlokMailu): string => {
  switch (b.typ) {
    case "odsek":
      return `<p style="margin:0 0 18px">${b.riadky.map(riadok).join("<br>")}</p>`;
    case "veta":
      return `<div style="border-left:4px solid #2D7D5A;padding:2px 0 2px 16px;font:700 22px/1.25 ${HEAD};margin:0 0 18px">${riadok(b.text)}</div>`;
    case "box":
      return `<div style="background:#E3EADB;border-radius:14px;padding:16px 18px;margin:0 0 20px">${
        b.nadpis ? `<div style="font:700 14px/1.3 ${SANS};color:#2D7D5A;margin-bottom:8px">${riadok(b.nadpis)}</div>` : ""
      }${b.polozky.map((p) => `<div style="padding:4px 0 4px 18px;font-size:15px;line-height:1.5"><span style="color:#2D7D5A;font-weight:700;margin-left:-18px;display:inline-block;width:18px">✓</span>${riadok(p)}</div>`).join("")}</div>`;
    case "tlacidlo":
      return `<div style="margin:0 0 22px"><a href="${esc(b.url)}" style="display:inline-block;background:#2D7D5A;color:#fff;text-decoration:none;font:700 15px/1 ${SANS};padding:15px 26px;border-radius:32px">${esc(b.text)}</a></div>`;
    case "obrazok":
      return `<img src="${esc(b.url)}" alt="${esc(b.popis)}" width="536" style="display:block;width:100%;height:auto;border-radius:12px;margin:0 0 20px">`;
  }
};

export function mailHtml(v: VstupMailu): string {
  const zaklad = v.zaklad || ZAKLAD;
  const logo = `${zaklad}/znacka-napis-mail.png`;
  const kicker = DRUHY_MAILU[v.druh] || "";
  const odhl = esc(v.odhlasitUrl);
  const telo = blokyMailu(dosadOslovenie(v.telo, v.meno)).map(blokHtml).join("");
  const horny = v.bezOznacenia ? "" :
    `<div style="font:12px/1.5 ${SANS};color:#5B6B60;text-align:center;padding:9px 16px">Obchodní sdělení ProSapiens Biomechanic · <a href="${odhl}" style="color:#2D7D5A;font-weight:700">Odhlásit se jedním klikem</a></div>`;
  const pata = v.bezOznacenia
    ? `Mgr. Filip Stráňavský, ProSapiens Biomechanic, Brno<br>${esc(v.pataText || "")}`
    : `Mgr. Filip Stráňavský, ProSapiens Biomechanic, Brno<br>${v.dovodVMaili ? `Tento e-mail dostáváš ${esc(v.dovodVMaili)}. ` : ""}<a href="${odhl}" style="color:#fff;font-weight:700">Odhlásit se jedním klikem</a>`;
  const pred = v.predhlavicka
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(v.predhlavicka)}</div>` : "";
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(v.predmet || v.nadpis)}</title><style>@font-face{font-family:Agrandir;src:url(${zaklad}/agrandir.woff2) format("woff2");font-weight:100 900}body{margin:0}@media(max-width:480px){.h1{font-size:27px!important}.pad{padding-left:20px!important;padding-right:20px!important}}</style></head><body style="margin:0;background:#E9E5D8">${pred}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9E5D8"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td>${horny}<div style="border-radius:18px 18px 0 0;overflow:hidden${v.bezOznacenia ? ";margin-top:16px" : ""}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1A2E24"><tr><td class="pad" style="padding:24px 32px 22px"><img src="${logo}" width="170" alt="ProSapiens Biomechanic" style="display:block;width:170px;height:auto">${kicker ? `<div style="font:700 12px/1 ${SANS};letter-spacing:2px;color:#9FBCA9;margin-top:24px">${esc(kicker)}</div>` : ""}<div class="h1" style="font:700 32px/1.14 ${HEAD};color:#fff;margin-top:10px">${esc(v.nadpis)}</div></td></tr></table><div style="height:24px;background:#1A2E24"><div style="height:24px;background:#F6F3EA;border-radius:24px 24px 0 0"></div></div></div><div class="pad" style="background:#F6F3EA;padding:8px 32px 14px;color:#1A2E24;font:16px/1.65 ${SANS}">${telo}</div><div style="background:#1A2E24;border-radius:0 0 18px 18px"><div style="font:12px/1.6 ${SANS};color:#9FBCA9;text-align:center;padding:20px 24px 26px">${pata}</div></div><div style="height:18px"></div></td></tr></table></td></tr></table></body></html>`;
}

/** Textová verzia: lepšie doručovanie a čitateľnosť bez HTML. */
export function mailText(v: VstupMailu): string {
  const bloky = blokyMailu(dosadOslovenie(v.telo, v.meno)).map((b) => {
    const cisti = (s: string) => s.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)");
    switch (b.typ) {
      case "odsek": return b.riadky.map(cisti).join("\n");
      case "veta": return cisti(b.text);
      case "box": return [b.nadpis && cisti(b.nadpis), ...b.polozky.map((p) => `- ${cisti(p)}`)].filter(Boolean).join("\n");
      case "tlacidlo": return `${b.text}: ${b.url}`;
      case "obrazok": return b.popis;
    }
  });
  const pata = v.bezOznacenia
    ? `Mgr. Filip Stráňavský, ProSapiens Biomechanic, Brno\n${v.pataText || ""}`
    : `Obchodní sdělení ProSapiens Biomechanic.\nMgr. Filip Stráňavský, Brno.\n${v.dovodVMaili ? `Tento e-mail dostáváš ${v.dovodVMaili}.\n` : ""}Odhlásit se jedním klikem: ${v.odhlasitUrl}`;
  return `${v.nadpis}\n\n${bloky.join("\n\n")}\n\n--\n${pata}\n`;
}

/** Čo musí text obsahovať, kým sa dá poslať. Odhlásenie doplní šablóna vždy. */
export function kontrolaTextu(v: { predmet: string; nadpis: string; telo: string }): string[] {
  const chyby: string[] = [];
  if (!v.predmet.trim()) chyby.push("Chýba predmet.");
  if (!v.nadpis.trim()) chyby.push("Chýba nadpis.");
  if (!v.telo.trim()) chyby.push("Chýba text.");
  if (/\{(?!osloven[ií]\})[^}]*\}/iu.test(v.telo)) chyby.push("V texte ostala neznáma značka v zložených zátvorkách.");
  if (/\[[^\]]+\]\((?!https?:\/\/)[^)]*\)/i.test(v.telo)) chyby.push("Odkaz musí začínať https://.");
  return chyby;
}
