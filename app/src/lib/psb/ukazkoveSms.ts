import { bezDiakritiky, textSms } from "./sms";
import { UKAZKA } from "./ukazka";
import { verejnyOdkaz } from "./verejnyOdkaz";

/**
 * VŠETKY ZNENIA, KTORÉ MÔŽU KLIENTOVI ODÍSŤ — na jednom mieste.
 *
 * Jerry, 3. 10. 2026: „pošli mi teda všetky v testovacích SMS." Poslať ich
 * z môjho konca nejde (brána je za prihlásením), ale appka to vie sama —
 * a pri ich vypísaní pokope sa hneď našlo, že jedna išla ako DVE správy,
 * lebo mala diakritiku. Päť dní si toho nikto nevšimol.
 *
 * Preto tento zoznam: je to zároveň skúšobná dávka pre Údaje → SMS
 * a podklad pre test, ktorý stráži, že každé znenie je bez mäkčeňov a
 * zmestí sa do jednej správy.
 *
 * NIE JE to zdroj textov pre appku. Obrazovky si ich skladajú samy
 * z `textSms`; tu sú s ukážkovými údajmi, aby sa dali prečítať a poslať.
 */
export type UkazkaSms = { kedy: string; kde: string; text: string };

export function ukazkoveSms(v: { zaklad?: string } = {}): UkazkaSms[] {
  /**
   * Odkazy musia byť OTVORITEĽNÉ. Prvá verzia niesla vymyslený token
   * a Jerry dostal päť SMS, z ktorých ani jedna nikam neviedla —
   * presne opak toho, čo sa skúškou overuje. Teraz vedú na ukážkové
   * stránky s vymyslenými dátami (`ukazka.ts`).
   *
   * Ide sa KRÁTKOU adresou cez `verejnyOdkaz` — tá istá, akú dostane
   * klient. Adresa workera je o osemnásť znakov dlhšia a prvá správa by
   * s ňou prerástla do dvoch SMS, takže by sa skúškou meralo niečo iné,
   * než čo naozaj odchádza.
   */
  const z = v.zaklad || "";
  const Upred = verejnyOdkaz(`/u/${UKAZKA.predUvodnym}`, z);
  const Upo = verejnyOdkaz(`/u/${UKAZKA.poUvodnom}`, z);
  const V = verejnyOdkaz(`/v/${UKAZKA.prehlad}`, z);
  return [
    {
      kedy: "pred úvodným",
      kde: "Dnes → nový dopyt",
      text: bezDiakritiky(
        `Vitejte v ProSapiens Biomechanic. Vsechny informace k Vasi uvodni lekci - termin, adresu i co si vzit - najdete zde: ${Upred}`,
      ),
    },
    {
      kedy: "po úvodnom",
      kde: "Dnes → SMS po úvodnom",
      text: bezDiakritiky(
        `Dekujeme za ucast na uvodni lekci. Termin dalsiho treninku, souhrn i doporucene cteni najdete zde: ${Upo}`,
      ),
    },
    {
      kedy: "zapísaný balíček",
      kde: "Balíčky · po priradení platby",
      text: bezDiakritiky("Lukas, zapísal som ti 6h Předplatné. QR na platbu máš v maili. ProSapiens"),
    },
    {
      kedy: "zostávajú hodiny",
      kde: "Kalendár · stôl klienta",
      text: textSms({ oslovenie: "Lukas", trener: "Jerry", odkaz: V }),
    },
    {
      kedy: "posledná hodina a nad rámec",
      kde: "Kalendár · stôl · Hodiny bez balíčka",
      text: textSms({ oslovenie: "Lukas", trener: "Jerry", datum: "9. 9. 2026", odkaz: V, sQr: true }),
    },
  ];
}
