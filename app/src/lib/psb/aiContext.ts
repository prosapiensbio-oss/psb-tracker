// Builds a compact, accurate snapshot of the studio's data for the AI assistant.
// The numbers here must match what the dashboard cards show — so the assistant
// can explain any value ("prečo v tejto karte vidím toto číslo") and reason over
// the alerts. Where a card recomputes something (zones, weekly hours, capacity
// util, top KPIs), we mirror that exact logic below rather than reuse a
// deprecated field (e.g. capacity.effHours is reference-only, NOT what the card shows).
import { PNL, VZAS_MONTHS, pnlCalc, poslednyMesiacSDatami } from "./vzas";
import {
  GA4_MESACNE, GSC_DOPYTY, GSC_LOKALNE, GSC_MESACNE, GSC_PRILEZITOSTI, GSC_STRANY,
  MKT_CLANKY, MKT_MESACNE,
} from "./marketing";
import { MKT_OBSAH } from "./marketing-obsah";
import {
  cenaZaSedenie,
  kotvaDat,
  ziskavanieKlientov,
  monthlyFinance,
  predictEarnings, predictCash,
  sessionAnalysisPSB,
  TARGET_H,
  ZONE_HI,
  ZONE_LO,
  type CapacityRow,
  type ClientAgg,
  type RegisterItem,
  type SixMRow,
} from "./compute";
import { monthLabel, normName, weekKey, weekLabel } from "./format";
import type { PSBData } from "./types";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);

export type AiContext = ReturnType<typeof buildAiContext>;

/** Kalendár — len to, čo z neho Jarvis potrebuje. Zámerne nie celý typ z Kalendár.tsx. */
export type KalendarPreAi = {
  udalosti: { zaciatok: string; klient: string | null; trener: string; typ: string | null }[];
  zmeny: { kedy: string; druh: string; klient: string | null; nazov: string | null; pred: string | null; po: string | null; trener: string; poznamka?: string | null }[];
};

