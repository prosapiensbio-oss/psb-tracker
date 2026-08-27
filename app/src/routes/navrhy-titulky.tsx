import { createFileRoute } from "@tanstack/react-router";

import { isAuthed } from "../lib/psb/auth.server";
import { farby } from "../lib/psb/titulka";
import { NAVRHY } from "../lib/psb/titulkaNavrhy";

/**
 * Dvadsať nástrelov titulky vedľa seba.
 *
 * PREČO VLASTNÁ ADRESA
 *
 * Vyberá sa z toho prstom a na veľkej obrazovke. Do modálu v appke sa
 * dvadsať skladieb nedá dať tak, aby sa dali porovnať — a porovnanie je celý
 * zmysel tejto stránky.
 *
 * PREČO SÚ TO ŽIVÉ SVG A NIE OBRÁZKY
 *
 * Písmo sa berie z Jerryho systému. Keby to boli obrázky vyrobené u mňa,
 * vyzerali by inak než to, čo mu appka naozaj vyrobí — a vyberal by si podľa
 * niečoho, čo neexistuje.
 */

function stranka(): string {
  // Každý nástrel dostane vlastnú predponu pre id. Na jednej stránke je
  // štyridsať kresieb v dvoch režimoch a orezy s rovnakým id by si navzájom
  // prepísali obsah — prejavilo by sa to ako fotka v nesprávnom tvare.
  const kresli = (n: (typeof NAVRHY)[number], rezim: "svetly" | "tmavy") =>
    karta(n, n.kresli(farby(rezim), (k) => `${rezim.slice(0, 1)}${n.cislo}${k}`));
  const vybrane = NAVRHY.filter((n) => n.rodina);
  const rodina = (k: "slovo" | "cislo" | "fotka", rezim: "svetly" | "tmavy") =>
    vybrane.filter((n) => n.rodina === k).map((n) => kresli(n, rezim)).join("");

  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nástrely titulky — ProSapiens Biomechanic</title>
<style>
  :root { --bg:#12100E; --karta:#1C1A17; --text:#EDE9E4; --tlm:#9A948C; --ciara:#2E2A26; }
  * { box-sizing: border-box; }
  body { margin:0; padding:28px; background:var(--bg); color:var(--text);
         font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  h1 { font-size:20px; margin:0 0 6px; font-weight:600; }
  .uvod { color:var(--tlm); max-width:760px; margin:0 0 22px; font-size:13px; line-height:1.6; }
  .prep { display:flex; gap:8px; margin-bottom:22px; }
  .prep button { padding:7px 14px; border-radius:6px; border:1px solid var(--ciara);
                 background:transparent; color:var(--text); font:inherit; font-size:13px; cursor:pointer; }
  .prep button[aria-pressed="true"] { background:#2D7D5A; border-color:#2D7D5A; color:#fff; }
  .mriezka { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:22px; }
  figure { margin:0; }
  figure svg { width:100%; height:auto; display:block; border-radius:4px; border:1px solid var(--ciara); }
  figcaption { margin-top:8px; font-size:12px; line-height:1.45; }
  .cislo { color:#2D7D5A; font-weight:700; }
  .popis { color:var(--tlm); font-size:11.5px; }
  .znak { display:inline-block; margin-left:6px; padding:1px 6px; border-radius:3px;
          background:#2E2A26; color:var(--tlm); font-size:10px; letter-spacing:.04em; }
  .znak.vybral { background:#2D7D5A; color:#fff; }
  figure.vybral svg { border-color:#2D7D5A; box-shadow:0 0 0 2px rgba(45,125,90,.35); }
  .schovane { display:none; }
  section { margin-bottom:34px; }
  section h2 { font-size:15px; margin:0 0 2px; font-weight:600; }
  section p.k { color:var(--tlm); font-size:12px; margin:0 0 14px; max-width:680px; line-height:1.55; }
  details { margin-top:26px; border-top:1px solid var(--ciara); padding-top:16px; }
  summary { cursor:pointer; color:var(--tlm); font-size:13px; }
</style></head><body>
<h1>Titulka — vybrané skladby</h1>
<p class="uvod">
  Osem skladieb, ktoré si vybral z tridsiatich deviatich. Nie je to osem rozhodnutí —
  sú to <strong>tri rodiny</strong> podľa toho, čo nesie obraz. A tie tri sedia na kategórie,
  ktoré appka o príspevku už vie, takže si skladbu nemusíš vyberať: navrhne sa a ty ju potvrdíš.
</p>
<p class="uvod">
  Sivé pole so slovom FOTO nie je návrh obrázka, je to miesto, kam príde ten tvoj —
  prvý snímok z reelu, klient, štúdio. Písmo je Agrandir z tvojho počítača,
  takže to, čo tu vidíš, je presne to, čo ti appka vyrobí.
</p>
<div class="prep">
  <button id="bs" aria-pressed="true">svetlé</button>
  <button id="bt" aria-pressed="false">tmavé</button>
</div>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="psbNapis" viewBox="0 0 1664.4 300.2"></symbol>
  <symbol id="psbFigura" viewBox="0 0 595.5 1201.9"></symbol>
</svg>
<div id="svetle">${rodiny("svetly", rodina)}</div>
<div id="tmave" class="schovane">${rodiny("tmavy", rodina)}</div>

<details id="vsetky">
  <summary>ukázať všetkých štyridsať</summary>
  <div class="mriezka" style="margin-top:18px">${NAVRHY.map((n) => kresli(n, "svetly")).join("")}</div>
</details>
<script>
// Značka sa načíta raz a vloží sa do symbolov — dvadsať kópií 80 kB by
// stránku položilo, a odkaz na symbol vyzerá rovnako.
Promise.all([
  fetch('/znacka-napis.svg').then(r => r.text()),
  fetch('/znacka-figura.svg').then(r => r.text()),
]).then(([napis, figura]) => {
  const vnutro = (s) => s.replace(/^[\\s\\S]*?<svg[^>]*>/, '').replace(/<\\/svg>\\s*$/, '');
  document.getElementById('psbNapis').innerHTML = vnutro(napis);
  document.getElementById('psbFigura').innerHTML = vnutro(figura);
});
const bs = document.getElementById('bs'), bt = document.getElementById('bt');
const sv = document.getElementById('svetle'), tm = document.getElementById('tmave');
function prepni(tmavo) {
  sv.classList.toggle('schovane', tmavo);
  tm.classList.toggle('schovane', !tmavo);
  bs.setAttribute('aria-pressed', String(!tmavo));
  bt.setAttribute('aria-pressed', String(tmavo));
}
bs.onclick = () => prepni(false);
bt.onclick = () => prepni(true);
</script>
</body></html>`;
}

const RODINY: { kluc: "slovo" | "cislo" | "fotka"; nazov: string; kedy: string }[] = [
  {
    kluc: "slovo", nazov: "Slovo",
    kedy: "Edukácia a otázky — príspevky, kde je téza celý obsah. Obraz nesie sadzba, " +
      "fotka by len zavadzala. Toto bude najčastejšie, lebo takých príspevkov máš najviac.",
  },
  {
    kluc: "cislo", nazov: "Číslo",
    kedy: "Klientske výsledky a merania. Tridsaťpäťka a tridsaťšestka sú TÁ ISTÁ skladba " +
      "s iným obsahom — jedno pole na číslo, jedno na jednotku. Nie sú to dve, je to jedna.",
  },
  {
    kluc: "fotka", nazov: "Fotka",
    kedy: "Klientske príbehy. Sem patrí hĺbka, ktorá ti chýbala — a nedá ju generátor, " +
      "dá ju prvý snímok z reelu, ktorý o hodinu publikuješ.",
  },
];

function rodiny(
  rezim: "svetly" | "tmavy",
  kresli: (k: "slovo" | "cislo" | "fotka", r: "svetly" | "tmavy") => string,
): string {
  return RODINY.map((r) => `<section>
    <h2>${r.nazov}</h2>
    <p class="k">${r.kedy}</p>
    <div class="mriezka">${kresli(r.kluc, rezim)}</div>
  </section>`).join("");
}

function karta(n: (typeof NAVRHY)[number], obsah: string): string {
  return `<figure${n.rodina ? ' class="vybral"' : ""}>
    <svg viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">${obsah}</svg>
    <figcaption>
      <span class="cislo">${String(n.cislo).padStart(2, "0")}</span> ${n.nazov}
      ${n.foto ? '<span class="znak">tvoja fotka</span>' : ""}
      <div class="popis">${n.popis}</div>
    </figcaption>
  </figure>`;
}

export const Route = createFileRoute("/navrhy-titulky")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isAuthed(request))) {
          return new Response("Najprv sa prihlás v Kokpite a otvor návrhy znova.", {
            status: 401, headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        return new Response(stranka(), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});
