import { TRENERI } from "./mailFaktury";
import { casHHMM, denCz, type CasPonuky } from "./ponukaTerminov";

/**
 * STRÁNKA PONUKY TERMÍNOV pre klienta — `/t/<token>` (variant B1, Jerry
 * 7. 10. 2026: „A1 a B1"). Dni pod sebou, časy ako tlačidlá, klepni a potvrď.
 *
 * Ako `/u/` a pocitovka: BEZ JavaScriptu (otvára sa z SMS, často v okne
 * správy), výber je `<input type=radio>` a viditeľný cez `:checked + span`,
 * odoslanie je obyčajný formulár. Sadzba zo živého webu (biela, #1A2E24,
 * akcent #2D7D5A, Raleway a Open Sans).
 */

export type StavStranky =
  | { druh: "vyber"; volne: CasPonuky[]; moznosti?: { c: CasPonuky; zaciatky: string[] }[]; platiDo: string; chyba?: string }
  | { druh: "vybrane"; cas: CasPonuky }
  | { druh: "neplati"; preco: "vyprsala" | "zrusene" | "obsadene" };

/**
 * NÁHĽAD KALENDÁRA POD ČASMI (Jerry, 27. 10. 2026: „okrem navrchu, ako sú
 * vypísané dni a časy, dať pod to náhľad kalendára a tam vyznačiť tie časy").
 *
 * Týždeň ako v telefónnom kalendári, v ňom LEN ponúknuté okná — trénerove
 * ostatné tréningy klient nevidí (sú to cudzie mená a časy). Svetlé okno =
 * kedy môže začať; jednohodinové okno je samo tlačidlo (label pre ten istý
 * radio). Vybraný čas sa vyfarbí tmavou hodinou cez `:has()` — stále bez
 * JavaScriptu. Starší prehliadač bez `:has()` ukáže len okná; výber v časoch
 * nad kalendárom funguje ďalej.
 */
