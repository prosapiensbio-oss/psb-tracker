import { BalickyEvidencia } from "./BalickyEvidencia";
import { DavkovePlatby } from "./DavkovePlatby";
import { ParovacKontaktov } from "./ParovacKontaktov";
import { PlatbyEvidencia } from "./PlatbyEvidencia";
import { PohybyFio } from "./PohybyFio";

/**
 * Prechod — dočasná záložka na odchod od PTmindera.
 *
 * PREČO SAMOSTATNE
 *
 * 22. 9. 2026 som tri karty súbežného chodu (dochádzka, hodiny, peniaze)
 * nalepil do Kalendára, lebo tam vznikla prvá. Jerry v ten istý deň:
 * „keď kliknem na kalendár, už to nie je len kalendár, ale aj platby atď."
 * Mal pravdu — kalendár je kalendár. Jedna otázka na záložku.
 *
 * A hlavne: **toto nie je obrazovka, ktorá tu má zostať.** Je to meradlo
 * projektu, ktorý raz skončí — keď všetky tri tretiny sedia, PTminder sa
 * vypne a celá záložka sa zmaže aj s tromi komponentmi. Karta v Kalendári by
 * sa mazala ťažšie: prerástla by do neho. *
 * POROVNANIA SÚ VYPNUTÉ OD 20. 10. 2026 (odchod z PTmindera, krok 3). Do
 * PTmindera sa od 19. 10. nezapisuje, takže meradlá súbežného chodu
 * („Vydrží kalendár sám?", mesiace kalendár vs export, rozdiel hodín
 * a mesačných tržieb) by odteraz merali len to, že PTminder stojí. Ostáva
 * práca, ktorá sa robí v Kokpite: balíčky, platby, kontakty.
 */

export function Prechod({ mena, onFaktura, onVypis, onKlient }: {
  mena: string[];
  /** Ponuka faktúry po zapísaní balíčka; Prechod ju len podáva ďalej. */
  onFaktura?: (p: { klient: string; popis: string; cena: number; balicekId?: string }) => void;
  /** Poslať klientovi výpis s QR namiesto faktúry. */
  onVypis?: (meno: string) => void;
  /** Otvoriť profil klienta — tam sa upravuje balíček. */
  onKlient?: (meno: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Úvodná karta „Odchod od PTmindera" je od 28. 10. 2026 preč — záložka
          sa volá Evidencia a nesie prácu, ktorá sa robí v Kokpite. */}

      <div id="prechod-balicky"><BalickyEvidencia mena={mena} onFaktura={onFaktura} onVypis={onVypis} onKlient={onKlient} /></div>
      <div id="prechod-kontakty"><ParovacKontaktov mena={mena} /></div>
      <div id="prechod-davka"><DavkovePlatby mena={mena} /></div>
      <div id="prechod-platby"><PlatbyEvidencia mena={mena} /></div>
      {/* Náhľad účtu (Jerry, 29. 10. 2026): „kedy, kde, koľko" bez dopytu do databázy. */}
      <div id="prechod-fio"><PohybyFio /></div>

    </div>
  );
}
