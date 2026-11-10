/**
 * STRÁNKA ZMLUVY PRE KLIENTA — `/z/<token>` (Jerry, 10. 11. 2026).
 *
 * Dve podoby:
 *  • na podpis — celé podmienky (zbalené po článkoch), šesť pravidiel na
 *    odkliknutie, dátum, meno a plocha na podpis prstom alebo perom;
 *  • podpísaná — celé znenie, odkliknuté pravidlá, oba podpisy a čas;
 *    dá sa vytlačiť alebo uložiť ako PDF.
 *
 * Podpis potrebuje JavaScript (plátno), zvyšok stránky nie. Bez skriptu sa
 * ukáže veta, že podpis nejde, namiesto mŕtveho tlačidla.
 *
 * Sadzba je z webu (biela, #1A2E24, akcent #2D7D5A) ako pri /u/ a /v/.
 */
import { menoPodpisujuceho, type Odsek, type ZnenieZmluvy } from "./zmluva6m";

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** „10. 11. 2026“ z ISO dátumu (alebo z dňa RRRR-MM-DD). */
export const denCesky = (iso: string): string => {
  const [r, m, d] = iso.slice(0, 10).split("-").map(Number);
  return r ? `${d}. ${m}. ${r}` : "";
};

/** „10. 11. 2026 v 18:33“ — čas v Prahe. */
export const casCesky = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const f = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}. ${p.month}. ${p.year} v ${p.hour}:${p.minute}`;
};

const odsek = (o: Odsek): string => {
  if (typeof o === "string") return `<p>${esc(o)}</p>`;
  if ("h" in o) return `<h4>${esc(o.h)}</h4>`;
  return `<p><b>${esc(o.b)}</b> ${esc(o.t)}</p>`;
};

const clanky = (z: ZnenieZmluvy, zbalene: boolean): string => z.clanky.map((c, i) => zbalene
  ? `<details class="cl"${i === 0 ? " open" : ""}><summary><span>${esc(c.nadpis)}</span><span class="sip">›</span></summary><div class="tx">${c.odseky.map(odsek).join("")}</div></details>`
  : `<section class="cl"><h3>${esc(c.nadpis)}</h3><div class="tx">${c.odseky.map(odsek).join("")}</div></section>`).join("");

const priloha = (z: ZnenieZmluvy, zbalene: boolean): string => {
  const telo = `<div class="tx">${z.priloha.odseky.map((x) => `<p>${esc(x)}</p>`).join("")}</div>`;
  return zbalene
    ? `<details class="cl"><summary><span>${esc(z.priloha.nadpis)}</span><span class="sip">›</span></summary>${telo}</details>`
    : `<section class="cl priloha"><h3>${esc(z.priloha.nadpis)}</h3>${telo}</section>`;
};

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#F4F6F3;color:#1A2E24;font:15px/1.6 'Open Sans',Arial,Helvetica,sans-serif}
.obal{max-width:720px;margin:0 auto;padding:22px 16px 60px}
.list{background:#FFFFFF;border-radius:24px;padding:26px 22px;box-shadow:0 1px 3px rgba(26,46,36,.08)}
h1{margin:0 0 4px;font-family:'Raleway',sans-serif;font-weight:700;font-size:25px;line-height:1.25}
h2{margin:30px 0 10px;font-family:'Raleway',sans-serif;font-weight:700;font-size:19px}
h3{margin:22px 0 6px;font-family:'Raleway',sans-serif;font-weight:700;font-size:16px;color:#2D4A3A}
h4{margin:14px 0 4px;font-size:14px;font-weight:600}
.tx p{margin:0 0 9px;font-size:14px;line-height:1.6}
.pod{color:#5E7166;font-size:13.5px}
.cl{border-top:1px solid #E3E9E4}
details.cl summary{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 2px;cursor:pointer;font-family:'Raleway',sans-serif;font-weight:700;font-size:15.5px;list-style:none}
details.cl summary::-webkit-details-marker{display:none}
.sip{font-size:22px;color:#2D7D5A;transition:transform .15s ease}
details[open] .sip{transform:rotate(90deg)}
details.cl .tx{padding:0 2px 10px}
.pr{display:flex;gap:13px;align-items:flex-start;padding:14px;border:1.5px solid #DCE3DD;border-radius:16px;margin-top:10px;cursor:pointer;background:#FFFFFF}
.pr input{width:24px;height:24px;margin:1px 0 0;accent-color:#2D7D5A;flex-shrink:0}
.pr:has(input:checked){border-color:#2D7D5A;background:#F1F8F3}
.pr b{display:block;font-size:15px;margin-bottom:2px}
.pr span{font-size:14px;line-height:1.55;color:#33493D}
.pole{width:100%;padding:13px 14px;border:1.5px solid #DCE3DD;border-radius:12px;font:inherit;font-size:16px;color:#1A2E24;background:#FFFFFF}
.platno{position:relative;margin-top:8px;border:1.5px dashed #9DB5A6;border-radius:16px;background:#FFFFFF;height:220px;touch-action:none}
.platno canvas{position:absolute;inset:0;width:100%;height:100%;border-radius:16px;touch-action:none;cursor:crosshair}
.platno .ciara{position:absolute;left:22px;right:22px;bottom:46px;border-bottom:1px solid #C9D4CC;pointer-events:none}
.platno .napoveda{position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:12.5px;color:#8A9A90;pointer-events:none}
.riadok{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:8px}
.btn{border:0;background:#1A2E24;color:#FFFFFF;border-radius:32px;padding:15px 28px;font:inherit;font-size:16px;font-weight:600;cursor:pointer;width:100%}
.btn[disabled]{background:#B7C3BB;cursor:not-allowed}
.btn2{border:1.5px solid #DCE3DD;background:#FFFFFF;color:#1A2E24;border-radius:24px;padding:8px 16px;font:inherit;font-size:13.5px;cursor:pointer}
.podpisy{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px}
.podpisy>div{flex:1 1 240px}
.podpisy img{display:block;width:100%;max-width:320px;height:auto;border-bottom:1px solid #1A2E24}
.chyba{margin-top:14px;padding:12px 14px;border-radius:12px;background:#FDECEC;color:#8A1F1F;font-size:14px}
.ok{margin:0 0 18px;padding:14px 16px;border-radius:14px;background:#E8F4EC;color:#1E5A3B;font-size:14.5px}
.nahlad{margin:0 0 16px;padding:11px 14px;border-radius:12px;background:#FFF4DC;color:#7A5410;font-size:13.5px}
.pata{margin-top:18px;text-align:center;font-size:12px;color:#8A9A90}
@media print{
  body{background:#FFFFFF;font-size:11pt}
  .obal{max-width:none;padding:0}
  .list{box-shadow:none;padding:0;border-radius:0}
  .bezTlace{display:none!important}
  .cl{break-inside:auto}
  .priloha{break-before:page}
}`;

