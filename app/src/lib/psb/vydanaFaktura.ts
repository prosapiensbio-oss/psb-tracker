/**
 * VYDANÉ FAKTÚRY — čisté časti.
 *
 * Jerry fakturoval v iDokladi: 84 faktúr od 2023, z toho 37 za rok 2026
 * (347 079 Kč). Nikto iný ich od neho nepotrebuje — nemá účtovníčku, ktorá by
 * z iDokladu sťahovala zostavu — takže sa celý doklad dá vystaviť tu.
 *
 * PREČO NOVÁ ČÍSELNÁ RADA
 *
 * iDoklad má rady `RRRR0NNN` (20260038). Kokpit píše `RRRR1NNN` (20261001).
 * Jednotka na piatej pozícii je značka „vystavené v Kokpite" a hlavne poistka:
 * ani keby sa Jerry raz do iDokladu vrátil, čísla sa nemôžu stretnúť. Na
 * variabilný symbol sa to hodí tak, ako je — osem číslic.
 *
 * ČO TU NIE JE: sadzby DPH. PSB nie je platca DPH, na doklade je veta
 * „Nejsme plátci DPH" a žiadny základ dane. Keby sa to raz zmenilo, je to
 * zásah do šablóny aj do tejto úvahy — nie prepínač.
 */

/** Dodávateľ. Jedno miesto; na faktúre sa nikde inde nepíše. */
export const DODAVATEL = {
  meno: "Mgr. Filip Stráňavský",
  ulica: "Přadlácká 915/18",
  psc: "602 00",
  mesto: "Brno",
  stat: "Česká republika",
  ico: "19126841",
  dph: "Nejsme plátci DPH",
  email: "jerrystranavsky@gmail.com",
  telefon: "+420 702 090 289",
  web: "prosapiens.cz",
  ucet: "2302732185/2010",
  iban: "CZ1020100000002302732185",
  swift: "FIOBCZPP",
} as const;

/** Predvolená splatnosť. V 36 z 84 doterajších faktúr to bolo 14 dní. */
export const SPLATNOST_DNI = 14;

/**
 * PONUKA POPISOV.
 *
 * Deväť viet, ktoré Jerry za tri roky naozaj fakturoval, aj s cenou, ktorá
 * k nim najčastejšie patrila. Jerry, 26. 9. 2026: „mnoho klientov potrebuje
 * niečo špecifické na tú faktúru zapísať, preto tam potrebujem túto možnosť —
 * iní klienti nevedia, čo tam potrebujú." Preto ponuka AJ voľný text: výber
 * popis len predvyplní, ďalej sa doň píše.
 */
export const POPISY: { id: string; text: string; cena: number }[] = [
  { id: "trening6", text: "6 hodín biomechanického tréningu", cena: 7790 },
  { id: "kondicne6", text: "6 hodín kondično-rehabilitačního cvičení", cena: 6990 },
  { id: "balicek6", text: "Rehabilitačno-kondičné cvičení — balíček 6 h", cena: 7790 },
  { id: "lekcie8", text: "8 lekcií rehabilitačno-kondičného tréningu", cena: 9400 },
  { id: "lekcie8diag", text: "8 lekcií rehabilitačno-kondičného tréningu + úvodná diagnostika", cena: 8200 },
  { id: "predplatne", text: "Předplatné 6 h + 6 h", cena: 15580 },
  { id: "exkluzivny10", text: "Exkluzivní plán 10 h", cena: 10990 },
  { id: "vzdelavaci", text: "Individuální vzdělávací program pro kompenzaci sedavého zaměstnání", cena: 6990 },
  {
    id: "bloky6",
    text: "6 blokov po 120 minút na tému biomechanika pohybu a pohybová ergonomie, stress management a prevence stresové zátěže, wellbeing a work-life balance",
    cena: 15580,
  },
];

export type Faktura = {
  cislo: string;
  klient: string;
  vystavene: string;
  splatnost: string;
  popis: string;
  ks: number;
  cena: number;
  celkom: number;
  odberatel: Odberatel;
  poznamka?: string;
  stornoAt?: string | null;
  uhradeneAt?: string | null;
};

