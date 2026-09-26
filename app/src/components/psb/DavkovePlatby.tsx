import { useCallback, useEffect, useMemo, useState } from "react";

import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import { oznam } from "../../lib/psb/obnovaSignal";
import { C, mix } from "../../lib/psb/theme";
import { Card, H3, Info } from "./ui";

/**
 * DÁVKOVÉ PRIRADENIE BANKOVÝCH PRÍJMOV.
 *
 * Jerry, 26. 9. 2026: „vieš tie platby na účte automaticky priradiť ku
 * klientovi na základe poznámky v platbe — ale nie tak, že sa priamo
 * zapíšu?" Presne tak: návrh robí appka, zapíše sa len to, čo človek
 * odklikne. Doteraz sa to dalo potvrdzovať po jednom a to je pri stovke
 * príjmov práca na mesiac.
 *
 * TRI KOPY, NIE JEDNA:
 *  • jednoznačné — appka pozná jediného kandidáta, sú predzaškrtnuté,
 *  • na výber — kandidátov je viac, človek vyberie zo zoznamu,
 *  • bez návrhu — appka nevie; tie sa tu ani neukazujú, patria do Workspace,
 *    kde sa meno dopíše ručne.
 *
 * Prečo sú jednoznačné predzaškrtnuté: sú to tie, kde je meno klienta priamo
 * v odosielateľovi alebo sa pravidlo už raz potvrdilo. Kto to chce
 * skontrolovať, vidí sumu aj text; kto nie, klikne raz.
 */

type Navrh = {
  fioId: string; datum: string; suma: number; text: string;
  kandidati: string[]; klientsky?: boolean; zdrojNavrhu?: string;
};

const ZDROJ: Record<string, string> = {
  naucene: "už potvrdené pravidlo",
  faktura: "variabilný symbol sedí s faktúrou",
  firma: "firma alebo IČO klienta",
  meno: "meno v platbe",
  suma: "suma a deň sedia s PTminderom",
};

