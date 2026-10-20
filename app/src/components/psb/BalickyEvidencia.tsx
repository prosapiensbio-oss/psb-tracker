import { oznam } from "../../lib/psb/obnovaSignal";
import { potvrdDruhyBalicek } from "../../lib/psb/duplicitaBalicka";
import { nazovProduktu } from "../../lib/psb/nazvyProduktov";
import { SmsKlientovi } from "./SmsKlientovi";
import { bezDiakritiky } from "../../lib/psb/sms";
import { useCallback, useEffect, useState } from "react";

import { C, mix } from "../../lib/psb/theme";
import { Card, H3, Info } from "./ui";
import { dnesPraha } from "../../lib/psb/cas";

/**
 * Vlastná evidencia balíčkov a jej porovnanie s PTminderom.
 *
 * Jerry, 22. 9. 2026: nechať obe evidencie bežať vedľa seba a PTminder
 * vypnúť, keď sa prestanú rozchádzať. Pre dochádzku to meria karta „Vydrží
 * kalendár sám?"; toto je tá druhá polovica — hodiny.
 *
 * Karta je zámerne na jednom mieste s tou prvou: obe odpovedajú na tú istú
 * otázku a rozhodnutie vypnúť PTminder sa nedá urobiť z jednej polovice.
 *
 * ČÍSLO, KTORÉ ROZHODUJE, je „rozdiel" — klienti, pri ktorých Kokpit počíta
 * iný zostatok než PTminder. „PTminder mlčí" sú offline členstvá, ktoré
 * export vyváža ako 0/0; tam nie je čo porovnávať a do rozdielu nejdú.
 */

type Balicek = {
  id: string; klient: string; nazov: string; hodiny: number | null;
  platnost_od: string; platnost_do: string | null; cena_czk: number | null;
  zdroj: string; poznamka: string | null; zrusene_at: string | null;
};


async function posli(telo: Record<string, unknown>) {
  const r = await fetch("/api/balicky", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(telo),
  });
  return (await r.json()) as { ok: boolean; error?: string; id?: string; pridanych?: number; preskocenych?: number; preskocene?: string[] };
}

