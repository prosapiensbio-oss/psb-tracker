import { useEffect, useMemo, useState } from "react";

import { kedyPublikovat, type Kus } from "../../lib/psb/casy";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info } from "./ui";

/**
 * Kedy publikovať.
 *
 * PREČO JE TO ZVLÁŠŤ A NIE V „ČO FUNGOVALO"
 *
 * Tamtá karta hovorí, ČO napísať — to je práca. Táto hovorí, KEDY to
 * pustiť — to je nastavenie. Sú to dve rôzne rozhodnutia a miešať ich do
 * jednej tabuľky znamená, že sa ani jedno neurobí.
 *
 * PREČO MÔŽE BYŤ PRÁZDNA
 *
 * Čas publikovania sa začal ukladať 13. 8. 2026; staršie príspevky ho nemajú
 * a dopočítať sa nedá. Karta preto povie, koľko kusov už čas má a koľko ich
 * treba — a naplní sa sama pri ďalších sťahovaniach.
 */

type IgPrispevok = { datum: string; cas?: string; dosah: number };

export function KedyPublikovat() {
  const [ig, setIg] = useState<IgPrispevok[]>([]);
  const [nacitane, setNacitane] = useState(false);

  useEffect(() => {
    void fetch("/api/meta?co=instagram", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { prispevky?: IgPrispevok[] }) => setIg(j.prispevky || []))
      .catch(() => {})
      .finally(() => setNacitane(true));
  }, []);

  const v = useMemo(() => kedyPublikovat(
    ig.map((p): Kus => ({ cas: p.cas || "", datum: p.datum, dosah: Number(p.dosah) || 0 })),
  ), [ig]);

  if (!nacitane) return null;

  const najviac = Math.max(1, ...v.pasma.map((p) => p.medianDosah), ...v.dni.map((d) => d.medianDosah));
  const pruh = (hodnota: number, farba: string) => (
    <div style={{ flex: 1, height: 7, borderRadius: 999, background: mix(C.border, 70), overflow: "hidden" }}>
      <div style={{ width: `${(hodnota / najviac) * 100}%`, height: "100%", background: farba }} />
    </div>
  );

  return (
    <Card>
      <H3>
        <Info
          label="Kedy publikovať"
          text="Bežný dosah príspevku podľa pásma dňa a dňa v týždni — z tvojich vlastných príspevkov, nie z cudzích štúdií. Počíta sa medián, nie priemer: jeden reel s dosahom 40 000 by priemer svojho pásma vytiahol tak, že by neplatil pre žiadny iný kus. Záver sa vyhlási len vtedy, keď má víťazné pásmo dosť príspevkov a prekonáva zvyšok o štvrtinu — inak je „najlepší čas“ povera s grafom."
        />
      </H3>

      {v.malo ? (
        <Empty>{v.malo}</Empty>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
            {v.pasma.map((p) => (
              <div key={p.pasmo} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: C.textMuted, width: 122, flex: "0 0 auto" }}>{p.pasmo}</span>
                {pruh(p.medianDosah, C.accent)}
                <span style={{ fontSize: 12, color: C.text, fontVariantNumeric: "tabular-nums", width: 108, textAlign: "right" }}>
                  {Math.round(p.medianDosah).toLocaleString("sk")} · {p.kusov} ks
                </span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11.5, color: C.textDim, margin: "16px 0 8px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Deň v týždni
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {v.dni.map((d) => (
              <div key={d.den} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: C.textMuted, width: 122, flex: "0 0 auto" }}>{d.den}</span>
                {pruh(d.medianDosah, C.blue)}
                <span style={{ fontSize: 12, color: C.text, fontVariantNumeric: "tabular-nums", width: 108, textAlign: "right" }}>
                  {Math.round(d.medianDosah).toLocaleString("sk")} · {d.kusov} ks
                </span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 14, lineHeight: 1.55 }}>
            {v.zaver || `Zo ${v.sCasom} príspevkov s časom nevychádza pásmo, ktoré by zreteľne prekonávalo ostatné. Zatiaľ je jedno, kedy publikuješ — rozhoduje obsah.`}
          </div>
        </>
      )}
    </Card>
  );
}