const hlava = (titul: string) => `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(titul)} — ProSapiens Biomechanic</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Raleway:wght@600;700&display=swap">
<style>${CSS}</style>
</head><body><div class="obal">`;

const pata = `<div class="pata">ProSapiens Biomechanic · Fanderlíkova 30, Brno · info@prosapiens.cz</div></div></body></html>`;

export type StavZmluvyStranky = {
  znenie: ZnenieZmluvy;
  klient: string;
  poskytovatelPodpis: string;
  poskytovatelAt: string;
  autor: string | null;
  /** Dnešný deň v Prahe (RRRR-MM-DD) — dátum podpisu. */
  dnes: string;
  /** Náhľad trénera z Kokpitu — formulár sa neodošle. */
  nahlad?: boolean;
  /** Ukážka s vymysleným klientom — podpísať sa dá, nič sa neuloží. */
  ukazka?: boolean;
  chyba?: string;
};

const UKAZKA_PAS = `<div class="nahlad bezTlace">Ukážka — takto stránku uvidí klient. Dá se projít i podepsat, nic se neuloží.</div>`;

/** PODOBA NA PODPIS. */
export function zmluvaNaPodpisHtml(s: StavZmluvyStranky): string {
  const z = s.znenie;
  const pravidla = z.pravidla.map((p) => `<label class="pr"><input type="checkbox" name="pravidlo_${esc(p.id)}" value="1" required><div><b>${esc(p.nazov)}</b><span>${esc(p.text)}</span></div></label>`).join("");
  return `${hlava(z.nazov)}
<div class="list">
${s.nahlad ? `<div class="nahlad">Náhled z Kokpitu — takto stránku uvidí klient. Odsud se podepsat nedá.</div>` : ""}${s.ukazka ? UKAZKA_PAS : ""}
<h1>${esc(z.nazov)}</h1>
<div class="pod">Obchodní podmínky ProSapiens Biomechanic, platné od ${esc(z.platneOd)}. Klient: <b>${esc(s.klient)}</b></div>

<h2>1. Přečti si podmínky</h2>
<div class="pod" style="margin-bottom:6px">Klepnutím na článek se rozbalí.</div>
${clanky(z, true)}
${priloha(z, true)}

<form method="post" id="f" autocomplete="off">
<h2>2. Odsouhlas pravidla 6měsíční spolupráce</h2>
<div class="pod">Svým podpisem potvrzuješ, že ses seznámil(a) s obchodními podmínkami a výslovně souhlasíš s těmito pravidly. Každé odklikni zvlášť.</div>
${pravidla}

<h2>3. Datum a podpis</h2>
<div class="pod">V Brně dne <b>${esc(denCesky(s.dnes))}</b></div>
<div style="margin-top:14px"><label class="pod" for="meno">Jméno a příjmení</label>
<input class="pole" id="meno" name="meno" value="${esc(s.klient)}" maxlength="120" required autocomplete="off" autocapitalize="words"></div>

<div style="margin-top:16px" class="pod">Podpis — prstem nebo perem do rámečku</div>
<div class="platno" id="pl"><div class="ciara"></div><div class="napoveda" id="nap">podepiš se sem</div><canvas id="cv"></canvas></div>
<div class="riadok"><span class="pod" id="stav"></span><button type="button" class="btn2" id="zmaz">Smazat podpis</button></div>
<input type="hidden" name="podpis" id="podpis">
<input type="hidden" name="tahy" id="tahy" value="0">

<h2 style="margin-top:26px">Podpis poskytovatele</h2>
<div class="podpisy"><div><img src="${esc(s.poskytovatelPodpis)}" alt="podpis poskytovatele"><div class="pod">${esc(menoPodpisujuceho(s.autor))} · ${esc(denCesky(s.poskytovatelAt))}</div></div></div>

${s.chyba ? `<div class="chyba">${esc(s.chyba)}</div>` : ""}
<noscript><div class="chyba">Podpis potřebuje zapnutý JavaScript. Otevři odkaz v běžném prohlížeči (Safari, Chrome).</div></noscript>
<div style="margin-top:20px"><button type="submit" class="btn" id="odosli" disabled>${s.nahlad ? "Náhled — podpis je vypnutý" : "Podepsat smlouvu"}</button></div>
<div class="pod" style="margin-top:9px;font-size:12.5px">Kliknutím na „Podepsat smlouvu“ podepisuješ smlouvu elektronicky. Uložíme ji s datem a časem podpisu a kdykoli si ji otevřeš na tomto odkazu.</div>
</form>
</div>
<script>
(function(){
  var NAHLAD=${s.nahlad ? "true" : "false"};
  var cv=document.getElementById('cv'),pl=document.getElementById('pl'),ctx=cv.getContext('2d');
  var f=document.getElementById('f'),btn=document.getElementById('odosli'),tahy=0,kreslim=false,posl=null;
  function velkost(){var r=pl.getBoundingClientRect(),d=window.devicePixelRatio||1;var obr=tahy?cv.toDataURL():null;
    cv.width=Math.round(r.width*d);cv.height=Math.round(r.height*d);ctx.setTransform(d,0,0,d,0,0);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#14241B';
    if(obr){var im=new Image();im.onload=function(){ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(im,0,0,cv.width,cv.height);ctx.setTransform(d,0,0,d,0,0);};im.src=obr;}}
  velkost();window.addEventListener('resize',velkost);
  function bod(e){var r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top,p:e.pressure&&e.pointerType==='pen'?e.pressure:0.5};}
  cv.addEventListener('pointerdown',function(e){e.preventDefault();kreslim=true;posl=bod(e);try{cv.setPointerCapture(e.pointerId)}catch(x){}
    ctx.beginPath();ctx.arc(posl.x,posl.y,1.2,0,6.3);ctx.fillStyle='#14241B';ctx.fill();});
  cv.addEventListener('pointermove',function(e){if(!kreslim)return;e.preventDefault();var evs=e.getCoalescedEvents?e.getCoalescedEvents():[];if(!evs||!evs.length)evs=[e];
    for(var i=0;i<evs.length;i++){var b=bod(evs[i]);ctx.lineWidth=1.4+b.p*2.6;ctx.beginPath();ctx.moveTo(posl.x,posl.y);ctx.lineTo(b.x,b.y);ctx.stroke();posl=b;}});
  function koniec(){if(!kreslim)return;kreslim=false;tahy++;document.getElementById('nap').style.display='none';skontroluj();}
  cv.addEventListener('pointerup',koniec);cv.addEventListener('pointercancel',koniec);cv.addEventListener('pointerleave',koniec);
  document.getElementById('zmaz').addEventListener('click',function(){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);ctx.restore();tahy=0;document.getElementById('nap').style.display='';skontroluj();});
  var boxy=f.querySelectorAll('input[type=checkbox]'),meno=document.getElementById('meno'),stav=document.getElementById('stav');
  function skontroluj(){var n=0;for(var i=0;i<boxy.length;i++)if(boxy[i].checked)n++;
    var chyba=n<boxy.length?('Odsouhlaseno '+n+' z '+boxy.length+' pravidel'):!tahy?'Chybí podpis':!meno.value.trim()?'Chybí jméno':'';
    stav.textContent=chyba;btn.disabled=NAHLAD||!!chyba;}
  for(var i=0;i<boxy.length;i++)boxy[i].addEventListener('change',skontroluj);meno.addEventListener('input',skontroluj);skontroluj();
  f.addEventListener('submit',function(e){if(NAHLAD||btn.disabled){e.preventDefault();return;}
    document.getElementById('podpis').value=cv.toDataURL('image/png');document.getElementById('tahy').value=String(tahy);
    btn.disabled=true;btn.textContent='Ukládám…';});
})();
</script>
${pata}`;
}

