/**
 * OBSAH ODKAZU PRE KLIENTA — jeden výpočet pre stránku, SMS aj mail.
 *
 * Jerry, 4. 10. 2026: „potrebujem, aby z toho, čo vyšlo, sa sťahovali dáta
 * pre obsah odkazov." Do toho dňa si každé miesto skladalo svoj kúsok samo:
 *
 *  - stránka `/v/` počítala nadpis, odpočet, dlh a QR v route,
 *  - SMS sľubovala „a QR na platbu" podľa čísla, ktoré jej poslala obrazovka,
 *    z ktorej sa otvorila — karta klienta, Kalendár a Dnes posielali tri
 *    rôzne čísla (zostatok mínus kalendár, mínus hodiny bez balíčka…),
 *  - mail „celá história" mal vlastnú os bez platby.
 *
 * SMS tak vedela sľúbiť QR, ktoré stránka nenakreslila, alebo naopak — a to je
 * presne to, z čoho má klient pocit, že mu niekto niečo zatajuje.
 *
 * Teraz sa obsah skladá TU a všetky tri miesta ho len čítajú. Vstupy sú tie,
 * ktoré prešli kontrolou proti PTminderu 4. 10. 2026: os času s históriou
 * členstiev (`osKlientaZoServera`), karta klienta (`packageRemaining`)
 * a dlh z otvorených poplatkov aj vlastnej evidencie (`dlhJednehoKlienta`).
 */
import type { D1Database } from "@cloudflare/workers-types";
import { terazPraha } from "./cas";
import type { ClientAgg } from "./compute";
import { dlhJednehoKlienta } from "./dlznici";
import { normName } from "./format";
import { historiaPreMail } from "./historiaMail";
import type { VypisKlienta } from "./mailKlientovi";
import { nazovProduktu } from "./nazvyProduktov";
import { osKlientaZoServera } from "./osKlienta.server";
import { menaPlatiZa, platiteliaZOverridov, type PolozkaPlatby } from "./platiZa";
import { DODAVATEL } from "./vydanaFaktura";
import { fakturyUhradeneRozdelenim } from "./fakturaUhradena";
import type { PSBData } from "./types";

/**
 * Popis poplatku z PTmindera v reči klienta.
 *
 * PTminder posiela „OFF - 6h S viazanostou - from 02/10/2026 to 02/11/2026"
 * a stránka to do 4. 10. 2026 ukazovala klientovi doslova — po anglicky,
 * s interným názvom produktu a americky vyzerajúcim dátumom. Dátum je v ňom
 * deň/mesiac/rok (overené na poplatkoch Hanusa a Šašinkovej).
 */
export function popisPoplatku(popis: string): string {
  const m = /^(.*?)\s+-\s+from\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+to\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec((popis || "").trim());
  if (!m) return nazovProduktu(popis) || popis;
  const [, nazov, d1, m1, , d2, m2, r2] = m;
  return `${nazovProduktu(nazov)} · ${Number(d1)}. ${Number(m1)}. – ${Number(d2)}. ${Number(m2)}. ${r2}`;
}

export type ObsahOdkazu = {
  /** Všetko, čo stránka aj mail kreslia: os, nadpis (`zostatok`), platba. */
  vypis: VypisKlienta;
  /** Koľko je na stránke k úhrade; 0 = platobný blok ani QR sa nekreslí. */
  suma: number;
  /** Ten istý výsledok jednou vetou pre SMS: bude na stránke QR? */
  sQr: boolean;
  /** Pre QR: správa pre príjemcu. */
  sprava: string;
};

