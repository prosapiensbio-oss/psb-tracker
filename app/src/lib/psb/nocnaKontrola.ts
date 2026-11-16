/**
 * NOČNÁ KONTROLA DÁT (Jerry, 16. 11. 2026: „postav nočnú kontrolu").
 *
 * Svatopluk Stoklásek bol v Kokpite „Svetopluk Stoklasko“ (preklep z
 * PTmindera). Jeho platba z banky sa nespárovala a bez klienta išla Jerrymu,
 * nie Terezke. Tréning 12. 11. ostal v kalendári bez klienta a appka sa
 * pýtala, či nie je „duch“, hoci minulý týždeň trénoval. Nič z toho nebola
 * chyba kódu, ale meno toho istého človeka v troch tvaroch: v banke,
 * v kalendári a v Kokpite. Ručná revízia to nájde o týždne neskôr, táto
 * kontrola na druhý deň.
 *
 * Hľadá LEN podobné mená, nie všetko nespárované. Úplne neznáme meno (nový
 * človek, prezývka) je bežná práca vo Workspace, ktorú Jerry s Terezkou robia
 * raz týždenne a nedá sa vždy vyprázdniť. Tu ide o prípad, keď appka klienta
 * pozná, ale nespojila ho, a to sa hlási hneď.
 *
 * Tri pravidlá:
 * - `kalendar`: tréning bez klienta, ktorého názov sa podobá menu známeho klienta;
 * - `platba`: príjem z banky bez návrhu, ktorého odosielateľ sa podobá klientovi;
 * - `meno`: aktívny klient platí v banke pod podobným, ale iným priezviskom.
 */
import { normName } from "./format";

export type DruhNalezu = "kalendar" | "platba" | "meno";
export type NalezDat = {
  druh: DruhNalezu;
  /** Stabilný kľúč pre „Vybavené“: nesie, ČO je zle, nie kedy sa to zistilo. */
  kluc: string;
  /** Komu sa to hlási: tréner klienta alebo kalendára. */
  trener: string;
  /** Klient, ktorého sa nález týka (pri viacerých kandidátoch prvý). */
  klient: string;
  kandidati: string[];
  text: string;
};

const bezY = (s: string) => s.replace(/y/g, "i");
const slova = (s: string) => bezY(normName(s)).split(/[^\p{L}\d]+/u).filter(Boolean);
const koren = (s: string) => s.replace(/(ova)$/, "").replace(/a$/, "");

