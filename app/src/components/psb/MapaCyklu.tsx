import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { kotvaDat } from "../../lib/psb/compute";
import {
  FAZY, mriezka, nazovFazy, osMapy, poctyFaz, podielFaz, POMER_IDEAL,
  popisMesiaca, tempoFaz, zadanieProProject,
  type Bunka, type SlotPlanu, type ZverejnenyKus,
} from "../../lib/psb/mapaCyklu";
import { C, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { AssistantChat } from "./Assistant";
import { Card, Donut, H3, Info, Modal, Select } from "./ui";
import { ZaberUkazka } from "./ZaberUkazka";
import { ZABER_MAPA, ZABERY, zaberyPreFazu } from "../../lib/psb/zabery";
import { CLAUDE_PROJECT } from "./Zadanie";

/**
 * Mapa nákupného cyklu — čo už vyšlo a čo sa chystá, v čase a vo fázach.
 *
 * PREČO TO NIE JE ĎALŠÍ GRAF
 *
 * Zvyšok „Reels & posty" hodnotí minulosť. Táto karta má budúce stĺpce a dá
 * sa do nich písať — to je celý jej zmysel. Bez nich by to bola prehliadka
 * histórie a plán by naďalej žil v hlave.
 *
 * ČO MAPA UKÁZALA, KEĎ VZNIKLA (23. 8. 2026)
 *
 * Rozloženie 116 príspevkov medzi fázy je 22/18/17/22/19 % — žiadna fáza nie
 * je vyhladovaná, hoci obsah podľa fáz nikto neplánoval. Preto karta NEHLÁSI
 * „chýba ti fáza X" ako poplach: to by bol falošný nález. Ukazuje tempo za
 * pol roka a nechá Jerryho rozhodnúť, čo je diera a čo zámer.
 *
 * PREČO SA DÁ ZARADENIE PREPÍSAŤ
 *
 * Prvých 116 zaradení spravil model z textu háku. Je to odhad. Číslo, ktoré
 * nikto nemôže opraviť, sa v tejto appke nesmie stať základom rozhodnutia.
 */

type IgRiadok = {
  id: string; datum: string; mesiac: string; hook: string; typ?: string;
  kategoria: string; dosah: number; ulozenia: number; faza: number; permalink?: string;
};

/** Bublina pri prejdení bodky. Bez nej je bodka anonymná — a mriežka plná
 *  anonymných bodiek sa nedá čítať, len obdivovať. */
type Bublina = { x: number; y: number; kus: IgRiadok };

const DRUH: Record<string, string> = {
  VIDEO: "reel", CAROUSEL_ALBUM: "karusel", IMAGE: "obrázok",
};

type NapadRiadok = {
  id: string; text: string; stav: string; zdroj: string;
  faza?: number; planovane_na?: string; kto?: string; koncept?: string; hotovy_text?: string; zaber?: string;
};

type Vyber =
  | { druh: "vyslo"; kus: IgRiadok }
  | { druh: "slot"; slot: SlotPlanu }
  | { druh: "novy"; mesiac: string; faza: number }
  | null;

const dnesMesiac = () => new Date().toISOString().slice(0, 7);

const nadpisOkna = (v: NonNullable<Vyber>) =>
  v.druh === "vyslo" ? "Zverejnený príspevok"
    : v.druh === "slot" ? `Plán ${v.slot.mesiac} · ${nazovFazy(v.slot.faza)}`
      : `Naplánovať na ${v.mesiac}`;

export function MapaCyklu({ data, chat, onNavigate }: {
  data: PSBData;
  chat?: AssistantChat;
  onNavigate?: (tab: string, sub?: string) => void;
}) {
  const [ig, setIg] = useState<IgRiadok[]>([]);
  const [napady, setNapady] = useState<NapadRiadok[]>([]);
  const [vyber, setVyber] = useState<Vyber>(null);
  const [chyba, setChyba] = useState("");
  const [bublina, setBublina] = useState<Bublina | null>(null);
  // Text na skopírovanie do Projectu. Druhé okno, nie odkaz rovno von —
  // Project nevidí do Kokpitu, takže bez zadania by dostal holú vetu.
  const [naKopirovanie, setNaKopirovanie] = useState<string | null>(null);

  const nacitaj = useCallback(() => {
    void fetch("/api/meta?co=instagram", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { prispevky?: IgRiadok[] }) => setIg(j.prispevky || []))
      .catch(() => {});
    void fetch("/api/napady", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { napady?: NapadRiadok[] }) => setNapady(j.napady || []))
      .catch(() => {});
  }, []);

  useEffect(nacitaj, [nacitaj]);

  // Kotva je posledný mesiac s dátami — to isté pravidlo ako pri grafoch.
  // Plánovacia časť ide za dnešok, nie za kotvu: plánuje sa do kalendára.
  const kotva = useMemo(() => kotvaDat(data), [data]);
  const dnes = dnesMesiac();
  const os = useMemo(() => {
    const zaklad = osMapy(dnes, 12, 4);
    return zaklad.length ? zaklad : osMapy(kotva.mesiac || dnes, 12, 4);
  }, [dnes, kotva.mesiac]);

  const vyslo = useMemo<ZverejnenyKus[]>(() => ig
    .filter((p) => p.faza > 0 && p.datum)
    .map((p) => ({
      datum: p.datum.slice(0, 10),
      mesiac: (p.mesiac || p.datum).slice(0, 7),
      faza: p.faza, hook: p.hook || "", dosah: p.dosah || 0, ulozenia: p.ulozenia || 0,
    })), [ig]);

  const plan = useMemo<SlotPlanu[]>(() => napady
    .filter((n) => n.stav !== "zamietnuty" && (n.faza || 0) > 0 && (n.planovane_na || "").length === 7)
    .map((n) => ({
      id: n.id, faza: n.faza || 0, mesiac: n.planovane_na || "",
      koncept: n.koncept || "", kto: n.kto || "", text: n.text || "",
      hotovyText: n.hotovy_text || "", zaber: n.zaber || "",
      zdroj: n.zdroj || "", stav: n.stav || "novy",
    })), [napady]);

  const bunky = useMemo(() => mriezka(os, vyslo, plan), [os, vyslo, plan]);
  const tempo = useMemo(() => tempoFaz(os, vyslo, kotva.plny || dnes, 6), [os, vyslo, kotva.plny, dnes]);

  // Tri koláče: čo vyšlo, čo je naplánované, a čo by podľa nás malo byť.
  // Prvé dva sú meranie, tretí je názor — preto má vlastné vysvetlenie.
  const podielMinulost = useMemo(() => podielFaz(poctyFaz(vyslo)), [vyslo]);
  const podielBuducnost = useMemo(() => podielFaz(poctyFaz(plan)), [plan]);

  // Nezaradené sa nezamlčiavajú: bez tejto vety by mapa vyzerala, že pokrýva
  // všetko, čo kedy vyšlo.
  const nezaradenych = ig.filter((p) => !p.faza && p.datum).length;
  const vZasobniku = napady.filter((n) => n.stav === "novy" && !(n.planovane_na || "")).length;

  const uloz = async (body: Record<string, unknown>) => {
    setChyba("");
    try {
      const r = await fetch("/api/napady", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!j.ok) { setChyba(j.error || "Uložiť sa nepodarilo."); return false; }
      nacitaj();
      return true;
    } catch {
      setChyba("Uložiť sa nepodarilo — spojenie zlyhalo.");
      return false;
    }
  };

  const ulozFazuPrispevku = async (id: string, faza: number) => {
    setChyba("");
    try {
      const r = await fetch("/api/meta", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "faza-prispevku", id, faza }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!j.ok) { setChyba(j.error || "Uložiť sa nepodarilo."); return; }
      nacitaj();
      setVyber(null);
    } catch { setChyba("Uložiť sa nepodarilo — spojenie zlyhalo."); }
  };

  const posliJarvisovi = (mesiac: string, faza: number) => {
    if (!chat) return;
    const f = FAZY.find((x) => x.id === faza);
    if (!f) return;
    const uzJe = (bunky.get(`${mesiac}|${faza}`)?.plan || []).map((s) => s.koncept || s.text).filter(Boolean);
    chat.newChat("marketing");
    if (onNavigate) { chat.zachovajOkno(); onNavigate("jarvis"); }
    else chat.setFloatingOpen(true);
    void chat.ask([
      `Navrhni mi obsah na ${mesiac} do fázy nákupného cyklu "${f.nazov}".`,
      "",
      `Kto to číta: ${f.kto}`,
      `Čo má ten obsah urobiť: ${f.uloha}`,
      `Za posledných 6 mesiacov vyšlo do tejto fázy ${tempo.get(faza) ?? 0} príspevkov.`,
      uzJe.length ? `Na ten mesiac už v tejto fáze mám: ${uzJe.join(" · ")}. Nenavrhuj to isté.` : "",
      "",
      "Daj mi TRI návrhy. Pri každom napíš na samostatné riadky:",
      "NÁZOV (jedna veta, o čom to je) · KTO V TOM VYSTUPUJE (klient, Jerry, Terezka — ak klient, tak ktorý a prečo práve on) ·",
      "NÁVRH ÚVODNEJ VETY · ČÍSLO ALEBO POZOROVANIE Z DÁT, NA KTOROM TO STOJÍ.",
      "",
      "Vychádzaj z dát Kokpitu, nie z hlavy: pozri sa do mkt_napady na stav 'novy'",
      "(otázky klientov sú najcennejšie — je to jazyk, ktorým ľudia o probléme naozaj hovoria),",
      "do ig_prispevky na to, čo v tejto fáze fungovalo, a do dôvodov odchodov klientov.",
      "Keď na niečo nemáš podklad v dátach, povedz to namiesto vymýšľania.",
    ].filter(Boolean).join("\n"), `Obsah na ${mesiac}: ${f.nazov}`, []);
  };

  const sirkaStlpca = 62;

  return (
    <Card>
      <H3>
        Mapa nákupného cyklu
        <Info text={
          "Päť fáz je päť stavov uvedomenia (Eugene Schwartz) — ten istý rámec, aký má Jarvis v knižnici. " +
          "Fáza nehovorí, AKO je príspevok urobený (to je kategória), ale KOMU je určený. " +
          "Vľavo od dnešnej čiary je, čo vyšlo; vpravo sa plánuje — klikni do bunky a zapíš, o čom to bude a kto v tom vystupuje. " +
          "Zaradenie prvých 116 príspevkov spravil 23. 8. 2026 model z textu háku. Je to odhad a dá sa prepísať kliknutím na bodku."
        } />
      </H3>

      <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
        Naľavo od zvislej čiary je, čo už vyšlo. Napravo sa plánuje.
        {nezaradenych > 0 && ` Starších ${nezaradenych} príspevkov nie je zaradených — spätné dopočítanie by vyrobilo presnosť, ktorá tam nie je.`}
        {vZasobniku > 0 && ` V zásobníku čaká ${vZasobniku} nápadov bez termínu.`}
      </div>

      {chyba && (
        <div style={{ background: C.redBg, color: C.red, padding: "8px 10px", borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>
          {chyba}
        </div>
      )}

      <Kolace
        minulost={podielMinulost}
        buducnost={podielBuducnost}
        vysloKusov={vyslo.length}
        planKusov={plan.length}
      />

      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        {/* `separate` je nutnosť, nie vkus: pri `collapse` prehliadače
              nectia z-index buniek a bodky sa kreslia NAD lepkavý stĺpec.
              Presne to Jerry 23. 8. 2026 videl. */}
        <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: C.surface, zIndex: 3, minWidth: 190, width: 190 }} />
              {os.map((m) => {
                const { mesiac, rok } = popisMesiaca(m);
                const buduci = m > dnes;
                return (
                  <th key={m} style={{
                    minWidth: sirkaStlpca, width: sirkaStlpca, padding: "6px 0 8px",
                    fontSize: 11, fontWeight: 400, color: m === dnes ? C.text : C.textDim,
                    borderLeft: m === dnes ? `1px solid ${mix(C.accent, 0.5)}` : "none",
                    textAlign: "center", verticalAlign: "bottom",
                  }}>
                    <div style={{ opacity: buduci ? 0.75 : 1 }}>{mesiac}</div>
                    <div style={{ fontSize: 9.5, color: C.textDim, minHeight: 12 }}>{rok}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {FAZY.map((f) => (
              <tr key={f.id}>
                <th style={{
                  // C.surface, nie C.card: v sklenených paletách je --c-card
                  // rgba(255,255,255,0.06), takže lepkavý stĺpec nezakryl nič
                  // a text sa prekrýval s bodkami pod ním.
                  position: "sticky", left: 0, background: C.surface, zIndex: 2,
                  textAlign: "left", fontWeight: 400, padding: "10px 14px 10px 8px",
                  borderTop: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
                  verticalAlign: "top", minWidth: 190, width: 190,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.farba, flex: "0 0 auto" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{f.nazov}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 3, lineHeight: 1.4 }}>{f.kto}</div>
                  <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 4 }}>
                    za pol roka {tempo.get(f.id) ?? 0}×
                  </div>
                </th>
                {os.map((m) => {
                  const b = bunky.get(`${m}|${f.id}`) as Bunka;
                  const buduci = m >= dnes;
                  return (
                    <td key={m} style={{
                      borderTop: `1px solid ${C.border}`,
                      borderLeft: m === dnes ? `1px solid ${mix(C.accent, 0.5)}` : `1px solid ${mix(C.border, 0.45)}`,
                      padding: 3, verticalAlign: "middle", textAlign: "center",
                      background: buduci ? mix(C.accent, 0.035) : "transparent",
                    }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center", alignItems: "center", minHeight: 26 }}>
                        {b.vyslo.map((p) => {
                          const cely = ig.find((x) => x.datum.slice(0, 10) === p.datum && (x.hook || "") === p.hook);
                          const ukaz = (e: { currentTarget: HTMLElement }) => {
                            if (!cely) return;
                            const r = e.currentTarget.getBoundingClientRect();
                            setBublina({ x: r.left + r.width / 2, y: r.top, kus: cely });
                          };
                          return (
                            <button key={p.datum + p.hook.slice(0, 12)}
                              onClick={() => { if (cely) { setBublina(null); setVyber({ druh: "vyslo", kus: cely }); } }}
                              onMouseEnter={ukaz} onFocus={ukaz}
                              onMouseLeave={() => setBublina(null)} onBlur={() => setBublina(null)}
                              aria-label={p.hook.slice(0, 70) || p.datum}
                              style={{
                                width: 10, height: 10, borderRadius: "50%", border: 0, padding: 0,
                                background: f.farba, opacity: 0.85, cursor: "pointer",
                              }} />
                          );
                        })}
                        {b.plan.map((s) => {
                          // Tri stavy, lebo plán má tri štádiá: naplánované →
                          // premyslené → napísané. Bez toho sa z mriežky nedá
                          // prečítať, čo je hotové na publikovanie.
                          const hotove = !!s.hotovyText.trim();
                          return (
                            <button key={s.id} onClick={() => setVyber({ druh: "slot", slot: s })}
                              title={(hotove ? "hotový text · " : "") + (s.koncept || s.text || "bez konceptu")}
                              style={{
                                width: 11, height: 11, borderRadius: 3, padding: 0, cursor: "pointer",
                                background: hotove ? f.farba : s.koncept ? mix(f.farba, 0.55) : "transparent",
                                border: hotove ? `1.5px solid ${f.farba}` : `1.5px dashed ${f.farba}`,
                              }} />
                          );
                        })}
                        {buduci && (
                          <button onClick={() => setVyber({ druh: "novy", mesiac: m, faza: f.id })}
                            title={`Naplánovať do ${m}`}
                            style={{
                              width: 14, height: 14, lineHeight: "12px", borderRadius: 3, padding: 0,
                              background: "none", border: `1px solid ${mix(C.border, 0.8)}`,
                              color: C.textDim, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                            }}>+</button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: C.textDim, marginTop: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 9, height: 9, borderRadius: "50%", background: C.textMuted, display: "inline-block" }} /> vyšlo
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 11, height: 11, borderRadius: 3, border: `1.5px dashed ${C.textMuted}`, display: "inline-block" }} /> naplánované, bez konceptu
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 11, height: 11, borderRadius: 3, background: mix(C.textMuted, 0.55), border: `1.5px dashed ${C.textMuted}`, display: "inline-block" }} /> s konceptom
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 11, height: 11, borderRadius: 3, background: C.textMuted, border: `1.5px solid ${C.textMuted}`, display: "inline-block" }} /> text hotový
        </span>
      </div>

      {/* ZOZNAM POD MRIEŽKOU — mriežka odpovedá na „kde sú diery", zoznam na
          „čo mám vlastne rozpracované". Bodka v bunke sa nedá čítať za sebou;
          plán sa prechádza po poriadku, nie po súradniciach. */}
      {plan.length > 0 && (
        <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>
            Plán po poradí ({plan.length})
          </div>
          <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 10 }}>
            Klikni na riadok a otvorí sa ten istý editor ako z mriežky.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {[...plan]
              .sort((a, b) => a.mesiac.localeCompare(b.mesiac) || a.faza - b.faza)
              .map((sl) => {
                const fd = FAZY.find((x) => x.id === sl.faza);
                // Slot naplánovaný mimo osi mapy sa MUSÍ ohlásiť. Ticho by
                // vyzeralo ako úplnosť a Jerry by o ňom nevedel.
                const mimoMapy = !os.includes(sl.mesiac);
                return (
                  <button key={sl.id} onClick={() => setVyber({ druh: "slot", slot: sl })}
                    style={{
                      display: "flex", gap: 10, alignItems: "baseline", textAlign: "left",
                      background: "none", border: 0, borderRadius: 6, padding: "8px 8px 8px 0",
                      cursor: "pointer", fontFamily: "inherit", width: "100%",
                    }}>
                    <span style={{
                      fontSize: 11, color: C.textMuted, flex: "0 0 auto", width: 56,
                      fontVariantNumeric: "tabular-nums",
                    }}>{sl.mesiac}</span>
                    <span style={{ flex: "0 0 auto", width: 8, height: 8, borderRadius: "50%", background: fd?.farba, marginTop: 4 }} />
                    <span style={{ flex: "0 0 auto", width: 118, fontSize: 11, color: C.textMuted }}>{fd?.nazov}</span>
                    <span style={{ flex: "1 1 auto", fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>
                      {sl.koncept || sl.text || <i style={{ color: C.textDim }}>bez konceptu</i>}
                      {sl.kto && <span style={{ color: C.textDim }}> · {sl.kto}</span>}
                      {sl.zdroj === "jarvis" && <span style={{ color: C.textDim }}> · od Jarvisa</span>}
                      {sl.hotovyText.trim() && <span style={{ color: fd?.farba }}> · text hotový</span>}
                      {mimoMapy && <span style={{ color: C.red }}> · mimo zobrazenej osi</span>}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Editor je MODÁLNE OKNO, nie panel pod mriežkou. Kým bol dole, Jerry
          si po kliknutí na „+" nevšimol, že sa niečo otvorilo — pozeral sa
          na tabuľku a zmena bola mimo zorného poľa (23. 8. 2026). */}
      {vyber && (
        <Modal
          title={nadpisOkna(vyber)}
          sirka={520}
          onClose={() => { setVyber(null); setChyba(""); }}
        >
          {chyba && (
            <div style={{ background: C.redBg, color: C.red, padding: "8px 10px", borderRadius: 6, fontSize: 12.5, marginBottom: 12 }}>
              {chyba}
            </div>
          )}
          <Panel
            vyber={vyber}
            os={os.filter((m) => m >= dnes)}
            onZavri={() => { setVyber(null); setChyba(""); }}
            onUloz={uloz}
            onFazaPrispevku={ulozFazuPrispevku}
            onJarvis={chat ? posliJarvisovi : undefined}
            onDoProjectu={(text) => setNaKopirovanie(text)}
          />
        </Modal>
      )}

      {naKopirovanie !== null && (
        <Modal title="Text pre Claude Project" sirka={560} onClose={() => setNaKopirovanie(null)}>
          <OknoKopirovania text={naKopirovanie} onZavri={() => setNaKopirovanie(null)} />
        </Modal>
      )}

      {/* Bublina ide PORTÁLOM do body: karta má backdrop-filter, a ten robí
          z predka obalový blok pre position:fixed — bublina by sa inak
          umiestňovala voči karte, nie voči obrazovke. Tá istá pasca, akú
          rieši Modal a vysvetlivky. */}
      {bublina && typeof document !== "undefined" && createPortal(
        <div style={{
          position: "fixed", left: bublina.x, top: bublina.y - 12,
          transform: "translate(-50%, -100%)", zIndex: 9000, pointerEvents: "none",
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "10px 12px", maxWidth: 320, boxShadow: "0 10px 30px rgba(0,0,0,.35)",
        }}>
          <div style={{ fontSize: 10.5, color: C.textDim, marginBottom: 5, letterSpacing: 0.3 }}>
            {bublina.kus.datum.slice(0, 10)}
            {" · "}{DRUH[bublina.kus.typ || ""] || "príspevok"}
            {bublina.kus.kategoria ? ` · ${bublina.kus.kategoria}` : ""}
          </div>
          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>
            {(bublina.kus.hook || "—").slice(0, 180)}
          </div>
          <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 6 }}>
            dosah {bublina.kus.dosah} · {bublina.kus.ulozenia} uložení · {nazovFazy(bublina.kus.faza)}
          </div>
        </div>, document.body)}
    </Card>
  );
}

/**
 * Editor vybranej bunky. Je to panel pod mriežkou, nie modálne okno —
 * pri plánovaní treba vidieť zvyšok mesiaca, inak sa píše naslepo.
 */
function Panel({ vyber, os, onZavri, onUloz, onFazaPrispevku, onJarvis, onDoProjectu }: {
  vyber: NonNullable<Vyber>;
  /** Mesiace, do ktorých sa dá plánovať — pre presun slotu inam. */
  os: string[];
  onZavri: () => void;
  onUloz: (b: Record<string, unknown>) => Promise<boolean>;
  onFazaPrispevku: (id: string, faza: number) => void;
  onJarvis?: (mesiac: string, faza: number) => void;
  /** Otvorí okno s hotovým zadaním na skopírovanie do Projectu. */
  onDoProjectu: (text: string) => void;
}) {
  const slot = vyber.druh === "slot" ? vyber.slot : null;
  const [koncept, setKoncept] = useState(slot?.koncept || "");
  const [kto, setKto] = useState(slot?.kto || "");
  const [hotovyText, setHotovyText] = useState(slot?.hotovyText || "");
  const [zaber, setZaber] = useState(slot?.zaber || "");
  const [busy, setBusy] = useState(false);
  // Mazanie na dva kliky. Modálne potvrdenie v modáli je okno v okne;
  // prepnutý nápis je rovnako neprehliadnuteľný a o krok kratší.
  const [mazem, setMazem] = useState(false);

  const povodnyMesiac = vyber.druh === "slot" ? vyber.slot.mesiac : vyber.druh === "novy" ? vyber.mesiac : "";
  const povodnaFaza = vyber.druh === "slot" ? vyber.slot.faza : vyber.druh === "novy" ? vyber.faza : vyber.kus.faza;
  // Mesiac a fáza sa dajú prepísať — slot sa tým presunie do inej bunky.
  // Bez toho by zle zaradený nápad musel ísť preč a založiť sa znova.
  const [mesiac, setMesiac] = useState(povodnyMesiac);
  const [faza, setFaza] = useState(povodnaFaza);

  const vstup = {
    width: "100%", background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 13,
    border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box" as const,
  };
  const tlacidlo = (hlavne: boolean) => ({
    background: hlavne ? C.accent : "none", color: hlavne ? "#fff" : C.textMuted,
    border: hlavne ? "none" : `1px solid ${C.border}`, borderRadius: 6,
    padding: "7px 14px", fontSize: 12.5, fontFamily: "inherit", cursor: busy ? "default" : "pointer",
  });

  // ── Zverejnený príspevok: čítanie a oprava zaradenia ──────────────────────
  if (vyber.druh === "vyslo") {
    const k = vyber.kus;
    return (
      <div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>
          {k.datum.slice(0, 10)} · {DRUH[k.typ || ""] || "príspevok"} · dosah {k.dosah} · {k.ulozenia} uložení · {k.kategoria || "bez kategórie"}
        </div>
        <div style={{ fontSize: 13.5, color: C.text, marginBottom: 10, lineHeight: 1.5 }}>{k.hook || "—"}</div>
        {k.permalink && (
          <div style={{ marginBottom: 12 }}>
            <a href={k.permalink} target="_blank" rel="noreferrer"
              style={{ fontSize: 11.5, color: C.accentLight }}>otvoriť na Instagrame ↗</a>
          </div>
        )}
        <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 6 }}>
          Zaradené ako <b style={{ color: C.text }}>{nazovFazy(faza)}</b> — model to odhadol z háku. Oprav, ak sedí inak:
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {FAZY.map((f) => (
            <button key={f.id} onClick={() => onFazaPrispevku(k.id, f.id)}
              style={{
                background: f.id === faza ? mix(f.farba, 0.35) : "none",
                border: `1px solid ${f.id === faza ? f.farba : C.border}`,
                color: f.id === faza ? C.text : C.textMuted,
                borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer",
              }}>{f.nazov}</button>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <button onClick={onZavri} style={tlacidlo(false)}>zavrieť</button>
        </div>
      </div>
    );
  }

  // ── Slot v pláne: nový alebo existujúci ───────────────────────────────────
  const f = FAZY.find((x) => x.id === faza);
  const zapis = async () => {
    if (!koncept.trim() && !kto.trim() && !hotovyText.trim()) return;
    setBusy(true);
    const ok = slot
      ? await onUloz({ id: slot.id, koncept, kto, faza, planovaneNa: mesiac, hotovyText, zaber })
      : await onUloz({
          // Text nápadu je prvá veta konceptu — zásobník aj plán sú tá istá
          // tabuľka a nápad bez textu by v zozname nápadov svietil prázdny.
          text: koncept.trim().slice(0, 300) || `Obsah na ${mesiac}`,
          zdroj: "vlastny", faza, planovaneNa: mesiac, kto, koncept, hotovyText, zaber,
        });
    setBusy(false);
    if (ok) onZavri();
  };

  return (
    <div>
      <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 12, lineHeight: 1.45 }}>
        <b style={{ color: C.textMuted }}>{f?.kto}</b><br />{f?.uloha}
      </div>

      {/* Presun do inej bunky. Zle zaradený nápad by sa inak musel zmazať
          a založiť odznova — a s ním by zmizol aj text, ktorý už bol hotový. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11.5, color: C.textMuted, display: "flex", flexDirection: "column", gap: 4 }}>
          Mesiac
          {/* Vlastný mesiac slotu je v ponuke vždy — aj keď je v minulosti.
              Inak by select stál na hodnote, ktorú nemá, a uloženie by slot
              ticho presunulo inam. */}
          <Select value={mesiac} onChange={setMesiac}
            options={[...new Set([...(povodnyMesiac ? [povodnyMesiac] : []), ...os])]
              .sort()
              .map((m) => ({ value: m, label: m }))} />
        </label>
        <label style={{ fontSize: 11.5, color: C.textMuted, display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
          Fáza
          <Select value={String(faza)} onChange={(v) => setFaza(Number(v))}
            options={FAZY.map((x) => ({ value: String(x.id), label: x.nazov }))} />
        </label>
      </div>

      <label style={{ display: "block", fontSize: 11.5, color: C.textMuted, marginBottom: 4 }}>
        O čom to bude — návrh captionu alebo popis
      </label>
      <textarea value={koncept} onChange={(e) => setKoncept(e.target.value)} rows={3}
        placeholder="napr. Petra prišla s bolesťou do kolena a odišla s vysvetlením, prečo to začalo v členku"
        style={{ ...vstup, resize: "vertical", lineHeight: 1.5 }} />

      <label style={{ display: "block", fontSize: 11.5, color: C.textMuted, margin: "10px 0 4px" }}>
        Kto v tom vystupuje
      </label>
      <input value={kto} onChange={(e) => setKto(e.target.value)}
        placeholder="klient / Jerry / Terezka" style={vstup} />

      {/* Doladenie textu patrí do Projectu — ten má kánon značky, tón hlasu
          aj FP pravidlá. Kokpit drží ZÁMER, Project z neho robí vety. */}
      {/* ÚVODNÝ ZÁBER. Hák doteraz znamenal len prvú VETU — v reeli však
          rozhoduje prvá sekunda OBRAZU a text sa číta až druhý. Ponuka je
          filtrovaná na fázu: statický záber vo fáze 1 nikoho nezastaví
          a švih vo fáze 5 pôsobí ako reklama. */}
      <ZaberVyber faza={faza} hodnota={zaber} onZmena={setZaber} />

      {/* Hotový text až POD prekliokom do Projectu — v tomto poradí sa to aj
          robí: zámer → Project → vety späť sem. Bez tohto poľa končili vety
          v okne prehliadača a v pláne po nich nezostala stopa. */}
      <label style={{ display: "block", fontSize: 11.5, color: C.textMuted, margin: "14px 0 4px" }}>
        Hotový text {hotovyText.trim() ? `(${hotovyText.trim().length} znakov)` : "— vlož, čo vrátil Project"}
      </label>
      <textarea value={hotovyText} onChange={(e) => setHotovyText(e.target.value)} rows={hotovyText ? 8 : 3}
        placeholder="sem vlož hotový príspevok, keď ho Project napíše"
        style={{ ...vstup, resize: "vertical", lineHeight: 1.5, fontSize: 12.5 }} />

      <div style={{ marginTop: 10, fontSize: 11.5, color: C.textDim, lineHeight: 1.45 }}>
        <button
          onClick={() => onDoProjectu(zadanieProProject({ mesiac, faza, koncept, kto, hotovyText, zaber }))}
          style={{ background: "none", border: 0, padding: 0, color: C.accentLight, fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
          doladiť text v Claude Projecte ↗
        </button>
        {hotovyText.trim() ? " — zadanie ponesie aj terajšiu verziu na úpravu." : " — otvorí sa zadanie na skopírovanie."}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={zapis} disabled={busy || (!koncept.trim() && !kto.trim() && !hotovyText.trim())}
          style={{ ...tlacidlo(true), opacity: busy || (!koncept.trim() && !kto.trim() && !hotovyText.trim()) ? 0.5 : 1 }}>
          {slot ? "uložiť" : "naplánovať"}
        </button>
        {/* Do zásobníka, nie do koša. Nápad, ktorý ešte nechceš vyhodiť, ale
            už nepatrí do konkrétneho mesiaca, inak nemal kam ísť — zostane
            v Nápadoch bez termínu. */}
        {slot && (
          <button
            onClick={async () => { setBusy(true); const ok = await onUloz({ id: slot.id, planovaneNa: "" }); setBusy(false); if (ok) onZavri(); }}
            disabled={busy} style={tlacidlo(false)}>
            do zásobníka
          </button>
        )}
        {slot && (
          <button
            onClick={async () => {
              if (!mazem) { setMazem(true); return; }
              setBusy(true);
              const ok = await onUloz({ id: slot.id, zmaz: true });
              setBusy(false);
              if (ok) onZavri(); else setMazem(false);
            }}
            disabled={busy}
            style={{ ...tlacidlo(false), color: mazem ? C.red : C.textMuted, borderColor: mazem ? C.red : C.border }}>
            {mazem ? "naozaj vymazať?" : "vymazať"}
          </button>
        )}
        {onJarvis && mesiac && (
          <button onClick={() => onJarvis(mesiac, faza)} disabled={busy}
            style={{ ...tlacidlo(false), color: C.accentLight, borderColor: mix(C.accent, 0.6) }}>
            nech navrhne Jarvis
          </button>
        )}
        {/* Modál sa inak zatvára len klikom mimo panela a to nie je vidieť —
            Jerryho pôvodná výhrada bola presne o tom, že si zmenu nevšimne. */}
        <button onClick={onZavri} disabled={busy} style={{ ...tlacidlo(false), marginLeft: "auto" }}>
          zrušiť
        </button>
      </div>
      {slot?.text && slot.text !== koncept && (
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 10 }}>
          Pôvodný nápad: {slot.text}
        </div>
      )}
    </div>
  );
}

/**
 * Medzikrok medzi Kokpitom a Claude Projectom.
 *
 * PREČO OKNO A NIE ROVNO ODKAZ
 *
 * Project nevidí do Kokpitu — nevie, komu je obsah určený ani čo má urobiť.
 * Keby odkaz viedol rovno von, Jerry by tam prilepil holú vetu a Project by
 * napísal text pre niekoho iného. Toto okno mu dá zadanie do schránky skôr,
 * než odíde.
 */
function OknoKopirovania({ text, onZavri }: { text: string; onZavri: () => void }) {
  const [stav, setStav] = useState<"" | "ok" | "chyba">("");
  const pole = useRef<HTMLTextAreaElement>(null);

  const kopiruj = async () => {
    // Dve cesty, lebo tá moderná sa dá zakázať. `navigator.clipboard` chce
    // povolenie clipboard-write a v prehliadači bez neho spadne aj pri
    // skutočnom kliku (overené 23. 8. 2026). Výber textu + execCommand je
    // zastaraný, ale povolenie nepotrebuje — a keď zlyhá aj on, používateľovi
    // zostane označený text a stačí mu cmd+C.
    try {
      await navigator.clipboard.writeText(text);
      setStav("ok");
      return;
    } catch { /* skúsi sa druhá cesta */ }
    try {
      const el = pole.current;
      if (!el) throw new Error("bez poľa");
      el.focus();
      el.select();
      if (!document.execCommand("copy")) throw new Error("odmietnuté");
      setStav("ok");
    } catch {
      pole.current?.select();
      setStav("chyba");
    }
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10, lineHeight: 1.5 }}>
        Skopíruj a otvor Project — tam text vlož a dolaď. Project do Kokpitu nevidí,
        takže čo tu nie je, to nemá.
      </div>
      <textarea
        ref={pole}
        readOnly
        value={text}
        rows={12}
        onFocus={(e) => e.currentTarget.select()}
        style={{
          width: "100%", background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5,
          border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 12px",
          boxSizing: "border-box", resize: "vertical", lineHeight: 1.55,
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={kopiruj}
          style={{
            background: C.accent, color: "#fff", border: "none", borderRadius: 6,
            padding: "7px 14px", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
          }}>
          {stav === "ok" ? "skopírované ✓" : "skopírovať"}
        </button>
        <a href={CLAUDE_PROJECT} target="_blank" rel="noreferrer"
          style={{
            border: `1px solid ${mix(C.accent, 0.6)}`, borderRadius: 6, padding: "7px 14px",
            fontSize: 12.5, color: C.accentLight, textDecoration: "none",
          }}>
          otvoriť Claude Project ↗
        </a>
        <button onClick={onZavri}
          style={{
            background: "none", color: C.textMuted, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "7px 14px", fontSize: 12.5, fontFamily: "inherit",
            cursor: "pointer", marginLeft: "auto",
          }}>
          zavrieť
        </button>
      </div>
      {stav === "chyba" && (
        <div style={{ fontSize: 11.5, color: C.red, marginTop: 8 }}>
          Schránka sa nedala použiť. Text je označený — stlač cmd+C.
        </div>
      )}
    </div>
  );
}

/**
 * Tri koláče nad mriežkou: skutočnosť, plán a odporúčanie.
 *
 * PREČO TRI A NIE JEDEN S PREPÍNAČOM
 *
 * Otázka, na ktorú odpovedajú, je porovnávacia — „ide plán tam, kam chcem?".
 * Prepínač by z porovnania urobil pamäťové cvičenie: človek by si musel držať
 * v hlave, čo videl pred kliknutím.
 *
 * PROSTREDNÝ KOLÁČ BÝVA PRÁZDNY A JE TO V PORIADKU
 *
 * Plán sa napĺňa postupne. Prázdny koláč preto nehlási chybu — povie, koľko
 * slotov zatiaľ je, aby bolo jasné, že pomer z troch kusov nič neznamená.
 */
/** 1 slot · 2 sloty · 5 slotov — inak na obrazovke svieti „1 sloty". */
const mnozne = (n: number, jeden: string, malo: string, vela: string) =>
  `${n} ${n === 1 ? jeden : n >= 2 && n <= 4 ? malo : vela}`;

function Kolace({ minulost, buducnost, vysloKusov, planKusov }: {
  minulost: Record<number, number>;
  buducnost: Record<number, number>;
  vysloKusov: number;
  planKusov: number;
}) {
  const data = (podiely: Record<number, number>) =>
    FAZY.map((f) => ({ label: f.nazov, value: podiely[f.id] || 0, color: f.farba }));

  const kolac = (nadpis: string, spodok: string, podiely: Record<number, number>, prazdny: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 132 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{nadpis}</div>
      {prazdny ? (
        <div style={{
          width: 104, height: 104, borderRadius: "50%", border: `2px dashed ${mix(C.border, 0.9)}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: C.textDim, textAlign: "center", padding: 12, boxSizing: "border-box",
        }}>
          zatiaľ nič naplánované
        </div>
      ) : (
        <Donut data={data(podiely)} size={104} thickness={20} bezLegendy />
      )}
      <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", lineHeight: 1.35 }}>{spodok}</div>
    </div>
  );

  // Pod tri kusy je pomer náhoda, nie smer. Radšej to povedať, než kresliť
  // koláč, ktorý vyzerá ako záver.
  const planMaloKusov = planKusov > 0 && planKusov < 4;

  return (
    <div style={{
      display: "flex", gap: 26, flexWrap: "wrap", alignItems: "flex-start",
      marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${C.border}`,
    }}>
      {kolac("Čo vyšlo", mnozne(vysloKusov, "príspevok", "príspevky", "príspevkov"), minulost, vysloKusov === 0)}
      {kolac(
        "Čo je v pláne",
        planKusov === 0 ? "žiadny slot" : planMaloKusov
          ? `${mnozne(planKusov, "slot", "sloty", "slotov")} — na pomer primálo`
          : mnozne(planKusov, "slot", "sloty", "slotov"),
        buducnost,
        planKusov === 0,
      )}
      {kolac("Kam mieriť", "odporúčanie, nie meranie", POMER_IDEAL, false)}

      <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingTop: 2, minWidth: 190 }}>
        {FAZY.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: C.textMuted }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: f.farba, flex: "0 0 auto" }} />
            <span style={{ flex: "1 1 auto" }}>{f.nazov}</span>
            <span style={{ color: C.textDim, fontVariantNumeric: "tabular-nums" }}>
              {minulost[f.id]} · {planKusov ? buducnost[f.id] : "–"} · <b style={{ color: C.textMuted }}>{POMER_IDEAL[f.id]}</b> %
            </span>
          </div>
        ))}
        <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 3, lineHeight: 1.4 }}>
          vyšlo · v pláne · odporúčané
          <Info text={
            "Prvé dva koláče sú meranie, tretí je NÁZOR a má sa dať poraziť. Stojí na štyroch veciach: " +
            "pyramída kupujúcich (väčšina publika nie je pripravená kúpiť), vlastné meranie PSB (najviac uložení má konkrétny príznak " +
            "spárovaný s protiintuitívnym vysvetlením — to je fáza 2 a 3), kapacita 60–70 klientov (netreba záplavu dopytov, ale fáza 5 nesmie byť nulová: " +
            "za 9 mesiacov prišlo z Instagramu 7 dopytov z 39) a cena dosahu vo fáze 1 (kto o probléme nevie, nemá dôvod kliknúť). " +
            "Skutočné rozloženie za 18 mesiacov je takmer rovnomerné — vidíš ho v prvom koláči. Rozdiel oproti tretiemu je návrh na posun, nie chyba."
          } />
        </div>
      </div>
    </div>
  );
}

