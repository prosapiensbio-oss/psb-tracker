// Čítanie kalendára z tajnej iCal adresy.
//
// Google neposiela hotový rozvrh. Opakovaný tréning je v súbore JEDNA udalosť
// s pravidlom („každý pondelok o 9:00"), k tomu zoznam výnimiek (EXDATE — vtedy
// sa nekoná) a samostatné záznamy pre presunuté jednotlivé výskyty
// (RECURRENCE-ID). Bez rozvinutia týchto pravidiel by appka videla dvadsať
// udalostí namiesto stopäťdesiatich hodín — a každý presun by čítala ako
// zrušenie plus nový tréning.
//
// ČAS DRŽÍME V MIESTNOM ČASE, nie v UTC. Klienti, tréneri aj PTminder sú v
// jednom pásme a porovnáva sa vždy len appka sama so sebou. Prevod na UTC by
// pridal triedu chýb (posun o hodinu na prelome letného času) bez jediného
// úžitku. Časy v UTC (končiace na Z) sa preto pri načítaní prepočítajú na
// pražský nástenný čas a ďalej sa s nimi zaobchádza rovnako.

export type IcalUdalost = {
  /** Stabilné naprieč presunmi — kľúč, podľa ktorého poznáme, že ide o tú istú hodinu. */
  uid: string;
  /** "2026-08-03T09:00" — miestny čas, bez pásma. */
  zaciatok: string;
  koniec: string;
  nazov: string;
  /** true = celodenná udalosť (dovolenka, sviatok), nie hodina. */
  celodenna: boolean;
};

/** Riadky v iCal sa lámu na 75 znakov a pokračovanie začína medzerou. */
function spojRiadky(text: string): string[] {
  const out: string[] = [];
  for (const r of text.replace(/\r\n/g, "\n").split("\n")) {
    if ((r.startsWith(" ") || r.startsWith("\t")) && out.length) out[out.length - 1] += r.slice(1);
    else out.push(r);
  }
  return out;
}

const odescapuj = (s: string) =>
  s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();

/**
 * Posun pásma pre daný okamih — z Intl, takže letný čas rieši systém, nie my.
 *
 * FORMÁTOVAČ SA STAVIA RAZ A POSUN SA PAMÄTÁ PO HODINÁCH. 13. 9. 2026 CPU
 * profil parsovania ukázal 78 % času práve tu: pri KAŽDOM čase v súbore sa
 * staval nový `Intl.DateTimeFormat`, a Jerryho kalendár ich má desaťtisíce
 * (5 132 začiatkov + 5 132 koncov v UTC, 3 173 riadkov EXDATE). Worker na tom
 * 10. 9. zomrel na `exceededResources`, chybu nestihol zapísať a kalendár sa
 * tri dni ticho nesťahoval. Hodinový kľúč je presný: pražské pásmo sa mení
 * vždy o celej hodine UTC (01:00), v rámci hodiny je posun rovnaký.
 */
const formatovace = new Map<string, Intl.DateTimeFormat>();
const posuny = new Map<string, number>();
function posunMinut(d: Date, pasmo: string): number {
  const hodina = Math.floor(d.getTime() / 3600000);
  const kluc = `${pasmo}|${hodina}`;
  const znamy = posuny.get(kluc);
  if (znamy !== undefined) return znamy;
  let f = formatovace.get(pasmo);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: pasmo, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    formatovace.set(pasmo, f);
  }
  // Počíta sa zo ZAČIATKU hodiny, nie z presného okamihu — posun je rovnaký
  // a delenie na minúty nikdy nevyjde necelé kvôli milisekundám.
  const zaciatokHodiny = new Date(hodina * 3600000);
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(zaciatokHodiny)) if (x.type !== "literal") p[x.type] = x.value;
  const akoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  const posun = (akoUtc - zaciatokHodiny.getTime()) / 60000;
  if (posuny.size > 100000) posuny.clear(); // poistka pre dlho žijúci izolát
  posuny.set(kluc, posun);
  return posun;
}

const PASMO = "Europe/Prague";

const PLATNY_CAS = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;

