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
import { historiaPreMail } from "./historiaMail";
import type { VypisKlienta } from "./mailKlientovi";
import { nazovProduktu } from "./nazvyProduktov";
import { osKlientaZoServera } from "./osKlienta.server";
import { DODAVATEL } from "./vydanaFaktura";
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
  const dalsi = ((await DB.prepare(
    "SELECT MIN(zaciatok) z FROM kal_udalosti WHERE zmizla_at IS NULL AND klient = ?1 AND typ IN ('trening','uvodny') AND zaciatok > ?2",
  ).bind(c.name, teraz).first<{ z: string | null }>().catch(() => null))?.z) || undefined;

  /**
   * DLH — otvorené poplatky z PTmindera aj balíčky z Kokpitu bez platby;
   * tá istá definícia, akú ukazuje karta dlžníkov (`dlhJednehoKlienta`).
   */
  // Jedno pravidlo „zaplatený" — dlh je súčet položiek klienta v `data.dlhy`.
  const dlh = dlhJednehoKlienta(data.dlhy, c.name);

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
  const suma = !sPlatbou ? 0 : dlh.dlzi > 0 ? dlh.dlzi : (nadramec ? Math.round(poslednyBal?.cena_czk || 0) : 0);
  if (suma > 0) {
    vypis.platba = {
      popis: dlh.dlzi > 0 ? popisPoplatku(dlh.popis) : nazovProduktu(poslednyBal?.nazov || "") || "Nový balíček",
      suma, ucet: DODAVATEL.ucet, sprava: c.name,
      // Koľko hodín mu po zaplatení naozaj zostane.
      odpocet: dlh.dlzi > 0 ? 0 : Math.max(0, -(vypis.zostatok ?? 0)),
      novy: dlh.dlzi === 0,
    };
  }

  return { vypis, suma, sQr: suma > 0, sprava: c.name };
}
