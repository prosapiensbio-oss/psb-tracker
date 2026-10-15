/**
 * PONUKA TERMÍNOV — čisté pravidlá (Jerry, 7. 10. 2026).
 *
 * Tréner v Kokpite naťuká voľné časy zo svojho týždňa, Kokpit z nich spraví
 * odkaz `/t/<token>` a klient si jeden vyberie. Tu je všetko, čo sa dá
 * odskúšať bez databázy: čo je ešte voľné, dokedy ponuka platí, text SMS.
 *
 * Časy sú PRAŽSKÉ BEZ PÁSMA ('RRRR-MM-DDTHH:MM'), rovnako ako
 * `kal_udalosti.zaciatok` — porovnávajú sa ako reťazce (pamäť „Deň podľa
 * Prahy": nikdy cez Date.parse, server je v UTC).
 */

export type CasPonuky = { id: string; trener: string; zaciatok: string; koniec: string };
export type Obsadene = { trener: string; zaciatok: string; koniec: string };

const minuta = (s: string) => String(s || "").slice(0, 16);

/** Prekrývajú sa dva úseky? Dotyk (koniec = začiatok) nie je prekryv. */
export function prekryva(a: { zaciatok: string; koniec: string }, b: { zaciatok: string; koniec: string }): boolean {
  return minuta(a.zaciatok) < minuta(b.koniec) && minuta(b.zaciatok) < minuta(a.koniec);
}