/** Okamih (UTC ms) → nástenný čas v pásme, "2026-08-03T09:00". */
function utcNaNastenny(utc: number, pasmo: string): string {
  return new Date(utc + posunMinut(new Date(utc), pasmo) * 60000).toISOString().slice(0, 16);
}

/**
 * Nástenný čas v cudzom pásme → pražský. Null = pásmo nepoznáme (Intl ho
 * odmietne) a hodnota ostáva, ako stojí — radšej hodina vedľa než žiadna.
 */
function zPasmaNaPrahu(nastenny: string, pasmo: string): string | null {
  try {
    const ako = Date.parse(`${nastenny}:00Z`);
    const prvy = posunMinut(new Date(ako), pasmo);
    // Druhý krok rieši udalosť tesne pri prelome času v tom pásme.
    const druhy = posunMinut(new Date(ako - prvy * 60000), pasmo);
    return utcNaNastenny(ako - druhy * 60000, PASMO);
  } catch {
    return null;
  }
}

/**
 * "20260803T090000" / "20260803T070000Z" / "20260803" → "2026-08-03T09:00"
 *
 * `pasmo` je TZID z riadku, keď nie je pražské (Jerryho kalendár má pár
 * udalostí v Europe/Kaliningrad a Brussels — založené na cestách).
 */
function naMiestny(hodnota: string, pasmo?: string): { s: string; celodenna: boolean } | null {
  const m = PLATNY_CAS.exec(hodnota.trim());
  if (!m) return null;
  const [, r, mes, d, h, min, , z] = m;
  if (!h) return { s: `${r}-${mes}-${d}T00:00`, celodenna: true };
  if (z) return { s: utcNaNastenny(Date.UTC(+r, +mes - 1, +d, +h, +min), PASMO), celodenna: false };
  const nastenny = `${r}-${mes}-${d}T${h}:${min}`;
  // Bez Z je hodnota miestna v pásme z TZID; pražská (a bez pásma) ostáva, ako stojí.
  return { s: (pasmo && zPasmaNaPrahu(nastenny, pasmo)) || nastenny, celodenna: false };
}

/** Hodnota z RRULE (UNTIL) ako nástenný čas v pásme série. */
function vPasme(hodnota: string, pasmo: string): string | null {
  const m = PLATNY_CAS.exec(hodnota.trim());
  if (!m) return null;
  const [, r, mes, d, h, min, , z] = m;
  if (!h) return `${r}-${mes}-${d}T00:00`;
  return z ? utcNaNastenny(Date.UTC(+r, +mes - 1, +d, +h, +min), pasmo) : `${r}-${mes}-${d}T${h}:${min}`;
}

/** TZID z ľavej strany riadku, keď nie je pražské. Drahé to nie je: väčšina riadkov ho nemá. */
function cudziePasmo(kluc: string): string | undefined {
  if (!kluc.includes("TZID=")) return undefined;
  const p = /;TZID="?([^";:]+)"?/i.exec(kluc)?.[1];
  return p && p !== PASMO ? p : undefined;
}

const naMs = (s: string) => Date.parse(`${s}:00Z`);
const zMs = (ms: number) => new Date(ms).toISOString().slice(0, 16);

type SurovaUdalost = {
  uid: string; zaciatok: string; koniec: string; nazov: string; celodenna: boolean;
  rrule?: string; exdate: string[]; recurrenceId?: string; zruseny: boolean;
  /** Séria v cudzom pásme: rozvíja sa v ňom (deň v týždni platí tam), von ide Praha. */
  pasmo?: string; zaciatokVPasme?: string;
};

/**
 * Udalosť počas čítania: časy zostávajú SUROVÉ (tak, ako stoja v súbore).
 * Prevod pásma je drahý a tisíce udalostí z minulých rokov ho nepotrebujú —
 * rozhodne sa až pri END:VEVENT, či udalosť vôbec môže do okna. Ukladajú sa
 * len hodnoty, ktoré by `naMiestny` prijal, takže výsledok je rovnaký, ako
 * keby sa prevádzalo hneď.
 */
