import { createFileRoute } from "@tanstack/react-router";

import { isAuthed } from "../lib/psb/auth.server";
import { bindings } from "../lib/bindings.server";
import { FAZA_MAPA } from "../lib/psb/mapaCyklu";
import { ZABER_MAPA } from "../lib/psb/zabery";

/**
 * Natáčací list — papier, s ktorým sa ide točiť.
 *
 * PREČO JE TO SAMOSTATNÁ ADRESA A NIE OBRAZOVKA V APPKE
 *
 * Číta sa PRI NATÁČANÍ. Vtedy nikto neprepína záložky ani nehľadá kartu —
 * otvorí sa to na notebooku vedľa statívu, alebo sa to uloží do telefónu
 * a číta sa bez pripojenia. Preto je to jedna stránka, ktorá sa celá zmestí
 * do súboru, a nie ďalší kus jednostránkovej appky.
 *
 * PREČO SÚ VETY DVAKRÁT
 *
 * Hore veľkým písmom celý scenár — to je text, ktorý Jerry hovorí a číta ho
 * z odstupu. Dole pri každom zábere tá istá veta normálnym písmom — to sa
 * pozerá PRED natáčaním, keď sa stavia telefón. Sú to dva rôzne momenty, nie
 * duplicita: pri jednom človek hovorí, pri druhom rozmýšľa.
 */

type Riadok = {
  id: string; text: string; koncept: string; scenar: string; hotovy_text: string;
  sekvencia: string; zaber: string; faza: number; planovane_na: string; kto: string;
};

type Krok = { zaber?: string; co?: string; veta?: string; sekund?: number };

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Text s riadkami → odstavce. Prázdny riadok oddeľuje, jednoduchý zalomí. */
const riadky = (s: string) =>
  String(s ?? "").split(/\n/).map((r) => r.trim()).filter(Boolean).map((r) => esc(r));

function kroky(json: string): Krok[] {
  if (!json) return [];
  try { const p: unknown = JSON.parse(json); return Array.isArray(p) ? (p as Krok[]) : []; }
  catch { return []; }
}

function prispevok(r: Riadok, poradie: number): string {
  const f = FAZA_MAPA.get(r.faza);
  const k = kroky(r.sekvencia);
  const spolu = k.reduce((s, x) => s + (Number(x.sekund) || 0), 0);
  const nazov = (r.koncept || r.text || "Bez názvu").slice(0, 120);

  // Scenár je jediná časť, ktorú človek číta pri práci — preto veľké písmo
  // a jedna veta na riadok. Keď chýba, povie sa to; prázdne miesto by pri
  // statíve vyzeralo ako chyba appky, nie ako nedokončená práca.
  const scenar = r.scenar.trim()
    ? `<div class="scenar">${riadky(r.scenar).map((v) => `<p>${v}</p>`).join("")}</div>`
    : `<p class="chyba">Scenár ešte nie je napísaný — bez neho sa natáčať nedá.</p>`;

  const sekvencia = k.length
    ? `<ol class="zabery">${k.map((x) => {
        const z = ZABER_MAPA.get(String(x.zaber || ""));
        return `<li>
          <div class="zab-hlava"><b>${esc(z?.nazov || "záber neurčený")}</b>${x.sekund ? ` <span class="sek">${esc(String(x.sekund))} s</span>` : ""}</div>
          ${x.co ? `<div class="zab-co">${esc(String(x.co))}</div>` : ""}
          ${x.veta ? `<div class="zab-veta">„${esc(String(x.veta))}“</div>` : ""}
          ${z ? `<div class="zab-ako">${esc(z.akoNaTo)}</div>` : ""}
        </li>`;
      }).join("")}</ol>`
    : `<p class="chyba">Sekvencia záberov nie je rozpísaná.</p>`;

  const caption = r.hotovy_text.trim()
    ? `<pre class="caption" id="cap${poradie}">${esc(r.hotovy_text.trim())}</pre>
       <button class="kop" data-cil="cap${poradie}">skopírovať caption aj s hashtagmi</button>`
    : `<p class="chyba">Caption ešte nie je napísaný.</p>`;

  return `<article class="post">
    <header>
      <div class="meta">${esc(r.planovane_na)} · ${esc(f?.nazov || "nezaradené")}${r.kto ? ` · ${esc(r.kto)}` : ""}${spolu ? ` · ${spolu} s` : ""}</div>
      <h2>${esc(nazov)}</h2>
    </header>
    <section><h3>Scenár — toto hovorím</h3>${scenar}</section>
    <section><h3>Zábery${spolu ? ` · spolu ${spolu} s` : ""}</h3>${sekvencia}</section>
    <section><h3>Caption a hashtagy</h3>${caption}</section>
  </article>`;
}