export function lev(a: string, b: string): number {
  if (a === b) return 0;
  let d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const n = [i];
    for (let j = 1; j <= b.length; j++) n[j] = Math.min(d[j] + 1, n[j - 1] + 1, d[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    d = n;
  }
  return d[b.length];
}

/** Rovnaké priezvisko, len inak napísané (Stoklásek / Stoklasko, Procházka / Prochadzka). */
export function podobnePriezvisko(slovo: string, priezvisko: string): boolean {
  if (slovo.length < 4 || priezvisko.length < 4) return false;
  if (slovo.slice(0, 3) !== priezvisko.slice(0, 3)) return false;
  const tolerancia = Math.min(slovo.length, priezvisko.length) >= 6 ? 2 : 1;
  return lev(slovo, priezvisko) <= tolerancia || lev(koren(slovo), koren(priezvisko)) <= tolerancia;
}

/** Krstné meno alebo jeho zdrobnenina (Svato / Svetopluk, Jarek / Jaroslav). */
export function podobneKrstne(slovo: string, krstne: string): boolean {
  if (slovo.length < 3 || krstne.length < 3) return false;
  return lev(slovo, krstne) <= 2 || slovo.slice(0, 2) === krstne.slice(0, 2);
}

/** Priezvisko klienta stojí v texte presne (alebo v skloňovanom tvare), teda appka by ho našla sama. */
function presnePriezvisko(t: string[], priezvisko: string): boolean {
  return t.some((x) => x === priezvisko || (x.startsWith(priezvisko) && x.length - priezvisko.length <= 3))
    || (koren(priezvisko).length >= 5 && t.some((x) => koren(x) === koren(priezvisko)));
}

/**
 * Klienti, ktorých meno sa v texte podobá, ale nie je tam presne.
 * Keď sedí aj krstné, vyhrávajú tí so zhodou krstného (Svato → Svetopluk,
 * nie Iva Stoklásková); inak sa vrátia všetci s podobným priezviskom.
 */
export function podobniKlienti(text: string, mena: string[]): string[] {
  const t = slova(text);
  if (!t.length) return [];
  const sPriezviskom: { meno: string; krstne: boolean }[] = [];
  for (const m of mena) {
    const casti = slova(m);
    if (casti.length < 2) continue;
    const priezvisko = casti[casti.length - 1];
    if (presnePriezvisko(t, priezvisko)) continue;
    const ktore = t.findIndex((x) => podobnePriezvisko(x, priezvisko));
    if (ktore < 0) continue;
    const krstne = t.some((x, i) => i !== ktore && podobneKrstne(x, casti[0]));
    sPriezviskom.push({ meno: m, krstne });
  }
  const sKrstnym = sPriezviskom.filter((x) => x.krstne);
  return (sKrstnym.length ? sKrstnym : sPriezviskom).map((x) => x.meno);
}

/** Text prevodu, ktorý napísal Jerry sám (posiela za niekoho) — meno v ňom nie je dôkaz. */
const odJerryho = (text: string) => /stranavsk/.test(normName(text));

const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
const den = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}. ${Number(m)}.`;
};

export type VstupKontroly = {
  dnes: string;
  /** Známi klienti (zlúčené tvary mien). */
  klienti: string[];
  /** Tréner klienta podľa posledného tréningu. */
  trenerKlienta: Record<string, string>;
  /** Klienti s tréningom za posledných 60 dní alebo s budúcim termínom. */
  aktivni: string[];
  udalosti: { uid: string; trener: string; zaciatok: string; nazov: string; klient: string | null; typ: string | null; zmizla: boolean }[];
  /** Príjmy z banky bez priradenia, bez pravidla platiteľa a bez „nie je klient“. */
  prijmyBezKlienta: { id: string; datum: string; suma: number; text: string }[];
  /** Priradené platby z banky s textom prevodu. */
  priradene: { klient: string; datum: string; text: string }[];
};

/**
 * Celá kontrola. `trenerKlienta` chýbajúceho klienta → Jerry, lebo peniaze
 * a nejasné veci sú jeho (5. 10. 2026).
 */
export function kontrolujData(v: VstupKontroly): NalezDat[] {
  const out: NalezDat[] = [];
  const trener = (k: string) => v.trenerKlienta[k] || "Jerry";
  const aktivni = new Set(v.aktivni);
  const od = (dni: number) => new Date(Date.parse(`${v.dnes}T00:00:00Z`) + dni * 86400_000).toISOString().slice(0, 10);

  // ── Kalendár: tréning bez klienta, ktorý sa podobá známemu klientovi ──
  // Okno: dva týždne dozadu (tréning, ktorý sa mal započítať) a tri dopredu
  // (termín, ktorý chráni pred otázkou „duch“).
  const nazvy = new Map<string, { trener: string; nazov: string; dni: string[] }>();
  for (const u of v.udalosti) {
    if (u.klient || u.zmizla) continue;
    if (u.typ && u.typ !== "trening" && u.typ !== "uvodny") continue;
    const d = u.zaciatok.slice(0, 10);
    if (d < od(-14) || d > od(21)) continue;
    const k = `${u.trener}|${u.nazov}`;
    const z = nazvy.get(k) || { trener: u.trener, nazov: u.nazov, dni: [] };
    z.dni.push(d);
    nazvy.set(k, z);
  }
  for (const { trener: t, nazov, dni } of nazvy.values()) {
    if (slova(nazov).length < 2) continue;  // prezývka („Matej") je práca Workspace
    const presne = v.klienti.filter((m) => normName(m) === normName(nazov));
    const kandidati = presne.length ? presne : podobniKlienti(nazov, v.klienti);
    if (!kandidati.length || kandidati.length > 3) continue;
    const kedy = [...new Set(dni)].sort().map(den).join(", ");
    out.push({
      druh: "kalendar", kluc: `kontrola-dat|kalendar|${t}|${nazov}`, trener: t, klient: kandidati[0], kandidati,
      text: `Tréning „${nazov}“ (${kedy}) nie je pripísaný nikomu — je to ${kandidati.join(" alebo ")}? Kým nie, hodina sa mu nepočíta a appka ho môže hlásiť ako ducha.`,
    });
  }

  // ── Banka: príjem bez návrhu, odosielateľ sa podobá klientovi ──
  for (const p of v.prijmyBezKlienta) {
    if (p.datum < od(-60) || odJerryho(p.text)) continue;
    const kandidati = podobniKlienti(p.text, v.klienti);
    if (!kandidati.length || kandidati.length > 4) continue;
    out.push({
      druh: "platba", kluc: `kontrola-dat|platba|${p.id}`, trener: trener(kandidati[0]), klient: kandidati[0], kandidati,
      text: `Príjem ${kc(p.suma)} z ${den(p.datum)} od „${p.text.slice(0, 60)}“ appka nevie priradiť — vyzerá ako ${kandidati.join(" alebo ")}. Meno klienta je v Kokpite možno napísané inak ako v banke.`,
    });
  }

  // ── Meno: aktívny klient platí pod podobným, ale iným priezviskom ──
  const posledna = new Map<string, { datum: string; text: string }>();
  for (const p of v.priradene) {
    if (!aktivni.has(p.klient) || odJerryho(p.text) || p.datum < od(-120)) continue;
    if (!podobniKlienti(p.text, [p.klient]).length) continue;
    const pred = posledna.get(p.klient);
    if (!pred || p.datum > pred.datum) posledna.set(p.klient, { datum: p.datum, text: p.text });
  }
  for (const [klient, p] of posledna) {
    out.push({
      druh: "meno", kluc: `kontrola-dat|meno|${klient}`, trener: trener(klient), klient, kandidati: [klient],
      text: `${klient} platí v banke ako „${p.text.slice(0, 60)}“. Ak je to jeho skutočné meno, premenuj ho v Kokpite — inak appka jeho ďalšie platby nespozná a pôjdu na nesprávne miesto.`,
    });
  }
  return out;
}
