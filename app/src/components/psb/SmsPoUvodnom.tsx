import { useEffect, useState } from "react";

import { saveAnomaly } from "../../lib/psb/client";
import { doSchranky } from "../../lib/psb/kopirovanie";
import { otvorNahlad } from "../../lib/psb/nahladOkno";
import { oznam } from "../../lib/psb/obnovaSignal";
import { bezDiakritiky, cisloPreBranu, dlzkaSpravy } from "../../lib/psb/sms";
import { C, mix } from "../../lib/psb/theme";

/**
 * SMS PO ÚVODNOM — jedno okno pre notifikáciu aj profil klienta.
 *
 * Jerry, 28. 10. 2026: „včera bola na úvodnom Linda Muth — na profile
 * potrebujem pridať možnosť poslať SMS po úvodnom tréningu" a „prečo nie je
 * v notifikáciách poslať SMS po úvodnom, ale naplánovať". Okno sa najprv
 * pýtalo na dátum a čas ďalšieho tréningu (stránka `/u/` ho klientovi
 * ukazuje), takže pôsobilo ako plánovanie. Ďalší tréning sa odteraz
 * PREDVYPĹŇA z kalendára (`dalsiTrening`); kým ešte nie je dohodnutý,
 * políčko ostane prázdne a SMS ide aj bez neho.
 *
 * Po odoslaní sa zavrie aj notifikácia `sms|<deň>|<meno>` — z ktoréhokoľvek
 * miesta sa SMS poslala, druhýkrát sa netreba pýtať.
 */