export type PodpisanaZmluva = {
  znenie: ZnenieZmluvy;
  klient: string;
  klientMeno: string;
  klientPodpis: string;
  klientAt: string;
  suhlasy: { id: string; nazov: string; text: string }[];
  poskytovatelPodpis: string;
  poskytovatelAt: string;
  autor: string | null;
  odtlacok: string;
  /** Práve podpísaná — ukáže poďakovanie. */
  cerstvo?: boolean;
  ukazka?: boolean;
};

/** PODOBA PODPÍSANÁ — na čítanie, tlač a uloženie ako PDF. */
export function zmluvaPodpisanaHtml(s: PodpisanaZmluva): string {
  const z = s.znenie;
  return `${hlava(z.nazov)}
<div class="list">
${s.ukazka ? UKAZKA_PAS : ""}
${s.cerstvo ? `<div class="ok bezTlace"><b>Hotovo, smlouva je podepsaná.</b> Děkujeme. Na tomto odkazu ji najdeš kdykoli, tlačítkem níže si ji uložíš jako PDF.</div>` : ""}
<h1>${esc(z.nazov)}</h1>
<div class="pod">Obchodní podmínky ProSapiens Biomechanic, platné od ${esc(z.platneOd)}. Klient: <b>${esc(s.klient)}</b></div>
<div class="bezTlace" style="margin-top:14px"><button type="button" class="btn2" onclick="window.print()">Uložit jako PDF / vytisknout</button></div>
${clanky(z, false)}
<section class="cl"><h3>Souhlas klienta s pravidly 6měsíční spolupráce</h3>
<div class="tx"><p>Svým podpisem klient potvrzuje, že se seznámil s těmito obchodními podmínkami a výslovně souhlasí s následujícími pravidly:</p>
${s.suhlasy.map((p) => `<p>☑ <b>${esc(p.nazov)}:</b> ${esc(p.text)}</p>`).join("")}</div></section>
<p style="margin-top:18px">V Brně dne <b>${esc(denCesky(s.klientAt))}</b></p>
<div class="podpisy">
<div><img src="${esc(s.klientPodpis)}" alt="podpis klienta"><div class="pod">${esc(s.klientMeno)} · podepsáno ${esc(casCesky(s.klientAt))}</div></div>
<div><img src="${esc(s.poskytovatelPodpis)}" alt="podpis poskytovatele"><div class="pod">${esc(menoPodpisujuceho(s.autor))} · ${esc(denCesky(s.poskytovatelAt))}</div></div>
</div>
<p class="pod" style="margin-top:14px;font-size:11.5px">Podepsáno elektronicky. Verze podmínek ${esc(z.verzia)}, otisk znění ${esc(s.odtlacok.slice(0, 16))}…</p>
${priloha(z, false)}
</div>
${pata}`;
}

