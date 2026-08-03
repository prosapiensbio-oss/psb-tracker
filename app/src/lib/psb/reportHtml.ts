// Report do PDF — cez tlač prehliadača, nie cez knižnicu.
//
// Prečo takto: PDF knižnice v JS buď nevedia české a slovenské znaky bez toho,
// aby sa do balíka pribalil celý font, alebo sadzajú tabuľky tak, že to vyzerá
// horšie než screenshot. Prehliadač vie oboje a robí to natívne — stačí mu dať
// dobre navrhnutý dokument a povedať „vytlač". Používateľ v dialógu zvolí
// „Uložiť ako PDF".
//
// Dokument je zámerne SVETLÝ, aj keď appka je tmavá: report sa posiela Jarkovi
// a Terezke a niekedy sa aj vytlačí. Tmavé pozadie na papieri je plytvanie
// tonerom a na obrazovke v PDF čitateľnosti nepomôže.
//
// Prevod markdownu robíme sami a len pre to, čo report naozaj generuje (nadpisy,
// odrážky, tučné, kurzíva, citácia, tabuľka). Celý markdown parser by sem
// pritiahol závislosť, ktorú by nikto nikdy neaktualizoval.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline formátovanie: **tučné**, *kurzíva*, „úvodzovky" nechávame tak. */
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+?)\*/g, "$1<em>$2</em>");

export function markdownToHtml(md: string, grafy: Record<string, string> = {}): string {
  const riadky = md.split("\n");
  const out: string[] = [];
  let vZozname = false;
  let vTabulke = false;

  const zavriZoznam = () => { if (vZozname) { out.push("</ul>"); vZozname = false; } };
  const zavriTabulku = () => { if (vTabulke) { out.push("</tbody></table>"); vTabulke = false; } };

  for (let i = 0; i < riadky.length; i++) {
    const r = riadky[i];
    const t = r.trim();

    if (!t) { zavriZoznam(); zavriTabulku(); continue; }

    // Značka grafu. Keď graf pre dané obdobie nevznikol (napr. marketing za
    // mesiace, ktoré export ešte nepokrýva), riadok ticho zmizne — prázdny
    // rámček s nadpisom „graf" je horší než žiadny graf.
    const znacka = t.match(/^::graf:([a-z0-9_-]+)::$/i);
    if (znacka) {
      zavriZoznam(); zavriTabulku();
      const svg = grafy[znacka[1]];
      if (svg) out.push(`<figure class="graf-obal">${svg}</figure>`);
      continue;
    }

    // Tabuľka: hlavička, oddeľovač, riadky.
    if (t.startsWith("|")) {
      const bunky = t.split("|").slice(1, -1).map((c) => c.trim());
      const dalsi = (riadky[i + 1] || "").trim();
      if (!vTabulke && /^\|[\s:-]+\|/.test(dalsi)) {
        zavriZoznam();
        out.push(`<table><thead><tr>${bunky.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`);
        vTabulke = true;
        i++;                     // preskoč oddeľovací riadok
        continue;
      }
      if (vTabulke) {
        out.push(`<tr>${bunky.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`);
        continue;
      }
    } else {
      zavriTabulku();
    }

    if (t.startsWith("# ")) { zavriZoznam(); out.push(`<h1>${inline(t.slice(2))}</h1>`); continue; }
    if (t.startsWith("## ")) { zavriZoznam(); out.push(`<h2>${inline(t.slice(3))}</h2>`); continue; }
    if (t.startsWith("> ")) { zavriZoznam(); out.push(`<blockquote>${inline(t.slice(2))}</blockquote>`); continue; }
    if (t.startsWith("- ")) {
      if (!vZozname) { out.push("<ul>"); vZozname = true; }
      out.push(`<li>${inline(t.slice(2))}</li>`);
      continue;
    }
    zavriZoznam();
    out.push(`<p>${inline(t)}</p>`);
  }
  zavriZoznam();
  zavriTabulku();
  return out.join("\n");
}

/**
 * Celý dokument na tlač. Vracia samostatné HTML — nič sa neťahá zvonku, takže
 * to funguje aj offline a v PDF nechýbajú štýly.
 */
