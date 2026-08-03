import { useMemo, useRef, useState } from "react";

import { fmtCZK } from "../../lib/psb/format";
import { MIMO_PNL, VYPLATY, type FioRiadok } from "../../lib/psb/fio";
import { C, mix, S } from "../../lib/psb/theme";
import { PNL } from "../../lib/psb/vzas";
import { Card, Empty, H3, Info, TableWrap } from "./ui";

// Import bankového výpisu — s náhľadom, nie naslepo.
//
// Formát výpisu sa časom mení a účet nie je čisto firemný: sú na ňom aj
// potraviny, taxíky a výplaty zakladateľov. Keby import zapisoval rovno, P&L by
// sa ticho nafúklo o veci, ktoré doň nepatria. Preto sa najprv ukáže, čo appka
// z výpisu pochopila, ku každému riadku sa dá kategória prepnúť a až potom sa
// zapisuje. Čo Jerry zaradí, to si appka zapamätá ako pravidlo.

type Nahlad = FioRiadok & { uzMame?: boolean; zamknuty?: boolean };

/** Všetky cieľové kategórie: položky P&L + dva koše mimo neho. */
function kategorie(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [{ value: "", label: "— nezaradené —" }];
  for (const [sekKey, sek] of Object.entries(PNL)) {
    for (const [subKey, sub] of Object.entries(sek.subcategories)) {
      for (const [itemKey, item] of Object.entries(sub.items)) {
        out.push({ value: `${sekKey}.${subKey}.${itemKey}`, label: `${sub.label} · ${item.label}` });
      }
    }
  }
  out.push({ value: VYPLATY, label: "Výplaty zakladateľov (nie je náklad P&L)" });
  out.push({ value: MIMO_PNL, label: "Mimo P&L — súkromné" });
  return out;
}