/**
 * Výber úvodného záberu.
 *
 * PREČO FILTROVANÉ PODĽA FÁZY
 *
 * Nie každý pohyb sedí každému publiku. Statický záber vo fáze 1 nikoho
 * nezastaví; švih vo fáze 5 pôsobí ako reklama práve tam, kde má obsah
 * pôsobiť ako práca. Ponuka preto ukazuje len to, čo dáva zmysel — zvyšok
 * je za „ukázať všetky“ pre prípad, že to Jerry vidí inak.
 */
function ZaberVyber({ faza, hodnota, onZmena }: {
  faza: number; hodnota: string; onZmena: (v: string) => void;
}) {
  const [vsetky, setVsetky] = useState(false);
  const vhodne = zaberyPreFazu(faza);
  const ponuka = vsetky || vhodne.length === 0 ? ZABERY : vhodne;
  const vybrany = ZABER_MAPA.get(hodnota);
  // Vybraný záber sa musí dať zobraziť, aj keď pre túto fázu nie je v ponuke —
  // inak by po presune slotu do inej fázy ticho zmizol z obrazovky.
  const mimoPonuky = !!vybrany && !ponuka.some((z) => z.id === vybrany.id);

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <label style={{ fontSize: 11.5, color: C.textMuted }}>
          Úvodný záber — čo je vidieť v prvej sekunde
        </label>
        {!vsetky && vhodne.length > 0 && vhodne.length < ZABERY.length && (
          <button onClick={() => setVsetky(true)}
            style={{ background: "none", border: 0, padding: 0, color: C.textDim, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
            ukázať všetky
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        <button onClick={() => onZmena("")}
          style={{
            background: hodnota === "" ? mix(C.accent, 0.25) : "none",
            border: `1px solid ${hodnota === "" ? C.accent : C.border}`,
            color: hodnota === "" ? C.text : C.textMuted,
            borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer",
          }}>zatiaľ neviem</button>
        {[...ponuka, ...(mimoPonuky && vybrany ? [vybrany] : [])].map((z) => (
          <button key={z.id} onClick={() => onZmena(z.id)}
            style={{
              background: hodnota === z.id ? mix(C.accent, 0.25) : "none",
              border: `1px solid ${hodnota === z.id ? C.accent : C.border}`,
              color: hodnota === z.id ? C.text : C.textMuted,
              borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer",
            }}>
            {z.nazov}
            {mimoPonuky && vybrany?.id === z.id && <span style={{ color: C.textDim }}> · iná fáza</span>}
          </button>
        ))}
      </div>

      {vybrany && (
        <div style={{
          display: "flex", gap: 16, marginTop: 10, padding: 12, borderRadius: 8,
          background: mix(C.accent, 0.05), border: `1px solid ${mix(C.border, 0.9)}`, flexWrap: "wrap",
        }}>
          <div style={{ flex: "0 0 auto", width: 200 }}>
            <ZaberUkazka pohyb={vybrany.pohyb} />
          </div>
          <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>{vybrany.coRobi}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5 }}>
              <b style={{ color: C.textMuted }}>Ako na to: </b>{vybrany.akoNaTo}
            </div>
            <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.45 }}>{vybrany.prePSB}</div>
            {vybrany.zdroj && (
              <a href={vybrany.zdroj.url} target="_blank" rel="noreferrer"
                style={{ fontSize: 11.5, color: C.accentLight }}>
                {vybrany.zdroj.nazov} ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