export function buildAiContext(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  sixM: SixMRow[],
  capacity: CapacityRow[],
  register: RegisterItem[],
  kalendar?: KalendarPreAi,
) {
  const clientList = Object.values(clients);

  // ── Weekly hours per trainer (same source as the "Odrobené hodiny/týždeň" card) ──
  const weekMap: Record<string, { Jerry: number; Terezka: number }> = {};
  for (const s of data.sessions) {
    const k = weekKey(s.date);
    const e = (weekMap[k] ||= { Jerry: 0, Terezka: 0 });
    if (s.sessionTrainer === "Jerry") e.Jerry += s.duration / 60;
    else if (s.sessionTrainer === "Terezka") e.Terezka += s.duration / 60;
  }
  const weekRows = Object.entries(weekMap).sort((a, b) => a[0].localeCompare(b[0]));

  const perWeekTotal = weekRows.map(([k, v]) => ({ label: weekLabel(k), h: v.Jerry + v.Terezka })).filter((p) => p.h > 0);
  let wMax = perWeekTotal[0], wMin = perWeekTotal[0], wSum = 0;
  for (const p of perWeekTotal) {
    wSum += p.h;
    if (wMax && p.h > wMax.h) wMax = p;
    if (wMin && p.h < wMin.h) wMin = p;
  }
  const tyzdenneHodiny = perWeekTotal.length
    ? { priemer: r1(wSum / perWeekTotal.length), max: { tyzden: wMax.label, hodiny: r0(wMax.h) }, min: { tyzden: wMin.label, hodiny: r0(wMin.h) }, pocetTyzdnov: perWeekTotal.length, zdravaZona: `${ZONE_LO}–${ZONE_HI}h na trénera` }
    : null;
  // Full weekly history split by trainer — lets the bot answer "koľko urobil Jerry vs Terezka v týždni X".
  const tyzdennePodlaTrenera = weekRows.map(([k, v]) => ({ tyzden: weekLabel(k), jerry: r1(v.Jerry), terezka: r1(v.Terezka), spolu: r1(v.Jerry + v.Terezka) }));

  // ── Zdravá zóna donut: trainer-weeks in / below / above the zone ──
  let zdrava = 0, pod = 0, nad = 0;
  for (const [, v] of weekRows) {
    for (const t of ["Jerry", "Terezka"] as const) {
      const h = v[t];
      if (!h) continue;
      if (h >= ZONE_LO && h <= ZONE_HI) zdrava++;
      else if (h < ZONE_LO) pod++;
      else nad++;
    }
  }
  const zTotal = zdrava + pod + nad || 1;
  const zdravaZona = {
    zdrava: { pocet: zdrava, pct: r0((zdrava / zTotal) * 100) },
    podZonou: { pocet: pod, pct: r0((pod / zTotal) * 100) },
    nadZonou: { pocet: nad, pct: r0((nad / zTotal) * 100) },
    poznamka: "Počíta koľko trénerských týždňov (Jerry aj Terezka zvlášť) padlo do zdravej zóny 24–34h, pod ňu alebo nad ňu, za celé obdobie. Nie je to percento hodín, ale percento týždňov.",
  };

  // ── Top KPIs (the 4 big cards) ──
  const weeks = data.sessions.map((s) => weekKey(s.date)).sort();
  const lastWeek = weeks[weeks.length - 1];
  const weekHours = data.sessions.filter((s) => weekKey(s.date) === lastWeek).reduce((a, s) => a + s.duration / 60, 0);

  const fin = monthlyFinance(data);
  // Kotva dát (11. 8. — test Jarvisa). `fin` končí BEŽIACIM mesiacom, nie
  // posledným plným. Kým sa tu bral posledný riadok ako „posledný mesiac",
  // Jarvis na „koľko sme zarobili minulý mesiac" odpovedal jedenástimi dňami
  // augusta (48 595 Kč) namiesto júla (199 463 Kč) — a rovnaký rozrobený
  // mesiac padal aj do priemeru, minima a maxima. Appka sama sa tejto chybe
  // vyhýba cez kotvaDat(); kontext o nej dovtedy nevedel.
  const kotva = kotvaDat(data);
  const plny = fin.filter((m) => !kotva.plny || m.month <= kotva.plny);
  const lastMonth = plny[plny.length - 1];
  const beziaci = kotva.ciastocny ? fin.find((m) => m.month === kotva.mesiac) : undefined;
  const kpi = {
    aktivnychKlientov: clientList.filter((c) => c.status !== "Neaktívny").length,
    // Vedome NIE „tento týždeň": PTminder sa prepisuje raz týždenne, takže
    // posledný týždeň s dátami je spravidla ten minulý. Názov klamal.
    odrobenePoslednyUplnyTyzden: { hodiny: r0(weekHours), tyzden: lastWeek ? weekLabel(lastWeek) : null },
    zarobkyPoslednyPlnyMesiac: lastMonth ? { mesiac: monthLabel(lastMonth.month), czk: r0(lastMonth.revenue) } : null,
    klientov6M: sixM.length,
  };

  // ── Earnings ──
  const finActual = fin.map((m) => ({ mesiac: monthLabel(m.month), vyfakturovane: r0(m.revenue), prijateTrzby: r0(m.cash), jerry: r0(m.byTrainer["Jerry"]?.revenue || 0), terezka: r0(m.byTrainer["Terezka"]?.revenue || 0), sedeni: m.sessions, ...(m.month === kotva.mesiac && kotva.ciastocny ? { rozrobeny: true } : {}) }));
  // Priemer/min/max LEN z plných mesiacov — jedenásť dní augusta nie je mesiac.
  const revVals = plny.map((m) => m.revenue).filter((v) => v > 0);
  const earnAvg = revVals.length ? r0(revVals.reduce((a, b) => a + b, 0) / revVals.length) : 0;
  const earnMax = revVals.length ? r0(Math.max(...revVals)) : 0;
  const earnMin = revVals.length ? r0(Math.min(...revVals)) : 0;
  const pred = predictEarnings(data, clients, { excludeSpecial: false, horizon: 3 });
  // Jeden model tržieb (Jerry, 9. 8.): Jarvis musí hovoriť to isté číslo ako
  // dlaždica na Kokpite a obrazovka Predikcia — teda model obnov z balíčkov
  // + kalendár, nie scenáre z predictEarnings.
  const cashPred3 = predictCash(data, clients, 3);
  const cashSum = (k: "expected" | "lo" | "hi") => cashPred3.months.reduce((a, m) => a + m[k], 0);

  // ── Session trend ──
  const trendRaw = sessionAnalysisPSB(data.sessions);
  const trend = trendRaw.map((m) => ({ mesiac: monthLabel(m.month), celkovo: m.total, offline: m.offline, online: m.onlineTc, uvodne: m.uvodne, ...(m.month === kotva.mesiac && kotva.ciastocny ? { rozrobeny: true } : {}) }));
  const trendPlne = trendRaw.filter((m) => !kotva.plny || m.month <= kotva.plny);
  const trendAvg = trendPlne.length ? r1(trendPlne.reduce((a, b) => a + b.total, 0) / trendPlne.length) : 0;

  // ── Tempo + dôvera (same averaging as the dashboard cards) ──
  const pc = pred.perClient;
  const tempoAvg = pc.length ? r1(pc.reduce((a, c) => a + c.burnRate, 0) / pc.length) : 0;
  const confAvg = pc.length ? r0((pc.reduce((a, c) => a + c.confidence, 0) / pc.length) * 100) : 0;

  // ── Capacity ("Dvojitý strop" — use the SAME fields the card shows, not effHours) ──
  const capPerTrainer = capacity.map((c) => ({
    trener: c.trainer,
    typickyTyzden: r0(c.recentWeekly),
    rusnyTyzden: r0(c.busyWeekly),
    vytazeniePct: r0(c.util),
    zvladneEste: c.canTake,
    odporucanie: c.advice,
  }));
  const avgAll = capacity.reduce((a, c) => a + c.recentWeekly, 0);
  const busyAll = capacity.reduce((a, c) => a + c.busyWeekly, 0);
  const capSpolu = {
    typickyTyzden: r0(avgAll),
    rusnyTyzden: r0(busyAll),
    idealSpolu: `${TARGET_H * 2}h (2×${TARGET_H}h)`,
    vytazeniePct: r0(Math.max(avgAll / (TARGET_H * 2), busyAll / (ZONE_HI * 2)) * 100),
    zvladneEste: capacity.reduce((a, c) => a + c.canTake, 0),
    poznamka: `Vyťaženie z reálnych hodín, "dvojitý strop": rastie kým typický týždeň (priemer) nedosiahne ideál ${TARGET_H}h ALEBO rušný týždeň (80. percentil) nenarazí na ${ZONE_HI}h — čo príde skôr. 100 % = jeden strop naplnený.`,
  };

  // Distributions.
  const dist = (fn: (c: ClientAgg) => string) => {
    const m: Record<string, number> = {};
    for (const c of clientList) m[fn(c)] = (m[fn(c)] || 0) + 1;
    return m;
  };
  const phase = (n: number) => (n <= 6 ? "Obnova (1–6)" : n <= 18 ? "Integrácia (7–18)" : "Udržateľnosť (19+)");
  const sixMPhases: Record<string, number> = {};
  for (const c of sixM) sixMPhases[phase(c.monthInPhase)] = (sixMPhases[phase(c.monthInPhase)] || 0) + 1;

  // Per-client detail (compact) — lets the assistant reason about and edit a
  // specific client (status, note, trainer…). Sorted by most recent session.
  // Posledných 12 mesiacov stačí — staršie sa nemenia a zabrali by miesto,
  // ktoré potrebuje zoznam klientov.
  const pnlMesiace = VZAS_MONTHS.slice(-12);
  const _p = pnlCalc();
  const pnlSuhrn: Record<string, Record<string, number>> = {};
  for (const mk of pnlMesiace) {
    const idx = VZAS_MONTHS.indexOf(mk);
    if (idx < 0 || idx > poslednyMesiacSDatami()) continue;
    pnlSuhrn[mk] = {
      prijmy: Math.round(_p.prijmy[idx] || 0),
      naklady_bez_vyplat: Math.round(_p.bezVyplat[idx] || 0),
      vyplaty_poslane: Math.round(_p.vyplatySpolu[idx] || 0),
      naklady_spolu: Math.round(_p.celkoveNaklady[idx] || 0),
      hruby_zisk: Math.round(_p.hrubyZisk[idx] || 0),
      marza_pct: Math.round((_p.marza[idx] || 0) * 10) / 10,
    };
  }
  const pnlPolozky: Record<string, Record<string, number>> = {};
  for (const [sekK, sek] of Object.entries(PNL)) {
    for (const [subK, sub] of Object.entries(sek.subcategories)) {
      for (const [itemK, item] of Object.entries(sub.items)) {
        const kluc = `${sekK}.${subK}.${itemK}`;
        const podlaMesiaca: Record<string, number> = {};
        pnlMesiace.forEach((mk) => {
          const i = VZAS_MONTHS.indexOf(mk);
          const v = Math.round(item.values[i] || 0);
          if (v !== 0) podlaMesiaca[mk] = v;
        });
        if (Object.keys(podlaMesiaca).length) pnlPolozky[`${kluc}|${sub.label} · ${item.label}`] = podlaMesiaca;
      }
    }
  }

  // Ø cena sedenia po klientovi — jedným prechodom, nie `cenaZaSedenie` na
  // každého zo 119 klientov (to je 119× celá história cez normName). Že to
  // dáva to isté číslo ako kanonická funkcia, drží test v aiContext.test.ts.
  const cenaPoKlientovi: Record<string, { cash: number; sedeni: number }> = {};
  const bunka = (meno: string) => (cenaPoKlientovi[normName(meno)] ||= { cash: 0, sedeni: 0 });
  for (const s of data.sessions) bunka(s.client).sedeni++;
  for (const p of data.payments) if (p.client) bunka(p.client).cash += p.amount;

  // ── Kalendár ──────────────────────────────────────────────────────────────
  //
  // PTminder je účtovníctvo, kalendár je predpoveď — a Jarvis dovtedy videl len
  // to prvé. Preto na „koľko sa mi tento týždeň zrušilo" nevedel odpovedať a na
  // „kde vidím zrušené tréningy" dokonca tvrdil, že to appka nesleduje.
  //
  // Ide sem len rozumné okno: zmeny za posledných 30 dní a objednané hodiny do
  // konca budúceho týždňa. Celý kalendár by zabral miesto, ktoré potrebuje
  // zoznam klientov.
  const kalendarBlok = (() => {
    if (!kalendar) return null;
    const dnes = new Date().toISOString().slice(0, 10);
    const posun = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    const od = posun(-30), doKedy = posun(14);
    const den = (z: { pred: string | null; po: string | null; kedy: string }) => (z.pred || z.po || z.kedy || "").slice(0, 10);

    const zmeny = kalendar.zmeny
      .filter((z) => den(z) >= od)
      .sort((a, b) => den(b).localeCompare(den(a)))
      .map((z) => ({ den: den(z), druh: z.druh, klient: z.klient || z.nazov, trener: z.trener, vysvetlene: !!z.poznamka, poznamka: z.poznamka || null }));

    const zrusene = zmeny.filter((z) => z.druh === "zrusene");
    const objednane = kalendar.udalosti
      .filter((u) => (u.typ === "trening" || u.typ === "uvodny") && u.zaciatok.slice(0, 10) >= dnes && u.zaciatok.slice(0, 10) <= doKedy)
      .map((u) => ({ den: u.zaciatok.slice(0, 10), klient: u.klient, trener: u.trener, typ: u.typ }))
      .sort((a, b) => a.den.localeCompare(b.den));

    return {
      poznamka: "Zdroj: Google Kalendár, rozdiel medzi dvoma stiahnutiami. Sleduje sa od 31. 7. 2026 — na skoršie mesiace odpoveď NEEXISTUJE, nie je to „nula“. Kalendár je predpoveď, PTminder je účtovníctvo: objednaná hodina nie je tržba. Obrazovka: Kalendár → Zmeny v kalendári.",
      zmenyOd: od,
      zruseneSpolu: zrusene.length,
      zruseneNevysvetlene: zrusene.filter((z) => !z.vysvetlene).length,
      zmeny,
      objednaneDo: doKedy,
      objednane,
    };
  })();

  // ── Získavanie klientov (deravé vedro) ────────────────────────────────────
  //
  // Toto je číslo, z ktorého sa počíta rozpočet na reklamu — a je to iné číslo
  // než „koľko mám voľných miest". Bez neho Jarvis plánoval na statických 18
  // miestach a vychádzali mu polovičné rozpočty.
  const zisk = ziskavanieKlientov(data, capacity.reduce((a, c) => a + c.canTake, 0));
  const dopytySpolu = (data.leads || []).length;
  const ziskavanie = {
    poznamka: "Voľné miesta sú statické, klientela je prietok: kým zapĺňaš, tečie. Počet klientov, ktorých treba ZÍSKAŤ = voľné miesta + odchod × mesiace. Odchod sa počíta z TICHA (posledná hodina viac než 60 dní dozadu), nie zo zrušenia. Posledné dva mesiace preto vždy vyzerajú bez odchodov — ticho ešte nedozrelo; priemer sa berie z 12 mesiacov. Ráta sa len s klientmi, čo mali 5+ sedení. Obrazovka: Kokpit, karta „Koľko klientov naozaj treba“.",
    aktivnych: zisk.aktivnych,
    volnychMiest: zisk.volnychMiest,
    odchodMes: zisk.odchodMes,
    prichodMes: zisk.prichodMes,
    cistyMes: zisk.cistyMes,
    obdobie: zisk.obdobie,
    mesiacovNaZaplnenie: zisk.mesiacovNaZaplnenie,
    trebaZiskat: { za6mes: zisk.trebaZiskat(6), za12mes: zisk.trebaZiskat(12) },
    dopytovSpolu: dopytySpolu,
  };

  // ── Marketing ─────────────────────────────────────────────────────────────
  //
  // Jarvis má byť plánovač marketingu, nie len účtovník tréningov — a na plán
  // nestačia knihy, treba čísla, proti ktorým sa plán meria. Preto sem ide
  // všetko, z čoho sa dá rozhodnúť, ale AGREGOVANE: 130 príspevkov po jednom
  // by zabralo miesto, ktoré potrebuje zoznam klientov, a stejne sa z nich
  // číta len „ktorý typ háku funguje".
  //
  // Čo sa zámerne NEPOSIELA: surové kanály z Metricoolu (163 riadkov, jediný
  // mesiac — na trend nestačia) a celé znenie kníh (tie sú v <pozadie_psb>).
  const marketing = (() => {
    const r2 = (n: number) => Math.round(n * 100) / 100;

    // Obsah po kategórii háku — „čo funguje" sa neurčuje z videní, ale
    // z uložení a zdieľaní: videnie je algoritmus, uloženie je človek.
    const podlaHooku: Record<string, { kusov: number; ulozenia: number; videnia: number; zdielania: number; vr: number }> = {};
    for (const o of MKT_OBSAH) {
      const e = (podlaHooku[o.k] ||= { kusov: 0, ulozenia: 0, videnia: 0, zdielania: 0, vr: 0 });
      e.kusov++; e.ulozenia += o.u; e.videnia += o.v; e.zdielania += o.z; e.vr += o.vr;
    }
    const hooky = Object.entries(podlaHooku)
      .map(([kategoria, e]) => ({
        kategoria, kusov: e.kusov,
        ulozeniaNaKus: r2(e.ulozenia / e.kusov),
        videniaNaKus: r0(e.videnia / e.kusov),
        zdielaniaNaKus: r2(e.zdielania / e.kusov),
        viewRate: r2(e.vr / e.kusov),
      }))
      .sort((a, b) => b.ulozeniaNaKus - a.ulozeniaNaKus)
      // Poradie sa dopisuje číslom zámerne. Zoradený zoznam model prečítal
      // naopak (11. 8.: „dôraz na Edukácia a Klientsky príbeh — najlepšie
      // uloženia", pritom sú na rebríčku posledné dve). Záver, ktorý sa dá
      // spočítať, sa nemá nechať odvodzovať — to je to isté pravidlo ako
      // „nesčituj z hlavy".
      .map((h, i, pole) => ({ poradie: `${i + 1}. z ${pole.length} podľa uložení na kus`, ...h }));
    const podlaZdielani = [...hooky].sort((a, b) => b.zdielaniaNaKus - a.zdielaniaNaKus);
    const zhrnutieHookov = hooky.length
      ? `Najviac ULOŽENÍ na kus má „${hooky[0].kategoria}" (${hooky[0].ulozeniaNaKus}), najmenej „${hooky[hooky.length - 1].kategoria}" (${hooky[hooky.length - 1].ulozeniaNaKus}). Najviac ZDIEĽANÍ má „${podlaZdielani[0].kategoria}" (${podlaZdielani[0].zdielaniaNaKus}). Pozor na počet kusov: kategória s pár kusmi môže viesť náhodou — „${hooky[0].kategoria}" ich má ${hooky[0].kusov}.`
      : "Zatiaľ žiadny obsah.";

    const zoradene = [...MKT_OBSAH].sort((a, b) => b.u + b.z - (a.u + a.z));
    const kus = (o: (typeof MKT_OBSAH)[number]) => ({ m: o.m, format: o.f, kategoria: o.k, hook: o.h.slice(0, 90), ulozenia: o.u, videnia: o.v, zdielania: o.z, viewRate: o.vr });

    // Zdroje klientov — jediné miesto, kde sa marketing dotýka peňazí.
    const zdroje: Record<string, number> = {};
    for (const c of clientList) if (c.zdroj) zdroje[c.zdroj] = (zdroje[c.zdroj] || 0) + 1;
    const dopytyZdroje: Record<string, number> = {};
    for (const l of data.leads || []) if (l.source) dopytyZdroje[l.source] = (dopytyZdroje[l.source] || 0) + 1;

    // Náklady na marketing z P&L, po mesiacoch, aj ako % z tržieb.
    const mkt = PNL.fixne?.subcategories?.marketing;
    const naklady: Record<string, number> = {};
    if (mkt) {
      for (const item of Object.values(mkt.items)) {
        VZAS_MONTHS.forEach((mk, i) => {
          const v = Math.round(item.values[i] || 0);
          if (v) naklady[mk] = (naklady[mk] || 0) + v;
        });
      }
    }

    // Kotva marketingových dát. 11. 8.: MKT_MESACNE končilo júnom, júlové
    // čísla boli len v databáze (kanaly_mesiace, mkt_prispevky) — a Jarvis
    // z chýbajúceho riadku vyrobil tvrdenie „v júli spadol obsah na nulu",
    // hoci júl bol s 32 kusmi najsilnejší mesiac v roku. Chýbajúci mesiac
    // NIE JE nula. Tá istá rodina chýb ako kotva dát pri tržbách, len na
    // druhom konci appky.
    const poslednyMkt = MKT_MESACNE.length ? MKT_MESACNE[MKT_MESACNE.length - 1].m : null;
    const poslednyGsc = GSC_MESACNE.length ? GSC_MESACNE[GSC_MESACNE.length - 1].m : null;
    const poslednyGa4 = GA4_MESACNE.length ? GA4_MESACNE[GA4_MESACNE.length - 1].m : null;

    return {
      poznamka: "Rozhoduje sa z ULOŽENÍ a ZDIEĽANÍ, nie z videní — videnie je algoritmus, uloženie je človek. Obsah je agregovaný po kategórii háku; jednotlivé kusy sú len v najlepších/najhorších. Kanály z Metricoolu (Threads, TikTok, Konkurencia) sú v databáze len za jeden mesiac, na trend nestačia — keď ich treba, vytiahni ich dopytom z kanaly_mesiace. Obrazovka: Marketing.",
      kotva: {
        instagramDo: poslednyMkt,
        vyhladavanieDo: poslednyGsc,
        webDo: poslednyGa4,
        poznamka: "Rady končia týmito mesiacmi. Mesiac, ktorý v rade NIE JE, znamená „ešte nenahraté“ — NIKDY nie nulu a nikdy nie prepad. Novšie čísla bývajú v databáze skôr než tu: over ich dopytom do kanaly_mesiace (Posts/Reels/Stories/Views po mesiacoch) alebo mkt_prispevky, kým o poslednom mesiaci čokoľvek tvrdíš.",
      },
      instagramMesacne: MKT_MESACNE,
      obsahZhrnutie: zhrnutieHookov,
      obsahPodlaHooku: hooky,
      obsahNajlepsie: zoradene.slice(0, 10).map(kus),
      obsahNajhorsie: zoradene.slice(-5).map(kus),
      web: { poznamka: "GA4, návštevnosť webu podľa zdroja.", mesacne: GA4_MESACNE },
      vyhladavanie: {
        poznamka: "Google Search Console. „prilezitosti“ = veľa zobrazení, takmer žiadne kliky — téma, na ktorú sa už zobrazujeme, ale nikto neklikne; tam je najlacnejší obsah.",
        mesacne: GSC_MESACNE,
        topDopyty: GSC_DOPYTY.slice(0, 20),
        prilezitosti: GSC_PRILEZITOSTI,
        lokalne: GSC_LOKALNE.slice(0, 8),
        topStrany: GSC_STRANY.slice(0, 12),
      },
      clanky: MKT_CLANKY.slice(0, 15),
      zdrojeKlientov: {
        poznamka: "Odkiaľ prišli KLIENTI (nie dopyty). Vyplnené ručne pri úvodnom tréningu; klienti bez zdroja sa nezapočítavajú.",
        klienti: zdroje,
        dopyty: dopytyZdroje,
        bezZdroja: clientList.filter((c) => !c.zdroj).length,
      },
      naklady: { poznamka: "Marketingové položky z P&L (Facebook, Google, MultiBox, Offline).", poMesiacoch: naklady },
    };
  })();

  const klientiDetail = clientList
    .slice()
    .sort((a, b) => (b.lastSession || "").localeCompare(a.lastSession || ""))
    .map((c) => ({
      meno: c.name,
      segment: c.segment,
      status: c.status,
      statusAuto: c.statusAuto,
      statusManual: c.statusOverride,
      pauzaDo: c.pauseUntil || null,
      trener: c.primaryTrainer,
      trenerManual: c.primaryTrainerOverride,
      balicek: c.membership || "Bez balíčka",
      zostatokSedeni: c.packageTotal ? `${c.packageRemaining}/${c.packageTotal}` : null,
      stavBalicka: c.packageStatus || null,
      typ: c.clientType,
      is6m: c.is6m,
      modalita: c.modality,
      zmluvaPodpisana: c.contractSigned,
      platiBitcoin: c.bitcoin,
      specialnaSadzba: c.specialRate,
      pozn_specialnaSadzba: c.specialRateNote || null,
      poznamkaTrenera: c.trainerNote || null,
      pocetSedeni: c.sessionCount,
      hodinySpolu: r1(c.totalHours),
      // Jedna definícia pre celú appku (11. 8.). Predtým tu bol `c.paidAvg` —
      // priemer z ceny ZAPÍSANEJ pri sedení, kým Klienti, Tréningy aj graf na
      // Kokpite už dávno počítajú prijaté peniaze ÷ odtrénované sedenia. Pri
      // 19 % sedení je zapísaná cena nulová (platba visí na balíčku), takže
      // Jarvis hovoril o dvesto korún nižšie číslo než obrazovka vedľa neho.
      priemCenaSedenia: (() => { const b = cenaPoKlientovi[normName(c.name)]; return b && b.sedeni ? r0(b.cash / b.sedeni) : 0; })(),
      dochadzkaPct: r0(c.attendance * 100),
      prveSedenie: c.firstSession || null,
      posledneSedenie: c.lastSession || null,
    }));

  return {
    // Register je PRVÝ zámerne. Kontext sa na serveri reže na pevnú dĺžku a
    // rez ide odzadu — kým bol register posledný, pri 60+ klientoch z neho
    // nezostalo nič a Jarvis na „zruš to upozornenie o nájme" odpovedal, že
    // ho nenašiel. Malé a dôležité veci patria dopredu, dlhé zoznamy dozadu.
    naCoSaPozriet: register.map((r) => ({
      key: r.key,
      kategoria: r.category,
      zavaznost: r.tone === "red" ? "vysoká" : r.tone === "orange" ? "stredná" : "nízka",
      nadpis: r.title,
      detail: r.detail,
      akceptovane: r.acked,
      poznamka: r.note || null,
    })),
    // ── Čím klienti platia ────────────────────────────────────────────────
    // Tri cesty s rôznou réžiou: účet, hotovosť, bitcoin. Bitcoin je pätina
    // tržieb a bez tohto rozdelenia by Jarvis na otázku „koľko chodí v BTC"
    // odpovedal, že nevie — hoci to appka počíta.
    platobneKanaly: (() => {
      // Z PTmindera (payment_method), nie z bankových pohybov. Revízia našla,
      // že banková verzia miešala okná: výpisy siahajú len po január 2026,
      // BTC kniha po júl 2025 — percentá z nezlučiteľných období. PTminder
      // pokrýva celú históriu a nesie presné meno pri každej platbe.
      const podla: Record<string, { czk: number; mena: Set<string>; poMes: Record<string, number> }> = {};
      for (const pl of data.payments) {
        if (!pl.client) continue;
        const m = pl.method || "bank";
        const e = (podla[m] ||= { czk: 0, mena: new Set(), poMes: {} });
        e.czk += pl.amount;
        e.mena.add(pl.client);
        const mk = pl.date.slice(0, 7);
        e.poMes[mk] = (e.poMes[mk] || 0) + pl.amount;
      }
      const spolu = Object.values(podla).reduce((a, e) => a + e.czk, 0);
      const pct = (x: number) => (spolu > 0 ? Math.round((x / spolu) * 1000) / 10 : 0);
      const rad = (m: string) => {
        const e = podla[m];
        return e ? { czk: Math.round(e.czk), pct: pct(e.czk), klientov: e.mena.size } : { czk: 0, pct: 0, klientov: 0 };
      };
      return {
        poznamka: "Zdroj: PTminder (payment_method), celá história. Kanál „Bitcoin“ = metóda other — v roku 2026 sedí s BTC appkou na percentá; rok 2025 v BTC appke chýba (kniha platí až od 31.7.2025). Percentá sú z PEŇAZÍ; klient platiaci dvoma cestami je v počtoch oboch kanálov. Graf: Peniaze → Po mesiacoch, karta „Čím klienti platia“.",
        ucet: rad("bank"),
        hotovost: rad("cash"),
        bitcoin: rad("other"),
        spoluCzk: Math.round(spolu),
        poslednych12: [...new Set(data.payments.filter((x) => x.client).map((x) => x.date.slice(0, 7)))]
          .sort().slice(-12)
          .map((m) => ({ m, ucet: Math.round(podla.bank?.poMes[m] || 0), hotovost: Math.round(podla.cash?.poMes[m] || 0), btc: Math.round(podla.other?.poMes[m] || 0) })),
      };
    })(),
    meta: {
      generatedAt: new Date().toISOString().slice(0, 10),
      note: "Súhrnné čísla sú za OBOCH trénerov spolu (Jerry + Terezka), ak nie je uvedené inak. Rozpisy po trénerovi máš v zarobky.mesacne (jerry/terezka), tyzdennePodlaTrenera a kapacita.podlaTrenera. Detail každého klienta (aj editovateľné polia) je v klientiDetail.",
      totalClients: clientList.length,
      kotvaDat: {
        poslednyDenSDatami: kotva.den,
        poslednyPlnyMesiac: kotva.plny,
        beziaciMesiac: kotva.ciastocny ? kotva.mesiac : null,
        poznamka: "Dáta z PTmindera končia dňom poslednyDenSDatami — nie dneškom. Mesiac označený príznakom rozrobeny je napočítaný len po tento deň; NIKDY ho neporovnávaj s plnými mesiacmi, nedávaj ho do priemerov a nenazývaj ho „minulý mesiac“. Otázky typu „koľko sme zarobili minulý mesiac“ sa týkajú poslednyPlnyMesiac.",
      },
    },
    beziaciMesiac: beziaci
      ? { mesiac: monthLabel(beziaci.month), doDna: kotva.den, vyfakturovane: r0(beziaci.revenue), prijateTrzby: r0(beziaci.cash), sedeni: beziaci.sessions, poznamka: "Rozrobený mesiac — čiastkový súčet, nie výsledok." }
      : null,
    kpi,
    tyzdenneHodiny,
    tyzdennePodlaTrenera,
    zdravaZona,
    kapacita: { spolu: capSpolu, podlaTrenera: capPerTrainer },
    zarobky: {
      poslednyPlnyMesiac: lastMonth ? { mesiac: monthLabel(lastMonth.month), revenue: r0(lastMonth.revenue), sedeni: lastMonth.sessions } : null,
      mesacne: finActual,
      priemerMesacne: earnAvg,
      maxMesacne: earnMax,
      minMesacne: earnMin,
      poznamka: "Vyfakturované zárobky = hodnota odtrénovaných sedení (Payroll by Session). Ø/max/min LEN z plných mesiacov — rozrobený mesiac (mesacne[].rozrobeny) je z nich vynechaný, inak by sa z jedenástich dní stal „najhorší mesiac“.",
      odhadBuduciMesiac: cashPred3.months[0] ? { mesiac: monthLabel(cashPred3.months[0].month), realisticky: r0(cashPred3.months[0].expected), negativny: r0(cashPred3.months[0].lo), optimisticky: r0(cashPred3.months[0].hi) } : null,
      odhad3mes: { optimisticky: r0(cashSum("hi")), realisticky: r0(cashSum("expected")), negativny: r0(cashSum("lo")), mesacnyRunRate: r0(pred.monthlyRunRate) },
    },
    sedeniaTrend: { mesacne: trend, priemerMesacne: trendAvg, poznamka: "Ø len z plných mesiacov (rozrobený vynechaný)." },
    tempo: { priemerSedeniMes: tempoAvg, poznamka: "Priemerný počet sedení klienta za mesiac (z histórie)." },
    doveraObnovy: { priemerPct: confAvg, poznamka: "Priemerná pravdepodobnosť obnovy naprieč klientmi, vážená segmentom." },
    klienti: {
      spolu: clientList.length,
      podlaSegmentu: dist((c) => c.segment),
      podlaBalicka: dist((c) => c.membership || "Bez balíčka"),
      podlaModality: dist((c) => c.modality),
    },
    sixM: { spolu: sixM.length, podlaFazy: sixMPhases, poznamka: "6M proces: Obnova 1.–6. mesiac, Integrácia 7.–18., Udržateľnosť 19.+" },
    kalendar: kalendarBlok,
    ziskavanie,
    marketing,
    // P&L po položkách za posledných 12 mesiacov. Bez toho Jarvis na otázku
    // „ktorá aplikácia stála v apríli 780?" nemá kde hľadať: hodnoty P&L žijú
    // v module (z Excelu + z importu), nie v databáze, takže ich nevytiahne ani
    // dopytom. Kľúč je presne ten, ktorým sa bunka aj opravuje.
    // Hotový súhrn P&L po mesiacoch. Bez neho Jarvis na „aký bol zisk" hľadal
    // v bankových pohyboch a odpovedal buď zle, alebo vôbec — číslo, ktoré
    // appka počíta na jednom riadku, nemá zmysel nechať odvodzovať.
    pnlSuhrn,
    pnlPolozky,
    klientiDetail,
  };
}
