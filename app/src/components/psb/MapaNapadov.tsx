import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { doSchranky } from "../../lib/psb/kopirovanie";
import { nazovFazy } from "../../lib/psb/mapaCyklu";
import {
  VETVY, farbaVetvy, mapaNaText, rozlozMapu, smiePresunut, vetvaUzla, viditelny, type Uzol,
} from "../../lib/psb/mapaNapadov";
import { C, mix } from "../../lib/psb/theme";
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
  id: string; text: string; faza?: number;
  rodic?: string; vetva?: string; poradie?: number; zbalene?: number;
  stav?: string;
};

const DOCASNY = "tmp";
const KADENCIA = 2;

const mesiacSlovom = (d: Date) => {
  const M = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
  return `${M[d.getMonth()]} ${d.getFullYear()}`;
};

export function MapaNapadov({ chat }: { chat?: AssistantChat }) {
  const [riadky, setRiadky] = useState<Riadok[]>([]);
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
  const [tahanie, setTahanie] = useState<{ id: string; text: string; x: number; y: number; ciel: string | null } | null>(null);
  const plochaRef = useRef<HTMLDivElement | null>(null);

  const nacitaj = useCallback(() => void fetch("/api/napady", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((j: { napady?: Riadok[] }) => setRiadky(j.napady || []))
    .catch(() => {})
    .finally(() => setNacitane(true)), []);
  useEffect(() => { nacitaj(); }, [nacitaj]);

  /** Zápis na server. Vracia úspech — „uložené“ sa nesmie tvrdiť do prázdna. */
  const posli = async (telo: Record<string, unknown>): Promise<string | null> => {
    const j = await fetch("/api/napady", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(telo),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    if (!j?.ok) { setChyba(j?.error || "Zmena sa nezapísala — skús znova."); return null; }
    setChyba("");
    return String(j.id || telo.id || "");
  };

  const uzly = useMemo<Uzol[]>(() => {
    const zive = riadky
      .filter((r) => r.stav !== "zamietnuty")
      .map((r) => ({
        id: r.id,
        text: r.text || "",
        rodic: r.rodic || "",
        vetva: r.vetva || "nezaradene",
        poradie: Number(r.poradie || 0),
        zbalene: !!r.zbalene,
        faza: Number(r.faza || 0),
      }));
    if (novy) {
      zive.push({ id: DOCASNY, text: novy.text, rodic: novy.rodic, vetva: novy.vetva, poradie: novy.poradie, zbalene: false, faza: 0 });
    }
    return zive;
  }, [riadky, novy]);

  const { poz, vyska } = useMemo(() => rozlozMapu(uzly, { x: 38, y: 28, text: "Obsah · " + mesiacSlovom(new Date()) }), [uzly]);

  /** Uloží rozpísaný uzol (alebo ho zahodí, keď je prázdny). */
  const dopis = useCallback(async (vratFokus = false): Promise<void> => {
    if (casovac.current) { clearTimeout(casovac.current); casovac.current = null; }
    const d = novyRef.current;
    if (!d) return;
    nastavNovy(null);
    const t = d.text.trim();
    if (t.length < 3) return;
    const id = await posli({ text: t, zdroj: "vlastny", rodic: d.rodic, vetva: d.vetva, poradie: d.poradie });
    // Keď zápis neprejde, koncept sa VRÁTI na obrazovku aj s textom. Zmiznúť
    // smie len to, čo je uložené — inak človek napíše vetu a tá sa stratí.
    if (!id) { nastavNovy(d); return; }
    if (vratFokus) zameraj.current = id;
    nacitaj();
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
      setZoom((z) => Math.min(1.5, Math.max(0.4, Math.round((z - e.deltaY * 0.0025) * 100) / 100)));
    };
    el.addEventListener("wheel", na, { passive: false });
    return () => el.removeEventListener("wheel", na);
    // Plocha vzniká až po načítaní a len v pohľade Mapa — s prázdnym zoznamom
    // závislostí by sa poslucháč vešal na ešte neexistujúci prvok a štipnutie
    // by ticho nerobilo nič. (Presne to sa 25. 9. aj stalo.)
  }, [nacitane, pohlad]);

  /** Odchod z obrazovky koncept nezahodí. */
  useEffect(() => () => {
    if (casovac.current) clearTimeout(casovac.current);
    void dopis();
  }, [dopis]);

  const zaloz = async (rodic: string, vetva: string, poradie: number) => {
    await dopis();
    nastavNovy({ rodic, vetva, poradie, text: "" });
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
    if (t.trim().length < 3) return;
    await posli({ id, text: t.trim() });
  };

  const zmaz = async (id: string) => {
    if (id === DOCASNY) { nastavNovy(null); return; }
    if (uzly.some((u) => u.rodic === id)) return;
    await posli({ id, zmaz: true });
    nacitaj();
  };

  const prepniZbal = async (u: Uzol) => {
    setRiadky((r) => r.map((x) => (x.id === u.id ? { ...x, zbalene: u.zbalene ? 0 : 1 } : x)));
    await posli({ id: u.id, zbalene: !u.zbalene });
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
    setRiadky((r) => r.map((x) => (x.id === u.id ? { ...x, rodic: "", vetva, poradie: koniec } : x)));
    await posli({ id: u.id, rodic: "", vetva, poradie: koniec });
    nacitaj();
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

  /** Zavesiť nápad pod iný nápad (ťahaním). Kruh v strome neprejde. */
  const presunPodUzol = async (u: Uzol, cielId: string) => {
    if (u.id === DOCASNY || !smiePresunut(u.id, cielId, uzly)) return;
    const koniec = uzly.filter((x) => x.rodic === cielId).length;
    // `vetva` sa pri zavesení pod iný nápad VYPRÁZDNI: platí len na koreňových
    // a nechať v nej starú hodnotu by znamenalo druhú, neplatnú pravdu
    // o tom, kam nápad patrí.
    setRiadky((r) => r.map((x) => (x.id === u.id ? { ...x, rodic: cielId, vetva: "", poradie: koniec } : x)));
    await posli({ id: u.id, rodic: cielId, vetva: "", poradie: koniec });
    nacitaj();
  };

  const nastavFazu = async (id: string, f: number) => {
    setRiadky((r) => r.map((x) => (x.id === id ? { ...x, faza: f } : x)));
    await posli({ id, faza: f });
  };

  const vidno = uzly.filter((u) => viditelny(u.id, uzly));
  // Šírka plochy z ROZLOŽENIA, nie natvrdo: pri zbalených vetvách bola
  // dvojtisícpixelová plocha z väčšej časti prázdna a posuvník klamal o tom,
  // koľko mapy ešte je.
  const sirkaMapy = Math.max(900, ...Object.values(poz).map((m) => m.x + m.w)) + 140;
  const vyskaMapy = Math.max(420, vyska);
  const zmestiSa = () => {
    const el = plochaRef.current;
    if (!el) return;
    setZoom(Math.min(1, Math.max(0.4, Math.round((el.clientWidth / sirkaMapy) * 100) / 100)));
  };
  const listy = uzly.filter((u) => u.text.trim());
  const sFazou = listy.filter((u) => u.faza > 0);
  const chybaDoMesiaca = Math.max(0, KADENCIA * 4 - sFazou.length);

  const ciary: { id: string; d: string; farba: string; hrubka: number }[] = [];
  const spoj = (a: { x: number; y: number; w: number } | undefined, b: { x: number; y: number } | undefined, farba: string, hrubka: number, id: string) => {
    if (!a || !b) return;
    const x1 = a.x + a.w, y1 = a.y + 26, x2 = b.x, y2 = b.y + 26, m = (x1 + x2) / 2;
    ciary.push({ id, d: `M ${x1} ${y1} C ${m} ${y1}, ${m} ${y2}, ${x2} ${y2}`, farba, hrubka });
  };
  for (const v of VETVY) spoj(poz["koren"], poz["vetva:" + v.id], v.farba, 3, "v" + v.id);
  for (const u of vidno) {
    const f = farbaVetvy(vetvaUzla(u.id, uzly));
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
      if (bod.x < m.x || bod.x > m.x + m.w || bod.y < m.y || bod.y > m.y + 52) continue;
      if (kluc.startsWith("vetva:")) return kluc;
      return smiePresunut(okremId, kluc, uzly) ? kluc : null;
    }
    return null;
  };

  /** Spoločná obsluha ťahania pre bublinu aj vetvu. */
  const tahaj = (u: Uzol) => ({
    onPointerDown: (e: React.PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.closest("button")) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setPresunPre(null);
      const b = bodVMape(e);
      setTahanie({ id: u.id, text: u.text, x: b.x, y: b.y, ciel: null });
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!tahanie || tahanie.id !== u.id) return;
      const b = bodVMape(e);
      setTahanie({ ...tahanie, x: b.x, y: b.y, ciel: cielPod(b, u.id) });
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!tahanie || tahanie.id !== u.id) return;
      const ciel = tahanie.ciel;
      setTahanie(null);
      if (!ciel) return;
      if (ciel.startsWith("vetva:")) void presunDoVetvy(u, ciel.slice(6));
      else void presunPodUzol(u, ciel);
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    },
    onPointerCancel: () => setTahanie(null),
  });

  const bublina = (u: Uzol) => {
    const p = poz[u.id];
    if (!p) return null;
    const f = farbaVetvy(vetvaUzla(u.id, uzly));
    const deti = uzly.filter((x) => x.rodic === u.id).length;
    return (
      <div key={u.id} style={{ position: "absolute", left: p.x, top: p.y, display: "flex", alignItems: "center", gap: 7, zIndex: presunPre === u.id ? 4 : (tahanie?.id === u.id ? 5 : undefined) }}>
        <div
          {...tahaj(u)}
          title="Chyť za rám a presuň"
          style={{
            padding: 5, borderRadius: 999, touchAction: "none",
            cursor: tahanie?.id === u.id ? "grabbing" : "grab",
            border: `1px solid ${tahanie?.ciel === u.id ? C.accent : "transparent"}`,
            background: tahanie?.ciel === u.id ? mix(C.accent, 16) : "transparent",
            opacity: tahanie?.id === u.id ? 0.45 : 1,
          }}
        >
        <input
          type="text"
          aria-label="Nápad"
          placeholder="píš…"
          value={u.text}
          ref={(el) => { if (el && zameraj.current === u.id) { zameraj.current = null; el.focus(); } }}
          onChange={(e) => void uprav(u.id, e.target.value)}
          onBlur={() => void ulozText(u.id, u.text)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); void oUrovenVyssie(u); }
            else if (e.key === "Tab") { e.preventDefault(); void zaloz(u.id, "", deti); }
            else if (e.key === "Enter") { e.preventDefault(); void zaloz(u.rodic, u.rodic ? "" : vetvaUzla(u.id, uzly), u.poradie + 1); }
            else if (e.key === "Backspace" && !u.text) { e.preventDefault(); void zmaz(u.id); }
            // Escape ukladá SÁM, nespolieha sa na blur — obsluha odchodu
            // z políčka sa pri prvej verzii ukázala ako nespoľahlivá.
            else if (e.key === "Escape") { (e.target as HTMLInputElement).blur(); void dopis(); }
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
          <div style={{ position: "absolute", left: 0, top: 46, zIndex: 3, minWidth: 210, padding: 6, borderRadius: 11, background: C.surface, border: `1px solid ${mix(C.border, 140)}`, boxShadow: "0 10px 26px rgba(0,0,0,.45)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: C.textDim, padding: "4px 8px 6px" }}>PRESUNÚŤ DO VETVY</div>
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
              Nadväzujúce nápady idú s ním.
            </div>
          </div>
        )}
      </div>
    );
  };

  const doJarvisa = () => {
    const t = mapaNaText(uzly, { mesiac: mesiacSlovom(new Date()), kadenciaTyzdenne: KADENCIA, nazovFazy });
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
          {listy.length} nápadov · <b style={{ color: C.text }}>{sFazou.length} má fázu</b> · {listy.length - sFazou.length} bez nej
        </span>
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
            <span><b style={{ color: C.text }}>⇄</b> presunie do inej vetvy</span>
            <span>alebo chyť bublinu <b style={{ color: C.text }}>za rám</b> a pusť ju nad iný nápad</span>
            <span style={{ flexGrow: 1 }} />
            <span>dva prsty na trackpade — štipnutím priblížiš a oddiališ</span>
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card }}>
              <button type="button" aria-label="Oddialiť" onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.1) * 100) / 100))} style={tlacidloZoom}>−</button>
              <button type="button" onClick={() => setZoom(1)} title="Späť na 100 %" style={{ ...tlacidloZoom, width: 46, fontVariantNumeric: "tabular-nums" }}>{Math.round(zoom * 100)} %</button>
              <button type="button" aria-label="Priblížiť" onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 100) / 100))} style={tlacidloZoom}>+</button>
              <button type="button" onClick={zmestiSa} title="Zmestiť celú mapu do šírky" style={{ ...tlacidloZoom, width: "auto", padding: "0 8px" }}>zmestiť</button>
            </div>
          </div>
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
                <div style={{ position: "absolute", left: poz["koren"].x, top: poz["koren"].y, width: poz["koren"].w, boxSizing: "border-box", padding: "15px 20px", borderRadius: 14, background: C.surface, border: `1px solid ${mix(C.border, 130)}`, color: C.text, fontSize: 15.5, fontWeight: 600 }}>
                  Obsah · {mesiacSlovom(new Date())}
                </div>
              )}
              {VETVY.map((v) => {
                const p = poz["vetva:" + v.id];
                if (!p) return null;
                const kolko = uzly.filter((u) => !u.rodic && vetvaUzla(u.id, uzly) === v.id).length;
                return (
                  <div key={v.id} style={{ position: "absolute", left: p.x, top: p.y, display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{
                      width: p.w, boxSizing: "border-box", padding: "12px 17px", borderRadius: 999,
                      background: tahanie?.ciel === "vetva:" + v.id ? mix(C.accent, 18) : C.surface,
                      border: `1px solid ${tahanie?.ciel === "vetva:" + v.id ? C.accent : v.farba}`,
                      borderLeftWidth: 4, color: C.text, fontSize: 14.5, fontWeight: 600,
                    }}>
                      {v.nazov} <span style={{ color: C.textDim, fontWeight: 400 }}>{kolko}</span>
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
                    {tahanie.ciel ? "pustiť sem" : "pusť nad nápad alebo vetvu"}
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
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.textDim }}>BEZ FÁZY · {listy.length - sFazou.length}</div>
            {listy.filter((u) => !u.faza).map((u) => (
              <div key={u.id} style={{ padding: "10px 12px", borderRadius: 11, background: C.surface, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                  <span style={{ width: 8, height: 8, flexShrink: 0, marginTop: 5, borderRadius: "50%", background: farbaVetvy(vetvaUzla(u.id, uzly)) }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.35, color: C.text }}>{u.text}</span>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 5 }}>
                  {[1, 2, 3, 4, 5].map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-label={`Zaradiť do fázy ${f} — ${nazovFazy(f)}`}
                      onClick={() => void nastavFazu(u.id, f)}
                      style={{ width: 32, height: 32, borderRadius: 8, padding: 0, cursor: "pointer", border: `1px solid ${FAZA_FARBA[f]}`, background: "transparent", color: FAZA_FARBA[f], fontFamily: "inherit", fontSize: 12.5, fontWeight: 600 }}
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
              const kusy = listy.filter((u) => u.faza === f);
              return (
                <div key={f} style={{ flexGrow: 1, flexBasis: 0, display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 6, borderBottom: `2px solid ${FAZA_FARBA[f]}` }}>
                    <span style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 5, background: FAZA_FARBA[f], color: "#10130e", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{f}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: C.text, lineHeight: 1.15 }}>{nazovFazy(f)}</span>
                  </div>
                  {kusy.map((u) => (
                    <div key={u.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "9px 8px 9px 11px", borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${FAZA_FARBA[f]}` }}>
                      <span style={{ width: 8, height: 8, flexShrink: 0, marginTop: 4, borderRadius: "50%", background: farbaVetvy(vetvaUzla(u.id, uzly)) }} />
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
            ? `Na mesiac pri kadencii ${KADENCIA} kusy/týždeň treba ${KADENCIA * 4} kusov s fázou — chýba ${chybaDoMesiaca}.`
            : `Na mesiac to stačí: ${KADENCIA * 4} kusov s fázou pri kadencii ${KADENCIA} kusy/týždeň.`}
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

const FAZA_FARBA: Record<number, string> = {
  1: "#3E82A8", 2: "#3D9B99", 3: "#6EA45C", 4: "#C08F32", 5: "#B45038",
};
