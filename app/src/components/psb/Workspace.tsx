import { oznam, pocuvaj } from "../../lib/psb/obnovaSignal";
import { potvrdDruhyBalicek } from "../../lib/psb/duplicitaBalicka";
import { doSchranky } from "../../lib/psb/kopirovanie";
import { fmtCZK, fmtDMY, normName } from "../../lib/psb/format";
import { SmsKlientovi } from "./SmsKlientovi";
import { AnamnezaPanel } from "./AnamnezaPanel";
import { podlaKlienta, type PodlaKlienta } from "../../lib/psb/sporneKonanie";
import { nazovProduktu } from "../../lib/psb/nazvyProduktov";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorKarta } from "./EditorKarta";
import { NekonecnyRad } from "./NekonecnyRad";

import { navrhniKlientaKandidati, type ClientAgg } from "../../lib/psb/compute";
import { kandidatiPlatby, otazkyPlatieb } from "../../lib/psb/workspaceKroky";
import { krokGesta, krokSvihu, novyStavGesta, novyStavSvihu, zacniSvih } from "../../lib/psb/gestoKariet";
import { BEZ_FRONTY, klucPolozky, krokyBety, popisZmeny, postavKarty, terminSK, rozdelAnamnezy, trenerZPrihlasenia, type AnamnezaRiadok, type Karta, type NeznamyNazov, type NepriradenaPlatba, type Zmena } from "../../lib/psb/workspaceKarty";
import { Dopyty } from "./Dopyty";
import { REPORTS, UploadCard } from "./Udaje";
import { BankaUlozene } from "./BankaUlozene";
import { BankovyImport } from "./Banka";
import type { ExtraReportu, MesiacReportu } from "../../lib/psb/mesacnyReport";
import { Zosit } from "./Zosit";
import { Uzavierky } from "./Uzavierky";
import { HromadnaSprava } from "./HromadnaSprava";
import { KamOdisliCard, OtazkyMesiaca } from "./Vzas";
import { RegisterRow } from "./Dashboard";
import type { Actions } from "./App";
import type { AssistantChat } from "./Assistant";
import type { RegisterItem } from "../../lib/psb/compute";
import type { PohybSplits, SplitCiast } from "../../lib/psb/pohybSplit";
import { ritualy } from "../../lib/psb/rituals";
import { KrokDopyty, KrokKontroly, KrokUzavierka, type KrokUzavierkyKarta } from "./WorkspaceKroky";
import { VytazenostTyzdna } from "./WorkspaceKroky";
import { AutomatickeBalicky, FioPrijmy, TyzdenKalendara, type Zvyraznenie, KrokPlatnost, KrokSms, NadpisSekcie, OtazkyPlatieb, VsetkoVybavene } from "./WorkspaceKroky";
import { bezAktivnehoBalicka, treningyZObochZdrojov, vMinuseKlienta, type BezBalicka } from "../../lib/psb/bezBalicka";
import { dlznici as spocitajDlznikov, type Dlznik } from "../../lib/psb/dlznici";
import { zostavaPoPlatnosti, type ZostavaPoPlatnosti } from "../../lib/psb/platnostZostatok";