function stranka(rs: Riadok[], mesiac: string, pocet: string, mesiace: string[]): string {
  const volby = ["", ...mesiace].map((m) =>
    `<option value="${esc(m)}"${m === mesiac ? " selected" : ""}>${m ? esc(m) : "všetky mesiace"}</option>`).join("");

  return `<!doctype html>
<html lang="sk"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Natáčací list${mesiac ? ` ${mesiac}` : ""} — PSB</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 22px 18px 70px; background: #f6f5f1; color: #16211f;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5; -webkit-text-size-adjust: 100%;
  }
  .wrap { max-width: 780px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -.01em; }
  .podnadpis { font-size: 13px; color: #5d6b68; margin: 0 0 18px; }
  form { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 22px; }
  label { font-size: 12px; color: #5d6b68; display: flex; flex-direction: column; gap: 4px; }
  select, input { font: inherit; font-size: 14px; padding: 7px 9px; border: 1px solid #cfd6d3; border-radius: 7px; background: #fff; }
  button { font: inherit; font-size: 14px; padding: 7px 13px; border-radius: 7px; border: 1px solid #cfd6d3; background: #fff; cursor: pointer; }
  button.hlavne { background: #16211f; color: #fff; border-color: #16211f; }
  .post { background: #fff; border: 1px solid #e2e6e4; border-radius: 12px; padding: 22px 24px; margin-bottom: 22px; }
  .post header { border-bottom: 1px solid #eceeed; padding-bottom: 12px; margin-bottom: 16px; }
  .meta { font-size: 12px; color: #6b7a77; letter-spacing: .02em; }
  .post h2 { font-size: 16px; margin: 5px 0 0; font-weight: 600; line-height: 1.35; }
  .post h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #7d8a87; margin: 20px 0 9px; font-weight: 700; }
  .post section:first-of-type h3 { margin-top: 0; }

  /* VEĽKÉ PÍSMO. Toto je jediná časť, ktorá sa číta pri natáčaní — z odstupu
     asi metra, kútikom oka, medzi dvoma zábermi. Preto taká veľkosť, riadkovanie
     a jedna veta na riadok. Na telefóne sa zmenšuje len mierne. */
  .scenar p {
    font-size: 30px; line-height: 1.42; font-weight: 600; margin: 0 0 14px;
    letter-spacing: -.015em; text-wrap: balance;
  }
  @media (max-width: 560px) { .scenar p { font-size: 23px; } }

  .zabery { margin: 0; padding-left: 22px; }
  .zabery li { margin-bottom: 13px; }
  .zab-hlava { font-size: 14px; }
  .sek { color: #6b7a77; font-weight: 400; }
  .zab-co { font-size: 13.5px; color: #3e4b48; margin-top: 2px; }
  .zab-veta { font-size: 13.5px; color: #16211f; margin-top: 3px; }
  .zab-ako { font-size: 12.5px; color: #6b7a77; margin-top: 3px; line-height: 1.45; }

  .caption { font: inherit; font-size: 14px; white-space: pre-wrap; word-wrap: break-word;
    background: #f6f5f1; border: 1px solid #e2e6e4; border-radius: 8px; padding: 13px 15px; margin: 0 0 9px; }
  .kop { font-size: 12.5px; }
  .chyba { font-size: 13.5px; color: #a2432f; margin: 0; }
  .prazdno { background: #fff; border: 1px dashed #cfd6d3; border-radius: 12px; padding: 26px; text-align: center; color: #6b7a77; font-size: 14px; }

  @media print {
    body { background: #fff; padding: 0; }
    form, .kop, .tlacidla { display: none; }
    .post { border: none; padding: 0 0 12px; margin: 0 0 26px; break-inside: avoid; page-break-inside: avoid; }
    .post + .post { break-before: page; page-break-before: always; }
  }
</style>
</head><body><div class="wrap">
<h1>Natáčací list</h1>
<p class="podnadpis">Hore je scenár veľkým písmom — ten sa číta pri natáčaní. Pod ním zábery s vetami a nakoniec caption na skopírovanie.</p>

<form method="get">
  <label>Mesiac<select name="mesiac">${volby}</select></label>
  <label>Koľko príspevkov<input type="number" name="pocet" min="1" max="50" value="${esc(pocet)}" placeholder="všetky"></label>
  <button type="submit" class="hlavne">Zobraziť</button>
</form>

<div class="tlacidla" style="display:flex;gap:8px;flex-wrap:wrap;margin:-10px 0 20px">
  <button onclick="window.print()">Vytlačiť / uložiť ako PDF</button>
  <button id="stiahnut">Stiahnuť ako súbor</button>
</div>

${rs.length ? rs.map(prispevok).join("") : `<div class="prazdno">Na toto obdobie nie je naplánovaný žiadny príspevok so scenárom.</div>`}

<script>
document.querySelectorAll(".kop").forEach(function (b) {
  b.addEventListener("click", function () {
    var el = document.getElementById(b.dataset.cil);
    var t = el.textContent;
    // Dve cesty, rovnako ako v appke: schránka sa dá zakázať aj pri kliku.
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
      function () { b.textContent = "skopírované \\u2713"; },
      function () {
        var r = document.createRange(); r.selectNodeContents(el);
        var s = getSelection(); s.removeAllRanges(); s.addRange(r);
        b.textContent = "označené — stlač cmd+C";
      }
    );
  });
});
document.getElementById("stiahnut").addEventListener("click", function () {
  // Uloží sa stránka tak, ako je — vrátane textov. Funguje offline aj bez
  // prihlásenia, čo je pri natáčaní mimo štúdia to jediné, na čom záleží.
  var html = "<!doctype html>" + document.documentElement.outerHTML;
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  a.download = ${JSON.stringify(`natacaci-list${mesiac ? `-${mesiac}` : ""}.html`)};
  document.body.appendChild(a); a.click(); a.remove();
});
</script>
</div></body></html>`;
}