type Rozrobena = {
  uid: string; nazov: string; zruseny: boolean; rrule?: string;
  start?: string; end?: string; recId?: string; exdate: string[];
  startPasmo?: string; endPasmo?: string; recPasmo?: string; exdatePasmo?: string;
};

/**
 * Rozvinie opakovanie do jednotlivých výskytov v okne.
 *
 * Zámerne pokrýva len to, čo Google reálne generuje pre týždenný rozvrh:
 * FREQ=WEEKLY|DAILY, INTERVAL, BYDAY, COUNT, UNTIL. Mesačné a ročné pravidlá
 * (narodeniny, sviatky) sa nerozvíjajú — v rozvrhu tréningov nemajú čo robiť a
 * tichý polovičný výsledok je horší než žiadny.
 */
function rozvin(u: SurovaUdalost, odMs: number, doMs: number): string[] {
  const zaklad = u.zaciatokVPasme ?? u.zaciatok;
  const zac = naMs(zaklad);
  if (!u.rrule) return zac >= odMs && zac <= doMs ? [u.zaciatok] : [];

  const p: Record<string, string> = {};
  for (const kus of u.rrule.split(";")) {
    const [k, v] = kus.split("=");
    if (k) p[k.toUpperCase()] = v || "";
  }
  const freq = p.FREQ;
  if (freq !== "WEEKLY" && freq !== "DAILY") return [];

  const krok = Math.max(1, Number(p.INTERVAL || 1));
  const doKedy = p.UNTIL ? naMs((u.pasmo ? vPasme(p.UNTIL, u.pasmo) : naMiestny(p.UNTIL)?.s) || zaklad) : Infinity;
  const maxPocet = p.COUNT ? Number(p.COUNT) : Infinity;
  const DNI = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const byday = (p.BYDAY || "").split(",").filter(Boolean).map((x) => DNI.indexOf(x.slice(-2)));

  const out: string[] = [];
  const den = 86400000;
  const zaciatokDna = new Date(zac);
  // Týždne INTERVALU sa rátajú od začiatku týždňa (WKST, predvolený pondelok),
  // nie od DTSTART: „každé 2 týždne Po a St" so začiatkom v stredu má ďalší
  // pondelok až o 12 dní, nie o 5.
  const wkst = DNI.indexOf((p.WKST || "MO").toUpperCase());
  const zaciatokTyzdna = zac - ((zaciatokDna.getUTCDay() - (wkst < 0 ? 1 : wkst) + 7) % 7) * den;
  // Cudzie pásmo sa od pražského líši o pár hodín: deň rezervy, presne až po prevode.
  const rezerva = u.pasmo ? den : 0;
  let pocet = 0;
  // Rátame po dňoch od pôvodného začiatku; poistka proti nekonečnu je okno.
  for (let t = zac; t <= Math.min(doMs + rezerva, doKedy) && pocet < maxPocet; t += den) {
    const d = new Date(t);
    let sedi: boolean;
    if (freq === "DAILY") {
      sedi = Math.round((t - zac) / den) % krok === 0;
    } else {
      const tyzdnov = Math.floor((t - zaciatokTyzdna) / (7 * den));
      const vTomTyzdni = tyzdnov % krok === 0;
      sedi = vTomTyzdni && (byday.length ? byday.includes(d.getUTCDay()) : d.getUTCDay() === zaciatokDna.getUTCDay());
    }
    if (!sedi) continue;
    pocet++;
    if (t < odMs - rezerva) continue;
    if (!u.pasmo) { out.push(zMs(t)); continue; }
    const vPraze = zPasmaNaPrahu(zMs(t), u.pasmo) ?? zMs(t);
    if (naMs(vPraze) >= odMs && naMs(vPraze) <= doMs) out.push(vPraze);
  }
  return out.filter((s) => !u.exdate.includes(s));
}

/**
 * Zo súboru spraví zoznam konkrétnych hodín v okne.
 *
 * Presunutý jednotlivý výskyt (RECURRENCE-ID) prepíše ten pôvodný, nezdvojí ho
 * — inak by appka hlásila, že tréning aj zmizol, aj pribudol.
 */
