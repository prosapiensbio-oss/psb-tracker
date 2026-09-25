import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { doSchranky } from "../../lib/psb/kopirovanie";
import { FAZA_MAPA, nazovFazy } from "../../lib/psb/mapaCyklu";
import { oznam, pocuvaj } from "../../lib/psb/obnovaSignal";
import {
  FARBY, RIADOK, STRED, VETVY, farbaUzla, farbaVetvy, jeNaPlan, kusovNaMesiac, mapaNaText, rozlozMapu, rozparsujVysyp, smiePresunut, vetvaUzla, viditelny, type Uzol,
} from "../../lib/psb/mapaNapadov";
import { C, mix } from "../../lib/psb/theme";
import type { Miesto } from "../../lib/psb/mapaNapadov";
import type { AssistantChat } from "./Assistant";
import { Card, H3, Info } from "./ui";

/**
 * MYŠLIENKOVÁ MAPA NÁPADOV.
 *
 * Jerry si ju vypýtal 7. 9. 2026, vtedy sám odložil („zatiaľ nestavaj —
 * dokončime plán v chate“) a 25. 9. si pozrel maketu a povedal postaviť.
 *
 * PREČO KLÁVESNICA
 *
 * Toto je celá vec, nie ozdoba. Plánovač ho nútil vyplniť štruktúru skôr,
 * než premyslel — a tým ho zabil. V mape sa píše: Tab urobí vetvu nižšie,
 * Enter ďalšiu vedľa, kurzor skočí sám. Dvadsať nápadov vysypeš bez toho,
 * aby si sa dotkol myši.
 *
 * PREČO SA NEŤAHÁ MYŠOU
 *
 * Rozloženie sa počíta (`rozlozMapu`), nepamätá. Uložené pozície by znamenali
 * ďalšie dva stĺpce v databáze a mapu, ktorá sa po pridaní uzla rozsype.
 * Skutočné mindmapy to robia takto isto.
 *
 * PREČO TO NIE JE DRUHÝ ZOZNAM NÁPADOV
 *
 * Uzly SÚ riadky v `mkt_napady` — tie isté, ktoré vidí karta Nápady a ktoré
 * sa plánujú do mesiacov. Mapa pridala len `rodic`, `vetva`, `poradie`
 * a `zbalene`. Druhá tabuľka by znamenala dve pravdy o tom, čo sa chystá.
 *
 * PRÁZDNY UZOL SA ZAHODÍ
 *
 * Pravidlo z MindMupu. Kým sa do novej bubliny nenapíšu aspoň tri znaky,
 * neexistuje na serveri; keď z nej odídeš prázdnej, zmizne. Inak by po každom
 * omylom stlačenom Tabe zostal v dátach prázdny riadok.
 */

/** Riadok, ako ho vracia /api/napady. */
type Riadok = {
  id: string; text: string; faza?: number; pos_x?: number | null; pos_y?: number | null; farba?: string;
  rodic?: string; vetva?: string; poradie?: number; zbalene?: number;
  stav?: string; mapa_id?: string;
};

/** Mapa je obal: zoznam nápadov, ktoré patria k sebe. */
type Mapa = { id: string; nazov: string; poradie?: number; pozicie?: string };

const KLUC_MAPY = "psb-mapa-napadov";

const DOCASNY = "tmp";
const KADENCIA = 2;

const mesiacSlovom = (d: Date) => {
  const M = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
  return `${M[d.getMonth()]} ${d.getFullYear()}`;
};

