import { useEffect, useState, type ChangeEvent } from "react";

import { saveAnomaly } from "../../lib/psb/client";
import { doSchranky } from "../../lib/psb/kopirovanie";
import { otvorNahlad } from "../../lib/psb/nahladOkno";
import { oznam } from "../../lib/psb/obnovaSignal";
import { bezDiakritiky, cisloPreBranu, dlzkaSpravy } from "../../lib/psb/sms";
import { C, mix } from "../../lib/psb/theme";
import { dnesPraha } from "../../lib/psb/cas";
import { denZKluca, PLATNO, polovice, vyrezCover } from "../../lib/psb/porovnaniePredPo";

/** Jedna strana porovnania: náhľad v okne a súbor, z ktorého sa skladá. */
type Fotka = { nahlad: string; subor: Blob };
type FotkaKartoteky = { id: string; den: string; pohlad: string };

/**
 * Poskladá fotku před (vľavo) a po (vpravo) do jedného porovnania.
 * `imageOrientation: "from-image"` — fotka z iPadu na výšku by inak prišla
 * naležato (rovnaké pravidlo ako v kartotéke).
 */
async function poskladaj(pred: Blob, po: Blob): Promise<Blob> {
  const platno = document.createElement("canvas");
  platno.width = PLATNO.sirka;
  platno.height = PLATNO.vyska;
  const g = platno.getContext("2d");
  if (!g) throw new Error("Prehliadač nevie kresliť do plátna.");
  g.fillStyle = "#FFFFFF";
  g.fillRect(0, 0, PLATNO.sirka, PLATNO.vyska);
  const casti = polovice();
  const obrazky = await Promise.all([pred, po].map((b) => createImageBitmap(b, { imageOrientation: "from-image" })));
  obrazky.forEach((o, i) => {
    const c = casti[i];
    const v = vyrezCover(o.width, o.height, c.s, c.v);
    g.drawImage(o, v.sx, v.sy, v.sw, v.sh, c.x, c.y, c.s, c.v);
    // Štítok vľavo dole: PŘED / PO — klient vie, ktorá je ktorá, aj bez textu pod fotkou.
    const text = i === 0 ? "PŘED" : "PO";
    g.font = "700 46px Arial, Helvetica, sans-serif";
    const w = g.measureText(text).width + 52;
    g.fillStyle = "rgba(26,46,36,0.86)";
    g.beginPath();
    g.roundRect(c.x + 28, c.v - 28 - 76, w, 76, 38);
    g.fill();
    g.fillStyle = "#FFFFFF";
    g.fillText(text, c.x + 28 + 26, c.v - 28 - 22);
    o.close();
  });
  return await new Promise<Blob>((ok, chyba) =>
    platno.toBlob((b) => (b ? ok(b) : chyba(new Error("Porovnanie sa nepodarilo uložiť."))), "image/jpeg", 0.88));
}

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
  /** Fotky pred a po — nepovinné (Jerry, 28. 10. 2026). */
  const [pred, setPred] = useState<Fotka | null>(null);
  const [po, setPo] = useState<Fotka | null>(null);
  const [fotkyOtvorene, setFotkyOtvorene] = useState(false);
  const [kartoteka, setKartoteka] = useState<FotkaKartoteky[]>([]);
  /** Súhlas s fotkami z anamnézy; bez neho ho musí tréner potvrdiť (server inak fotku neuloží). */
  const [suhlasAnamnezy, setSuhlasAnamnezy] = useState<boolean | null>(null);
  const [suhlasOsobne, setSuhlasOsobne] = useState(false);
  const [sFotkami, setSFotkami] = useState(false);
  const denUvodneho = denZKluca(klucNotifikacie) || dnesPraha();

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

  // Kartotéka a súhlas sa načítajú až pri otvorení fotiek — bez nich ich netreba.
  useEffect(() => {
    if (!fotkyOtvorene) return;
    let zrusene = false;
    void fetch(`/api/fotky?klient=${encodeURIComponent(meno)}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { fotky?: FotkaKartoteky[]; suhlas?: boolean }) => {
        if (zrusene) return;
        setSuhlasAnamnezy(!!j.suhlas);
        // Len fotky tela z posledných troch dní — tie z úvodného, nie celá história.
        const od = new Date(Date.parse(`${denUvodneho}T12:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10);
        setKartoteka((j.fotky || []).filter((f) => f.den >= od && f.pohlad !== "porovnanie" && f.pohlad !== "video").slice(0, 8));
      })
      .catch(() => { if (!zrusene) setSuhlasAnamnezy(false); });
    return () => { zrusene = true; };
  }, [fotkyOtvorene, meno, denUvodneho]);

  // Náhľady (object URL) sa po sebe upracú, inak by visel každý zvolený súbor v pamäti.
  useEffect(() => () => { if (pred) URL.revokeObjectURL(pred.nahlad); }, [pred]);
  useEffect(() => () => { if (po) URL.revokeObjectURL(po.nahlad); }, [po]);

  const zoSuboru = (nastav: (f: Fotka) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) { setChyba("Toto nie je fotka."); return; }
    nastav({ nahlad: URL.createObjectURL(f), subor: f });
  };
  const zKartoteky = async (id: string, nastav: (f: Fotka) => void) => {
    const r = await fetch(`/api/fotky?id=${encodeURIComponent(id)}`, { credentials: "same-origin" }).catch(() => null);
    if (!r?.ok) { setChyba("Fotku z kartotéky sa nepodarilo načítať."); return; }
    const b = await r.blob();
    nastav({ nahlad: URL.createObjectURL(b), subor: b });
  };

  /** Poskladá, uloží do kartotéky a vráti id porovnania; pri chybe `null` a hlášku. */
  const ulozPorovnanie = async (): Promise<string | null> => {
    if (!pred || !po) return null;
    const subor = await poskladaj(pred.subor, po.subor);
    const f = new FormData();
    f.set("klient", meno);
    f.set("den", denUvodneho);
    f.set("pohlad", "porovnanie");
    f.set("subor", subor, "pred-a-po.jpg");
    f.set("popis", "Úvodní lekce — před a po");
    f.set("sirka", String(PLATNO.sirka));
    f.set("vyska", String(PLATNO.vyska));
    if (suhlasOsobne) f.set("suhlasOsobne", "1");
    type Odpoved = { ok?: boolean; id?: string; error?: string };
    const r: Odpoved = await fetch("/api/fotky", { method: "POST", credentials: "same-origin", body: f })
      .then((x) => x.json() as Promise<Odpoved>)
      .catch(() => ({ ok: false, error: "Fotky sa nepodarilo nahrať — skús znova." }));
    if (!r.ok || !r.id) { setChyba(r.error || "Fotky sa nepodarilo uložiť."); return null; }
    oznam("fotky");
    return r.id;
  };

  const cislo = cisloPreBranu(telefon);
  const vstup = { padding: "5px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, colorScheme: "dark" as const };
  const tlacidlo = (aktivne: boolean) => ({
    padding: "5px 13px", borderRadius: 7, border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 12), color: C.green,
    fontSize: 12, fontWeight: 600, cursor: aktivne ? "pointer" : "default", opacity: aktivne ? 1 : 0.45, fontFamily: "inherit",
  });

  const priprav = async () => {
    if (bezi) return;
    if (!!pred !== !!po) { setChyba("Vyber obe fotky — před aj po — alebo žiadnu."); return; }
    if (pred && po && !suhlasAnamnezy && !suhlasOsobne) { setChyba("Klient nemá v anamnéze súhlas s fotkami. Potvrď, že súhlasil osobne."); return; }
    setBezi(true);
    setChyba("");
    try {
      let fotky: string[] | undefined;
      if (pred && po) {
        const id = await ulozPorovnanie();
        if (!id) return;
        fotky = [id];
      }
      const r = await fetch("/api/uvodny", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "odkaz", klient: meno, druh: "po", trener: kto, kedy: datum && cas ? `${datum}T${cas}` : null, cena: null, ...(fotky ? { fotky } : {}) }),
      }).then((x) => x.json() as Promise<{ ok?: boolean; odkaz?: string; error?: string }>);
      if (!r.ok || !r.odkaz) { setChyba(r.error || "Odkaz sa nepodarilo vyrobiť."); return; }
      setOdkaz(r.odkaz);
      setSFotkami(!!fotky);
      // Bez diakritiky: s mäkčeňmi má SMS 70 znakov namiesto 160.
      const co = [datum && cas ? "termin dalsiho treninku" : "", fotky ? "fotky pred a po" : "", "souhrn"].filter(Boolean).join(", ");
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
      const poznamka = `SMS po úvodnom odoslaná${datum && cas ? ` · ďalší tréning ${datum} ${cas}` : ""}${sFotkami ? " · s fotkami pred a po" : ""}`;
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

      {!odkaz && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" onClick={() => setFotkyOtvorene((x) => !x)}
            style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.accentLight, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
            {fotkyOtvorene ? "▾" : "▸"} Pridať fotky pred a po {pred && po ? "· vybrané obe" : "(nepovinné)"}
          </button>
          {fotkyOtvorene && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: mix(C.accent, 5) }}>
              <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5 }}>
                Fotka z diagnostiky a fotka po narovnaní. Poskladajú sa vedľa seba, uložia sa do kartotéky klienta (šifrovane) a klient ich uvidí za odkazom v SMS.
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {([["Před (diagnostika)", pred, setPred], ["Po (po narovnaní)", po, setPo]] as const).map(([nadpis, f, nastav]) => (
                  <div key={nadpis} style={{ display: "flex", flexDirection: "column", gap: 6, width: 150 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{nadpis}</span>
                    {f ? (
                      <div style={{ position: "relative" }}>
                        <img src={f.nahlad} alt={nadpis} style={{ width: 150, height: 200, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, display: "block" }} />
                        <button type="button" onClick={() => nastav(null)} aria-label={`Odstrániť ${nadpis}`}
                          style={{ position: "absolute", top: 5, right: 5, width: 24, height: 24, borderRadius: 12, border: "none", background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
                      </div>
                    ) : (
                      <label style={{ width: 150, height: 200, boxSizing: "border-box", borderRadius: 8, border: `1px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 10, fontSize: 12, color: C.accentLight, cursor: "pointer" }}>
                        📷 Odfotiť alebo vybrať
                        <input type="file" accept="image/*" onChange={zoSuboru((x) => nastav(x))} style={{ display: "none" }} />
                      </label>
                    )}
                    {!f && kartoteka.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {kartoteka.map((k) => (
                          <button key={k.id} type="button" onClick={() => void zKartoteky(k.id, (x) => nastav(x))} title={`z kartotéky · ${k.den}`}
                            style={{ padding: 0, border: `1px solid ${C.border}`, borderRadius: 5, background: "none", cursor: "pointer", lineHeight: 0 }}>
                            <img src={`/api/fotky?id=${encodeURIComponent(k.id)}`} alt="" style={{ width: 34, height: 45, objectFit: "cover", borderRadius: 4 }} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {kartoteka.length > 0 && <span style={{ fontSize: 11, color: C.textDim }}>Malé fotky pod políčkom sú z kartotéky klienta z posledných dní — klik ich použije.</span>}
              {suhlasAnamnezy === false && (
                <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12, color: C.text }}>
                  <input type="checkbox" checked={suhlasOsobne} onChange={(e) => setSuhlasOsobne(e.target.checked)} />
                  Klient súhlasil s fotkami osobne (v anamnéze súhlas nemá)
                </label>
              )}
            </div>
          )}
        </div>
      )}

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