export type Odberatel = {
  firma: string;
  ico: string;
  dic: string;
  ulica: string;
  psc: string;
  mesto: string;
  stat: string;
  email: string;
};

/** Rok z ISO dátumu; pri nezmysle dnešný, nie NaN. */
const rokZ = (iso: string): number => {
  const r = Number(String(iso).slice(0, 4));
  return r >= 2000 && r <= 2999 ? r : new Date().getFullYear();
};

/**
 * Ďalšie číslo v rade. Pozerá sa LEN na čísla toho roku a berie najvyššie —
 * nie počet. Keby sa počítali riadky, po stornovaní jednej faktúry by sa
 * ďalšia vystavila pod číslom, ktoré už raz existovalo.
 */
export function dalsieCislo(vystavene: string, existujuce: string[]): string {
  const rok = rokZ(vystavene);
  const predpona = `${rok}1`;
  let max = 0;
  for (const c of existujuce) {
    if (!c.startsWith(predpona) || c.length !== 8) continue;
    const n = Number(c.slice(5));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${predpona}${String(max + 1).padStart(3, "0")}`;
}

/** Dátum splatnosti: ISO deň + počet dní. */
export function splatnostZ(vystavene: string, dni = SPLATNOST_DNI): string {
  const d = new Date(`${vystavene}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return vystavene;
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(dni)));
  return d.toISOString().slice(0, 10);
}

/** „6 990,00 Kč" — česká sadzba čísla, medzera po tisícoch, čiarka. */
export function suma(n: number): string {
  const s = Math.abs(n).toFixed(2).replace(".", ",");
  const [cele, des] = s.split(",");
  return `${(n < 0 ? "−" : "") + cele.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${des}`;
}

/** „13.09.2026" z ISO. */
export const den = (iso: string): string => {
  const [r, m, d] = String(iso).split("-");
  return r && m && d ? `${d}.${m}.${r}` : String(iso);
};

/**
 * Bez diakritiky a bez znakov, ktoré SPAYD nepustí.
 *
 * Reťazec QR platby smie obsahovať len ASCII; hviezdička je oddeľovač polí,
 * takže v texte nesmie zostať ani ona. Banka s diakritikou v správe buď
 * zobrazí kašu, alebo platbu odmietne.
 */
export function ascii(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[*]/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reťazec českej QR platby (SPAYD 1.0).
 *
 * Skladá sa z polí oddelených hviezdičkou; banka z neho predvyplní príkaz.
 * `X-VS` je variabilný symbol — u nás vždy číslo faktúry, aby sa platba dala
 * spárovať bez hádania. `DT` je dátum splatnosti vo formáte RRRRMMDD.
 */
export function spayd(v: {
  iban?: string;
  suma: number;
  vs: string;
  sprava: string;
  splatnost?: string;
  prijemca?: string;
}): string {
  const polia = [
    "SPD*1.0",
    `ACC:${(v.iban || DODAVATEL.iban).replace(/\s/g, "")}`,
    `AM:${v.suma.toFixed(2)}`,
    "CC:CZK",
    `X-VS:${v.vs.replace(/\D/g, "").slice(0, 10)}`,
  ];
  if (v.splatnost) polia.push(`DT:${v.splatnost.replace(/-/g, "")}`);
  if (v.prijemca) polia.push(`RN:${ascii(v.prijemca).slice(0, 35).toUpperCase()}`);
  polia.push(`MSG:${ascii(v.sprava).slice(0, 60).toUpperCase()}`);
  return polia.join("*");
}

/** Je faktúra po splatnosti? Stornovaná a uhradená nikdy. */
export function poSplatnosti(f: Pick<Faktura, "splatnost" | "uhradeneAt" | "stornoAt">, dnes: string): boolean {
  if (f.uhradeneAt || f.stornoAt) return false;
  return f.splatnost < dnes;
}