/** Riadky z `/api/balicky` a `/api/platby` — len to, čo tieto karty potrebujú. */
type BalicekRiadok = {
  id?: string; klient: string; nazov: string; hodiny: number | null; platnost_od: string;
  platnost_do: string | null; cena_czk: number | null; zdroj: string; zrusene_at: string | null;
  poznamka?: string | null; created_at?: string | null;
};
type PlatbaRiadok = { klient: string; datum: string; suma_czk: number; zrusene_at: string | null; vopred?: number | null; created_at?: string | null };
import { VydaneFaktury, type FakturaPredvolba } from "./VydaneFaktury";
import type { PSBData } from "../../lib/psb/types";
import { KlientStol } from "./KlientStol";
import { C, mix } from "../../lib/psb/theme";
import { Card } from "./ui";
import { useUzke } from "./useUzke";
import { dnesPraha } from "../../lib/psb/cas";

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
// Deň berie dve číslice za mesiacom — `najblizsi` pri nových názvoch prichádza
// aj s časom („2026-10-06T09:00") a celý zvyšok dával „NaN. 10.".
const den = (s: string) => (s ? `${Number(s.slice(8, 10))}. ${Number(s.slice(5, 7))}.` : "");
/** Pondelok týždňa, do ktorého deň patrí — kľúč týždenného náhľadu. */
const tyzdenOd = (s: string): string => {
  const d = new Date(`${String(s).slice(0, 10)}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
};

export function Workspace({ clients, mena, ktoSom, data, kalUdalosti, btcSats, btc, onOverride, otvorKlienta, onOtvoreny, otvorKrok, onKrokOtvoreny, otvorKartu, onKartaOtvorena, onKde, fakturaPredvolba, onFakturaPredvolbaSpracovana, vypisPredvolba, onVypisPredvolbaSpracovana, krokyUzavierky, prekazkyUzavierky, podkladyUzavierky, reportUzavierky, onNavigate, actions, chat, register, pohybSplits, nastavPohybSplit }: {
  clients: Record<string, ClientAgg>;
  mena: string[];
  ktoSom: string | null;
  data: PSBData;
  kalUdalosti?: { zaciatok: string; klient: string | null; typ: string | null; uid?: string; trener?: string; koniec?: string; nazov?: string }[];
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
  /** Kroky a prekážky uzávierky mesiaca — tie isté, aké stráži zámok v Údajoch. */
  krokyUzavierky?: (mesiac: string) => KrokUzavierkyKarta[];
  prekazkyUzavierky?: (mesiac: string) => string[];
  /** Podklady mesiaca pre mesačnú správu — zoznam všetkých mesiacov a zámkov. */
  podkladyUzavierky?: (mesiac: string) => string;
  /** Vstup mesačného/kvartálneho reportu (App → mesacnyReport.ts). */
  reportUzavierky?: (mesiac: string) => { mesiace: MesiacReportu[]; extra: ExtraReportu };
  /** Prechod na inú obrazovku appky (uzávierka, kontroly, dopyty). */
  onNavigate?: (tab: string, sub?: string, focus?: never) => void;
  /**
   * Pre kroky uzávierky priamo vo Workspace (od 5. 10. 2026): nahrávanie
   * (`actions.ingest`), upozornenia mesiaca (`register`) a rozdelenie pohybov
   * v banke (`pohybSplits`). Tie isté hodnoty, aké dostávajú Údaje a Dnes.
   */
  actions?: Actions;
  chat?: AssistantChat;
  register?: RegisterItem[];
  pohybSplits?: PohybSplits;
  nastavPohybSplit?: (kluc: string, casti: SplitCiast[]) => void;
  /** Koho otvoriť rovno po prepnutí sem (klik na klienta inde v appke). */
  otvorKlienta?: string | null;
  /**
   * Krok, na ktorý má kopa skočiť (napr. „kalendar", „uzavierka") — upozornenia
   * a odkazy z iných záložiek vedú rovno na miesto, kde sa vec robí.
   */
  otvorKrok?: string | null;
  onKrokOtvoreny?: () => void;
  onOtvoreny?: () => void;
  /**
   * Karta, na ktorú skočiť — „krok:<id>" alebo druh karty („klient").
   * Používa to tlačidlo späť/dopredu: bez toho by sa krok vrátil na záložku
   * Workspace, ale na tú kartu, na ktorej človek stál naposledy, nie na tú,
   * z ktorej odišiel (Jerry, 8. 10. 2026).
   */
  otvorKartu?: string | null;
  onKartaOtvorena?: () => void;
  /** Hlási von, kde vo Workspace človek stojí — aby to stopa pohybu vedela. */
  onKde?: (kde: { karta: string; klient: string }) => void;
}) {
  const [balicky, setBalicky] = useState<BalicekRiadok[]>([]);
  const [vlastnePlatby, setVlastnePlatby] = useState<PlatbaRiadok[]>([]);
  /**
   * WORKSPACE PO KROKOCH — naostro od 5. 10. 2026 (Jerry: „postav to
   * v Kokpite"). Do toho dňa sa to skúšalo len v bete. Premenná ostáva, aby
   * bolo vidieť, ktoré správanie k tomu patrí.
   */
  const poKrokoch = true;
  /*
   * Naostro od 5. 10. 2026 (predtým beta): peniaze a faktúry podľa trénera
   * klienta, karty Dopyty, Uzávierka mesiaca a Mesačné kontroly.
   */
  /** „Všetky mesiace" pod kartou Uzávierka — zabalené, otvára sa zriedka. */
  const [vsetkyMesiace, setVsetkyMesiace] = useState(false);
  /** Hromadná správa pod krokom SMS — zabalená, píše sa zriedka. */
  const [hromadna, setHromadna] = useState(false);
  /** Ktorý riadok kroku Kalendár má pod sebou rozbalený týždeň (kľúč položky). */
  const [denOtvoreny, setDenOtvoreny] = useState("");
  /**
   * „Príjmy z banky" v kroku Platby a balíčky sú ROZBALENÉ.
   *
   * 5. 10. 2026 ich Jerry dal zabaliť („predvolene zabalené"), 6. 10. 2026 sa
   * na tom zasekla Hanusova platba: prišla, ale nikto ju nevidel a Hanus
   * svietil ako dlžník. Jerry: „existuje miesto, kde zapisujem všetky výdavky
   * — platby a balíčky by malo byť to isté miesto pre príjmy; nemusia tam byť
   * len dlžníci." Každý príjem má dostať klienta tak, ako výdavok dostane
   * kategóriu — a to sa nedá, keď je zoznam schovaný. Jerry: „daj všetky
   * platby z banky rozbalené defaultne, presne tak, ako to bolo pôvodne."
   */
  const [platbyRozbalene, setPlatbyRozbalene] = useState(true);
  const [pocetSms, setPocetSms] = useState<number | null>(null);
  const [zdroje, setZdroje] = useState<{ zmeny: Zmena[]; presuny: Record<string, { zaciatok: string; kandidatov: number }>; nezname: { nazov: string; trener: string; pocet: number; najblizsi: string }[]; platby: { fioId: string; datum: string; suma: number; text: string; kandidati: string[]; rozdelenie?: { klient: string; suma: number }[]; poznamka?: string }[]; konanie: PodlaKlienta[] } | null>(null);
  const [hotove, setHotove] = useState<Set<string>>(new Set());
  const [texty, setTexty] = useState<Record<string, string>>({});
  /**
   * Na ktorej karte človek stál — aj po odchode z Workspace a návrate
   * (Jerry, 5. 10. 2026: „po návrate mám byť presne tam, kde som skončil").
   */
  const [i, setIRaw] = useState(() => {
    try { return Number(sessionStorage.getItem("psb-workspace-karta") || 0) || 0; } catch { return 0; }
  });
  const setI = useCallback((v: number | ((x: number) => number)) => {
    setIRaw((x) => {
      const n = typeof v === "function" ? v(x) : v;
      try { sessionStorage.setItem("psb-workspace-karta", String(n)); } catch { /* bez úložiska len v pamäti */ }
      return n;
    });
  }, []);
  // Otvorený klient prežije prepnutie karty, nie odchod zo záložky — viď
  // `menoZvonku` v KlientStol.
  const [klientNaStole, setKlientNaStole] = useState("");
  /** Kto čaká na anamnézu. Vlastný fetch — obsah odpovedí sa sem neťahá. */
  const [anamnezy, setAnamnezy] = useState<AnamnezaRiadok[]>([]);
  /** Klient, ktorého anamnézu má karta Klient otvoriť rovno (zo zoznamu). */
  const [anamnezaPre, setAnamnezaPre] = useState<string | null>(null);
  /** Otvorená anamnéza v karte Anamnézy. Prázdne = zoznam. */
  const [anamnezaOtvorena, setAnamnezaOtvorena] = useState("");
  /** Archív anamnéz je zložený; otvorí sa klikom a dá sa v ňom hľadať. */
  /**
   * Čo appka ponúkne zapísať po priradení platby.
   *
   * Jerry, 2. 10. 2026: balíček nemá vznikať pri odoslaní SMS (to je ponuka),
   * ale keď dorazia peniaze. Návrh skladá `balicekZPlatby`; zapíše sa až
   * kliknutím — appka si hodiny nevymýšľa.
   */
  const [ponukaBalicka, setPonukaBalicka] = useState<
    { klient: string; nazov: string; hodiny: number | null; cena: number; platnostOd: string; platnostDo: string | null; preco: string } | null
  >(null);
  const [archivOtvoreny, setArchivOtvoreny] = useState(false);
  const [hladanieArchivu, setHladanieArchivu] = useState("");
  /** Zakladá sa nová — vyhľadávanie klienta. */
  const [novaAnamneza, setNovaAnamneza] = useState(false);
  const [hladanieAnamnezy, setHladanieAnamnezy] = useState("");
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
  /** Krátke potvrdenie po skopírovaní odkazu — zmizne samo. */
  const [hlaska, setHlaska] = useState("");
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
    setZdroje({ zmeny: (k?.zmeny || []) as Zmena[], presuny: k?.presuny || {}, nezname: k?.nezname || [], platby: p?.nepriradene || [], konanie: podlaKlienta(k?.sporneKonanie || []) });
    setBalicky(b?.balicky || []);
    setVlastnePlatby(vp?.platby || []);
  }, []);
  /**
   * Zápis v kroku zmení balíčky aj hodiny: Workspace si načíta svoje zoznamy
   * a App celé dáta (karta klienta, nezaplatené balíčky) — inak by krok
   * ukazoval stav spred kliknutia.
   */
  const poZapise = useCallback(() => { void nacitaj(); oznam("klienti"); }, [nacitaj]);
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
      nezaplateneKokpit: data.nezaplateneKokpit || [],
      bezHodin: data.bezHodin, platbyKokpit: data.platbyKokpit,
      treningyZdarma: (data.treningyZdarma || []) as never,
      // Odpovede „koľko hodín pridalo doplnenie" — bez nich appka v tom
      // období nepočíta dlh (viď migráciu 0085).
      doplneniaHodiny: data.doplneniaHodiny || {},
      druhyTreningov: data.druhyTreningov || {},
      // Skutočné hodiny minulých členstiev z PTmindera — nie z názvu.
      historia: (data.historiaBalickov || []) as never,
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
    // Všetci klienti, aj bez trénera — podľa kľúčov sa dlžník pomenuje
    // menom z karty, nie tvarom z poplatku.
    const treneri: Record<string, string> = {};
    for (const [meno, c] of Object.entries(clients)) treneri[meno] = c.primaryTrainer || "";
    // Jedno pravidlo „zaplatený" — dlžníci sú len zoskupený `data.dlhy`.
    return spocitajDlznikov(data.dlhy, treneri);
  }, [data.dlhy, clients]);

  const nacitajAnamnezy = useCallback(async () => {
    const r = await fetch("/api/anamneza?zoznam=1", { credentials: "same-origin" })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; polozky?: AnamnezaRiadok[] } | null;
    setAnamnezy(r?.ok ? (r.polozky || []) : []);
  }, []);
  useEffect(() => { void nacitajAnamnezy(); }, [nacitajAnamnezy]);
  // Zápis anamnézy zmizne z kopy až po obnovení zoznamu — signál chodí
  // z panela na karte klienta.
  useEffect(() => pocuvaj("klienti", () => { void nacitajAnamnezy(); }), [nacitajAnamnezy]);

  /** Komu končí platnosť a zostávajú hodiny — to isté, čo hlási notifikácia. */
  const platnost = useMemo(() => zostavaPoPlatnosti(Object.values(clients)), [clients]);

  const karty = useMemo(() => {
    if (!zdroje) return [];
    return postavKarty({
      ...zdroje,
      bezBalicka,
      dlznici: dlzniciRiadky,
      platnost,
      anamnezy,
      ktoSom,
      // Každý rieši peniaze svojich klientov (naostro od 5. 10. 2026).
      rozdelPeniaze: true,
      trenerKlienta: (m: string) => clients[m]?.primaryTrainer || "",
      trener: ktoreVeci === "auto" ? undefined : ktoreVeci === "vsetko" ? null : ktoreVeci,
      navrhMena: (nazov) => {
        const v = navrhniKlientaKandidati(nazov, clients);
        return v.typ === "uvodny" ? (v.kandidati[0] || v.meno) : (v.kandidati.length === 1 ? v.kandidati[0] : "");
      },
    });
  }, [zdroje, clients, ktoSom, ktoreVeci, bezBalicka, dlzniciRiadky, platnost, anamnezy]);

  // Karta, v ktorej už nič nezostalo, z kopy zmizne — ale až po tom, čo sa
  // v nej naozaj odklikalo; inak by zmizla pod rukami uprostred práce.
  const trenerKroku: string | null = ktoreVeci === "vsetko" ? null
    : ktoreVeci === "auto" ? trenerZPrihlasenia(ktoSom) : ktoreVeci;
  const kartyKopy = useMemo(() => (poKrokoch ? krokyBety(karty, { mesacne: true, ja: trenerKroku }) : karty), [poKrokoch, karty, trenerKroku]);
  const zive = useMemo(
    // Karta klienta nie je fronta — nemá položky a nikdy nezmizne. Ostatné
    // zmiznú, keď sa v nich všetko odklikalo.
    () => kartyKopy.filter((k) => BEZ_FRONTY.includes(k.druh)
      || (k.polozky as (Zmena | NeznamyNazov | NepriradenaPlatba | BezBalicka | Dlznik | ZostavaPoPlatnosti)[]).some((p) => !hotove.has(klucPolozky(k.druh, p)))),
    [kartyKopy, hotove],
  );
  const dlhyPodlaMena = useMemo(() => Object.fromEntries(dlzniciRiadky.map((d) => [d.meno, d.spolu])), [dlzniciRiadky]);

  const k = zive[Math.min(i, Math.max(0, zive.length - 1))];

  // Klik na klienta inde v appke otvorí kartu Klient — inak by človek pristál
  // na kope a musel sa k stolu preklikať sám (24. 9. 2026).
  useEffect(() => {
    if (!otvorKlienta && !vypisPredvolba) return;
    const idx = zive.findIndex((x) => x.druh === "klient");
    if (idx >= 0) setI(idx);
  }, [otvorKlienta, vypisPredvolba, zive]);
  useEffect(() => {
    if (!otvorKrok) return;
    const idx = zive.findIndex((x) => x.druh === "krok" && x.krok === otvorKrok);
    if (idx >= 0) setI(idx);
    onKrokOtvoreny?.();
  }, [otvorKrok, zive]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Meno karty pre stopu pohybu. Kroky sa rozlišujú svojím id, ostatné karty
   * stačí druhom — dve rovnaké vedľa seba nie sú.
   */
  const idKarty = useCallback((x: Karta): string => (x.druh === "krok" ? `krok:${x.krok}` : x.druh), []);

  // Späť/dopredu: skok na konkrétnu kartu a hlásenie, kde človek stojí.
  useEffect(() => {
    if (!otvorKartu) return;
    const idx = zive.findIndex((x) => idKarty(x) === otvorKartu);
    if (idx >= 0) setI(idx);
    onKartaOtvorena?.();
  }, [otvorKartu, zive, idKarty, onKartaOtvorena, setI]);
  const kdeSom = k ? idKarty(k) : "";
  useEffect(() => {
    onKde?.({ karta: kdeSom, klient: klientNaStole });
  }, [kdeSom, klientNaStole, onKde]);

  /**
   * Komu sa dá založiť anamnéza.
   *
   * NIELEN existujúcim KLIENTOM. Jerry, 1. 10. 2026: „Josef Pávek má
   * dohodnutý úvodný, prečo nie je v anamnézach na výber na vytvorenie?"
   * Zoznam stál na `clients`, a ten vzniká zo SEDENÍ — čiže z toho, čo sa
   * už odohralo. Kto má úvodný až zajtra, žiadne sedenie nemá a v appke ako
   * klient ešte neexistuje. Lenže anamnéza má prísť PRED tréningom; to je
   * celý jej zmysel.
   *
   * Preto sa k menám klientov pridávajú ľudia s objednaným termínom
   * v kalendári. Okno kalendára je −21/+14 dní, takže to presne pokrýva
   * „má to pozajtra".
   */
  const menaPreAnamnezu = useMemo(() => {
    const zname = new Set(mena.map((m) => normName(m)));
    const dnes = dnesPraha();
    const navyse: string[] = [];
    for (const u of kalUdalosti || []) {
      const m = (u.klient || "").trim();
      if (!m || (u.zaciatok || "").slice(0, 10) < dnes) continue;
      const k = normName(m);
      if (zname.has(k)) continue;
      zname.add(k);
      navyse.push(m);
    }
    return [...mena, ...navyse.sort((a, b) => a.localeCompare(b, "cs"))];
  }, [mena, kalUdalosti]);

  /** Preklik zo zhrnutia na karte klienta — otvor kartu Anamnézy na ňom. */
  useEffect(() => {
    if (!anamnezaPre) return;
    setAnamnezaOtvorena(anamnezaPre);
    setNovaAnamneza(false);
    const idx = zive.findIndex((x) => x.druh === "anamnezy");
    if (idx >= 0) setI(idx);
    setAnamnezaPre(null);
  }, [anamnezaPre, zive]);

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
    // Krok späť musí vedieť o OBOCH zápisoch, nielen o tom poslednom.
    if (z.nazov) setKrokSpat((x) => (x && x.kluc === kluc
      ? { ...x, mapovanie: { nazov: z.nazov as string, trener: z.trener, typ: "sukromne" } }
      : x));
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

  /**
   * ODPOVEĎ NA „BOL TAM?" SA ZAPISUJE, POTOM MIZNE Z OBRAZOVKY.
   *
   * Nie naopak. Riadok, ktorý zmizne pred zápisom, je presne tá tichá strata,
   * ktorú appka inde nikde nepripúšťa — človek by mal pocit, že odpovedal,
   * a po načítaní by tam otázka stála znova.
   *
   * Zápis „bol tam" mení počet odtrénovaných hodín, takže sa oznámi obnova
   * kalendára; inak by obrazovky držali staré číslo.
   */
  const [odpovedane, setOdpovedane] = useState<Set<string>>(new Set());
  const odpovedzKonanie = async (p: { uid: string; trener: string; klient: string; zaciatok: string }, konal: boolean) => {
    const r = await fetch("/api/kalendar", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "konanie", uid: p.uid, trener: p.trener, klient: p.klient, zaciatok: p.zaciatok, konal }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    if (!r?.ok) return;
    setOdpovedane((s) => new Set([...s, `${p.uid}|${p.trener}`]));
    if (konal) oznam("kalendar");
  };

  /** Otvorí kartu Klient s týmto človekom na stole. */
  const naStol = (meno: string) => {
    setKlientNaStole(meno);
    const idx = zive.findIndex((x) => x.druh === "klient");
    if (idx >= 0) setI(idx);
  };

  /** Čo sa dá vrátiť klávesou ⌘Z — vždy len posledné odoslanie. */
  const [krokSpat, setKrokSpat] = useState<{ kluc: string; id: string; popis: string; mapovanie?: { nazov: string; trener: string; typ: string } } | null>(null);
  const [vratene, setVratene] = useState("");

  const vratKrok = useCallback(async () => {
    if (!krokSpat) return;
    const k = krokSpat;
    setKrokSpat(null);
    const j = await posli("/api/kalendar", { akcia: "vrat", id: k.id }).catch(() => ({ ok: false, error: "spojenie" }));
    if (!j.ok) { setChyba(j.error || "vrátiť sa to nepodarilo"); setKrokSpat(k); return; }
    // „Súkromné" zapísalo aj pravidlo pre ten názov — bez jeho zmazania by
    // sa otázka vrátila do zoznamu, ale appka by názov ďalej považovala za
    // nie-tréning a pri najbližšej synchronizácii ho znova odložila.
    if (k.mapovanie) {
      const m = await posli("/api/kalendar", { akcia: "odmapuj", ...k.mapovanie }).catch(() => ({ ok: false, error: "spojenie" }));
      if (!m.ok) setChyba("Otázka je späť, ale názov zostal zapísaný ako súkromný — zmaž ho v Kalendári.");
    }
    setHotove((s) => { const n = new Set(s); n.delete(k.kluc); return n; });
    setVratene(k.mapovanie ? "Vrátené — riadok je zase v zozname a názov už nie je súkromný." : "Vrátené — riadok je zase v zozname.");
    setTimeout(() => setVratene(""), 4000);
    oznam("kalendar");
    void nacitaj();
  }, [krokSpat, nacitaj, oznam, posli]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      // V rozpísanom texte patrí ⌘Z písaniu, nie appke.
      if (t && (t.isContentEditable || /^(input|textarea)$/i.test(t.tagName))) return;
      if (!krokSpat) return;
      e.preventDefault();
      void vratKrok();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [krokSpat, vratKrok]);

  const vybav = async (kluc: string, url: string, telo: Record<string, unknown>) => {
    setPracujem(kluc); setChyba("");
    const j = await posli(url, telo).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem("");
    if (!j.ok) { setChyba(j.error || "nepodarilo sa uložiť"); return; }
    setHotove((s) => new Set([...s, kluc]));
    /**
     * KROK SPÄŤ PO ODOSLANÍ (Jerry, 8. 10. 2026: „potrebujem aj cmd+z, keby
     * som to odoslal príliš unáhlene"). Vracať sa dá to, čo appka vie
     * naozaj vrátiť — zatiaľ vysvetlená zmena v kalendári (akcia `vrat`,
     * ktorá existuje od 25. 9.). Pamätá si LEN posledný krok: hlbšia
     * história by sľubovala vrátenie aj tam, kde ho server nemá.
     */
    if (telo.akcia === "vysvetli" && telo.id) {
      setKrokSpat({ kluc, id: String(telo.id), popis: String(telo.poznamka || "").trim() });
    }
    // Register na Dnes drží vlastnú kópiu kalendára — bez oznámenia by
    // vybavená zmena svietila ďalej (kontrola 24. 9. 2026).
    oznam(url.includes("platby") ? "peniaze" : "kalendar");
    return j as { navrh?: typeof ponukaBalicka } | undefined;
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

  /**
   * OBSAH JEDNEJ KARTY. Vytiahnuté do funkcie, aby ho krok v bete vedel
   * nakresliť ako sekciu — tá istá karta, ten istý kód, len pod nadpisom
   * kroku (Jerry, 4. 10. 2026: „všetko na jednom mieste").
   */
  const obsahKarty = (k: Karta): React.ReactNode => (
    <>
              {/* EDITOR — fotky predtým/potom a videá chôdze a behu (6. 10. 2026). */}
              {k.druh === "editor" && <EditorKarta mena={mena} />}
              {k.druh === "faktury" && (
                <VydaneFaktury
                  mena={mena}
                  treneri={treneriKlientov}
                  lenTrenera={trenerKroku}
                  predvolba={predvolbaFaktury}
                  onPredvolbaSpracovana={() => setPredvolbaFaktury(null)}
                />
              )}
              {/* ANAMNÉZY — kartotéka. Zoznam, alebo jedna otvorená.
                  Jerry, 30. 9. 2026: „chcem mať celú jednu kartu, kde budú
                  všetky anamnézy pokope a bude tam aj Nová anamnéza." */}
              {k.druh === "anamnezy" && (anamnezaOtvorena ? (
                <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flexGrow: 1 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 12, flexWrap: "wrap" }}>
                    <button
                      onClick={() => { setAnamnezaOtvorena(""); void nacitajAnamnezy(); }}
                      style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                    >← späť na zoznam</button>
                    <b style={{ fontSize: 15 }}>{anamnezaOtvorena}</b>
                  </div>
                  <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto" }}>
                    <AnamnezaPanel meno={anamnezaOtvorena} />
                  </div>
                </div>
              ) : novaAnamneza ? (
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => { setNovaAnamneza(false); setHladanieAnamnezy(""); }}
                      style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                    >← späť</button>
                    <b style={{ fontSize: 14 }}>Nová anamnéza — komu?</b>
                  </div>
                  <input
                    value={hladanieAnamnezy}
                    onChange={(e) => setHladanieAnamnezy(e.target.value)}
                    placeholder="hľadať klienta…"
                    autoFocus
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 8, fontSize: 13,
                      border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit",
                    }}
                  />
                  <div style={{ marginTop: 8 }}>
                    {menaPreAnamnezu
                      .filter((m) => normName(m).includes(normName(hladanieAnamnezy)))
                      .slice(0, 12)
                      .map((m) => {
                        const uz = anamnezy.some((a) => a.klient === m);
                        return (
                          <button
                            key={m}
                            onClick={() => { setAnamnezaOtvorena(m); setNovaAnamneza(false); setHladanieAnamnezy(""); }}
                            style={{
                              display: "block", width: "100%", textAlign: "left", padding: "7px 9px", borderRadius: 7,
                              border: "none", background: "transparent", color: C.text, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                            }}
                          >
                            {m}
                            {uz
                              ? <span style={{ color: C.textDim, fontSize: 11, marginLeft: 8 }}>už ju má — otvorí sa</span>
                              : !mena.includes(m) && <span style={{ color: C.textMuted, fontSize: 11, marginLeft: 8 }}>objednaný termín — klientom ešte nie je</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => setNovaAnamneza(true)}
                    style={{ ...tlacidloKarty, borderColor: mix(C.green, 45), color: C.green, fontWeight: 600, marginBottom: 12 }}
                  >+ Nová anamnéza</button>

{(() => {
                    /* Riadok sa kreslí raz a používa sa na karte aj v archíve.
                       Dve kópie by sa rozišli pri prvej zmene tlačidiel. */
                    const riadokAnamnezy = (a: AnamnezaRiadok) => {
                        const den = (a.uvodny || "").slice(0, 10);
                        const kedy = den ? `${Number(den.slice(8))}. ${Number(den.slice(5, 7))}.` : "";
                        const stavText = a.zapisAt ? "hotová"
                          : a.klientVyplnilAt ? "klient vyplnil — chýba zápis"
                            : a.odkaz ? "čaká na klienta" : "odkaz ešte nemá";
                        const farba = a.zapisAt ? C.green : a.klientVyplnilAt ? C.accentLight : C.textMuted;
                        return (
                          <div key={a.klient} style={{ padding: "10px 0", borderBottom: `1px solid ${mix(C.border, 45)}` }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                              <button
                                onClick={() => setAnamnezaOtvorena(a.klient)}
                                style={{ background: "none", border: "none", padding: 0, color: C.text, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                              >{a.klient}</button>
                              {kedy && (
                                <span style={{ fontSize: 11.5, color: a.uzBol ? C.textDim : C.orange }}>
                                  úvodný {a.uzBol ? "bol" : "bude"} {kedy}
                                </span>
                              )}
                              {a.trener && <span style={{ fontSize: 11.5, color: C.textDim }}>· {a.trener}</span>}
                              <div style={{ flexGrow: 1 }} />
                              <span style={{ fontSize: 11.5, color: farba }}>{stavText}</span>
                            </div>
                            <div style={{ display: "flex", gap: 7, marginTop: 7, flexWrap: "wrap" }}>
                              {!a.klientVyplnilAt && (
                                <button
                                  onClick={() => void (async () => {
                                    let url = a.odkaz;
                                    if (!url) {
                                      const r = await fetch("/api/anamneza", {
                                        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
                                        body: JSON.stringify({ akcia: "odkaz", klient: a.klient }),
                                      }).then((x) => x.json()).catch(() => null) as { ok?: boolean; odkaz?: string } | null;
                                      if (!r?.ok || !r.odkaz) { setChyba("Odkaz sa nepodarilo vyrobiť."); return; }
                                      url = r.odkaz;
                                      await nacitajAnamnezy();
                                    }
                                    const ok = await doSchranky(url);
                                    setChyba(ok ? "" : "Skopíruj odkaz ručne — schránka odmietla.");
                                    if (ok) { setHlaska(`Odkaz pre ${a.klient} je v schránke.`); setTimeout(() => setHlaska(""), 2500); }
                                  })()}
                                  style={{ ...tlacidloKarty, borderColor: mix(C.green, 45), color: C.green }}
                                >{a.odkaz ? "Kopírovať odkaz" : "Vyrobiť odkaz"}</button>
                              )}
                              <button onClick={() => setAnamnezaOtvorena(a.klient)} style={tlacidloKarty}>
                                {a.zapisAt ? "Otvoriť" : "Vyplniť"}
                              </button>
                            </div>
                          </div>
                        );
                    };
                    const { aktualne, archiv } = rozdelAnamnezy(k.polozky as AnamnezaRiadok[], dnesPraha());
                    const najdene = archiv.filter((a) => normName(a.klient).includes(normName(hladanieArchivu)));
                    return (
                      <>
                        {aktualne.length === 0 && (
                          <div style={{ fontSize: 12.5, color: C.textDim, lineHeight: 1.6, paddingBottom: 4 }}>
                            Nikto nečaká. Klient, ktorý ide na úvodný tréning, sa tu objaví sám.
                          </div>
                        )}
                        {aktualne.map(riadokAnamnezy)}

                        {/* ARCHÍV. Jerry, 2. 10. 2026: „staré anamnézy zabaľ do
                            archívu." Karta mala 57 riadkov a všetky hotové —
                            v takom zozname sa to jedno meno, na ktorom dnes
                            záleží, nedá nájsť. Nič sa nemaže ani neskrýva:
                            je to jeden klik a dá sa v ňom hľadať. */}
                        {archiv.length > 0 && (
                          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${mix(C.border, 60)}` }}>
                            <button
                              onClick={() => setArchivOtvoreny((p) => !p)}
                              style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}
                            >
                              <span style={{ display: "inline-block", width: 13, fontSize: 9 }}>{archivOtvoreny ? "▼" : "▶"}</span>
                              Archív ({archiv.length})
                            </button>
                            {archivOtvoreny && (
                              <div style={{ marginTop: 9 }}>
                                <input
                                  value={hladanieArchivu}
                                  onChange={(e) => setHladanieArchivu(e.target.value)}
                                  placeholder="hľadať v archíve…"
                                  style={{
                                    width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, fontSize: 12.5,
                                    border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit",
                                  }}
                                />
                                {najdene.length === 0 && (
                                  <div style={{ fontSize: 12, color: C.textDim, marginTop: 9 }}>Nikto taký v archíve nie je.</div>
                                )}
                                {najdene.slice(0, 40).map(riadokAnamnezy)}
                                {najdene.length > 40 && (
                                  <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8 }}>
                                    …a ďalších {najdene.length - 40}. Napíš meno, nájde sa.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ))}
              {k.druh === "zmeny" && (() => {
                /**
                 * NAJPRV TIE, ČO ZMIZLI, NAKONIEC POSUNY (Jerry, 8. 10. 2026:
                 * „nech najprv riešim tie, čo zmizli, a nakoniec posuny").
                 * Je to to isté pravidlo ako pri celej kope — jeden druh
                 * práce naraz. Zmiznutá hodina je voľné okno a nezarobené
                 * peniaze; posun je len zápis, ktorý sa má zrovnať.
                 */
                const presuny = zdroje?.presuny || {};
                const poradie = (z: Zmena) => {
                  const p = presuny[z.id];
                  if (z.druh === "zrusene" && !p) return 0;   // naozaj zmizlo
                  if (z.druh === "zrusene") return 1;         // vyzerá to na presun
                  if (z.druh === "posunute") return 2;
                  return 3;                                    // pridané, premenované
                };
                const NADPISY = ["Zmizli", "Vyzerá to na presun", "Posuny", "Ostatné zmeny"];
                const zoradene = [...k.polozky].sort((a, b) => poradie(a) - poradie(b)
                  || String(b.pred || b.po || "").localeCompare(String(a.pred || a.po || "")));
                let predosleP = -1;
                return zoradene.map((z) => {
                const kluc = klucPolozky("zmeny", z);
                if (hotove.has(kluc)) return null;
                const t = text(kluc);
                const presun = presuny[z.id] || null;
                const skupina = poradie(z);
                const nadpis = skupina !== predosleP ? NADPISY[skupina] : null;
                predosleP = skupina;
                return (
                  <div key={kluc}>
                  {nadpis && (
                    <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.textMuted, margin: "12px 0 5px" }}>
                      {nadpis}
                    </div>
                  )}
                  <div style={riadok}>
                    <div style={{ minWidth: 150, flex: "1 1 190px" }}>
                      {poKrokoch ? (
                        <button onClick={() => setDenOtvoreny(denOtvoreny === kluc ? "" : kluc)} title="Ukázať týždeň v kalendári"
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: C.text, textAlign: "left" }}>
                          {z.klient || z.nazov || "(bez mena)"} {denOtvoreny === kluc ? "▴" : "▾"}
                        </button>
                      ) : (
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{z.klient || z.nazov || "(bez mena)"}</div>
                      )}
                      <div style={{ fontSize: 11, color: C.textDim }}>{popisZmeny(z)} · {z.trener}</div>
                      {/* Čo appka našla, má byť vidieť BEZ kliknutia — inak
                          je návrh len skryté tlačidlo. Pri viacerých
                          kandidátoch sa to povie: je to otázka, nie dôkaz. */}
                      {presun && (
                        <div style={{ fontSize: 11, color: C.orange, marginTop: 2 }}>
                          v kalendári pribudol termín {terminSK(presun.zaciatok)}
                          {presun.kandidatov > 1 ? ` (a ešte ${presun.kandidatov - 1} ďalší) — over, či je to ten` : ""}
                        </div>
                      )}
                    </div>
                    {/* Týždeň pod riadkom (order: 99 ho dá na koniec riadku,
                        pod tlačidlá) — Jerry, 4. 10. 2026. */}
                    {poKrokoch && denOtvoreny === kluc && (
                      <div style={{ flexBasis: "100%", order: 99 }}>
                        {[...new Set([z.pred, z.po].filter(Boolean).map((x) => tyzdenOd(String(x))))].map((t) => (
                          <TyzdenKalendara
                            key={t} den={t} trener={z.trener}
                            zvyraznenia={([
                              z.druh === "zrusene" && z.pred ? { druh: "zmazane", zaciatok: z.pred, popis: `${z.klient || z.nazov || ""} — zmazané` } : null,
                              z.druh === "posunute" && z.pred ? { druh: "presunZ", zaciatok: z.pred, popis: `${z.klient || z.nazov || ""} — odtiaľto` } : null,
                              z.druh === "posunute" && z.po ? { druh: "presunNa", zaciatok: z.po, popis: `${z.klient || z.nazov || ""} — sem` } : null,
                              z.druh === "pridane" && z.po ? { druh: "nove", zaciatok: z.po, popis: `${z.klient || z.nazov || ""} — pribudlo` } : null,
                            ].filter(Boolean)) as Zvyraznenie[]}
                          />
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {/* Klik na kategóriu rovno UZAVRIE (Jerry, 8. 10. 2026:
                          „keď klikám na nejakú kategóriu, malo by sa to
                          automaticky odoslať"). Dovtedy štítok len vyplnil
                          políčko a čakalo sa na druhý klik na Vybavené —
                          dva kliky na jednu odpoveď. Kto chce napísať niečo
                          vlastné, má pod tým políčko a to sa posiela
                          tlačidlom. */}
                      {(presun
                        ? [`presunuli sme na ${terminSK(presun.zaciatok)}`, "klient zrušil", "chyba v zápise"]
                        : ["klient zrušil", "presunuli sme", "chyba v zápise"]
                      ).map((d) => (
                        <button
                          key={d}
                          onClick={() => void vybav(kluc, "/api/kalendar", { akcia: "vysvetli", id: z.id, poznamka: d })}
                          disabled={pracujem === kluc}
                          title="Uzavrieť s týmto dôvodom"
                          style={stitok(t === d)}
                        >
                          {pracujem === kluc ? "…" : d}
                        </button>
                      ))}
                    </div>
                    {/* Enter odošle — Jerry, 8. 10. 2026: „keď odpíšem, nedá
                        sa mi enterom potvrdiť to, čo som napísal." Ruka, ktorá
                        práve dopísala vetu, je na klávesnici, nie na myši. */}
                    <input
                      value={t}
                      onChange={(e) => nastavText(kluc, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" || pracujem === kluc) return;
                        e.preventDefault();
                        // Kurzor z políčka von, inak by ⌘Z hneď po odoslaní
                        // vrátilo napísané písmená, nie odoslanú odpoveď.
                        e.currentTarget.blur();
                        void vybav(kluc, "/api/kalendar", { akcia: "vysvetli", id: z.id, poznamka: t.trim() });
                      }}
                      placeholder="alebo vlastnými slovami… (Enter odošle)"
                      style={vstup(false)}
                    />
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
                  </div>
                );
                });
              })()}

              {k.druh === "mena" && k.polozky.map((n) => {
                const kluc = klucPolozky("mena", n);
                if (hotove.has(kluc)) return null;
                const t = text(kluc, n.navrh);
                return (
                  <div key={kluc} style={riadok}>
                    <div style={{ minWidth: 130, flex: "1 1 160px" }}>
                      {poKrokoch ? (
                        <button onClick={() => setDenOtvoreny(denOtvoreny === kluc ? "" : kluc)} title="Ukázať týždeň v kalendári"
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: C.text, textAlign: "left" }}>
                          {n.nazov} {denOtvoreny === kluc ? "▴" : "▾"}
                        </button>
                      ) : (
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{n.nazov}</div>
                      )}
                      <div style={{ fontSize: 11, color: C.textDim }}>{n.trener} · {n.pocet}× · {den(n.najblizsi)}</div>
                    </div>
                    {poKrokoch && denOtvoreny === kluc && n.najblizsi && (
                      <div style={{ flexBasis: "100%", order: 99 }}>
                        <TyzdenKalendara den={tyzdenOd(n.najblizsi)} trener={n.trener} zvyraznenia={[{ druh: "nazov", nazov: n.nazov }]} />
                      </div>
                    )}
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

              {k.druh === "klient" && <KlientStol clients={clients} mena={mena} data={data} kalUdalosti={kalUdalosti} btcSats={btcSats} btc={btc} onOverride={onOverride} otvorKlienta={vypisPredvolba || otvorKlienta} onOtvoreny={onOtvoreny} onFaktura={setPredvolbaFaktury} otvorVypis={vypisPredvolba} onVypisOtvoreny={onVypisPredvolbaSpracovana} menoZvonku={klientNaStole} setMenoZvonku={setKlientNaStole} onOtvorAnamnezu={(m) => setAnamnezaPre(m)} />}

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
                          <div style={{ flex: "1 1 200px", minWidth: 150, fontSize: 11, color: C.textMuted }}>
                            {p.text.slice(0, 96)}
                            {p.poznamka && <div style={{ color: C.orange, marginTop: 2 }}>{p.poznamka}</div>}
                            {p.rozdelenie && !delenie && (
                              <div style={{ color: C.accentLight, marginTop: 2 }}>
                                jeden prevod za viacerých: {p.rozdelenie.map((d) => `${d.klient} ${kc(d.suma)}`).join(" + ")}
                              </div>
                            )}
                          </div>
                          {!delenie && (
                            <>
                              <input list="ws-klienti" value={t} onChange={(e) => nastavText(kluc, e.target.value)} placeholder="komu patrí…" style={vstup(!!t && !mena.includes(t))} />
                              <button onClick={() => void (async () => {
                                const j = await vybav(kluc, "/api/platby", { akcia: "priradz", fioId: p.fioId, klient: t.trim(), zapamataj: true });
                                if (j?.navrh) setPonukaBalicka({ ...j.navrh, klient: t.trim() });
                              })()} disabled={pracujem === kluc || t.trim().length < 3} style={hlavne(t.trim().length >= 3)}>
                                {pracujem === kluc ? "…" : "Priradiť"}
                              </button>
                              {/* Jeden prevod, dvaja klienti — Jerry, 28. 9. 2026: „15 580
                                  DK Consulting je Dan Kouřil spoločne s Monikou." */}
                              <button
                                onClick={() => {
                                  setDelim(p.fioId);
                                  // Návrh appky, keď ho má (faktúra s položkami,
                                  // dvojica, čo už spolu platila); inak napoly.
                                  setDiely(p.rozdelenie
                                    ? p.rozdelenie.map((d) => ({ klient: d.klient, suma: String(Math.round(d.suma)) }))
                                    : [{ klient: t.trim(), suma: String(Math.round(p.suma / 2)) }, { klient: "", suma: String(Math.round(p.suma) - Math.round(p.suma / 2)) }]);
                                }}
                                style={p.rozdelenie ? hlavne(true) : vedlajsie}
                                title={p.rozdelenie ? `Návrh: ${p.rozdelenie.map((d) => `${d.klient} ${d.suma} Kč`).join(" + ")}` : undefined}
                              >
                                {p.rozdelenie ? `Rozdeliť: ${p.rozdelenie.map((d) => d.klient.split(" ")[0]).join(" + ")}` : "Rozdeliť"}
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

              {/* BOL TAM, ALEBO NIE? — každá nerozhodnutá hodina je hodina,
                  o ktorú je zostatok klienta vedľa. Odpovedá sa po jednej,
                  lebo každá je iný deň a človek si spomenie na konkrétny
                  termín, nie na „tie štyri". Odpoveď „nebol" sa tiež píše:
                  bez zápisu by sa Kokpit pýtal donekonečna. */}
              {k.druh === "konanie" && k.polozky.map((x) => {
                const kluc = klucPolozky("konanie", x);
                const zostavajuce = x.polozky.filter((p) => !odpovedane.has(`${p.uid}|${p.trener}`));
                if (!zostavajuce.length) return null;
                return (
                  <div key={kluc} style={{ ...riadok, flexWrap: "wrap", alignItems: "flex-start" }}>
                    {/* V bete klik na meno rozbalí deň v kalendári trénera
                        (Jerry, 4. 10. 2026) — profil je o kartu vedľa. */}
                    <button
                      onClick={() => (poKrokoch ? setDenOtvoreny(denOtvoreny === kluc ? "" : kluc) : naStol(x.klient))}
                      title={poKrokoch ? "Ukázať deň v kalendári" : undefined}
                      style={{ ...vedlajsie, fontSize: 13.5, fontWeight: 600, color: C.text, minWidth: uzke ? 0 : 150, flex: uzke ? "1 1 100%" : undefined, textAlign: "left" }}
                    >
                      {x.klient}{poKrokoch ? (denOtvoreny === kluc ? " ▴" : " ▾") : ""}
                    </button>
                    <div style={{ flex: "1 1 100%", display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
                      {zostavajuce.map((p) => (
                        <div key={`${p.uid}|${p.trener}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12.5, color: C.text, minWidth: 138 }}>
                            {den(p.zaciatok.slice(0, 10))} · {p.zaciatok.slice(11, 16)}
                          </span>
                          <span style={{ fontSize: 11, color: C.textDim, flex: "1 1 130px" }}>
                            z kalendára zmizlo {den(p.zmizla_at.slice(0, 10))}
                          </span>
                          <button
                            onClick={() => void odpovedzKonanie(p, true)}
                            style={{ ...vedlajsie, border: `1px solid ${mix(C.green, 40)}`, background: mix(C.green, 10), color: C.green, fontWeight: 600 }}
                          >
                            bol tam
                          </button>
                          <button onClick={() => void odpovedzKonanie(p, false)} style={{ ...vedlajsie }}>neprišiel</button>
                        </div>
                      ))}
                      {poKrokoch && denOtvoreny === kluc && [...new Set(zostavajuce.map((p) => `${tyzdenOd(p.zaciatok)}|${p.trener}`))].map((tk) => {
                        const [t, tr] = tk.split("|");
                        return (
                          <TyzdenKalendara
                            key={tk} den={t} trener={tr}
                            zvyraznenia={zostavajuce.filter((p) => tyzdenOd(p.zaciatok) === t && p.trener === tr)
                              .map((p): Zvyraznenie => ({ druh: "sporne", zaciatok: p.zaciatok.slice(0, 16), popis: `${x.klient} — zmizlo z kalendára` }))}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}

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
                /**
                 * PLATBA, KTORÁ UŽ PRIŠLA, MUSÍ BYŤ VIDNO BEZ KLIKNUTIA.
                 * Jerry, 6. 10. 2026 nad Hanusom: „prečo má nepriradenú
                 * platbu, kde by som mu ju mal priradiť?" Platba (meno aj suma
                 * sedeli) bola schovaná za klikom na meno a v zbalenom „Všetky
                 * platby z banky" — dlžník vyzeral ako dlžník, hoci zaplatil.
                 */
                const isty = poKrokoch ? kandidatiPlatby(x.meno, x, zdroje?.platby || [], data.nezaplateneKokpit || []).find((p) => p.preco === "meno+suma") : undefined;
                return (
                  <div key={kluc} style={{ ...riadok, flexWrap: "wrap" }}>
                    <button
                      onClick={() => (poKrokoch ? setDenOtvoreny(denOtvoreny === kluc ? "" : kluc) : naStol(x.meno))}
                      title={poKrokoch ? "Ukázať platby z banky, ktoré k nemu môžu patriť" : undefined}
                      style={{ ...vedlajsie, fontSize: 13.5, fontWeight: 600, color: C.text, minWidth: uzke ? 0 : 150, flex: uzke ? "1 1 auto" : undefined, textAlign: "left" }}
                    >
                      {x.meno}{poKrokoch ? (denOtvoreny === kluc ? " ▴" : " ▾") : ""}
                    </button>
                    {/* Koľko je v mínuse — pred sumou (Jerry, 4. 10. 2026:
                        „Daniela Šašinková −3 · 9 400 · 9. 9. OFF…"). */}
                    {poKrokoch && (
                      <div style={{ minWidth: uzke ? 0 : 46, fontSize: 13, fontWeight: 700, textAlign: "right", color: (clients[x.meno]?.packageRemaining ?? 0) < 0 ? C.orange : C.textDim }}>
                        {clients[x.meno] && clients[x.meno].packageTotal > 0
                          ? `${clients[x.meno].packageRemaining < 0 ? "−" : ""}${Math.abs(Math.round(clients[x.meno].packageRemaining * 100) / 100)} h`
                          : ""}
                      </div>
                    )}
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
                    {/* V bete „vybavené" nie je: dlh zmizne až spárovanou platbou
                        (Jerry, 4. 10. 2026: „keď dám vybavené, zmizne to a nič sa
                        nenapáruje"). */}
                    {!poKrokoch && <button onClick={() => oznacHotove(kluc)} style={vedlajsie}>vybavené</button>}
                    {isty && denOtvoreny !== kluc && (
                      <div style={{ flexBasis: "100%", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "2px 0 4px", fontSize: 12, color: C.green }}>
                        <span>Platba už prišla: {kc(isty.suma)} · {fmtDMY(isty.datum)} — meno aj suma sedia</span>
                        <button
                          disabled={pracujem === isty.fioId}
                          onClick={() => void (async () => {
                            await vybav(isty.fioId, "/api/platby", { akcia: "priradz", fioId: isty.fioId, klient: x.meno, zapamataj: true });
                            poZapise();
                          })()}
                          style={hlavne(true)}
                        >
                          {pracujem === isty.fioId ? "…" : `Spárovať s ${x.meno.split(" ")[0]}`}
                        </button>
                      </div>
                    )}
                    {poKrokoch && denOtvoreny === kluc && (() => {
                      const pary = kandidatiPlatby(x.meno, x, zdroje?.platby || [], data.nezaplateneKokpit || []);
                      return (
                        <div style={{ flexBasis: "100%", margin: "4px 0 6px", padding: "8px 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: mix(C.card, 70) }}>
                          {!pary.length && (
                            <div style={{ fontSize: 12, color: C.textMuted }}>
                              Žiadna platba z Fio, ktorá by k {x.meno} sedela — ani menom, ani sumou {kc(x.spolu)}. Výpis z banky siaha
                              po posledné stiahnutie; nové príjmy stiahneš hore v tomto kroku.
                            </div>
                          )}
                          {pary.map((p) => (
                            <div key={p.fioId} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "4px 0" }}>
                              <span style={{ fontSize: 12, color: C.textDim, minWidth: 74 }}>{fmtDMY(p.datum)}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 80, textAlign: "right" }}>{kc(p.suma)}</span>
                              <span style={{ fontSize: 11.5, color: C.textMuted, flex: "1 1 220px" }}>{p.text.slice(0, 90)}</span>
                              <span style={{ fontSize: 11, color: C.textDim }}>{p.preco === "meno+suma" ? "meno aj suma sedia" : p.preco === "meno" ? "meno v platbe" : "suma sedí"}</span>
                              <button
                                disabled={pracujem === p.fioId}
                                onClick={() => void (async () => {
                                  await vybav(p.fioId, "/api/platby", { akcia: "priradz", fioId: p.fioId, klient: x.meno, zapamataj: true });
                                  poZapise();
                                })()}
                                style={hlavne(true)}
                              >
                                {pracujem === p.fioId ? "…" : `Spárovať s ${x.meno.split(" ")[0]}`}
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
    </>
  );

  /** Krok bety: jeho sekcie (staré karty) a nové časti, ktoré patria len sem. */
  const kresliKrok = (k: Extract<Karta, { druh: "krok" }>): React.ReactNode => {
    const zivych = (x: Karta) => (x.polozky as (Zmena | NeznamyNazov | NepriradenaPlatba | BezBalicka | Dlznik | ZostavaPoPlatnosti)[])
      .filter((p) => !hotove.has(klucPolozky(x.druh, p))).length;
    const sekcie = k.sekcie.filter((x) => zivych(x) > 0);
    const sekcieKresli = sekcie.map((x) => (x.druh === "platby"
      ? (
        <div key={x.druh}>
          <button
            onClick={() => setPlatbyRozbalene((v) => !v)}
            aria-expanded={platbyRozbalene}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "block", width: "100%", textAlign: "left" }}
          >
            <NadpisSekcie pocet={zivych(x)}>
              <span style={{ display: "inline-block", width: 14 }}>{platbyRozbalene ? "▾" : "▸"}</span>{x.nadpis}
            </NadpisSekcie>
          </button>
          {platbyRozbalene && obsahKarty(x)}
        </div>
      )
      : (
        <div key={x.druh}>
          <NadpisSekcie pocet={zivych(x)}>{x.nadpis}</NadpisSekcie>
          {obsahKarty(x)}
        </div>
      )));
    /** Mesiac, ktorý sa zatvára — predošlý kalendárny (uzávierka je prvý víkend nového). */
    const mesiacUzavierky = (() => {
      const d = new Date();
      return new Date(Date.UTC(d.getFullYear(), d.getMonth() - 1, 1)).toISOString().slice(0, 7);
    })();
    if (k.krok === "dopyty") {
      const zdroje = (krokyUzavierky?.(mesiacUzavierky) || []).find((x) => x.id === "zdroje");
      const mena = ((zdroje?.focus as { skupina?: { mena?: string[] } } | undefined)?.skupina?.mena) || [];
      return (
        <KrokDopyty
          leads={(data.leads || []) as never}
          clients={clients}
          bezZdroja={{
            mena, mesiac: mesiacUzavierky,
            otvor: zdroje?.tab && onNavigate ? () => onNavigate(zdroje.tab as string, zdroje.sub, zdroje.focus as never) : undefined,
          }}
          onNavigate={onNavigate}
          onZmena={() => oznam("klienti")}
          VsetkyDopyty={<Dopyty leads={data.leads || []} clients={clients} refresh={async () => { oznam("klienti"); }} />}
        />
      );
    }
    if (k.krok === "uzavierka") {
      return (
        <>
        <KrokUzavierka
          mesiac={mesiacUzavierky}
          kroky={krokyUzavierky?.(mesiacUzavierky) || []}
          prekazky={prekazkyUzavierky?.(mesiacUzavierky) || []}
          onNavigate={onNavigate}
          trener={trenerKroku}
          onZmena={() => oznam("klienti")}
          uploadLog={data.uploadLog}
          reportVstup={reportUzavierky}
          obsahKroku={(() => {
            const mk = mesiacUzavierky;
            const nahravanie = (co: string, zameranie: "ptminder" | "metricool") => actions ? (
              <>
                <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 6 }}>{co}</div>
                <UploadCard bezBanky zameranie={zameranie} mesiacKroku={mk} data={data} missing={REPORTS.filter((r) => ((data[r.key] as unknown[]) || []).length === 0)} actions={actions} chat={chat} />
              </>
            ) : null;
            const upozornenia = (register || []).filter((r) => r.key.includes(mk) && !r.acked && r.category !== "Zápis");
            return {
              ptminder: nahravanie("Pretiahni sem exporty z PTmindera — appka sama pozná, ktorý report je ktorý.", "ptminder"),
              // Metricool sa sťahuje zeleným tlačidlom v riadku kroku (cez MCP,
              // 8. 10. 2026) — okno na CSV Jerry v ten istý deň zrušil.
              // Pohyby mesiaca na zaradenie (Jerry, 5. 10. 2026). Sťahuje sa
              // zeleným tlačidlom v riadku kroku; druhý import s dátumami bol
              // to isté ešte raz, tak je schovaný za odkazom (7. 10. 2026).
              fio: (
                <>
                  <BankaUlozene
                    uzavierka focus={{ month: mk, nonce: 1 }} pohybSplits={pohybSplits} onSplit={nastavPohybSplit}
                    onPlatby={() => {
                      const idx = zive.findIndex((x) => x.druh === "krok" && x.krok === "platby");
                      if (idx >= 0) setI(idx);
                    }}
                  />
                  <IneObdobieFio onHotovo={() => void actions?.refresh()} />
                </>
              ),
              zosit: <Zosit onZapisane={() => void actions?.refresh()} />,
              otazky: <OtazkyMesiaca mesiac={mk} ja={trenerKroku === "Terezka" ? "terezka" : trenerKroku === "Jerry" ? "jerry" : undefined} />,
              hotovostStav: <KamOdisliCard />,
              upozornenia: actions && onNavigate ? (
                upozornenia.length
                  ? <>{upozornenia.map((r) => <RegisterRow key={r.key} item={r} actions={actions} onNavigate={onNavigate as never} chat={chat} clients={clients} />)}</>
                  : <div style={{ fontSize: 12, color: C.green }}>Za tento mesiac je všetko vysvetlené.</div>
              ) : null,
            };
          })()}
        />
        {/* Všetky mesiace so zámkami (aj odomknutie) a podklady pre správu —
            predtým v Uploade; od 5. 10. 2026 je uzávierka len tu. */}
        {trenerKroku !== "Terezka" && (
          <div style={{ marginTop: 16 }}>
            <button onClick={() => setVsetkyMesiace((v) => !v)} aria-expanded={vsetkyMesiace}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: C.textMuted }}>
              {vsetkyMesiace ? "▾" : "▸"} Všetky mesiace — zamknutie, odomknutie, podklady pre správu
            </button>
            {vsetkyMesiace && (
              <div style={{ marginTop: 8 }}>
                <Uzavierky prekazky={prekazkyUzavierky} kroky={krokyUzavierky as never} podklady={podkladyUzavierky} onNavigate={onNavigate as never} chat={chat} />
              </div>
            )}
          </div>
        )}
        </>
      );
    }
    if (k.krok === "kontroly") {
      if (trenerKroku === "Terezka") return <VsetkoVybavene text="Mesačné kontroly sú Jerryho — tu nič nečaká." />;
      const kontroly = ritualy(new Date(), {}, {}).filter((r) => r.druh === "kontrola")
        .map((r) => ({ id: r.id, nadpis: r.nadpis, detail: r.detail, splatne: r.splatne, ciel: r.ciel }));
      return <KrokKontroly kontroly={kontroly} acks={data.anomalyAck || {}} onNavigate={onNavigate} onZmena={() => oznam("klienti")} />;
    }
    if (k.krok === "sms") {
      return (
        <>
          <KrokSms
            clients={clients} dlhy={dlhyPodlaMena} udalosti={kalUdalosti || []}
            balicky={balicky} platby={vlastnePlatby} trener={trenerKroku} onPocet={setPocetSms}
          />
          {/* Hromadná správa úplne dole, zabalená (Jerry, 5. 10. 2026: „pre
              všetkých klientov alebo pre tých, ktorých vyberiem"). */}
          <div style={{ marginTop: 16, padding: hromadna ? "10px 12px" : "6px 12px", borderRadius: 10,
            border: `1px solid ${hromadna ? mix(C.accent, 55) : mix(C.border, 70)}`, background: hromadna ? mix(C.accent, 6) : "transparent" }}>
            <button onClick={() => setHromadna((v) => !v)} aria-expanded={hromadna}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: C.text, textAlign: "left", width: "100%" }}>
              {hromadna ? "▾" : "▸"} Hromadná správa <span style={{ fontWeight: 500, fontSize: 12, color: C.textMuted }}>— všetkým alebo vybraným klientom</span>
            </button>
            {hromadna && <div style={{ marginTop: 10 }}><HromadnaSprava clients={clients} trener={trenerKroku} /></div>}
          </div>
        </>
      );
    }
    if (k.krok === "platby") {
      /**
       * PLATBY A BALÍČKY V JEDNOM KROKU (Jerry, 5. 10. 2026: „súhlas" so
       * zrušením samostatnej karty Balíčky). Balíčky vznikajú samy; ostali
       * len dve rozhodnutia — končiaca platnosť a „sedí?" po návrate — a obe
       * menia, čo klient dlží, takže patria k párovaniu platieb.
       */
      const autoOtazok = balicky.filter((b) => b.id && !b.zrusene_at && /^automaticky/i.test(String(b.poznamka || ""))
        && /návrat/i.test(String(b.poznamka || "")) && !data.anomalyAck?.[`balicek-sedi|${b.id}`]
        && (!trenerKroku || clients[b.klient]?.primaryTrainer === trenerKroku)).length;
      const platnostOtazok = platnost.filter((x) => !data.anomalyAck?.[`platnost|${x.meno}|${x.platnostDo}`]
        && (!trenerKroku || x.trener === trenerKroku)).length;
      const sumaOtazok = otazkyPlatieb(data.dlhy).filter((o) => !trenerKroku || clients[o.klient]?.primaryTrainer === trenerKroku).length;
      const prazdne = !sekcie.length && !autoOtazok && !platnostOtazok && !sumaOtazok;
      return (
        <>
          <FioPrijmy onZapisane={poZapise} />
          <OtazkyPlatieb dlhy={data.dlhy} balicky={balicky} platby={vlastnePlatby} trener={trenerKroku} clients={clients} onOpravene={poZapise} />
          {sekcieKresli}
          <KrokPlatnost polozky={platnost} acks={data.anomalyAck || {}} trener={trenerKroku} onVybavene={poZapise} onKlient={naStol} />
          <AutomatickeBalicky balicky={balicky} acks={data.anomalyAck || {}} clients={clients} trener={trenerKroku} onVybavene={poZapise} />
          {prazdne && <VsetkoVybavene text="Všetko vybavené — každá platba má klienta, nikto nedlží a o balíčkoch netreba nič rozhodnúť." />}
        </>
      );
    }
    // Vyťaženosť týždňa navrchu kroku Kalendár (naostro od 5. 10. 2026) —
    // vždy za seba: pri „všetko" za toho, kto je prihlásený. `key` je nutný:
    // bez neho si okno pri prepnutí Jerryho → Terezkine nechalo Jerryho
    // „zabalené" a Terezke nevyplnený týždeň neukázalo (5. 10. 2026).
    const kto = trenerKroku || trenerZPrihlasenia(ktoSom);
    return (
      <>
        {(kto === "Jerry" || kto === "Terezka") && <VytazenostTyzdna key={kto} kto={kto} udalosti={(kalUdalosti || []) as never} />}
        {sekcieKresli}
        {!sekcie.length && <VsetkoVybavene text="Všetko vybavené — kalendár nemá výnimky." />}
      </>
    );
  };

  return (
    // Celá šírka obrazovky, nie 1200 px ako zvyšok appky. Karta je pracovná
    // plocha — čím širšia, tým viac riadkov sa vybaví bez rolovania, a vpravo
    // zostane miesto na to, čo príde. Vylomenie z `maxWidth` rodiča je bežný
    // trik: 100vw a posun o polovicu rozdielu doľava.
    <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)", padding: "0 20px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        {/* NAVÁDZAČ KARIET — nekonečný rad (Jerry, 6. 10. 2026: „ide to
            dokola, vedľa Klienta je 1 · Kalendár… ako nekonečný rad").
            Klik na názov preskočí na kartu kratšou cestou. */}
        <NekonecnyRad
          polozky={zive.map((x) => ({
            kluc: x.druh === "krok" ? `krok|${x.krok}` : x.druh,
            nadpis: x.nadpis,
            pocet: x.druh === "krok" ? x.sekcie.reduce((a, y) => a + zostava(y), 0) : BEZ_FRONTY.includes(x.druh) ? 0 : zostava(x),
          }))}
          aktivna={Math.min(i, zive.length - 1)}
          onVyber={(j, smer) => prepni(smer, j)}
        />
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
        {/* KARTY OSTÁVAJÚ NAČÍTANÉ, NEAKTÍVNE SA LEN SKRYJÚ.
            Jerry, 5. 10. 2026: „nech na ktorejkoľvek karte robím čokoľvek —
            mám otvorený profil, píšem, vyberám — a prepnem zámerne alebo
            omylom doľava či doprava, po návrate mám byť presne tam, kde som
            skončil, so všetkým, čo som tam robil." Doteraz sa kreslila len
            aktívna karta a prepnutie zahodilo rozpísaný text, otvorený
            profil aj rolovanie. `visibility` (nie `display: none`) drží aj
            pozíciu rolovania. */}
        {zive.map((kk) => {
          const aktivna = kk === k;
          return (
        <div
          key={`${kk.druh}|${kk.druh === "krok" ? kk.krok : ""}`}
          aria-hidden={!aktivna}
          style={{
            position: "absolute", top: 0, bottom: 0, left: uzke ? 30 : 46, right: uzke ? 30 : 46,
            zIndex: aktivna ? 1 : 0, visibility: aktivna ? "visible" : "hidden",
            ...(aktivna ? pohybKarty(prechod) : {}),
          }}
        >
          <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{kk.nadpis}</div>
              {!BEZ_FRONTY.includes(kk.druh) && <div style={{ fontSize: 11.5, color: C.textMuted }}>{zostava(kk)} zostáva</div>}
            </div>
            <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 3 }}>
              {kk.podnadpis}
              {kk.druh === "krok" && kk.krok === "sms" && pocetSms != null ? ` · ${pocetSms} ${pocetSms === 1 ? "klient" : pocetSms < 5 ? "klienti" : "klientov"}` : ""}
            </div>

            <div style={{ marginTop: 14, flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {/* Zoznamy rolujú vnútri; karta klienta si výšku riadi sama —
                  ale LEN na monitore. Na telefóne idú jej stĺpce pod seba,
                  takže rolovať musí karta, inak sa spodok profilu nedá
                  dosiahnuť (Jerry, 30. 9. 2026). */}
              <div style={{ flexGrow: 1, minHeight: 0, overflowY: kk.druh === "editor" ? "hidden" : kk.druh === "klient" && !uzke ? "visible" : "auto", display: kk.druh === "klient" || kk.druh === "editor" ? "flex" : "block", flexDirection: "column" }}>
              {kk.druh === "krok" ? kresliKrok(kk) : obsahKarty(kk)}
              </div>
            </div>
            {aktivna && (
              <>
            <datalist id="ws-klienti">{mena.map((m) => <option key={m} value={m} />)}</datalist>
            {/* PONUKA BALÍČKA PO PRIRADENÍ PLATBY.
                Peniaze dorazili — appka navrhne, čo si klient zrejme kúpil,
                a zapíše to až na kliknutie. Vedľa toho rovno SMS, nech sa
                nemusí chodiť na stôl klienta. */}
            {ponukaBalicka && (
              <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: mix(C.green, 10), border: `1px solid ${mix(C.green, 40)}` }}>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
                  Platba sedí s <b>{ponukaBalicka.nazov}</b>
                  {ponukaBalicka.hodiny != null ? ` · ${ponukaBalicka.hodiny} h` : ""} za {fmtCZK(ponukaBalicka.cena)}
                  {" "}<span style={{ color: C.textDim }}>({ponukaBalicka.preco})</span>. Zapísať ho {ponukaBalicka.klient}?
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    onClick={() => void (async () => {
                      const telo = {
                        akcia: "pridaj", klient: ponukaBalicka.klient, nazov: ponukaBalicka.nazov,
                        hodiny: ponukaBalicka.hodiny ?? "", platnostOd: ponukaBalicka.platnostOd,
                        platnostDo: ponukaBalicka.platnostDo || "", cenaCzk: ponukaBalicka.cena,
                      };
                      let j = await posli("/api/balicky", telo).catch(() => ({ ok: false, error: "spojenie" }));
                      if (!j.ok && potvrdDruhyBalicek(j)) j = await posli("/api/balicky", { ...telo, ajTak: true }).catch(() => ({ ok: false, error: "spojenie" }));
                      if (!j.ok) { setChyba(j.error || "Balíček sa nepodarilo zapísať."); return; }
                      setHlaska(`Zapísané: ${ponukaBalicka.nazov} pre ${ponukaBalicka.klient}.`);
                      setPonukaBalicka(null);
                      oznam("peniaze");
                    })()}
                    style={{ ...tlacidloKarty, borderColor: mix(C.green, 45), color: C.green, fontWeight: 600 }}
                  >Zapísať balíček</button>
                  <SmsKlientovi
                    meno={ponukaBalicka.klient}
                    trener={clients[ponukaBalicka.klient]?.primaryTrainer || ""}
                    datum={fmtDMY(ponukaBalicka.platnostOd)}
                    maly
                  />
                  <button onClick={() => setPonukaBalicka(null)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    nie, nezapisovať
                  </button>
                </div>
              </div>
            )}
            {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{chyba}</div>}
            {/* Krok späť musí byť VIDNO — klávesová skratka, o ktorej nikto
                nevie, neexistuje. Zmizne, len čo sa odošle niečo ďalšie. */}
            {vratene && <div style={{ fontSize: 12, color: C.green, marginTop: 10 }}>{vratene}</div>}
            {krokSpat && !vratene && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: C.textMuted }}>
                <span>Odoslané{krokSpat.popis ? `: „${krokSpat.popis}"` : ""}.</span>
                <button
                  onClick={() => void vratKrok()}
                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 9px", fontFamily: "inherit", fontSize: 12, color: C.accentLight, cursor: "pointer" }}
                >
                  Späť (⌘Z)
                </button>
              </div>
            )}
            {hlaska && <div style={{ fontSize: 12, color: C.green, marginTop: 10 }}>{hlaska}</div>}
              </>
            )}
          </Card>
        </div>
          );
        })}
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

/** Tlačidlo v položke karty — rovnaké všade, nech kopa nevyzerá zlepená. */
const tlacidloKarty = {
  padding: "5px 11px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
} as const;

/**
 * Import s vlastnými dátumami alebo zo súboru — len na požiadanie. Bežný
 * mesiac stiahne zelené tlačidlo kroku. Rozrobený náhľad sa sám neotvára
 * (Jerrymu v ňom od 5. 10. visel starý výpis a panel kvôli nemu svietil
 * stále), ale odkaz povie, že tam je.
 */
function IneObdobieFio({ onHotovo }: { onHotovo: () => void }) {
  const [ukaz, setUkaz] = useState(false);
  const rozrobene = (() => {
    try { return !!localStorage.getItem("psb-banka-nahlad"); } catch { return false; }
  })();
  if (!ukaz) {
    return (
      <button onClick={() => setUkaz(true)} style={{ marginTop: 8, background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>
        stiahnuť iné obdobie alebo nahrať súbor z Fio{rozrobene ? " · máš tam rozrobený náhľad" : ""}
      </button>
    );
  }
  return <div style={{ marginTop: 10 }}><BankovyImport vstup="" onHotovo={onHotovo} /></div>;
}