export function DavkovePlatby({ mena }: { mena: string[] }) {
  const [vsetky, setVsetky] = useState<Navrh[] | null>(null);
  const [vyber, setVyber] = useState<Record<string, string>>({});
  const [pracujem, setPracujem] = useState(false);
  const [hlaska, setHlaska] = useState("");
  const [chyba, setChyba] = useState("");

  const nacitaj = useCallback(async () => {
    const j = await fetch("/api/platby", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) { setChyba("Príjmy z banky sa nenačítali."); return; }
    const n = (j.nepriradene || []) as Navrh[];
    setVsetky(n);
    /**
     * PREDZAŠKRTNE SA LEN DÔKAZ, NIE ODHAD.
     *
     * Jediný kandidát nestačí. Návrh „podľa sumy a dňa" je odhad z toho, že
     * v PTminderi je v ten deň rovnaká čiastka — a 26. 9. 2026 sa hneď na
     * prvom riadku ukázalo, ako to dopadne: príjem 6 990 Kč s textom
     * „20260037 MGR. FILIP STRANAVSKY" (variabilný symbol faktúry pre FSH
     * Devices) appka navrhla Janovi Kráľovi, lebo mal v ten deň rovnakú
     * sumu. Predzaškrtnuté je preto len to, čo stojí na mene v platbe alebo
     * na pravidle, ktoré už niekto potvrdil; odhad zo sumy si človek musí
     * odkliknúť sám.
     */
    const predvolene: Record<string, string> = {};
    for (const p of n) {
      if (p.kandidati.length === 1 && p.zdrojNavrhu !== "suma") predvolene[p.fioId] = p.kandidati[0];
    }
    setVyber(predvolene);
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const { jednoznacne, podlaSumy, naVyber } = useMemo(() => ({
    jednoznacne: (vsetky || []).filter((p) => p.kandidati.length === 1 && p.zdrojNavrhu !== "suma"),
    // Odhad zo sumy má vlastnú kopu — nie je to dôkaz, je to zhoda čísla.
    podlaSumy: (vsetky || []).filter((p) => p.kandidati.length === 1 && p.zdrojNavrhu === "suma"),
    naVyber: (vsetky || []).filter((p) => p.kandidati.length > 1),
  }), [vsetky]);

  const oznacene = useMemo(
    () => Object.entries(vyber).filter(([, k]) => k).map(([fioId, klient]) => ({ fioId, klient })),
    [vyber],
  );
  const sumaOznacenych = useMemo(() => {
    const podla = new Map((vsetky || []).map((p) => [p.fioId, p.suma]));
    return oznacene.reduce((a, o) => a + (podla.get(o.fioId) || 0), 0);
  }, [oznacene, vsetky]);

  const potvrd = async () => {
    setPracujem(true); setChyba(""); setHlaska("");
    const j = await fetch("/api/platby", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "priradz-davka", polozky: oznacene }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!j?.ok) { setChyba(j?.error || "Nepodarilo sa priradiť."); return; }
    setHlaska(`Priradených ${j.hotovo} platieb${j.naucenych ? `, z toho ${j.naucenych} pravidiel si appka zapamätala` : ""}.`);
    if (j.chyby?.length) setChyba(j.chyby.join(" · "));
    setVyber({});
    await nacitaj();
    oznam("peniaze");
  };

  if (!vsetky) return null;
  if (!jednoznacne.length && !naVyber.length && !podlaSumy.length) {
    return (
      <Card>
        <H3>Bankové príjmy bez klienta</H3>
        <div style={{ fontSize: 12.5, color: C.green, marginTop: 4 }}>
          Každý príjem, ku ktorému appka vie navrhnúť klienta, je priradený.
        </div>
      </Card>
    );
  }

  const riadok = (p: Navrh, sVyberom: boolean) => (
    <div key={p.fioId} style={{ display: "flex", gap: 9, alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${mix(C.border, 35)}`, flexWrap: "wrap" }}>
      <input
        type="checkbox"
        checked={!!vyber[p.fioId]}
        onChange={(e) => setVyber((v) => ({ ...v, [p.fioId]: e.target.checked ? (v[p.fioId] || p.kandidati[0] || "") : "" }))}
        style={{ cursor: "pointer" }}
      />
      <span style={{ width: 62, fontSize: 11.5, color: C.textDim }}>{fmtDMY(p.datum)}</span>
      <span style={{ width: 82, fontSize: 12.5, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCZK(p.suma)}</span>
      <span style={{ flex: "1 1 180px", minWidth: 140, fontSize: 11, color: C.textMuted }}>{p.text.slice(0, 80)}</span>
      {sVyberom ? (
        <select
          value={vyber[p.fioId] || ""}
          onChange={(e) => setVyber((v) => ({ ...v, [p.fioId]: e.target.value }))}
          style={{ padding: "5px 7px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text, minWidth: 170 }}
        >
          <option value="">— vyber klienta —</option>
          {p.kandidati.map((k) => <option key={k} value={k}>{k}</option>)}
          {mena.filter((m) => !p.kandidati.includes(m)).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      ) : (
        <span style={{ minWidth: 170, fontSize: 12.5, color: C.text }}>
          {p.kandidati[0]}
          <span style={{ fontSize: 10.5, color: C.textDim }}> · {ZDROJ[p.zdrojNavrhu || ""] || "odhad"}</span>
        </span>
      )}
    </div>
  );

  return (
    <Card>
      <H3>
        <Info
          label="Bankové príjmy bez klienta"
          text="Appka ku každému príjmu navrhne klienta — z mena v platbe, z pravidla, ktoré si raz potvrdil, alebo podľa sumy a dňa oproti PTminderu. Sama nezapíše nič; zapíše sa len to, čo tu odklikneš. Jednoznačné návrhy sú predzaškrtnuté, pri viacerých kandidátoch rozhoduje človek."
        />
      </H3>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "6px 0 12px" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: C.accentLight }}>{jednoznacne.length}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>jednoznačných<br /><span style={{ color: C.textDim }}>predzaškrtnuté</span></div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: C.orange }}>{naVyber.length + podlaSumy.length}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>na rozhodnutie<br /><span style={{ color: C.textDim }}>viac mien alebo len suma</span></div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: C.text }}>{fmtCZK(sumaOznacenych)}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>označených {oznacene.length}<br /><span style={{ color: C.textDim }}>toľko pribudne do knihy</span></div>
        </div>
      </div>

      {chyba && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 8 }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12.5, color: C.green, marginBottom: 8 }}>{hlaska}</div>}

      <button
        type="button"
        onClick={() => void potvrd()}
        disabled={pracujem || !oznacene.length}
        style={{
          padding: "9px 16px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, marginBottom: 12,
          cursor: pracujem || !oznacene.length ? "default" : "pointer",
          border: `1px solid ${mix(C.green, 55)}`, background: mix(C.green, 14), color: C.green,
          opacity: oznacene.length ? 1 : 0.5,
        }}
      >
        {pracujem ? "priraďujem…" : `Priradiť označené (${oznacene.length})`}
      </button>

      {jednoznacne.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.6, marginBottom: 2 }}>JEDNOZNAČNÉ</div>
          {jednoznacne.map((p) => riadok(p, false))}
        </>
      )}
      {podlaSumy.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.orange, letterSpacing: 0.6, margin: "12px 0 2px" }}>
            LEN PODĽA SUMY A DŇA — SKONTROLUJ
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4, lineHeight: 1.5 }}>
            Meno klienta v platbe nie je; appka našla iba rovnakú sumu v ten deň. Býva to správne,
            ale nie vždy — variabilný symbol faktúry vyzerá ako cudzia platba.
          </div>
          {podlaSumy.map((p) => riadok(p, true))}
        </>
      )}
      {naVyber.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.6, margin: "12px 0 2px" }}>VIAC KANDIDÁTOV — VYBER</div>
          {naVyber.map((p) => riadok(p, true))}
        </>
      )}

      <div style={{ fontSize: 11, color: C.textDim, marginTop: 10, lineHeight: 1.55 }}>
        Príjmy, ku ktorým appka nevie navrhnúť nikoho, tu nie sú — tie sa dopisujú ručne vo
        Workspace na karte „Platby z banky". Pri potvrdení si appka zapamätá pravidlo len vtedy,
        keď je meno klienta priamo v odosielateľovi; zo sprostredkovaného prevodu sa neučí.
      </div>
    </Card>
  );
}
