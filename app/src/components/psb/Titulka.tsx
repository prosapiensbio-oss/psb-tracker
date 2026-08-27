import { useEffect, useMemo, useRef, useState } from "react";

import { C } from "../../lib/psb/theme";
import {
  farby, type Kluc, MAX_RIADKOV_NADPIS, navrhNadpisu, priDlhy, type Rezim,
  RODINA, sirkaRiadku, type Slovo, styl, textRiadku, zalam, zalamKusy,
} from "../../lib/psb/titulka";
import { vloz, vlozZDataUri, type Vlozena } from "../../lib/psb/titulkaFoto";
import { HIGGSFIELD, promptObrazka } from "../../lib/psb/titulkaPrompt";
import {
  BEZ_UPRAVY, citaj, jeUpravene, NAJMENSI_PODIEL, NAZOV_ROLY, navrhniSkladbu,
  PLATNO, pouziUpravy, prichytenie, REZ, rezyCisla, ROLE_S_MIERKOU, ROLU,
  ROLE_SO_ZAROVNANIM, type Rola, roleSkladby, SKLADBA_MAPA, SKLADBY, svgSkladby,
  type Upravy, VAHA_TENKA, type Zarovnanie, zapis, type Zvonku,
} from "../../lib/psb/titulkaSkladby";
import { mimoZony, VODIDLA, vodidlaDoSvg } from "../../lib/psb/titulkaVodidla";
import { Info, Modal } from "./ui";

/**
 * Titulka príspevku — sadzba, nie generovanie obrázka.
 *
 * PREČO TO NEROBÍ HIGGSFIELD
 *
 * Generátor obrázkov zlyhá na dvoch veciach naraz: na diakritike (každé í, ě,
 * ř je miesto na prekresľovanie) a na konzistencii v čase — ten istý prompt
 * dá o mesiac inú hrúbku písma a iné okraje. Titulka PSB pritom NIE JE
 * ilustrácia, je to sadzba. To sa dá spočítať presne, a spočítané to vyzerá
 * o rok rovnako.
 *
 * ČO ROBÍ TENTO SÚBOR A ČO UŽ NIE
 *
 * Tu je len MERANIE a obsluha. Rozvrh je v `titulkaSkladby.ts` ako dáta,
 * lebo skladieb bude sedem. A náhľad je TEN ISTÝ reťazec SVG ako export —
 * prvá verzia kreslila náhľad v DOM a export v SVG, dva kódy, ktoré museli
 * dať to isté. Nedali: raz sa rozišli o zalomenie, raz o účiaru.
 */

/** Mierka náhľadu. Sadzba je vždy v plnom rozlíšení. */
const MIERKA = 0.24;

// ————— meracia plocha —————

let hostitel: HTMLDivElement | null = null;
function host(): HTMLDivElement {
  if (!hostitel || !hostitel.isConnected) {
    hostitel = document.createElement("div");
    hostitel.setAttribute("aria-hidden", "true");
    hostitel.style.cssText =
      "position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:pre";
    document.body.appendChild(hostitel);
  }
  return hostitel;
}

function cssStylu(k: Kluc, vaha = k.vaha): string {
  const s = styl(k);
  return `font-family:${s.fontFamily};font-size:${s.fontSize};font-weight:${vaha};` +
    `font-variation-settings:"wght" ${vaha}, "wdth" ${k.sirkaOsi};letter-spacing:${s.letterSpacing}`;
}

/**
 * Šírka reťazca a účiara v riadkovom boxe — obe od prehliadača, nie odhadom.
 *
 * Meracie prvky sa DRŽIA v DOM a recyklujú sa. Prvá verzia ich po zmeraní
 * upratala a až potom vrátila meraciu funkciu — odpojený prvok vracia šírku 0,
 * takže sa „zmestilo" úplne všetko a každý nadpis vyšiel na jeden riadok.
 */
const kes = new Map<string, { meraj: (t: string) => number; baseline: number }>();

function metriky(k: Kluc, vaha = k.vaha): { meraj: (t: string) => number; baseline: number } {
  const kluc = `${k.velkost}/${k.prokladanie}/${vaha}/${k.sirkaOsi}/${k.tracking}`;
  const mam = kes.get(kluc);
  if (mam) return mam;

  const h = host();
  const span = document.createElement("span");
  span.style.cssText = `display:inline-block;white-space:pre;${cssStylu(k, vaha)}`;
  h.appendChild(span);
  const meraj = (t: string) => { span.textContent = t; return span.getBoundingClientRect().width; };

  // Účiara: prázdny inline-block na `vertical-align: baseline` má vrchol
  // presne na účiare. Počítať ju z metrík rezu by znamenalo hádať — a posunuté
  // riadky v exporte oproti náhľadu.
  const box = document.createElement("div");
  box.style.cssText = `line-height:${k.prokladanie}px;${cssStylu(k, vaha)}`;
  box.appendChild(document.createTextNode("Hxg"));
  const sonda = document.createElement("span");
  sonda.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
  box.appendChild(sonda);
  h.appendChild(box);
  const baseline = sonda.getBoundingClientRect().top - box.getBoundingClientRect().top;

  const von = { meraj, baseline };
  kes.set(kluc, von);
  return von;
}

/**
 * Optické zarovnanie ľavého okraja.
 *
 * Písmená nezačínajú tam, kde začína ich šírka. Guľaté O, C, S a hlavne
 * úvodzovky majú predsádzku, takže riadok zarovnaný matematicky na 96 px
 * vyzerá zatiahnutý dnu a stĺpec nadpisu sa kýve. Predsádzka sa preto meria
 * a riadok sa o ňu posunie von.
 */
const kesPosun = new Map<string, number>();

function optickyPosun(znak: string, k: Kluc, vaha: number): number {
  const kluc = `${znak}/${k.velkost}/${vaha}/${k.sirkaOsi}`;
  const mam = kesPosun.get(kluc);
  if (mam !== undefined) return mam;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("style", "position:absolute;width:900px;height:400px");
  const t = document.createElementNS(ns, "text");
  t.setAttribute("x", "0"); t.setAttribute("y", "300");
  t.setAttribute("font-family", RODINA);
  t.setAttribute("font-size", String(k.velkost));
  t.setAttribute("font-weight", String(vaha));
  t.setAttribute("style", `font-variation-settings:"wght" ${vaha},"wdth" ${k.sirkaOsi}`);
  t.textContent = znak;
  svg.appendChild(t);
  host().appendChild(svg);
  let posun = 0;
  try {
    posun = t.getStartPositionOfChar(0).x - t.getExtentOfChar(0).x;
  } catch { /* prázdny znak — posun zostáva nulový */ }
  svg.remove();
  // Záporná predsádzka sa neopravuje — ťahať riadok dnu by okraj rozkolísalo
  // z druhej strany.
  const von = Math.max(0, Math.round(posun * 10) / 10);
  kesPosun.set(kluc, von);
  return von;
}