export function Banka() {
  const [text, setText] = useState("");
  const [nahlad, setNahlad] = useState<Nahlad[] | null>(null);
  const [chyba, setChyba] = useState<{ chyba: string; ukazka: string[] } | null>(null);
  const [vysledok, setVysledok] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const KAT = useMemo(kategorie, []);

  const nacitajNahlad = async (obsah: string) => {
    setBusy(true); setChyba(null); setVysledok(null);
    const r = await fetch("/api/fio", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "nahlad", text: obsah }),
    }).then((x) => x.json()).catch(() => ({ ok: false, chyba: "Nepodarilo sa spojiť so serverom." }));
    setBusy(false);
    if (!r.ok) { setChyba({ chyba: r.chyba || "Neznáma chyba", ukazka: r.ukazka || [] }); setNahlad(null); return; }
    setNahlad(r.riadky as Nahlad[]);
  };

  const zapis = async () => {
    if (!nahlad) return;
    setBusy(true);
    const naZapis = nahlad.filter((r) => !r.uzMame && !r.zamknuty);
    const r = await fetch("/api/fio", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "zapis", riadky: naZapis }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) {
      setVysledok(`Zapísané: ${r.pridane} pohybov${r.preskocene ? `, ${r.preskocene} už v databáze bolo` : ""}${r.zamknute ? `, ${r.zamknute} odmietnutých (uzavretý mesiac)` : ""}. Naučených pravidiel: ${r.pravidla}.`);
      setNahlad(null); setText("");
    } else setVysledok("Zápis sa nepodaril.");
  };

  const suhrn = useMemo(() => {
    if (!nahlad) return null;
    const nove = nahlad.filter((r) => !r.uzMame && !r.zamknuty);
    const vyd = nove.filter((r) => r.suma < 0);
    return {
      spolu: nahlad.length,
      nove: nove.length,
      uzMame: nahlad.filter((r) => r.uzMame).length,
      zamknute: nahlad.filter((r) => r.zamknuty).length,
      vydavky: vyd.reduce((a, r) => a + r.suma, 0),
      prijmy: nove.filter((r) => r.suma > 0).reduce((a, r) => a + r.suma, 0),
      nezaradene: vyd.filter((r) => !r.kategoria).length,
    };
  }, [nahlad]);

  return (
    <>
      <Card>
        <H3><Info text="Prijme oba tvary výpisu z Fio: CSV „Pohyby na všech účtech“ aj text skopírovaný z internetbankingu (funguje aj text z PDF). Nič sa nezapíše hneď — najprv uvidíš, čo appka pochopila, a kategórie sa dajú prepnúť. Čo zaradíš, to si zapamätá ako pravidlo a nabudúce navrhne sama." label="Import z banky" /></H3>
        <div style={{ fontSize: 12.5, color: C.textMuted, margin: "6px 0 12px", lineHeight: 1.55 }}>
          Účet nie je čisto firemný — sú na ňom aj potraviny, taxíky a výplaty. Preto má každý riadok kategóriu
          a dva koše mimo P&L: <b>Výplaty zakladateľov</b> a <b>Mimo P&L — súkromné</b>. Čo sa dá, appka zaradí sama;
          zvyšok zaradíš raz a už sa to nebude pýtať.
        </div>
        <input
          ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) { const t = await f.text(); setText(t); void nacitajNahlad(t); }
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 10), color: C.accentLight, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Vybrať súbor (CSV alebo text)
          </button>
          <button onClick={() => void nacitajNahlad(text)} disabled={busy || text.trim().length < 20}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12.5, cursor: "pointer" }}>
            Načítať z vloženého textu
          </button>
        </div>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder="…alebo sem vlož skopírované pohyby z internetbankingu"
          style={{ ...S.input, minHeight: 90, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}
        />
        {busy && <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 8 }}>Spracúvam…</div>}
        {vysledok && <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, background: mix(C.green, 12), color: C.text, fontSize: 12.5 }}>{vysledok}</div>}
        {chyba && (
          <div style={{ marginTop: 10, padding: "10px 13px", borderRadius: 8, background: mix(C.orange, 12), border: `1px solid ${mix(C.orange, 30)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
            <b>Výpisu nerozumiem.</b> {chyba.chyba}
            {chyba.ukazka.length > 0 && (
              <div style={{ marginTop: 8, fontFamily: "ui-monospace, monospace", fontSize: 11, color: C.textDim, whiteSpace: "pre-wrap" }}>
                {chyba.ukazka.slice(0, 4).join("\n")}
              </div>
            )}
          </div>
        )}
      </Card>

      {nahlad && suhrn && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <H3><Info text="Toto sa zapíše. Riadky, ktoré v databáze už sú, aj riadky z uzavretých mesiacov sú vylúčené — zapisuje sa len to, čo je naozaj nové." label={`Náhľad — ${suhrn.nove} nových pohybov`} /></H3>
            <button onClick={() => void zapis()} disabled={busy || suhrn.nove === 0}
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: suhrn.nove ? C.accent : C.border, color: C.onAccent, fontSize: 12.5, fontWeight: 600, cursor: suhrn.nove ? "pointer" : "default" }}>
              Zapísať {suhrn.nove} pohybov
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
            Výdavky <b style={{ color: C.orange }}>{fmtCZK(Math.abs(suhrn.vydavky))}</b> ·
            príjmy <b style={{ color: C.green }}>{fmtCZK(suhrn.prijmy)}</b>
            {suhrn.uzMame > 0 && <> · {suhrn.uzMame} už v databáze</>}
            {suhrn.zamknute > 0 && <> · <b style={{ color: C.red }}>{suhrn.zamknute} v uzavretom mesiaci</b></>}
            {suhrn.nezaradene > 0 && <> · <b style={{ color: C.orange }}>{suhrn.nezaradene} nezaradených</b></>}
            <br />
            <span style={{ color: C.textDim }}>
              Príjmy sa zapisujú tiež, ale slúžia len na kontrolu proti PTminderu — tržby sa z banky nikdy nepočítajú.
            </span>
          </div>
          <TableWrap>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                  {["Dátum", "Suma", "Protistrana / popis", "Kategória"].map((h) => (
                    <th key={h} style={{ ...S.th, textAlign: h === "Suma" ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nahlad.map((r, i) => (
                  <tr key={i} style={{ opacity: r.uzMame || r.zamknuty ? 0.45 : 1 }}>
                    <td style={{ ...S.td, whiteSpace: "nowrap", fontSize: 12 }}>{r.datum}</td>
                    <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap", color: r.suma < 0 ? C.text : C.green, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(r.suma)}</td>
                    <td style={{ ...S.td, fontSize: 12 }}>
                      <div style={{ color: C.text }}>{r.protistrana || "—"}</div>
                      {r.poznamka && r.poznamka !== r.protistrana && (
                        <div style={{ color: C.textDim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }}>{r.poznamka}</div>
                      )}
                      {r.uzMame && <span style={{ fontSize: 10, color: C.textDim }}>už v databáze</span>}
                      {r.zamknuty && <span style={{ fontSize: 10, color: C.red }}> · uzavretý mesiac</span>}
                    </td>
                    <td style={S.td}>
                      {r.suma < 0 ? (
                        <select
                          value={r.kategoria}
                          onChange={(e) => setNahlad((n) => n && n.map((x, j) => (j === i ? { ...x, kategoria: e.target.value } : x)))}
                          style={{ background: r.kategoria ? C.cardHover : mix(C.orange, 12), color: C.text, border: `1px solid ${r.kategoria ? C.border : mix(C.orange, 40)}`, borderRadius: 6, fontSize: 11.5, padding: "3px 5px", maxWidth: 260, cursor: "pointer" }}
                        >
                          {KAT.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: 11.5, color: C.textDim }}>príjem — len kontrola</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}

      {!nahlad && !busy && (
        <Card>
          <Empty>Vyber výpis alebo vlož text a uvidíš náhľad. Nič sa nezapíše, kým to nepotvrdíš.</Empty>
        </Card>
      )}
    </>
  );
}