export function reportDocument(md: string, podnadpis: string, grafy: Record<string, string> = {}): string {
  const telo = markdownToHtml(md, grafy);
  const den = new Date().toLocaleDateString("sk-SK", { day: "numeric", month: "long", year: "numeric" });

  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8">
<title>PSB report — ${esc(podnadpis)}</title>
<style>
  /* A4 s miestom na hlavičku aj pätku. Číslovanie strán robí prehliadač sám
     cez @page margin boxy — vlastné počítanie strán v HTML je vždy klamstvo. */
  @page { size: A4; margin: 18mm 16mm 16mm; }
  @media print {
    /* Bez tohto prehliadač zahodí farebné pozadia a z tabuliek zostane
       šedivá kaša. */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  :root {
    --zelena: #2D7D5A;
    --zelena-svetla: #4A9E77;
    --tmava: #16241C;
    --text: #22302A;
    --slaba: #6B7A72;
    --linka: #DCE5DF;
    --pozadie: #F6F9F7;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }

  /* ── Hlavička ─────────────────────────────────────────────────────────── */
  .hlavicka {
    display: flex; align-items: center; gap: 14px;
    padding-bottom: 14px; margin-bottom: 22px;
    border-bottom: 2.5px solid var(--zelena);
  }
  .znak {
    width: 46px; height: 46px; flex: 0 0 auto;
    border-radius: 11px; background: var(--tmava);
    display: flex; align-items: center; justify-content: center;
    color: var(--zelena-svetla); font-weight: 800; font-size: 14pt; letter-spacing: -0.5px;
  }
  .nazov { font-size: 14pt; font-weight: 800; color: var(--tmava); letter-spacing: -0.3px; line-height: 1.15; }
  .podnazov { font-size: 9pt; color: var(--slaba); margin-top: 2px; }
  .datum { margin-left: auto; text-align: right; font-size: 8.5pt; color: var(--slaba); }

  /* ── Text ─────────────────────────────────────────────────────────────── */
  h1 {
    font-size: 17pt; font-weight: 800; color: var(--tmava);
    margin: 0 0 4px; letter-spacing: -0.4px; line-height: 1.2;
  }
  h2 {
    font-size: 12pt; font-weight: 700; color: var(--zelena);
    margin: 26px 0 10px; padding-bottom: 5px;
    border-bottom: 1px solid var(--linka);
    /* Nadpis sám na konci strany je horší než o kúsok kratšia strana. */
    break-after: avoid; page-break-after: avoid;
  }
  h1 + p { color: var(--slaba); font-size: 9pt; margin: 0 0 4px; }
  p { margin: 0 0 8px; }
  strong { color: var(--tmava); font-weight: 650; }
  em { color: var(--slaba); font-style: italic; }

  ul { margin: 0 0 12px; padding-left: 0; list-style: none; }
  li {
    position: relative; padding-left: 16px; margin-bottom: 5px;
    break-inside: avoid; page-break-inside: avoid;
  }
  li::before {
    content: ""; position: absolute; left: 3px; top: 0.55em;
    width: 5px; height: 5px; border-radius: 50%; background: var(--zelena-svetla);
  }

  blockquote {
    margin: 12px 0 16px; padding: 9px 13px;
    background: var(--pozadie); border-left: 3px solid var(--zelena-svetla);
    border-radius: 0 6px 6px 0;
    font-size: 9pt; color: var(--slaba); line-height: 1.5;
    break-inside: avoid; page-break-inside: avoid;
  }

  /* ── Tabuľky ──────────────────────────────────────────────────────────── */
  table {
    width: 100%; border-collapse: collapse; margin: 6px 0 18px;
    font-size: 9pt;
  }
  /* Hlavička sa opakuje na každej strane — inak je druhá strana tabuľky
     zoznam čísel bez toho, čo znamenajú. */
  thead { display: table-header-group; }
  th {
    text-align: left; font-weight: 650; color: #fff; background: var(--zelena);
    padding: 6px 9px; white-space: nowrap;
  }
  th:first-child { border-radius: 5px 0 0 0; }
  th:last-child { border-radius: 0 5px 0 0; }
  td { padding: 5px 9px; border-bottom: 1px solid var(--linka); vertical-align: top; }
  tbody tr:nth-child(even) { background: var(--pozadie); }
  tr { break-inside: avoid; page-break-inside: avoid; }
  /* Čísla doprava, aby sa dali porovnávať očami. */
  td:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
  th:not(:first-child) { text-align: right; }

  /* ── Grafy ────────────────────────────────────────────────────────────── */
  .graf-obal {
    margin: 4px 0 18px; padding: 10px 12px;
    background: #fff; border: 1px solid var(--linka); border-radius: 7px;
    /* Graf rozseknutý medzi dve strany je nečitateľný. */
    break-inside: avoid; page-break-inside: avoid;
  }
  .graf-obal svg { display: block; width: 100%; height: auto; }

  /* ── Pätka ────────────────────────────────────────────────────────────── */
  .patka {
    margin-top: 26px; padding-top: 10px; border-top: 1px solid var(--linka);
    font-size: 8pt; color: var(--slaba); display: flex; gap: 10px;
  }
  .patka span:last-child { margin-left: auto; }
</style>
</head>
<body>
  <div class="hlavicka">
    <div class="znak">PSB</div>
    <div>
      <div class="nazov">ProSapiens Biomechanic</div>
      <div class="podnazov">${esc(podnadpis)}</div>
    </div>
    <div class="datum">${esc(den)}</div>
  </div>
  ${telo}
  <div class="patka">
    <span>Vygenerované z Trackera — čísla sedia s tým, čo appka ukazuje na dashboarde.</span>
    <span>ProSapiens Biomechanic</span>
  </div>
</body>
</html>`;
}

/**
 * Otvorí tlačový dialóg nad skrytým rámom. Rám, nie nové okno: nové okno
 * blokujú blokovače vyskakovacích okien a na telefóne sa otvorí ako ďalšia
 * karta, ktorú musí človek zavrieť ručne.
 */
export function vytlacReport(md: string, podnadpis: string, grafy: Record<string, string> = {}): void {
  const doc = reportDocument(md, podnadpis, grafy);
  const ram = document.createElement("iframe");
  ram.setAttribute("aria-hidden", "true");
  ram.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
  document.body.appendChild(ram);

  const uprac = () => setTimeout(() => ram.remove(), 1000);
  ram.onload = () => {
    const w = ram.contentWindow;
    if (!w) { uprac(); return; }
    w.focus();
    // Safari potrebuje tik navyše, inak vytlačí prázdnu stranu.
    setTimeout(() => {
      try { w.print(); } finally { uprac(); }
    }, 120);
  };
  ram.srcdoc = doc;
}