/**
 * Môže sa jednorazová udalosť s týmto začiatkom dotknúť okna?
 *
 * Rezerva 14 dní dozadu pokrýva dlhé udalosti, ktoré začali pred oknom
 * a zasahujú doň — bez nej by viacdňová udalosť z okna vypadla.
 */
const REZERVA_MS = 14 * 86400000;
const DEN_MS = 86400000;

/**
 * Hrubé sito na SUROVOM dátume, ešte pred prevodom pásma — musí prepustiť
 * všetko, čo by prepustil `vOkne`, a nič navyše rozhodovať nesmie. Miestny
 * čas sa od surového líši najviac o pár hodín (UTC → Praha je +1/+2 a môže
 * prekročiť polnoc), preto deň rezervy na oboch stranách; presná podmienka
 * sa uplatní až po prevode.
 */
function mozeDoOkna(surova: string, odMs: number, doMs: number): boolean {
  const m = PLATNY_CAS.exec(surova.trim());
  if (!m) return true;
  const den = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return den + 2 * DEN_MS >= odMs - REZERVA_MS && den - DEN_MS <= doMs;
}

/** Z rozpracovanej udalosti spraví surovú — alebo ju zahodí, keď do okna nemôže. */
function dokonci(a: Rozrobena, odMs: number, doMs: number): SurovaUdalost | null {
  if (!a.uid || !a.start) return null;
  // Série a presunuté výskyty sa držia vždy (séria z 2023 môže mať výskyt
  // budúci týždeň); jednorazové len keď ich surový dátum pripúšťa okno.
  if (!(a.rrule || a.recId || mozeDoOkna(a.start, odMs, doMs))) return null;
  const s = naMiestny(a.start, a.startPasmo);
  if (!s) return null;
  const u: SurovaUdalost = {
    uid: a.uid, zaciatok: s.s, celodenna: s.celodenna, koniec: "", nazov: a.nazov,
    rrule: a.rrule, exdate: [], zruseny: a.zruseny,
  };
  if (a.rrule && a.startPasmo && !s.celodenna) {
    const nastenny = vPasme(a.start, a.startPasmo);
    // Séria z neznámeho pásma (prevod nevyšiel) sa rozvíja ako doteraz, v stojacom čase.
    if (nastenny && nastenny !== s.s) { u.pasmo = a.startPasmo; u.zaciatokVPasme = nastenny; }
  }
  if (a.end) { const e = naMiestny(a.end, a.endPasmo); if (e) u.koniec = e.s; }
  if (a.recId) { const v = naMiestny(a.recId, a.recPasmo); if (v) u.recurrenceId = v.s; }
  for (const x of a.exdate) { const v = naMiestny(x, a.exdatePasmo); if (v) u.exdate.push(v.s); }
  return u.rrule || u.recurrenceId || vOkne(u.zaciatok, odMs, doMs) ? u : null;
}
function vOkne(zaciatok: string, odMs: number, doMs: number): boolean {
  const t = Date.parse(zaciatok.length <= 10 ? `${zaciatok}T00:00:00Z` : zaciatok);
  if (!Number.isFinite(t)) return true; // nečitateľný dátum radšej nechaj prejsť
  return t >= odMs - REZERVA_MS && t <= doMs;
}