/** Krátka stránka pre stavy, keď sa zmluva ukázať nedá. */
export const kratkaZmluva = (text: string) => `${hlava("Smlouva")}<div class="list" style="text-align:center">${text}</div>${pata}`;

/**
 * MAIL SO ZMLUVOU NA PREČÍTANIE (Jerry, 10. 11. 2026: „aby som mal možnosť
 * poslať mu tú zmluvu mailom ešte pred podpisom, aby si mohol prečítať, čo
 * ide podpisovať"). Celé znenie je priamo v maili, podpis je za odkazom.
 * HTML len z tabuliek a inline štýlov — Gmail aj Outlook.
 */
export function zmluvaMail(z: ZnenieZmluvy, v: { oslovenie: string; odkaz: string; uvod?: string }): { predmet: string; text: string; html: string } {
  const pozdrav = v.oslovenie ? `Ahoj ${v.oslovenie},` : "Ahoj,";
  const uvod = v.uvod?.trim() || "posílám ti k přečtení podmínky naší 6měsíční spolupráce. V klidu si je projdi; až budeš chtít, odsouhlasíš pravidla a podepíšeš se prstem na tomto odkazu:";
  const plain = (o: Odsek) => typeof o === "string" ? o : "h" in o ? `\n${o.h}` : `${o.b} ${o.t}`;
  const text = [
    pozdrav, "", uvod, v.odkaz, "",
    "PRAVIDLA K ODSOUHLASENÍ", ...z.pravidla.map((p) => `• ${p.nazov}: ${p.text}`), "",
    z.nazov.toUpperCase(), `Platné od ${z.platneOd}`, "",
    ...z.clanky.flatMap((c) => [c.nadpis, ...c.odseky.map(plain), ""]),
    z.priloha.nadpis, ...z.priloha.odseky, "",
    "Jerry · ProSapiens Biomechanic",
  ].join("\n");
  const p = (t: string, st = "") => `<p style="margin:0 0 9px;font-size:14px;line-height:1.6;color:#1A2E24;${st}">${t}</p>`;
  const odsekHtml = (o: Odsek) => typeof o === "string" ? p(esc(o))
    : "h" in o ? `<p style="margin:12px 0 4px;font-size:14px;font-weight:bold;color:#1A2E24">${esc(o.h)}</p>`
    : p(`<b>${esc(o.b)}</b> ${esc(o.t)}`);
  const html = `<!doctype html><html lang="cs"><body style="margin:0;background:#F4F6F3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F3"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#FFFFFF;border-radius:16px"><tr><td style="padding:26px 24px;font-family:Arial,Helvetica,sans-serif;color:#1A2E24">
${p(esc(pozdrav))}${p(esc(uvod))}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 22px"><tr><td style="background:#1A2E24;border-radius:28px"><a href="${esc(v.odkaz)}" style="display:inline-block;padding:13px 26px;color:#FFFFFF;font-size:15px;font-weight:bold;text-decoration:none">Přečíst a podepsat</a></td></tr></table>
<p style="margin:0 0 8px;font-size:16px;font-weight:bold">Pravidla, která odsouhlasíš</p>
${z.pravidla.map((r) => p(`<b>${esc(r.nazov)}:</b> ${esc(r.text)}`)).join("")}
<p style="margin:24px 0 2px;font-size:17px;font-weight:bold">${esc(z.nazov)}</p>
${p(`Obchodní podmínky ProSapiens Biomechanic, platné od ${esc(z.platneOd)}`, "color:#5E7166")}
${z.clanky.map((c) => `<p style="margin:18px 0 6px;font-size:15px;font-weight:bold;color:#2D4A3A">${esc(c.nadpis)}</p>${c.odseky.map(odsekHtml).join("")}`).join("")}
<p style="margin:18px 0 6px;font-size:15px;font-weight:bold;color:#2D4A3A">${esc(z.priloha.nadpis)}</p>
${z.priloha.odseky.map((x) => p(esc(x))).join("")}
${p("Jerry · ProSapiens Biomechanic", "margin-top:20px")}
</td></tr></table></td></tr></table></body></html>`;
  return { predmet: "Podmínky 6M spolupráce k přečtení a podpisu — ProSapiens Biomechanic", text, html };
}
