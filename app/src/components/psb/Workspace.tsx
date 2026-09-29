import { oznam } from "../../lib/psb/obnovaSignal";
import { nazovProduktu } from "../../lib/psb/nazvyProduktov";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { navrhniKlientaKandidati, type ClientAgg } from "../../lib/psb/compute";
import { krokGesta, krokSvihu, novyStavGesta, novyStavSvihu, zacniSvih } from "../../lib/psb/gestoKariet";
import { BEZ_FRONTY, klucPolozky, popisZmeny, postavKarty, trenerZPrihlasenia, type Karta, type NeznamyNazov, type NepriradenaPlatba, type Zmena } from "../../lib/psb/workspaceKarty";
import { bezAktivnehoBalicka, treningyZObochZdrojov, vMinuseKlienta, type BezBalicka } from "../../lib/psb/bezBalicka";
import { dlznici as spocitajDlznikov, type Dlznik } from "../../lib/psb/dlznici";
import { zostavaPoPlatnosti, type ZostavaPoPlatnosti } from "../../lib/psb/platnostZostatok";

/** Riadky z `/api/balicky` a `/api/platby` — len to, čo tieto karty potrebujú. */
type BalicekRiadok = {
  klient: string; nazov: string; hodiny: number | null; platnost_od: string;
  platnost_do: string | null; cena_czk: number | null; zdroj: string; zrusene_at: string | null;
};
type PlatbaRiadok = { klient: string; datum: string; suma_czk: number; zrusene_at: string | null };
import { VydaneFaktury, type FakturaPredvolba } from "./VydaneFaktury";
import type { PSBData } from "../../lib/psb/types";
import { KlientStol } from "./KlientStol";
import { C, mix } from "../../lib/psb/theme";
import { Card } from "./ui";

/**
 * Workspace — administratíva ako kopa kariet, jedna karta = jeden DRUH práce.
 *
 * Jerry, 23. 9. 2026, po prvej skúške: „na tých kartách som si predstavoval
 * celé kategórie, nie že klienti jeden po druhom, ale zmeny kalendára
 * v jednom." Focus nie je „teraz riešim Martina", ale „teraz robím zmeny
 * v kalendári" — jeden druh naraz, lebo hlava sa neprepína.
 *
 * TRI PRAVIDLÁ, BEZ KTORÝCH JE KOPA HORŠIA NEŽ ZOZNAM
 *
 * 1. Vidno, koľko toho ešte je — v karte aj v kope. Pocit konca je celý
 *    dôvod, prečo sem človek chodí.
 * 2. Vybavený riadok zmizne z karty, ale počet vybavených je vidieť. Ticho
 *    po odklepnutí tvrdí, že práca neexistovala.
 * 3. Karta patrí tomu, kto je prihlásený. Jerry vidí svoje, Terezka svoje;
 *    peniaze sú Jerryho, tak ako mesačné kontroly.
 */

const kc = (n: number) => `${Math.round(n).toLocaleString("sk-SK")} Kč`;
const den = (s: string) => (s ? `${Number(s.slice(8))}. ${Number(s.slice(5, 7))}.` : "");