export function citajIcal(text: string, odMs: number, doMs: number): IcalUdalost[] {
  const riadky = spojRiadky(text);
  const surove: SurovaUdalost[] = [];
  let akt: Rozrobena | null = null;

  for (const r of riadky) {
    if (r.startsWith("BEGIN:VEVENT")) {
      akt = { uid: "", nazov: "", zruseny: false, exdate: [] };
      continue;
    }
    if (r.startsWith("END:VEVENT")) {
      // ZAHOĎ HNEĎ, ČO NEMÔŽE DO OKNA SPADNÚŤ.
      //
      // Do 24. 8. 2026 sa do pamäte načítali všetky udalosti z kalendára
      // (Terezka 7 998, Jerry 7 467) a filtrovalo sa až na konci — pritom do
      // okna ich patrí okolo stotridsať. Worker na tom vyhorel s „exceeded
      // resource limits" a keďže zomrel pred zápisom chyby, jej kalendár sa
      // týždeň nesťahoval a nikto sa to nedozvedel.
      //
      // Opakované série a presunuté výskyty sa držať MUSIA aj keď začali dávno:
      // séria z roku 2023 môže mať výskyt budúci týždeň.
      const hotova = akt ? dokonci(akt, odMs, doMs) : null;
      if (hotova) surove.push(hotova);
      akt = null;
      continue;
    }
    if (!akt) continue;

    const dvojbodka = r.indexOf(":");
    if (dvojbodka < 0) continue;
    const kluc = r.slice(0, dvojbodka);
    const hodnota = r.slice(dvojbodka + 1);
    const meno = kluc.split(";")[0].toUpperCase();

    if (meno === "UID") akt.uid = hodnota.trim();
    else if (meno === "SUMMARY") akt.nazov = odescapuj(hodnota);
    else if (meno === "STATUS") akt.zruseny = hodnota.trim().toUpperCase() === "CANCELLED";
    else if (meno === "RRULE") akt.rrule = hodnota.trim();
    // Časy sa len odložia surové (a len platné — neplatný riadok nesmie
    // prepísať skorší platný, presne ako predtým); prevod až v `dokonci`.
    else if (meno === "DTSTART") { if (PLATNY_CAS.test(hodnota.trim())) { akt.start = hodnota; akt.startPasmo = cudziePasmo(kluc); } }
    else if (meno === "DTEND") { if (PLATNY_CAS.test(hodnota.trim())) { akt.end = hodnota; akt.endPasmo = cudziePasmo(kluc); } }
    else if (meno === "RECURRENCE-ID") { if (PLATNY_CAS.test(hodnota.trim())) { akt.recId = hodnota; akt.recPasmo = cudziePasmo(kluc); } }
    else if (meno === "EXDATE") {
      akt.exdatePasmo = cudziePasmo(kluc) ?? akt.exdatePasmo;
      for (const kus of hodnota.split(",")) if (PLATNY_CAS.test(kus.trim())) akt.exdate.push(kus);
    }
  }

  // Najprv výnimky — aby sa vedelo, ktoré výskyty pravidla sa majú vynechať.
  const vynimky = new Map<string, SurovaUdalost>();
  for (const u of surove) if (u.recurrenceId) vynimky.set(`${u.uid}|${u.recurrenceId}`, u);

  const out: IcalUdalost[] = [];
  const videne = new Set<string>();
  const pridaj = (uid: string, zac: string, kon: string, nazov: string, celodenna: boolean) => {
    const k = `${uid}|${zac}`;
    if (videne.has(k)) return;
    videne.add(k);
    out.push({ uid: k, zaciatok: zac, koniec: kon, nazov, celodenna });
  };

  for (const u of surove) {
    if (u.zruseny) continue;
    const trvanie = u.koniec ? naMs(u.koniec) - naMs(u.zaciatok) : 3600000;
    if (u.recurrenceId) {
      // Presunutý výskyt: kľúč nesie PÔVODNÝ čas, takže sa v appke javí ako tá
      // istá hodina, ktorá sa posunula — a nie ako zrušenie plus nová.
      const zac = naMs(u.zaciatok);
      if (zac >= odMs && zac <= doMs) {
        pridaj(u.uid, u.recurrenceId, zMs(zac + trvanie), u.nazov, u.celodenna);
        // Nahradíme čas, ale kľúč zostáva pôvodný — o posune hovorí zaciatok.
        const posl = out[out.length - 1];
        posl.zaciatok = u.zaciatok;
        posl.koniec = zMs(zac + trvanie);
      }
      continue;
    }
    for (const zac of rozvin(u, odMs, doMs)) {
      if (vynimky.has(`${u.uid}|${zac}`)) continue; // rieši sa vyššie
      pridaj(u.uid, zac, zMs(naMs(zac) + trvanie), u.nazov, u.celodenna);
    }
  }
  return out.sort((a, b) => a.zaciatok.localeCompare(b.zaciatok));
}