export function SmsPoUvodnom({ meno, trener, dalsiTrening, klucNotifikacie, onOdoslane }: {
  meno: string;
  trener?: string | null;
  /** Najbližší tréning po úvodnom z kalendára, `YYYY-MM-DDTHH:MM`. */
  dalsiTrening?: string | null;
  /** Kľúč notifikácie `sms|<deň úvodného>|<meno>`, ktorá sa po odoslaní zavrie. */
  klucNotifikacie?: string;
  onOdoslane?: (poznamka: string) => void;
}) {
  const [datum, setDatum] = useState(dalsiTrening ? dalsiTrening.slice(0, 10) : "");
  const [cas, setCas] = useState(dalsiTrening ? dalsiTrening.slice(11, 16) : "");
  const [kto, setKto] = useState(trener === "Jerry" ? "Jerry" : "Terezka");
  const [telefon, setTelefon] = useState("");
  /** Má klient číslo v Kokpite? Bez neho sa ukáže políčko — a ostane, kým sa píše. */
  const [cisloVKokpite, setCisloVKokpite] = useState<boolean | null>(null);
  const [odkaz, setOdkaz] = useState("");
  const [text, setText] = useState("");
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState("");
  const [hotovo, setHotovo] = useState("");
  /** Koľko fotiek pred a po stránka ukáže — pridávajú sa v profile → fotky → Úvodný tréning. */
  const [fotky, setFotky] = useState<number | null>(null);

  // Termín z kalendára môže doraziť až po otvorení — kým sa ho nikto nedotkol, prevezme ho.
  useEffect(() => {
    if (!dalsiTrening || datum) return;
    setDatum(dalsiTrening.slice(0, 10));
    setCas(dalsiTrening.slice(11, 16));
  }, [dalsiTrening]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let zrusene = false;
    void fetch("/api/vydane-faktury", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { udaje?: { klient: string; telefon?: string }[] }) => {
        if (zrusene) return;
        const t = String((j.udaje || []).find((u) => u.klient === meno)?.telefon || "");
        setCisloVKokpite(!!cisloPreBranu(t));
        setTelefon((pred) => pred || t);
      })
      .catch(() => setCisloVKokpite(false));
    return () => { zrusene = true; };
  }, [meno]);

  const cislo = cisloPreBranu(telefon);
  const vstup = { padding: "5px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, colorScheme: "dark" as const };
  const tlacidlo = (aktivne: boolean) => ({
    padding: "5px 13px", borderRadius: 7, border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 12), color: C.green,
    fontSize: 12, fontWeight: 600, cursor: aktivne ? "pointer" : "default", opacity: aktivne ? 1 : 0.45, fontFamily: "inherit",
  });

  const priprav = async () => {
    if (bezi) return;
    setBezi(true);
    setChyba("");
    try {
      const r = await fetch("/api/uvodny", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "odkaz", klient: meno, druh: "po", trener: kto, kedy: datum && cas ? `${datum}T${cas}` : null, cena: null }),
      }).then((x) => x.json() as Promise<{ ok?: boolean; odkaz?: string; error?: string; fotky?: number }>);
      if (!r.ok || !r.odkaz) { setChyba(r.error || "Odkaz sa nepodarilo vyrobiť."); return; }
      setOdkaz(r.odkaz);
      setFotky(r.fotky ?? 0);
      // Bez diakritiky: s mäkčeňmi má SMS 70 znakov namiesto 160.
      // Fotky pred a po sa spomenú len vtedy, keď ich stránka naozaj ukáže.
      const co = [datum && cas ? "termin dalsiho treninku" : "", r.fotky ? "fotky pred a po" : "", "souhrn"].filter(Boolean).join(", ");
      setText(bezDiakritiky(`Dekujeme za ucast na uvodni lekci. ${co.charAt(0).toUpperCase()}${co.slice(1)} i doporucene cteni najdete zde: ${r.odkaz}`));
    } catch {
      setChyba("Odkaz sa nepodarilo vyrobiť — skús znova.");
    } finally {
      setBezi(false);
    }
  };

  const posli = async () => {
    if (!cislo || !text.trim() || bezi) return;
    setBezi(true);
    setChyba("");
    try {
      const r = await fetch("/api/sms", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ klient: meno, telefon, text: text.trim() }),
      }).then((x) => x.json() as Promise<{ ok?: boolean; error?: string }>);
      if (!r.ok) { setChyba(r.error || "SMS neodišla."); return; }
      const poznamka = `SMS po úvodnom odoslaná${datum && cas ? ` · ďalší tréning ${datum} ${cas}` : ""}${fotky ? " · s fotkami pred a po" : ""}`;
      if (klucNotifikacie) await saveAnomaly(klucNotifikacie, poznamka, true);
      oznam("klienti");
      setHotovo(`Odoslané na ${cislo}.`);
      onOdoslane?.(poznamka);
    } catch {
      setChyba("SMS neodišla — skús znova.");
    } finally {
      setBezi(false);
    }
  };

  if (hotovo) return <div style={{ fontSize: 12.5, color: C.green }}>✓ {hotovo}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>Ďalší tréning:</span>
        <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} style={vstup} />
        <input type="time" value={cas} onChange={(e) => setCas(e.target.value)} style={vstup} />
        <span style={{ fontSize: 11.5, color: C.textDim }}>
          {dalsiTrening ? "z kalendára" : "v kalendári ešte nie je — nechaj prázdne, ak nie je dohodnutý"}
        </span>
        <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 4 }}>vedie:</span>
        {["Jerry", "Terezka"].map((t) => (
          <button key={t} type="button" onClick={() => setKto(t)}
            style={{ background: kto === t ? mix(C.accent, 16) : "none", border: `1px solid ${kto === t ? C.accent : C.border}`, borderRadius: 7, padding: "4px 11px", color: kto === t ? C.accentLight : C.textMuted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            {t}
          </button>
        ))}
      </div>

      {!odkaz ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => void priprav()} disabled={bezi || (!!datum !== !!cas)} style={tlacidlo(!bezi && !!datum === !!cas)}>
            {bezi ? "Pripravujem…" : "Pripraviť SMS"}
          </button>
          {!cislo && <span style={{ fontSize: 12, color: C.orange }}>Klient nemá v Kokpite telefón — dopíš ho nižšie, alebo odkaz pošli ručne.</span>}
        </div>
      ) : (
        <>
          {/\/u\/([A-Za-z0-9]+)/.test(odkaz) && (
            <a href={`/u/${/\/u\/([A-Za-z0-9]+)/.exec(odkaz)![1]}?nahlad=1`} target="_blank" rel="noreferrer"
              onClick={(e) => otvorNahlad(e, `/u/${/\/u\/([A-Za-z0-9]+)/.exec(odkaz)![1]}?nahlad=1`)}
              style={{ fontSize: 12, color: C.accentLight }}>👁 pozrieť, čo klient uvidí</a>
          )}
          <span style={{ fontSize: 11.5, color: fotky ? C.green : C.textDim }}>
            {fotky
              ? "✓ Stránka ukáže aj fotky pred a po."
              : "Bez fotiek pred a po — pridáš ich v profile klienta → fotky → zaškrtni „Úvodný tréning“. Stránka sa obnoví sama, aj keď SMS už odišla."}
          </span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5, fontFamily: "inherit", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: dlzkaSpravy(text).sprav > 1 ? C.orange : C.textDim }}>
              {dlzkaSpravy(text).znakov} znakov · {dlzkaSpravy(text).sprav} SMS
            </span>
            <button type="button" onClick={() => void posli()} disabled={!cislo || !text.trim() || bezi} style={tlacidlo(!!cislo && !!text.trim() && !bezi)}>
              {bezi ? "Posielam…" : `Poslať na ${cislo || "—"}`}
            </button>
            <button type="button" onClick={() => { void doSchranky(text); }}
              style={{ background: "none", border: "none", color: C.textMuted, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>Kopírovať text</button>
          </div>
        </>
      )}
      {/* Nový človek po úvodnom telefón v Kokpite často nemá (Linda Muth prišla
          bez dopytu) — číslo sa dá dopísať rovno tu, platí pre túto správu. */}
      {cisloVKokpite === false && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: C.textMuted }}>
          Telefón:
          <input value={telefon} onChange={(e) => setTelefon(e.target.value)} inputMode="tel" placeholder="napr. 777 123 456"
            style={{ padding: "5px 9px", borderRadius: 7, border: `1px solid ${telefon.trim() && !cislo ? C.orange : C.border}`, background: C.bg, color: C.text, fontSize: 12, width: 150 }} />
        </label>
      )}
      {chyba && <span style={{ fontSize: 12, color: C.red }}>{chyba}</span>}
    </div>
  );
}
