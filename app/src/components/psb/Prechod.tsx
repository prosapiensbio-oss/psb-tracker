import { BalickyEvidencia } from "./BalickyEvidencia";
import { DavkovePlatby } from "./DavkovePlatby";
import { ParovacKontaktov } from "./ParovacKontaktov";
import { PlatbyEvidencia } from "./PlatbyEvidencia";
import { C, mix } from "../../lib/psb/theme";
import { Card, H3 } from "./ui";

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
      <Card>
        <H3>Odchod od PTmindera</H3>
        <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6, marginTop: 4 }}>
          Do PTmindera sa od 19. 10. 2026 nezapisuje — dochádzka, hodiny aj peniaze sú v Kokpite.
          Porovnania s PTminderom sú preto vypnuté: merali by už len to, že PTminder stojí.
          Starý export zostáva ako história.
        </div>
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
          Táto záložka je dočasná. Keď sa PTminder vypne, zmizne aj ona.
        </div>
      </Card>

      <div id="prechod-balicky"><BalickyEvidencia mena={mena} onFaktura={onFaktura} onVypis={onVypis} onKlient={onKlient} /></div>
      <div id="prechod-kontakty"><ParovacKontaktov mena={mena} /></div>
      <div id="prechod-davka"><DavkovePlatby mena={mena} /></div>
      <div id="prechod-platby"><PlatbyEvidencia mena={mena} /></div>

      <Card style={{ background: mix(C.border, 25) }}>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
          Po uzávierke októbra, keď bude všetko sedieť, PTminder sa zruší a táto záložka zmizne.
        </div>
      </Card>
    </div>
  );
}
