import { useContext, useEffect, useMemo, useState } from "react";

import { btcOznacenia, objednaneVerzia, kotvaDat, monthlyFinance, predictCash, predictEarnings, type ClientAgg } from "../../lib/psb/compute";
import { fetchBtcReserve, type BtcPlatba } from "../../lib/psb/client";
import { fmtCZK, monthLabel, normName } from "../../lib/psb/format";
import { ObdobieCtx } from "../../lib/psb/obdobie";
import { C, mix, S } from "../../lib/psb/theme";
import { pravidelneNaklady, predikciaNakladov, vzasVerzia } from "../../lib/psb/vzas";
import type { PSBData } from "../../lib/psb/types";
import type { NavFocus } from "./App";
import { BarRow, Card, Empty, H3, Info, LineChart, Select, SortTh, StatCard, SubTabs, TableWrap, useSort, ValueBars } from "./ui";

const MAX_SESSIONS_MONTH = 260;

// Obsah bývalej obrazovky Prevádzka → Financie. Záložky už kreslí VZAS
// („Peniaze") — dve finančné obrazovky boli dohodnuté na zlúčenie „po Fio,
// keď bude jasné, kde ktoré číslo býva". Fio je hotové a jasné je: tržby a
// predikcie z PTmindera bývajú TU, účtovníctvo (P&L, výplaty, dlhy) vo
// zvyšku VZAS. Jedna záložka Peniaze namiesto dvoch miest, medzi ktorými
// blúdil aj Jarvis.
export function FinancieObsah({ data, clients, focus, sub, onSub }: { data: PSBData; clients: Record<string, ClientAgg>; focus?: NavFocus | null; sub: string; onSub: (s: string) => void }) {
  const setSub = onSub;
  const [focusMonth, setFocusMonth] = useState<string | null>(null);
  // Po posledný plný mesiac. Rozrobený mesiac tu robil najväčšiu škodu:
  // v cashflow padal na dno, v priemeroch ťahal dole a v „najhorší mesiac"
  // vyhrával vždy — hoci nešlo o výsledok, ale o pár dní.
  const monthly = useMemo(() => {
    const k = kotvaDat(data);
    return monthlyFinance(data).filter((m) => !k.plny || m.month <= k.plny);
  }, [data]);

  // Deep-link from the Dashboard: jump to Mesačné zárobky and highlight one month.
  useEffect(() => {
    if (!focus?.month) return;
    setSub("trzby");
    setFocusMonth(focus.month);
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {sub === "trzby" && <Trzby monthly={monthly} data={data} clients={clients} focusMonth={focusMonth} onClearFocus={() => setFocusMonth(null)} />}
      {sub === "sedenia" && <Sedenia monthly={monthly} />}
      {sub === "predikcia" && <Predikcia data={data} clients={clients} />}
    </>
  );
}

const arrow = (mom: number | null) => (mom == null ? "►" : mom > 2 ? "▲" : mom < -2 ? "▼" : "►");
const arrowColor = (mom: number | null) => (mom == null ? C.textDim : mom > 2 ? C.green : mom < -2 ? C.red : C.textMuted);
type Monthly = ReturnType<typeof monthlyFinance>;

// ── shared period filter for the finance tabs ────────────────────────────────
// Rovnaké hodnoty ako vo VZAS, aby sa dali zdieľať. Predtým tu bolo „3/6/12"
// a vo VZAS „last6/last12/2025/2026" — tie isté otázky v dvoch jazykoch, takže
// sa nedalo prepnúť obdobie raz pre všetky peniaze.
// Štandard rodiny P — rovnaký zoznam ako vo zvyšku Peňazí.
const RANGE_OPTS = [
  { value: "all", label: "Celé obdobie" },
  { value: "2025", label: "2025" },
  { value: "2026", label: "2026" },
  { value: "last6", label: "Posledných 6 mes." },
  { value: "last3", label: "Posledné 3 mes." },
  { value: "last1", label: "Posledný mesiac" },
  { value: "custom", label: "Vlastné" },
];

function windowFilter<T extends { month: string }>(arr: T[], win: string, from: string, to: string): T[] {
  if (win === "custom") {
    let lo = from || arr[0]?.month || "";
    let hi = to || arr[arr.length - 1]?.month || "";
    if (lo > hi) [lo, hi] = [hi, lo]; // tolerate od > do
    return arr.filter((m) => m.month >= lo && m.month <= hi);
  }
  if (win === "last6") return arr.slice(-6);
  if (win === "last3") return arr.slice(-3);
  if (win === "last1") return arr.slice(-1);
  if (win === "last12") return arr.slice(-12); // legacy
  if (/^\d{4}$/.test(win)) return arr.filter((r) => r.month.startsWith(win));
  return arr;
}

function useMonthWindow() {
  const zdielane = useContext(ObdobieCtx);
  const [localWin, setLocalWin] = useState("2026");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Obdobie je spoločné pre celú appku; hranice pri „Vlastné" zostávajú lokálne
  // — sú to dve políčka, ktoré človek nastavuje pre konkrétnu tabuľku.
  const win = zdielane ? zdielane.obdobie : localWin;
  const setWin = zdielane ? zdielane.setObdobie : setLocalWin;
  return { win, setWin, from, setFrom, to, setTo };
}

// Dropdown row: Celé obdobie / Posledné N / Vlastné (+ from–to month pickers).
function RangeControls({ w, monthly }: { w: ReturnType<typeof useMonthWindow>; monthly: Monthly }) {
  const opts = monthly.map((m) => ({ value: m.month, label: monthLabel(m.month) }));
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Select value={w.win} onChange={w.setWin} options={RANGE_OPTS} />
      {w.win === "custom" && monthly.length > 0 && (
        <>
          <Select value={w.from || monthly[0].month} onChange={w.setFrom} options={opts} />
          <span style={{ color: C.textDim }}>–</span>
          <Select value={w.to || monthly[monthly.length - 1].month} onChange={w.setTo} options={opts} />
        </>
      )}
    </div>
  );
}
function BtcKontrola({ data }: { data: PSBData }) {
  const [stav, setStav] = useState<"nacitava" | "hotovo" | "chyba">("nacitava");
  const [platby, setPlatby] = useState<BtcPlatba[]>([]);
  useEffect(() => {
    let zivy = true;
    void fetchBtcReserve(true).then((r) => {
      if (!zivy) return;
      if (!r) { setStav("chyba"); return; }
      setPlatby(r.platby || []);
      setStav("hotovo");
    });
    return () => { zivy = false; };
  }, []);

  const porovnanie = useMemo(() => {
    // Jedna platba môže prísť vo viacerých prevodoch — Krčmár poslal 77 tisíc
    // v štyroch kusoch za dva dni. Porovnávať transakciu proti transakcii preto
    // vyrába falošné poplachy; porovnávajú sa ZHLUKY: čo od jedného klienta
    // prišlo v rozpätí pár dní, je jedna platba.
    const OKNO_DNI = 4;        // čo prišlo od jedného klienta do 4 dní, je jedna platba
    // Na spárovanie treba širšie okno než na zhlukovanie: zápis v PTminderi a
    // pohyb v bitcoine sa bežne líšia o niekoľko dní (Gažo — bitcoin 12. 2.,
    // zápis 4. 2.). Desať dní je stále bezpečných, lebo aj mesačný klient platí
    // s odstupom tridsiatich.
    const OKNO_PAROVANIA = 10;
    const TOLERANCIA_KC = 400;
    const TOLERANCIA_PCT = 0.03;   // pri veľkých sumách rozhoduje kurz, nie koruny

    // Mená sa medzi appkami líšia diakritikou aj preklepmi („Prochádzka" vs
    // „Prochadzka"), takže presná zhoda nestačí.
    const kluc = (m: string) => {
      const n = normName(m).split(" ").filter(Boolean);
      const priez = n[n.length - 1] || "";
      return `${priez.slice(0, 5)}|${(n[0] || "").slice(0, 3)}`;
    };

    type Zhluk = { kluc: string; meno: string; od: number; suma: number };
    const zhlukni = <T,>(polozky: T[], meno: (x: T) => string, datum: (x: T) => number, suma: (x: T) => number): Zhluk[] => {
      const podlaKlienta: Record<string, T[]> = {};
      for (const x of polozky) (podlaKlienta[kluc(meno(x))] ||= []).push(x);
      const out: Zhluk[] = [];
      for (const [k, zoz] of Object.entries(podlaKlienta)) {
        const zoradene = [...zoz].sort((a, b) => datum(a) - datum(b));
        let akt: Zhluk | null = null;
        for (const x of zoradene) {
          const d = datum(x);
          if (akt && (d - akt.od) / 86400000 <= OKNO_DNI) akt.suma += suma(x);
          else { akt = { kluc: k, meno: meno(x), od: d, suma: suma(x) }; out.push(akt); }
        }
      }
      return out;
    };

    const btc = zhlukni(
      platby.filter((b) => b.klient && b.czk != null),
      (b) => b.klient as string, (b) => new Date(b.datum).getTime(), (b) => b.czk as number,
    );
    const pt = zhlukni(
      data.payments.filter((p) => p.amount > 0),
      (p) => p.client, (p) => new Date(p.date).getTime(), (p) => p.amount,
    );

    const pouzite = new Set<number>();
    const nesedi: { text: string; tone: string }[] = [];
    const ciastocne: string[] = [];
    let sedi = 0;
    for (const b of btc) {
      let najdene = -1;
      for (let i = 0; i < pt.length; i++) {
        if (pouzite.has(i) || pt[i].kluc !== b.kluc) continue;
        if (Math.abs(pt[i].od - b.od) / 86400000 > OKNO_PAROVANIA) continue;
        najdene = i;
        break;
      }
      const den = new Date(b.od).toISOString().slice(0, 10);
      if (najdene < 0) {
        nesedi.push({ tone: "orange", text: `«${b.meno}» ${fmtCZK(b.suma)} z ${den} — v BTC appke je, v PTminderi nie` });
        continue;
      }
      pouzite.add(najdene);
      const rozdiel = pt[najdene].suma - b.suma;
      const limit = Math.max(TOLERANCIA_KC, b.suma * TOLERANCIA_PCT);
      // Asymetria je zámerná. Keď je v PTminderi VIAC než v BTC appke, klient
      // zaplatil časť inak — Lukáš Kríž platil na dvakrát a v bitcoine bola len
      // časť. To nie je nezrovnalosť, to je bežná vec, a hlásiť ju ako problém
      // by kartu zaplnilo šumom. Opačný smer je vážny: peniaze dorazili a
      // v PTminderi po nich nie je stopa.
      if (rozdiel > limit) {
        ciastocne.push(`«${b.meno}» ${den}: v BTC ${fmtCZK(b.suma)} z ${fmtCZK(pt[najdene].suma)} — zvyšok inou cestou`);
        sedi++;
      } else if (-rozdiel > limit) {
        nesedi.push({ tone: "orange", text: `«${b.meno}» ${den}: BTC appka ${fmtCZK(b.suma)} vs PTminder ${fmtCZK(pt[najdene].suma)} — v BTC prišlo o ${fmtCZK(-rozdiel)} VIAC` });
      } else sedi++;
    }
    return { sedi, nesedi, ciastocne, spolu: btc.length };
  }, [platby, data.payments]);

  // Poistka z 11. 8.: platba, ktorá sa spáruje s BTC knihou, ale v PTminderi
  // má „bank" alebo „cash" (Kaňovský 1. 7. — klik pri zápise). Štatistiky si
  // ju preraďujú samy, ale zdroj má byť opravený pri zdroji — preto sa tu
  // hlási, kým ju Jerry v PTminderi nepreklikne na other.
  const zleOznacene = useMemo(() => btcOznacenia(data.payments, platby).zleOznacene, [data.payments, platby]);

  return (
    <Card>
      <H3><Info text="Porovnáva bitcoinové platby zapísané v appke prosapiens-btc s platbami v PTminderi. Zdrojom pravdy o tržbách zostáva PTminder — toto je len kontrola, či niečo nechýba. Tolerancia sú 4 dni a 400 Kč: kurz medzi okamihom platby a prepočtom sa vždy trochu líši. Rozdiel nemusí znamenať chybu — do uzávierky (prvý víkend nasledujúceho mesiaca) nemusí byť platba ešte zapísaná. Platby označené v PTminderi ako účet/hotovosť, ktoré sa spárujú s BTC knihou, štatistiky preraďujú na bitcoin samy — tu sa hlásia, aby sa dal PTminder opraviť pri zdroji." label="Kontrola bitcoinových platieb" /></H3>
      {stav === "nacitava" && <div style={{ fontSize: 12.5, color: C.textDim, padding: "6px 0" }}>Načítavam z BTC appky…</div>}
      {stav === "chyba" && <Empty>BTC appka neodpovedala. Skús obnoviť stránku.</Empty>}
      {stav === "hotovo" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 6px" }}>
            <StatCard value={String(porovnanie.spolu)} label="BTC platieb (zhlukov)" color={C.blue} />
            <StatCard value={String(porovnanie.sedi)} label="Sedí s PTminderom" color={C.green} />
            <StatCard value={String(porovnanie.nesedi.length)} label="Na pozretie" color={porovnanie.nesedi.length ? C.orange : C.textMuted} />
          </div>
          {porovnanie.nesedi.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {porovnanie.nesedi.map((n, i) => (
                <div key={i} style={{ padding: "8px 11px", borderRadius: 8, background: n.tone === "orange" ? C.orangeBg : C.blueBg, fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{n.text}</div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 8 }}>Všetky bitcoinové platby sedia s PTminderom 🌿</div>
          )}
          {zleOznacene.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {zleOznacene.map((z, i) => (
                <div key={i} style={{ padding: "8px 11px", borderRadius: 8, background: C.orangeBg, fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>
                  «{z.meno}» {fmtCZK(z.suma)} z {z.datum} — prišla bitcoinom, ale v PTminderi je označená ako {z.metoda === "bank" ? "účet" : "hotovosť"}. Štatistiky ju už rátajú ako bitcoin; preklikni ju v PTminderi na „other", nech sedí aj zdroj.
                </div>
              ))}
            </div>
          )}
          {porovnanie.ciastocne.length > 0 && (
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 10, lineHeight: 1.55 }}>
              <b>Čiastočne v bitcoine</b> (zvyšok prišiel inou cestou — nie je to chyba):{" "}
              {porovnanie.ciastocne.join(" · ")}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// Jeden kanonický pohľad na peniaze dnu.
//
// Boli tu dve takmer rovnaké obrazovky — „Mesačné zárobky" a „Tržby" — líšili sa
// jedným poľom v tom istom grafe a tej istej tabuľke. Dve odpovede na otázku
// „koľko sme zarobili" znamenali, že sa človek musel najprv rozhodnúť, ktorú
// otvoriť, a potom si pamätať, ktorú vlastne vidí. Teraz je to jedna obrazovka
// s prepínačom; rozdiel medzi prijatým a vyfakturovaným je vysvetlený na mieste,
// nie schovaný do názvu záložky.
function Trzby({ monthly, data, clients, focusMonth, onClearFocus }: { monthly: Monthly; data: PSBData; clients: Record<string, ClientAgg>; focusMonth?: string | null; onClearFocus?: () => void }) {
  const [rezim, setRezim] = useState<"prijate" | "vyfakturovane">("prijate");
  // Najnovší mesiac hore — človek chce vidieť, kde je teraz, nie kde bol
  // pred rokom. Zoradenie sa dá kliknutím na hlavičku obrátiť.
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "desc" });
  const w = useMonthWindow();
  const withMom = useMemo(
    () =>
      monthly.map((m, i) => {
        const prev = monthly[i - 1];
        const mom = prev && prev.cash ? ((m.cash - prev.cash) / prev.cash) * 100 : null;
        return { ...m, mom };
      }),
    [monthly],
  );
  const view = useMemo(() => windowFilter(withMom, w.win, w.from, w.to), [withMom, w.win, w.from, w.to]);
  const rows = sorted(view, {
    month: (m) => m.month,
    cash: (m) => m.cash,
    revenue: (m) => m.revenue,
    jerry: (m) => m.byTrainer["Jerry"]?.revenue || 0,
    terezka: (m) => m.byTrainer["Terezka"]?.revenue || 0,
    sessions: (m) => m.sessions,
    mom: (m) => m.mom ?? -999,
  });
  const chart = view.map((m) => ({ label: monthLabel(m.month), value: rezim === "prijate" ? m.cash : m.revenue }));

  // Súhrn za zvolené obdobie.
  const totalCash = view.reduce((a, m) => a + m.cash, 0);
  const totalRev = view.reduce((a, m) => a + m.revenue, 0);

  // Trailing-average forecast — vždy z celej histórie (výhľad dopredu, nezávislý od filtra).
  const cashVals = monthly.map((m) => m.cash);
  const avgOf = (n: number) => {
    const s = cashVals.slice(-n);
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
  };
  const avg3 = avgOf(3), avg6 = avgOf(6), avg12 = avgOf(12);
  // Predikcia z obnov členstiev — priemery zostávajú ako porovnanie, ale hlavné
  // číslo je teraz bodový odhad: kto má kedy skončiť členstvo a koľko naposledy
  // zaplatil.
  // `objednaneVerzia()` v deps: predikcia číta objednané hodiny z kalendára,
  // ktoré prídu async — bez verzie by obrazovka počítala bez nich.
  const cashPred = useMemo(() => predictCash(data, clients, 1), [data, clients, objednaneVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps
  const buduci = cashPred.months[0];

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <H3>
            <Info text="PRIJATÉ = peniaze, ktoré reálne prišli za mesiac (report Payments Recorded) — presne to, čo v PTminderi vidíš ako Payments. Skáče, keď si niekto kúpi väčší balíček dopredu. VYFAKTUROVANÉ = hodnota odtrénovaných sedení za mesiac (Payroll by Session), teda koľko práce sa naozaj odviedlo. Tie dve čísla sa nemajú rovnať a ani jedno nie je „správnejšie“ — prijaté hovoria o cashflowe, vyfakturované o práci. Delenie na trénerov má zmysel len pri vyfakturovanom; platba trénera nemá." label="Peniaze po mesiacoch" />
          </H3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 3 }}>
              {([["prijate", "Prijaté (tržby)"], ["vyfakturovane", "Vyfakturované"]] as const).map(([id, lbl]) => (
                <button key={id} onClick={() => setRezim(id)} style={{ padding: "5px 11px", borderRadius: 7, border: `1px solid ${rezim === id ? C.accent : C.border}`, background: rezim === id ? C.accentBg : "transparent", color: rezim === id ? C.accentLight : C.textMuted, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap" }}>{lbl}</button>
              ))}
            </div>
            <RangeControls w={w} monthly={monthly} />
          </div>
        </div>
        {chart.length ? <ValueBars data={chart} color={rezim === "prijate" ? C.blue : C.accent} fmt={(n) => `${Math.round(n / 1000)}k`} height={180} alignEnd /> : <Empty>Žiadne dáta pre zvolené obdobie.</Empty>}
      </Card>

      {view.length > 0 && (
        <Card>
          <H3>
            <Info text="Súčet za zvolené obdobie (podľa filtra vpravo hore): prijaté platby (report Payments) aj vyfakturované zárobky (hodnota odtrénovaných sedení)." label="Súhrn tržieb (za zvolené obdobie)" />
          </H3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 6px" }}>
            <StatCard value={fmtCZK(totalCash)} label={`Prijaté spolu · ${view.length} mes.`} color={C.blue} />
            <StatCard value={fmtCZK(totalCash / (view.length || 1))} label="Ø prijaté / mesiac" color={C.accent} />
            <StatCard value={fmtCZK(totalRev)} label="Vyfakturované spolu" color={C.accentLight} />
          </div>
        </Card>
      )}

      {monthly.length > 0 && (
        <Card>
          <H3>
            <Info text="Peniaze nechodia podľa kalendára, ale keď klientovi dôjdu hodiny. Šesťhodinový balíček s dvojmesačnou platnosťou minie človek chodiaci raz týždenne za šesť týždňov — a vtedy platí znova. Odhad preto ide klient po klientovi: ZOSTATOK hodín delený jeho tempom za posledných 90 dní = o koľko týždňov dôjdu; platnosť členstva je len strop, po ktorom hodiny prepadnú. Suma sa berie z jeho POSLEDNEJ platby (nesie v sebe jeho zľavy — bitcoin, referral, Jarek), počet kúpených hodín z jej výšky, nie z názvu balíčka. Dôvera zohľadňuje pravidelnosť dochádzky: kto chodí poctivo, minie hodiny naozaj v odhadovanom čase; kto chodil ledabolo, to isté rozťahuje. Kto mlčí 30+ dní, má polovičnú. Priemery vedľa ukazujú, čo bolo, nie čo príde." label={`Odhad tržieb — ${monthLabel(buduci?.month || "")}`} />
          </H3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 6px" }}>
            <StatCard value={fmtCZK(buduci?.expected || 0)} label={`Odhad · ${monthLabel(buduci?.month || "")}`} color={C.green} />
            <StatCard value={`${fmtCZK(buduci?.lo || 0)} – ${fmtCZK(buduci?.hi || 0)}`} label="Rozpätie" color={C.accentLight} />
            <StatCard value={fmtCZK(avg3)} label="Ø posledné 3 mes." color={C.blue} />
            <StatCard value={fmtCZK(avg12)} label="Ø celé obdobie" color={C.textMuted} />
          </div>
          {cashPred.perClient.length > 0 && (
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 1.55 }}>
              Najväčšie očakávané obnovy: {cashPred.perClient.slice(0, 5).map((x) => `«${x.name}» ${fmtCZK(x.suma)} v ${monthLabel(x.kedy)} — dochodí zostatok o ~${x.tyzdnov} týž. (${Math.round(x.confidence * 100)} %)`).join(" · ")}
            </div>
          )}
        </Card>
      )}

      <BtcKontrola data={data} />

      <Card>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>Zdroj: Payments Recorded (prijaté) a Payroll by Session (vyfakturované, aj rozpis po trénerovi). Sedenia za 0 Kč sa počítajú do počtu, nie do súm.</div>
        {focusMonth && (
          <div style={{ marginBottom: 10 }}>
            <button onClick={onClearFocus} style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "5px 10px", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>
              Vybraný mesiac: {monthLabel(focusMonth)} ✕
            </button>
          </div>
        )}
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Mesiac" sortKey="month" sort={sort} onSort={toggle} />
              <SortTh label="Prijaté (tržby)" sortKey="cash" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Vyfakturované" sortKey="revenue" sort={sort} onSort={toggle} align="right" info="Hodnota odtrénovaných sedení za mesiac." />
              <SortTh label="Jerry" sortKey="jerry" sort={sort} onSort={toggle} align="right" info="Vyfakturované — platby sa na trénerov nedelia." />
              <SortTh label="Terezka" sortKey="terezka" sort={sort} onSort={toggle} align="right" info="Vyfakturované — platby sa na trénerov nedelia." />
              <SortTh label="Sedení" sortKey="sessions" sort={sort} onSort={toggle} align="right" />
              <SortTh label="MoM %" sortKey="mom" sort={sort} onSort={toggle} align="right" info="Zmena prijatých tržieb oproti predošlému mesiacu." />
            </tr>
          </thead>
          <tbody>
            {(focusMonth ? rows.filter((m) => m.month === focusMonth) : rows).map((m) => (
              <tr key={m.month}>
                <td style={S.td}>{monthLabel(m.month)}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.blue }}>{fmtCZK(m.cash)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.accentLight }}>{fmtCZK(m.revenue)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{fmtCZK(m.byTrainer["Jerry"]?.revenue || 0)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{fmtCZK(m.byTrainer["Terezka"]?.revenue || 0)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{m.sessions}</td>
                <td style={{ ...S.td, textAlign: "right", color: arrowColor(m.mom) }}>{m.mom == null ? "—" : `${arrow(m.mom)} ${m.mom.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!monthly.length && <Empty>Nahraj Payments Recorded CSV.</Empty>}
      </Card>
    </>
  );
}

function Sedenia({ monthly }: { monthly: Monthly }) {
  // Najnovší mesiac hore — človek chce vidieť, kde je teraz, nie kde bol
  // pred rokom. Zoradenie sa dá kliknutím na hlavičku obrátiť.
  const { sort, toggle, sorted } = useSort({ key: "month", dir: "desc" });
  const w = useMonthWindow();
  const view = useMemo(() => windowFilter(monthly, w.win, w.from, w.to), [monthly, w.win, w.from, w.to]);
  // Ø cena sedenia = PRIJATÉ PENIAZE ÷ sedenia, nie cena zapísaná pri sedení
  // (tá je pri 19 % sedení nulová — platba visí na balíčku). Rovnaká definícia
  // ako na Kokpite, v Klientoch aj v Tréningoch; do 11. 8. tu bola iná
  // a tá istá vec ukazovala na štyroch obrazovkách štyri čísla.
  const rows = sorted(
    view.map((m) => ({ ...m, perSess: m.sessions ? m.cash / m.sessions : 0, util: (m.sessions / MAX_SESSIONS_MONTH) * 100 })),
    { month: (m) => m.month, sessions: (m) => m.sessions, revenue: (m) => m.revenue, perSess: (m) => m.perSess, util: (m) => m.util },
  );
  const chart = view.map((m) => ({ label: monthLabel(m.month), value: m.sessions }));
  // Súhrn za zvolené obdobie.
  const sessTotal = view.reduce((a, m) => a + m.sessions, 0);
  const cashTotal = view.reduce((a, m) => a + m.cash, 0);
  const avgSess = view.length ? sessTotal / view.length : 0;
  const perSessAll = sessTotal ? cashTotal / sessTotal : 0;
  const avgUtil = view.length ? view.reduce((a, m) => a + (m.sessions / MAX_SESSIONS_MONTH) * 100, 0) / view.length : 0;
  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <H3>Počet sedení / mesiac</H3>
          <RangeControls w={w} monthly={monthly} />
        </div>
        {chart.length ? <ValueBars data={chart} color={C.accent} fmt={(n) => String(Math.round(n))} height={150} alignEnd /> : <Empty>Žiadne dáta pre zvolené obdobie.</Empty>}
      </Card>

      {view.length > 0 && (
        <Card>
          <H3>
            <Info text="Súhrn za zvolené obdobie (podľa filtra vpravo hore): spolu sedení, priemer na mesiac, priemerná cena za sedenie (PRIJATÉ PENIAZE ÷ sedenia — nie cena zapísaná pri sedení, tá je pri 19 % sedení nulová, lebo platba visí na balíčku) a priemerné využitie kapacity (z max. 260 sedení/mes. pre 2 trénerov)." label="Súhrn sedení (za zvolené obdobie)" />
          </H3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "12px 0 6px" }}>
            <StatCard value={String(sessTotal)} label={`Sedení spolu · ${view.length} mes.`} color={C.accentLight} />
            <StatCard value={avgSess.toFixed(0)} label="Ø sedení / mesiac" color={C.accent} />
            <StatCard value={fmtCZK(perSessAll)} label="Ø CZK / sedenie" color={C.blue} />
            <StatCard value={`${avgUtil.toFixed(0)} %`} label="Ø využitie kapacity" color={C.green} />
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Prijaté spolu za obdobie: {fmtCZK(cashTotal)}</div>
        </Card>
      )}
      <Card>
        <H3>Cena za sedenie a využitie kapacity</H3>
        <TableWrap>
          <thead>
            <tr>
              <SortTh label="Mesiac" sortKey="month" sort={sort} onSort={toggle} />
              <SortTh label="Sedení" sortKey="sessions" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Zárobky" sortKey="revenue" sort={sort} onSort={toggle} align="right" />
              <SortTh label="CZK/sedenie" sortKey="perSess" sort={sort} onSort={toggle} align="right" />
              <SortTh label="Využitie kapacity" sortKey="util" sort={sort} onSort={toggle} align="right" info="Podiel z teoretického maxima 260 sedení/mesiac pre 2 trénerov." />
              <th style={S.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.month}>
                <td style={S.td}>{monthLabel(m.month)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{m.sessions}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(m.revenue)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(m.perSess)}</td>
                <td style={{ ...S.td, textAlign: "right" }}>{m.util.toFixed(0)}%</td>
                <td style={{ ...S.td, color: m.util >= 40 ? C.green : C.orange }}>{m.util >= 40 ? "Zdravá" : "Slabšia"}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!monthly.length && <Empty>Nahraj Payroll by Session CSV.</Empty>}
      </Card>
    </>
  );
}

function Predikcia({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [excludeSpecial, setExcludeSpecial] = useState(false);
  // Jeden mesiac, natvrdo. Jerry: „predikcia tržieb je hlavný prístroj, jedno
  // mesačné číslo, čo najpresnejšie — kvartál ma nezaujíma." Trojmesačný
  // horizont pritom nebol len navyše, bol horší: čím ďalej sa strieľa, tým viac
  // je v čísle domnienok, a tri mesiace sa opierali o obnovy, ktoré sa ešte
  // nestali. Číslo vyzeralo presnejšie, než bolo.
  const horizon = 1;
  const [tempoUnit, setTempoUnit] = useState<"mes" | "tyz">("mes");
  const [trainerF, setTrainerF] = useState("all");
  const { sort, toggle, sorted } = useSort({ key: "monthlyRevenue", dir: "desc" });
  const pred = useMemo(() => predictEarnings(data, clients, { excludeSpecial, horizon }), [data, clients, excludeSpecial, horizon]);
  // JEDEN model tržieb pre celú appku (Jerry, 9. 8.): obnovy z balíčkov +
  // objednané hodiny z kalendára — to isté číslo, čo ukazuje dlaždica Odhad
  // tržieb na Kokpite. Scenárové čísla z predictEarnings tu stáli vedľa neho
  // a september mal zrazu dve rôzne hodnoty; predictEarnings ďalej slúži len
  // run-rate a tabuľke Detail podľa klienta (tempo, cena, dôvera).
  const cashP = useMemo(() => predictCash(data, clients, 1), [data, clients, objednaneVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps
  const cashM = cashP.months[0];
  const perClientF = useMemo(() => (trainerF === "all" ? pred.perClient : pred.perClient.filter((c) => c.trainer === trainerF)), [pred.perClient, trainerF]);
  const rows = sorted(perClientF, {
    name: (c) => c.name,
    trainer: (c) => c.trainer,
    remaining: (c) => c.remaining,
    tempo: (c) => c.burnRate,
    monthlyRevenue: (c) => c.monthlyRevenue,
    confidence: (c) => c.confidence,
  });
  // Očakávané odrobené hodiny podľa trénera — z tempa klientov (sedení za
  // mesiac). Sedenie je hodina, takže tempo je priamo počet hodín. Slúži na
  // odhad výplat: mzda nie je fixný náklad, závisí od odrobených hodín.
  const hodinyOdhad = useMemo(() => {
    const out = { jerry: 0, terezka: 0 };
    for (const c of pred.perClient) {
      if (c.trainer === "Jerry") out.jerry += c.burnRate;
      else if (c.trainer === "Terezka") out.terezka += c.burnRate;
    }
    return out;
  }, [pred.perClient]);
  const hasData = pred.perClient.length > 0;
  const monthsCovered = pred.months.length ? monthLabel(pred.months[0].month) : "budúci mesiac";

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <H3>
            <Info
              text="Model obnov členstiev: pre každého klienta sa z tempa (posledných 90 dní + objednané v kalendári) a zostatku spočíta, KEDY dochodí zaplatené hodiny, a vtedy sa čaká platba vo výške tej poslednej, vážená dôverou obnovy. Negatívny/realistický/optimistický = pásma dôvery. Jediný model tržieb v appke — rovnaké číslo ukazuje Kokpit."
              label={`Predikcia tržieb — ${monthsCovered}`}
            />
          </H3>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: C.textMuted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={excludeSpecial} onChange={(e) => setExcludeSpecial(e.target.checked)} style={{ accentColor: C.accent }} />
              Bez špeciálnych sadzieb
            </label>
          </div>
        </div>

        {/* Tri scenáre sú JEDNA predikcia v troch pásmach — líšia sa len tým,
            koľkým klientom sa verí obnova. Run-rate je iná veličina (tempo, nie
            predpoveď), preto stojí zvlášť pod nimi a nie ako štvrtý scenár:
            postavený vedľa nich vyzeral ako ďalší odhad a mýlil. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "14px 0 6px" }}>
          <StatCard value={fmtCZK(cashM?.lo ?? 0)} label={`Negatívny · ${monthsCovered}`} color={C.orange} />
          <StatCard value={fmtCZK(cashM?.expected ?? 0)} label={`Realistický · ${monthsCovered}`} color={C.accentLight} />
          <StatCard value={fmtCZK(cashM?.hi ?? 0)} label={`Optimistický · ${monthsCovered}`} color={C.green} />
        </div>
        {hasData && (
          <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.55, margin: "2px 0 12px" }}>
            Tri čísla, jedna predikcia — model obnov: kto kedy dochodí zaplatené hodiny
            (vrátane objednaného v kalendári) a koľko naposledy zaplatil. Pásma sa líšia len
            vierou v obnovu: negatívny −20 %, optimistický +15 %. <b style={{ color: C.accentLight }}>Realistický ({fmtCZK(cashM?.expected ?? 0)})</b> je
            to isté číslo ako dlaždica Odhad tržieb na Kokpite a ide ďalej do zisku pod týmto.
          </div>
        )}

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "center" }}>
          <StatCard value={fmtCZK(pred.monthlyRunRate)} label={<Info text="Run-rate = koľko mesačne hodí portfólio, ak klienti chodia ako TERAZ. Tempo sa berie z posledných 90 dní, cena z reálne zaplatených sedení (sedenia za 0 Kč sa počítajú do práce, nie do tržieb). Pred vážením dôverou obnovy. POZOR na rozdiel oproti priemeru posledných 3 mesiacov: ten obsahuje aj klientov, ktorí medzitým prestali chodiť. K 2. 8. 2026 to bolo 15 klientov a 26 736 Kč mesačne — presne o toľko je run-rate nižší. Nie je to pesimizmus modelu, je to odchod, ktorý sa už stal." label="Očak. mesačný run-rate" />} color={C.blue} />
          {hasData && (
            <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.55 }}>
              Nie je to štvrtý scenár. Run-rate hovorí, čo portfólio hádže <b>dnes</b>, keby nikto
              neodišiel — preto býva {pred.monthlyRunRate > (cashM?.expected ?? 0) ? "vyšší" : "porovnateľný"} než
              realistický odhad, ktorý už odpočítava riziko neobnovenia.
              {pred.monthlyRunRate > (cashM?.expected ?? 0) && (
                <> Rozdiel <b>{fmtCZK(pred.monthlyRunRate - (cashM?.expected ?? 0))}</b> je cena rizika, že sa balíčky neobnovia.</>
              )}
            </div>
          )}
        </div>
        {!hasData && <Empty>Nahraj Payroll + Packages & Memberships CSV pre predikciu.</Empty>}
      </Card>

      <PredikciaZisku prijmyOdhad={cashM?.expected ?? 0} mesiac={monthsCovered} hodiny={hodinyOdhad} />

      {hasData && (
        <Card id="tempo-klienta">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <H3>Detail podľa klienta</H3>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Select value={trainerF} onChange={setTrainerF} options={[
                { value: "all", label: "Obaja tréneri" },
                { value: "Jerry", label: "Jerry" },
                { value: "Terezka", label: "Terezka" },
              ]} />
              <div style={{ display: "flex", gap: 4 }}>
              {(["mes", "tyz"] as const).map((u) => (
                <button key={u} onClick={() => setTempoUnit(u)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${tempoUnit === u ? C.accent : C.border}`, background: tempoUnit === u ? C.accentBg : "transparent", color: tempoUnit === u ? C.accentLight : C.textMuted, fontSize: 11, cursor: "pointer" }}>
                  tempo/{u === "mes" ? "mes." : "týž."}
                </button>
              ))}
              </div>
            </div>
          </div>
          <TableWrap>
            <thead>
              <tr>
                <SortTh label="Klient" sortKey="name" sort={sort} onSort={toggle} />
                <SortTh label="Tréner" sortKey="trainer" sort={sort} onSort={toggle} />
                <SortTh label="Zostatok" sortKey="remaining" sort={sort} onSort={toggle} align="right" info="Zostatok sedení z reportu Packages & Memberships. „—“ = nie je tam (napr. platí mesačne)." />
                <SortTh label={`Tempo/${tempoUnit === "mes" ? "mes." : "týž."}`} sortKey="tempo" sort={sort} onSort={toggle} align="right" info="Priemerný počet sedení za dané obdobie z histórie klienta." />
                <SortTh label="Ø mes. príjem" sortKey="monthlyRevenue" sort={sort} onSort={toggle} align="right" info="Očakávaný mesačný príjem = tempo × priemerná cena sedenia." />
                <SortTh label="Dôvera obnovy" sortKey="confidence" sort={sort} onSort={toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map((c) => (
                <tr key={c.name}>
                  <td style={{ ...S.td, fontWeight: 500 }}>{c.name}</td>
                  <td style={S.td}>{c.trainer}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{c.remaining || "—"}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{(tempoUnit === "mes" ? c.burnRate : c.burnWeek).toFixed(1)}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{fmtCZK(c.monthlyRevenue)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: c.confidence >= 0.8 ? C.green : c.confidence >= 0.5 ? C.orange : C.red }}>{(c.confidence * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}
    </>
  );
}

// ── Predikcia nákladov, výplat a zisku ──────────────────────────────────────
//
// Tržby sa dajú predpovedať z konkrétnych klientov — príjem má meno a dátum.
// Náklady také nie sú, a to je dôvod, prečo tu doteraz neboli: nájom a
// aplikácie sa opakujú, ale nový notebook sa predvídať nedá. Preto sa nepočíta
// priemer (jeden mesiac s vybavením za 48 000 by zdvihol odhad na celý rok),
// ale MEDIÁN posledných šiestich mesiacov — ten výkyv ignoruje.
function PredikciaZisku({ prijmyOdhad, mesiac, hodiny }: { prijmyOdhad: number; mesiac: string; hodiny: { jerry: number; terezka: number } }) {
  const [otvorene, setOtvorene] = useState(false);
  const p = useMemo(() => predikciaNakladov(1, {}, hodiny), [vzasVerzia(), hodiny]); // eslint-disable-line react-hooks/exhaustive-deps
  const pravidelne = useMemo(() => pravidelneNaklady(), [vzasVerzia()]); // eslint-disable-line react-hooks/exhaustive-deps
  // Karta sa nikdy nestratí bez vysvetlenia. Keď nie je z čoho počítať, povie
  // to — prázdne miesto na obrazovke vyzerá ako chyba appky, aj keď je to len
  // chýbajúci vstup.
  if (!p.mesiace.length || !p.zaklad) {
    return (
      <Card>
        <H3>Predikcia nákladov a zisku</H3>
        <Empty>
          Zatiaľ nie je z čoho počítať — treba aspoň jeden mesiac s nákladmi.
          Nahraj bankový výpis v Údajoch a odhad sa objaví sám.
        </Empty>
      </Card>
    );
  }
  const m = p.mesiace[0];
  const zisk = prijmyOdhad - m.naklady - m.vyplaty;

  return (
    <Card>
      <H3>
        <Info
          label={`Predikcia nákladov a zisku — ${mesiac}`}
          text="Náklady a výplaty sa odhadujú z mediánu posledných šiestich mesiacov, nie z priemeru: jeden mesiac s väčším nákupom by priemer zdvihol na celý rok, medián ho ignoruje. Tržby prichádzajú z realistického scenára hore, ktorý pozná konkrétnych klientov a ich obnovy. Odhad zisku je teda presný natoľko, nakoľko je typický nasledujúci mesiac."
        />
      </H3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "14px 0 6px" }}>
        <StatCard value={fmtCZK(prijmyOdhad)} label="Tržby (realistický)" color={C.green} />
        <StatCard value={fmtCZK(m.naklady)} label="Prevádzkové náklady" color={C.orange} />
        <StatCard
          value={fmtCZK(m.vyplaty)}
          label={<Info
            text={p.vyplatyZHodin
              ? `Nárok oboch trénerov pri očakávaných hodinách (Jerry ${hodiny.jerry.toFixed(0)} h, Terezka ${hodiny.terezka.toFixed(0)} h) podľa mzdového modelu — nie medián. Mzda nie je fixný náklad: rastie a klesá s odrobenými hodinami.`
              : "Medián posledných mesiacov — tempo klientov sa nedá odhadnúť, tak sa berie história."}
            label="Výplaty" />}
          color={C.blue}
        />
        <StatCard value={fmtCZK(zisk)} label="Odhad zisku" color={zisk >= 0 ? C.green : C.red} />
      </div>
      <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.55, marginTop: 4 }}>
        Náklady: medián z {p.zaklad} mesiacov — nie priemer, aby jeden väčší nákup neposunul odhad na celý rok.
        {p.vyplatyZHodin
          ? <> Výplaty: nárok pri očakávaných {(hodiny.jerry + hodiny.terezka).toFixed(0)} hodinách, nie priemer z minulosti.</>
          : <> Výplaty: medián z histórie.</>}
        {zisk < 0 && <> <b style={{ color: C.red }}>Pri týchto tržbách by mesiac skončil v strate.</b></>}
      </div>

      <button
        onClick={() => setOtvorene((o) => !o)}
        style={{ marginTop: 10, background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", padding: 0 }}
      >
        {otvorene ? "▲ skryť" : "▼"} z čoho sa odhad skladá ({pravidelne.length} pravidelných položiek)
      </button>
      {otvorene && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 8, lineHeight: 1.5 }}>
            Položky, ktoré sa objavili aspoň v štyroch zo šiestich mesiacov. Zvyšok do celkových nákladov
            dopĺňajú jednorazové veci, ktoré sa predvídať nedajú — preto je odhad nákladov vždy opatrnejší než odhad tržieb.
          </div>
          {pravidelne.slice(0, 14).map((r) => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", borderBottom: `1px solid ${mix(C.border, 40)}`, fontSize: 12 }}>
              <span style={{ color: C.textMuted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
              <span style={{ color: C.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {fmtCZK(r.median)} <span style={{ color: C.textDim, fontSize: 11 }}>{r.mesiacov}/6</span>
              </span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 8 }}>
            Pravidelné spolu <b style={{ color: C.orange }}>{fmtCZK(pravidelne.reduce((a, r) => a + r.median, 0))}</b>
            {" "}z odhadovaných {fmtCZK(m.naklady)} — rozdiel sú nepravidelné nákupy.
          </div>
        </div>
      )}
    </Card>
  );
}