export function Workspace({ clients, mena, ktoSom, data, kalUdalosti, btcSats, btc, onOverride, otvorKlienta, onOtvoreny, fakturaPredvolba, onFakturaPredvolbaSpracovana, vypisPredvolba, onVypisPredvolbaSpracovana }: {
  clients: Record<string, ClientAgg>;
  mena: string[];
  ktoSom: string | null;
  data: PSBData;
  kalUdalosti?: { zaciatok: string; klient: string | null; typ: string | null }[];
  btcSats?: Record<string, number>;
  /** Bitcoinová kniha a kurz — profil klienta z nej sádže záložku ₿. */
  btc?: { platby: { klient: string | null; datum: string; sats?: number; czk: number | null }[]; kurz: number | null; kedy: string | null };
  /** Ručné opravy klienta idú cestou appky, nie vlastným fetchom — viď KlientStol. */
  onOverride?: (meno: string, kluc: string, hodnota: unknown) => Promise<boolean>;
  /** Faktúra vypýtaná mimo Workspace (Prechod → balíčky). */
  fakturaPredvolba?: FakturaPredvolba | null;
  /** Komu sa ide písať — otvorí jeho stôl a na ňom rovno výpis tréningov. */
  vypisPredvolba?: string | null;
  onVypisPredvolbaSpracovana?: () => void;
  onFakturaPredvolbaSpracovana?: () => void;
  /** Koho otvoriť rovno po prepnutí sem (klik na klienta inde v appke). */
  otvorKlienta?: string | null;
  onOtvoreny?: () => void;
}) {
  const [balicky, setBalicky] = useState<BalicekRiadok[]>([]);
  const [vlastnePlatby, setVlastnePlatby] = useState<PlatbaRiadok[]>([]);
  const [zdroje, setZdroje] = useState<{ zmeny: Zmena[]; nezname: { nazov: string; trener: string; pocet: number; najblizsi: string }[]; platby: { fioId: string; datum: string; suma: number; text: string; kandidati: string[] }[] } | null>(null);
  const [hotove, setHotove] = useState<Set<string>>(new Set());
  const [texty, setTexty] = useState<Record<string, string>>({});
  const [i, setI] = useState(0);
  // Otvorený klient prežije prepnutie karty, nie odchod zo záložky — viď
  // `menoZvonku` v KlientStol.
  const [klientNaStole, setKlientNaStole] = useState("");
  /** Pohyb, ktorý sa práve delí medzi viacerých klientov, a jeho diely. */
  const [delim, setDelim] = useState("");
  const [diely, setDiely] = useState<{ klient: string; suma: string }[]>([]);
  const [pracujem, setPracujem] = useState("");
  /**
   * Čie veci sa ukazujú. "auto" = podľa prihlásenia; keď sa prihlásenie nedá
   * preložiť na trénera (zdieľané heslo, identita „app"), kopa doteraz TICHO
   * ukázala všetko — a Jerry z nej videl aj Terezkine udalosti bez toho, aby
   * mal ako zistiť prečo. Teraz je to napísané a dá sa to prepnúť.
   */
  const [ktoreVeci, setKtoreVeci] = useState<"auto" | "Jerry" | "Terezka" | "vsetko">("auto");
  const [chyba, setChyba] = useState("");
  /**
   * Rozpracovaná faktúra. Príde buď z karty klienta (ponuka po nahodení
   * balíčka), alebo zvonka z Prechodu — v oboch prípadoch treba prepnúť na
   * kartu Faktúry, inak by človek klikol a nič by sa nestalo.
   */
  const [predvolbaFaktury, setPredvolbaFaktury] = useState<FakturaPredvolba | null>(null);
  /** Kto ktorého klienta vedie — kvôli podpisu v maili s faktúrou. */
  const treneriKlientov = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [meno, k] of Object.entries(clients)) if (k.primaryTrainer) m[meno] = k.primaryTrainer;
    return m;
  }, [clients]);

  const nacitaj = useCallback(async () => {
    const [k, p, b, vp] = await Promise.all([
      fetch("/api/kalendar", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
      fetch("/api/platby", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
      // Vlastná evidencia balíčkov aj platieb — bez nej by karta „Bez balíčka"
      // svietila na klienta aj potom, čo mu Jerry balíček nahodil.
      fetch("/api/balicky", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
      fetch("/api/platby?klient=1", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
    ]);
    setZdroje({ zmeny: (k?.zmeny || []) as Zmena[], nezname: k?.nezname || [], platby: p?.nepriradene || [] });
    setBalicky(b?.balicky || []);
    setVlastnePlatby(vp?.platby || []);
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  /** Aktívni bez hodín — pýta sa exportu aj vlastnej evidencie naraz. */
  const bezBalicka = useMemo<BezBalicka[]>(
    () => {
    const evidencia = balicky.map((b) => ({
      id: "", klient: b.klient, nazov: b.nazov, hodiny: b.hodiny,
      platnostOd: (b.platnost_od || "").slice(0, 10), platnostDo: (b.platnost_do || "")?.slice(0, 10) || null,
      cenaCzk: b.cena_czk, zdroj: b.zdroj, zruseneAt: b.zrusene_at,
    }));
    /** Zdroj osi času — ten istý, aký používa profil klienta. */
    const ZDROJ_OSI = {
      sessions: data.sessions as never,
      payments: data.payments as never,
      packages: (data.packages || []) as never,
      services: (data.services || []) as never,
      poplatky: (data.poplatky || []) as never,
      treningyZdarma: (data.treningyZdarma || []) as never,
      balicky: evidencia as never,
      kalUdalosti: (kalUdalosti || []) as never,
    };
    return bezAktivnehoBalicka(
      Object.values(clients),
      evidencia,
      treningyZObochZdrojov(data.sessions, kalUdalosti || []),
      undefined,
      // Mínus berie tá istá funkcia, ktorá kreslí čísla na osi v profile.
      (meno) => vMinuseKlienta(meno, ZDROJ_OSI, clients[meno]?.packageTotal > 0 ? clients[meno].packageRemaining : null),
    );
    },
    [clients, balicky, kalUdalosti, data],
  );

  /** Kto dlží — otvorené poplatky z PTmindera aj nezaplatené balíčky z Kokpitu. */
  const dlzniciRiadky = useMemo<Dlznik[]>(() => {
    const podlaKlienta = <T extends { klient: string }>(xs: T[]) => {
      const m: Record<string, T[]> = {};
      for (const x of xs) (m[x.klient] ||= []).push(x);
      return m;
    };
    const treneri: Record<string, string> = {};
    for (const [meno, c] of Object.entries(clients)) if (c.primaryTrainer) treneri[meno] = c.primaryTrainer;
    return spocitajDlznikov(
      (data.poplatky || []).map((p) => ({ datum: p.datum, klient: p.klient, popis: p.popis, suma: p.suma })),
      Object.fromEntries(Object.entries(podlaKlienta(balicky)).map(([m, bs]) => [m, bs.map((b) => ({
        cena: b.cena_czk, platnostOd: (b.platnost_od || "").slice(0, 10), zdroj: b.zdroj, zruseneAt: b.zrusene_at, nazov: b.nazov,
      }))])),
      Object.fromEntries(Object.entries(podlaKlienta(vlastnePlatby)).map(([m, ps]) => [m, ps.map((p) => ({
        suma: p.suma_czk, datum: (p.datum || "").slice(0, 10), zruseneAt: p.zrusene_at,
      }))])),
      treneri,
    );
  }, [data.poplatky, balicky, vlastnePlatby, clients]);

  /** Komu končí platnosť a zostávajú hodiny — to isté, čo hlási notifikácia. */
  const platnost = useMemo(() => zostavaPoPlatnosti(Object.values(clients)), [clients]);

  const karty = useMemo(() => {
    if (!zdroje) return [];
    return postavKarty({
      ...zdroje,
      bezBalicka,
      dlznici: dlzniciRiadky,
      platnost,
      ktoSom,
      trener: ktoreVeci === "auto" ? undefined : ktoreVeci === "vsetko" ? null : ktoreVeci,
      navrhMena: (nazov) => {
        const v = navrhniKlientaKandidati(nazov, clients);
        return v.typ === "uvodny" ? (v.kandidati[0] || v.meno) : (v.kandidati.length === 1 ? v.kandidati[0] : "");
      },
    });
  }, [zdroje, clients, ktoSom, ktoreVeci, bezBalicka, dlzniciRiadky, platnost]);

  // Karta, v ktorej už nič nezostalo, z kopy zmizne — ale až po tom, čo sa
  // v nej naozaj odklikalo; inak by zmizla pod rukami uprostred práce.
  const zive = useMemo(
    // Karta klienta nie je fronta — nemá položky a nikdy nezmizne. Ostatné
    // zmiznú, keď sa v nich všetko odklikalo.
    () => karty.filter((k) => BEZ_FRONTY.includes(k.druh)
      || (k.polozky as (Zmena | NeznamyNazov | NepriradenaPlatba | BezBalicka | Dlznik | ZostavaPoPlatnosti)[]).some((p) => !hotove.has(klucPolozky(k.druh, p)))),
    [karty, hotove],
  );
  const k = zive[Math.min(i, Math.max(0, zive.length - 1))];

  // Klik na klienta inde v appke otvorí kartu Klient — inak by človek pristál
  // na kope a musel sa k stolu preklikať sám (24. 9. 2026).
  useEffect(() => {
    if (!otvorKlienta && !vypisPredvolba) return;
    const idx = zive.findIndex((x) => x.druh === "klient");
    if (idx >= 0) setI(idx);
  }, [otvorKlienta, vypisPredvolba, zive]);

  /** Faktúra vypýtaná odinakiaľ (Prechod → balíčky) otvorí kartu Faktúry. */
  useEffect(() => {
    if (!fakturaPredvolba) return;
    setPredvolbaFaktury(fakturaPredvolba);
    onFakturaPredvolbaSpracovana?.();
  }, [fakturaPredvolba, onFakturaPredvolbaSpracovana]);

  useEffect(() => {
    if (!predvolbaFaktury) return;
    const idx = zive.findIndex((x) => x.druh === "faktury");
    if (idx >= 0) setI(idx);
  }, [predvolbaFaktury, zive]);

  /**
   * PREPNUTIE KARTY SA MUSÍ DAŤ VIDIEŤ.
   *
   * Jerry, 23. 9. 2026: „nech vidím, že sa tie karty presúvajú, že to nie je
   * len, že sa prepne obrazovka." Okamžitá výmena obsahu nepovie, ktorým
   * smerom sa človek pohol ani odkiaľ nová karta prišla — z kopy sa stane
   * len striedanie textov.
   *
   * Karta sa preto najprv odsunie a stratí, obsah sa vymení, keď ju nevidno,
   * a nová priletí z opačnej strany. Je to JEDNA karta, nie dve: klientský
   * stôl si vnútri drží stav aj sťahuje dáta a dve kópie naraz by znamenali
   * dve sťahovania a preblikávanie.
   */
  const [prechod, setPrechod] = useState<{ smer: 1 | -1; faza: "von" | "dnu" } | null>(null);
  const bezi = useRef(false);
  const menejPohybu = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const prepni = useCallback((smer: 1 | -1, ciel?: number) => {
    if (zive.length < 2 || bezi.current) return;
    const dalsi = (x: number) => (ciel ?? (x + smer + zive.length)) % zive.length;
    if (menejPohybu) { setI(dalsi); return; }
    bezi.current = true;
    setPrechod({ smer, faza: "von" });
    setTimeout(() => {
      setI(dalsi);
      // „dnu" posadí kartu na druhú stranu BEZ prechodu; až ďalší snímok ju
      // pustí späť na nulu, a to už s prechodom. Bez tých dvoch rámcov by
      // prehliadač obe zmeny zlial do jednej a karta by nikam nešla.
      setPrechod({ smer, faza: "dnu" });
      /**
       * `requestAnimationFrame` v NEAKTÍVNEJ ZÁLOŽKE NEBEŽÍ.
       *
       * Zámok `bezi` sa púšťal len v ňom, takže keď človek prepol kartu
       * a hneď odišiel do iného okna, rAF sa nikdy nevykonal, zámok zostal
       * zatvorený a kopa sa po návrate už nedala prepnúť — ani tlačidlami,
       * ani gestom. Vyzeralo to, akoby obrazovka zamrzla; nič nespadlo
       * a v konzole nebolo nič (28. 9. 2026).
       *
       * Poistka je obyčajný časovač. Pustiť zámok dvakrát nevadí.
       */
      const uvolni = () => {
        setPrechod(null);
        bezi.current = false;
      };
      requestAnimationFrame(() => requestAnimationFrame(uvolni));
      setTimeout(uvolni, 400);
    }, 150);
  }, [zive.length, menejPohybu]);

  /**
   * Prepínanie dvoma prstami po trackpade. Rozhodovanie je v `gestoKariet.ts`,
   * aby sa dalo odskúšať — vrátane chyby, pre ktorú to Jerrymu fungovalo len
   * raz a potom siahol po tlačidle.
   */
  const kopa = useRef<HTMLDivElement | null>(null);
  const gesto = useRef(novyStavGesta());
  const svih = useRef(novyStavSvihu());
  const uzke = useUzke();
  const poistka = useRef(0 as unknown as ReturnType<typeof setTimeout>);
  useEffect(() => {
    const el = kopa.current;
    if (!el || zive.length < 2) return;
    const naKoleso = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      // Bez toho Safari zo šmyknutia urobí „krok späť v histórii" a appka
      // sa zavrie. Preto `passive: false` nižšie.
      e.preventDefault();
      // Poistka LEN otvára, nikdy nezatvára — preto ju smie odkladať každá
      // udalosť bez rizika, že zámok zostane visieť. Presne na to doplatila
      // prvá verzia, kde odkladanie zámok DRŽALO.
      clearTimeout(poistka.current);
      poistka.current = setTimeout(() => { gesto.current.cakaNaPokoj = false; gesto.current.suma = 0; }, 300);
      const smer = krokGesta(gesto.current, { deltaX: e.deltaX, deltaY: e.deltaY, cas: e.timeStamp });
      if (smer) prepni(smer);
    };
    el.addEventListener("wheel", naKoleso, { passive: false });

    /**
     * ŤAH PRSTOM. Telefón `wheel` neposiela vôbec, takže bez tohto sa kopa
     * na mobile dala prepnúť len šípkami — a tie majú 38 px pri okraji.
     *
     * Počúva sa `pointer*`, nie `touch*`: to isté obslúži prst, pero aj myš.
     * `pan-y` v štýle nechá zvislé rolovanie prehliadaču a vodorovné nám,
     * takže čítanie zoznamu prstom kartu neprepína.
     */
    /**
     * ŤAH PRSTOM. Telefón `wheel` neposiela vôbec, takže bez tohto sa kopa
     * na mobile dala prepnúť len šípkami pri okraji.
     *
     * Rozhoduje sa POČAS ťahu (`*move`), nie až pri zdvihnutí prsta —
     * pomalý ťah človeka, ktorý skúša, či to vôbec reaguje, sa inak
     * nepočítal. Koniec ťahu je len poistka pre prípad, že by `move`
     * neprišiel.
     *
     * Počúva sa `pointer*` AJ `touch*`. Nemám ako zistiť, či Safari v PWA
     * doručí jedno alebo druhé, a dve cesty k tomu istému stavu sú lacnejšie
     * než ďalšie kolo hádania: prvá, ktorá dobehne, ťah uzavrie, druhá
     * dostane `aktivny: false` a nespraví nič.
     */
    const zrus = () => { svih.current.aktivny = false; };
    const sirka = () => window.innerWidth || 375;
    const krok = (x: number, y: number) => {
      const smer = krokSvihu(svih.current, x, y, sirka());
      if (smer) prepni(smer);
    };

    const zacP = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      zacniSvih(svih.current, e.clientX, e.clientY, e.timeStamp);
    };
    const pohybP = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      krok(e.clientX, e.clientY);
    };
    el.addEventListener("pointerdown", zacP);
    el.addEventListener("pointermove", pohybP);
    el.addEventListener("pointerup", pohybP);
    el.addEventListener("pointercancel", zrus);

    const zacD = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) zacniSvih(svih.current, t.clientX, t.clientY, e.timeStamp);
    };
    const pohybD = (e: TouchEvent) => {
      const t = e.touches[0] || e.changedTouches[0];
      if (t) krok(t.clientX, t.clientY);
    };
    el.addEventListener("touchstart", zacD, { passive: true });
    el.addEventListener("touchmove", pohybD, { passive: true });
    el.addEventListener("touchend", pohybD, { passive: true });
    el.addEventListener("touchcancel", zrus, { passive: true });

    return () => {
      el.removeEventListener("wheel", naKoleso);
      el.removeEventListener("pointerdown", zacP);
      el.removeEventListener("pointermove", pohybP);
      el.removeEventListener("pointerup", pohybP);
      el.removeEventListener("pointercancel", zrus);
      el.removeEventListener("touchstart", zacD);
      el.removeEventListener("touchmove", pohybD);
      el.removeEventListener("touchend", pohybD);
      el.removeEventListener("touchcancel", zrus);
      clearTimeout(poistka.current);
    };
  }, [zive.length, prepni]);

  const text = (kluc: string, predvolene = "") => texty[kluc] ?? predvolene;
  const nastavText = (kluc: string, v: string) => setTexty((s) => ({ ...s, [kluc]: v }));

  const posli = async (url: string, telo: Record<string, unknown>) => {
    const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(telo) });
    return (await r.json()) as { ok: boolean; error?: string };
  };

  /**
   * „Toto nie je tréning" — dva zápisy v jednom kliku.
   *
   * Najprv sa názov zapíše ako súkromný (aby sa appka na neho nepýtala
   * nabudúce), až potom sa uzavrie táto konkrétna otázka. V tomto poradí
   * preto, že keby druhý krok zlyhal, zostane aspoň naučené pravidlo —
   * opačne by sa otázka zavrela a názov by sa pýtal ďalej.
   */
  const sukromne = async (kluc: string, z: Zmena) => {
    setPracujem(kluc); setChyba("");
    const a = await posli("/api/kalendar", { akcia: "mapuj", nazov: z.nazov, trener: z.trener, typ: "sukromne", klient: null })
      .catch(() => ({ ok: false, error: "spojenie" }));
    if (!a.ok) { setPracujem(""); setChyba(a.error || "nepodarilo sa uložiť"); return; }
    setPracujem("");
    await vybav(kluc, "/api/kalendar", { akcia: "vysvetli", id: z.id, poznamka: "súkromná udalosť — nie je to tréning" });
  };

  /**
   * Odklepnutie bez zápisu do databázy.
   *
   * Karty „Bez balíčka" a „Dlhujú peniaze" nie sú fronta úkonov v appke —
   * vybavuje sa telefonátom. Riadok sa preto len schová do konca sedenia
   * a pri ďalšom otvorení Workspace sa vráti, kým sa nezmenia dáta. Zápis
   * „vybavené" do databázy by tvrdil, že klient balíček má alebo zaplatil,
   * a to appka nevie.
   */
  const oznacHotove = (kluc: string) => setHotove((s) => new Set([...s, kluc]));

  /** Otvorí kartu Klient s týmto človekom na stole. */
  const naStol = (meno: string) => {
    setKlientNaStole(meno);
    const idx = zive.findIndex((x) => x.druh === "klient");
    if (idx >= 0) setI(idx);
  };

  const vybav = async (kluc: string, url: string, telo: Record<string, unknown>) => {
    setPracujem(kluc); setChyba("");
    const j = await posli(url, telo).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem("");
    if (!j.ok) { setChyba(j.error || "nepodarilo sa uložiť"); return; }
    setHotove((s) => new Set([...s, kluc]));
    // Register na Dnes drží vlastnú kópiu kalendára — bez oznámenia by
    // vybavená zmena svietila ďalej (kontrola 24. 9. 2026).
    oznam(url.includes("platby") ? "peniaze" : "kalendar");
  };

  /**
   * DÁVKOVÉ POTVRDENIE.
   *
   * Jerry, 28. 9. 2026: „vidím, že si tam môžem najprv povyplňať kto je kto,
   * ale chýba tam potom také spoločné potvrdenie." Appka návrh urobí sama a
   * po jednom to bola práca na večer — jeden klik zapíše všetko, čo je
   * vyplnené a čo sedí na existujúceho klienta.
   */
  const davkaPlatieb = (polozky: NepriradenaPlatba[]) =>
    polozky
      .map((p) => ({ kluc: klucPolozky("platby", p), p }))
      .filter(({ kluc, p }) => !hotove.has(kluc) && mena.includes(text(kluc, p.navrh).trim()))
      .map(({ kluc, p }) => ({ kluc, fioId: p.fioId, klient: text(kluc, p.navrh).trim() }));

  const potvrdDavku = async (polozky: NepriradenaPlatba[]) => {
    const davka = davkaPlatieb(polozky);
    if (!davka.length) return;
    setPracujem("davka-platby"); setChyba("");
    const j = await posli("/api/platby", { akcia: "priradz-davka", polozky: davka.map(({ fioId, klient }) => ({ fioId, klient })) })
      .catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem("");
    if (!j.ok) { setChyba(j.error || "nepodarilo sa uložiť"); return; }
    setHotove((s) => new Set([...s, ...davka.map((x) => x.kluc)]));
    oznam("peniaze");
  };

  if (!zdroje) return null;

  const vybavenych = hotove.size;
  /** Koho vybralo prihlásenie; null = appka nevie, kto sedí pri appke. */
  const automat = trenerZPrihlasenia(ktoSom);
  const spolu = karty.reduce((a, x) => a + x.polozky.length, 0);

  if (!zive.length) {
    return (
      <Card>
        <div style={{ padding: "28px 4px", textAlign: "center" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.green }}>Hotovo.</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 7, lineHeight: 1.6 }}>
            {vybavenych > 0
              ? `Vybavil si ${vybavenych} ${vybavenych === 1 ? "vec" : vybavenych < 5 ? "veci" : "vecí"}. Administratívu máš za sebou.`
              : trenerZPrihlasenia(ktoSom) === "Terezka"
                ? "Nič nečaká. Peniaze a uzávierku má na starosti Jerry."
                : "Nič nečaká. Administratívu máš za sebou."}
          </div>
        </div>
      </Card>
    );
  }

  const zostava = (x: Karta) => (x.polozky as (Zmena | NeznamyNazov | NepriradenaPlatba)[]).filter((p) => !hotove.has(klucPolozky(x.druh, p))).length;
  // Presvitajúce karty idú tiež dokola — na poslednej je za ňou prvá.
  const dalsie = zive.length > 1
    ? [1, 2].slice(0, Math.min(2, zive.length - 1)).map((o) => zive[(i + o) % zive.length])
    : [];

  return (
    // Celá šírka obrazovky, nie 1200 px ako zvyšok appky. Karta je pracovná
    // plocha — čím širšia, tým viac riadkov sa vybaví bez rolovania, a vpravo
    // zostane miesto na to, čo príde. Vylomenie z `maxWidth` rodiča je bežný
    // trik: 100vw a posun o polovicu rozdielu doľava.
    <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)", padding: "0 20px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11.5, color: C.textMuted, fontWeight: 700, whiteSpace: "nowrap" }}>
          Karta {Math.min(i + 1, zive.length)} z {zive.length}
        </div>
        <div style={{ flexGrow: 1, minWidth: 120, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${spolu ? (vybavenych / spolu) * 100 : 0}%`, height: "100%", background: C.accent, transition: "width .25s" }} />
        </div>
        <div style={{ fontSize: 12, color: C.textDim, whiteSpace: "nowrap" }}>
          {vybavenych > 0 ? `${vybavenych} vybavených` : `${spolu} vecí celkom`}
        </div>
        {/* Čie veci — vždy vidieť, aj keď to appka vybrala sama. Doteraz to
            bola len veta na konci riadku a pri identite „app" nebola žiadna. */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {([["auto", automat ? (automat === "Jerry" ? "Jerryho" : "Terezkine") : "všetko"], ["Jerry", "Jerryho"], ["Terezka", "Terezkine"], ["vsetko", "všetko"]] as const)
            .filter(([id]) => id !== "auto" || !!automat)
            .filter(([id]) => !(automat && id === automat))
            .map(([id, l]) => (
              <button key={id} onClick={() => setKtoreVeci(id)} style={{
                padding: "4px 10px", borderRadius: 14, fontSize: 11.5, cursor: "pointer",
                border: `1px solid ${ktoreVeci === id ? C.accent : C.border}`,
                background: ktoreVeci === id ? C.accentBg : "transparent",
                color: ktoreVeci === id ? C.accentLight : C.textMuted,
              }}>{l}</button>
            ))}
        </div>
        {!automat && ktoreVeci === "auto" && (
          <div style={{ fontSize: 11, color: C.orange, whiteSpace: "nowrap" }}>
            Appka nevie, kto si — ukazuje všetko. Prihlás sa menom, nie spoločným heslom.
          </div>
        )}
      </div>

      {/* KOPA: aktívna karta je cez celú šírku, ostatné ležia pod ňou a
          vykúkajú vpravo len okrajom.
          Predtým stáli vedľa seba v mriežke a Jerry na to povedal jasne:
          „ale ja chcem široké cez celú." Vedľa seba sa nedá mať oboje —
          buď je karta široká, alebo je vedľa nej miesto. Takto je: široká
          je, a to, že za ňou niečo je, hovorí okraj, nie stĺpec. */}
      {/* PEVNÁ výška, nie minimálna. Minimálna výšku len nadstavuje — karta
          s dlhým zoznamom aj tak narástla a šípky skákali. Fixná výška
          + `minHeight: 0` na rolovacom vnútri je jediná dvojica, ktorá vo
          flexe naozaj drží: bez tej nuly sa dieťa odmietne zmenšiť pod svoj
          obsah a `overflow` sa nikdy nezapne. */}
      <div ref={kopa} style={{ position: "relative", height: "min(72vh, 660px)", touchAction: "pan-y" }}>
        {dalsie.map((d, j) => (
          <div
            key={d.druh}
            aria-hidden="true"
            style={{
              position: "absolute",
              top: (j + 1) * 9,
              left: (j + 1) * 9,
              right: -((j + 1) * 11),
              bottom: -((j + 1) * 9),
              borderRadius: 14,
              background: mix(C.border, 90),
              border: `1px solid ${mix(C.border, 150)}`,
              // Plátky vzadu sa pri prepnutí posunú tiež — inak by karta
              // odletela sama a kopa by stála, čo vyzerá ako chyba.
              opacity: prechod?.faza === "von" ? (j === 0 ? 0.85 : 0.5) : j === 0 ? 0.6 : 0.3,
              transform: prechod?.faza === "von" ? `translateX(${-prechod.smer * 7}px)` : "none",
              transition: "transform .15s ease-in, opacity .15s ease-in",
              zIndex: 0,
            }}
          />
        ))}
        {/* Šípky sedia na BOKOCH karty, nie pod ňou.
            Jerry, 23. 9. 2026: „prepínanie medzi kartami by malo byť po
            stranách kariet, pretože keď chcem prepnúť, musím ďaleko
            zoskrolovať." Karta má vnútri zoznam na pol obrazovky, takže
            tlačidlo pod ňou je zakaždým na inom mieste a často mimo
            dohľadu. Bok je vždy tam, kde bol. */}
        {/* Kolotoč: z poslednej karty sa ide na prvú a naopak (Jerry, 23. 9.
            2026). Šípka na konci, ktorá sa nedá stlačiť, je slepá ulička —
            človek musí prejsť celú kopu späť, aby sa dostal o jednu ďalej. */}
        {/* ŠÍPKY ZOSTÁVAJÚ AJ NA TELEFÓNE.
            28. 9. 2026 som ich na úzkej obrazovke skryl s tým, že ich nahradí
            ťah prsta — a Jerry zostal bez oboch: „teraz mi to nejde už vôbec,
            pretože tam nie sú ani tie gombíky po strane." Náhrada sa smie
            zapnúť až vtedy, keď je overené, že naozaj funguje; dovtedy platí
            to, čo fungovalo. Na telefóne sú len užšie. */}
        <button onClick={() => prepni(-1)} aria-label="Predchádzajúca karta" style={bocnaSipka("left", zive.length > 1, uzke)}>‹</button>
        <button onClick={() => prepni(1)} aria-label="Ďalšia karta" style={bocnaSipka("right", zive.length > 1, uzke)}>›</button>
        {/* Karta má PEVNÚ výšku. Jerry, 23. 9. 2026: „karty musia byť stále
            rovnako veľké, aj keď je tam menej textu, aby miesto na pravej
            a ľavej strane, kde prepínam, bolo stále na tom istom mieste."
            Šípka, ktorá pri každej karte skočí inam, sa hľadá očami — a to je
            presne tá práca navyše, ktorú mala kopa odstrániť. */}
        <div style={{ position: "relative", zIndex: 1, margin: uzke ? "0 30px" : "0 46px", height: "100%", ...pohybKarty(prechod) }}>
          <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{k.nadpis}</div>
              {!BEZ_FRONTY.includes(k.druh) && <div style={{ fontSize: 11.5, color: C.textMuted }}>{zostava(k)} zostáva</div>}
            </div>
            <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 3 }}>{k.podnadpis}</div>

            <div style={{ marginTop: 14, flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {/* Zoznamy rolujú vnútri; karta klienta si výšku riadi sama. */}
              <div style={{ flexGrow: 1, minHeight: 0, overflowY: k.druh === "klient" ? "visible" : "auto", display: k.druh === "klient" ? "flex" : "block", flexDirection: "column" }}>
              {k.druh === "faktury" && (
                <VydaneFaktury
                  mena={mena}
                  treneri={treneriKlientov}
                  predvolba={predvolbaFaktury}
                  onPredvolbaSpracovana={() => setPredvolbaFaktury(null)}
                />
              )}
              {k.druh === "zmeny" && k.polozky.map((z) => {
                const kluc = klucPolozky("zmeny", z);
                if (hotove.has(kluc)) return null;
                const t = text(kluc);
                return (
                  <div key={kluc} style={riadok}>
                    <div style={{ minWidth: 150, flex: "1 1 190px" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{z.klient || z.nazov || "(bez mena)"}</div>
                      <div style={{ fontSize: 11, color: C.textDim }}>{popisZmeny(z)} · {z.trener}</div>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {["klient zrušil", "presunuli sme", "chyba v zápise"].map((d) => (
                        <button key={d} onClick={() => nastavText(kluc, d)} style={stitok(t === d)}>{d}</button>
                      ))}
                    </div>
                    <input value={t} onChange={(e) => nastavText(kluc, e.target.value)} placeholder="alebo vlastnými slovami…" style={vstup(false)} />
                    {/* „Vybavené" sa dá stlačiť VŽDY, aj bez dôvodu.
                        Jerry, 23. 9. 2026: „nabehnem myšou na Vybavené a
                        ukáže sa prečiarknutý kruh." Ukazoval sa preto, že
                        som tu vymyslel prísnejšie pravidlo než má samotná
                        appka — v Kalendári to isté tlačidlo funguje aj
                        s prázdnou poznámkou. Dve obrazovky, jedna akcia,
                        dve rôzne pravidlá: to bola tá chyba.
                        Dôvod je na tom cenný, nie povinný — a štítky vyššie
                        ho spravia jedným klikom. */}
                    <button
                      onClick={() => void vybav(kluc, "/api/kalendar", { akcia: "vysvetli", id: z.id, poznamka: t.trim() })}
                      disabled={pracujem === kluc}
                      title={t.trim() ? "Uzavrieť s týmto dôvodom" : "Uzavrieť bez dôvodu — dôvod sa hodí, ale povinný nie je"}
                      // Zelené až s dôvodom: kliknúť sa dá vždy, ale je vidieť,
                      // ktorá z dvoch ciest je tá lepšia.
                      style={t.trim() ? hlavne(true) : { ...hlavne(true), border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
                    >
                      {pracujem === kluc ? "…" : "Vybavené"}
                    </button>
                    {/* „Súkromné" VEDĽA „Vybavené" (Jerry, 23. 9. 2026).
                        Nie je to dôvod zmeny, je to odpoveď „toto sem vôbec
                        nepatrí" — a robí dve veci naraz: uzavrie túto otázku
                        a zapíše názov ako súkromný, takže sa appka na ten
                        názov už nikdy nespýta. Bez druhého kroku by sa tá
                        istá udalosť vrátila pri najbližšej zmene. */}
                    <button
                      onClick={() => void sukromne(kluc, z)}
                      disabled={pracujem === kluc}
                      title="Nie je to tréning — uzavrieť a už sa na tento názov nepýtať"
                      style={vedlajsie}
                    >
                      Súkromné
                    </button>
                  </div>
                );
              })}

              {k.druh === "mena" && k.polozky.map((n) => {
                const kluc = klucPolozky("mena", n);
                if (hotove.has(kluc)) return null;
                const t = text(kluc, n.navrh);
                return (
                  <div key={kluc} style={riadok}>
                    <div style={{ minWidth: 130, flex: "1 1 160px" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{n.nazov}</div>
                      <div style={{ fontSize: 11, color: C.textDim }}>{n.trener} · {n.pocet}× · {den(n.najblizsi)}</div>
                    </div>
                    <input list="ws-klienti" value={t} onChange={(e) => nastavText(kluc, e.target.value)} placeholder="kto to je…" style={vstup(!!t && !mena.includes(t))} />
                    <button
                      onClick={() => void vybav(kluc, "/api/kalendar", { akcia: "mapuj", nazov: n.nazov, trener: n.trener, typ: "trening", klient: t.trim() })}
                      disabled={pracujem === kluc || t.trim().length < 3}
                      title={t.trim().length >= 3 ? `Priradiť ${n.nazov} klientovi ${t.trim()}` : "Najprv napíš, kto to je — bez mena nie je čo priradiť"}
                      style={hlavne(t.trim().length >= 3)}
                    >
                      {pracujem === kluc ? "…" : "Je to on"}
                    </button>
                    {/* „Súkromné" chýbalo (Jerry, 23. 9. 2026) — v Kalendári
                        je v ponuke typov, v kope nie, takže sa tu plávanie
                        alebo strihanie dalo odložiť len ako „iné". Sú to dva
                        rôzne dôvody, prečo udalosť nie je tréning, a človek
                        si pamätá, ktorý zapísal. */}
                    <button onClick={() => void vybav(kluc, "/api/kalendar", { akcia: "mapuj", nazov: n.nazov, trener: n.trener, typ: "sukromne", klient: null })} style={vedlajsie}>
                      Súkromné
                    </button>
                    <button onClick={() => void vybav(kluc, "/api/kalendar", { akcia: "mapuj", nazov: n.nazov, trener: n.trener, typ: "netrening", klient: null })} style={vedlajsie}>
                      Iné (nie tréning)
                    </button>
                  </div>
                );
              })}

              {k.druh === "klient" && <KlientStol clients={clients} mena={mena} data={data} kalUdalosti={kalUdalosti} btcSats={btcSats} btc={btc} onOverride={onOverride} otvorKlienta={vypisPredvolba || otvorKlienta} onOtvoreny={onOtvoreny} onFaktura={setPredvolbaFaktury} otvorVypis={vypisPredvolba} onVypisOtvoreny={onVypisPredvolbaSpracovana} menoZvonku={klientNaStole} setMenoZvonku={setKlientNaStole} />}

              {k.druh === "platby" && (() => {
                const pripravene = davkaPlatieb(k.polozky);
                return (
                  <>
                    {pripravene.length > 1 && (
                      <div style={{ ...riadok, background: mix(C.accent, 8), borderRadius: 8, marginBottom: 6 }}>
                        <div style={{ flex: 1, fontSize: 12, color: C.textMuted }}>
                          {pripravene.length} platieb má vyplneného klienta — dajú sa zapísať naraz.
                        </div>
                        <button onClick={() => void potvrdDavku(k.polozky)} disabled={pracujem === "davka-platby"} style={hlavne(true)}>
                          {pracujem === "davka-platby" ? "…" : `Priradiť všetkých ${pripravene.length}`}
                        </button>
                      </div>
                    )}
                    {k.polozky.map((p) => {
                      const kluc = klucPolozky("platby", p);
                      if (hotove.has(kluc)) return null;
                      const t = text(kluc, p.navrh);
                      const delenie = delim === p.fioId;
                      const spolu = diely.reduce((n, d) => n + (Number(d.suma) || 0), 0);
                      return (
                        <div key={kluc} style={{ ...riadok, flexWrap: "wrap" }}>
                          <div style={{ minWidth: 50, fontSize: 11.5, color: C.textDim }}>{den(p.datum)}</div>
                          <div style={{ minWidth: 80, fontSize: 13, fontWeight: 700, textAlign: "right" }}>{kc(p.suma)}</div>
                          <div style={{ flex: "1 1 200px", minWidth: 150, fontSize: 11, color: C.textMuted }}>{p.text.slice(0, 96)}</div>
                          {!delenie && (
                            <>
                              <input list="ws-klienti" value={t} onChange={(e) => nastavText(kluc, e.target.value)} placeholder="komu patrí…" style={vstup(!!t && !mena.includes(t))} />
                              <button onClick={() => void vybav(kluc, "/api/platby", { akcia: "priradz", fioId: p.fioId, klient: t.trim(), zapamataj: true })} disabled={pracujem === kluc || t.trim().length < 3} style={hlavne(t.trim().length >= 3)}>
                                {pracujem === kluc ? "…" : "Priradiť"}
                              </button>
                              {/* Jeden prevod, dvaja klienti — Jerry, 28. 9. 2026: „15 580
                                  DK Consulting je Dan Kouřil spoločne s Monikou." */}
                              <button
                                onClick={() => { setDelim(p.fioId); setDiely([{ klient: t.trim(), suma: String(Math.round(p.suma / 2)) }, { klient: "", suma: String(Math.round(p.suma) - Math.round(p.suma / 2)) }]); }}
                                style={vedlajsie}
                              >
                                Rozdeliť
                              </button>
                              <button onClick={() => void vybav(kluc, "/api/platby", { akcia: "nieKlient", fioId: p.fioId })} style={vedlajsie}>Nie je klient</button>
                            </>
                          )}
                          {delenie && (
                            <div style={{ flexBasis: "100%", marginTop: 6 }}>
                              {diely.map((d, i) => (
                                <div key={i} style={{ display: "flex", gap: 7, marginBottom: 5 }}>
                                  <input
                                    list="ws-klienti" value={d.klient} placeholder="komu patrí tento diel…"
                                    onChange={(e) => setDiely((s) => s.map((x, j) => (j === i ? { ...x, klient: e.target.value } : x)))}
                                    style={{ ...vstup(!!d.klient && !mena.includes(d.klient)), flex: "1 1 200px" }}
                                  />
                                  <input
                                    value={d.suma} inputMode="numeric"
                                    onChange={(e) => setDiely((s) => s.map((x, j) => (j === i ? { ...x, suma: e.target.value.replace(/[^\d]/g, "") } : x)))}
                                    style={{ ...vstup(false), width: 90, textAlign: "right" }}
                                  />
                                </div>
                              ))}
                              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ fontSize: 11.5, color: Math.abs(spolu - Math.round(p.suma)) > 1 ? C.orange : C.textDim }}>
                                  diely dávajú {kc(spolu)} z {kc(p.suma)}
                                </span>
                                <button onClick={() => setDiely((s) => [...s, { klient: "", suma: "0" }])} style={vedlajsie}>+ ďalší</button>
                                <button
                                  onClick={() => { setDelim(""); void vybav(kluc, "/api/platby", { akcia: "rozdel", fioId: p.fioId, diely: diely.map((d) => ({ klient: d.klient.trim(), suma: Number(d.suma) || 0 })) }); }}
                                  disabled={pracujem === kluc || diely.some((d) => !mena.includes(d.klient.trim())) || Math.abs(spolu - Math.round(p.suma)) > 1}
                                  style={hlavne(true)}
                                >
                                  {pracujem === kluc ? "…" : "Zapísať diely"}
                                </button>
                                <button onClick={() => { setDelim(""); setDiely([]); }} style={vedlajsie}>späť</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}

              {/* BEZ BALÍČKA — jeden riadok = jeden telefonát „kúp si ďalší".
                  Klik na meno otvorí jeho stôl, kde sa balíček nahadzuje. */}
              {k.druh === "bezBalicka" && k.polozky.map((x) => {
                const kluc = klucPolozky("bezBalicka", x);
                if (hotove.has(kluc)) return null;
                return (
                  <div key={kluc} style={{ ...riadok, flexWrap: "wrap" }}>
                    <button onClick={() => naStol(x.meno)} style={{ ...vedlajsie, fontSize: 13.5, fontWeight: 600, color: C.text, minWidth: uzke ? 0 : 150, flex: uzke ? "1 1 auto" : undefined, textAlign: "left" }}>
                      {x.meno}
                    </button>
                    {/* Mínus je hlavné číslo. Jerry, 28. 9. 2026: „mňa skôr
                        bude zaujímať, koľko sú už v mínuse." Objednaný termín
                        sa dá prehodiť, odtrénovaná hodina bez krytia nie.
                        Na telefóne ide hneď za meno, nech je v prvom riadku. */}
                    <div style={{ minWidth: uzke ? 0 : 118, textAlign: "right", fontSize: 11.5, color: C.textDim, order: uzke ? 1 : 2 }}>
                      {x.vMinuse > 0
                        ? <span style={{ fontSize: 13.5, fontWeight: 700, color: C.orange }}>−{x.vMinuse} h</span>
                        : <span>na nule</span>}
                      {x.objednanych ? <span style={{ marginLeft: 7 }}>obj. {x.objednanych}</span> : null}
                    </div>
                    <div style={{ flex: uzke ? "1 1 100%" : "1 1 200px", minWidth: uzke ? 0 : 160, fontSize: 11.5, color: C.textMuted, order: 3 }}>
                      {x.dovod}
                      {x.membership ? ` · ${nazovProduktu(x.membership)}` : ""}
                      {x.dovod === "platnosť skončila" && x.platnostDo ? ` ${den(x.platnostDo)}` : ""}
                      {uzke ? ` · ${x.dni >= 0 ? `pred ${x.dni} dňami` : "netrénoval"}` : ""}
                    </div>
                    {!uzke && (
                      <div style={{ fontSize: 11.5, color: C.textDim, minWidth: 96, textAlign: "right", order: 4 }}>
                        {x.dni >= 0 ? `pred ${x.dni} dňami` : "netrénoval"}
                      </div>
                    )}
                    <button onClick={() => oznacHotove(kluc)} style={{ ...vedlajsie, order: 5 }}>vybavené</button>
                  </div>
                );
              })}

              {/* PLATNOSŤ KONČÍ — tri tlačidlá, tri Jerryho možnosti.
                  „Prepadlo" len umlčí; ostatné dve hodiny naozaj zapíšu ako
                  doplnenie, takže ich odpočet ďalej vidí. Kľúč je ten istý,
                  aký nesie notifikácia, takže sa to nepýta dvakrát. */}
              {k.druh === "platnost" && k.polozky.map((x) => {
                const kluc = klucPolozky("platnost", x);
                if (hotove.has(kluc)) return null;
                /**
                 * Rozhodnutie sa musí ZAPÍSAŤ, nie len schovať.
                 *
                 * Kľúč `platnost|meno|deň` nesie aj notifikácia, a tá sa riadi
                 * zostatkom z PTmindera — ten sa dopísaním doplnenia nezmení.
                 * Bez `ack` by sa upozornenie zajtra vrátilo, hoci Jerry
                 * odpovedal. Preto ide odpoveď vždy do `anomaly_ack` a pri
                 * dvoch z troch možností sa k nej ešte zapíšu hodiny.
                 */
                const odpovedz = async (poznamka: string, hodin?: number, nazov?: string) => {
                  if (hodin != null && nazov) {
                    setPracujem(kluc); setChyba("");
                    const j = await posli("/api/balicky", {
                      akcia: "pridaj", klient: x.meno, nazov, hodiny: hodin,
                      platnostOd: x.platnostDo, cenaCzk: 0, poznamka,
                    }).catch(() => ({ ok: false, error: "spojenie" }));
                    setPracujem("");
                    if (!j.ok) { setChyba(j.error || "nepodarilo sa uložiť"); return; }
                  }
                  await vybav(kluc, "/api/anomaly", { key: kluc, ack: true, note: poznamka });
                };
                return (
                  <div key={kluc} style={{ ...riadok, flexWrap: "wrap" }}>
                    <button onClick={() => naStol(x.meno)} style={{ ...vedlajsie, fontSize: 13.5, fontWeight: 600, color: C.text, minWidth: uzke ? 0 : 150, flex: uzke ? "1 1 auto" : undefined, textAlign: "left" }}>
                      {x.meno}
                    </button>
                    <div style={{ minWidth: uzke ? 0 : 90, textAlign: "right", fontSize: 13.5, fontWeight: 700, color: C.orange }}>
                      {x.hodin} h
                    </div>
                    <div style={{ flex: uzke ? "1 1 100%" : "1 1 180px", minWidth: uzke ? 0 : 150, fontSize: 11.5, color: C.textMuted }}>
                      {x.dni < 0 ? `končí ${den(x.platnostDo)}` : `skončila ${den(x.platnostDo)}`}
                      {` · ${nazovProduktu(x.membership)}`}
                      {x.predplatne ? " · predplatné" : ""}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: uzke ? "1 1 100%" : undefined }}>
                      <button onClick={() => void odpovedz(`${x.hodin} h prepadlo — platnosť skončila ${x.platnostDo}`)} disabled={pracujem === kluc} style={vedlajsie}>prepadlo</button>
                      <button
                        onClick={() => void odpovedz(`nedočerpané hodiny z členstva do ${x.platnostDo}`, x.hodin, "Doplnenie členstva")}
                        disabled={pracujem === kluc}
                        style={hlavne(true)}
                      >
                        {pracujem === kluc ? "…" : `doplniť ${x.hodin} h`}
                      </button>
                      {x.predplatne && (
                        <button
                          onClick={() => void odpovedz(`presun z členstva do ${x.platnostDo} (max 2 h)`, x.presunHodin, "Prenesené hodiny")}
                          disabled={pracujem === kluc}
                          style={vedlajsie}
                        >
                          preniesť {x.presunHodin} h
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* DLHUJÚ PENIAZE — suma hore, za čo to je pod ňou. */}
              {k.druh === "dlznici" && k.polozky.map((x) => {
                const kluc = klucPolozky("dlznici", x);
                if (hotove.has(kluc)) return null;
                return (
                  <div key={kluc} style={{ ...riadok, flexWrap: "wrap" }}>
                    <button onClick={() => naStol(x.meno)} style={{ ...vedlajsie, fontSize: 13.5, fontWeight: 600, color: C.text, minWidth: uzke ? 0 : 150, flex: uzke ? "1 1 auto" : undefined, textAlign: "left" }}>
                      {x.meno}
                    </button>
                    <div style={{ minWidth: uzke ? 0 : 90, fontSize: 13, fontWeight: 700, textAlign: "right", color: C.red }}>{kc(x.spolu)}</div>
                    <div style={{ flex: uzke ? "1 1 100%" : "1 1 200px", minWidth: uzke ? 0 : 180, fontSize: 11, color: C.textMuted }}>
                      {x.polozky.length
                        ? `${den(x.polozky[0].datum)} ${x.polozky[0].popis.slice(0, 40)}${x.polozky.length > 1 ? ` (+${x.polozky.length - 1})` : ""}`
                        : "nezaplatený balíček z Kokpitu"}
                      {x.zBalickov > 0 && x.zPoplatkov > 0 ? ` · z toho ${kc(x.zBalickov)} za balíčky` : ""}
                    </div>
                    <div style={{ fontSize: 11.5, color: x.dni > 30 ? C.orange : C.textDim, minWidth: 80, textAlign: "right" }}>
                      {x.dni >= 0 ? `${x.dni} dní` : ""}
                    </div>
                    <button onClick={() => oznacHotove(kluc)} style={vedlajsie}>vybavené</button>
                  </div>
                );
              })}
              </div>
            </div>
            <datalist id="ws-klienti">{mena.map((m) => <option key={m} value={m} />)}</datalist>
            {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{chyba}</div>}
          </Card>
        </div>
      </div>

      {/* Bodky hovoria, koľko kariet je dokopy a kde v nich stojíš — číslo
          „Karta 2 z 3" to povie tiež, ale bodky to ukážu bez čítania.
          Sú to tlačidlá, nie ozdoba: dá sa nimi preskočiť rovno na kartu. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {zive.map((x, j) => (
            <button
              key={x.druh}
              onClick={() => (j === i ? undefined : prepni(j > i ? 1 : -1, j))}
              aria-label={BEZ_FRONTY.includes(x.druh) ? x.nadpis : `${x.nadpis} (${zostava(x)} zostáva)`}
              title={BEZ_FRONTY.includes(x.druh) ? x.nadpis : `${x.nadpis} · ${zostava(x)} zostáva`}
              style={{
                width: j === i ? 11 : 8, height: j === i ? 11 : 8, borderRadius: "50%",
                border: "none", padding: 0, cursor: "pointer",
                background: j === i ? C.accent : j < i ? mix(C.green, 60) : mix(C.border, 160),
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: C.textDim }}>
          {zive.length > 1 ? `Ďalej: ${zive[(i + 1) % zive.length].nadpis}` : ""}
        </div>
      </div>
    </div>
  );
}

/**
 * Telefón. Inline štýly médiá nevedia, takže sa to pýta cez `matchMedia`
 * — rovnako ako dashboard.
 *
 * Na 375 px zožierali bočné šípky 92 px zo šírky karty a riadky s
 * minimálnymi šírkami sa lámali do štyroch riadkov na jedného človeka.
 * Zo siedmich mien tak bolo vidieť dve a zvyšok sa musel vyrolovať vnútri
 * karty, o čom sa nedalo tušiť (Jerry, 28. 9. 2026: „nezobrazujú sa mi tam
 * všetci bez balíčka"). Odkedy sa kopa prepína ťahom prsta, šípky na
 * telefóne netreba.
 */
function useUzke() {
  const [uzke, setUzke] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const pouzi = () => setUzke(mq.matches);
    pouzi();
    mq.addEventListener("change", pouzi);
    return () => mq.removeEventListener("change", pouzi);
  }, []);
  return uzke;
}

const riadok = {
  display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const,
  padding: "7px 0", borderBottom: `1px solid ${mix(C.border, 55)}`,
};

const vstup = (varovanie: boolean) => ({
  flex: "0 1 190px", minWidth: 150, padding: "6px 9px", borderRadius: 8, fontSize: 12,
  border: `1px solid ${varovanie ? C.orange : C.border}`, background: C.bg, color: C.text,
});

const stitok = (on: boolean) => ({
  padding: "4px 9px", borderRadius: 7, fontSize: 11, cursor: "pointer",
  border: `1px solid ${on ? C.accent : C.border}`,
  background: on ? C.accentBg : "transparent",
  color: on ? C.accentLight : C.textMuted,
});

const hlavne = (aktivne: boolean) => ({
  padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600,
  cursor: aktivne ? "pointer" : "not-allowed",
  border: `1px solid ${aktivne ? mix(C.green, 50) : C.border}`,
  background: aktivne ? mix(C.green, 12) : "transparent",
  color: aktivne ? C.green : C.textDim,
});

const vedlajsie = {
  padding: "6px 10px", borderRadius: 8, fontSize: 11.5, cursor: "pointer",
  border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
};

/**
 * Kde má karta práve stáť.
 *
 * `von` ju odsunie proti smeru pohybu a stratí; `dnu` ju BEZ prechodu posadí
 * na druhú stranu (odtiaľ priletí). `null` je pokoj — a práve ten prechod
 * z „dnu" na „null" kartu dolietne na miesto.
 */
function pohybKarty(prechod: { smer: 1 | -1; faza: "von" | "dnu" } | null): React.CSSProperties {
  if (!prechod) return { transform: "translateX(0) scale(1)", opacity: 1, transition: "transform .22s cubic-bezier(.22,1,.36,1), opacity .18s ease-out" };
  if (prechod.faza === "von") {
    return { transform: `translateX(${-prechod.smer * 52}px) scale(.965)`, opacity: 0, transition: "transform .15s ease-in, opacity .15s ease-in" };
  }
  return { transform: `translateX(${prechod.smer * 52}px) scale(.965)`, opacity: 0, transition: "none" };
}

/**
 * Šípka prilepená na bok karty, zvisle v strede a stále na mieste.
 * `position: sticky` na zvislej osi by nefungovala (karta je v obyčajnom
 * toku), preto absolútne umiestnenie voči kope — a `top: 50%` s posunom
 * o polovicu vlastnej výšky ju drží v strede bez ohľadu na to, aký dlhý
 * je zoznam vnútri.
 */
const bocnaSipka = (strana: "left" | "right", aktivna: boolean, uzke = false) => ({
  position: "absolute" as const,
  [strana]: 0,
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 2,
  // Na telefóne užšia, nech karte zostane šírka — ale zostáva.
  width: uzke ? 26 : 38, height: uzke ? 88 : 64, borderRadius: 12, fontSize: uzke ? 20 : 24, lineHeight: 1,
  cursor: aktivna ? "pointer" : "not-allowed",
  border: `1px solid ${C.border}`,
  background: mix(C.border, 60),
  color: aktivna ? C.textMuted : C.textDim,
  opacity: aktivna ? 1 : 0.35,
});