/** Je Agrandir naozaj v systéme? Bez neho by export ticho vyzeral inak. */
function agrandirJe(): boolean {
  const h = host();
  const skus = (rodina: string) => {
    const s = document.createElement("span");
    s.style.cssText = `display:inline-block;white-space:pre;font-size:110px;font-weight:800;font-family:${rodina}`;
    s.textContent = "Bolest zad není problém";
    h.appendChild(s);
    const w = s.getBoundingClientRect().width;
    s.remove();
    return w;
  };
  return Math.abs(skus('"Agrandir Variable", monospace') - skus('"ZiadneTakePismo", monospace')) > 1;
}

// ————— značka —————

type Kresba = { sirka: number; vyska: number; obsah: string };
const znacky = new Map<string, Kresba>();

/**
 * Načíta vektor značky z prílohy appky.
 *
 * Logo je vytiahnuté ako PRAVÝ VEKTOR z Jerryho `Logo-01.ai` — zmenšené PNG
 * by sa pri vláskovej kresbe rozmazalo na sivú kašu. Je to 80 kB ciest, takže
 * sa neťahá pri štarte, ale až keď sa titulka otvorí, a raz za reláciu.
 */
async function nacitajZnacku(meno: "figura" | "napis"): Promise<Kresba | null> {
  const mam = znacky.get(meno);
  if (mam) return mam;
  try {
    const r = await fetch(`/znacka-${meno}.svg`);
    if (!r.ok) return null;
    const txt = await r.text();
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(txt);
    if (!vb) return null;
    const k = {
      sirka: Number(vb[1]), vyska: Number(vb[2]),
      obsah: txt.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, ""),
    };
    znacky.set(meno, k);
    return k;
  } catch {
    return null;
  }
}

type Snimka = { upravy: Upravy; foto: Vlozena | null };

