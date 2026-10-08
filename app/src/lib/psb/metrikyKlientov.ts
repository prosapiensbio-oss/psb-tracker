/**
 * METRIKY KLIENTOV PRE REPORT (výskum Jerryho knižnice, 8. 10. 2026 —
 * docs/metriky-z-knih.md). Čisté funkcie nad sedeniami, balíčkami a platbami;
 * App ich volá pre každý mesiac reportu, aby sa dali porovnať s priemerom.
 *
 *  - obnova balíčkov   (Money Models, Built to Sell)
 *  - prežitie 100 dní  (Never Lose a Customer Again)
 *  - retencia 6 mes.   (Measure What Matters — Jerryho cieľ 80 %)
 *  - odchody v %       (Fighting Churn)
 *  - koncentrácia      (Built to Sell — žiadny klient nad 15 %)
 *  - hodnota klienta   (Loyalty Effect)
 */

type Sedenie = { date: string; client: string };
type Balicek = { klient: string; nazov: string; platnost_od: string; platnost_do: string | null; zrusene_at: string | null };
type Platba = { klient: string; datum: string; suma: number };

const den = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const DEN = 86400000;
const posunMes = (m: string, n: number) => { const [y, mm] = m.split("-").map(Number); return new Date(Date.UTC(y, mm - 1 + n, 1)).toISOString().slice(0, 7); };
const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
/** Doplnenie členstva a úvodný tréning nie sú balíček, ktorý sa „obnovuje". */
const jeObnovitelny = (nazov: string) => !/doplnen|uvodn|úvodn/i.test(nazov);

/**
 * OBNOVA BALÍČKOV v mesiaci: balíčky, ktorým v mesiaci skončila platnosť,
 * a či po nich prišiel ďalší — nový balíček (od 20 dní pred koncom do 30 po),
 * alebo PLATBA nad 1 100 Kč v tom istom okne. Platba je tu dôležitá: Gerich
 * 30. 9. zaplatil 12 lekcií, balíček mu v Kokpite vznikol až 7. 10. —
 * podľa balíčka by vyzeral ako ten, kto neobnovil (Jerry, 8. 10. 2026).
 */
export function obnovaBalickov(balicky: Balicek[], platby: Platba[], mesiac: string): { skoncilo: number; obnovene: number; bezObnovy: { klient: string; do: string }[] } {
  const zive = balicky.filter((b) => !b.zrusene_at);
  const skoncene = zive.filter((b) => b.platnost_do && b.platnost_do.slice(0, 7) === mesiac && jeObnovitelny(b.nazov));
  // Klient s dvoma balíčkami končiacimi v tom istom mesiaci sa ráta raz (posledný).
  const posledny = new Map<string, Balicek>();
  for (const b of skoncene) { const k = norm(b.klient); const x = posledny.get(k); if (!x || (b.platnost_do as string) > (x.platnost_do as string)) posledny.set(k, b); }
  let obnovene = 0;
  const bezObnovy: { klient: string; do: string }[] = [];
  for (const b of posledny.values()) {
    const koniec = den(b.platnost_do as string);
    const v = (d: string) => den(d) >= koniec - 20 * DEN && den(d) <= koniec + 30 * DEN;
    const k = norm(b.klient);
    const novyBalicek = zive.some((x) => x !== b && norm(x.klient) === k && jeObnovitelny(x.nazov) && v(x.platnost_od));
    const platba = platby.some((p) => norm(p.klient) === k && p.suma > 1100 && v(p.datum));
    if (novyBalicek || platba) obnovene++;
    else bezObnovy.push({ klient: b.klient, do: (b.platnost_do as string).slice(0, 10) });
  }
  return { skoncilo: posledny.size, obnovene, bezObnovy: bezObnovy.sort((a, b) => a.do.localeCompare(b.do)) };
}

/** Prvý tréning každého klienta. */
export function prveTreningy(sedenia: Sedenie[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of sedenia) { const d = s.date.slice(0, 10); const x = m.get(s.client); if (!x || d < x) m.set(s.client, d); }
  return m;
}

/**
 * PREŽITIE PRVÝCH 100 DNÍ: noví klienti z mesiaca M−4 (vtedy majú 100 dní
 * celé za sebou), z nich koľkí trénovali aj po stom dni.
 */
