import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { doSchranky } from "../../lib/psb/kopirovanie";
import { FAZA_MAPA, nazovFazy } from "../../lib/psb/mapaCyklu";
import { oznam, pocuvaj } from "../../lib/psb/obnovaSignal";
import {
  FARBY, OKRAJ_ZMESTIT, ODKLADISKO, RIADOK, STRED, farbaVetvy, hladajNapady, jeNaPlan, novaVetva, osnova, predkovia, preradenie, spojnica, surodenci, kusovNaMesiac, mapaNaText, rozlozMapu, rozparsujVysyp, smiePresunut, vMedziach, vetvyMapy, vetvyVsetkych, viditelneVsetky, FARBA_MAPA, type Uzol, type Vetva,
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
type Mapa = { id: string; nazov: string; poradie?: number; pozicie?: string; vetvy?: string };

const KLUC_MAPY = "psb-mapa-napadov";

/** Riadky jednej mapy ako uzly. Jedno miesto — mapa, osnova aj hľadanie. */
const uzlyMapy = (riadky: Riadok[], mapaId: string): Uzol[] => riadky
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
  const [pohlad, setPohlad] = useState<"mapa" | "osnova" | "triedenie">("mapa");
  /**
   * HROMADNÝ VÝBER v „Vysyp a usporiadaj". Priradiť fázu dvadsiatim
   * nápadom bolo dvadsať mierení na malé tlačidlo.
   */
  const [vybrane, setVybrane] = useState<Set<string>>(new Set());
  const poslednyVyber = useRef<string | null>(null);
  /** Hľadanie (⌘F). `null` = zavreté. */
  const [hladam, setHladam] = useState<string | null>(null);
  const hladajRef = useRef<HTMLInputElement | null>(null);
  /** Nápad, na ktorý sa má pohľad postaviť, keď sa mapa prekreslí. */
  const cielSkoku = useRef<{ id: string; kedy: number } | null>(null);
  const [zvyrazneny, setZvyrazneny] = useState<string | null>(null);
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
  /** `za` = id nápadu, za ktorým má koncept stáť (Enter) — rad prečísluje server. */
  type Koncept = { rodic: string; vetva: string; poradie: number; text: string; za?: string; kluc: string };
  const [novy, setNovy] = useState<Koncept | null>(null);
  const novyRef = useRef<Koncept | null>(null);
  const nastavNovy = (d: Koncept | null) => {
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
  /** Rozpísaný názov novej vetvy; `null` = ponuka zatvorená. */
  const [novaVetvaNazov, setNovaVetvaNazov] = useState<string | null>(null);
  /** Premenúvaná vetva a jej rozpísaný názov. */
  const [premenuvaVetva, setPremenuvaVetva] = useState<{ id: string; text: string } | null>(null);
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
  type Tahanie = {
    id: string; text: string; x: number; y: number; ciel: string | null; odX: number; odY: number;
    /** Kam padne STRED bubliny oproti miestu, kde ju človek chytil. */
    posunX: number; posunY: number;
  };
  const [tahanie, setTahanieStav] = useState<Tahanie | null>(null);
  /**
   * Ťahanie žije aj v refe, nielen v stave.
   *
   * Stav sa mení až pri prekreslení, takže pri RÝCHLOM kliknutí (stlačenie
   * a pustenie v tom istom snímku) videl `onPointerUp` ešte `null` — a
   * ponuka na obvode sa neotvorila. Ref je aktuálny okamžite.
   */
  const tahanieRef = useRef<Tahanie | null>(null);
  const setTahanie = (t: Tahanie | null) => { tahanieRef.current = t; setTahanieStav(t); };
  const plochaRef = useRef<HTMLDivElement | null>(null);

  /**
   * NÁPADY NA CESTE NA SERVER.
   *
   * Do 5. 10. 2026 Enter koncept najprv uložil a až PO odpovedi servera
   * (~0,4 s) založil ďalší riadok. Čo človek za ten čas napísal, padlo do
   * prázdna — a raz to skončilo v cudzom riadku (overené v osnove, kde sa
   * píše rýchlo). Teraz uložený koncept ostane hneď na obrazovke pod
   * dočasným id `ukladam-N`, nový riadok vznikne okamžite a skutočné id sa
   * dosadí, keď príde. Kto ho potrebuje skôr (dieťa, „za"), počká naň.
   */
  const pocitadlo = useRef(0);
  const naCeste = useRef(new Map<string, Promise<string | null>>());
  const prelozene = useRef(new Map<string, string>());
  /** React kľúč riadku: koncept → dočasný → skutočný si nesú ten istý, aby políčko neodišlo spod kurzora. */
  const kluce = useRef(new Map<string, string>());
  /**
   * Riadky s rozpísaným, ešte neuloženým textom. Načítanie zo servera ich
   * text neprepíše — inak by zmizlo, čo človek práve píše (napr. počas
   * automatického uloženia konceptu, kedy kurzor ostáva v políčku).
   */
  const upravene = useRef(new Set<string>());
  /**
   * Poradie načítaní. Odpoveď, ktorá príde po novšej, alebo dopyt odoslaný
   * PRED posledným zápisom, sa zahodí — inak by riadok, ktorý sa práve
   * uložil, na chvíľu zmizol (a s ním kurzor) alebo sa zdvojil.
   */
  const nacitanieCislo = useRef(0);
  const platneOd = useRef(0);
  const skutocneId = async (id?: string): Promise<string | undefined | null> => {
    if (!id || !id.startsWith("ukladam-")) return id;
    return prelozene.current.get(id) ?? (await naCeste.current.get(id)) ?? null;
  };

  const nacitaj = useCallback(() => {
    const moje = ++nacitanieCislo.current;
    return void fetch("/api/napady", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((j: { napady?: Riadok[]; mapy?: Mapa[] }) => {
      if (moje < platneOd.current) return;
      platneOd.current = moje;
      // Riadky, ktoré sa práve ukladajú, server ešte nepozná — zahodiť ich
      // by vzalo človeku spod kurzora to, čo práve napísal. Rozpísaný text
      // ostáva tiež.
      setRiadky((pred) => {
        const lokalne = new Map(pred.map((x) => [x.id, x]));
        const zoServera = (j.napady || []).map((x) => (upravene.current.has(x.id) && lokalne.has(x.id) ? { ...x, text: lokalne.get(x.id)!.text } : x));
        const su = new Set(zoServera.map((x) => x.id));
        return [...zoServera, ...pred.filter((x) => x.id.startsWith("ukladam-") && !su.has(x.id))];
      });
      const zoznam = j.mapy || [];
      setMapy(zoznam);
      // Otvorená mapa, ktorú niekto medzitým zmazal, by nechala prázdnu
      // obrazovku bez vysvetlenia — padni na prvú.
      setMapaId((m) => (zoznam.some((x) => x.id === m) ? m : (zoznam[0]?.id || "m-hlavna")));
    })
    .catch(() => {})
    .finally(() => setNacitane(true));
  }, []);
  useEffect(() => { nacitaj(); }, [nacitaj]);
  // Tri karty nad tými istými riadkami sú na jednej obrazovke (mapa, mapa
  // cyklu, nápady) a Jarvis do nich zapisuje tiež. Bez signálu by každá
  // tvrdila svoje, kým človek stránku neobnoví.
  useEffect(() => pocuvaj("marketing", nacitaj), [nacitaj]);

  /** Zápis na server. Vracia úspech — „uložené“ sa nesmie tvrdiť do prázdna. */
  const posli = async (telo: Record<string, unknown>): Promise<string | null> => {
    if (typeof telo.id === "string" && telo.id.startsWith("ukladam-")) {
      setChyba("Nápad sa ešte ukladá — skús o chvíľu.");
      return null;
    }
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
    const zive = uzlyMapy(riadky, mapaId);
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
  /**
   * Vetvy TEJTO mapy. Do 25. 9. 2026 boli tri, natvrdo v kóde; odvtedy si ich
   * mapa nesie vo vlastnom stĺpci a kód drží len východisko.
   */
  const vetvy = useMemo(
    () => vetvyMapy(mapy.find((m) => m.id === mapaId)?.vetvy ?? ""),
    [mapy, mapaId],
  );
  const { poz, vyska, sirka } = useMemo(
    () => rozlozMapu(uzly, { text: nazovMapy }, rucnePozicie, vetvy),
    [uzly, nazovMapy, rucnePozicie, vetvy],
  );
  /**
   * Vetva a viditeľnosť všetkých uzlov raz za prekreslenie. Volať
   * `vetvaUzla` v slučke cez všetky uzly bolo n² — pri dvoch stovkách
   * nápadov ~12 ms na každý napísaný znak.
   */
  const vetvaZ = useMemo(() => vetvyVsetkych(uzly, vetvy), [uzly, vetvy]);
  const vetvaU = (id: string) => vetvaZ.get(id) ?? ODKLADISKO;
  const farbaU = (u: Uzol) => FARBA_MAPA.get(u.farba || "")?.farba ?? farbaVetvy(vetvaU(u.id), vetvy);
  const vidnoSet = useMemo(() => viditelneVsetky(uzly), [uzly]);
  const stromOsnovy = useMemo(() => osnova(uzly, vetvy), [uzly, vetvy]);
  /** Poradie riadkov osnovy zhora nadol — kam skočí ↑ a ↓. */
  const radOsnovy = useMemo(() => stromOsnovy.flatMap((x) => x.riadky.map((r) => r.uzol.id)), [stromOsnovy]);
  const zhody = useMemo(() => (hladam && hladam.trim() ? hladajNapady(riadky, hladam).slice(0, 40) : []), [riadky, hladam]);
  const zhodyTu = useMemo(() => new Set(zhody.filter((z) => (z.mapa_id || "m-hlavna") === mapaId).map((z) => z.id)), [zhody, mapaId]);

  /**
   * Odošle rozpísaný uzol (alebo ho zahodí, keď je prázdny) a HNEĎ vráti
   * dočasné id; skutočné príde v `hotovo`. Riadok zostáva na obrazovke celý
   * čas — so svojím kľúčom, takže kurzor v ňom ostane, ak tam bol.
   */
  const odosliKoncept = useCallback((vratFokus = false): { docasne: string | null; hotovo: Promise<string | null> } => {
    if (casovac.current) { clearTimeout(casovac.current); casovac.current = null; }
    const nic = { docasne: null, hotovo: Promise.resolve(null) };
    const d = novyRef.current;
    if (!d) return nic;
    nastavNovy(null);
    const t = d.text.trim();
    if (t.length < 3) { if (t) setChyba("Nápad musí mať aspoň tri znaky — kratší sa nezapísal."); return nic; }
    const docasne = `ukladam-${++pocitadlo.current}`;
    const mapa = mapaIdRef.current;
    kluce.current.set(docasne, d.kluc);
    setRiadky((r) => [...r, { id: docasne, text: t, rodic: d.rodic, vetva: d.rodic ? "" : d.vetva, poradie: d.poradie, mapa_id: mapa, stav: "novy" }]);
    if (vratFokus) zameraj.current = docasne;
    const hotovo = (async () => {
      const rodic = await skutocneId(d.rodic);
      const za = await skutocneId(d.za);
      const id = d.rodic && !rodic
        ? null
        : await posli({ text: t, zdroj: "vlastny", rodic: rodic || "", vetva: d.vetva, poradie: d.poradie, za: za || undefined, mapaId: mapa });
      if (!id) {
        // Zmiznúť smie len to, čo je uložené. Kým sa do nového riadku nič
        // nenapísalo, vráti sa text doň; inak ho appka povie nahlas.
        setRiadky((r) => r.filter((x) => x.id !== docasne));
        const teraz = novyRef.current;
        if (!teraz || !teraz.text.trim()) nastavNovy({ ...d, rodic: rodic || "", vetva: d.vetva || ODKLADISKO, za: undefined });
        else setChyba(`Nezapísalo sa: „${t}“ — napíš to prosím znova.`);
        return null;
      }
      prelozene.current.set(docasne, id);
      kluce.current.set(id, d.kluc);
      // Načítania odoslané pred týmto zápisom nový riadok nepoznajú.
      platneOd.current = nacitanieCislo.current + 1;
      if (upravene.current.delete(docasne)) upravene.current.add(id);
      setRiadky((r) => {
        const miestny = r.find((x) => x.id === docasne);
        // Načítanie mohlo riadok priniesť skôr než odpoveď na zápis — vtedy
        // dočasný len zmizne (s textom, ak sa do neho medzitým písalo).
        const uzJe = r.some((x) => x.id === id);
        return r
          .filter((x) => !(uzJe && x.id === docasne))
          .map((x) => (x.id === docasne ? { ...x, id }
            : uzJe && x.id === id && miestny && upravene.current.has(id) ? { ...x, text: miestny.text }
            : x.rodic === docasne ? { ...x, rodic: id } : x));
      });
      const teraz = novyRef.current;
      if (teraz && (teraz.rodic === docasne || teraz.za === docasne)) {
        nastavNovy({ ...teraz, rodic: teraz.rodic === docasne ? id : teraz.rodic, za: teraz.za === docasne ? id : teraz.za });
      }
      if (zameraj.current === docasne) zameraj.current = id;
      zapamataj(`nápad „${t.slice(0, 28)}"`, async () => { await posli({ id, zmaz: true }); });
      nacitaj();
      oznam("marketing");
      return id;
    })();
    naCeste.current.set(docasne, hotovo);
    return { docasne, hotovo };
  }, [nacitaj]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Uloží rozpísaný uzol a počká na skutočné id. */
  const dopis = useCallback((vratFokus = false) => odosliKoncept(vratFokus).hotovo, [odosliKoncept]);

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
      const novy = vMedziach(stary - e.deltaY * 0.0025);
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

  /**
   * ⌘F nad mapou. Prehliadačové hľadanie nevidí do políčok bublín, takže by
   * nenašlo nič. Berie sa len vtedy, keď je mapa v strede obrazovky alebo
   * je v nej kurzor — inde ⌘F patrí prehliadaču.
   */
  useEffect(() => {
    const na = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "f") return;
      const k = document.getElementById("mapa-napadov");
      if (!k) return;
      const kde = document.activeElement;
      const vnutri = !!kde && k.contains(kde);
      const r = k.getBoundingClientRect();
      const vStrede = r.height > 0 && r.top < window.innerHeight * 0.6 && r.bottom > window.innerHeight * 0.4;
      if (!vnutri && !(vStrede && (!kde || kde === document.body))) return;
      e.preventDefault();
      setHladam((h) => h ?? "");
      requestAnimationFrame(() => { hladajRef.current?.focus(); hladajRef.current?.select(); });
    };
    document.addEventListener("keydown", na);
    return () => document.removeEventListener("keydown", na);
  }, []);

  /** Po skoku z hľadania: pohľad na nápad a kurzor doň, keď už je na obrazovke. */
  useEffect(() => {
    const ciel = cielSkoku.current;
    if (!ciel) return;
    // Cieľ, ktorý sa do pár sekúnd nevykreslil, už neplatí — inak by kurzor
    // skočil naň o hodinu neskôr pri inom prekreslení.
    if (Date.now() - ciel.kedy > 4000) { cielSkoku.current = null; return; }
    const id = ciel.id;
    const el = document.querySelector<HTMLInputElement>(`#mapa-napadov [data-uzol="${id}"]`);
    if (!el) return;
    cielSkoku.current = null;
    const plocha = plochaRef.current;
    const p = poz[id];
    if (pohlad === "mapa" && plocha && p) {
      plocha.scrollLeft = (p.x + p.w / 2) * zoomRef.current - plocha.clientWidth / 2;
      plocha.scrollTop = (p.y + RIADOK / 2) * zoomRef.current - plocha.clientHeight / 2;
      el.focus({ preventScroll: true });
    } else el.focus();
  });
  useEffect(() => {
    if (!zvyrazneny) return;
    const t = window.setTimeout(() => setZvyrazneny(null), 2500);
    return () => clearTimeout(t);
  }, [zvyrazneny]);

  /** Postaviť pohľad na kmeň pri danej mierke. */
  const naStredPri = useCallback((z: number) => {
    const el = plochaRef.current;
    if (!el) return;
    const k = poz["koren"];
    const sx = k ? k.x + k.w / 2 : STRED.x;
    const sy = k ? k.y + RIADOK / 2 : STRED.y;
    el.scrollLeft = sx * z - el.clientWidth / 2;
    el.scrollTop = sy * z - el.clientHeight / 2;
  }, [poz]);

  /**
   * Postaviť pohľad na kmeň. Bez parametra zámerne: vešia sa aj na `onClick`,
   * aj na `requestAnimationFrame`, a tie by do voliteľného čísla ticho
   * podstrčili event, resp. časovú značku.
   */
  const naStred = useCallback(() => naStredPri(zoomRef.current), [naStredPri]);

  /**
   * Zoom z tlačidiel. Ukotvený v STREDE okna — rovnako ako štipnutie kotví
   * pod myšou. Bez toho sa `scrollLeft` nechá na starej hodnote a mapa po
   * zmene mierky ujde bokom; pri skoku zo 100 % na 40 % odišla úplne z
   * obrazovky a plocha vyzerala prázdna.
   */
  const zmenZoom = useCallback((kam: number | ((z: number) => number)) => {
    const el = plochaRef.current;
    const stary = zoomRef.current;
    const novy = vMedziach(typeof kam === "function" ? kam(stary) : kam);
    if (novy === stary) return;
    zoomRef.current = novy;
    setZoom(novy);
    if (!el) return;
    const vx = el.clientWidth / 2;
    const vy = el.clientHeight / 2;
    const bodX = (el.scrollLeft + vx) / stary;
    const bodY = (el.scrollTop + vy) / stary;
    requestAnimationFrame(() => {
      el.scrollLeft = bodX * novy - vx;
      el.scrollTop = bodY * novy - vy;
    });
  }, []);

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

  const zaloz = (rodic: string, vetva: string, poradie: number, za?: string) => {
    // Koncept sa odošle a nový riadok vznikne HNEĎ — nečaká sa na server.
    // Keď má byť rodičom (Tab) alebo kotvou (Enter) práve on, dostane nový
    // riadok jeho dočasné id a skutočné sa dosadí, keď príde.
    const { docasne } = odosliKoncept();
    const skutocny = rodic === DOCASNY ? (docasne || "") : rodic;
    if (rodic === DOCASNY && !skutocny) return;      // koncept bol prázdny — niet pod čo
    // Zbalená vetva by nové dieťa schovala skôr, než by sa doň dalo písať.
    const r = skutocny ? riadky.find((x) => x.id === skutocny) : null;
    if (r?.zbalene) { setRiadky((z) => z.map((x) => (x.id === skutocny ? { ...x, zbalene: 0 } : x))); void posli({ id: skutocny, zbalene: false }); }
    const kotva = za === DOCASNY ? (docasne || undefined) : za;
    nastavNovy({ rodic: skutocny, vetva, poradie, text: "", za: kotva, kluc: `k${++pocitadlo.current}` });
    // Kurzor prejde v tom istom vykreslení (ref), nie až po snímke — inak by
    // prvé písmeno ešte dopadlo do predošlého riadku.
    zameraj.current = DOCASNY;
    requestAnimationFrame(() => { if (document.activeElement?.getAttribute("data-uzol") !== DOCASNY) skocNa(DOCASNY); });
  };

  const klucU = (u: Uzol) => (u.id === DOCASNY ? (novy?.kluc || DOCASNY) : (kluce.current.get(u.id) ?? u.id));

  /** Kurzor do bubliny (mapa) alebo riadku (osnova) daného nápadu. */
  const skocNa = (id: string) => {
    const el = document.querySelector<HTMLInputElement>(`#mapa-napadov [data-uzol="${id}"]`);
    if (el) { zameraj.current = null; el.focus(); }
    else zameraj.current = id;
  };

  /**
   * ⌘↑ / ⌘↓ — preradiť medzi súrodencami. Jediný spôsob, ako z výsypu
   * spraviť poradie bez prepisovania. Rad sa prečísluje celý a zapíše naraz.
   */
  const prerad = async (u: Uzol, smer: -1 | 1) => {
    if (u.id === DOCASNY) return;
    if (u.id.startsWith("ukladam-") || surodenci(u.id, uzly, vetvy).some((x) => x.id.startsWith("ukladam-"))) {
      setChyba("Chvíľu — vedľajší nápad sa ešte ukladá.");
      return;
    }
    const plan = preradenie(u.id, smer, uzly.filter((x) => x.id !== DOCASNY), vetvy);
    if (!plan) return;
    const predtym = plan.map((x) => ({ id: x.id, poradie: uzly.find((y) => y.id === x.id)?.poradie ?? 0 }));
    const nove = new Map(plan.map((x) => [x.id, x.poradie]));
    setRiadky((r) => r.map((x) => (nove.has(x.id) ? { ...x, poradie: nove.get(x.id) } : x)));
    // V osnove sa riadok v DOM presunie a prehliadač mu vezme kurzor.
    requestAnimationFrame(() => skocNa(u.id));
    if (await posli({ akcia: "mapa-poradie", mapaId: mapaIdRef.current, poradie: plan })) {
      zapamataj("preradenie", async () => { await posli({ akcia: "mapa-poradie", mapaId: mapaIdRef.current, poradie: predtym }); });
      oznam("marketing");
    } else nacitaj();
  };

  /**
   * ↑ / ↓ — o nápad vyššie / nižšie. Do 5. 10. 2026 sa dalo klávesnicou ísť
   * len dopredu a späť na štvrtý nápad len myšou. Na mape sú to súrodenci
   * (a nad prvým jeho rodič), v osnove riadky zhora nadol.
   */
  const krokNa = (u: Uzol, smer: -1 | 1) => {
    if (pohlad === "osnova") {
      const i = radOsnovy.indexOf(u.id);
      const ciel = radOsnovy[i + smer];
      if (i >= 0 && ciel) skocNa(ciel);
      return;
    }
    const s = surodenci(u.id, uzly, vetvy);
    const i = s.findIndex((x) => x.id === u.id);
    const ciel = s[i + smer];
    if (ciel) skocNa(ciel.id);
    else if (smer === -1 && u.rodic) skocNa(u.rodic);
  };

  /**
   * Klávesnica bubliny — JEDNA pre mapu aj osnovu. Dve kópie by sa rozišli
   * a ten istý kláves by v dvoch pohľadoch na tie isté nápady robil iné veci.
   */
  const klavesy = (u: Uzol, deti: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    const cmd = e.metaKey || e.ctrlKey;
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && cmd) {
      e.preventDefault();
      void prerad(u, e.key === "ArrowUp" ? -1 : 1);
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      krokNa(u, e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); void oUrovenVyssie(u); }
    else if (e.key === "Tab") { e.preventDefault(); void zaloz(u.id, "", deti); }
    else if (e.key === "Enter") {
      e.preventDefault();
      // Sirota (rodič zmizol alebo je v inej mape) visí na vetve — nový
      // súrodenec tiež, inak by ho server odmietol pri každom pokuse.
      const rodic = u.rodic && uzly.some((x) => x.id === u.rodic) ? u.rodic : "";
      void zaloz(rodic, rodic ? "" : vetvaU(u.id), u.poradie + 0.01, u.id);
    }
    else if (e.key === "Backspace" && !u.text) { e.preventDefault(); void zmaz(u.id); }
    // Escape ZAHADZUJE — tak to má každá mindmapa (Coggle to má
    // v dokumentácii doslova) a je to kláves, po ktorom človek siahne,
    // keď napísal blbosť. Prvá verzia ním ukladala, čo je opak
    // očakávania. Ukladá blur, Enter a Tab.
    else if (e.key === "Escape") {
      e.preventDefault();
      zahadzuje.current = true;
      if (u.id === DOCASNY) nastavNovy(null); else { upravene.current.delete(u.id); nacitaj(); }
      (e.target as HTMLInputElement).blur();
    }
  };

  /** Políčko nápadu — spoločné pre bublinu na mape aj riadok osnovy. */
  const vstupNapadu = (u: Uzol, deti: number) => ({
    type: "text" as const,
    "aria-label": "Nápad",
    "data-uzol": u.id,
    placeholder: "píš…",
    value: u.text,
    ref: (el: HTMLInputElement | null) => { if (el && zameraj.current === u.id) { zameraj.current = null; el.focus(); } },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void uprav(u.id, e.target.value),
    onBlur: () => { if (zahadzuje.current) { zahadzuje.current = false; return; } void ulozText(u.id, u.text); },
    onKeyDown: klavesy(u, deti),
  });

  const uprav = async (id: string, t: string) => {
    if (id === DOCASNY) {
      if (novyRef.current) nastavNovy({ ...novyRef.current, text: t });
      if (casovac.current) clearTimeout(casovac.current);
      casovac.current = window.setTimeout(() => { void dopis(true); }, 1500);
      return;
    }
    upravene.current.add(id);
    setRiadky((r) => r.map((x) => (x.id === id ? { ...x, text: t } : x)));
  };

  const ulozText = async (povodneId: string, t: string) => {
    if (povodneId === DOCASNY) { await dopis(); return; }
    // Riadok, ktorý sa ešte ukladá: počkať na jeho id, inak by sa dopísaný
    // text stratil (server dočasné id nepozná).
    // Bez úpravy niet čo zapisovať — odchod z políčka nesmie posielať zápis
    // ani budiť ostatné karty.
    if (!upravene.current.has(povodneId)) return;
    const id = (await skutocneId(povodneId)) || "";
    if (!id) return;
    if (t.trim().length < 3) {
      upravene.current.delete(id);
      // Na obrazovke by zostal skrátený text a v databáze pôvodný — tichý
      // rozchod, ktorý si nikto nevšimne. Radšej nahlas a vrátiť.
      setChyba("Nápad musí mať aspoň tri znaky — pôvodný text sa vrátil.");
      nacitaj();
      return;
    }
    const predtym = riadky.find((x) => x.id === id)?.text ?? "";
    if (await posli({ id, text: t.trim() })) {
      upravene.current.delete(id);
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
    if (!u.rodic && vetvaU(u.id) === vetva) return;
    const koniec = uzly.filter((x) => !x.rodic && vetvaU(x.id) === vetva).length;
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
      await presunDoVetvy(u, vetvaU(u.id));
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
    // Koreňové nápady idú ZA to, čo vo vetve už je — od nuly by sa zrazili
    // s existujúcimi a premiešali sa s nimi.
    const koniecVetvy = uzly.filter((x) => !x.rodic && vetvaU(x.id) === vysypVetva)
      .reduce((m, x) => Math.max(m, x.poradie + 1), 0);
    for (const r of riadkyVysypu) {
      const rodic = r.uroven > 0 ? (rodicia[r.uroven - 1] || "") : "";
      const id = await posli({
        text: r.text, zdroj: "vlastny", mapaId: mapaIdRef.current,
        rodic, vetva: rodic ? "" : vysypVetva, poradie: rodic ? hotovo : koniecVetvy + hotovo,
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
    setVybrane(new Set());
    poslednyVyber.current = null;
    setPresunPre(null);
    setPremenuva(false);
    setMapaId(id);
    try { localStorage.setItem(KLUC_MAPY, id); } catch { /* súkromný režim */ }
  };

  /**
   * SKOK NA NÁJDENÝ NÁPAD. Prepne mapu, rozbalí zbalených predkov (inak by
   * bol cieľ schovaný) a pohľad naň postaví, keď sa mapa prekreslí.
   */
  const skocNaNapad = (r: Riadok) => {
    const mapa = r.mapa_id || "m-hlavna";
    if (mapa !== mapaId) prepniMapu(mapa);
    if (pohlad === "triedenie") setPohlad("mapa");
    const zbalenePredky = predkovia(r.id, uzlyMapy(riadky, mapa)).filter((x) => x.zbalene);
    if (zbalenePredky.length) {
      const ids = new Set(zbalenePredky.map((x) => x.id));
      setRiadky((z) => z.map((x) => (ids.has(x.id) ? { ...x, zbalene: 0 } : x)));
      for (const x of zbalenePredky) void posli({ id: x.id, zbalene: false });
    }
    cielSkoku.current = { id: r.id, kedy: Date.now() };
    setZvyrazneny(r.id);
    setHladam(null);
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

  /**
   * ZÁPIS ZOZNAMU VETIEV.
   *
   * Posiela sa celý zoznam, nie rozdiel — pridanie, premenovanie aj zmazanie
   * je ten istý zápis a mapa má po ňom presne to, čo je na obrazovke.
   * Obrazovka sa prekreslí hneď (`setMapy`), server len potvrdzuje: čakať na
   * odpoveď by pri písaní názvu blikalo.
   */
  const ulozVetvy = async (zoznam: Vetva[], popis: string) => {
    const predtym = mapy.find((m) => m.id === mapaId)?.vetvy ?? "";
    const text = JSON.stringify(zoznam);
    setMapy((m) => m.map((x) => (x.id === mapaId ? { ...x, vetvy: text } : x)));
    const ok = await posli({ akcia: "mapa-vetvy", mapaId, vetvy: zoznam });
    if (!ok) {
      setMapy((m) => m.map((x) => (x.id === mapaId ? { ...x, vetvy: predtym } : x)));
      return false;
    }
    zapamataj(popis, async () => {
      // Prázdny reťazec znamená „tri základné" — poslať sa musí zoznam,
      // takže sa pri návrate k východisku pošlú tie tri.
      await posli({ akcia: "mapa-vetvy", mapaId, vetvy: vetvyMapy(predtym) });
    });
    // Nápady, ktoré v zmazanej vetve viseli, prepísal server na odkladisko —
    // bez načítania by obrazovka ďalej ukazovala starú vetvu.
    nacitaj();
    return true;
  };

  const zalozVetvu = async (nazov: string) => {
    const t = nazov.trim().slice(0, 60);
    if (!t) { setChyba("Vetva potrebuje meno."); return; }
    if (vetvy.length >= 12) { setChyba("Viac ako dvanásť vetiev sa už nedá prehliadnuť."); return; }
    const v = novaVetva(t, vetvy);
    if (await ulozVetvy([...vetvy, v], `vetva „${t}“`)) setNovaVetvaNazov(null);
  };

  const premenujVetvu = async (id: string, nazov: string) => {
    const t = nazov.trim().slice(0, 60);
    if (!t) { setChyba("Vetva potrebuje meno."); return; }
    await ulozVetvy(vetvy.map((v) => (v.id === id ? { ...v, nazov: t } : v)), "premenovanie vetvy");
    setPremenuvaVetva(null);
  };

  const prefarbiVetvu = async (id: string, farba: string) => {
    await ulozVetvy(vetvy.map((v) => (v.id === id ? { ...v, farba } : v)), "farba vetvy");
    setPresunPre(null);
  };

  const prehodVetvu = async (id: string) => {
    await ulozVetvy(vetvy.map((v) => (v.id === id ? { ...v, strana: v.strana === 1 ? -1 : 1 } : v)), "strana vetvy");
    setPresunPre(null);
  };

  /**
   * Zmazanie vetvy nápady NEMAŽE — spadnú do odkladiska. Zmazať kategóriu
   * a s ňou aj myšlienky, ktoré v nej ležali, je presne ten krok, ktorý sa
   * nedá vrátiť a nikto ho nečakal.
   */
  const zmazVetvu = async (id: string) => {
    if (id === ODKLADISKO) { setChyba("Odkladisko musí zostať — padá doň všetko bez domova."); return; }
    const v = vetvy.find((x) => x.id === id);
    const kolko = uzly.filter((u) => !u.rodic && vetvaU(u.id) === id).length;
    await ulozVetvy(vetvy.filter((x) => x.id !== id), `vetva „${v?.nazov || id}“`);
    setPresunPre(null);
    if (kolko) setChyba(`Vetva je preč, ${kolko} nápadov spadlo do „Zatiaľ neviem kam".`);
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

  const vidno = uzly.filter((u) => vidnoSet.has(u.id));
  // Šírka plochy z ROZLOŽENIA, nie natvrdo: pri zbalených vetvách bola
  // dvojtisícpixelová plocha z väčšej časti prázdna a posuvník klamal o tom,
  // koľko mapy ešte je.
  const sirkaMapy = sirka;
  const vyskaMapy = vyska;
  const zmestiSa = () => {
    const el = plochaRef.current;
    if (!el) return;
    // Podľa toho, čo na mape SKUTOČNE je, nie podľa plochy: tá má vždy aspoň
    // 3200 × 2200 px, aj keď mapa zaberá desatinu. Mierka počítaná z nej
    // preto vždy spadla na minimum a „zmestiť" nezmestilo nič.
    const m = Object.values(poz);
    if (!m.length) return;
    const x1 = Math.min(...m.map((q) => q.x)) - OKRAJ_ZMESTIT;
    const y1 = Math.min(...m.map((q) => q.y)) - OKRAJ_ZMESTIT;
    const x2 = Math.max(...m.map((q) => q.x + q.w)) + OKRAJ_ZMESTIT;
    const y2 = Math.max(...m.map((q) => q.y + RIADOK)) + OKRAJ_ZMESTIT;
    const novy = vMedziach(Math.min(el.clientWidth / (x2 - x1), el.clientHeight / (y2 - y1)), Math.floor);
    zoomRef.current = novy;
    setZoom(novy);
    // Zmenšiť nestačí: po prekreslení treba pohľad aj posunúť na mapu, inak
    // ostane posuvník na starých pixeloch a človek hľadí do prázdnej plochy.
    requestAnimationFrame(() => {
      el.scrollLeft = ((x1 + x2) / 2) * novy - el.clientWidth / 2;
      el.scrollTop = ((y1 + y2) / 2) * novy - el.clientHeight / 2;
    });
  };
  const listy = uzly.filter((u) => u.text.trim());
  // Do plánu mesiaca sa počíta len to, čo sa ešte chystá — publikovaný nápad
  // v zásobníku by vyhlásil mesiac za pokrytý obsahom, ktorý už vyšiel.
  const naPlan = uzly.filter(jeNaPlan).filter((u) => u.id !== DOCASNY);
  const sFazou = naPlan.filter((u) => u.faza > 0);
  const bezFazyUzly = naPlan.filter((u) => !u.faza);
  const bezFazyRad = bezFazyUzly.map((u) => u.id);
  const chybaDoMesiaca = Math.max(0, kusovNaMesiac(KADENCIA) - sFazou.length);

  const ciary: { id: string; d: string; farba: string; hrubka: number }[] = [];
  // Od stredu bubliny k stredu bubliny: v radiálnom rozložení môže dieťa
  // ležať na ktorejkoľvek strane rodiča, takže „z pravého okraja do ľavého"
  // by kreslilo čiary naprieč plochou.
  const spoj = (a: Miesto | undefined, b: Miesto | undefined, farba: string, hrubka: number, id: string) => {
    if (!a || !b) return;
    // Od OKRAJA k okraju, nie od stredu k stredu: čiara vedená do stredu
    // prechádza cez text a kríži susedné bubliny (snímka, 25. 9. 2026).
    ciary.push({ id, d: spojnica(a, b), farba, hrubka });
  };
  for (const v of vetvy) spoj(poz["koren"], poz["vetva:" + v.id], v.farba, 3, "v" + v.id);
  for (const u of vidno) {
    const f = farbaU(u);
    const rodicPoz = u.rodic ? poz[u.rodic] : poz["vetva:" + vetvaU(u.id)];
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
  /**
   * Chytenie, ktoré sa ešte nerozhodlo, či je z neho klik alebo ťah.
   *
   * Na textovom políčku sa `preventDefault` zavolať NESMIE — klik doň musí
   * položiť kurzor. Preto sa chytenie najprv len zapamätá a ťahať sa začne
   * až pri pohybe.
   */
  const cakaRef = useRef<{ kluc: string; text: string; odX: number; odY: number; posunX: number; posunY: number } | null>(null);

  /** Prechod z písania na ťahanie. */
  const zacniTahatZTextu = (
    ev: PointerEvent,
    ram: HTMLElement,
    caka: { kluc: string; text: string; odX: number; odY: number; posunX: number; posunY: number },
  ) => {
    // Kurzor z políčka von a OZNAČENIE PREČ: ťah myšou po stránke ho inak
    // rozťahuje cez susedné bubliny a po mape sa vlečie modrá plocha
    // (Jerry, 25. 9. 2026: „chytím to a ono sa to celé označí").
    // Blur pri ťahaní NIE JE uloženie textu: pri krátkej rozpísanej bubline
    // by uprostred pohybu vyskočilo „musí mať aspoň tri znaky".
    zahadzuje.current = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
    try { window.getSelection()?.removeAllRanges(); } catch { /* bez výberu */ }
    cakaRef.current = null;
    setPresunPre(null);
    const b = bodVMape(ev);
    setTahanie({ id: caka.kluc, text: caka.text, x: b.x, y: b.y, ciel: null, odX: caka.odX, odY: caka.odY, posunX: caka.posunX, posunY: caka.posunY });
    try { ram.setPointerCapture(ev.pointerId); } catch { /* bez zachytenia */ }
  };

  const tahaj = (kluc: string, text: string, lenPosun: boolean) => ({
    onPointerDown: (e: React.PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("button")) return;
      const b = bodVMape(e);
      const m = poz[kluc];
      // Kde v bubline ju človek chytil. Bez tohto sa bublina po pustení
      // skokom vycentrovala na kurzor — pri širokej bubline to je aj sto
      // pixelov bokom. Jerry, 25. 9. 2026: „uloží sa to len plus mínus do
      // tej oblasti, ale nie presne."
      const posunX = m ? m.x + m.w / 2 - b.x : 0;
      const posunY = m ? m.y + RIADOK / 2 - b.y : 0;
      if (t.tagName === "INPUT") {
        /**
         * Chytenie za TEXT. Nesmie sa tu zavolať `preventDefault` (klik musí
         * položiť kurzor do políčka) ani zachytiť ukazovateľ (to by kurzor
         * zobralo tiež). Lenže bez zachytenia idú ďalšie pohyby myši tomu,
         * nad čím sa práve nachádza — nie bubline — a `onPointerMove` rámu sa
         * už nikdy nespustí. Preto sa počúva na OKNE a ťah sa začne až pri
         * pohybe; vtedy sa ukazovateľ zachytí a zvyšok ide po starom.
         */
        const ram = e.currentTarget as HTMLElement;
        const od = { x: e.clientX, y: e.clientY };
        cakaRef.current = { kluc, text, odX: od.x, odY: od.y, posunX, posunY };
        const upratuj = () => {
          window.removeEventListener("pointermove", naPohyb);
          window.removeEventListener("pointerup", naPustenie);
          window.removeEventListener("pointercancel", naPustenie);
        };
        const naPohyb = (ev: PointerEvent) => {
          if (!cakaRef.current || cakaRef.current.kluc !== kluc) { upratuj(); return; }
          if (Math.hypot(ev.clientX - od.x, ev.clientY - od.y) < 5) return;
          upratuj();
          zacniTahatZTextu(ev, ram, cakaRef.current);
        };
        const naPustenie = () => { cakaRef.current = null; upratuj(); };
        window.addEventListener("pointermove", naPohyb);
        window.addEventListener("pointerup", naPustenie);
        window.addEventListener("pointercancel", naPustenie);
        return;
      }
      e.preventDefault();
      setPresunPre(null);
      setTahanie({ id: kluc, text, x: b.x, y: b.y, ciel: null, odX: e.clientX, odY: e.clientY, posunX, posunY });
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* bez zachytenia */ }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const t = tahanieRef.current;
      if (!t || t.id !== kluc) return;
      e.preventDefault();
      const b = bodVMape(e);
      setTahanie({ ...t, x: b.x, y: b.y, ciel: lenPosun ? null : cielPod(b, kluc) });
    },
    onPointerUp: (e: React.PointerEvent) => {
      cakaRef.current = null;
      const tahanie = tahanieRef.current;
      if (!tahanie || tahanie.id !== kluc) return;
      const ciel = tahanie.ciel;
      // Bublina si drží miesto, za ktoré ju človek chytil.
      const kam = { x: tahanie.x + tahanie.posunX, y: tahanie.y + tahanie.posunY };
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
    onPointerCancel: () => { cakaRef.current = null; setTahanie(null); },
  });

  /** Na ktorej strane kmeňa bublina leží (1 vpravo, −1 vľavo). */
  const stranaPodlaPozicie = (m: Miesto): 1 | -1 => {
    const k = poz["koren"];
    const stredKmena = k ? k.x + k.w / 2 : STRED.x;
    return m.x + m.w / 2 >= stredKmena ? 1 : -1;
  };

  /** Riadok v ponuke — rovnaký v ponuke vetvy aj nápadu. */
  const polozkaPonuky: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 8,
    border: "none", background: "transparent", color: C.text, fontFamily: "inherit",
    fontSize: 12.5, cursor: "pointer",
  };

  const plusStyl: React.CSSProperties = {
    width: 30, height: 30, flexShrink: 0, borderRadius: "50%", padding: 0,
    border: `1px dashed ${mix(C.border, 130)}`, background: "transparent", color: C.textDim,
    fontFamily: "inherit", fontSize: 15, lineHeight: 1, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  /**
   * TLAČIDLÁ VEDĽA BUBLINY — mimo toku, nie vo flexe.
   *
   * Kým bublina a jej tlačidlá stáli v jednom riadku flexu, `row-reverse`
   * pri ľavej strane posunul samotnú bublinu o šírku tlačidiel doprava —
   * zatiaľ čo čiary sa kreslia z vypočítaného miesta. Rozdiel bol vyše
   * tridsať pixelov a presne to Jerry videl 25. 9. 2026: „čiary zasahujú do
   * textu." Bublina teraz stojí tam, kde ju rozloženie položilo, a tlačidlá
   * visia vedľa nej.
   */
  const vedlaStyl = (strana: 1 | -1): React.CSSProperties => ({
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexDirection: strana === 1 ? "row" : "row-reverse",
    ...(strana === 1 ? { left: "100%", marginLeft: 7 } : { right: "100%", marginRight: 7 }),
  });

  /** Rám, za ktorý sa bublina chytá. Rovnaký pre nápad, vetvu aj kmeň. */
  const ramStyl = (kluc: string, rucne: boolean): React.CSSProperties => ({
    padding: 5,
    // Rám sa chytá, nečíta — bez tohto ťah po ňom označuje text na mape.
    userSelect: "none",
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
    const f = farbaU(u);
    const deti = uzly.filter((x) => x.rodic === u.id).length;
    // Na ktorej strane kmeňa bublina leží. Tlačidlá patria VŽDY na vonkajšiu
    // stranu — inak „+" pri ľavej vetve ukazuje späť do stredu a nová bublina
    // vyrastie na opačnú stranu, než kam prst mieri.
    // `row-reverse` otočí poradie detí, takže „+" a zbalenie skončia na
    // vonkajšej strane. Robí to JEDEN mechanizmus — `order` navrch by to
    // otočilo druhýkrát a bolo by to zase zle.
    const strana = stranaPodlaPozicie(p);
    return (
      <div key={klucU(u)} style={{ position: "absolute", left: p.x - 6, top: p.y - 6, zIndex: presunPre === u.id ? 4 : (tahanie?.id === u.id ? 5 : undefined) }}>
        <div {...tahaj(u.id, u.text, false)} title="Chyť za rám a presuň" style={ramStyl(u.id, u.posX != null)}>
        <input
          {...vstupNapadu(u, deti)}
          style={{
            width: p.w, boxSizing: "border-box", padding: "12px 17px", borderRadius: 999,
            background: C.card, border: `1px solid ${f}`, color: C.text,
            fontFamily: "inherit", fontSize: 14, outline: "none",
            // Zhoda hľadania svieti, kým je hľadanie otvorené; cieľ skoku
            // navyše na chvíľu hrubšie.
            boxShadow: zvyrazneny === u.id ? `0 0 0 3px ${C.accent}` : (zhodyTu.has(u.id) ? `0 0 0 2px ${mix(C.accent, 70)}` : undefined),
          }}
        />
        </div>
        <div style={vedlaStyl(strana)}>
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
            style={plusStyl}
          >
            +
          </button>
        </div>
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
            {vetvy.map((v: Vetva) => {
              const tu = !u.rodic && vetvaU(u.id) === v.id;
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

  /** Klik vyberie / zruší, shift+klik vyberie celý úsek od posledného. */
  const prepniVyber = (id: string, usek: boolean, rad: string[]) => {
    const od = poslednyVyber.current;
    setVybrane((v) => {
      const n = new Set(v);
      if (usek && od && rad.includes(od)) {
        const a = rad.indexOf(od);
        const b = rad.indexOf(id);
        for (const x of rad.slice(Math.min(a, b), Math.max(a, b) + 1)) n.add(x);
      } else if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    poslednyVyber.current = id;
  };

  /** Vybraným nápadom bez fázy jedna fáza naraz — jeden zápis, jeden krok späť. */
  const hromadnaFaza = async (f: number) => {
    const ids = naPlan.filter((u) => !u.faza && vybrane.has(u.id) && !u.id.startsWith("ukladam-")).map((u) => u.id);
    if (!ids.length) return;
    const tieto = new Set(ids);
    setRiadky((r) => r.map((x) => (tieto.has(x.id) ? { ...x, faza: f } : x)));
    setVybrane(new Set());
    poslednyVyber.current = null;
    if (await posli({ akcia: "napady-faza", ids, faza: f })) {
      zapamataj(`fáza ${f} pre ${ids.length}`, async () => { await posli({ akcia: "napady-faza", ids, faza: 0 }); });
      oznam("marketing");
    } else nacitaj();
  };

  // Číslica 1–5 priradí fázu vybraným — ruka nemusí z klávesnice na myš.
  useEffect(() => {
    if (pohlad !== "triedenie" || !vybrane.size) return;
    const na = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const kde = document.activeElement as HTMLElement | null;
      if (kde && (kde.tagName === "INPUT" || kde.tagName === "TEXTAREA" || kde.tagName === "SELECT" || kde.isContentEditable)) return;
      // Len keď je mapa v strede obrazovky alebo v nej je fokus — číslica
      // inde na stránke nesmie ticho zaradiť nápady, ktoré nevidno.
      const k = document.getElementById("mapa-napadov");
      if (!k) return;
      const rr = k.getBoundingClientRect();
      const vnutri = !!kde && k.contains(kde);
      if (!vnutri && !(rr.top < window.innerHeight * 0.6 && rr.bottom > window.innerHeight * 0.4)) return;
      if (e.key === "Escape") { setVybrane(new Set()); return; }
      const f = Number(e.key);
      if (f >= 1 && f <= 5) { e.preventDefault(); void hromadnaFaza(f); }
    };
    document.addEventListener("keydown", na);
    return () => document.removeEventListener("keydown", na);
  });

  /** Krok späť — rovnaký odkaz v každom pohľade. */
  const spatOdkaz = (
    <button
      type="button"
      disabled={!kroky.length}
      onClick={() => void vratKrok()}
      title={kroky.length ? `Vrátiť: ${kroky[kroky.length - 1].popis}` : "Zatiaľ nie je čo vrátiť"}
      style={{ background: "none", border: "none", padding: 0, color: kroky.length ? C.accentLight : C.textDim, fontFamily: "inherit", fontSize: 11.5, cursor: kroky.length ? "pointer" : "default", textDecoration: kroky.length ? "underline" : "none", textUnderlineOffset: 2 }}
    >
      ↶ späť{kroky.length ? ` · ${kroky[kroky.length - 1].popis}` : ""}
    </button>
  );

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
          {([["mapa", "Mapa"], ["osnova", "Osnova"], ["triedenie", "Vysyp a usporiadaj"]] as const).map(([id, label]) => (
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
        {/* HĽADANIE naprieč všetkými mapami. Prehliadačové ⌘F do políčok
            bublín nevidí, takže „napísal som to už?" nemalo odpoveď. */}
        <div style={{ position: "relative" }}>
          {hladam === null ? (
            <button
              type="button"
              onClick={() => { setHladam(""); requestAnimationFrame(() => hladajRef.current?.focus()); }}
              style={{ padding: "7px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}
            >
              ⌕ hľadať <span style={{ color: C.textDim }}>⌘F</span>
            </button>
          ) : (
            <input
              ref={hladajRef}
              type="search"
              aria-label="Hľadať v nápadoch"
              placeholder="hľadať vo všetkých mapách…"
              value={hladam}
              onChange={(e) => setHladam(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); setHladam(null); }
                if (e.key === "Enter" && zhody[0]) { e.preventDefault(); skocNaNapad(zhody[0]); }
              }}
              // Klik do výsledku príde až po blur — bez oneskorenia by sa
              // zoznam zavrel skôr, než klik dobehne.
              onBlur={() => window.setTimeout(() => setHladam((h) => (h && h.trim() ? h : null)), 150)}
              style={{ width: 240, padding: "7px 12px", borderRadius: 9, border: `1px solid ${C.accent}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5 }}
            />
          )}
          {hladam !== null && hladam.trim() !== "" && (
            <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 20, width: 380, maxHeight: 360, overflow: "auto", padding: 6, borderRadius: 11, background: C.surface, border: `1px solid ${mix(C.border, 140)}`, boxShadow: "0 10px 26px rgba(0,0,0,.45)" }}>
              {!zhody.length && <div style={{ padding: "8px 10px", fontSize: 12.5, color: C.textDim }}>Nič také v mapách nie je.</div>}
              {zhody.map((z) => {
                const mapaZ = z.mapa_id || "m-hlavna";
                return (
                  <button
                    key={z.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => skocNaNapad(z)}
                    style={{ ...polozkaPonuky, display: "flex", alignItems: "baseline", gap: 8 }}
                  >
                    <span style={{ flexGrow: 1 }}>{z.text}</span>
                    {mapaZ !== mapaId && <span style={{ flexShrink: 0, fontSize: 11, color: C.textDim }}>{mapy.find((m) => m.id === mapaZ)?.nazov || "iná mapa"}</span>}
                    {z.stav === "pouzity" && <span style={{ flexShrink: 0, fontSize: 11, color: C.textDim }}>použitý</span>}
                  </button>
                );
              })}
              {zhody.length >= 40 && <div style={{ padding: "6px 10px", fontSize: 11, color: C.textDim }}>Prvých 40 — spresni hľadanie.</div>}
            </div>
          )}
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
            <span><b style={{ color: C.text }}>↑ ↓</b> o nápad vyššie / nižšie</span>
            <span><b style={{ color: C.text }}>⌘↑ ⌘↓</b> preradiť</span>
            <span><b style={{ color: C.text }}>⌫</b> na prázdnej zmaže</span>
            <span><b style={{ color: C.text }}>Esc</b> zahodí rozpísanú</span>
            <span><b style={{ color: C.text }}>⌘Z</b> krok späť</span>
            <span>klik na <b style={{ color: C.text }}>obvod</b> = farba, fáza, presun</span>
            <span>alebo chyť bublinu <b style={{ color: C.text }}>za rám</b> a pusť ju nad iný nápad</span>
            {spatOdkaz}
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
              <button type="button" aria-label="Oddialiť" onClick={() => zmenZoom((z) => z - 0.1)} style={tlacidloZoom}>−</button>
              <button type="button" onClick={() => zmenZoom(1)} title="Späť na 100 %" style={{ ...tlacidloZoom, width: 46, fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)} %</button>
              <button type="button" aria-label="Priblížiť" onClick={() => zmenZoom((z) => z + 0.1)} style={tlacidloZoom}>+</button>
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
                  {vetvy.map((v: Vetva) => <option key={v.id} value={v.id}>{v.nazov}</option>)}
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
          <div ref={plochaRef} style={{ position: "relative", height: 520, overflow: "auto", border: `1px solid ${mix(C.border, 80)}`, borderRadius: 13, background: mix(C.card, 60), overscrollBehavior: "contain", userSelect: tahanie ? "none" : undefined }}>
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
                  {/* Z kmeňa sa dá písať rovno. Vetvu si nápad vyberie sám —
                      ponuka je tesne pri tlačidle, aby to bol jeden pohyb. */}
                  <div style={vedlaStyl(1)}>
                    <button
                      type="button"
                      aria-label="Pridať nápad z hlavnej bubliny"
                      onClick={() => setPresunPre(presunPre === "koren" ? null : "koren")}
                      style={plusStyl}
                    >
                      +
                    </button>
                  </div>
                  {presunPre === "koren" && (
                    <div style={{ position: "absolute", left: "100%", top: 44, zIndex: 6, minWidth: 210, padding: 6, borderRadius: 11, background: C.surface, border: `1px solid ${mix(C.border, 140)}`, boxShadow: "0 10px 26px rgba(0,0,0,.45)" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: C.textDim, padding: "4px 8px 6px" }}>NOVÝ NÁPAD DO VETVY</div>
                      {vetvy.map((v: Vetva) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setPresunPre(null);
                            void zaloz("", v.id, uzly.filter((x) => !x.rodic && vetvaU(x.id) === v.id).length);
                          }}
                          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 8, border: "none", background: "transparent", color: C.text, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.farba, flexShrink: 0 }} />
                          {v.nazov}
                        </button>
                      ))}
                      {/* NOVÁ VETVA. Jerry, 25. 9. 2026: „v Obsahu nie som
                          schopný vytvoriť ďalšiu novú kategóriu." Píše sa
                          rovno tu — dialóg by prerušil myšlienku. */}
                      <div style={{ borderTop: `1px solid ${mix(C.border, 60)}`, marginTop: 4, paddingTop: 4 }}>
                        {novaVetvaNazov === null ? (
                          <button
                            type="button"
                            onClick={() => setNovaVetvaNazov("")}
                            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 8, border: "none", background: "transparent", color: C.accentLight, fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}
                          >
                            + nová vetva
                          </button>
                        ) : (
                          <input
                            autoFocus
                            value={novaVetvaNazov}
                            placeholder="názov vetvy"
                            onChange={(e) => setNovaVetvaNazov(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); void zalozVetvu(novaVetvaNazov); }
                              if (e.key === "Escape") { e.preventDefault(); setNovaVetvaNazov(null); }
                            }}
                            onBlur={() => setNovaVetvaNazov(null)}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5 }}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {vetvy.map((v: Vetva) => {
                const p = poz["vetva:" + v.id];
                if (!p) return null;
                const kolko = uzly.filter((u) => !u.rodic && vetvaU(u.id) === v.id).length;
                return (
                  <div key={v.id} style={{ position: "absolute", left: p.x - 6, top: p.y - 6, zIndex: tahanie?.id === "vetva:" + v.id ? 5 : undefined }}>
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
                    <div style={vedlaStyl(stranaPodlaPozicie(p))}>
                      <button
                        type="button"
                        aria-label={`Pridať nápad do vetvy ${v.nazov}`}
                        onClick={() => void zaloz("", v.id, kolko)}
                        style={plusStyl}
                      >
                        +
                      </button>
                    </div>
                    {/* Ponuka vetvy — otvára ju klik na obvod, rovnako ako
                        pri nápade. Premenovať, prefarbiť, prehodiť na druhú
                        stranu, zmazať. */}
                    {presunPre === "vetva:" + v.id && (
                      <div style={{ position: "absolute", left: stranaPodlaPozicie(p) === 1 ? 0 : "auto", right: stranaPodlaPozicie(p) === 1 ? "auto" : 0, top: 52, zIndex: 6, minWidth: 226, padding: 6, borderRadius: 11, background: C.surface, border: `1px solid ${mix(C.border, 140)}`, boxShadow: "0 10px 26px rgba(0,0,0,.45)" }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: C.textDim, padding: "4px 8px 6px" }}>VETVA</div>
                        {premenuvaVetva?.id === v.id ? (
                          <input
                            autoFocus
                            value={premenuvaVetva.text}
                            onChange={(e) => setPremenuvaVetva({ id: v.id, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); void premenujVetvu(v.id, premenuvaVetva.text); }
                              if (e.key === "Escape") { e.preventDefault(); setPremenuvaVetva(null); }
                            }}
                            onBlur={() => setPremenuvaVetva(null)}
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5 }}
                          />
                        ) : (
                          <button type="button" onClick={() => setPremenuvaVetva({ id: v.id, text: v.nazov })} style={polozkaPonuky}>premenovať</button>
                        )}
                        <div style={{ display: "flex", gap: 5, padding: "6px 8px" }}>
                          {FARBY.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              aria-label={`Farba vetvy ${f.nazov}`}
                              onClick={() => void prefarbiVetvu(v.id, f.farba)}
                              style={{ width: 17, height: 17, borderRadius: "50%", background: f.farba, border: v.farba.toLowerCase() === f.farba.toLowerCase() ? `2px solid ${C.text}` : "1px solid rgba(0,0,0,.35)", cursor: "pointer", padding: 0 }}
                            />
                          ))}
                        </div>
                        <button type="button" onClick={() => void prehodVetvu(v.id)} style={polozkaPonuky}>
                          {v.strana === 1 ? "presunúť doľava od kmeňa" : "presunúť doprava od kmeňa"}
                        </button>
                        {v.id !== ODKLADISKO && (
                          <button type="button" onClick={() => void zmazVetvu(v.id)} style={{ ...polozkaPonuky, color: C.textMuted, borderTop: `1px solid ${mix(C.border, 60)}`, marginTop: 4, paddingTop: 8 }}>
                            zmazať vetvu{kolko ? ` — ${kolko} nápadov padne do odkladiska` : ""}
                          </button>
                        )}
                      </div>
                    )}
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

      {/* OSNOVA — tie isté nápady ako zoznam (XMind Outliner). Písať dvadsať
          viet je v zozname rýchlejšie a celý mesiac sa dá prečítať naraz.
          Klávesnica je tá istá ako na mape; ↑ ↓ tu idú po riadkoch. */}
      {nacitane && pohlad === "osnova" && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: C.textDim, marginBottom: 8 }}>
            <span style={{ color: C.textMuted }}>Klávesnica:</span>
            <span><b style={{ color: C.text }}>Enter</b> ďalší riadok</span>
            <span><b style={{ color: C.text }}>Tab</b> odsadiť pod</span>
            <span><b style={{ color: C.text }}>shift+Tab</b> o úroveň vyššie</span>
            <span><b style={{ color: C.text }}>↑ ↓</b> po riadkoch</span>
            <span><b style={{ color: C.text }}>⌘↑ ⌘↓</b> preradiť</span>
            <span><b style={{ color: C.text }}>⌫</b> na prázdnom zmaže</span>
            {spatOdkaz}
          </div>
          <div style={{ maxHeight: 560, overflow: "auto", padding: "6px 4px", border: `1px solid ${mix(C.border, 80)}`, borderRadius: 13, background: mix(C.card, 60) }}>
            {stromOsnovy.map(({ vetva, riadky: rs }) => {
              const korenov = rs.filter((x) => x.hlbka === 0).length;
              return (
                <div key={vetva.id} style={{ padding: "8px 12px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 5, marginBottom: 4, borderBottom: `1px solid ${mix(vetva.farba, 45)}` }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: vetva.farba, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{vetva.nazov}</span>
                    <span style={{ fontSize: 11.5, color: C.textDim }}>{rs.filter((x) => x.uzol.id !== DOCASNY).length}</span>
                    <span style={{ flexGrow: 1 }} />
                    <button
                      type="button"
                      onClick={() => void zaloz("", vetva.id, uzly.filter((x) => !x.rodic && vetvaU(x.id) === vetva.id).reduce((m, x) => Math.max(m, x.poradie + 1), 0))}
                      style={{ background: "none", border: "none", padding: "2px 4px", color: C.accentLight, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}
                    >
                      + nápad
                    </button>
                  </div>
                  {!korenov && <div style={{ fontSize: 12, color: C.textDim, padding: "4px 0 2px 26px" }}>prázdne</div>}
                  {rs.map(({ uzol: u, hlbka, deti }) => (
                    <div key={klucU(u)} style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: hlbka * 22, minHeight: 30 }}>
                      <button
                        type="button"
                        aria-label={deti ? (u.zbalene ? "Rozbaliť" : "Zbaliť") : "Bez nadväzujúcich nápadov"}
                        disabled={!deti}
                        onClick={() => void prepniZbal(u)}
                        style={{ width: 20, height: 20, flexShrink: 0, padding: 0, border: "none", borderRadius: 5, background: "transparent", color: deti ? C.textMuted : mix(C.textDim, 60), fontFamily: "inherit", fontSize: 11, cursor: deti ? "pointer" : "default" }}
                      >
                        {deti ? (u.zbalene ? "▸" : "▾") : "•"}
                      </button>
                      <input
                        {...vstupNapadu(u, deti)}
                        style={{
                          flexGrow: 1, minWidth: 0, padding: "5px 8px", borderRadius: 7,
                          border: `1px solid ${zvyrazneny === u.id ? C.accent : (zhodyTu.has(u.id) ? mix(C.accent, 70) : "transparent")}`,
                          background: "transparent", color: u.stav === "pouzity" ? C.textMuted : C.text,
                          fontFamily: "inherit", fontSize: hlbka === 0 ? 13.5 : 13, outline: "none",
                          borderLeft: `2px solid ${hlbka === 0 ? farbaU(u) : "transparent"}`,
                        }}
                      />
                      {u.zbalene && deti > 0 && <span style={{ fontSize: 11, color: C.textDim, flexShrink: 0 }}>+{deti}</span>}
                      {u.stav === "pouzity" && <span style={{ fontSize: 10.5, color: C.textDim, flexShrink: 0 }}>použitý</span>}
                      {u.faza > 0 && (
                        <span title={nazovFazy(u.faza)} style={{ width: 17, height: 17, flexShrink: 0, borderRadius: 4, background: fazaFarba(u.faza), color: "#10130e", fontSize: 10.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{u.faza}</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {nacitane && pohlad === "triedenie" && (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 13, background: mix(C.card, 60), border: `1px dashed ${C.border}`, maxHeight: 520, overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.textDim }}>BEZ FÁZY · {bezFazyRad.length}</span>
              <span style={{ flexGrow: 1 }} />
              {bezFazyRad.length > 1 && (
                <button
                  type="button"
                  onClick={() => setVybrane(vybrane.size === bezFazyRad.length ? new Set() : new Set(bezFazyRad))}
                  style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontFamily: "inherit", fontSize: 11.5, cursor: "pointer" }}
                >
                  {vybrane.size === bezFazyRad.length ? "zrušiť výber" : "vybrať všetky"}
                </button>
              )}
            </div>
            {/* Vybraté naraz do jednej fázy. Klik na kartu vyberá, shift+klik
                vyberie úsek, číslica 1–5 priradí — bez mierenia na tlačidlá. */}
            {vybrane.size > 0 && (
              <div style={{ position: "sticky", top: -14, zIndex: 2, margin: "0 -14px", padding: "10px 14px", background: C.surface, borderBottom: `1px solid ${mix(C.border, 120)}` }}>
                <div style={{ fontSize: 12, color: C.text, marginBottom: 7 }}>
                  <b>{vybrane.size}</b> vybraných — do fázy <span style={{ color: C.textDim }}>(alebo číslica 1–5)</span>
                </div>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  {[1, 2, 3, 4, 5].map((f) => (
                    <button key={f} type="button" title={nazovFazy(f)} onClick={() => void hromadnaFaza(f)} style={{ width: 32, height: 32, borderRadius: 8, padding: 0, cursor: "pointer", border: "none", background: fazaFarba(f), color: "#10130e", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700 }}>
                      {f}
                    </button>
                  ))}
                  <span style={{ flexGrow: 1 }} />
                  <button type="button" onClick={() => setVybrane(new Set())} style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontFamily: "inherit", fontSize: 11.5, cursor: "pointer" }}>zrušiť</button>
                </div>
              </div>
            )}
            {bezFazyUzly.map((u) => (
              <div
                key={u.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  prepniVyber(u.id, e.shiftKey, bezFazyRad);
                }}
                style={{
                  padding: "10px 12px", borderRadius: 11, cursor: "pointer", userSelect: "none",
                  background: vybrane.has(u.id) ? mix(C.accent, 16) : C.surface,
                  border: `1px solid ${vybrane.has(u.id) ? C.accent : C.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                  <input
                    type="checkbox"
                    aria-label={`Vybrať „${u.text}“`}
                    checked={vybrane.has(u.id)}
                    onChange={() => { /* klik rieši karta — inak by sa výber prepol dvakrát */ }}
                    style={{ marginTop: 2, flexShrink: 0, accentColor: C.accent, pointerEvents: "none" }}
                  />
                  <span style={{ width: 8, height: 8, flexShrink: 0, marginTop: 5, borderRadius: "50%", background: farbaU(u) }} />
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
                      <span style={{ width: 8, height: 8, flexShrink: 0, marginTop: 4, borderRadius: "50%", background: farbaU(u) }} />
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