export function Titulka({ zdroj, mesiac, faza, kluc, ulozene, onUloz, onZavri }: {
  zdroj: { koncept?: string; hotovyText?: string; scenar?: string };
  mesiac: string;
  faza: number;
  /** Stabilný kľúč príspevku — rozptyľuje skladby vo feede. */
  kluc: string;
  /** Uložené nastavenie ako JSON. Prázdne = ešte sa nič nenastavovalo. */
  ulozene: string;
  /** Chýba pri nenaplánovanom slote — nastavenie nemá kde bývať. */
  onUloz?: (json: string) => Promise<boolean>;
  onZavri: () => void;
}) {
  const nacitane = useMemo(() => citaj(ulozene), [ulozene]);
  // Skladba sa NAVRHNE z toho, čo appka o príspevku vie. Vyberať ju pri
  // každom príspevku by znamenalo rozhodnutie navyše — a rozhodnutia sa
  // časom rozídu, čo je presne to, ako konzistencia umiera.
  const [skladbaId, setSkladbaId] = useState(() =>
    nacitane?.skladba ?? navrhniSkladbu({
      faza,
      text: [zdroj.koncept, zdroj.hotovyText, zdroj.scenar].filter(Boolean).join("\n"),
      kluc,
    }).id);
  const [nadpis, setNadpis] = useState(() => nacitane?.nadpis ?? navrhNadpisu(zdroj));
  const [podnadpis, setPodnadpis] = useState(nacitane?.podnadpis ?? "");
  const [cislo, setCislo] = useState(nacitane?.cislo ?? "");
  const [jednotka, setJednotka] = useState(nacitane?.jednotka ?? "");
  const [stitok, setStitok] = useState(nacitane?.stitok ?? "BIOMECHANIKA");
  const [rezim, setRezim] = useState<Rezim>(nacitane?.rezim ?? "svetly");
  const [pismoJe, setPismoJe] = useState(true);
  const [stav, setStav] = useState("");
  /**
   * Chyba, ktorá NEZMIZNE sama.
   *
   * Priebežné hlásenia („navrhnuté ✓") sa po chvíli hodia preč, aby okno
   * nezavadzalo. Lenže rovnako mizli aj chyby — Jerry klikol na návrh na
   * prázdnom slote, hláška „nie je z čoho vychádzať" preblikla a on videl
   * len to, že sa nič nevyplnilo (26. 8. 2026).
   */
  const [chyba, setChyba] = useState("");
  const [prekreslenie, setPrekreslenie] = useState(0);
  const [logo, setLogo] = useState<{ napis: Kresba | null; figura: Kresba | null }>(
    { napis: null, figura: null },
  );
  const [foto, setFoto] = useState<Vlozena | null>(null);
  const [fotkaZDB, setFotkaZDB] = useState(false);
  const [nadFotkou, setNadFotkou] = useState(false);
  const [vodidla, setVodidla] = useState<string[]>([]);
  const [zoznamStylov, setZoznamStylov] = useState(false);
  const [upravy, setUpravy] = useState<Upravy>(nacitane?.upravy ?? {});
  const [vybrata, setVybrata] = useState<Rola | null>(null);
  const nahlad = useRef<HTMLDivElement>(null);
  const tah = useRef<{ rola: Rola; x: number; y: number; dx: number; dy: number; snimka: Snimka; ulozena: boolean } | null>(null);

  /**
   * Krok späť.
   *
   * Jerry: „pri tvorbe titulky mi chýba nejaký krok späť keby som urobil
   * chybu" (26. 8. 2026). Najdrahšia chyba je „vrátiť všetko na východzie" —
   * jedno kliknutie zmaže celé popoludnie posúvania.
   *
   * Snímka drží ÚPRAVY AJ FOTKU, lebo obe sa dajú prepísať jedným pohybom
   * (nová fotka zároveň vynuluje výrez). Ťahanie sa zapamätá RAZ na začiatku
   * gesta, nie pri každom pixeli — inak by dvadsať krokov späť vrátilo dva
   * centimetre. História má strop 24 krokov: fotka je dátový reťazec a sto
   * snímok by bola desiatky megabajtov v pamäti.
   */
  const [historia, setHistoria] = useState<Snimka[]>([]);
  function zapamataj(s?: Snimka) {
    setHistoria((h) => [...h.slice(-23), s ?? { upravy, foto }]);
  }
  function spat() {
    const s = historia[historia.length - 1];
    if (!s) return;
    setUpravy(s.upravy);
    setFoto(s.foto);
    setVybrata(null);
    setHistoria((h) => h.slice(0, -1));
  }

  const skladba = SKLADBA_MAPA.get(skladbaId) ?? SKLADBY[0];

  // ⌘Z / Ctrl+Z. Ruka ide po tejto skratke skôr, než oko nájde tlačidlo.
  // Nie keď sa píše do políčka — tam patrí undo textu, nie plátna.
  useEffect(() => {
    function klaves(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const c = document.activeElement?.tagName;
      if (c === "INPUT" || c === "TEXTAREA") return;
      e.preventDefault();
      spat();
    }
    window.addEventListener("keydown", klaves);
    return () => window.removeEventListener("keydown", klaves);
  }, [historia]);

  // Písmo sa načítava asynchrónne; merať pred `document.fonts.ready` znamená
  // merať fallback a zalomiť riadky na nesprávnom mieste.
  useEffect(() => {
    let zive = true;
    document.fonts.ready.then(() => {
      if (!zive) return;
      kes.clear(); kesPosun.clear();
      setPismoJe(agrandirJe());
      setPrekreslenie((n) => n + 1);
    });
    Promise.all([nacitajZnacku("napis"), nacitajZnacku("figura")]).then(([napis, figura]) => {
      if (zive) setLogo({ napis, figura });
    });
    // Fotka žije vo vlastnej tabuľke, nie v riadku nápadu — ťahá sa až tu,
    // keď sa titulka naozaj otvorí.
    if (kluc) {
      fetch(`/api/napad-obrazok?id=${encodeURIComponent(kluc)}&druh=titulka`, { credentials: "same-origin" })
        .then((r) => r.json())
        .then((o: { ok?: boolean; obrazok?: { dataUri: string; sirka: number; vyska: number } | null }) => {
          if (!zive || !o.ok || !o.obrazok) return;
          setFoto({ ...o.obrazok, kb: Math.round((o.obrazok.dataUri.length * 3) / 4 / 1024) });
          setFotkaZDB(true);
        })
        .catch(() => { /* bez fotky sa titulka otvorí tak či tak */ });
    }
    return () => { zive = false; };
  }, []);

  const sadzba = useMemo(() => {
    void prekreslenie;
    if (typeof document === "undefined") return null;
    const ziadany = skladba.nadpis.rez;
    const stlpec = skladba.nadpis.sirka;

    /**
     * Nadpis sa musí zmestiť do stĺpca.
     *
     * Skladba si veľkosť ŽELÁ, ale jedno dlhé slovo ju prebije: „Sklapovačky."
     * má pri 200 px 1 240 px a stĺpec 888. Bez tohto krokovania text pretekal
     * cez okraj a vyzeralo to ako chyba appky. Zmenšuje sa v krokoch, lebo
     * menšie písmo mení zalomenie a s ním aj najdlhší riadok.
     */
    // Mierka nadpisu ide do MERANIA, nie do hotových prvkov: väčšie písmo
    // mení zalomenie, a to vie povedať len prehliadač.
    let velkost = Math.round(ziadany.velkost * (upravy.nadpis?.k ?? 1));
    let rez = ziadany;
    let riadky: Slovo[][] = [];
    let hrube = metriky(rez, rez.vaha);
    for (let pokus = 0; pokus < 4; pokus++) {
      rez = {
        ...ziadany, velkost,
        prokladanie: Math.round(ziadany.prokladanie * (velkost / ziadany.velkost)),
      };
      hrube = metriky(rez, rez.vaha);
      const tenke = metriky(rez, VAHA_TENKA);
      riadky = zalamKusy(nadpis, stlpec, (t, tenky) => (tenky ? tenke : hrube).meraj(t));
      const najsirsi = riadky.reduce(
        (m, r) => Math.max(m, sirkaRiadku(r, (t, tenky) => (tenky ? tenke : hrube).meraj(t))), 0);
      if (najsirsi <= stlpec || !najsirsi) break;
      const dalsia = Math.max(
        Math.round(ziadany.velkost * NAJMENSI_PODIEL * (upravy.nadpis?.k ?? 1)),
        Math.floor(velkost * (stlpec / najsirsi)),
      );
      if (dalsia >= velkost) break;
      velkost = dalsia;
    }

    // Číslo s jednotkou musí do stĺpca rovnako ako nadpis. „18 MĚSÍCŮ" je pri
    // východzích rezoch širšie než 888 px a jednotka dobieha okraj.
    let mierkaCisla = 1;
    if (cislo.trim()) {
      for (let pokus = 0; pokus < 3; pokus++) {
        const rc = rezyCisla(mierkaCisla);
        const w = metriky(rc.cislo).meraj(cislo.trim())
          + (jednotka.trim() ? metriky(rc.jednotka).meraj(` ${jednotka.trim()}`) : 0);
        if (w <= stlpec || !w) break;
        mierkaCisla = Math.max(0.45, mierkaCisla * (stlpec / w));
      }
    }

    return {
      rez,
      rezCisla: rezyCisla(mierkaCisla),
      zmensene: velkost < ziadany.velkost,
      nadpis: riadky,
      podnadpis: zalam(podnadpis, stlpec, metriky(REZ.podnadpis).meraj),
      // Účiara pre ktorýkoľvek rez. Meranie je kešované, takže volanie
      // z vykresľovania nič nestojí — a skladby už nie sú viazané na tri
      // veľkosti, ktoré skelet náhodou poznal.
      baseline: (k: Kluc) => metriky(k, k.vaha).baseline,
      posun: riadky.map((r) => {
        const prve = r[0];
        return prve ? optickyPosun(prve.text[0] || "", rez, prve.tenky ? VAHA_TENKA : rez.vaha) : 0;
      }),
    };
  }, [nadpis, podnadpis, cislo, jednotka, prekreslenie, skladba, upravy.nadpis?.k]);

  const zvonku: Zvonku | null = useMemo(() => !sadzba ? null : ({
    baseline: sadzba.baseline,
    znacka: {
      napis: logo.napis ?? undefined,
      figura: logo.figura ?? undefined,
    },
    // Posun a mierka pri role „fotka" menia VÝREZ, nie rám: rámom je pri
    // týchto skladbách celé plátno alebo tvar písmen, takže posunúť ho znamená
    // spraviť dieru.
    obrazok: foto
      ? { uri: foto.dataUri, sirka: foto.sirka, vyska: foto.vyska, vyrez: { ...BEZ_UPRAVY, ...upravy.fotka } }
      : undefined,
  }), [sadzba, logo.napis, logo.figura, foto, upravy.fotka]);

  async function prijmi(subor: File | null | undefined) {
    if (!subor) return;
    setStav("zmenšujem…");
    try {
      const v = await vloz(subor);
      zapamataj();
      setFoto(v);
      setStav(`fotka ${v.sirka}×${v.vyska}, ${v.kb} kB ✓`);
    } catch (e) {
      setStav(e instanceof Error ? e.message : String(e));
    }
    setTimeout(() => setStav(""), 3500);
  }

  /** Prvky skladby s ručnými úpravami — jeden zoznam pre náhľad aj export. */
  const prvky = useMemo(() => {
    if (!sadzba) return [];
    return pouziUpravy(skladba.zloz({
      f: farby(rezim), stitok, nadpis: sadzba.nadpis, podnadpis: sadzba.podnadpis,
      cislo, jednotka, maFotku: !!foto, posun: sadzba.posun,
      baseline: sadzba.baseline, rezNadpisu: sadzba.rez, rezCisla: sadzba.rezCisla,
    }), upravy);
  }, [sadzba, skladba, rezim, stitok, cislo, jednotka, foto, upravy]);

  const role = useMemo(() => roleSkladby(prvky), [prvky]);

  /**
   * Ako je prvok zarovnaný TERAZ — vrátane východzieho zo skladby.
   *
   * Podpis stojí východzie na strede, nadpis v zvislom reze inde než na okraji.
   * Zvýrazniť napevno „vľavo" by klamalo o stave, ktorý na plátne vidieť nie je.
   */
  const zarovnanieRoly = (r: Rola): Zarovnanie => {
    if (upravy[r]?.zarovnanie) return upravy[r]!.zarovnanie!;
    const p = prvky.find((x) => x.rola === r) as { zarovnanie?: Zarovnanie } | undefined;
    return p?.zarovnanie ?? "vlavo";
  };
  // Dlhý text vytlačí podnadpis nižšie, než kam Instagram dovidí. Ticho by to
  // znamenalo vetu, ktorú si Jerry prečíta na obrazovke a v telefóne nikto.
  const mimo = useMemo(() => mimoZony(prvky), [prvky]);

  /** Export nenesie značky na chytanie — v PNG by to bola mŕtva váha. */
  const svg = useMemo(
    () => (zvonku ? svgSkladby(prvky, zvonku, skladba.id) : ""),
    [prvky, zvonku, skladba.id],
  );
  // Vodidlá idú LEN do náhľadu. V PNG by to boli oranžové čiary cez titulku.
  const svgNahlad = useMemo(() => {
    if (!zvonku) return "";
    const zaklad = svgSkladby(prvky, zvonku, `n${skladba.id}`, true);
    if (!vodidla.length) return zaklad;
    // Pred POSLEDNÉ `</svg>`, nie pred prvé: značka je vnorené `<svg>` s vlastnou
    // sústavou, takže vložené tam by sa vodidlá kreslili v mierke loga.
    const koniec = zaklad.lastIndexOf("</svg>");
    return zaklad.slice(0, koniec) + vodidlaDoSvg(vodidla) + zaklad.slice(koniec);
  }, [prvky, zvonku, skladba.id, vodidla]);

  function uprav(rola: Rola, zmena: Partial<typeof BEZ_UPRAVY>) {
    // Počas ťahania sa snímka berie v `tahaj`, raz. Mimo neho je každé
    // volanie samostatná akcia (zarovnanie, mierka) a patrí do histórie.
    if (!tah.current) zapamataj();
    setUpravy((u) => ({ ...u, [rola]: { ...BEZ_UPRAVY, ...u[rola], ...zmena } }));
  }

  function chyt(e: React.PointerEvent) {
    const ciel = (e.target as Element).closest?.("[data-rola]");
    const rola = ciel?.getAttribute("data-rola") as Rola | undefined;
    if (!rola) { setVybrata(null); return; }
    setVybrata(rola);
    const u = { ...BEZ_UPRAVY, ...upravy[rola] };
    tah.current = { rola, x: e.clientX, y: e.clientY, dx: u.dx, dy: u.dy,
      snimka: { upravy, foto }, ulozena: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function tahaj(e: React.PointerEvent) {
    const t = tah.current;
    if (!t) return;
    // Až tu, nie pri stlačení: samotný klik na výber prvku nič nemení a
    // nemá zaplniť históriu prázdnymi krokmi.
    if (!t.ulozena) { t.ulozena = true; zapamataj(t.snimka); }
    // Náhľad je zmenšený, takže pohyb myšou treba prepočítať na plátno —
    // inak by sa prvok hýbal štvrtinovou rýchlosťou.
    uprav(t.rola, {
      dx: prichytenie(t.dx + (e.clientX - t.x) / MIERKA),
      dy: prichytenie(t.dy + (e.clientY - t.y) / MIERKA),
    });
  }

  function pust() { tah.current = null; }

  /**
   * Uloženie hlási PRAVDU.
   *
   * Optimistický zápis je v poriadku len vtedy, keď sa neúspech dostane späť.
   * Človek, ktorý si myslí, že má hotovo, sa k tomu už nevráti — a práca
   * zmizne bez stopy.
   */
  const [promptSkopirovany, setPromptSkopirovany] = useState(false);
  const [navrhujem, setNavrhujem] = useState(false);
  const [oknoObrazka, setOknoObrazka] = useState(false);
  const [zelanie, setZelanie] = useState("");
  const [vlastnyPrompt, setVlastnyPrompt] = useState("");
  const [robimPrompt, setRobimPrompt] = useState(false);
  const [skopirovane, setSkopirovane] = useState(false);
  const polePromptu = useRef<HTMLTextAreaElement>(null);

  /**
   * Kopírovanie, ktoré POVIE, či sa podarilo.
   *
   * Pôvodne tu bolo `catch(() => {})` — schránka sa dá zakázať aj pri
   * skutočnom kliku a chyba sa ticho zahodila. Jerry klikal a nič sa
   * nekopírovalo, pričom appka tvrdila to isté ako pri úspechu: nič
   * (26. 8. 2026). Druhá cesta je označiť text, nech sa dá vziať ručne.
   */
  async function kopiruj(text: string, pole: HTMLTextAreaElement | null) {
    try {
      await navigator.clipboard.writeText(text);
      setSkopirovane(true);
      setTimeout(() => setSkopirovane(false), 3000);
      return;
    } catch { /* skúsi sa druhá cesta */ }
    if (pole) {
      pole.focus(); pole.select();
      try {
        if (document.execCommand("copy")) {
          setSkopirovane(true);
          setTimeout(() => setSkopirovane(false), 3000);
          return;
        }
      } catch { /* zostane označené */ }
      setChyba("Schránka je zakázaná — text je označený, skopíruj ho cmd+C.");
      return;
    }
    setChyba("Schránka je zakázaná a text sa nedá označiť.");
  }

  /**
   * Nechá texty navrhnúť Jarvisa.
   *
   * Nejde do rozhovoru, ale rovno do polí — okno titulky je formulár a
   * prepisovať návrh z konverzácie späť je presne tá práca, ktorú má návrh
   * ušetriť. Prepíše sa štítok, nadpis aj podnadpis; vrátiť sa dá tak, že
   * si Jerry napíše svoje.
   */
  /** Z čoho môže Jarvis vychádzať. Bez toho nemá čo navrhnúť. */
  const podklad = [zdroj.koncept, zdroj.hotovyText, zdroj.scenar].filter((x) => (x || "").trim()).join(" ");

  async function nechNavrhne() {
    setChyba("");
    setNavrhujem(true);
    setStav("Jarvis premýšľa…");
    try {
      const r = await fetch("/api/titulka-navrh", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          koncept: zdroj.koncept || "", hotovyText: zdroj.hotovyText || "",
          scenar: zdroj.scenar || "", styl: skladba.nazov, faza,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; stitok?: string; nadpis?: string; podnadpis?: string };
      if (!j.ok) { setStav(""); setChyba(j.error || "Návrh sa nepodaril."); return; }
      if (j.stitok) setStitok(j.stitok);
      if (j.nadpis) setNadpis(j.nadpis);
      setPodnadpis(j.podnadpis || "");
      setStav("navrhnuté ✓");
    } catch {
      setStav("");
      setChyba("Návrh zlyhal — spojenie.");
    } finally {
      setNavrhujem(false);
      setTimeout(() => setStav(""), 4000);
    }
  }
  const [generujem, setGenerujem] = useState(false);

  async function kopirujPrompt() {
    const t = promptObrazka({ nadpis, koncept: zdroj.koncept || "", rezim, skladba: skladba.id });
    try {
      await navigator.clipboard.writeText(t);
      setPromptSkopirovany(true);
      setTimeout(() => setPromptSkopirovany(false), 3000);
    } catch {
      setChyba("Schránka je zakázaná — prompt sa nedá skopírovať. Skús cestu „napíš po svojom“, tam sa dá text označiť.");
    }
  }

  /**
   * Obrázok z Workers AI.
   *
   * Beží na tom istom cloudflarovom účte ako appka, takže tu nie je čo
   * nastavovať. Účtuje sa za kus (rádovo desatina centa), preto sa volá len
   * na kliknutie — nikdy sama pri otvorení okna.
   */
  async function vygeneruj(prompt?: string) {
    if (generujem) return;
    setGenerujem(true);
    setStav("generujem obrázok…");
    try {
      const r = await fetch("/api/titulka-obrazok", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Vlastný prompt má prednosť: keď si Jerry obrázok popísal, appka mu
        // ho neprepíše svojím.
        body: JSON.stringify({
          prompt: prompt || promptObrazka({ nadpis, koncept: zdroj.koncept || "", rezim, skladba: skladba.id }),
        }),
      });
      const o = (await r.json()) as { ok?: boolean; dataUri?: string; error?: string };
      if (!o.ok || !o.dataUri) {
        // Bezpečnostný filter Workers AI je na slová o tele prísny, a to je
        // pri biomechanike často. Slepá ulička to ale nie je — prompt sa dá
        // vziať inam.
        if (String(o.error).includes("8007")) {
          throw new Error("bezpečnostný filter odmietol znenie — skús iný nadpis, alebo vezmi prompt do Higgsfieldu");
        }
        throw new Error(o.error || "nevyšlo");
      }
      // Ide tou istou cestou ako fotka z počítača — zmenší sa rovnako.
      const v = await vlozZDataUri(o.dataUri);
      zapamataj();
      setFoto(v);
      // Výrez sa vracia na stred: predchádzajúci patril inej fotke.
      setUpravy((u) => { const n = { ...u }; delete n.fotka; return n; });
      setStav(`obrázok ${v.sirka}×${v.vyska}, ${v.kb} kB ✓`);
    } catch (e) {
      setStav(`generovanie nevyšlo: ${e instanceof Error ? e.message : String(e)}`);
    }
    setGenerujem(false);
    setTimeout(() => setStav(""), 5000);
  }

  /** Z Jerryho vety spraví prompt. Remeslo robí appka, zámer ostáva jemu. */
  async function vyrobPrompt() {
    if (robimPrompt) return;
    setRobimPrompt(true);
    try {
      const r = await fetch("/api/obrazok-prompt", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zelanie, nadpis, rezim }),
      });
      const o = (await r.json()) as { ok?: boolean; prompt?: string; error?: string };
      if (!o.ok || !o.prompt) { setStav(o.error || "Prompt sa nepodaril."); setTimeout(() => setStav(""), 4000); return; }
      setVlastnyPrompt(o.prompt);
    } catch {
      setStav("Prompt zlyhal — spojenie.");
      setTimeout(() => setStav(""), 4000);
    } finally {
      setRobimPrompt(false);
    }
  }

  async function uloz() {
    if (!onUloz) return;
    setStav("ukladám…");
    const ok = await onUloz(zapis({ skladba: skladba.id, rezim, stitok, nadpis, podnadpis, cislo, jednotka, upravy }));
    // Fotka ide vlastnou cestou. Keby sa uložila do riadku nápadu, nafúkla by
    // každú odpoveď plánovača — a to bol pôvodný dôvod, prečo sa neukladala.
    let fotoOk = true;
    if (ok) {
      try {
        const r = await fetch("/api/napad-obrazok", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: kluc, druh: "titulka",
            dataUri: foto?.dataUri ?? "", sirka: foto?.sirka ?? 0, vyska: foto?.vyska ?? 0,
          }),
        });
        fotoOk = ((await r.json()) as { ok?: boolean }).ok === true;
      } catch { fotoOk = false; }
    }
    setStav(!ok ? "nastavenie sa NEULOŽILO"
      : fotoOk ? "uložené ✓" : "nastavenie uložené, ale FOTKA NIE");
    setTimeout(() => setStav(""), 3500);
  }

  async function stiahni() {
    if (!svg) return;
    setStav("kreslím…");
    try {
      const obr = new Image();
      obr.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await new Promise<void>((hotovo, chyba) => {
        obr.onload = () => hotovo();
        obr.onerror = () => chyba(new Error("SVG sa nenačítalo"));
      });
      const platno = document.createElement("canvas");
      platno.width = PLATNO.sirka; platno.height = PLATNO.vyska;
      platno.getContext("2d")!.drawImage(obr, 0, 0);
      const blob = await new Promise<Blob | null>((r) => platno.toBlob(r, "image/png"));
      if (!blob) throw new Error("PNG sa nevyrobilo");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `titulka-${mesiac}-${slug((sadzba?.nadpis ?? []).map(textRiadku).join(" "))}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setStav("stiahnuté ✓");
    } catch (e) {
      setStav(`nevyšlo: ${e instanceof Error ? e.message : String(e)}`);
    }
    setTimeout(() => setStav(""), 3500);
  }

  const riadkyN = sadzba?.nadpis ?? [];

  return (
    <>
    <Modal title="Titulka príspevku" sirka={960} onClose={onZavri}>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 380px", minWidth: 300 }}>
          {/* ŠTÝL. Bežne stačí ten navrhnutý, ale môže prísť príspevok, kde
              sa zíde iný — preto je celý zoznam na jedno kliknutie. */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, margin: "12px 0 4px" }}>
            <span style={{ fontSize: 11.5, color: C.textMuted }}>
              Štýl — {skladba.cislo} · {skladba.nazov}
            </span>
            <button onClick={() => setZoznamStylov((z) => !z)}
              style={{ background: "none", border: 0, padding: 0, color: C.accentLight, fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
              {zoznamStylov ? "skryť zoznam" : "vybrať iný"}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.45 }}>{skladba.kedy}</div>

          {zoznamStylov && (
            <div style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
              {(["slovo", "cislo", "fotka"] as const).map((r) => (
                <div key={r}>
                  <div style={{
                    padding: "6px 10px", background: C.surface, fontSize: 11,
                    color: C.textMuted, letterSpacing: "0.06em", textTransform: "uppercase",
                  }}>
                    {r === "slovo" ? "Slovo — edukácie a otázky"
                      : r === "cislo" ? "Číslo — výsledky a merania"
                      : "Fotka — klientske príbehy"}
                  </div>
                  {SKLADBY.filter((x) => x.rodina === r).map((x) => (
                    <button key={x.id} onClick={() => { setSkladbaId(x.id); setZoznamStylov(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
                        border: 0, borderTop: `1px solid ${C.border}`, cursor: "pointer",
                        background: x.id === skladbaId ? C.accentBg : "transparent",
                        color: C.text, fontFamily: "inherit", fontSize: 12.5,
                      }}>
                      <span style={{ color: C.accentLight }}>{x.cislo}</span> {x.nazov}
                      <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.4, marginTop: 2 }}>{x.kedy}</div>
                    </button>
                  ))}
                </div>
              ))}
              <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textDim, lineHeight: 1.45 }}>
                Chceš niečo, čo tu nie je?{" "}
                <a href="/navrhy-titulky" target="_blank" rel="noreferrer" style={{ color: C.accentLight }}>
                  všetkých štyridsať nástrelov ↗
                </a>
                {" — povedz číslo a doplním ho."}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <button onClick={() => void nechNavrhne()} disabled={navrhujem || !podklad.trim()}
              style={{ ...tlacidlo(false), padding: "6px 12px", fontSize: 12, opacity: navrhujem || !podklad.trim() ? 0.6 : 1 }}>
              {navrhujem ? "Jarvis premýšľa…" : "nech texty navrhne Jarvis"}
            </button>
            <span style={{ fontSize: 11.5, color: C.textDim, marginLeft: 8 }}>
              {podklad.trim()
                ? "vyplní štítok, nadpis aj podnadpis"
                : "najprv vyplň koncept, scenár alebo caption — inak nemá z čoho"}
            </span>
          </div>

          {skladba.polia.includes("stitok") && (
            <>
              <Popisok>Štítok — jedno slovo nad nadpisom</Popisok>
              <input value={stitok} onChange={(e) => setStitok(e.target.value)} style={{ ...vstup, resize: "none" }} />
            </>
          )}

          <Popisok>
            Nadpis{riadkyN.length ? ` · ${riadkyN.length} ${riadkyN.length === 1 ? "riadok" : riadkyN.length < 5 ? "riadky" : "riadkov"}` : ""}
          </Popisok>
          <textarea value={nadpis} onChange={(e) => setNadpis(e.target.value)} rows={3}
            placeholder="tri až šesť slov" style={vstup} />
          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 4, lineHeight: 1.45 }}>
            Slovo v *hviezdičkách* ide tenkým rezom.
          </div>
          {mimo.length > 0 && (
            <div style={{ fontSize: 11.5, color: C.orange, marginTop: 6, lineHeight: 1.45 }}>
              {mimo.map((r) => NAZOV_ROLY[r as Rola] ?? r).join(" a ")}
              {mimo.length > 1 ? " padajú" : " padá"} pod bezpečnú zónu —
              v reeli to prekryje popis s tlačidlami. Skráť text, alebo to prijmi.
            </div>
          )}
          {sadzba?.zmensene && (
            <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 4, lineHeight: 1.45 }}>
              Najdlhšie slovo sa do stĺpca nezmestilo — písmo je zmenšené
              z {skladba.nadpis.rez.velkost} na {sadzba.rez.velkost} px. Kratšie slovo
              udrží skladbu v pôvodnej veľkosti.
            </div>
          )}
          {priDlhy(riadkyN.length) && (
            <div style={{ fontSize: 11.5, color: C.orange, marginTop: 4, lineHeight: 1.45 }}>
              {riadkyN.length} riadkov — vo feede fungujú najviac {MAX_RIADKOV_NADPIS}.
            </div>
          )}

          {skladba.polia.includes("cislo") && (
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: "1 1 55%" }}>
                <Popisok>Číslo</Popisok>
                <input value={cislo} onChange={(e) => setCislo(e.target.value)}
                  placeholder="18" style={{ ...vstup, resize: "none" }} />
              </div>
              <div style={{ flex: "1 1 45%" }}>
                <Popisok>Jednotka</Popisok>
                <input value={jednotka} onChange={(e) => setJednotka(e.target.value)}
                  placeholder="MĚSÍCŮ" style={{ ...vstup, resize: "none" }} />
              </div>
            </div>
          )}

          {skladba.polia.includes("podnadpis") && (
            <>
              <Popisok>Podnadpis — nepovinný</Popisok>
              <textarea value={podnadpis} onChange={(e) => setPodnadpis(e.target.value)} rows={2}
                placeholder="jedna veta, tenkým rezom" style={vstup} />
            </>
          )}

          {skladba.polia.includes("fotka") && (
            <>
              <Popisok>Fotka — prvý snímok z reelu, klient, štúdio</Popisok>
              <label
                onDragOver={(e) => { e.preventDefault(); setNadFotkou(true); }}
                onDragLeave={() => setNadFotkou(false)}
                onDrop={(e) => { e.preventDefault(); setNadFotkou(false); void prijmi(e.dataTransfer.files?.[0]); }}
                style={{
                  display: "block", padding: "14px 12px", textAlign: "center", cursor: "pointer",
                  border: `1px dashed ${nadFotkou ? C.accent : C.border}`, borderRadius: 6,
                  background: nadFotkou ? C.accentBg : "transparent",
                  fontSize: 12, color: C.textMuted, lineHeight: 1.45,
                }}>
                <input type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => void prijmi(e.target.files?.[0])} />
                {foto
                  ? `${foto.sirka}×${foto.vyska}, ${foto.kb} kB — klikni na výmenu`
                  : "pretiahni sem obrázok, alebo klikni"}
              </label>
              {/* GENEROVANIE JE NÁHRADA, NIE PRVÁ VOĽBA. Prompt drží štýl
                  pevnou časťou — nie model. */}
              <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
                Nemáš čo odfotiť?{" "}
                <button onClick={() => void vygeneruj()} disabled={generujem}
                  style={{ background: "none", border: 0, padding: 0, color: C.accentLight, fontSize: 11.5, fontFamily: "inherit", cursor: generujem ? "default" : "pointer", opacity: generujem ? 0.5 : 1 }}>
                  {generujem ? "generujem…" : "vygenerovať tu"}
                </button>
                {" — pár sekúnd, účtuje sa desatina centa. Alebo "}
                <button onClick={kopirujPrompt}
                  style={{ background: "none", border: 0, padding: 0, color: C.accentLight, fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
                  {promptSkopirovany ? "prompt skopírovaný ✓" : "skopíruj prompt"}
                </button>
                {" do "}
                <a href={HIGGSFIELD} target="_blank" rel="noreferrer" style={{ color: C.accentLight }}>Higgsfieldu ↗</a>
                {" a výsledok pretiahni sem. Model dáva štvorec — ktorá časť je vidieť, nastavíš ťahaním fotky."}
              </div>
              <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 4, lineHeight: 1.5 }}>
                Alebo{" "}
                <button onClick={() => setOknoObrazka(true)}
                  style={{ background: "none", border: 0, padding: 0, color: C.accentLight, fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
                  napíš po svojom, čo chceš vidieť
                </button>
                {" — Jarvis z toho spraví prompt."}
              </div>
              {foto && (
                <button onClick={() => { zapamataj(); setFoto(null); }}
                  style={{ background: "none", border: 0, padding: 0, marginTop: 6, color: C.accentLight, fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
                  odobrať fotku
                </button>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            {(["svetly", "tmavy"] as Rezim[]).map((r) => (
              <button key={r} onClick={() => setRezim(r)}
                style={{ ...tlacidlo(rezim === r), padding: "6px 12px", fontSize: 12 }}>
                {r === "svetly" ? "svetlá" : "tmavá"}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            {onUloz && (
              <button onClick={uloz} style={{ ...tlacidlo(false), padding: "8px 12px" }}>
                uložiť nastavenie
              </button>
            )}
            <button onClick={stiahni} disabled={!riadkyN.length}
              style={{ ...tlacidlo(true), opacity: riadkyN.length ? 1 : 0.5 }}>
              stiahnuť PNG
            </button>
          </div>
          {!onUloz && (
            <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6 }}>
              Nastavenie sa dá uložiť až k naplánovanému príspevku — najprv ho ulož.
            </div>
          )}
          {nacitane && (
            <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6, lineHeight: 1.45 }}>
              Načítané uložené nastavenie{fotkaZDB ? " aj s fotkou" : ""}.
            </div>
          )}
          {stav && <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 6 }}>{stav}</div>}
          {chyba && (
            <div style={{ fontSize: 11.5, color: C.orange, marginTop: 6, lineHeight: 1.45 }}>
              {chyba}{" "}
              <button onClick={() => setChyba("")}
                style={{ background: "none", border: 0, padding: 0, color: C.textDim, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                skryť
              </button>
            </div>
          )}

          {!pismoJe && (
            <div style={{ fontSize: 11.5, color: C.orange, marginTop: 10, lineHeight: 1.5 }}>
              Agrandir Variable nie je v tomto počítači nainštalovaný — náhľad aj PNG
              vyjdú iným písmom. Písmo sa berie zo systému, nie z appky.
            </div>
          )}
          {!logo.napis && (
            <div style={{ fontSize: 11.5, color: C.orange, marginTop: 8 }}>
              Značka sa nenačítala — titulka vyjde bez loga.
            </div>
          )}

          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 12, lineHeight: 1.5 }}>
            1080×1920, Agrandir vo váhe 800 a 300 pri šírke 120.
            <Info label=" ostatné skladby" text={
              "Z nástrelov si vybral sedem skladieb v troch rodinách: Slovo (23, 26, 30, 31), " +
              "Číslo (35 = 36) a Fotka (39, 40). Zatiaľ sú živé dve zo Slova — zvyšok pribudne " +
              "podľa plánu v docs/titulka-plan.md. Nástrely ostávajú na /navrhy-titulky."
            } />
          </div>
        </div>

        {/* NÁHĽAD NIE JE APROXIMÁCIA — je to ten istý reťazec ako export,
            len so značkami na chytanie. */}
        <div style={{ flex: "0 0 auto" }}>
          <div style={{
            width: PLATNO.sirka * MIERKA, height: PLATNO.vyska * MIERKA,
            border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden",
            touchAction: "none",
          }}>
            <div
              ref={nahlad}
              onPointerDown={chyt}
              onPointerMove={tahaj}
              onPointerUp={pust}
              onPointerCancel={pust}
              style={{
                width: PLATNO.sirka, height: PLATNO.vyska, transform: `scale(${MIERKA})`,
                transformOrigin: "top left",
              }}
              dangerouslySetInnerHTML={{ __html: svgNahlad }}
            />
          </div>

          {/* UPRAVOVAČ. Posuny, nie pevné pozície — pri zmene textu sa vezú
              so skladbou namiesto toho, aby ostali visieť v prázdne. */}
          <div style={{ width: PLATNO.sirka * MIERKA, marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 6 }}>
              {vybrata
                ? `${NAZOV_ROLY[vybrata]} — ťahaj v náhľade`
                : "klikni v náhľade na prvok, ktorý chceš posunúť"}
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {role.map((r) => (
                <button key={r} onClick={() => setVybrata(r)}
                  style={{
                    ...tlacidlo(vybrata === r), padding: "4px 9px", fontSize: 11,
                    opacity: upravy[r] && jeUpravene({ [r]: upravy[r] }) ? 1 : 0.75,
                  }}>
                  {NAZOV_ROLY[r]}{upravy[r] && jeUpravene({ [r]: upravy[r] }) ? " •" : ""}
                </button>
              ))}
            </div>

            {vybrata && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 11.5, color: C.textDim }}>
                  <span>x {Math.round(upravy[vybrata]?.dx ?? 0)}</span>
                  <span>y {Math.round(upravy[vybrata]?.dy ?? 0)}</span>
                  {vybrata === "fotka" && (
                    <span style={{ color: C.textMuted }}>— ťaháš výrez, nie rám</span>
                  )}
                  {(vybrata === "nadpis" || ROLE_S_MIERKOU.includes(vybrata)) && (
                    <>
                      <span style={{ marginLeft: 6 }}>veľkosť</span>
                      <input type="range" min={vybrata === "fotka" ? 100 : 60} max={160} step={4}
                        value={Math.round((upravy[vybrata]?.k ?? 1) * 100)}
                        onChange={(e) => uprav(vybrata, { k: Number(e.target.value) / 100 })}
                        style={{ flex: "1 1 90px", minWidth: 80 }} />
                      <span>{Math.round((upravy[vybrata]?.k ?? 1) * 100)} %</span>
                    </>
                  )}
                </div>
                {ROLE_SO_ZAROVNANIM.includes(vybrata) && (
                  <div style={{ display: "flex", gap: 5, marginTop: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11.5, color: C.textDim }}>zarovnať</span>
                    {([["vlavo", "vľavo"], ["stred", "na stred"], ["vpravo", "vpravo"]] as [Zarovnanie, string][]).map(([z, nazov]) => (
                      <button key={z} onClick={() => uprav(vybrata, { zarovnanie: z })}
                        style={{
                          ...tlacidlo(zarovnanieRoly(vybrata) === z),
                          padding: "3px 8px", fontSize: 11,
                        }}>
                        {nazov}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { zapamataj(); setUpravy((u) => { const n = { ...u }; delete n[vybrata]; return n; }); }}
                  style={{ background: "none", border: 0, padding: 0, marginTop: 6, color: C.accentLight, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                  vrátiť {ROLU[vybrata]} na východzie
                </button>
              </div>
            )}

            {/* VODIDLÁ. Titulka je 1080×1920, ale v telefóne z nej toľko nikdy
                nie je vidieť — v mriežke sa oreže na 4:5 a spodok prekryje
                popis s tlačidlami. */}
            <div style={{ fontSize: 11.5, color: C.textMuted, margin: "14px 0 5px" }}>
              Vodiace čiary — len v náhľade
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {VODIDLA.map((v) => (
                <button key={v.id} title={v.popis}
                  onClick={() => setVodidla((z) => z.includes(v.id) ? z.filter((x) => x !== v.id) : [...z, v.id])}
                  style={{ ...tlacidlo(vodidla.includes(v.id)), padding: "4px 9px", fontSize: 11 }}>
                  {v.nazov}
                </button>
              ))}
            </div>
            {vodidla.includes("ovladanie") && (
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 5, lineHeight: 1.45 }}>
                Spodný pás je odhad — podľa dĺžky popisu siaha 320 až 430 px.
              </div>
            )}

            <div style={{ display: "flex", gap: 14, alignItems: "baseline", marginTop: 8 }}>
              <button onClick={spat} disabled={historia.length === 0}
                title="⌘Z"
                style={{ background: "none", border: 0, padding: 0, fontFamily: "inherit", fontSize: 11,
                  color: historia.length ? C.accentLight : C.textDim,
                  opacity: historia.length ? 1 : 0.45,
                  cursor: historia.length ? "pointer" : "default" }}>
                ↶ krok späť{historia.length > 1 ? ` (${historia.length})` : ""}
              </button>
            </div>

            {jeUpravene(upravy) && (
              <button onClick={() => { zapamataj(); setUpravy({}); setVybrata(null); }}
                style={{ background: "none", border: 0, padding: 0, marginTop: 8, color: C.accentLight, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                vrátiť všetko
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
      {/* NAVRHNI SI OBRÁZOK. Jerry vie, čo chce vidieť; nemá dôvod vedieť, že
          model potrebuje hex kódy a zoznam zákazov. To je remeslo, nie zámer. */}
      {oknoObrazka && (
        <Modal title="Navrhni si obrázok" sirka={620} onClose={() => setOknoObrazka(false)}>
          <Popisok>Čo chceš na obrázku vidieť — po svojom</Popisok>
          <textarea value={zelanie} onChange={(e) => setZelanie(e.target.value)} rows={3}
            placeholder="napr. chrbtica zboku, jeden stavec zvýraznený, šípka ukazuje na driek"
            style={vstup} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => void vyrobPrompt()} disabled={robimPrompt || zelanie.trim().length < 3}
              style={{ ...tlacidlo(true), padding: "7px 13px", fontSize: 12.5, opacity: robimPrompt || zelanie.trim().length < 3 ? 0.5 : 1 }}>
              {robimPrompt ? "Jarvis píše…" : "vyrob prompt"}
            </button>
            <span style={{ fontSize: 11.5, color: C.textDim }}>
              Jarvis doplní farby, zákazy a formát — ty píš len zámer.
            </span>
          </div>

          {vlastnyPrompt && (
            <>
              <Popisok>Hotový prompt — dá sa doladiť pred použitím</Popisok>
              <textarea ref={polePromptu} value={vlastnyPrompt} onChange={(e) => setVlastnyPrompt(e.target.value)} rows={9}
                style={{ ...vstup, fontSize: 11.5, lineHeight: 1.5 }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => { void vygeneruj(vlastnyPrompt); setOknoObrazka(false); }}
                  disabled={generujem}
                  style={{ ...tlacidlo(true), padding: "7px 13px", fontSize: 12.5, opacity: generujem ? 0.5 : 1 }}>
                  vygenerovať z tohto promptu
                </button>
                <button
                  onClick={() => void kopiruj(vlastnyPrompt, polePromptu.current)}
                  style={{ ...tlacidlo(false), padding: "7px 13px", fontSize: 12.5 }}>
                  {skopirovane ? "skopírované ✓" : "skopírovať do Higgsfieldu"}
                </button>
                <a href={HIGGSFIELD} target="_blank" rel="noreferrer"
                  style={{ alignSelf: "center", fontSize: 11.5, color: C.accentLight }}>
                  otvoriť Higgsfield ↗
                </a>
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
                Keď výsledok sedí na osemdesiat percent, negeneruj odznova — v Higgsfielde
                napíš „Keep everything the same but change…“. Reštart dá zakaždým iný obrázok,
                úprava drží ten, ktorý už skoro sedel.
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function slug(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "bez-nazvu";
}

const vstup: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px",
  background: C.surface, color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 6, fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.5, resize: "vertical",
};

function tlacidlo(hlavne: boolean): React.CSSProperties {
  return {
    padding: "8px 14px", borderRadius: 6, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
    border: `1px solid ${hlavne ? C.accent : C.border}`,
    background: hlavne ? C.accent : "transparent",
    color: hlavne ? "#fff" : C.text,
  };
}

function Popisok({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, color: C.textMuted, margin: "12px 0 4px" }}>{children}</div>;
}