type Volba = { den: string; cas: string; hodnota: string; id: string };
const DNI_HLAVICKA = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const naMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const pondelok = (den: string) => {
  const d = new Date(`${den}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const posun = (den: string, n: number) => {
  const d = new Date(`${den}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function kalendarPonukyHtml(moznosti: { c: CasPonuky; zaciatky: string[] }[], volby: Volba[]): string {
  if (!moznosti.length) return "";
  const okna = moznosti.map((m) => ({
    den: m.c.zaciatok.slice(0, 10), od: naMin(m.c.zaciatok.slice(11, 16)), do: naMin(m.c.koniec.slice(11, 16)),
    // Jednohodinové okno má jediný začiatok — klik naň vyberie ten čas.
    volba: m.zaciatky.length === 1 ? volby.find((v) => v.den === m.zaciatky[0].slice(0, 10) && v.cas === m.zaciatky[0].slice(11, 16)) : undefined,
  }));
  const hodOd = Math.max(6, Math.floor(Math.min(...okna.map((o) => o.od)) / 60) - 1);
  const hodDo = Math.min(22, Math.ceil(Math.max(...okna.map((o) => o.do)) / 60) + 1);
  const H = 30; // px na hodinu
  const tyzdne = [...new Set(okna.map((o) => pondelok(o.den)))].sort();
  const hodiny = Array.from({ length: hodDo - hodOd }, (_, i) => hodOd + i);

  const tyzden = (po: string) => {
    const dni = Array.from({ length: 7 }, (_, i) => posun(po, i));
    const stlpce = dni.map((den, i) => {
      const bloky = okna.filter((o) => o.den === den).map((o) => {
        const styl = `top:${((o.od - hodOd * 60) / 60) * H}px;height:${((o.do - o.od) / 60) * H - 2}px`;
        return o.volba
          ? `<label class="okno klik" for="${o.volba.id}" style="${styl}"><span>${esc(o.volba.cas.replace(/^0/, ""))}</span></label>`
          : `<div class="okno" style="${styl}"><span>${Math.floor(o.od / 60)}–${Math.floor(o.do / 60)}${o.do % 60 ? `:${String(o.do % 60).padStart(2, "0")}` : ""}</span></div>`;
      }).join("");
      const vybrane = volby.filter((v) => v.den === den).map((v) =>
        `<div class="vybrane v-${v.id}" style="top:${((naMin(v.cas) - hodOd * 60) / 60) * H}px;height:${H - 2}px">${esc(v.cas.replace(/^0/, ""))}</div>`).join("");
      const ma = okna.some((o) => o.den === den);
      return `<div class="kst${ma ? " ma" : ""}"><div class="kh">${DNI_HLAVICKA[i]}<b>${Number(den.slice(8, 10))}.</b></div><div class="kt" style="height:${hodiny.length * H}px">${bloky}${vybrane}</div></div>`;
    }).join("");
    const [, m1, d1] = po.split("-").map(Number);
    const [, m2, d2] = posun(po, 6).split("-").map(Number);
    return `<div class="ktyzden"><div class="kmes">${d1}. ${m1}. – ${d2}. ${m2}.</div><div class="kmriezka"><div class="khod"><div class="kh"></div><div style="position:relative;height:${hodiny.length * H}px">${hodiny.map((h, i) => `<span style="top:${i * H}px">${h}</span>`).join("")}</div></div>${stlpce}</div></div>`;
  };

  const pravidla = volby.map((v) => `.kal:has(#${v.id}:checked) .v-${v.id}{display:flex}`).join("");
  return `
<div class="kal-nadpis">V kalendáři</div>
<p class="kal-veta">Světle je, kdy můžete začít. Klepnutím na čas nahoře nebo na hodinové okno se váš výběr ukáže tmavě.</p>
${tyzdne.map(tyzden).join("")}
<style>${pravidla}</style>`;
}

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cislo = (t: string) => t.replace(/[^\d+]/g, "");

export function ponukaStrankaHtml(v: { token: string; oslovenie: string; trener: string; logoUrl: string; stav: StavStranky; typ: string }): string {
  const t = TRENERI[v.trener] ? v.trener : "Jerry";
  const tr = TRENERI[t];
  const komu = t === "Terezka" ? "Terezce" : "Filipovi";
  const smsNehodi = `sms:${cislo(tr.telefon)}?&body=${encodeURIComponent("Dobrý den, z poslaných termínů se mi nehodí žádný. Šlo by to jindy?")}`;
  const nadpisUvod = v.typ === "uvodny" ? "Váš úvodní trénink" : "Volné termíny pro vás";
  let telo = "";

  if (v.stav.druh === "vyber") {
    // Začiatky po dňoch: z rozmedzia ich je viac, z hodinového jeden. Ten istý
    // čas z dvoch ponúknutých úsekov (dva pruhy trénerov) sa ukáže raz.
    const moznosti = v.stav.moznosti || v.stav.volne.map((c) => ({ c, zaciatky: [c.zaciatok] }));
    const volby: Volba[] = [];
    for (const m of moznosti) {
      for (const z of m.zaciatky) {
        if (volby.some((x) => x.den === z.slice(0, 10) && x.cas === z.slice(11, 16))) continue;
        volby.push({ den: z.slice(0, 10), cas: z.slice(11, 16), hodnota: `${m.c.id}|${z.slice(11, 16)}`, id: "" });
      }
    }
    volby.sort((a, b) => (a.den + a.cas).localeCompare(b.den + b.cas));
    volby.forEach((x, i) => { x.id = `c${i}`; });
    const dni = [...new Set(volby.map((x) => x.den))];
    const [, m, d] = v.stav.platiDo.split("-").map(Number);
    telo = `
<h1>${esc(nadpisUvod)}</h1>
<p class="veta">${v.oslovenie ? `${esc(v.oslovenie)}, v` : "V"}yberte si, kdy můžete začít — trénink trvá hodinu. Nabídka platí do neděle ${d}. ${m}. nebo do obsazení.</p>
${v.stav.chyba ? `<p class="chyba">${esc(v.stav.chyba)}</p>` : ""}
<form method="post" class="kal">
${dni.map((den) => `
<div class="den"><div class="d">${esc(denCz(den))}</div><div class="casy">
${volby.filter((x) => x.den === den).map((x) => `<label><input type="radio" id="${x.id}" name="cas" value="${esc(x.hodnota)}" required><span>${esc(casHHMM(`${x.den}T${x.cas}`))}</span></label>`).join("")}
</div></div>`).join("")}
${kalendarPonukyHtml(moznosti, volby)}
<div class="spodok">
<button type="submit">Potvrdit termín</button>
<a class="nehodi" href="${esc(smsNehodi)}">Nehodí se mi ani jeden — napsat ${esc(komu)}</a>
</div>
</form>`;
  } else if (v.stav.druh === "vybrane") {
    const c = v.stav.cas;
    telo = `
<div class="hotovo">
<div class="fajka">✓</div>
<h1>Máte zarezervováno</h1>
<p class="veta">Těšíme se na vás. Kdyby se něco změnilo, stačí napsat.</p>
<div class="kedy">${esc(denCz(c.zaciatok))}<br>${esc(casHHMM(c.zaciatok))}–${esc(casHHMM(c.koniec))}<small>${esc(t === "Terezka" ? "Terezka" : "Filip")} · ProSapiens Biomechanic</small></div>
<a class="tlacidlo tmave" href="/t/${esc(v.token)}?ics=1">Přidat do kalendáře</a>
<a class="nehodi" href="sms:${esc(cislo(tr.telefon))}">Napsat ${esc(komu)}</a>
</div>`;
  } else {
    const veta = v.stav.preco === "obsadene"
      ? "Všechny nabídnuté termíny jsou už obsazené."
      : "Tato nabídka termínů už neplatí.";
    telo = `
<h1>${esc(veta)}</h1>
<p class="veta">Napište ${esc(komu)} a pošle vám nové.</p>
<div class="spodok"><a class="tlacidlo" href="${esc(smsNehodi)}">Napsat ${esc(komu)}</a></div>`;
  }

  return `<!doctype html>
<html lang="cs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(nadpisUvod)} — ProSapiens Biomechanic</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&family=Raleway:wght@600;700&display=swap">
<style>
body{margin:0;background:#fff;color:#1A2E24;font-family:'Open Sans',Arial,sans-serif}
.obal{max-width:460px;margin:0 auto;padding:26px 22px 40px}
.logo{height:26px;display:block}
h1{font-family:'Raleway',sans-serif;font-weight:700;font-size:28px;line-height:1.15;margin:22px 0 8px}
.veta{margin:0;font-size:15px;line-height:1.55;color:#5b6b63}
.chyba{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:#fdecea;color:#8a2a1f;font-size:14px;line-height:1.5}
.den{margin-top:22px}
.den .d{font-family:'Raleway',sans-serif;font-weight:700;font-size:16px;margin-bottom:10px}
.casy{display:flex;flex-wrap:wrap;gap:9px}
.casy label{cursor:pointer}
.casy input{position:absolute;opacity:0;pointer-events:none}
.casy span{display:inline-block;padding:13px 18px;border-radius:32px;border:1.5px solid #e3e7e4;font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
.casy input:checked + span{background:#2D7D5A;border-color:#2D7D5A;color:#fff}
.casy input:focus-visible + span{outline:3px solid #8FD3A8;outline-offset:2px}
.spodok{position:sticky;bottom:0;margin-top:26px;padding:14px 0 6px;background:linear-gradient(rgba(255,255,255,0),#fff 28%)}
button,.tlacidlo{display:block;width:100%;box-sizing:border-box;padding:16px;border:0;border-radius:32px;background:#2D7D5A;color:#fff;font:700 16px 'Open Sans',Arial,sans-serif;text-align:center;text-decoration:none;cursor:pointer}
.tmave{background:#1A2E24}
.nehodi{display:block;margin-top:12px;text-align:center;color:#2D7D5A;font-size:14px;font-weight:600;text-decoration:none}
.kal-nadpis{margin-top:30px;font-family:'Raleway',sans-serif;font-weight:700;font-size:16px}
.kal-veta{margin:4px 0 0;font-size:13px;line-height:1.5;color:#5b6b63}
.ktyzden{margin-top:14px}
.kmes{font-size:12px;font-weight:600;color:#5b6b63;margin-bottom:6px}
.kmriezka{display:grid;grid-template-columns:24px repeat(7,1fr);gap:3px;border-radius:16px;background:#f4f6f5;padding:8px 6px 10px}
.kh{height:30px;font-size:11px;color:#8a9890;text-align:center;line-height:1.1}
.kh b{display:block;font-size:14px;color:#1A2E24;font-weight:700}
.kst.ma .kh b{color:#2D7D5A}
.khod span{position:absolute;right:3px;transform:translateY(-6px);font-size:10px;color:#8a9890;font-variant-numeric:tabular-nums}
.kt{position:relative;border-radius:8px;background:#fff;background-image:repeating-linear-gradient(#fff 0 29px,#eceeed 29px 30px)}
.okno{position:absolute;left:2px;right:2px;border-radius:7px;background:#d9ede2;border:1.5px solid #9fd0b5;box-sizing:border-box;display:flex;align-items:flex-start;justify-content:center;overflow:hidden}
.okno span{font-size:10.5px;font-weight:700;color:#2D7D5A;padding-top:3px;font-variant-numeric:tabular-nums}
.okno.klik{cursor:pointer}
.vybrane{display:none;position:absolute;left:2px;right:2px;border-radius:7px;background:#2D7D5A;color:#fff;font-size:11px;font-weight:700;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(45,125,90,.35);pointer-events:none}
.hotovo{text-align:center;padding-top:30px}
.fajka{width:76px;height:76px;margin:0 auto;border-radius:50%;background:#2D7D5A;color:#fff;font-size:40px;line-height:76px}
.kedy{margin:22px 0;padding:18px;border-radius:22px;background:#e7f2ec;font-family:'Raleway',sans-serif;font-weight:700;font-size:20px;line-height:1.35}
.kedy small{display:block;margin-top:6px;font-family:'Open Sans',Arial,sans-serif;font-weight:400;font-size:13px;color:#5b6b63}
</style>
</head><body><div class="obal">
<img class="logo" src="${esc(v.logoUrl)}" alt="ProSapiens Biomechanic">
${telo}
</div></body></html>`;
}
