import { useEffect, useMemo, useState } from "react";

import { fmtCZK } from "../../lib/psb/format";
import { MIMO_PNL, VYPLATY, VYPLATY_DELENE, VYPLATY_JERRY, VYPLATY_TEREZKA, type FioRiadok } from "../../lib/psb/fio";
import { C, mix, S } from "../../lib/psb/theme";
import { PNL, SPOLOCNE, VZAS_MONTHS } from "../../lib/psb/vzas";
import { Card, H3, Info, TableWrap } from "./ui";

// Import bankového výpisu — s náhľadom, nie naslepo.
//
// Formát výpisu sa časom mení a účet nie je čisto firemný: sú na ňom aj
// potraviny, taxíky a výplaty zakladateľov. Keby import zapisoval rovno, P&L by
// sa ticho nafúklo o veci, ktoré doň nepatria. Preto sa najprv ukáže, čo appka
// z výpisu pochopila, ku každému riadku sa dá kategória prepnúť a až potom sa
// zapisuje. Čo Jerry zaradí, to si appka zapamätá ako pravidlo.

type Nahlad = FioRiadok & { uzMame?: boolean; zamknuty?: boolean };

type Kat = { value: string; label: string; skupina: string };

// Položka je „živá", keď v tomto roku niečo mala. Zoznam mal cez päťdesiat
// možností vrátane MultiBoxu a Freela, ktoré sa v 2026 nepoužívajú — a v
// rozbaľovačke, kde človek hľadá jednu vec, je každá mŕtva položka prekážka.
// Staré sa nemažú (historické mesiace ich potrebujú), len padnú do skupiny
// „Staršie", ktorá je na konci.
const ziveOd = VZAS_MONTHS.findIndex((m) => m.startsWith(String(new Date().getFullYear())));
const jeZiva = (values: number[]) =>
  ziveOd < 0 || values.slice(ziveOd).some((v) => v !== 0);

/** Cieľové kategórie: P&L + spoločné výdavky + dva koše mimo neho. */
function kategorie(): Kat[] {
  const zive: Kat[] = [{ value: "", label: "— nezaradené —", skupina: "" }];
  const stare: Kat[] = [];
  for (const [sekKey, sek] of Object.entries(PNL)) {
    for (const [subKey, sub] of Object.entries(sek.subcategories)) {
      for (const [itemKey, item] of Object.entries(sub.items)) {
        const k: Kat = {
          value: `${sekKey}.${subKey}.${itemKey}`,
          label: `${sub.label} · ${item.label}`,
          skupina: sek.label,
        };
        (jeZiva(item.values) ? zive : stare).push(k);
      }
    }
  }
  // Spoločné výdavky domácnosti. Nie sú to náklady firmy — delia sa na polovicu
  // a každému zakladateľovi sa započítajú ako čerpaná výplata. Ahsoka (pes) je
  // presne tento prípad: od júla odchádza z účtu jedným prevodom s poznámkou,
  // takže potrebuje vlastnú kategóriu, nie kôš „súkromné".
  for (const nazov of Object.keys(SPOLOCNE)) {
    zive.push({ value: `spolocne.${nazov}`, label: `Spoločné · ${nazov} (delí sa /2 do výplat)`, skupina: "Spoločné (delí sa /2)" });
  }
  zive.push({ value: VYPLATY_JERRY, label: "Výplata — Jerry", skupina: "Výplaty zakladateľov" });
  zive.push({ value: VYPLATY_TEREZKA, label: "Výplata — Terezka", skupina: "Výplaty zakladateľov" });
  zive.push({ value: VYPLATY_DELENE, label: "Výplata — spoločná (delí sa /2)", skupina: "Výplaty zakladateľov" });
  zive.push({ value: VYPLATY, label: "Výplata — bez určenia", skupina: "Výplaty zakladateľov" });
  zive.push({ value: MIMO_PNL, label: "Mimo P&L — súkromné", skupina: "Mimo P&L" });
  return [...zive, ...stare.map((k) => ({ ...k, skupina: "Staršie (nepoužíva sa v tomto roku)" }))];
}

