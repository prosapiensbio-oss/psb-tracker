/**
 * POCITOVKA — čo si klient sám klepne na svojej stránke.
 *
 * Jerry, 30. 9. 2026: „do SMS pridať nejaký subjektívny progres vnímania
 * pokroku… to, čo sme povedali, že robiť nebudeme, lebo je to robota navyše,
 * tak že by to robil ten klient sám." A o hodinu neskôr to, čo z toho robí
 * meranie a nie anketu: „v anamnéze môže človek zakliknúť, ak ho niečo bolí,
 * preto by mala byť tá správa personalizovaná a človek by mohol zaškrtávať
 * stále tie svoje problémy, ktoré mal na počiatku."
 *
 * Preto sa nepýta „koľko ťa bolí" všeobecne, ale NA TO, S ČÍM PRIŠIEL —
 * na oblasti z jeho vlastnej anamnézy, v tom istom tvare a na tej istej
 * stupnici 0–10. Prvá hodnota je tým pádom to, čo povedal na úvodnom,
 * a graf v profile má odkiaľ začať.
 *
 * JEDEN SMER: nižšie číslo je lepšie, a stojí to pri stupnici napísané
 * slovom — Jerry, 30. 9. 2026: „vedľa nuly naľavo daj najlepšie a vedľa 10
 * napravo daj najhoršie." Vtedy sa nedá pomýliť a netreba si pamätať nič.
 *
 * JE TO DOBROVOĽNÉ. Jerry, 30. 9. 2026: „toto je vec, ktorou nechceme
 * klientov obťažovať, toto by mali spraviť, keď tak, z vlastnej vôle —
 * nie je to povinné." Preto to stojí napísané hneď pri nadpise, nič sa
 * nevynucuje a nič sa nepredklepáva.
 */

/** Oblasť bolesti a jej sila — TEN ISTÝ tvar, aký má anamnéza. */
export type Oblast = { oblast: string; sila: number | null };

export const STUPNICA = { min: 0, max: 10, nizke: "najlepšie", vysoke: "najhoršie" };

/** Keď v anamnéze nie sú oblasti, pýta sa jeden všeobecný riadok. */
export const CELKOVO = "celkovo";

/**
 * Posun NIE JE stupnica, sú to tri možnosti (Jerry, 30. 9. 2026: „vôbec,
 * trochu, veľmi — zaškrtávacie políčko"). Je to otázka na pocit zo zmeny,
 * nie na stav tela, a desať stupňov by z nej spravilo meranie, ktorým nie je.
 */
export const POSUN = {
  id: "posun" as const,
  text: "Cítiš, že sa v tele niečo mení k lepšiemu?",
  moznosti: [
    { hodnota: 1, text: "vôbec" },
    { hodnota: 2, text: "trochu" },
    { hodnota: 3, text: "veľmi" },
  ],
};

export const POZNAMKA = {
  id: "poznamka" as const,
  text: "Čo sa zmenilo?",
  pomoc: "Čokoľvek, čo by sme mali vedieť — aj keď je to k horšiemu. Nemusíš písať nič.",
};

export type Meranie = {
  datum: string;
  oblasti: Oblast[];
  posun: number | null;
  poznamka: string;
};

/**
 * Hodnota zo stránky. Mimo 0–10 a čokoľvek, čo nie je celé číslo, je `null`
 * — prázdna odpoveď. Klient nemusí odpovedať na všetko.
 */
export function platnaHodnota(x: unknown, min = 0, max = 10): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).trim());
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** Oblasti z uloženého JSON — čo nemá meno, nie je oblasť. */
export function oblastiZJson(s: unknown): Oblast[] {
  let x: unknown = s;
  if (typeof s === "string") { try { x = JSON.parse(s); } catch { return []; } }
  if (!Array.isArray(x)) return [];
  return x
    .map((o) => {
      const r = o as { oblast?: unknown; sila?: unknown };
      const meno = String(r?.oblast ?? "").trim();
      return meno ? { oblast: meno, sila: platnaHodnota(r?.sila) } : null;
    })
    .filter((o): o is Oblast => !!o);
}

export type Bod = { datum: string; hodnota: number };

export type Rad = {
  /** Oblasť tela, alebo `CELKOVO`, keď anamnéza žiadne neuvádza. */
  kluc: string;
  nazov: string;
  body: Bod[];
  prva: number;
  posledna: number;
  /** Kladné = zlepšenie. Nižšie číslo je lepšie v celej pocitovke. */
  lepsieO: number;
  dni: number;
};

export type ZhrnutiePocitov = {
  pocet: number;
  posledne?: Meranie;
  rady: Rad[];
  /** Posledná odpoveď na „cítiš zmenu" a posledný napísaný odkaz. */
  posun?: { hodnota: number; text: string; datum: string };
  odkazy: { datum: string; text: string }[];
};