export function prezitie100(sedenia: Sedenie[], mesiac: string, prve = prveTreningy(sedenia)): { kohorta: string; novi: number; ostali: number } {
  const kohorta = posunMes(mesiac, -4);
  const novi = [...prve.entries()].filter(([, d]) => d.slice(0, 7) === kohorta);
  const poslednyDen = new Map<string, string>();
  for (const s of sedenia) { const d = s.date.slice(0, 10); if (d.slice(0, 7) > mesiac) continue; const x = poslednyDen.get(s.client); if (!x || d > x) poslednyDen.set(s.client, d); }
  const ostali = novi.filter(([k, d]) => (poslednyDen.get(k) || "") >= new Date(den(d) + 100 * DEN).toISOString().slice(0, 10)).length;
  return { kohorta, novi: novi.length, ostali };
}

const klientiMesiaca = (sedenia: Sedenie[], m: string) => new Set(sedenia.filter((s) => s.date.slice(0, 7) === m).map((s) => s.client));

/** RETENCIA PO 6 MESIACOCH: z klientov, ktorí trénovali v M−6, koľkí trénovali v M. */
export function retencia6(sedenia: Sedenie[], mesiac: string): { kohorta: number; ostali: number } {
  const pred = klientiMesiaca(sedenia, posunMes(mesiac, -6));
  const teraz = klientiMesiaca(sedenia, mesiac);
  return { kohorta: pred.size, ostali: [...pred].filter((k) => teraz.has(k)).length };
}

/** ODCHODY: trénovali v M−1, v M nie — počet a podiel z klientov M−1. */
export function odchody(sedenia: Sedenie[], mesiac: string): { pred: number; odisli: number } {
  const pred = klientiMesiaca(sedenia, posunMes(mesiac, -1));
  const teraz = klientiMesiaca(sedenia, mesiac);
  return { pred: pred.size, odisli: [...pred].filter((k) => !teraz.has(k)).length };
}

/** KONCENTRÁCIA tržieb za obdobie: podiel najväčšieho klienta a horných 20 % klientov. */
export function koncentracia(platby: Platba[], mesiace: string[]): { spolu: number; topKlient?: { klient: string; podiel: number }; top20: number } {
  const podla = new Map<string, number>();
  for (const p of platby) if (mesiace.includes(p.datum.slice(0, 7))) podla.set(p.klient, (podla.get(p.klient) || 0) + p.suma);
  const zoradene = [...podla.entries()].sort((a, b) => b[1] - a[1]);
  const spolu = zoradene.reduce((a, [, v]) => a + v, 0);
  if (!spolu) return { spolu: 0, top20: 0 };
  const n20 = Math.max(1, Math.round(zoradene.length * 0.2));
  return {
    spolu,
    topKlient: { klient: zoradene[0][0], podiel: (zoradene[0][1] / spolu) * 100 },
    top20: (zoradene.slice(0, n20).reduce((a, [, v]) => a + v, 0) / spolu) * 100,
  };
}

/**
 * HODNOTA KLIENTA ZA CELÚ SPOLUPRÁCU: klienti, ktorí odišli (posledný tréning
 * viac než 60 dní pred koncom obdobia, prvý od 2025 — skôr export nesiaha),
 * priemer ich platieb a dĺžka spolupráce. Kto zaplatil len úvodný, sa neráta.
 */
export function hodnotaKlienta(sedenia: Sedenie[], platby: Platba[], koniecObdobia: string): { pocet: number; priemer: number; mesiacov: number } {
  const prvy = new Map<string, string>(), posl = new Map<string, string>();
  for (const s of sedenia) {
    const d = s.date.slice(0, 10);
    if (d > koniecObdobia) continue;
    if (!prvy.has(s.client) || d < (prvy.get(s.client) as string)) prvy.set(s.client, d);
    if (!posl.has(s.client) || d > (posl.get(s.client) as string)) posl.set(s.client, d);
  }
  const zaplatil = new Map<string, number>();
  for (const p of platby) if (p.datum.slice(0, 10) <= koniecObdobia) zaplatil.set(norm(p.klient), (zaplatil.get(norm(p.klient)) || 0) + p.suma);
  const hranica = new Date(den(koniecObdobia) - 60 * DEN).toISOString().slice(0, 10);
  const odisli = [...posl.entries()].filter(([k, d]) => d < hranica && (prvy.get(k) || "") >= "2025-01-01" && (zaplatil.get(norm(k)) || 0) > 1100);
  if (!odisli.length) return { pocet: 0, priemer: 0, mesiacov: 0 };
  const priemer = odisli.reduce((a, [k]) => a + (zaplatil.get(norm(k)) || 0), 0) / odisli.length;
  const mesiacov = odisli.reduce((a, [k, d]) => a + (den(d) - den(prvy.get(k) as string)) / (30.4 * DEN), 0) / odisli.length;
  return { pocet: odisli.length, priemer, mesiacov };
}