export async function obsahOdkazu(
  DB: D1Database,
  data: PSBData,
  c: ClientAgg,
  moznosti: {
    /** Koľko posledných balíčkov ukázať; 0 = celá história. */
    rozsah?: number;
    /** Pražský čas s hodinou (`terazPraha()`). */
    teraz?: string;
    /** Platobný blok (suma, QR). Mail „celá história" ho nemá. */
    sPlatbou?: boolean;
  } = {},
): Promise<ObsahOdkazu> {
  const teraz = moznosti.teraz || terazPraha();
  const dnes = teraz.slice(0, 10);
  const rozsah = Math.max(0, Math.round(Number(moznosti.rozsah ?? 1)));
  const sPlatbou = moznosti.sPlatbou ?? true;

  const { os, balicky } = await osKlientaZoServera(DB, data, c.name, teraz);
  // Najbližší termín — meno cez normName, nie presne v SQL (21. 10. 2026):
  // udalosť zapísaná iným tvarom mena („Stigut“ / „Štigut“) inak na stránke
  // chýbala, hoci Kokpit ju klientovi priradil. Berie sa najskorší budúci
  // termín každého mena a vyberie sa ten, ktorého meno sedí. Výpadok tu
  // necháva prázdno zámerne: je to len riadok „ďalší tréning“, nie hodiny
  // ani peniaze — kvôli nemu nemá padnúť celá stránka.
  const kto = normName(c.name);
  const dalsi = ((((await DB.prepare(
    "SELECT klient, MIN(zaciatok) z FROM kal_udalosti WHERE zmizla_at IS NULL AND klient IS NOT NULL AND typ IN ('trening','uvodny') AND zaciatok > ?1 GROUP BY klient",
  ).bind(teraz).all<{ klient: string; z: string | null }>().catch(() => null))?.results) || [])
    .filter((r) => normName(r.klient) === kto && r.z)
    .map((r) => r.z as string)
    .sort()[0]) || undefined;

  /**
   * DLH — otvorené poplatky z PTmindera aj balíčky z Kokpitu bez platby;
   * tá istá definícia, akú ukazuje karta dlžníkov (`dlhJednehoKlienta`).
   */
  // Jedno pravidlo „zaplatený" — dlh je súčet položiek klienta v `data.dlhy`.
  const dlh = dlhJednehoKlienta(data.dlhy, c.name);

  /**
   * ZA KOHO EŠTE PLATÍ (Jerry, 21. 10. 2026: Jakub Kaňovský platí aj za Annu
   * Kadličkovú). Berie sa dlh každého z nich tou istou funkciou ako vlastný —
   * jedno pravidlo „zaplatený" platí aj tu. Kto práve nič nedlží, v rozpise
   * nie je: suma na stránke je to, čo sa má teraz poslať.
   */
  const zaKoho = menaPlatiZa(data.clientOverrides?.[c.name]?.platiZa)
    .map((m) => {
      const kanon = Object.keys(data.clientOverrides || {}).find((x) => normName(x) === normName(m)) || m;
      const d = dlhJednehoKlienta(data.dlhy, kanon);
      const polozky = (data.dlhy || []).filter((x) => normName(x.klient) === normName(kanon));
      return { klient: kanon, dlzi: d.dlzi, nazov: polozky.length === 1 ? polozky[0].nazov : d.popis };
    })
    .filter((x) => x.dlzi > 0);

  /**
   * A NAOPAK: KOMU PLATÍ NIEKTO INÝ, TOMU SA QR NEKRESLÍ.
   *
   * Anna má svoj odkaz na hodiny rovnako ako ktokoľvek iný, ale platbu za ňu
   * posiela Jakub. QR na tú istú sumu na oboch stránkach je návod zaplatiť
   * dvakrát — a späť sa to vracia horšie, než sa to vybralo.
   */
  const platitelZOverridu = platiteliaZOverridov(data.clientOverrides)[
    Object.keys(data.clientOverrides || {}).find((x) => normName(x) === normName(c.name)) || c.name
  ];

  /**
   * OTVORENÁ FAKTÚRA JE VÄZBA, NIE ZÁPIS PRI KLIENTOVI.
   *
   * Jerry, 29. 10. 2026 nad Branislavom a Lindou: „pre Lindu sa to stratí,
   * aj keď je nastavené, že za ňu platí on — a čo keď sa jedného dňa
   * rozídu, túto väzbu budeme musieť ničiť." Kto za koho platí, hovorí
   * faktúra: položka za Lindu na Branislavovej faktúre. Kým je faktúra
   * otvorená, Branislavova stránka pýta CELÚ faktúru (QR s jej číslom, to
   * isté ako na doklade) a Lindina povie, že za ňu platí on. Keď ju zaplatí,
   * väzba skončí sama; na ďalšej faktúre Linda buď je, alebo nie.
   */
  const fa = sPlatbou ? await otvoreneFaktury(DB, c.name) : { moja: null, zaNeho: null };
  const zaNehoPlati = platitelZOverridu || fa.zaNeho || undefined;

  const vypis = historiaPreMail(c.name, os, c, dnes, dalsi, rozsah === 0, Math.max(1, rozsah));

  /**
   * TRÉNINGY BEZ HODINY NA KONCI = HODINY NAD RÁMEC, aj keď číslo hovorí nulu.
   * (Lukáš Hanus 3. 10. 2026: stránka tvrdila „Poslední hodina", hoci odvtedy
   * trénoval trikrát.) Od 3. 10. má koniec osi znamienko, takže toto chytá
   * už len prípad, keď zostatok zostal na nule.
   */
  let nadRamec = 0;
  for (let i = vypis.os.length - 1; i >= 0; i--) {
    const b = vypis.os[i];
    if (b.druh !== "trening") continue;
    if (b.zostatok != null || !b.dlh) break;
    nadRamec += 1;
  }
  if ((vypis.zostatok ?? 0) === 0 && nadRamec > 0) vypis.zostatok = -nadRamec;

  // „Koľkou hodinou sa tréning stane po zaplatení" (−1 · 8 h) počíta os
  // sama (`StavRiadku.buduca`) — to isté vidí profil v Kokpite.

  /**
   * QR JE NA STRÁNKE VŽDY, KEĎ JE ČO ZAPLATIŤ (Jerry, 2. 10. 2026):
   *  1. otvorený dlh — suma je, čo dlží;
   *  2. dochodený balíček alebo nad rámec bez dlhu — cena jeho posledného
   *     balíčka (appka si ju nevymýšľa, je to to, čo si naposledy kúpil).
   */
  const poslednyBal = balicky
    .filter((b) => !b.zrusene_at && (b.cena_czk || 0) > 0)
    .sort((a, b) => b.platnost_od.localeCompare(a.platnost_od))[0];
  const nadramec = (vypis.zostatok ?? 1) <= 0;
  const vlastna = !sPlatbou || zaNehoPlati ? 0 : dlh.dlzi > 0 ? dlh.dlzi : (nadramec ? Math.round(poslednyBal?.cena_czk || 0) : 0);
  const vlastnyNazov = dlh.dlzi > 0
    ? ((data.dlhy || []).filter((x) => normName(x.klient) === normName(c.name))[0]?.nazov || dlh.popis)
    : (poslednyBal?.nazov || "");
  /**
   * ROZPIS — aj keď je položka jedna. Stránka a faktúra tak majú jednu cestu
   * a nemôže sa stať, že spoločná platba ide inou vetvou než bežná.
   */
  const polozky: PolozkaPlatby[] = [];
  if (vlastna > 0) polozky.push({ klient: c.name, suma: vlastna, nazov: vlastnyNazov, ja: true });
  if (sPlatbou && !zaNehoPlati) for (const z of zaKoho) polozky.push({ klient: z.klient, suma: z.dlzi, nazov: z.nazov, ja: false });
  const suma = polozky.reduce((a, p) => a + p.suma, 0);
  if (sPlatbou && zaNehoPlati) vypis.platiZaNeho = zaNehoPlati;
  if (suma > 0) {
    const vlastnyPopis = vlastna > 0
      ? (dlh.dlzi > 0 ? popisPoplatku(dlh.popis) : nazovProduktu(poslednyBal?.nazov || "") || "Nový balíček")
      : "";
    vypis.platba = {
      // Keď platiteľ sám nič nedlží, popis hovorí, za koho to je — inak by
      // stránka pýtala sumu bez dôvodu.
      // Dvojbodka namiesto predložky — meno sa neskloňuje (viď rozpis).
      popis: vlastnyPopis || `za: ${zaKoho.map((z) => z.klient).join(", ")}`,
      suma, ucet: DODAVATEL.ucet, sprava: c.name,
      polozky,
      // Koľko hodín mu po zaplatení naozaj zostane.
      odpocet: dlh.dlzi > 0 || vlastna === 0 ? 0 : Math.max(0, -(vypis.zostatok ?? 0)),
      novy: vlastna > 0 && dlh.dlzi === 0,
    };
  }

  /**
   * Faktúra s jednou položkou sa pýta len vtedy, keď klient naozaj dlží:
   * jej balíček mohla zaplatiť platba z banky skôr, než si faktúru ktokoľvek
   * otvoril a appka ju označila za uhradenú (`faktureUhradeneBalickom` beží
   * pri čítaní zoznamu faktúr). Faktúra za viacerých má vlastnú kontrolu
   * rozdeleným prevodom priamo v `otvoreneFaktury`.
   */
  if (fa.moja && !zaNehoPlati && (fa.moja.spolocna || dlh.dlzi > 0)) {
    const f = fa.moja;
    vypis.platba = {
      popis: `Faktura ${f.cislo} · splatná ${Number(f.splatnost.slice(8, 10))}. ${Number(f.splatnost.slice(5, 7))}. ${f.splatnost.slice(0, 4)}`,
      suma: f.celkom, ucet: DODAVATEL.ucet, sprava: `Faktura ${f.cislo} PSB`,
      polozky: f.polozky, vs: f.cislo, splatnost: f.splatnost, odpocet: 0, novy: false,
    };
    return { vypis, suma: f.celkom, sQr: true, sprava: `Faktura ${f.cislo} PSB` };
  }

  return { vypis, suma, sQr: suma > 0, sprava: c.name };
}