const denDo = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * Rady na graf a čísla k nim.
 *
 * Každá oblasť je VLASTNÝ rad s vlastným začiatkom: klient pridá „koleno"
 * až po mesiaci a spoločný začiatok by mu ho porovnával s krkom.
 */
export function zhrnutiePocitov(merania: Meranie[]): ZhrnutiePocitov {
  const zoradene = merania.slice().sort((a, b) => a.datum.localeCompare(b.datum));

  const zbierka = new Map<string, Bod[]>();
  const pridaj = (kluc: string, datum: string, hodnota: number | null) => {
    if (hodnota == null) return;
    zbierka.set(kluc, [...(zbierka.get(kluc) || []), { datum, hodnota }]);
  };
  for (const m of zoradene) {
    for (const o of m.oblasti) pridaj(o.oblast, m.datum, o.sila);
  }

  const rady: Rad[] = [...zbierka.entries()].map(([kluc, body]) => ({
    kluc,
    nazov: kluc === CELKOVO ? "bolesť celkovo" : kluc,
    body,
    prva: body[0].hodnota,
    posledna: body[body.length - 1].hodnota,
    lepsieO: body[0].hodnota - body[body.length - 1].hodnota,
    dni: denDo(body[0].datum, body[body.length - 1].datum),
  }));
  rady.sort((a, b) => a.nazov.localeCompare(b.nazov));

  const poslednyPosun = [...zoradene].reverse().find((m) => m.posun != null);
  const posun = poslednyPosun && poslednyPosun.posun != null
    ? {
      hodnota: poslednyPosun.posun,
      text: POSUN.moznosti.find((x) => x.hodnota === poslednyPosun.posun)?.text || "",
      datum: poslednyPosun.datum,
    }
    : undefined;

  return {
    pocet: zoradene.length,
    posledne: zoradene[zoradene.length - 1],
    rady,
    posun,
    odkazy: zoradene.filter((m) => m.poznamka.trim()).map((m) => ({ datum: m.datum, text: m.poznamka.trim() })).reverse(),
  };
}

/**
 * Posledná známa hodnota pre každú oblasť a dátum, kedy ju klient povedal.
 *
 * Kreslí sa na stránke ako OBRYS, nie ako predklepnutá odpoveď — Jerry,
 * 30. 9. 2026: „pôvodnú odpoveď nevyznačuj napevno, ale iba daj napr. inou
 * farbou alebo orámikuj." Predklepnutá odpoveď by sa odoslala aj vtedy, keď
 * sa jej klient ani nedotkol, a z „nechcelo sa mi" by spravila tvrdenie
 * o jeho tele.
 */
export function posledneHodnoty(merania: Meranie[]): Record<string, { hodnota: number; datum: string }> {
  const von: Record<string, { hodnota: number; datum: string }> = {};
  for (const m of merania.slice().sort((a, b) => a.datum.localeCompare(b.datum))) {
    for (const o of m.oblasti) if (o.sila != null) von[o.oblast] = { hodnota: o.sila, datum: m.datum };
    if (m.posun != null) von[POSUN.id] = { hodnota: m.posun, datum: m.datum };
  }
  return von;
}

/**
 * Veta pre obrazovku aj pre Jarvisa — jedno znenie, aby dve miesta
 * nehovorili o tom istom inak.
 *
 * Jeden záznam NIE JE výsledok: „zostal rok" je vernosť, nie zlepšenie,
 * a jedna sedmička je len sedmička. Kým nie sú dva, veta to povie.
 */
export function vetaOPocitoch(z: ZhrnutiePocitov): string {
  if (!z.pocet || !z.posledne) return "Klient sa zatiaľ nehodnotil.";
  const kusy = z.rady.map((r) => {
    const smer = r.body.length < 2 ? ""
      : r.lepsieO > 0 ? ` (lepšie o ${r.lepsieO} za ${r.dni} dní)`
        : r.lepsieO < 0 ? ` (horšie o ${-r.lepsieO} za ${r.dni} dní)`
          : ` (bez zmeny za ${r.dni} dní)`;
    return `${r.nazov}: ${r.posledna}/10${smer}`;
  });
  if (z.posun) kusy.push(`zmenu k lepšiemu cíti: ${z.posun.text}`);
  if (!kusy.length) return "Klient sa zatiaľ nehodnotil.";
  const zaklad = `${z.posledne.datum} — ${kusy.join(", ")}`;
  const maPorovnanie = z.rady.some((r) => r.body.length > 1);
  return maPorovnanie ? zaklad : `${zaklad}. Je to prvé hodnotenie, porovnávať sa nemá s čím.`;
}
