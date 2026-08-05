import { useEffect, useMemo, useState } from "react";

import { fetchBtcReserve, type BtcVyplata } from "../../lib/psb/client";
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

export type Kat = { value: string; label: string; skupina: string };

// Položka je „živá", keď v tomto roku niečo mala. Zoznam mal cez päťdesiat
// možností vrátane MultiBoxu a Freela, ktoré sa v 2026 nepoužívajú — a v
// rozbaľovačke, kde človek hľadá jednu vec, je každá mŕtva položka prekážka.
// Staré sa nemažú (historické mesiace ich potrebujú), len padnú do skupiny
// „Staršie", ktorá je na konci.
const ziveOd = VZAS_MONTHS.findIndex((m) => m.startsWith(String(new Date().getFullYear())));
const jeZiva = (values: number[]) =>
  ziveOd < 0 || values.slice(ziveOd).some((v) => v !== 0);

/** Cieľové kategórie: P&L + spoločné výdavky + dva koše mimo neho.
 *  Zdieľané s rozpisom faktúr — jeden zoznam, aby sa nerozišli. */
export function kategorieZoznam(): Kat[] {
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
  const [kontrola, setKontrola] = useState<{ prijmy: number; vydaje: number; obdobie: string; vypisov: number; precitanePrijmy: number; precitaneVydaje: number; sedi: boolean | null } | null>(null);
  const [bezId, setBezId] = useState(0);
  // Príjmy a výdavky vedľa seba v jednej tabuľke sa zle prechádzajú — zaraďujú
  // sa hlavne výdavky, príjmy sú len kontrola proti PTminderu.
  const [filter, setFilter] = useState<"vsetko" | "vydaje" | "prijmy" | "vyplaty" | "nezaradene">("vsetko");
  // Výplaty vyplatené v bitcoine. Na bankovom výpise nie sú — odišli z BTC
  // appky — takže bez nich vyzerá mesiac, akoby si nikto nič nevzal. Sú len na
  // pozretie: zapisuje sa výpis, nie cudzia databáza.
  // Označené riadky — pri polročnom výpise je päťsto pohybov a zaraďovať ich
  // po jednom je nepoužiteľné. Kľúčom je index v náhľade.
  const [oznacene, setOznacene] = useState<Set<number>>(new Set());
  const [btcVyplaty, setBtcVyplaty] = useState<BtcVyplata[] | null>(null);
  useEffect(() => {
    if (!nahlad || btcVyplaty) return;
    void fetchBtcReserve(false, true).then((r) => setBtcVyplaty(r?.vyplaty || []));
  }, [nahlad, btcVyplaty]);
  // Len mesiace, ktoré sú v tomto výpise — inak by sa ukázal celý rok.
  const btcVMesiaci = (btcVyplaty || []).filter(
    (v) => !!nahlad?.some((r) => r.datum.slice(0, 7) === v.datum.slice(0, 7)),
  );
  const [chyba, setChyba] = useState<{ chyba: string; ukazka: string[] } | null>(null);
  const [vysledok, setVysledok] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const KAT = useMemo(kategorieZoznam, []);

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

  // Hotovosť. Jarkov dlh sa spláca prevažne v hotovosti a taká platba na výpise
  // nikdy nebude — ale v P&L patrí. Bez tohto by sa mesiac zaraďoval z banky a
  // potom by sa musel ručne dorovnávať v Exceli, čiže presne to, čo appka mala
  // zrušiť. Riadok dostane vlastné ID, aby sa dal rozpoznať a nezdvojil sa.
  const prepni = (i: number) =>
    setOznacene((p) => {
      const n = new Set(p);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  /** Označí všetky riadky s tou istou protistranou — dvanásť platieb
   *  Anthropicu za pol roka sa tak zaradí jedným klikom. */
  const oznacRovnake = (protistrana: string) => {
    const kluc = protistrana.trim().toLowerCase();
    if (!kluc) return;
    setOznacene((p) => {
      const n = new Set(p);
      nahlad?.forEach((r, i) => {
        if (r.protistrana.trim().toLowerCase() === kluc) n.add(i);
      });
      return n;
    });
  };
  const zaradOznacene = (kategoria: string) => {
    setNahlad((n) => n && n.map((r, i) => (oznacene.has(i) ? { ...r, kategoria } : r)));
    setOznacene(new Set());
  };

  // Riadky, ktoré sú práve zobrazené — používa ich tabuľka aj zaškrtnutie
  // v hlavičke, aby „označiť všetky" znamenalo naozaj to, čo je vidieť.
  const viditelne = (nahlad || []).map((r, i) => [r, i] as const).filter(([r]) =>
    filter === "vsetko" ? true
    // Výplata je zvláštna kategória, nie prevádzkový výdavok — keby bola
    // v oboch, súčet výdavkov by tvrdil, že štúdio minulo aj to, čo si
    // vzali tréneri.
    : filter === "vydaje" ? r.suma < 0 && !r.kategoria.startsWith("vyplaty")
    : filter === "prijmy" ? r.suma > 0
    : filter === "vyplaty" ? r.kategoria.startsWith("vyplaty")
    : r.suma < 0 && !r.kategoria);

  const pridajRucne = () => {
    const dnes = new Date().toISOString().slice(0, 10);
    setNahlad((n) => [
      { id: `rucne:${dnes}:${Math.random().toString(36).slice(2, 9)}`, datum: dnes, suma: 0,
        protistrana: "", poznamka: "hotovosť — dopísané ručne", typ: "Hotovosť", kategoria: "" },
      ...(n || []),
    ]);
  };

  const zapis = async () => {
    if (!nahlad) return;
    setBusy(true);
    // Rozrobený ručný riadok (bez sumy) sa nezapisuje — inak by v databáze
    // pristála nula, ktorá sa tvári ako pohyb.
    const naZapis = nahlad.filter((r) => !r.uzMame && !r.zamknuty && r.suma !== 0);
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
    const nove = nahlad.filter((r) => !r.uzMame && !r.zamknuty && r.suma !== 0);
    // Výdavky = prevádzka. Výplaty sa z nich vyčleňujú: majú vlastnú kategóriu
    // a keby sa počítali aj sem, súčet by tvrdil, že štúdio minulo aj to, čo si
    // vzali tréneri.
    const vyd = nove.filter((r) => r.suma < 0 && !r.kategoria.startsWith("vyplaty"));
    const vypl = nove.filter((r) => r.kategoria.startsWith("vyplaty"));
    return {
      spolu: nahlad.length,
      nove: nove.length,
      uzMame: nahlad.filter((r) => r.uzMame).length,
      zamknute: nahlad.filter((r) => r.zamknuty).length,
      vydavky: vyd.reduce((a, r) => a + r.suma, 0),
      vyplaty: vypl.reduce((a, r) => a + r.suma, 0),
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
                  ? <>Sedí {kontrola.vypisov > 1 ? <>so všetkými <b>{kontrola.vypisov}</b> výpismi</> : "s výpisom"} za <b>{kontrola.obdobie}</b> — príjmy {fmtCZK(kontrola.prijmy)}, výdavky {fmtCZK(kontrola.vydaje)}.</>
                  : <>Nesedí s hlavičkou {kontrola.vypisov > 1 ? `${kontrola.vypisov} výpisov` : "výpisu"}: banka hlási príjmy {fmtCZK(kontrola.prijmy)} a výdavky {fmtCZK(kontrola.vydaje)}, ja som prečítal {fmtCZK(kontrola.precitanePrijmy)} a {fmtCZK(kontrola.precitaneVydaje)}. Niečo sa nenačítalo — nezapisuj to.</>}
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
          {/* Súhrn JE filter. Boli tu obe veci vedľa seba — čísla nad tabuľkou a
              zvlášť tlačidlá na filtrovanie — a hovorili to isté dvakrát.
              Klik na číslo ukáže práve tie riadky; druhý klik filter zruší. */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {([
              ["vsetko", `Všetko (${nahlad.length})`, C.textMuted],
              ["vydaje", `Výdavky ${fmtCZK(Math.abs(suhrn.vydavky))} (${nahlad.filter((r) => r.suma < 0 && !r.kategoria.startsWith("vyplaty")).length})`, C.orange],
              ["prijmy", `Príjmy ${fmtCZK(suhrn.prijmy)} (${nahlad.filter((r) => r.suma > 0).length})`, C.green],
              ["vyplaty", `Výplaty ${fmtCZK(Math.abs(suhrn.vyplaty))} (${nahlad.filter((r) => r.kategoria.startsWith("vyplaty")).length})`, C.blue],
              ["nezaradene", `Nezaradené (${suhrn.nezaradene})`, suhrn.nezaradene ? C.orange : C.textDim],
            ] as const).map(([id, lbl, farba]) => (
              <button key={id} onClick={() => setFilter((f) => (f === id ? "vsetko" : id))}
                style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                  border: `1px solid ${filter === id ? farba : C.border}`,
                  background: filter === id ? mix(farba, 14) : "transparent",
                  color: filter === id ? farba : C.textMuted }}>
                {lbl}
              </button>
            ))}
          </div>
          {oznacene.size > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10, padding: "9px 12px", borderRadius: 9, background: mix(C.accent, 10), border: `1px solid ${mix(C.accent, 32)}` }}>
              <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>Označených {oznacene.size}</span>
              <span style={{ fontSize: 12, color: C.textMuted }}>→ zaradiť naraz:</span>
              <select value="" onChange={(e) => e.target.value && zaradOznacene(e.target.value)}
                style={{ background: C.bg, color: C.text, border: `1px solid ${mix(C.accent, 45)}`, borderRadius: 7, fontSize: 12, padding: "5px 7px", maxWidth: 280, cursor: "pointer" }}>
                <option value="">— vyber kategóriu —</option>
                {[...new Set(KAT.map((k) => k.skupina))].filter(Boolean).map((sk) => (
                  <optgroup key={sk} label={sk}>
                    {KAT.filter((k) => k.skupina === sk).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <button onClick={() => setOznacene(new Set())}
                style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>zrušiť výber</button>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 8, lineHeight: 1.5 }}>
            Klik na meno protistrany označí všetky jej pohyby naraz — dvanásť platieb Anthropicu za pol roka zaradíš jedným výberom.
          </div>
          <div style={{ marginBottom: 8 }}>
            <button onClick={pridajRucne}
              style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px dashed ${mix(C.accent, 45)}`, background: "transparent", color: C.accentLight }}>
              + hotovostná platba
            </button>
            <span style={{ fontSize: 11.5, color: C.textDim, marginLeft: 8 }}>
              Čo sa platilo v hotovosti, na výpise nie je — napríklad splátka Jarkovi.
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10, lineHeight: 1.6 }}>
            {suhrn.uzMame > 0 && <>{suhrn.uzMame} už v databáze · </>}
            {suhrn.zamknute > 0 && <><b style={{ color: C.red }}>{suhrn.zamknute} v uzavretom mesiaci</b> · </>}
            Príjmy sa zapisujú tiež, ale slúžia len na kontrolu proti PTminderu — tržby sa z banky nikdy nepočítajú.
          </div>
          {filter === "vyplaty" && btcVMesiaci.length > 0 && (
            <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 9, background: mix(C.orange, 8), border: `1px solid ${mix(C.orange, 26)}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                Výplaty v bitcoine za toto obdobie ({btcVMesiaci.length}) — na výpise z banky nie sú
              </div>
              {btcVMesiaci.map((v, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12, padding: "3px 0", borderBottom: i < btcVMesiaci.length - 1 ? `1px solid ${mix(C.border, 40)}` : "none" }}>
                  <span style={{ color: C.textDim, minWidth: 74, fontVariantNumeric: "tabular-nums" }}>{v.datum}</span>
                  <span style={{ color: C.text, minWidth: 62 }}>{v.kto === "jerry" ? "Jerry" : v.kto === "terezka" ? "Terezka" : "—"}</span>
                  <span style={{ color: C.orange, fontVariantNumeric: "tabular-nums", minWidth: 74, textAlign: "right" }}>{v.czk != null ? fmtCZK(v.czk) : "—"}</span>
                  <span style={{ color: C.textDim, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.poznamka}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 7, lineHeight: 1.5 }}>
                Spolu <b style={{ color: C.orange }}>{fmtCZK(btcVMesiaci.reduce((a, v) => a + (v.czk || 0), 0))}</b> ·
                z appky PSB Bitcoin, len na pozretie. Do VZAS ich zapíšeš v Mzdy → kategória „BTC“.
              </div>
            </div>
          )}
          <TableWrap>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                  <th style={{ ...S.th, width: 28 }}>
                    <input
                      type="checkbox"
                      title="Označiť všetky riadky, ktoré sú práve zobrazené"
                      checked={viditelne.length > 0 && viditelne.every(([, i]) => oznacene.has(i))}
                      onChange={(e) => setOznacene((p) => {
                        const n = new Set(p);
                        viditelne.forEach(([, i]) => (e.target.checked ? n.add(i) : n.delete(i)));
                        return n;
                      })}
                      style={{ accentColor: C.accent, cursor: "pointer" }}
                    />
                  </th>
                  {["Dátum", "Suma", "Protistrana / popis", "Kategória"].map((h) => (
                    <th key={h} style={{ ...S.th, textAlign: h === "Suma" ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {viditelne.map(([r, i]) => (
                  <tr key={i} style={{ opacity: r.uzMame || r.zamknuty ? 0.45 : 1, background: oznacene.has(i) ? mix(C.accent, 7) : undefined }}>
                    <td style={{ ...S.td, textAlign: "center", padding: "3px 4px" }}>
                      <input type="checkbox" checked={oznacene.has(i)} onChange={() => prepni(i)}
                        style={{ accentColor: C.accent, cursor: "pointer" }} />
                    </td>
                    <td style={{ ...S.td, whiteSpace: "nowrap", fontSize: 12 }}>
                      {r.id.startsWith("rucne:") ? (
                        <input type="date" value={r.datum}
                          onChange={(e) => setNahlad((n) => n && n.map((x, j) => (j === i ? { ...x, datum: e.target.value } : x)))}
                          style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, fontSize: 11.5, padding: "2px 4px", colorScheme: "dark" }} />
                      ) : r.datum}
                    </td>
                    <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap", color: r.suma < 0 ? C.text : C.green, fontVariantNumeric: "tabular-nums" }}>
                      {r.id.startsWith("rucne:") ? (
                        <input type="number" value={r.suma || ""} placeholder="-1000"
                          onChange={(e) => setNahlad((n) => n && n.map((x, j) => (j === i ? { ...x, suma: Number(e.target.value) || 0 } : x)))}
                          style={{ width: 92, textAlign: "right", background: C.bg, border: `1px solid ${r.suma ? C.border : mix(C.orange, 40)}`, borderRadius: 5, color: C.text, fontSize: 11.5, padding: "2px 5px" }} />
                      ) : fmtCZK(r.suma)}
                    </td>
                    <td style={{ ...S.td, fontSize: 12 }}>
                      {r.id.startsWith("rucne:") ? (
                        <input value={r.protistrana} placeholder="Komu / za čo (napr. Jarek splátka)"
                          onChange={(e) => setNahlad((n) => n && n.map((x, j) => (j === i ? { ...x, protistrana: e.target.value } : x)))}
                          style={{ width: "100%", maxWidth: 300, background: C.bg, border: `1px solid ${r.protistrana ? C.border : mix(C.orange, 40)}`, borderRadius: 5, color: C.text, fontSize: 11.5, padding: "3px 6px" }} />
                      ) : (
                        <div
                          onClick={() => oznacRovnake(r.protistrana)}
                          title={r.protistrana ? `Označiť všetky pohyby „${r.protistrana}"` : undefined}
                          style={{ color: C.text, cursor: r.protistrana ? "pointer" : "default" }}
                        >
                          {r.protistrana || "—"}
                        </div>
                      )}
                      {r.poznamka && r.poznamka !== r.protistrana && (
                        <div style={{ color: C.textDim, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }}>{r.poznamka}</div>
                      )}
                      {r.uzMame && <span style={{ fontSize: 10, color: C.textDim }}>už v databáze</span>}
                      {r.zamknuty && <span style={{ fontSize: 10, color: C.red }}> · uzavretý mesiac</span>}
                    </td>
                    <td style={S.td}>
                      {r.suma < 0 || r.id.startsWith("rucne:") ? (
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
