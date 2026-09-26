import { useCallback, useEffect, useMemo, useState } from "react";

import { jeFirma, navrhniKlienta } from "../../lib/psb/kontaktyIdokladu";
import { oznam } from "../../lib/psb/obnovaSignal";
import { C, mix } from "../../lib/psb/theme";
import { Card, H3, Info } from "./ui";

/**
 * PÁROVAČ FAKTURAČNÝCH KONTAKTOV.
 *
 * Jerry, 26. 9. 2026: „súhlasím, a kľudne v Prechode postav nejaký párovač."
 *
 * Ide o jedinú vec, ktorú appka vedieť nemôže: KTO STOJÍ ZA FIRMOU. Platba
 * z „FSH Devices s.r.o." patrí klientovi, ktorý si dal faktúru vystaviť na
 * svoju firmu — a to vie povedať len človek. Po spárovaní sa firma a IČO
 * zapíšu ku klientovi a odvtedy sa jeho platby z banky páruju samy.
 *
 * Pri fyzických osobách appka navrhne (priezvisko sedí na jediného klienta),
 * pri firmách nenavrhuje nič — hádať, kto je za firmou, by znamenalo pripísať
 * peniaze cudziemu človeku.
 */

type Kontakt = {
  id: string; firma: string; ico: string; dic: string; email: string; telefon: string;
  os_meno: string; os_priezvisko: string; klient: string; odlozene_at: string | null;
};

export function ParovacKontaktov({ mena }: { mena: string[] }) {
  const [kontakty, setKontakty] = useState<Kontakt[] | null>(null);
  const [vyber, setVyber] = useState<Record<string, string>>({});
  const [pracujem, setPracujem] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [chyba, setChyba] = useState("");
  const [ukazHotove, setUkazHotove] = useState(false);

  const nacitaj = useCallback(async () => {
    const j = await fetch("/api/vydane-faktury", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) { setChyba("Kontakty sa nenačítali."); return; }
    setKontakty((j.kontakty || []) as Kontakt[]);
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const { cakaju, hotove, odlozene } = useMemo(() => {
    const k = kontakty || [];
    return {
      cakaju: k.filter((x) => !x.klient && !x.odlozene_at),
      hotove: k.filter((x) => x.klient),
      odlozene: k.filter((x) => !x.klient && x.odlozene_at),
    };
  }, [kontakty]);

  // Návrh sa počíta až tu, nie na serveri: zoznam klientov má obrazovka
  // aj tak po ruke a server by ho musel posielať druhýkrát.
  const navrhy = useMemo(() => {
    const m: Record<string, string> = {};
    for (const k of cakaju) {
      const n = navrhniKlienta({ firma: k.firma, osMeno: k.os_meno, osPriezvisko: k.os_priezvisko }, mena);
      if (n.length === 1) m[k.id] = n[0];
    }
    return m;
  }, [cakaju, mena]);

  const posli = async (telo: Record<string, unknown>, znacka: string) => {
    setPracujem(znacka); setChyba(""); setHlaska("");
    const j = await fetch("/api/vydane-faktury", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(telo),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem("");
    if (!j?.ok) { setChyba(j?.error || "nepodarilo sa"); return null; }
    await nacitaj();
    oznam("peniaze");
    return j;
  };

  const paruj = async (k: Kontakt) => {
    const klient = vyber[k.id] || navrhy[k.id] || "";
    if (!klient) { setChyba(`Pri „${k.firma}" vyber klienta.`); return; }
    const j = await posli({ akcia: "kontakt-paruj", id: k.id, klient }, k.id);
    if (j) setHlaska(`${k.firma} → ${j.klient}. Platby z tejto firmy sa odteraz priradia samy.`);
  };

  if (!kontakty) return null;

  const riadok = (k: Kontakt, hotovy: boolean) => (
    <div key={k.id} style={{ display: "flex", gap: 9, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${mix(C.border, 35)}`, flexWrap: "wrap" }}>
      <span style={{ flex: "1 1 200px", minWidth: 170, fontSize: 12.5, color: C.text }}>
        {k.firma}
        <span style={{ fontSize: 11, color: C.textDim }}>
          {k.ico ? ` · IČ ${k.ico}` : ""}{k.email ? ` · ${k.email}` : ""}
        </span>
      </span>
      {hotovy ? (
        <span style={{ minWidth: 190, fontSize: 12.5, color: C.green }}>→ {k.klient}</span>
      ) : (
        <>
          <select
            value={vyber[k.id] ?? navrhy[k.id] ?? ""}
            onChange={(e) => setVyber((v) => ({ ...v, [k.id]: e.target.value }))}
            style={{ padding: "5px 7px", borderRadius: 7, fontSize: 12, border: `1px solid ${navrhy[k.id] && !vyber[k.id] ? mix(C.accent, 60) : C.border}`, background: C.bg, color: C.text, minWidth: 190 }}
          >
            <option value="">{jeFirma(k) ? "— kto za firmou stojí? —" : "— vyber klienta —"}</option>
            {mena.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button
            type="button"
            onClick={() => void paruj(k)}
            disabled={pracujem === k.id}
            style={{
              padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${mix(C.green, 45)}`, background: mix(C.green, 12), color: C.green, fontFamily: "inherit",
            }}
          >
            {pracujem === k.id ? "…" : "Spárovať"}
          </button>
          <button
            type="button"
            onClick={() => void posli({ akcia: "kontakt-odloz", id: k.id }, k.id)}
            style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}
          >
            nie je klient
          </button>
        </>
      )}
    </div>
  );

  return (
    <Card>
      <H3>
        <Info
          label="Párovanie fakturačných kontaktov"
          text="Platba z firmy patrí klientovi, ktorý si dal faktúru vystaviť na svoju firmu. Appka vie z platby prečítať názov aj IČO, ale nevie, kto za firmou stojí — to povie len človek. Po spárovaní sa firma a IČO zapíšu ku klientovi a jeho ďalšie platby z banky sa priradia samy."
        />
      </H3>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "6px 0 12px" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: cakaju.length ? C.orange : C.green }}>{cakaju.length}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>čaká na spárovanie<br /><span style={{ color: C.textDim }}>{Object.keys(navrhy).length} má návrh</span></div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: C.green }}>{hotove.length}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>spárovaných<br /><span style={{ color: C.textDim }}>platby sa priradia samy</span></div>
        </div>
      </div>

      {chyba && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 8 }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12.5, color: C.green, marginBottom: 8 }}>{hlaska}</div>}

      {cakaju.length === 0 && hotove.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.55 }}>
          Zatiaľ tu nie sú žiadne kontakty. Nahrajú sa z exportu „Seznam kontaktů" z iDokladu.
        </div>
      ) : (
        <>
          {cakaju.map((k) => riadok(k, false))}
          {odlozene.length > 0 && (
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
              Odložených ako „nie je klient": {odlozene.length}
            </div>
          )}
          {hotove.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setUkazHotove((x) => !x)}
                style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                {ukazHotove ? "skryť spárované" : `ukázať spárované (${hotove.length})`}
              </button>
              {ukazHotove && <div style={{ marginTop: 6 }}>{hotove.map((k) => riadok(k, true))}</div>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