export function BankovyImport({ vstup, onHotovo }: { vstup: string; onHotovo?: () => void }) {
  const [nahlad, setNahlad] = useState<Nahlad[] | null>(null);
  // Kontrola z hlavičky výpisu (súčty od banky) + koľko riadkov nemá ID operácie.
  const [kontrola, setKontrola] = useState<{ prijmy: number; vydaje: number; obdobie: string; precitanePrijmy: number; precitaneVydaje: number; sedi: boolean | null } | null>(null);
  const [bezId, setBezId] = useState(0);
  // Príjmy a výdavky vedľa seba v jednej tabuľke sa zle prechádzajú — zaraďujú
  // sa hlavne výdavky, príjmy sú len kontrola proti PTminderu.
  const [smer, setSmer] = useState<"vsetko" | "vydaje" | "prijmy">("vydaje");
  const [chyba, setChyba] = useState<{ chyba: string; ukazka: string[] } | null>(null);
  const [vysledok, setVysledok] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const KAT = useMemo(kategorie, []);

  // Náhľad sa načíta hneď, ako príde nový text — komponent sa objaví až vtedy,
  // keď používateľ pustí bankový výpis do uploadu.
  useEffect(() => {
    if (vstup && vstup.trim().length > 20) void nacitajNahlad(vstup);
  }, [vstup]);

  const nacitajNahlad = async (obsah: string) => {
    setBusy(true); setChyba(null); setVysledok(null);
    // Diagnostika, nie „Neznáma chyba".
    //
    // Server vracia dva rôzne tvary: {chyba} keď výpisu nerozumie parser, a
    // {error} keď požiadavku odmietne skôr (neprihlásený, chýbajúca databáza,
    // pokazené telo). Kód čítal len prvý, takže druhý sa zobrazil ako
    // „Neznáma chyba" a nedalo sa z toho zistiť vôbec nič. Teraz sa ukáže aj
    // HTTP stav a odpoveď, ktorá sa nedá prečítať ako JSON.
    let r: { ok?: boolean; chyba?: string; error?: string; ukazka?: string[]; [k: string]: unknown };
    try {
      const res = await fetch("/api/fio", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "nahlad", text: obsah }),
      });
      const surove = await res.text();
      try {
        r = JSON.parse(surove);
      } catch {
        r = { ok: false, chyba: `Server odpovedal ${res.status}, ale nie v JSON: ${surove.slice(0, 160)}` };
      }
      if (!res.ok && !r.chyba && !r.error) r = { ...r, ok: false, chyba: `Server odpovedal ${res.status}.` };
      if (r.error) {
        const preklad: Record<string, string> = {
          unauthorized: "Prihlásenie vypršalo — obnov stránku a prihlás sa znova.",
          no_db: "Databáza je nedostupná.",
          bad_request: "Server nedokázal prečítať odoslaný súbor.",
          unknown_action: "Chyba v komunikácii s appkou (neznáma akcia).",
        };
        r = { ...r, chyba: preklad[String(r.error)] || `Server vrátil chybu „${r.error}" (HTTP ${res.status}).` };
      }
    } catch (e) {
      r = { ok: false, chyba: `Nepodarilo sa spojiť so serverom: ${e instanceof Error ? e.message : String(e)}` };
    }
    setBusy(false);
    if (!r.ok) { setChyba({ chyba: r.chyba || "Neznáma chyba", ukazka: r.ukazka || [] }); setNahlad(null); return; }
    setNahlad(r.riadky as Nahlad[]);
    setKontrola((r.kontrola as typeof kontrola) ?? null);
    setBezId(Number(r.bezId) || 0);
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
      setNahlad(null);
      onHotovo?.();
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
        <H3><Info text="Nič sa nezapíše hneď — najprv uvidíš, čo appka z výpisu pochopila, a kategórie sa dajú prepnúť. Čo zaradíš, to si zapamätá ako pravidlo a nabudúce navrhne sama. Rozumie CSV „Pohyby na všech účtech“ aj textu skopírovanému z internetbankingu." label="Bankový výpis — náhľad pred zápisom" /></H3>
        <div style={{ fontSize: 12.5, color: C.textMuted, margin: "6px 0 0", lineHeight: 1.55 }}>
          Účet nie je čisto firemný — sú na ňom aj potraviny, taxíky a výplaty. Preto má každý riadok kategóriu
          a dva koše mimo P&L: <b>Výplaty zakladateľov</b> a <b>Mimo P&L — súkromné</b>. Čo sa dá, appka zaradí sama;
          zvyšok zaradíš raz a už sa to nebude pýtať.
        </div>
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

      {/* Overenie proti banke. Výpis z účtu nesie v hlavičke vlastné súčty a
          ID operácií — dve veci, ktoré z importu robia kontrolovateľnú operáciu
          namiesto dôvery. Export „Vyhledané pohyby" nemá ani jedno: tri výplaty
          po 1 000 Kč v jeden deň sú v ňom nerozoznateľné a zapísala by sa jedna. */}
      {nahlad && (kontrola || bezId > 0) && (
        <Card>
          {kontrola && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5, color: C.text }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: kontrola.sedi ? C.green : C.red, flexShrink: 0 }} />
              <span>
                {kontrola.sedi
                  ? <>Sedí s výpisom za <b>{kontrola.obdobie}</b> — príjmy {fmtCZK(kontrola.prijmy)}, výdavky {fmtCZK(kontrola.vydaje)}.</>
                  : <>Nesedí s hlavičkou výpisu: banka hlási príjmy {fmtCZK(kontrola.prijmy)} a výdavky {fmtCZK(kontrola.vydaje)}, ja som prečítal {fmtCZK(kontrola.precitanePrijmy)} a {fmtCZK(kontrola.precitaneVydaje)}. Niečo sa nenačítalo — nezapisuj to.</>}
              </span>
            </div>
          )}
          {bezId > 0 && (
            <div style={{ marginTop: kontrola ? 9 : 0, padding: "9px 12px", borderRadius: 8, background: mix(C.orange, 10), border: `1px solid ${mix(C.orange, 28)}`, fontSize: 12, color: C.text, lineHeight: 1.55 }}>
              <b>{bezId} riadkov nemá ID operácie.</b> Bez neho sa dva rovnaké pohyby v ten istý deň (napríklad dve výplaty po 1 000 Kč)
              nedajú rozlíšiť a zapíše sa len jeden. Stiahni radšej export <b>Výpis z účtu</b> — ten ID aj kontrolné súčty má.
            </div>
          )}
        </Card>
      )}

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
          {/* Zaraďujú sa hlavne výdavky; príjmy sú kontrola proti PTminderu.
              V jednej tabuľke sa striedali a prechádzať sa to dalo zle. */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
            {([["vydaje", `Výdavky (${nahlad.filter((r) => r.suma < 0).length})`],
               ["prijmy", `Príjmy (${nahlad.filter((r) => r.suma > 0).length})`],
               ["vsetko", `Všetko (${nahlad.length})`]] as const).map(([id, lbl]) => (
              <button key={id} onClick={() => setSmer(id)}
                style={{ padding: "5px 13px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                  border: `1px solid ${smer === id ? C.accent : C.border}`,
                  background: smer === id ? mix(C.accent, 12) : "transparent",
                  color: smer === id ? C.accentLight : C.textMuted }}>
                {lbl}
              </button>
            ))}
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
                {nahlad.map((r, i) => [r, i] as const)
                  .filter(([r]) => smer === "vsetko" || (smer === "vydaje" ? r.suma < 0 : r.suma > 0))
                  .map(([r, i]) => (
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
                          {/* Zoskupené, nech sa v päťdesiatich možnostiach dá nájsť tá jedna. */}
                          {[...new Set(KAT.map((k) => k.skupina))].map((sk) =>
                            sk === ""
                              ? KAT.filter((k) => k.skupina === "").map((k) => <option key={k.value} value={k.value}>{k.label}</option>)
                              : (
                                <optgroup key={sk} label={sk}>
                                  {KAT.filter((k) => k.skupina === sk).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                                </optgroup>
                              ))}
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

    </>
  );
}