/**
 * Otvorené faktúry z Kokpitu, ktorých sa klient týka:
 *  - `moja` — jediná otvorená faktúra, na ktorej je HLAVNÝM klientom (platiteľom),
 *    s rozpisom po klientoch; pri dvoch a viac sa stránka nerozhoduje sama;
 *  - `zaNeho` — platiteľ otvorenej faktúry, na ktorej je klient ďalšou položkou.
 */
async function otvoreneFaktury(DB: D1Database, meno: string): Promise<{
  moja: { cislo: string; celkom: number; splatnost: string; polozky: PolozkaPlatby[]; spolocna: boolean } | null;
  zaNeho: string | null;
}> {
  const kto = normName(meno);
  const fa = (((await DB.prepare(
    "SELECT id, cislo, klient, popis, ks, cena_czk, celkom_czk, splatnost FROM vydane_faktury WHERE storno_at IS NULL AND uhradene_at IS NULL",
  ).all().catch(() => null))?.results) || []) as { id: string; cislo: string; klient: string; popis: string; ks: number; cena_czk: number; celkom_czk: number; splatnost: string }[];
  if (!fa.length) return { moja: null, zaNeho: null };
  const pol = (((await DB.prepare(
    "SELECT faktura_id, klient, popis, celkom_czk FROM vydane_faktury_polozky WHERE faktura_id IN (SELECT value FROM json_each(?1)) ORDER BY poradie",
  ).bind(JSON.stringify(fa.map((f) => f.id))).all().catch(() => null))?.results) || []) as { faktura_id: string; klient: string; popis: string; celkom_czk: number }[];
  // Faktúra za viacerých zaplatená rozdeleným prevodom už nie je otvorená,
  // aj keď ju ešte nikto neoznačil (to robí zoznam faktúr pri čítaní).
  const spolocne = fa.filter((f) => pol.some((p) => p.faktura_id === f.id));
  let uhradene = new Set<string>();
  if (spolocne.length) {
    const platby = (((await DB.prepare("SELECT id, klient, datum, suma_czk, fio_id FROM platby WHERE zrusene_at IS NULL AND fio_id IS NOT NULL")
      .all().catch(() => null))?.results) || []) as { id: string; klient: string; datum: string; suma_czk: number; fio_id: string }[];
    uhradene = new Set(fakturyUhradeneRozdelenim(
      spolocne.map((f) => ({ id: f.id, klient: f.klient, vystavene: "", diely: dielyFaktury(f, pol) })),
      platby.map((x) => ({ id: x.id, klient: x.klient, datum: String(x.datum).slice(0, 10), suma: Number(x.suma_czk) || 0, fioId: x.fio_id })),
    ).map((x) => x.id));
  }
  const otvorene = fa.filter((f) => !uhradene.has(f.id));
  const moje = otvorene.filter((f) => normName(f.klient) === kto);
  const zaNeho = otvorene.find((f) => normName(f.klient) !== kto && pol.some((p) => p.faktura_id === f.id && normName(p.klient) === kto));
  let moja = null;
  if (moje.length === 1) {
    const f = moje[0];
    const polozky: PolozkaPlatby[] = dielyFaktury(f, pol).map((d) => ({
      klient: d.klient, suma: d.suma, ja: normName(d.klient) === kto,
      nazov: normName(d.klient) === kto ? f.popis : (pol.find((p) => p.faktura_id === f.id && p.klient === d.klient)?.popis || f.popis),
    }));
    moja = { cislo: f.cislo, celkom: Math.round(Number(f.celkom_czk) || 0), splatnost: String(f.splatnost).slice(0, 10), polozky, spolocna: polozky.length > 1 };
  }
  return { moja, zaNeho: zaNeho ? zaNeho.klient : null };
}

/** Komu koľko z faktúry patrí — hlavná položka plus ďalšie, po klientoch. */
function dielyFaktury(
  f: { id: string; klient: string; ks: number; cena_czk: number },
  pol: { faktura_id: string; klient: string; celkom_czk: number }[],
): { klient: string; suma: number }[] {
  const out = [{ klient: f.klient, suma: Math.round((Number(f.ks) || 1) * (Number(f.cena_czk) || 0)) }];
  for (const p of pol.filter((x) => x.faktura_id === f.id)) {
    const uz = out.find((x) => normName(x.klient) === normName(p.klient));
    if (uz) uz.suma += Math.round(Number(p.celkom_czk) || 0);
    else out.push({ klient: p.klient, suma: Math.round(Number(p.celkom_czk) || 0) });
  }
  return out;
}