export function BalickyEvidencia({ mena, onFaktura, onVypis, onKlient }: {
  mena: string[];
  /**
   * Otvoriť profil klienta. Veľkosť balíčka sa mení TAM a nikde inde —
   * Jerry ju 12. 10. 2026 hľadal v tejto karte a nenašiel, lebo tu je len
   * porovnanie s PTminderom. Meno je preto odkaz na miesto, kde sa to dá.
   */
  onKlient?: (meno: string) => void;
  /** Ponuka „vystaviť faktúru" po zapísaní balíčka; bez nej sa neukáže. */
  onFaktura?: (p: { klient: string; popis: string; cena: number; balicekId?: string }) => void;
  /**
   * „Poslať výpis a QR" — otvorí stôl klienta s pripraveným mailom.
   *
   * Jerry, 29. 9. 2026: „niekto chce faktúru a niekto chce len QR platbu."
   * Sú to dve rôzne veci, nie dva názvy tej istej: faktúra je doklad pre
   * účtovníčku, výpis je správa pre klienta — dochádzka, tempo a QR na
   * ďalší balíček. Preto stoja vedľa seba a ani jedno nie je povinné.
   */
  onVypis?: (meno: string) => void;
}) {
  const [balicky, setBalicky] = useState<Balicek[] | null>(null);
  const [chyba, setChyba] = useState("");
  const [pracujem, setPracujem] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [pisem, setPisem] = useState(false);
  const [f, setF] = useState({ klient: "", nazov: "", hodiny: "", platnostOd: dnesPraha(), platnostDo: "", cenaCzk: "", poznamka: "" });
  /**
   * Čo sa práve zapísalo — kvôli ponuke faktúry.
   *
   * Jerry, 26. 9. 2026: „pohľadávka vzniká vytvorením balíčka a tým vzniká aj
   * potreba platby." Ponuka sa preto ukáže presne tu a hneď, nie ako ďalšia
   * položka niekde v menu.
   */
  const [posledny, setPosledny] = useState<{ klient: string; nazov: string; cena: number; id?: string } | null>(null);

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/balicky", { credentials: "same-origin" });
    const j = (await r.json()) as { ok: boolean; balicky?: Balicek[] };
    if (j.ok) setBalicky(j.balicky || []);
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const akcia = async (telo: Record<string, unknown>, znacka: string) => {
    setPracujem(znacka); setChyba(""); setHlaska("");
    let j = await posli(telo).catch(() => ({ ok: false, error: "spojenie" } as Awaited<ReturnType<typeof posli>>));
    // Druhý balíček k tomu istému — server sa pýta, človek rozhodne.
    if (!j.ok && potvrdDruhyBalicek(j)) j = await posli({ ...telo, ajTak: true }).catch(() => ({ ok: false, error: "spojenie" } as Awaited<ReturnType<typeof posli>>));
    setPracujem("");
    if (!j.ok) { setChyba(j.error || "nepodarilo sa uložiť"); return null; }
    if (typeof j.pridanych === "number") {
      setHlaska(`Naliatych ${j.pridanych} balíčkov z exportu${j.preskocenych ? `, ${j.preskocenych} preskočených (bez dátumu platnosti)` : ""}.`);
    }
    await nacitaj();
    oznam("peniaze");
    return j;
  };

  if (!balicky) return null;
  const zive = balicky.filter((b) => !b.zrusene_at);
  const prazdne = zive.length === 0;

  return (
    <Card>
      <H3>
        <Info
          text="Kokpit si vedie vlastný zoznam predaných balíčkov a zostatok si počíta sám z kalendára. Od 19. 10. 2026 sa do PTmindera nezapisuje, takže porovnanie s ním je vypnuté."
          label="Balíčky — vlastná evidencia"
        />
      </H3>

      {prazdne ? (
        <>
          <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.55, margin: "4px 0 10px" }}>
            Zoznam je zatiaľ prázdny. Nalej doň aktuálny stav z PTmindera — päťdesiat živých členstiev
            sa prepisovať ručne nebude. Odvtedy sa do Kokpitu zapisujú už len nové predaje a appka
            porovná, či jej zostatky sedia s PTminderom.
          </div>
          <button
            onClick={() => void akcia({ akcia: "nalej" }, "nalej")}
            disabled={pracujem === "nalej"}
            style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${mix(C.green, 45)}`, background: mix(C.green, 12), color: C.green,
            }}
          >
            {pracujem === "nalej" ? "nalievam…" : "Naliať z PTmindera"}
          </button>
        </>
      ) : (
        <>
          {/* Porovnanie s PTminderom (rozdiel hodín po klientoch) je od 20. 10.
              2026 vypnuté — do PTmindera sa nezapisuje, takže by rozdiel
              rástol každým tréningom a nehovoril nič o Kokpite. */}
          <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.55, margin: "2px 0 10px" }}>
            {zive.length} balíčkov v evidencii, z toho {zive.filter((b) => b.zdroj === "rucne").length} zapísaných v Kokpite.
            Zostatok klienta je v jeho profile — tam sa balíček aj upravuje.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button
              onClick={() => setPisem(!pisem)}
              style={{ padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${mix(C.accentLight, 45)}`, background: "transparent", color: C.accentLight }}
            >
              {pisem ? "Zavrieť" : "Zapísať nový balíček"}
            </button>
            <button
              onClick={() => void akcia({ akcia: "nalej" }, "nalej")}
              disabled={pracujem === "nalej"}
              style={{ padding: "5px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
            >
              {pracujem === "nalej" ? "…" : "Doplniť nové z PTmindera"}
            </button>
          </div>
        </>
      )}

      {pisem && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          {([
            { k: "klient", l: "klient", w: 180, list: true },
            { k: "nazov", l: "názov balíčka", w: 190, list: false },
            { k: "hodiny", l: "hodín (prázdne = paušál)", w: 150, list: false },
            { k: "platnostOd", l: "platnosť od", w: 130, list: false },
            { k: "platnostDo", l: "platnosť do", w: 130, list: false },
            { k: "cenaCzk", l: "cena Kč", w: 110, list: false },
          ] as const).map((x) => (
            <label key={x.k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: C.textDim }}>
              {x.l}
              <input
                value={f[x.k]}
                list={x.list ? "balicky-klienti" : undefined}
                onChange={(e) => setF({ ...f, [x.k]: e.target.value })}
                placeholder={x.k.startsWith("platnost") ? "RRRR-MM-DD" : ""}
                style={{ width: x.w, padding: "7px 9px", borderRadius: 8, fontSize: 12.5, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
              />
            </label>
          ))}
          <datalist id="balicky-klienti">{mena.map((m) => <option key={m} value={m} />)}</datalist>
          <button
            onClick={async () => {
              const j = await akcia({ akcia: "pridaj", ...f }, "pridaj");
              if (!j) return;
              setPosledny({ klient: f.klient, nazov: f.nazov, cena: Number(f.cenaCzk) || 0, id: typeof j.id === "string" ? j.id : undefined });
              setF({ ...f, klient: "", nazov: "", hodiny: "", cenaCzk: "", poznamka: "" });
              setPisem(false);
            }}
            disabled={pracujem === "pridaj"}
            style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${mix(C.green, 45)}`, background: mix(C.green, 12), color: C.green }}
          >
            {pracujem === "pridaj" ? "…" : "Uložiť"}
          </button>
        </div>
      )}

      {posledny && (onFaktura || onVypis) && (
        <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 9, border: `1px solid ${mix(C.accentLight, 40)}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: C.text }}>
            Zapísaný balíček <b>{nazovProduktu(posledny.nazov)}</b> pre {posledny.klient}
            {posledny.cena ? ` za ${Math.round(posledny.cena)} Kč` : ""}.
          </span>
          {onFaktura && (
            <button
              onClick={() => { onFaktura({ klient: posledny.klient, popis: posledny.nazov, cena: posledny.cena, balicekId: posledny.id }); setPosledny(null); }}
              style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 12), color: C.accentLight }}
            >
              Vystaviť faktúru
            </button>
          )}
          <SmsKlientovi
            meno={posledny.klient}
            /* ŽIADNY VLASTNÝ TEXT — ide tá istá správa ako všade inde.
               Jerry, 3. 10. 2026: „jedna SMS prišla bez linku." Táto jediná
               mala vlastné znenie („zapísal som ti… QR máš v maili") a tým
               pádom ani odkaz, na ktorý sa dá ťuknúť. Pritom stránka za
               odkazom ukáže nový balíček aj QR lepšie než veta o maili —
               a je to presne to pravidlo, ktoré Jerry zaviedol o deň skôr:
               stav hovorí stránka, nie text správy. */
            maly
          />
          {onVypis && (
            <button
              onClick={() => { onVypis(posledny.klient); setPosledny(null); }}
              title="Mail s dochádzkou a QR na platbu — bez faktúry"
              style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
            >
              Poslať výpis a QR
            </button>
          )}
          <button
            onClick={() => setPosledny(null)}
            style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          >
            netreba
          </button>
        </div>
      )}

      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12, color: C.green, marginTop: 8 }}>{hlaska}</div>}
    </Card>
  );
}