/** Tréning, ktorý si klient z ponuky vyberá, trvá hodinu. */
export const DLZKA_TRENINGU = 60;
const naMin = (s: string) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
const zMin = (den: string, m: number) => `${den}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Je ponúknutý čas ROZMEDZIE (dlhší než tréning), v ktorom si klient vyberá začiatok? */
export const jeRozmedzie = (c: { zaciatok: string; koniec: string }): boolean => naMin(c.koniec) - naMin(c.zaciatok) > DLZKA_TRENINGU;

/**
 * Kedy môže tréning v ponúknutom čase začať (Jerry, 11. 10. 2026: „nastavím
 * si, že mám čas odvtedy dovtedy, a človek si len vyberie, kedy by v tom
 * rozmedzí mohol byť").
 *
 * Krok 15 minút, celá hodina musí byť vnútri rozmedzia, nie v minulosti
 * a bez udalosti toho istého trénera. Na výber ide celá a pol hodina —
 * štvrťhodiny by z rozmedzia 14–18 spravili trinásť tlačidiel — PLUS prvý
 * voľný začiatok po obsadenom úseku (tréning do 15:15 → ponúkne sa 15:15),
 * inak by riedenie zjedlo jediný voľný čas. Hodinový čas (starý tvar
 * ponuky) má presne jeden začiatok.
 */
export function zaciatkyVRozmedzi(c: CasPonuky, obsadene: Obsadene[], teraz: string, dlzka = DLZKA_TRENINGU): string[] {
  const den = c.zaciatok.slice(0, 10);
  const od = naMin(c.zaciatok), doM = naMin(c.koniec);
  const volne: number[] = [];
  for (let m = od; m + dlzka <= doM; m += 15) {
    const z = zMin(den, m), k = zMin(den, m + dlzka);
    if (z <= minuta(teraz)) continue;
    if (obsadene.some((o) => o.trener === c.trener && prekryva({ zaciatok: z, koniec: k }, o))) continue;
    volne.push(m);
  }
  return volne.filter((m, i) => m % 30 === 0 || i === 0 || volne[i - 1] !== m - 15).map((m) => zMin(den, m));
}

/** Vybraný úsek: v rozmedzí od zvoleného začiatku hodinu, inak celý ponúknutý čas. */
export function vybranyUsek(c: CasPonuky, vybranyZaciatok: string | null | undefined): CasPonuky {
  if (!vybranyZaciatok) return c;
  const z = minuta(vybranyZaciatok);
  return { ...c, zaciatok: z, koniec: zMin(z.slice(0, 10), naMin(z) + DLZKA_TRENINGU) };
}

/**
 * Ktoré ponúknuté časy sú ešte voľné: majú aspoň jeden možný začiatok —
 * bez udalosti toho istého trénera (živej — zmiznutú volajúci vynechá),
 * bez termínu, ktorý si už vybral niekto z inej ponuky, a nie v minulosti.
 */
export function volneCasy(casy: CasPonuky[], obsadene: Obsadene[], teraz: string): CasPonuky[] {
  return casy.filter((c) => zaciatkyVRozmedzi(c, obsadene, teraz).length > 0);
}

/** Nedeľa týždňa, v ktorom je deň (RRRR-MM-DD). */
export function nedelaTyzdna(den: string): string {
  const d = new Date(`${den.slice(0, 10)}T12:00:00Z`);
  const doNedele = (7 - d.getUTCDay()) % 7;
  return new Date(d.getTime() + doNedele * 86400000).toISOString().slice(0, 10);
}

/**
 * Dokedy ponuka platí: do konca týždňa POSLEDNÉHO ponúknutého termínu
 * (Jerry: „do konca týždňa alebo dokým sa ten termín nezaplní"). Ponuka
 * na budúci týždeň, poslaná v piatok, tak neskončí o dva dni.
 */
export function platiDo(casy: { zaciatok: string }[]): string {
  const posledny = casy.map((c) => c.zaciatok.slice(0, 10)).sort().pop() || "";
  return posledny ? nedelaTyzdna(posledny) : "";
}

/** Stav ponuky pre stránku aj zoznam v Kokpite. */
export function stavPonuky(p: { plati_do: string; vybrany_id: string | null; zrusene_at: string | null }, dnes: string, volnych: number):
  "vybrane" | "zrusene" | "vyprsala" | "obsadene" | "caka" {
  if (p.vybrany_id) return "vybrane";
  if (p.zrusene_at) return "zrusene";
  if (dnes > p.plati_do) return "vyprsala";
  if (volnych === 0) return "obsadene";
  return "caka";
}

/** Prekrývajú sa časy v rámci jednej ponuky toho istého trénera? (preklep pri ťukaní) */
export function prekryvVPonuke(casy: { trener: string; zaciatok: string; koniec: string }[]): boolean {
  return casy.some((a, i) => casy.some((b, j) => j > i && a.trener === b.trener && prekryva(a, b)));
}

/**
 * KDE ZAČNE TERMÍN PO KLIKU (Jerry, 15. 10. 2026: „dám jeden ráno a druhý
 * večer, vysvieti sa mi ten deň na červeno a neudeje sa nič").
 *
 * Klik určí štvrťhodinu, v ktorej termín ZAČNE. Pri večernej hodine 20:00
 * to znamenalo, že klik do jej spodnej polovice chcel 20:30–21:30, za koniec
 * mriežky — a ten istý problém tesne pred obsadenou hodinou (15:30, keď je
 * o 16:00 tréning). Termín sa preto posunie hore po 15 minútach, najviac
 * o 45 — tak, aby kliknuté miesto zostalo vnútri hodiny. Keď sa nezmestí
 * ani tak, vráti dôvod, ktorý obrazovka povie nahlas.
 */
export function zaciatokPoKliku(
  klik: number,
  o: { odMin: number; doMax: number; dlzka?: number; obsadene: (od: number, doMin: number) => boolean; vMinulosti: (od: number) => boolean },
): { od: number } | { dovod: string } {
  const dlzka = o.dlzka ?? DLZKA_TRENINGU;
  let dovod = "";
  for (let posun = 0; posun < dlzka; posun += 15) {
    const od = klik - posun;
    if (od < o.odMin) break;
    if (od + dlzka > o.doMax) { dovod ||= `Hodina sa do ${Math.floor(o.doMax / 60)}:${String(o.doMax % 60).padStart(2, "0")} nezmestí.`; continue; }
    if (o.vMinulosti(od)) { dovod = "Tento čas už bol."; continue; }
    if (o.obsadene(od, od + dlzka)) { dovod = "V tomto čase je už tréning alebo iný termín."; continue; }
    return { od };
  }
  return { dovod: dovod || "Sem sa hodina nezmestí." };
}

const DNI_CZ = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
const DNI_CZ_VELKE = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];
/** „Pondělí 13. 10." — deň v týždni pre stránku klienta. */
export function denCz(den: string, velke = true): string {
  const d = new Date(`${den.slice(0, 10)}T12:00:00Z`);
  const [, m, dd] = den.slice(0, 10).split("-").map(Number);
  return `${(velke ? DNI_CZ_VELKE : DNI_CZ)[d.getUTCDay()]} ${dd}. ${m}.`;
}
export const casHHMM = (s: string) => `${Number(s.slice(11, 13))}:${s.slice(14, 16)}`;

/**
 * SMS s odkazom. Krátka — s diakritikou má jedna SMS 70 znakov a odkaz
 * zaberie väčšinu (pamäť „SMS je zvonček"). Stav (koľko termínov, kedy)
 * nenesie: ten povie stránka, ktorá je vždy aktuálna.
 */
export function textSmsPonuky(oslovenie: string, url: string, podpis: string): string {
  const o = oslovenie.trim();
  return `${o ? `${o}, p` : "P"}osílám volné termíny, vyberte si: ${url} ${podpis}`.trim();
}

/**
 * Pražský čas bez pásma → UTC v tvare pre .ics (`20261013T080000Z`).
 * Posun sa berie v DANÝ okamih (letný/zimný čas), nie dnes.
 */
export function prahaNaUtcIcs(zaciatok: string): string {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const posun = (t: number) => Date.parse(`${f.format(new Date(t)).replace(" ", "T")}:00Z`) - Math.floor(t / 60000) * 60000;
  const t0 = Date.parse(`${zaciatok.slice(0, 16)}:00Z`);
  const t = t0 - posun(t0 - posun(t0));
  return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Kalendárová udalosť (.ics) pre tlačidlo „Přidat do kalendáře". */
export function icsTerminu(t: { uid: string; zaciatok: string; koniec: string; nazov: string; miesto?: string }): string {
  const esc = (s: string) => s.replace(/[\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ProSapiens//Kokpit//CS", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${t.uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${prahaNaUtcIcs(t.zaciatok)}`,
    `DTEND:${prahaNaUtcIcs(t.koniec)}`,
    `SUMMARY:${esc(t.nazov)}`,
    ...(t.miesto ? [`LOCATION:${esc(t.miesto)}`] : []),
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
