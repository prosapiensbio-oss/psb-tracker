/**
 * CELÁ HISTÓRIA KLIENTA — POSKLADANÁ NA SERVERI.
 *
 * Jerry, 29. 9. 2026: „vedeli by sme to automatizovať?" Klient klikne
 * v maili na „Chcem celú históriu", čítačka schránky žiadosť spozná
 * a odpoveď odchádza sama — bez čakania na Jerryho klik.
 *
 * PREČO TU AUTOMAT NEPORUŠUJE PRAVIDLO „NIČ SA NEPOSIELA SAMO"
 *
 * To pravidlo (api/sms.ts) chráni pred VÝROKMI z dopočítaných čísel:
 * „dnes si mal poslednú hodinu" človeku, ktorý má ešte tri. História je iný
 * druh správy — opis toho, čo sa stalo (tréningy a platby tak, ako ich appka
 * eviduje), nie tvrdenie o zostatku. A poistky sú tvrdšie než pri ručnom
 * odoslaní:
 *
 *  1. **Ide len na adresy uložené pri klientovi** (fakturačné údaje),
 *     NIKDY odosielateľovi žiadosti. Kto si vypýta cudziu históriu, nedostane
 *     nič — pravému klientovi pristane v jeho vlastnej schránke.
 *  2. Klient sa musí nájsť PRESNE podľa mena z predmetu — a ten predmet
 *     skladá naše vlastné tlačidlo. Nič sa neháda.
 *  3. Najviac raz denne na klienta (audit `historia-odoslana`).
 *  4. Keď čokoľvek z toho zlyhá, automat sa stiahne a Jerrymu príde push
 *     ako doteraz — ručná cesta zo stola klienta zostáva.
 */
import { mesiacovVztahu, tempoMesacne } from "./profil";
import type { ClientAgg } from "./compute";
import { vypisHodin, type RiadokVypisu } from "./vypisHodin";
import type { Udalost } from "./klientOsCasu";
import type { VypisKlienta } from "./mailKlientovi";

/**
 * Riadok osi tak, ako ho číta klient — to isté prekladanie, aké robí panel
 * Výpis hodín (interné „OFF - 6h BEZ viazanosti · 17:00 · Jerry" nie je
 * jazyk pre zákazníka).
 */
export const popisPreKlienta = (r: RiadokVypisu): string => {
  if (r.druh === "balicekOd") return r.popis.split("·")[0].trim();
  if (r.druh === "platba") return `zaplatené ${r.popis.replace(/^(platba|zaplatil)\s*/i, "").split("·")[0].trim()}`;
  return "tréning";
};

export function historiaPreMail(
  meno: string,
  os: Udalost[],
  klient: Pick<ClientAgg, "packageRemaining" | "packageTotal" | "firstSession" | "sessions" | "primaryTrainer">,
  dnes: string,
  /** Najbližší dohodnutý termín (ISO), keď existuje. */
  dalsi?: string,
): VypisKlienta {
  const zostatokTeraz = klient.packageTotal > 0 ? klient.packageRemaining : null;
  const v = vypisHodin(os, "", dnes, zostatokTeraz);
  const body = [...v.riadky].reverse()
    .filter((r) => r.druh !== "balicekDo")
    .map((r) => ({
      den: r.den,
      cas: (/\d{1,2}:\d{2}/.exec(r.popis) || [""])[0] || undefined,
      popis: popisPreKlienta(r),
      druh: r.druh as "balicekOd" | "trening" | "platba",
      zostatok: r.zostatok,
      dlh: r.dlh,
    }));
  return {
    klient: meno,
    // Krstné meno v prvom páde — vokatívy sa nehádajú, rovnako ako v paneli.
    oslovenie: meno.split(" ")[0],
    trener: klient.primaryTrainer || "Jerry",
    os: body,
    zostatok: v.koniec,
    hodinSpolu: body.filter((b) => b.druh === "trening").length,
    odkedy: (klient.firstSession || "").slice(0, 10),
    mesiacov: Math.round(mesiacovVztahu(klient, new Date(dnes))),
    tempo: tempoMesacne(klient, new Date(dnes)),
    uplna: true,
    zaplateneSpolu: v.zaplatene,
    dnes,
    dalsi,
    // Platba s QR sa do automatickej odpovede nedáva: história je archív,
    // nie výzva na úhradu — a sumu ďalšieho balíčka nemá automat odkiaľ vziať
    // bez hádania.
  };
}
