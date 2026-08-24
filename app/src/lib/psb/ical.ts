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

/** Posun pásma pre daný okamih — z Intl, takže letný čas rieši systém, nie my. */
function posunMinut(d: Date, pasmo: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: pasmo, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) if (x.type !== "literal") p[x.type] = x.value;
  const akoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return (akoUtc - d.getTime()) / 60000;
}

const PASMO = "Europe/Prague";

/** "20260803T090000" / "20260803T070000Z" / "20260803" → "2026-08-03T09:00" */
function naMiestny(hodnota: string): { s: string; celodenna: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(hodnota.trim());
  if (!m) return null;
  const [, r, mes, d, h, min, , z] = m;
  if (!h) return { s: `${r}-${mes}-${d}T00:00`, celodenna: true };
  if (z) {
    const utc = Date.UTC(+r, +mes - 1, +d, +h, +min);
    const posun = posunMinut(new Date(utc), PASMO);
    const l = new Date(utc + posun * 60000);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return {
      s: `${l.getUTCFullYear()}-${p2(l.getUTCMonth() + 1)}-${p2(l.getUTCDate())}T${p2(l.getUTCHours())}:${p2(l.getUTCMinutes())}`,
      celodenna: false,
    };
  }
  // Bez Z je hodnota už miestna (TZID) — berieme ju tak, ako stojí.
  return { s: `${r}-${mes}-${d}T${h}:${min}`, celodenna: false };
}

const naMs = (s: string) => Date.parse(`${s}:00Z`);
const zMs = (ms: number) => new Date(ms).toISOString().slice(0, 16);

type SurovaUdalost = {
  uid: string; zaciatok: string; koniec: string; nazov: string; celodenna: boolean;
  rrule?: string; exdate: string[]; recurrenceId?: string; zruseny: boolean;
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
  const zac = naMs(u.zaciatok);
  if (!u.rrule) return zac >= odMs && zac <= doMs ? [u.zaciatok] : [];

  const p: Record<string, string> = {};
  for (const kus of u.rrule.split(";")) {
    const [k, v] = kus.split("=");
    if (k) p[k.toUpperCase()] = v || "";
  }
  const freq = p.FREQ;
  if (freq !== "WEEKLY" && freq !== "DAILY") return [];

  const krok = Math.max(1, Number(p.INTERVAL || 1));
  const doKedy = p.UNTIL ? naMs(naMiestny(p.UNTIL)?.s || u.zaciatok) : Infinity;
  const maxPocet = p.COUNT ? Number(p.COUNT) : Infinity;
  const DNI = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const byday = (p.BYDAY || "").split(",").filter(Boolean).map((x) => DNI.indexOf(x.slice(-2)));

  const out: string[] = [];
  const den = 86400000;
  const zaciatokDna = new Date(zac);
  let pocet = 0;
  // Rátame po dňoch od pôvodného začiatku; poistka proti nekonečnu je okno.
  for (let t = zac; t <= Math.min(doMs, doKedy) && pocet < maxPocet; t += den) {
    const d = new Date(t);
    let sedi: boolean;
    if (freq === "DAILY") {
      sedi = Math.round((t - zac) / den) % krok === 0;
    } else {
      const tyzdnov = Math.floor((t - zac) / (7 * den));
      const vTomTyzdni = tyzdnov % krok === 0;
      sedi = vTomTyzdni && (byday.length ? byday.includes(d.getUTCDay()) : d.getUTCDay() === zaciatokDna.getUTCDay());
    }
    if (!sedi) continue;
    pocet++;
    if (t < odMs) continue;
    out.push(zMs(t));
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
function vOkne(zaciatok: string, odMs: number, doMs: number): boolean {
  const t = Date.parse(zaciatok.length <= 10 ? `${zaciatok}T00:00:00Z` : zaciatok);
  if (!Number.isFinite(t)) return true; // nečitateľný dátum radšej nechaj prejsť
  return t >= odMs - REZERVA_MS && t <= doMs;
}

export function citajIcal(text: string, odMs: number, doMs: number): IcalUdalost[] {
  const riadky = spojRiadky(text);
  const surove: SurovaUdalost[] = [];
  let akt: SurovaUdalost | null = null;

  for (const r of riadky) {
    if (r.startsWith("BEGIN:VEVENT")) {
      akt = { uid: "", zaciatok: "", koniec: "", nazov: "", celodenna: false, exdate: [], zruseny: false };
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
      if (akt && akt.uid && akt.zaciatok && (akt.rrule || akt.recurrenceId || vOkne(akt.zaciatok, odMs, doMs))) {
        surove.push(akt);
      }
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
    else if (meno === "DTSTART") {
      const v = naMiestny(hodnota);
      if (v) { akt.zaciatok = v.s; akt.celodenna = v.celodenna; }
    } else if (meno === "DTEND") {
      const v = naMiestny(hodnota);
      if (v) akt.koniec = v.s;
    } else if (meno === "RECURRENCE-ID") {
      const v = naMiestny(hodnota);
      if (v) akt.recurrenceId = v.s;
    } else if (meno === "EXDATE") {
      for (const kus of hodnota.split(",")) {
        const v = naMiestny(kus);
        if (v) akt.exdate.push(v.s);
      }
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