export const Route = createFileRoute("/natacaci-list")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) {
          return new Response("Najprv sa prihlás v Kokpite a otvor list znova.", {
            status: 401, headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        const { DB } = bindings();
        if (!DB) return new Response("Databáza nie je pripojená.", { status: 500 });

        const q = new URL(request.url).searchParams;
        const mesiac = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.get("mesiac") || "") ? q.get("mesiac")! : "";
        const pocetRaw = Number(q.get("pocet"));
        const pocet = Number.isFinite(pocetRaw) && pocetRaw > 0 ? Math.min(50, Math.floor(pocetRaw)) : 0;

        const rs = ((await DB.prepare(
          `SELECT id, text, koncept, scenar, hotovy_text, sekvencia, zaber, faza, planovane_na, kto
             FROM mkt_napady
            WHERE stav <> 'zamietnuty' AND faza > 0 AND planovane_na <> ''
            ORDER BY planovane_na ASC, created_at ASC`,
        ).all()).results || []) as unknown as Riadok[];

        const mesiace = [...new Set(rs.map((r) => r.planovane_na))].sort();
        let vybrane = mesiac ? rs.filter((r) => r.planovane_na === mesiac) : rs;
        if (pocet) vybrane = vybrane.slice(0, pocet);

        return new Response(stranka(vybrane, mesiac, pocet ? String(pocet) : "", mesiace), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});
