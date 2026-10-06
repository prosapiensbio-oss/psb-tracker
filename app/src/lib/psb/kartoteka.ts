/**
 * KARTOTÉKA FOTIEK DRŽANIA TELA — čisté časti.
 *
 * Časť C návrhu anamnézy (Jerry ho schválil 30. 9. 2026): „Fotky držania tela
 * na jednom mieste a poznámka k nim. Pri ďalšom fotení sa priložia k tomu
 * istému klientovi a stoja vedľa seba podľa dátumu." Zboku, spredu, zozadu —
 * ale vezme čokoľvek.
 *
 * Fotky jedného dňa sú jedno FOTENIE; poznámka patrí k foteniu, nie k fotke
 * („zapíše sa k dátumu, takže o pol roka je vidieť, čo si písal vtedy").
 * Porovnanie stavia vedľa seba PRVÚ a POSLEDNÚ fotku toho istého pohľadu —
 * to je celý dôvod, prečo kartotéka existuje.
 *
 * Obrázky sú v R2 zašifrované a nikde sa nezverejňujú. Súhlas: klient ho
 * dáva v anamnéze („včetně fotografií držení těla… nikde se nezveřejňují");
 * staré anamnézy z Google Forms ho nemajú, vtedy tréner potvrdí, že klient
 * súhlasil osobne — a zapíše sa to pri fotke.
 */

export const POHLADY = [
  { id: "bok", nazov: "zboku" },
  { id: "predok", nazov: "spredu" },
  { id: "zadok", nazov: "zozadu" },
  { id: "ine", nazov: "iné" },
] as const;
/**
 * Z EDITORA (Workspace → Editor, 6. 10. 2026) chodia do kartotéky dva
 * ďalšie druhy: poskladané porovnanie predtým/potom a video (strihnutý,
 * spomalený klip chôdze či behu). Nie sú v POHLADY — nemajú sa ponúkať pri
 * nahrávaní fotky ani sa porovnávať samy so sebou.
 */
export const POROVNANIE = "porovnanie";
export const VIDEO = "video";
export const Z_EDITORA = [POROVNANIE, VIDEO] as const;
export type Pohlad = (typeof POHLADY)[number]["id"] | typeof POROVNANIE | typeof VIDEO;
export const jePohlad = (v: unknown): v is Pohlad => v === POROVNANIE || v === VIDEO || POHLADY.some((p) => p.id === v);
/** Fotka tela (zboku, spredu, zozadu, iné) — nie výstup editora. */
export const jeFotkaTela = (f: { pohlad: string }) => !(Z_EDITORA as readonly string[]).includes(f.pohlad);
export const nazovPohladu = (id: string) =>
  id === POROVNANIE ? "predtým / potom" : id === VIDEO ? "video" : POHLADY.find((p) => p.id === id)?.nazov ?? "iné";

export type Fotka = {
  id: string;
  klient: string;
  den: string;
  pohlad: string;
  sirka?: number | null;
  vyska?: number | null;
  suhlas?: string;
  kto?: string | null;
  createdAt?: string;
  /** MIME súboru; chýba = image/jpeg. */
  typ?: string | null;
};

export type Fotenie = { den: string; fotky: Fotka[]; poznamka: string };

/** Najväčší povolený súbor po zmenšení v prehliadači (a strop na serveri). */
export const MAX_BAJTOV = 6 * 1024 * 1024;
/**
 * Strop na video. Editor ukladá len strih (pár sekúnd chôdze či behu),
 * nie celý súbor z telefónu, a v 720p — takto to worker zašifruje naraz
 * v pamäti. Pôvodné video z telefónu by malo stovky MB.
 */
export const MAX_VIDEO_BAJTOV = 40 * 1024 * 1024;
export const TYPY_VIDEA = ["video/mp4", "video/webm"];
/** Dlhšia strana fotky po zmenšení — dosť na detail postoja, málo na úložisko. */
export const MAX_STRANA = 2000;

/** Deň v tvare RRRR-MM-DD, ktorý naozaj existuje a nie je v budúcnosti. */
export function jeDenFotenia(den: unknown, dnes: string): boolean {
  if (typeof den !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(den)) return false;
  const d = new Date(`${den}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== den) return false;
  return den <= dnes && den >= "2020-01-01";
}

/**
 * Fotenia od najnovšieho; v rámci fotenia poradie zboku, spredu, zozadu,
 * iné — tak, ako stojí človek pred foťákom, nie podľa času nahratia.
 */
export function fotenia(fotky: Fotka[], poznamky: Record<string, string> = {}): Fotenie[] {
  const dni = new Map<string, Fotka[]>();
  for (const f of fotky) dni.set(f.den, [...(dni.get(f.den) || []), f]);
  for (const den of Object.keys(poznamky)) if (!dni.has(den) && poznamky[den]) dni.set(den, []);
  const poradie = (p: string) => {
    const i = POHLADY.findIndex((x) => x.id === p);
    return i < 0 ? POHLADY.length : i;
  };
  return [...dni.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([den, fs]) => ({
      den,
      fotky: [...fs].sort((a, b) => poradie(a.pohlad) - poradie(b.pohlad) || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))),
      poznamka: poznamky[den] || "",
    }));
}

/**
 * PREDTÝM A TERAZ: pre každý pohľad prvá a posledná fotka, keď sú z dvoch
 * rôznych dní. Pohľad „iné" sa neporovnáva — dve „iné" fotky nemusia
 * ukazovať to isté.
 */
export function porovnania(fotky: Fotka[]): { pohlad: string; prva: Fotka; posledna: Fotka }[] {
  const von: { pohlad: string; prva: Fotka; posledna: Fotka }[] = [];
  for (const p of POHLADY) {
    if (p.id === "ine") continue;
    const tieto = fotky.filter((f) => f.pohlad === p.id)
      .sort((a, b) => a.den.localeCompare(b.den) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    if (tieto.length < 2) continue;
    const prva = tieto[0];
    const posledna = tieto[tieto.length - 1];
    if (prva.den === posledna.den) continue;
    von.push({ pohlad: p.id, prva, posledna });
  }
  return von;
}

/**
 * Súhlas s fotkami z anamnézy. Zdroj je `anamnezy.suhlasy_json` (zámerne
 * nešifrovaný — doklad o súhlase sa musí dať prečítať vždy). Staré anamnézy
 * z Google Forms majú `fotky: false`: na fotky sa ten formulár nepýtal.
 */
export function suhlasFotky(suhlasy: unknown): boolean {
  const s = suhlasy as { gdpr?: { dano?: unknown; fotky?: unknown } } | null;
  return !!s?.gdpr && s.gdpr.dano === true && s.gdpr.fotky === true;
}

/** Kľúč objektu v R2. Bez mena klienta — kľúč sa objavuje v logoch. */
export const klucFotky = (id: string, den: string) => `fotky/${den.slice(0, 4)}/${id}.bin`;

