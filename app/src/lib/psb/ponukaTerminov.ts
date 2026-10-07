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

/**
 * Ktoré ponúknuté časy sú ešte voľné: nesmú sa prekrývať s udalosťou toho
 * istého trénera (živou — zmiznutú volajúci vynechá) ani s termínom, ktorý si
 * už vybral niekto z inej ponuky. A nesmú byť v minulosti — ponuka na dnes
 * ráno o 8:00 o desiatej už nie je ponuka.
 */
export function volneCasy(casy: CasPonuky[], obsadene: Obsadene[], teraz: string): CasPonuky[] {
  return casy.filter((c) =>
    minuta(c.zaciatok) > minuta(teraz)
    && !obsadene.some((o) => o.trener === c.trener && prekryva(c, o)));
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
