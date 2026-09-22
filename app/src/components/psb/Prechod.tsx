import { useCallback, useEffect, useState } from "react";

import { BalickyEvidencia } from "./BalickyEvidencia";
import { PlatbyEvidencia } from "./PlatbyEvidencia";
import { SubeznyChod, type Porovnanie } from "./Kalendar";
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
 * sa mazala ťažšie: prerástla by do neho.
 */

export function Prechod({ mena }: { mena: string[] }) {
  const [porovnanie, setPorovnanie] = useState<Porovnanie | null>(null);
  const [nacitane, setNacitane] = useState(false);

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/kalendar", { credentials: "same-origin" }).catch(() => null);
    const j = r ? ((await r.json().catch(() => null)) as { ok?: boolean; porovnanie?: Porovnanie } | null) : null;
    if (j?.ok && j.porovnanie) setPorovnanie(j.porovnanie);
    setNacitane(true);
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Card>
        <H3>Odchod od PTmindera</H3>
        <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6, marginTop: 4 }}>
          Kokpit a PTminder bežia vedľa seba. Vypnúť PTminder sa nedá po častiach: keď sa prestanú
          zapisovať tréningy, prestanú klesať hodiny na balíčkoch a zostatky z exportu sa stanú nepravdou.
          Preto tri meradlá naraz — a PTminder ide preč, až keď sedia všetky tri.
        </div>
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
          Táto záložka je dočasná. Keď sa PTminder vypne, zmizne aj ona.
        </div>
      </Card>

      {nacitane && !porovnanie && (
        <Card>
          <div style={{ fontSize: 12.5, color: C.textMuted }}>
            Meradlo dochádzky sa nenačítalo — skontroluj pripojenie kalendárov v záložke Kalendár.
          </div>
        </Card>
      )}
      {porovnanie && <div id="prechod-dochadzka"><SubeznyChod p={porovnanie} /></div>}
      <div id="prechod-balicky"><BalickyEvidencia mena={mena} /></div>
      <div id="prechod-platby"><PlatbyEvidencia mena={mena} /></div>

      <Card style={{ background: mix(C.border, 25) }}>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
          Poradie nie je náhodné: bez mien z kalendára nesedí dochádzka, bez dochádzky nesedia
          hodiny a bez hodín nemá zmysel riešiť peniaze. Zhora nadol.
        </div>
      </Card>
    </div>
  );
}