export function MapaNapadov({ chat }: { chat?: AssistantChat }) {
  const [riadky, setRiadky] = useState<Riadok[]>([]);
  const [mapy, setMapy] = useState<Mapa[]>([]);
  /**
   * Ktorá mapa je otvorená. Pamätá sa medzi návštevami — kto si založí mapu
   * na kampaň, nechce ju hľadať pri každom otvorení Marketingu.
   */
  const [mapaId, setMapaId] = useState<string>(() => {
    try { return localStorage.getItem(KLUC_MAPY) || "m-hlavna"; } catch { return "m-hlavna"; }
  });
  const [premenuva, setPremenuva] = useState(false);
  /**
   * `mapaId` aj v refe. `dopis` je `useCallback`, ktorý sa vyrába raz —
   * z uzáveru by mu mapa zamrzla na tej, ktorá bola otvorená pri načítaní,
   * a nápad napísaný po prepnutí by spadol inam. (Nájdené kontrolou 25. 9.)
   */
  /** Escape zahadzuje — a blur, ktorý príde hneď po ňom, nesmie zapísať. */
  const zahadzuje = useRef(false);
  /** Hromadné vysypanie: otvorené pole a vetva, do ktorej to spadne. */
  const [vysyp, setVysyp] = useState<string | null>(null);
  const [vysypVetva, setVysypVetva] = useState("nezaradene");
  const [sypem, setSypem] = useState(false);
  /**
   * KROK SPÄŤ (⌘Z).
   *
   * Mapa nabáda k nedbalosti — „vysyp všetko, potom to usporiadaj" — takže
   * nesmie mať nezvratný pohyb. Zásobník drží posledných dvadsať krokov
   * a každý vie, ako sa vráti. Nežije medzi návštevami: po obnovení stránky
   * je prázdny, rovnako ako v Coggle („works for all changes since the page
   * was reloaded"). Sľubovať viac by znamenalo klamať.
   */
  const [kroky, setKroky] = useState<{ popis: string; vrat: () => Promise<void> }[]>([]);
  const zapamataj = (popis: string, vrat: () => Promise<void>) =>
    setKroky((k) => [...k.slice(-19), { popis, vrat }]);
  const vratKrok = async () => {
    const k = kroky[kroky.length - 1];
    if (!k) return;
    setKroky((z) => z.slice(0, -1));
    await k.vrat();
    nacitaj();
    oznam("marketing");
  };

  const mapaIdRef = useRef(mapaId);
  useEffect(() => { mapaIdRef.current = mapaId; }, [mapaId]);
  const [nacitane, setNacitane] = useState(false);
  const [pohlad, setPohlad] = useState<"mapa" | "triedenie">("mapa");
  const [chyba, setChyba] = useState("");
  /**
   * Rozpísaný uzol, ktorý na serveri ešte nie je. Vždy najviac jeden.
   *
   * Drží sa V REFE, nielen v stave. Prvá verzia čítala koncept zo stavu
   * a `onBlur` ho nikdy neuložil — obsluha videla staršiu podobu, v ktorej
   * bol koncept ešte prázdny, a zahodila ho ako prázdny uzol. Na obrazovke
   * text ostal, do databázy sa nedostal: presne ten tichý zápis, pred ktorým
   * varuje CLAUDE.md. Ref vidí vždy to, čo je napísané teraz.
   */
  const [novy, setNovy] = useState<{ rodic: string; vetva: string; poradie: number; text: string } | null>(null);
  const novyRef = useRef<{ rodic: string; vetva: string; poradie: number; text: string } | null>(null);
  const nastavNovy = (d: { rodic: string; vetva: string; poradie: number; text: string } | null) => {
    novyRef.current = d;
    setNovy(d);
  };
  const [text, setText] = useState<string | null>(null);
  const [kopia, setKopia] = useState("");
  const zameraj = useRef<string | null>(null);
  /**
   * Koncept sa ukladá aj SÁM, po sekunde a pol ticha.
   *
   * Nie preto, že by odchod z políčka nestačil — ale preto, že celá appka
   * stojí na pravidle „ticho zlyhávajúci zápis je horší než hlasitá chyba".
   * Napísaná veta sa nesmie stratiť ani vtedy, keď prehliadač obsluhu odchodu
   * z políčka nepošle (zatvorená karta, prepnutá aplikácia, iOS). Uloženie
   * vráti kurzor tam, kde bol, takže sa píše ďalej bez prerušenia.
   */
  const casovac = useRef<number | null>(null);
  /**
   * Priblíženie. Mapa s tridsiatimi nápadmi sa na šírku obrazovky nezmestí
   * a posúvanie doprava je horšie než menšie písmo — v mindmapách sa preto
   * zoom považuje za základnú vec, nie za výbavu. Krok je pevný zoznam, nie
   * plynulé percento: päť rozumných veľkostí sa trafí jedným klikom, kým
   * plynulý posuvník vyžaduje mierenie.
   */
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  /** Pohľad sa raz sám postaví na kmeň; potom už scrolluje človek. */
  const uzVycentrovane = useRef(false);
  /** Nad ktorým uzlom je otvorená ponuka „presunúť do inej vetvy". */
  const [presunPre, setPresunPre] = useState<string | null>(null);
  /**
   * Ťahanie za obrys.
   *
   * Jerry, 25. 9. 2026: „skôr tak, že to chytím za obrys a tým to presuniem,
   * kde chcem." Ponuka ⇄ zostáva — z klávesnice a pre čítačku obrazovky je to
   * jediná cesta — ale myšou je prirodzené nápad chytiť a pustiť inam.
   *
   * Ťahá sa za RÁM okolo bubliny, nie za text: vnútro je políčko, do ktorého
   * sa píše, a keby začínalo ťahanie, nedalo by sa v ňom označiť slovo.
   */
  const [tahanie, setTahanie] = useState<{ id: string; text: string; x: number; y: number; ciel: string | null; odX: number; odY: number } | null>(null);
  const plochaRef = useRef<HTMLDivElement | null>(null);

  const nacitaj = useCallback(() => void fetch("/api/napady", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((j: { napady?: Riadok[]; mapy?: Mapa[] }) => {
      setRiadky(j.napady || []);
      const zoznam = j.mapy || [];
      setMapy(zoznam);
      // Otvorená mapa, ktorú niekto medzitým zmazal, by nechala prázdnu
      // obrazovku bez vysvetlenia — padni na prvú.
      setMapaId((m) => (zoznam.some((x) => x.id === m) ? m : (zoznam[0]?.id || "m-hlavna")));
    })
    .catch(() => {})
    .finally(() => setNacitane(true)), []);
  useEffect(() => { nacitaj(); }, [nacitaj]);
  // Tri karty nad tými istými riadkami sú na jednej obrazovke (mapa, mapa
  // cyklu, nápady) a Jarvis do nich zapisuje tiež. Bez signálu by každá
  // tvrdila svoje, kým človek stránku neobnoví.
  useEffect(() => pocuvaj("marketing", nacitaj), [nacitaj]);

  /** Zápis na server. Vracia úspech — „uložené“ sa nesmie tvrdiť do prázdna. */
  const posli = async (telo: Record<string, unknown>): Promise<string | null> => {
    const j = await fetch("/api/napady", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(telo),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    if (!j?.ok) { setChyba(j?.error || "Zmena sa nezapísala — skús znova."); return null; }
    setChyba("");
    // Úspech musí byť VŽDY pravdivý. Akcie nad mapou (posun vetvy,
    // premenovanie) nevracajú žiadne id, takže prázdny reťazec by sa
    // v `if (await posli(...))` čítal ako neúspech — a krok späť by sa
    // nezapamätal. Stálo to jeden presun vetvy, ktorý sa nedal vrátiť.
    return String(j.id || telo.id || "ok");
  };

  const uzly = useMemo<Uzol[]>(() => {
    const zive = riadky
      .filter((r) => r.stav !== "zamietnuty")
      .filter((r) => (r.mapa_id || "m-hlavna") === mapaId)
      .map((r) => ({
        id: r.id,
        text: r.text || "",
        rodic: r.rodic || "",
        vetva: r.vetva || "nezaradene",
        poradie: Number(r.poradie || 0),
        zbalene: !!r.zbalene,
        faza: Number(r.faza || 0),
        stav: r.stav || "novy",
        posX: r.pos_x ?? null,
        posY: r.pos_y ?? null,
        farba: r.farba || "",
      }));
    if (novy) {
      zive.push({ id: DOCASNY, text: novy.text, rodic: novy.rodic, vetva: novy.vetva, poradie: novy.poradie, zbalene: false, faza: 0, stav: "novy", posX: null, posY: null, farba: "" });
    }
    return zive;
  }, [riadky, novy, mapaId]);

  const nazovMapy = mapy.find((m) => m.id === mapaId)?.nazov || "Obsah";
  /** Ručné miesta kmeňa a vetiev — sú uložené pri mape, nie pri nápade. */
  const rucnePozicie = useMemo<Record<string, { x: number; y: number }>>(() => {
    const raw = mapy.find((m) => m.id === mapaId)?.pozicie || "";
    if (!raw) return {};
    try { return JSON.parse(raw) as Record<string, { x: number; y: number }>; } catch { return {}; }
  }, [mapy, mapaId]);
  const { poz, vyska, sirka } = useMemo(
    () => rozlozMapu(uzly, { text: nazovMapy }, rucnePozicie),
    [uzly, nazovMapy, rucnePozicie],
  );

  /** Uloží rozpísaný uzol (alebo ho zahodí, keď je prázdny). */
  const dopis = useCallback(async (vratFokus = false): Promise<string | null> => {
    if (casovac.current) { clearTimeout(casovac.current); casovac.current = null; }
    const d = novyRef.current;
    if (!d) return null;
    nastavNovy(null);
    const t = d.text.trim();
    if (t.length < 3) { if (t) setChyba("Nápad musí mať aspoň tri znaky — kratší sa nezapísal."); return null; }
    const id = await posli({ text: t, zdroj: "vlastny", rodic: d.rodic, vetva: d.vetva, poradie: d.poradie, mapaId: mapaIdRef.current });
    // Keď zápis neprejde, koncept sa VRÁTI na obrazovku aj s textom. Zmiznúť
    // smie len to, čo je uložené — inak človek napíše vetu a tá sa stratí.
    if (!id) { nastavNovy(d); return null; }
    if (vratFokus) zameraj.current = id;
    zapamataj(`nápad „${t.slice(0, 28)}"`, async () => { await posli({ id, zmaz: true }); });
    nacitaj();
    oznam("marketing");
    return id;
  }, [nacitaj]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Štípanie na trackpade a ctrl+koliesko.
   *
   * Prehliadač posiela štípnutie ako `wheel` s `ctrlKey`; bez `passive:false`
   * sa `preventDefault` ignoruje a namiesto mapy sa priblíži celá stránka.
   * Preto natívny poslucháč, nie `onWheel`.
   */
  useEffect(() => {
    const el = plochaRef.current;
    if (!el) return;
    const na = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Priblíženie sa ukotví POD MYŠOU: bod, na ktorý sa človek pozerá,
      // zostane na mieste. Bez toho mapa pri štipnutí ujde a treba ju
      // doháňať posuvníkom.
      const stary = zoomRef.current;
      const novy = Math.min(1.5, Math.max(0.4, Math.round((stary - e.deltaY * 0.0025) * 100) / 100));
      if (novy === stary) return;
      const r = el.getBoundingClientRect();
      const vx = e.clientX - r.left;
      const vy = e.clientY - r.top;
      const bodX = (el.scrollLeft + vx) / stary;
      const bodY = (el.scrollTop + vy) / stary;
      zoomRef.current = novy;
      setZoom(novy);
      // Po prekreslení na novú veľkosť posuň tak, aby ten istý bod mapy
      // ostal pod kurzorom.
      requestAnimationFrame(() => {
        el.scrollLeft = bodX * novy - vx;
        el.scrollTop = bodY * novy - vy;
      });
    };
    el.addEventListener("wheel", na, { passive: false });
    return () => el.removeEventListener("wheel", na);
    // Plocha vzniká až po načítaní a len v pohľade Mapa — s prázdnym zoznamom
    // závislostí by sa poslucháč vešal na ešte neexistujúci prvok a štipnutie
    // by ticho nerobilo nič. (Presne to sa 25. 9. aj stalo.)
  }, [nacitane, pohlad]);

  /**
   * ⌘Z nad mapou. Poslucháč je na dokumente, lebo po zmazaní bubliny už
   * fokus nemá kde sedieť — ale reaguje LEN keď je mapa na obrazovke a keď
   * sa práve nepíše do iného poľa, aby nebral ⌘Z formulárom vedľa.
   */
  useEffect(() => {
    const na = (e: KeyboardEvent) => {
      if (e.key !== "z" && e.key !== "Z") return;
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      const k = document.getElementById("mapa-napadov");
      if (!k) return;
      const kde = document.activeElement as HTMLElement | null;
      const pisemInde = !!kde && (kde.tagName === "TEXTAREA" || (kde.tagName === "INPUT" && !k.contains(kde)));
      if (pisemInde) return;
      // Kým je bublina rozpísaná, ⌘Z patrí textu v nej, nie mape.
      if (novyRef.current) return;
      e.preventDefault();
      void vratKrok();
    };
    document.addEventListener("keydown", na);
    return () => document.removeEventListener("keydown", na);
  });

  /** Postaviť pohľad na kmeň. */
  const naStred = useCallback(() => {
    const el = plochaRef.current;
    if (!el) return;
    const k = poz["koren"];
    const sx = k ? k.x + k.w / 2 : STRED.x;
    const sy = k ? k.y + RIADOK / 2 : STRED.y;
    el.scrollLeft = sx * zoomRef.current - el.clientWidth / 2;
    el.scrollTop = sy * zoomRef.current - el.clientHeight / 2;
  }, [poz]);

  // Pri prvom otvorení mapy: kmeň doprostred okna. Len raz — potom je
  // posúvanie v rukách človeka a appka mu doň nemá skákať.
  useEffect(() => {
    if (!nacitane || pohlad !== "mapa" || uzVycentrovane.current) return;
    uzVycentrovane.current = true;
    requestAnimationFrame(naStred);
  }, [nacitane, pohlad, naStred]);

  /** Odchod z obrazovky koncept nezahodí. */
  useEffect(() => () => {
    if (casovac.current) clearTimeout(casovac.current);
    void dopis();
  }, [dopis]);

  const zaloz = async (rodic: string, vetva: string, poradie: number) => {
    // Koncept sa najprv uloží — a keď má byť rodičom práve on, vezme sa jeho
    // ČERSTVÉ id. Bez toho dostal nový uzol rodiča „tmp", ktorý po uložení
    // prestal existovať, a bublina sa nikdy nevykreslila.
    const noveId = await dopis();
    if (novyRef.current) return;                    // predošlý koncept sa neuložil
    const skutocny = rodic === DOCASNY ? (noveId || "") : rodic;
    if (rodic === DOCASNY && !skutocny) return;
    // Zbalená vetva by nové dieťa schovala skôr, než by sa doň dalo písať.
    const r = skutocny ? riadky.find((x) => x.id === skutocny) : null;
    if (r?.zbalene) { setRiadky((z) => z.map((x) => (x.id === skutocny ? { ...x, zbalene: 0 } : x))); void posli({ id: skutocny, zbalene: false }); }
    nastavNovy({ rodic: skutocny, vetva, poradie, text: "" });
    zameraj.current = DOCASNY;
  };

  const uprav = async (id: string, t: string) => {
    if (id === DOCASNY) {
      if (novyRef.current) nastavNovy({ ...novyRef.current, text: t });
      if (casovac.current) clearTimeout(casovac.current);
      casovac.current = window.setTimeout(() => { void dopis(true); }, 1500);
      return;
    }
    setRiadky((r) => r.map((x) => (x.id === id ? { ...x, text: t } : x)));
  };

  const ulozText = async (id: string, t: string) => {
    if (id === DOCASNY) { await dopis(); return; }
    if (t.trim().length < 3) {
      // Na obrazovke by zostal skrátený text a v databáze pôvodný — tichý
      // rozchod, ktorý si nikto nevšimne. Radšej nahlas a vrátiť.
      setChyba("Nápad musí mať aspoň tri znaky — pôvodný text sa vrátil.");
      nacitaj();
      return;
    }
    const predtym = riadky.find((x) => x.id === id)?.text ?? "";
    if (await posli({ id, text: t.trim() })) {
      if (predtym && predtym !== t.trim()) zapamataj("prepísaný text", async () => { await posli({ id, text: predtym }); });
      oznam("marketing");
    }
  };

  const zmaz = async (id: string) => {
    if (id === DOCASNY) { nastavNovy(null); return; }
    if (uzly.some((u) => u.rodic === id)) {
      setChyba("Najprv presuň alebo zmaž nadväzujúce nápady.");
      return;
    }
    const r = riadky.find((x) => x.id === id);
    if (!(await posli({ id, zmaz: true }))) return;
    // Zmazať sa dá len holý nápad (server to stráži), takže na vrátenie
    // stačí text a miesto v strome. Nové id je iné — a to je jediné, čo sa
    // z pôvodného riadku nevráti.
    if (r) {
      zapamataj(`zmazaný „${(r.text || "").slice(0, 28)}"`, async () => {
        await posli({ text: r.text, zdroj: "vlastny", mapaId: mapaIdRef.current, rodic: r.rodic || "", vetva: r.vetva || "nezaradene", poradie: Number(r.poradie || 0) });
      });
    }
    nacitaj();
    oznam("marketing");
  };

  const prepniZbal = async (u: Uzol) => {
    setRiadky((r) => r.map((x) => (x.id === u.id ? { ...x, zbalene: u.zbalene ? 0 : 1 } : x)));
    if (!(await posli({ id: u.id, zbalene: !u.zbalene }))) nacitaj();
  };

  /**
   * PRESUN DO INEJ VETVY.
   *
   * Nápad sa zavesí priamo pod vetvu a POTOMKOV BERIE SO SEBOU — tí sa na
   * rodiča odkazujú cez `rodic`, takže sa presunie celý konár naraz. Preto sa
   * dá presúvať len na vetvu a o úroveň vyššie: obe cesty sú bezpečné,
   * zatiaľ čo presun pod vlastného potomka by v strome vyrobil kruh.
   */
  const presunDoVetvy = async (u: Uzol, vetva: string) => {
    setPresunPre(null);
    if (u.id === DOCASNY) {
      if (novyRef.current) nastavNovy({ ...novyRef.current, rodic: "", vetva });
      return;
    }
    if (!u.rodic && vetvaUzla(u.id, uzly) === vetva) return;
    const koniec = uzly.filter((x) => !x.rodic && vetvaUzla(x.id, uzly) === vetva).length;
    const predtym = { rodic: u.rodic, vetva: u.vetva, poradie: u.poradie };
    setRiadky((r) => r.map((x) => (x.id === u.id ? { ...x, rodic: "", vetva, poradie: koniec } : x)));
    if (await posli({ id: u.id, rodic: "", vetva, poradie: koniec })) {
      zapamataj("presun do vetvy", async () => { await posli({ id: u.id, ...predtym }); });
    }
    nacitaj();
    oznam("marketing");
  };

  /** O úroveň vyššie: nápad sa prilepí k rodičovi svojho rodiča. */
  const oUrovenVyssie = async (u: Uzol) => {
    setPresunPre(null);
    if (!u.rodic || u.id === DOCASNY) return;
    const rodic = uzly.find((x) => x.id === u.rodic);
    if (!rodic) return;
    if (rodic.rodic) {
      setRiadky((r) => r.map((x) => (x.id === u.id ? { ...x, rodic: rodic.rodic } : x)));
      await posli({ id: u.id, rodic: rodic.rodic });
    } else {
      await presunDoVetvy(u, vetvaUzla(u.id, uzly));
      return;
    }
    nacitaj();
  };

  /**
   * Vysypať naraz: jeden riadok = jeden nápad, odsadenie drží hierarchiu.
   *
   * Zapisuje sa po jednom a v poradí — potomok potrebuje id rodiča, ktoré
   * vráti až server. Pri chybe sa zastaví a povie, koľko sa stihlo: polovica
   * zapísaná a druhá ticho stratená je horšia než jasná hranica.
   */
  const vysypSpusti = async () => {
    const riadkyVysypu = rozparsujVysyp(vysyp || "");
    if (!riadkyVysypu.length) { setVysyp(null); return; }
    setSypem(true);
    const rodicia: string[] = [];
    let hotovo = 0;
    for (const r of riadkyVysypu) {
      const rodic = r.uroven > 0 ? (rodicia[r.uroven - 1] || "") : "";
      const id = await posli({
        text: r.text, zdroj: "vlastny", mapaId: mapaIdRef.current,
        rodic, vetva: rodic ? "" : vysypVetva, poradie: hotovo,
      });
      if (!id) break;
      rodicia[r.uroven] = id;
      rodicia.length = r.uroven + 1;
      hotovo++;
    }
    setSypem(false);
    setVysyp(null);
    if (hotovo < riadkyVysypu.length) setChyba(`Zapísalo sa ${hotovo} z ${riadkyVysypu.length} — zvyšok skús znova.`);
    nacitaj();
    oznam("marketing");
  };

  const prepniMapu = (id: string) => {
    void dopis();
    setPresunPre(null);
    setPremenuva(false);
    setMapaId(id);
    try { localStorage.setItem(KLUC_MAPY, id); } catch { /* súkromný režim */ }
  };

  const novaMapa = async () => {
    const j = await fetch("/api/napady", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "mapa-nova", nazov: `Mapa ${mapy.length + 1}` }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));
    if (!j?.ok) { setChyba(j?.error || "Mapa sa nezaložila."); return; }
    setChyba("");
    prepniMapu(String(j.id));
    setPremenuva(true);
    nacitaj();
  };

  const premenujMapu = async (nazov: string) => {
    const t = nazov.trim().slice(0, 60);
    if (!t) { setChyba("Mapa potrebuje meno."); return; }
    setMapy((m) => m.map((x) => (x.id === mapaId ? { ...x, nazov: t } : x)));
    await posli({ akcia: "mapa-premenuj", mapaId, nazov: t });
  };

  const zmazMapu = async () => {
    const j = await fetch("/api/napady", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "mapa-zmaz", mapaId }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));
    if (!j?.ok) { setChyba(j?.error || "Mapa sa nezmazala."); return; }
    setChyba("");
    prepniMapu("m-hlavna");
    nacitaj();
  };

  /**
   * Položiť bublinu na voľné miesto. Ručná pozícia prebíja výpočet — kto ju
   * posunul, ju posunul, a potomkovia idú s ňou.
   */
  const polozNaMiesto = async (u: Uzol, x: number, y: number) => {
    if (u.id === DOCASNY) return;
    const predtym = { posX: u.posX ?? null, posY: u.posY ?? null };
    const nx = Math.round(x);
    const ny = Math.round(y);
    setRiadky((r) => r.map((z) => (z.id === u.id ? { ...z, pos_x: nx, pos_y: ny } : z)));
    if (await posli({ id: u.id, posX: nx, posY: ny })) {
      zapamataj("posun bubliny", async () => { await posli({ id: u.id, posX: predtym.posX, posY: predtym.posY }); });
      oznam("marketing");
    } else nacitaj();
  };

  /** Uloží miesto kmeňa alebo vetvy (kľúč "koren" / "vetva:<id>"). */
  const ulozPoziciuPevnej = async (kluc: string, x: number, y: number) => {
    const predtym = rucnePozicie;
    const nove = { ...predtym, [kluc]: { x: Math.round(x), y: Math.round(y) } };
    setMapy((m) => m.map((z) => (z.id === mapaId ? { ...z, pozicie: JSON.stringify(nove) } : z)));
    const ok = await posli({ akcia: "mapa-pozicie", mapaId, pozicie: nove });
    if (!ok) { nacitaj(); return; }
    zapamataj("posun bubliny", async () => { await posli({ akcia: "mapa-pozicie", mapaId, pozicie: predtym }); });
    oznam("marketing");
  };

  /** Vrátiť celé rozloženie appke — ručné pozície sa zahodia. */
  const vratRozlozenie = async () => {
    const rucne = uzly.filter((x) => x.posX != null || x.posY != null);
    const pevne = Object.keys(rucnePozicie).length;
    if (!rucne.length && !pevne) return;
    const zaloha = rucne.map((x) => ({ id: x.id, posX: x.posX ?? null, posY: x.posY ?? null }));
    const zalohaPevnych = rucnePozicie;
    for (const x of rucne) await posli({ id: x.id, posX: null, posY: null });
    if (pevne) await posli({ akcia: "mapa-pozicie", mapaId, pozicie: {} });
    zapamataj(`rozloženie (${rucne.length + pevne})`, async () => {
      for (const z of zaloha) await posli({ id: z.id, posX: z.posX, posY: z.posY });
      if (pevne) await posli({ akcia: "mapa-pozicie", mapaId, pozicie: zalohaPevnych });
    });
    nacitaj();
    oznam("marketing");
  };

  /** Zavesiť nápad pod iný nápad (ťahaním). Kruh v strome neprejde. */
  const presunPodUzol = async (u: Uzol, cielId: string) => {
    if (u.id === DOCASNY || !smiePresunut(u.id, cielId, uzly)) return;
    const koniec = uzly.filter((x) => x.rodic === cielId).length;
    // `vetva` sa pri zavesení pod iný nápad VYPRÁZDNI: platí len na koreňových
    // a nechať v nej starú hodnotu by znamenalo druhú, neplatnú pravdu
    // o tom, kam nápad patrí.
    const predtym = { rodic: u.rodic, vetva: u.vetva, poradie: u.poradie };
    setRiadky((r) => r.map((x) => (x.id === u.id ? { ...x, rodic: cielId, vetva: "", poradie: koniec } : x)));
    if (await posli({ id: u.id, rodic: cielId, vetva: "", poradie: koniec })) {
      zapamataj("zavesenie pod iný nápad", async () => { await posli({ id: u.id, ...predtym }); });
    }
    nacitaj();
    oznam("marketing");
  };

  const nastavFarbu = async (u: Uzol, farba: string) => {
    setPresunPre(null);
    if (u.id === DOCASNY) return;
    const predtym = u.farba || "";
    setRiadky((r) => r.map((x) => (x.id === u.id ? { ...x, farba } : x)));
    if (await posli({ id: u.id, farba })) {
      zapamataj("zmenená farba", async () => { await posli({ id: u.id, farba: predtym }); });
      oznam("marketing");
    } else nacitaj();
  };

  const nastavFazu = async (id: string, f: number) => {
    // Rozpísaný koncept ešte na serveri nie je — fáza by skončila chybou
    // „nenajdene" a nenastavila by sa ani lokálne.
    if (id === DOCASNY) { setChyba("Nápad sa najprv musí uložiť — dopíš ho a stlač Enter."); return; }
    setRiadky((r) => r.map((x) => (x.id === id ? { ...x, faza: f } : x)));
    const predtym = Number(riadky.find((x) => x.id === id)?.faza || 0);
    if (await posli({ id, faza: f })) {
      zapamataj("zmenená fáza", async () => { await posli({ id, faza: predtym }); });
      oznam("marketing");
    } else nacitaj();
  };

  const vidno = uzly.filter((u) => viditelny(u.id, uzly));
  // Šírka plochy z ROZLOŽENIA, nie natvrdo: pri zbalených vetvách bola
  // dvojtisícpixelová plocha z väčšej časti prázdna a posuvník klamal o tom,
  // koľko mapy ešte je.
  const sirkaMapy = sirka;
  const vyskaMapy = vyska;
  const zmestiSa = () => {
    const el = plochaRef.current;
    if (!el) return;
    setZoom(Math.min(1, Math.max(0.4, Math.round((el.clientWidth / sirkaMapy) * 100) / 100)));
  };
  const listy = uzly.filter((u) => u.text.trim());
  // Do plánu mesiaca sa počíta len to, čo sa ešte chystá — publikovaný nápad
  // v zásobníku by vyhlásil mesiac za pokrytý obsahom, ktorý už vyšiel.
  const naPlan = uzly.filter(jeNaPlan).filter((u) => u.id !== DOCASNY);
  const sFazou = naPlan.filter((u) => u.faza > 0);
  const chybaDoMesiaca = Math.max(0, kusovNaMesiac(KADENCIA) - sFazou.length);

  const ciary: { id: string; d: string; farba: string; hrubka: number }[] = [];
  // Od stredu bubliny k stredu bubliny: v radiálnom rozložení môže dieťa
  // ležať na ktorejkoľvek strane rodiča, takže „z pravého okraja do ľavého"
  // by kreslilo čiary naprieč plochou.
  const spoj = (a: Miesto | undefined, b: Miesto | undefined, farba: string, hrubka: number, id: string) => {
    if (!a || !b) return;
    const x1 = a.x + a.w / 2, y1 = a.y + RIADOK / 2, x2 = b.x + b.w / 2, y2 = b.y + RIADOK / 2;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ciary.push({ id, d: `M ${x1} ${y1} Q ${mx} ${my}, ${x2} ${y2}`, farba, hrubka });
  };
  for (const v of VETVY) spoj(poz["koren"], poz["vetva:" + v.id], v.farba, 3, "v" + v.id);
  for (const u of vidno) {
    const f = farbaUzla(u, uzly);
    const rodicPoz = u.rodic ? poz[u.rodic] : poz["vetva:" + vetvaUzla(u.id, uzly)];
    spoj(rodicPoz, poz[u.id], f, (poz[u.id]?.hlbka || 2) <= 2 ? 2 : 1.4, "u" + u.id);
  }

  /** Bod myši v súradniciach mapy (cez priblíženie aj posunutie plochy). */
  const bodVMape = (e: { clientX: number; clientY: number }) => {
    const el = plochaRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left + el.scrollLeft) / zoom, y: (e.clientY - r.top + el.scrollTop) / zoom };
  };

  /** Čo je pod myšou — uzol, vetva, alebo nič. */
  const cielPod = (bod: { x: number; y: number }, okremId: string): string | null => {
    for (const [kluc, m] of Object.entries(poz)) {
      if (kluc === "koren" || kluc === okremId) continue;
      if (bod.x < m.x || bod.x > m.x + m.w || bod.y < m.y || bod.y > m.y + RIADOK) continue;
      if (kluc.startsWith("vetva:")) return kluc;
      return smiePresunut(okremId, kluc, uzly) ? kluc : null;
    }
    return null;
  };

  /**
   * Obsluha ťahania. Rovnaká pre nápad, vetvu aj kmeň — Jerry chcel hýbať
   * VŠETKÝMI bublinami, a vetva, ktorá sa jediná nedá chytiť, vyzerá ako
   * pokazená. Rozdiel je len v tom, že vetva a kmeň sa nedajú nikam zavesiť,
   * takže sa pri nich cieľ ani nehľadá.
   */
  const tahaj = (kluc: string, text: string, lenPosun: boolean) => ({
    onPointerDown: (e: React.PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.closest("button")) return;
      e.preventDefault();
      setPresunPre(null);
      const b = bodVMape(e);
      setTahanie({ id: kluc, text, x: b.x, y: b.y, ciel: null, odX: e.clientX, odY: e.clientY });
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* bez zachytenia */ }
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!tahanie || tahanie.id !== kluc) return;
      const b = bodVMape(e);
      setTahanie({ ...tahanie, x: b.x, y: b.y, ciel: lenPosun ? null : cielPod(b, kluc) });
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!tahanie || tahanie.id !== kluc) return;
      const ciel = tahanie.ciel;
      const kam = { x: tahanie.x, y: tahanie.y };
      // KLIK, NIE ŤAHANIE. Kto sa obvodu len dotkne, nechce bublinu presunúť
      // — chce ponuku. Hranica je päť pixelov, aby ju neotvorilo chvenie ruky.
      const klik = Math.hypot(e.clientX - tahanie.odX, e.clientY - tahanie.odY) < 5;
      setTahanie(null);
      try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* nebolo čo pustiť */ }
      if (klik) { setPresunPre(presunPre === kluc ? null : kluc); return; }
      if (lenPosun) { void ulozPoziciuPevnej(kluc, kam.x, kam.y); return; }
      const u = uzly.find((x) => x.id === kluc);
      if (!u) return;
      // Pustenie NAD uzlom alebo vetvou prevesí, pustenie na voľné miesto
      // bublinu položí. Jedno gesto, dva zmysly — a oba sú zrejmé z toho,
      // čo je pod myšou zvýraznené.
      if (!ciel) void polozNaMiesto(u, kam.x, kam.y);
      else if (ciel.startsWith("vetva:")) void presunDoVetvy(u, ciel.slice(6));
      else void presunPodUzol(u, ciel);
    },
    onPointerCancel: () => setTahanie(null),
  });

  /** Rám, za ktorý sa bublina chytá. Rovnaký pre nápad, vetvu aj kmeň. */
  const ramStyl = (kluc: string, rucne: boolean): React.CSSProperties => ({
    padding: 5,
    borderRadius: 999,
    touchAction: "none",
    cursor: tahanie?.id === kluc ? "grabbing" : "grab",
    border: `1px ${rucne ? "dotted" : "solid"} ${tahanie?.ciel === kluc ? C.accent : (rucne ? mix(C.border, 120) : "transparent")}`,
    background: tahanie?.ciel === kluc ? mix(C.accent, 16) : "transparent",
    opacity: tahanie?.id === kluc ? 0.45 : 1,
  });

  const bublina = (u: Uzol) => {
    const p = poz[u.id];
    if (!p) return null;
    const f = farbaUzla(u, uzly);
    const deti = uzly.filter((x) => x.rodic === u.id).length;
    return (
      <div key={u.id} style={{ position: "absolute", left: p.x, top: p.y, display: "flex", alignItems: "center", gap: 7, zIndex: presunPre === u.id ? 4 : (tahanie?.id === u.id ? 5 : undefined) }}>
        <div {...tahaj(u.id, u.text, false)} title="Chyť za rám a presuň" style={ramStyl(u.id, u.posX != null)}>
        <input
          type="text"
          aria-label="Nápad"
          placeholder="píš…"
          value={u.text}
          ref={(el) => { if (el && zameraj.current === u.id) { zameraj.current = null; el.focus(); } }}
          onChange={(e) => void uprav(u.id, e.target.value)}
          onBlur={() => { if (zahadzuje.current) { zahadzuje.current = false; return; } void ulozText(u.id, u.text); }}
          onKeyDown={(e) => {
            if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); void oUrovenVyssie(u); }
            else if (e.key === "Tab") { e.preventDefault(); void zaloz(u.id, "", deti); }
            else if (e.key === "Enter") { e.preventDefault(); void zaloz(u.rodic, u.rodic ? "" : vetvaUzla(u.id, uzly), u.poradie + 1); }
            else if (e.key === "Backspace" && !u.text) { e.preventDefault(); void zmaz(u.id); }
            // Escape ZAHADZUJE — tak to má každá mindmapa (Coggle to má
            // v dokumentácii doslova) a je to kláves, po ktorom človek siahne,
            // keď napísal blbosť. Prvá verzia ním ukladala, čo je opak
            // očakávania. Ukladá blur, Enter a Tab.
            else if (e.key === "Escape") {
              e.preventDefault();
              zahadzuje.current = true;
              if (u.id === DOCASNY) nastavNovy(null); else nacitaj();
              (e.target as HTMLInputElement).blur();
            }
          }}
          style={{
            width: p.w, boxSizing: "border-box", padding: "12px 17px", borderRadius: 999,
            background: C.card, border: `1px solid ${f}`, color: C.text,
            fontFamily: "inherit", fontSize: 14, outline: "none",
          }}
        />
        </div>
        {deti > 0 && (
          <button
            type="button"
            aria-label="Zbaliť alebo rozbaliť vetvu"
            onClick={() => void prepniZbal(u)}
            style={{ height: 26, minWidth: 26, padding: "0 7px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.bg, color: C.textMuted, fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}
          >
            {u.zbalene ? `▸ ${deti}` : "▾"}
          </button>
        )}
        <button
          type="button"
          aria-label="Pridať nadväzujúci nápad"
          onClick={() => void zaloz(u.id, "", deti)}
          style={{ width: 30, height: 30, flexShrink: 0, borderRadius: "50%", padding: 0, border: `1px dashed ${mix(C.border, 130)}`, background: "transparent", color: C.textDim, fontFamily: "inherit", fontSize: 15, lineHeight: 1, cursor: "pointer" }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Presunúť do inej vetvy"
          title="Presunúť do inej vetvy"
          onClick={() => setPresunPre(presunPre === u.id ? null : u.id)}
          style={{ width: 30, height: 30, flexShrink: 0, borderRadius: "50%", padding: 0, border: `1px solid ${presunPre === u.id ? C.accent : "transparent"}`, background: "transparent", color: presunPre === u.id ? C.accentLight : C.textDim, fontFamily: "inherit", fontSize: 13, lineHeight: 1, cursor: "pointer" }}
        >
          ⇄
        </button>
        {presunPre === u.id && (
          <div style={{ position: "absolute", left: 0, top: 46, zIndex: 3, minWidth: 232, maxHeight: 420, overflow: "auto", padding: 6, borderRadius: 11, background: C.surface, border: `1px solid ${mix(C.border, 140)}`, boxShadow: "0 10px 26px rgba(0,0,0,.45)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: C.textDim, padding: "4px 8px 6px" }}>FARBA</div>
            <div style={{ display: "flex", gap: 6, padding: "0 8px 8px", flexWrap: "wrap" }}>
              <button
                type="button"
                aria-label="Farba podľa vetvy"
                title="Podľa vetvy"
                onClick={() => void nastavFarbu(u, "")}
                style={{ width: 24, height: 24, borderRadius: "50%", padding: 0, cursor: "pointer", background: "transparent", border: `2px ${u.farba ? "solid" : "double"} ${!u.farba ? C.accent : mix(C.border, 140)}` }}
              />
              {FARBY.map((fb) => (
                <button
                  key={fb.id}
                  type="button"
                  aria-label={`Farba ${fb.nazov}`}
                  title={fb.nazov}
                  onClick={() => void nastavFarbu(u, fb.id)}
                  style={{ width: 24, height: 24, borderRadius: "50%", padding: 0, cursor: "pointer", background: fb.farba, border: `2px solid ${u.farba === fb.id ? C.text : "transparent"}` }}
                />
              ))}
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: C.textDim, padding: "2px 8px 6px", borderTop: `1px solid ${mix(C.border, 60)}` }}>FÁZA NÁKUPNÉHO CYKLU</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 8px 8px" }}>
              {[1, 2, 3, 4, 5].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setPresunPre(null); void nastavFazu(u.id, f); }}
                  style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", padding: "5px 6px", borderRadius: 7, border: "none", background: u.faza === f ? mix(C.accent, 14) : "transparent", color: C.text, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}
                >
                  <span style={{ width: 17, height: 17, flexShrink: 0, borderRadius: 4, background: fazaFarba(f), color: "#10130e", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{f}</span>
                  {nazovFazy(f)}
                </button>
              ))}
              {u.faza > 0 && (
                <button type="button" onClick={() => { setPresunPre(null); void nastavFazu(u.id, 0); }} style={{ textAlign: "left", padding: "5px 6px", borderRadius: 7, border: "none", background: "transparent", color: C.textDim, fontFamily: "inherit", fontSize: 11.5, cursor: "pointer" }}>
                  bez fázy
                </button>
              )}
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: C.textDim, padding: "2px 8px 6px", borderTop: `1px solid ${mix(C.border, 60)}` }}>PRESUNÚŤ DO VETVY</div>
            {VETVY.map((v) => {
              const tu = !u.rodic && vetvaUzla(u.id, uzly) === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => void presunDoVetvy(u, v.id)}
                  disabled={tu}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 8, border: "none", background: "transparent", color: tu ? C.textDim : C.text, fontFamily: "inherit", fontSize: 12.5, cursor: tu ? "default" : "pointer" }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.farba, flexShrink: 0 }} />
                  {v.nazov}
                  {tu && <span style={{ marginLeft: "auto", fontSize: 11, color: C.textDim }}>tu je</span>}
                </button>
              );
            })}
            {!!u.rodic && (
              <button
                type="button"
                onClick={() => void oUrovenVyssie(u)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 8px", marginTop: 4, borderTop: `1px solid ${mix(C.border, 60)}`, borderLeft: "none", borderRight: "none", borderBottom: "none", background: "transparent", color: C.textMuted, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}
              >
                o úroveň vyššie <span style={{ color: C.textDim }}>· shift+Tab</span>
              </button>
            )}
            <div style={{ fontSize: 10.5, lineHeight: 1.45, color: C.textDim, padding: "6px 8px 2px" }}>
              Nadväzujúce nápady idú s ním. Ponuku otvoríš kliknutím na obvod bubliny.
            </div>
          </div>
        )}
      </div>
    );
  };

  const doJarvisa = () => {
    const t = mapaNaText(uzly, { mesiac: `${nazovMapy} · ${mesiacSlovom(new Date())}`, kadenciaTyzdenne: KADENCIA, nazovFazy });
    setText(t);
    if (!chat) return;
    chat.setFloatingOpen(true);
    void chat.ask([
      "Toto je môj plán obsahu z myšlienkovej mapy. Prejdi ho a rýp doň:",
      "",
      t,
      "",
      "Zaujíma ma hlavne: chýba niečo, čo by tam malo byť? Nie je niektorá fáza prehustená na úkor inej? A je pomer medzi lievikmi rozumný voči tomu, čo appka vie o tom, odkiaľ klienti naozaj prišli?",
    ].join("\n"));
  };

  return (
    <Card id="mapa-napadov">
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        <H3 style={{ marginBottom: 0 }}>
          <Info
            label="Myšlienková mapa"
            text="Uzly sú tie isté nápady, ktoré vidíš v karte Nápady — mapa im len pridáva miesto v strome. Tri vetvy sú dva lieviky (úvodný tréning, kniha) a odkladisko pre nápad, pri ktorom sa ti ešte nechce rozhodovať. Fáza nákupného cyklu sa priraďuje až v druhom pohľade."
          />
        </H3>
        <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 11, background: C.card, border: `1px solid ${C.border}` }}>
          {([["mapa", "Mapa"], ["triedenie", "Vysyp a usporiadaj"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPohlad(id)}
              style={{
                padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                fontSize: 12.5, fontWeight: 600, border: "none",
                background: pohlad === id ? mix(C.accent, 20) : "transparent",
                color: pohlad === id ? C.accentLight : C.textMuted,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span style={{ flexGrow: 1 }} />
        {novy && novy.text.trim().length >= 3 && (
          <span style={{ fontSize: 11.5, color: C.orange }}>neuložené — Tab, Enter alebo Esc to zapíše</span>
        )}
        <span style={{ fontSize: 12.5, color: C.textMuted }}>
          {listy.length} nápadov · <b style={{ color: C.text }}>{sFazou.length} na plán s fázou</b> · {naPlan.length - sFazou.length} bez nej
        </span>
      </div>

      {/* Rad máp. Mapa je obal — nápady v nej zostávajú bežnými nápadmi,
          takže karta Nápady aj plánovanie do mesiacov o nich vedia ďalej. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${mix(C.border, 55)}` }}>
        {mapy.map((m) => {
          const aktivna = m.id === mapaId;
          const kolko = riadky.filter((r) => (r.mapa_id || "m-hlavna") === m.id && r.stav !== "zamietnuty").length;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => prepniMapu(m.id)}
              style={{
                padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                fontSize: 12.5, fontWeight: aktivna ? 600 : 400,
                border: `1px solid ${aktivna ? C.accent : C.border}`,
                background: aktivna ? mix(C.accent, 14) : "transparent",
                color: aktivna ? C.accentLight : C.textMuted,
              }}
            >
              {m.nazov} <span style={{ color: C.textDim, fontWeight: 400 }}>{kolko}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void novaMapa()}
          title="Nová mapa"
          style={{ padding: "6px 11px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, border: `1px dashed ${mix(C.border, 130)}`, background: "transparent", color: C.textDim }}
        >
          + nová
        </button>
        <span style={{ flexGrow: 1 }} />
        {premenuva ? (
          <input
            type="text"
            aria-label="Názov mapy"
            autoFocus
            defaultValue={mapy.find((m) => m.id === mapaId)?.nazov || ""}
            onBlur={(e) => { void premenujMapu(e.target.value); setPremenuva(false); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
            style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${C.accent}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5, width: 200 }}
          />
        ) : (
          <button type="button" onClick={() => setPremenuva(true)} style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
            premenovať
          </button>
        )}
        {mapaId !== "m-hlavna" && (
          <button type="button" onClick={() => void zmazMapu()} style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
            zmazať mapu
          </button>
        )}
      </div>

      {chyba && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{chyba}</div>}
      {!nacitane && <div style={{ fontSize: 12.5, color: C.textDim }}>Načítavam…</div>}

      {nacitane && pohlad === "mapa" && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: C.textDim, marginBottom: 8 }}>
            <span style={{ color: C.textMuted }}>Klávesnica:</span>
            <span><b style={{ color: C.text }}>Tab</b> vetva nižšie</span>
            <span><b style={{ color: C.text }}>Enter</b> ďalšia vedľa</span>
            <span><b style={{ color: C.text }}>⌫</b> na prázdnej zmaže</span>
            <span><b style={{ color: C.text }}>Esc</b> zahodí rozpísanú</span>
            <span><b style={{ color: C.text }}>⌘Z</b> krok späť</span>
            <span>klik na <b style={{ color: C.text }}>obvod</b> = farba, fáza, presun</span>
            <span>alebo chyť bublinu <b style={{ color: C.text }}>za rám</b> a pusť ju nad iný nápad</span>
            <button
              type="button"
              disabled={!kroky.length}
              onClick={() => void vratKrok()}
              title={kroky.length ? `Vrátiť: ${kroky[kroky.length - 1].popis}` : "Zatiaľ nie je čo vrátiť"}
              style={{ background: "none", border: "none", padding: 0, color: kroky.length ? C.accentLight : C.textDim, fontFamily: "inherit", fontSize: 11.5, cursor: kroky.length ? "pointer" : "default", textDecoration: kroky.length ? "underline" : "none", textUnderlineOffset: 2 }}
            >
              ↶ späť{kroky.length ? ` · ${kroky[kroky.length - 1].popis}` : ""}
            </button>
            <button
              type="button"
              onClick={() => void vratRozlozenie()}
              disabled={!uzly.some((x) => x.posX != null) && !Object.keys(rucnePozicie).length}
              title="Zahodiť ručné posuny a nechať rozloženie na appku"
              style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontFamily: "inherit", fontSize: 11.5, cursor: "pointer" }}
            >
              urovnať rozloženie
            </button>
            <button
              type="button"
              onClick={() => setVysyp(vysyp === null ? "" : null)}
              style={{ background: "none", border: "none", padding: 0, color: vysyp === null ? C.accent : C.accentLight, fontFamily: "inherit", fontSize: 11.5, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              ⇣ vysypať naraz
            </button>
            <span style={{ flexGrow: 1 }} />
            <span>dva prsty na trackpade — štipnutím priblížiš a oddiališ</span>
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card }}>
              <button type="button" aria-label="Oddialiť" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 100) / 100))} style={tlacidloZoom}>−</button>
              <button type="button" onClick={() => setZoom(1)} title="Späť na 100 %" style={{ ...tlacidloZoom, width: 46, fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)} %</button>
              <button type="button" aria-label="Priblížiť" onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 100) / 100))} style={tlacidloZoom}>+</button>
              <button type="button" onClick={zmestiSa} title="Zmestiť celú mapu do šírky" style={{ ...tlacidloZoom, width: "auto", padding: "0 8px" }}>zmestiť</button>
              <button type="button" onClick={naStred} title="Postaviť pohľad na hlavnú bublinu" style={{ ...tlacidloZoom, width: "auto", padding: "0 8px" }}>na stred</button>
            </div>
          </div>
          {vysyp !== null && (
            <div style={{ padding: 14, borderRadius: 12, background: C.surface, border: `1px solid ${mix(C.border, 140)}`, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
                Jeden riadok = jeden nápad. Odsadený riadok (tabulátor alebo dve medzery) sa zavesí pod ten nad ním —
                takže sa sem dá vložiť aj zoznam z poznámok v telefóne.
              </div>
              <label htmlFor="vysyp-pole" style={{ display: "none" }}>Nápady, jeden na riadok</label>
              <textarea
                id="vysyp-pole"
                autoFocus
                value={vysyp}
                onChange={(e) => setVysyp(e.target.value)}
                rows={8}
                placeholder={"Prečo strečing nezaberá\n\tFascie sa neťahajú, kĺžu sa\nDych a rebrá\nKlientka po 6 mesiacoch"}
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, resize: "vertical" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <label htmlFor="vysyp-vetva" style={{ fontSize: 12, color: C.textMuted }}>do vetvy</label>
                <select
                  id="vysyp-vetva"
                  value={vysypVetva}
                  onChange={(e) => setVysypVetva(e.target.value)}
                  style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5 }}
                >
                  {VETVY.map((v) => <option key={v.id} value={v.id}>{v.nazov}</option>)}
                </select>
                <span style={{ flexGrow: 1 }} />
                <button type="button" onClick={() => setVysyp(null)} style={{ background: "none", border: "none", color: C.textDim, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>zrušiť</button>
                <button
                  type="button"
                  disabled={sypem || !rozparsujVysyp(vysyp).length}
                  onClick={() => void vysypSpusti()}
                  style={{ padding: "8px 15px", borderRadius: 9, border: `1px solid ${C.accent}`, background: mix(C.accent, 14), color: C.accentLight, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: sypem ? "default" : "pointer", opacity: sypem || !rozparsujVysyp(vysyp).length ? 0.5 : 1 }}
                >
                  {sypem ? "Zapisujem…" : `Vysypať ${rozparsujVysyp(vysyp).length}`}
                </button>
              </div>
            </div>
          )}
          <div ref={plochaRef} style={{ position: "relative", height: 520, overflow: "auto", border: `1px solid ${mix(C.border, 80)}`, borderRadius: 13, background: mix(C.card, 60), overscrollBehavior: "contain" }}>
            {/* Dve vrstvy zámerne: vnútorná sa zmenšuje `transform`om (text
                zostane ostrý a nič sa neprelomí), vonkajšia nesie zmenšený
                rozmer, aby posuvníky vedeli, koľko mapy naozaj je. */}
            <div style={{ width: sirkaMapy * zoom, height: vyskaMapy * zoom }}>
            <div style={{ position: "relative", width: sirkaMapy, height: vyskaMapy, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
              <svg width={sirkaMapy} height={vyskaMapy} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }} aria-hidden="true">
                {ciary.map((c) => (
                  <path key={c.id} d={c.d} stroke={c.farba} strokeWidth={c.hrubka} strokeLinecap="round" fill="none" opacity={0.65} />
                ))}
              </svg>
              {poz["koren"] && (
                <div style={{ position: "absolute", left: poz["koren"].x - 6, top: poz["koren"].y - 6, zIndex: tahanie?.id === "koren" ? 5 : undefined }}>
                  <div {...tahaj("koren", nazovMapy, true)} title="Chyť za rám a presuň" style={{ ...ramStyl("koren", !!rucnePozicie["koren"]), borderRadius: 18 }}>
                    <div style={{ width: poz["koren"].w, boxSizing: "border-box", padding: "15px 20px", borderRadius: 14, background: C.surface, border: `1px solid ${mix(C.border, 130)}`, color: C.text, fontSize: 15.5, fontWeight: 600 }}>
                      {nazovMapy}
                    </div>
                  </div>
                </div>
              )}
              {VETVY.map((v) => {
                const p = poz["vetva:" + v.id];
                if (!p) return null;
                const kolko = uzly.filter((u) => !u.rodic && vetvaUzla(u.id, uzly) === v.id).length;
                return (
                  <div key={v.id} style={{ position: "absolute", left: p.x - 6, top: p.y - 6, display: "flex", alignItems: "center", gap: 7, zIndex: tahanie?.id === "vetva:" + v.id ? 5 : undefined }}>
                    <div {...tahaj("vetva:" + v.id, v.nazov, true)} title="Chyť za rám a presuň" style={ramStyl("vetva:" + v.id, !!rucnePozicie["vetva:" + v.id])}>
                    <div style={{
                      width: p.w, boxSizing: "border-box", padding: "12px 17px", borderRadius: 999,
                      background: tahanie?.ciel === "vetva:" + v.id ? mix(C.accent, 18) : C.surface,
                      border: `1px solid ${tahanie?.ciel === "vetva:" + v.id ? C.accent : v.farba}`,
                      borderLeftWidth: 4, color: C.text, fontSize: 14.5, fontWeight: 600,
                    }}>
                      {v.nazov} <span style={{ color: C.textDim, fontWeight: 400 }}>{kolko}</span>
                    </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Pridať nápad do vetvy ${v.nazov}`}
                      onClick={() => void zaloz("", v.id, kolko)}
                      style={{ width: 30, height: 30, flexShrink: 0, borderRadius: "50%", padding: 0, border: `1px dashed ${mix(C.border, 130)}`, background: "transparent", color: C.textDim, fontFamily: "inherit", fontSize: 15, lineHeight: 1, cursor: "pointer" }}
                    >
                      +
                    </button>
                  </div>
                );
              })}
              {/* Klik mimo ponuky ju zavrie. Je to tlačidlo, nie div —
                  neviditeľná plocha, na ktorú sa dá kliknúť, musí byť
                  dosiahnuteľná aj klávesom. */}
              {presunPre && (
                <button
                  type="button"
                  aria-label="Zavrieť ponuku presunu"
                  onClick={() => setPresunPre(null)}
                  style={{ position: "absolute", inset: 0, zIndex: 2, border: "none", background: "transparent", cursor: "default", padding: 0 }}
                />
              )}
              {vidno.map(bublina)}
              {tahanie && (
                <div style={{
                  position: "absolute", left: tahanie.x + 14, top: tahanie.y - 16, zIndex: 6,
                  pointerEvents: "none", padding: "9px 15px", borderRadius: 999,
                  background: C.surface, border: `1px solid ${C.accent}`, color: C.accentLight,
                  fontSize: 13, whiteSpace: "nowrap", boxShadow: "0 8px 22px rgba(0,0,0,.45)",
                }}>
                  {tahanie.text || "(prázdne)"}
                  <span style={{ color: C.textDim, marginLeft: 8 }}>
                    {tahanie.ciel ? "zavesiť sem" : "položiť na toto miesto"}
                  </span>
                </div>
              )}
            </div>
            </div>
          </div>
        </>
      )}

      {nacitane && pohlad === "triedenie" && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 13, background: mix(C.card, 60), border: `1px dashed ${C.border}`, maxHeight: 520, overflow: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.textDim }}>BEZ FÁZY · {naPlan.length - sFazou.length}</div>
            {naPlan.filter((u) => !u.faza).map((u) => (
              <div key={u.id} style={{ padding: "10px 12px", borderRadius: 11, background: C.surface, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                  <span style={{ width: 8, height: 8, flexShrink: 0, marginTop: 5, borderRadius: "50%", background: farbaUzla(u, uzly) }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.35, color: C.text }}>{u.text}</span>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 5 }}>
                  {[1, 2, 3, 4, 5].map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-label={`Zaradiť do fázy ${f} — ${nazovFazy(f)}`}
                      onClick={() => void nastavFazu(u.id, f)}
                      // Číslica je tmavá na farebnej výplni, nie farebná na
                      // tmavom: farby fáz majú na tmavom podklade kontrast
                      // 1,8–3,4 : 1, teda pod normou pre text.
                      style={{ width: 32, height: 32, borderRadius: 8, padding: 0, cursor: "pointer", border: "none", background: fazaFarba(f), color: "#10130e", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700 }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {sFazou.length === listy.length && <div style={{ fontSize: 12, color: C.textDim }}>Všetko má fázu.</div>}
          </div>
          <div style={{ flexGrow: 1, display: "flex", gap: 10, alignItems: "flex-start", padding: 14, borderRadius: 13, background: mix(C.card, 60), border: `1px solid ${C.border}`, maxHeight: 520, overflow: "auto" }}>
            {[1, 2, 3, 4, 5].map((f) => {
              const kusy = naPlan.filter((u) => u.faza === f);
              return (
                <div key={f} style={{ flexGrow: 1, flexBasis: 0, display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 6, borderBottom: `2px solid ${fazaFarba(f)}` }}>
                    <span style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 5, background: fazaFarba(f), color: "#10130e", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{f}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.text, lineHeight: 1.15 }}>{nazovFazy(f)}</span>
                  </div>
                  {kusy.map((u) => (
                    <div key={u.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "9px 8px 9px 11px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${fazaFarba(f)}` }}>
                      <span style={{ width: 8, height: 8, flexShrink: 0, marginTop: 4, borderRadius: "50%", background: farbaUzla(u, uzly) }} />
                      <span style={{ flexGrow: 1, fontSize: 12, lineHeight: 1.3, color: C.text }}>{u.text}</span>
                      <button type="button" aria-label="Vrátiť medzi nezaradené" onClick={() => void nastavFazu(u.id, 0)} style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, padding: 0, border: "none", background: "transparent", color: C.textDim, fontFamily: "inherit", fontSize: 14, lineHeight: 1, cursor: "pointer" }}>×</button>
                    </div>
                  ))}
                  {!kusy.length && (
                    <div style={{ padding: "13px 10px", border: `1px dashed ${C.border}`, borderRadius: 9, textAlign: "center", fontSize: 11.5, lineHeight: 1.5, color: C.textDim }}>
                      zatiaľ nič<br /><span style={{ color: C.accent }}>tu vzniká diera</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <span style={{ fontSize: 12, color: C.textDim }}>
          {chybaDoMesiaca > 0
            ? `Na mesiac pri kadencii ${KADENCIA} kusy/týždeň treba ${kusovNaMesiac(KADENCIA)} nepublikovaných kusov s fázou — chýba ${chybaDoMesiaca}.`
            : `Na mesiac to stačí: ${kusovNaMesiac(KADENCIA)} nepublikovaných kusov s fázou.`}
        </span>
        <span style={{ flexGrow: 1 }} />
        <button
          type="button"
          onClick={doJarvisa}
          style={{ padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.accent}`, background: mix(C.accent, 14), color: C.accentLight, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          Previesť na text →
        </button>
      </div>

      {text !== null && (
        <div style={{ marginTop: 12, padding: 16, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.textDim }}>ZADANIE PRE JARVISA</span>
            <span style={{ flexGrow: 1 }} />
            <span style={{ fontSize: 11.5, color: C.green }}>{kopia}</span>
            <button
              type="button"
              onClick={() => void doSchranky(text).then((ok) => setKopia(ok ? "skopírované" : "nešlo to — text je nižšie, označ a cmd+C"))}
              style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}
            >
              Skopírovať
            </button>
            <button
              type="button"
              onClick={() => { setText(null); setKopia(""); }}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "transparent", color: C.textDim, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}
            >
              zavrieť
            </button>
          </div>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.65, color: C.textMuted }}>{text}</pre>
        </div>
      )}
    </Card>
  );
}

const tlacidloZoom: React.CSSProperties = {
  height: 24, width: 24, padding: 0, borderRadius: 6, border: "none", background: "transparent",
  color: C.textMuted, fontFamily: "inherit", fontSize: 12, lineHeight: 1, cursor: "pointer",
};

/** Farby fáz majú JEDNU definíciu — v mapaCyklu.ts. Kópia by sa rozišla
 *  a tá istá fáza by na dvoch kartách vedľa seba svietila inak. */
const fazaFarba = (f: number) => FAZA_MAPA.get(f)?.farba || "#6d7560";
