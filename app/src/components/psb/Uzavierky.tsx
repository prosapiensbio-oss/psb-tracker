import { useEffect, useMemo, useState } from "react";

import { fetchPeriods, setPeriodLock, type AuditRiadok, type Obdobie } from "../../lib/psb/client";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info } from "./ui";

// Uzávierky a audit — brána pred importom z banky.
//
// Doteraz sa dalo v appke zmeniť čokoľvek a nezostala po tom stopa. Pri
// tréningových dátach to bolo únosné, dajú sa znova nahrať z PTmindera. Pri
// peniazoch z banky to únosné nie je: keď sa raz uzavretý mesiac ticho prepíše
// importom, nikto to nezistí a čísla prestanú zodpovedať tomu, čo bolo
// odovzdané účtovníčke.
//
// Zámok nie je varovanie, je to odmietnutie: import riadky z uzavretého mesiaca
// preskočí a povie o tom. A záloha existuje preto, že zámok ani audit nevrátia
// stav späť — hovoria len, čo sa stalo.

const MESIACE = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
const label = (m: string) => `${MESIACE[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const POPIS: Record<string, string> = {
  "import": "Import CSV",
  "uprava-klienta": "Úprava klienta",
  "skrytie-signalu": "Skrytie signálu",
  "vratenie-signalu": "Vrátenie signálu",
  "nastavenie": "Zmena nastavenia",
  "zapis-zaveru": "Zápis záveru",
  "vyhodnotenie-zaveru": "Vyhodnotenie záveru",
  "zmazanie-dopytu": "Zmazanie dopytu",
  "zamknutie-obdobia": "Zamknutie mesiaca",
  "odomknutie-obdobia": "Odomknutie mesiaca",
  "zaloha": "Stiahnutá záloha",
};

export function Uzavierky() {
  const [obdobia, setObdobia] = useState<Obdobie[]>([]);
  const [log, setLog] = useState<AuditRiadok[]>([]);
  const [nacitava, setNacitava] = useState(true);
  const [prebieha, setPrebieha] = useState<string | null>(null);

  const nacitaj = () => {
    void fetchPeriods().then(({ periods, audit }) => {
      setObdobia(periods);
      setLog(audit);
      setNacitava(false);
    });
  };
  useEffect(nacitaj, []);

  const zamky = useMemo(() => new Map(obdobia.map((o) => [o.month, o])), [obdobia]);
  // Mesiace idú z kalendára (od januára 2025 po posledný SKONČENÝ mesiac), nie
  // z rozsahu VZAS. Ten má natvrdo 18 mesiacov z Excelu a končí júnom 2026 —
  // takže júl, prvý mesiac, ktorý reálne treba uzavrieť pred bankou, sa nedal
  // zamknúť. Bežiaci mesiac sa nezamyká: dáta doň ešte pribúdajú (uzávierka je
  // prvý víkend nasledujúceho).
  const dnesMesiac = new Date().toISOString().slice(0, 7);
  const mesiace = useMemo(() => {
    const out: string[] = [];
    for (let rok = 2025; rok <= Number(dnesMesiac.slice(0, 4)); rok++) {
      for (let m = 1; m <= 12; m++) {
        const mk = `${rok}-${String(m).padStart(2, "0")}`;
        if (mk < dnesMesiac) out.push(mk);
      }
    }
    return out.reverse();
  }, [dnesMesiac]);

  const prepni = async (m: string, na: boolean) => {
    setPrebieha(m);
    await setPeriodLock(m, na);
    nacitaj();
    setPrebieha(null);
  };

  const pocetZamknutych = obdobia.filter((o) => o.locked).length;

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3><Info text="Uzavretý mesiac sa nedá prepísať importom — riadky, ktoré doň patria, sa preskočia a upload o tom povie. Zamykaj až po tom, čo mesiac skontroluješ; odomknúť sa dá kedykoľvek a zostane po tom záznam v audite. Bežiaci mesiac sa zamknúť nedá, dáta doň ešte pribúdajú (uzávierka je prvý víkend nasledujúceho mesiaca)." label="Uzavreté mesiace" /></H3>
          <a
            href="/api/export"
            download
            style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 8), color: C.accentLight, fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}
          >
            ⬇ Stiahnuť zálohu
          </a>
        </div>
        <div style={{ fontSize: 12, color: C.textDim, margin: "6px 0 12px", lineHeight: 1.55 }}>
          Záloha je jediná vec, ktorá dovolí vrátiť stav späť — zámok aj audit len hovoria, čo sa stalo.
          Stiahni si ju pred prvým importom z banky a nechaj ju mimo appky.
          {pocetZamknutych > 0 && <> Zamknutých mesiacov: <b style={{ color: C.text }}>{pocetZamknutych}</b>.</>}
        </div>

        {nacitava ? (
          <div style={{ fontSize: 12.5, color: C.textDim }}>Načítavam…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 8 }}>
            {mesiace.map((m) => {
              const o = zamky.get(m);
              const zamknuty = !!o?.locked;
              return (
                <button
                  key={m}
                  onClick={() => void prepni(m, !zamknuty)}
                  disabled={prebieha === m}
                  title={zamknuty ? `Uzavreté ${o?.lockedAt?.slice(0, 10) || ""} — klik odomkne` : "Klik uzavrie mesiac"}
                  style={{
                    padding: "9px 11px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                    border: `1px solid ${zamknuty ? mix(C.green, 45) : C.border}`,
                    background: zamknuty ? mix(C.green, 10) : "transparent",
                    color: zamknuty ? C.text : C.textMuted, fontSize: 12.5,
                    opacity: prebieha === m ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{zamknuty ? "🔒" : "🔓"} {label(m)}</div>
                  <div style={{ fontSize: 10.5, color: zamknuty ? C.green : C.textDim, marginTop: 2 }}>
                    {zamknuty ? "uzavretý" : "otvorený"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <H3><Info text="Každá zmena v appke necháva riadok: čo sa zmenilo, z čoho na čo a kedy. Zobrazuje sa posledných 200 záznamov. Existuje preto, aby sa pri peniazoch dalo dohľadať, kto čo prepísal — do importu z banky bolo možné zmeniť čokoľvek bez stopy." label="Audit — posledné zmeny" /></H3>
        {log.length === 0 ? (
          <Empty>Zatiaľ žiadne zmeny. Prvá zmena po nasadení sa objaví tu.</Empty>
        ) : (
          <div style={{ maxHeight: 420, overflowY: "auto", marginTop: 8 }}>
            {log.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${mix(C.border, 55)}`, fontSize: 12.5, flexWrap: "wrap" }}>
                <span style={{ color: C.textDim, fontSize: 11, minWidth: 118, fontVariantNumeric: "tabular-nums" }}>
                  {r.at.slice(0, 16).replace("T", " ")}
                </span>
                <span style={{ color: C.accentLight, minWidth: 150 }}>{POPIS[r.action] || r.action}</span>
                <span style={{ color: C.text, flex: "1 1 200px", minWidth: 0 }}>
                  {r.predmet}
                  {r.neu && <span style={{ color: C.textMuted }}> → {r.neu.length > 90 ? `${r.neu.slice(0, 90)}…` : r.neu}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
