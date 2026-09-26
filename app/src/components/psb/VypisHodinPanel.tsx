import { useMemo, useState } from "react";

import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import type { osCasuKlienta } from "../../lib/psb/klientOsCasu";
import { C, mix } from "../../lib/psb/theme";
import { hod, poslednychMesiacov, vypisAkoText, vypisHodin } from "../../lib/psb/vypisHodin";

/**
 * VÝPIS HODÍN PRE KLIENTA.
 *
 * Jerry, 26. 9. 2026: „s možnosťou vytvoriť z toho report a poslať to
 * klientovi na kontrolu, samozrejme aj s filtrom, keby náhodou má dlhoročnú
 * históriu a ja mu chcem poslať kontrolu len za posledných pár týždňov."
 *
 * Výpis ide do TELA mailu, nie do prílohy. Klient ho má prečítať a povedať
 * „toto sedí" alebo „tu nie" — príloha, ktorú treba otvárať, to len sťaží.
 * A text sa dá pred odoslaním prepísať, rovnako ako pri faktúre.
 */

type Os = ReturnType<typeof osCasuKlienta>;

const OBDOBIA = [
  { l: "posledný mesiac", m: 1 },
  { l: "3 mesiace", m: 3 },
  { l: "6 mesiacov", m: 6 },
  { l: "všetko", m: 0 },
];

export function VypisHodinPanel({ meno, os, email, zostatokTeraz }: { meno: string; os: Os; email?: string; zostatokTeraz: number | null }) {
  const [otvorene, setOtvorene] = useState(false);
  const [mesiacov, setMesiacov] = useState(3);
  const [komu, setKomu] = useState(email || "");
  const [telo, setTelo] = useState("");
  const [predmet, setPredmet] = useState("");
  const [rucne, setRucne] = useState(false);
  const [pracujem, setPracujem] = useState(false);
  const [hlaska, setHlaska] = useState("");
  const [chyba, setChyba] = useState("");

  const v = useMemo(() => {
    const { od, do: doDna } = mesiacov ? poslednychMesiacov(mesiacov) : { od: "", do: "" };
    return vypisHodin(os, od, doDna, zostatokTeraz);
  }, [os, mesiacov, zostatokTeraz]);

  // Text sa prepočíta pri zmene obdobia — ale len dovtedy, kým doň človek
  // nesiahol. Prepísaný text sa prepnutím filtra nemá stratiť.
  const navrhTela = useMemo(() => vypisAkoText(v, meno), [v, meno]);
  const zobrazenyText = rucne ? telo : navrhTela;

  const posli = async () => {
    setPracujem(true); setChyba(""); setHlaska("");
    const j = await fetch("/api/vydane-faktury", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        akcia: "posli-vypis",
        klient: meno,
        komu: komu.trim(),
        predmet: predmet.trim() || `Výpis hodín — ProSapiens Biomechanic`,
        telo: zobrazenyText,
      }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!j?.ok) { setChyba(j?.error || "Nepodarilo sa odoslať."); return; }
    setHlaska(`Výpis odišiel na ${komu.trim()}. Kópia je aj v tvojej schránke.`);
  };

  if (!otvorene) {
    return (
      <button
        onClick={() => setOtvorene(true)}
        style={{
          marginTop: 10, padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
          border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontFamily: "inherit",
        }}
      >
        ✉ Výpis hodín pre klienta
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 11, border: `1px solid ${mix(C.accentLight, 40)}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <b style={{ fontSize: 12.5, color: C.text }}>Výpis hodín — {meno}</b>
        <div style={{ display: "flex", gap: 4 }}>
          {OBDOBIA.map((o) => (
            <button
              key={o.l}
              onClick={() => { setMesiacov(o.m); setRucne(false); }}
              style={{
                padding: "4px 9px", borderRadius: 999, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${mesiacov === o.m ? C.accent : C.border}`,
                background: mesiacov === o.m ? mix(C.accent, 14) : "transparent",
                color: mesiacov === o.m ? C.accentLight : C.textMuted,
              }}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8, fontSize: 12 }}>
        <span style={{ color: C.textMuted }}>zaplatené <b style={{ color: C.text }}>{fmtCZK(v.zaplatene)}</b></span>
        <span style={{ color: C.textMuted }}>odtrénované <b style={{ color: C.text }}>{hod(v.odtrenovane)} h</b></span>
        {v.kupene > 0 && <span style={{ color: C.textMuted }}>kúpené <b style={{ color: C.green }}>+{hod(v.kupene)} h</b></span>}
        {v.koniec !== null && (
          <span style={{ color: C.textMuted }}>zostáva <b style={{ color: v.koniec > 0 ? C.green : C.orange }}>{hod(v.koniec)} h</b></span>
        )}
        <span style={{ color: C.textDim }}>{v.od ? `${fmtDMY(v.od)} – ${fmtDMY(v.do)}` : ""}</span>
      </div>

      {/* Dve rôzne čísla treba oddeliť slovami, inak si ich klient zlúči.
          Zostatok appka vie len od balíčka, ktorý vidí; odtrénované hodiny
          pozná od prvého dňa. */}
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>
        {v.koniec === null
          ? "Zostatok sa nedá spočítať — k tomuto klientovi nemá appka bežiaci balíček. Odtrénované hodiny sedia."
          : v.neuplny
            ? `Zostatok je za posledné členstvo (od ${fmtDMY(v.kotva)}); staršie riadky ukazujú „spolu" — koľko hodín mal klient dovtedy za sebou. Celkovo ${hod(v.spolu)} h.`
            : `Za celú históriu má odtrénovaných ${hod(v.spolu)} h.`}
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 8 }}>
        <input
          value={komu}
          onChange={(e) => setKomu(e.target.value)}
          placeholder="komu (e-mail klienta)"
          style={{ flex: "1 1 220px", padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
        />
        <input
          value={predmet}
          onChange={(e) => setPredmet(e.target.value)}
          placeholder="Výpis hodín — ProSapiens Biomechanic"
          style={{ flex: "2 1 260px", padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
        />
      </div>

      <textarea
        value={zobrazenyText}
        onChange={(e) => { setRucne(true); setTelo(e.target.value); }}
        rows={14}
        style={{
          width: "100%", boxSizing: "border-box", padding: "8px 9px", borderRadius: 8, fontSize: 12,
          border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          lineHeight: 1.5, resize: "vertical", marginBottom: 8,
        }}
      />

      {chyba && <div style={{ fontSize: 12, color: C.red, marginBottom: 6 }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12, color: C.green, marginBottom: 6 }}>{hlaska}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => void posli()}
          disabled={pracujem || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(komu.trim())}
          style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            cursor: pracujem ? "default" : "pointer",
            border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 13), color: C.green, fontFamily: "inherit",
            opacity: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(komu.trim()) ? 1 : 0.5,
          }}
        >
          {pracujem ? "posielam…" : "Poslať klientovi"}
        </button>
        <button
          onClick={() => { void navigator.clipboard?.writeText(zobrazenyText); setHlaska("Výpis skopírovaný."); }}
          style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        >
          skopírovať
        </button>
        <button onClick={() => setOtvorene(false)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          zavrieť
        </button>
        {!komu.trim() && <span style={{ fontSize: 11, color: C.textDim }}>klient nemá mail — doplň ho v Poznámkach</span>}
      </div>
    </div>
  );
}
