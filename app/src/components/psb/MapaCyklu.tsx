import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { kotvaDat } from "../../lib/psb/compute";
import {
  FAZY, mriezka, nazovFazy, osMapy, popisMesiaca, tempoFaz,
  type Bunka, type SlotPlanu, type ZverejnenyKus,
} from "../../lib/psb/mapaCyklu";
import { C, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { AssistantChat } from "./Assistant";
import { Card, H3, Info, Modal } from "./ui";

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
  faza?: number; planovane_na?: string; kto?: string; koncept?: string;
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
      zdroj: n.zdroj || "", stav: n.stav || "novy",
    })), [napady]);

  const bunky = useMemo(() => mriezka(os, vyslo, plan), [os, vyslo, plan]);
  const tempo = useMemo(() => tempoFaz(os, vyslo, kotva.plny || dnes, 6), [os, vyslo, kotva.plny, dnes]);

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
                        {b.plan.map((s) => (
                          <button key={s.id} onClick={() => setVyber({ druh: "slot", slot: s })}
                            title={s.koncept || s.text || "bez konceptu"}
                            style={{
                              width: 11, height: 11, borderRadius: 3, padding: 0, cursor: "pointer",
                              background: s.koncept ? mix(f.farba, 0.55) : "transparent",
                              border: `1.5px dashed ${f.farba}`,
                            }} />
                        ))}
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
          <i style={{ width: 11, height: 11, borderRadius: 3, background: mix(C.textMuted, 0.55), border: `1.5px dashed ${C.textMuted}`, display: "inline-block" }} /> naplánované, s konceptom
        </span>
      </div>

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
            onZavri={() => { setVyber(null); setChyba(""); }}
            onUloz={uloz}
            onFazaPrispevku={ulozFazuPrispevku}
            onJarvis={chat ? posliJarvisovi : undefined}
          />
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
function Panel({ vyber, onZavri, onUloz, onFazaPrispevku, onJarvis }: {
  vyber: NonNullable<Vyber>;
  onZavri: () => void;
  onUloz: (b: Record<string, unknown>) => Promise<boolean>;
  onFazaPrispevku: (id: string, faza: number) => void;
  onJarvis?: (mesiac: string, faza: number) => void;
}) {
  const slot = vyber.druh === "slot" ? vyber.slot : null;
  const [koncept, setKoncept] = useState(slot?.koncept || "");
  const [kto, setKto] = useState(slot?.kto || "");
  const [busy, setBusy] = useState(false);

  const mesiac = vyber.druh === "slot" ? vyber.slot.mesiac : vyber.druh === "novy" ? vyber.mesiac : "";
  const faza = vyber.druh === "slot" ? vyber.slot.faza : vyber.druh === "novy" ? vyber.faza : vyber.kus.faza;

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
    if (!koncept.trim() && !kto.trim()) return;
    setBusy(true);
    const ok = slot
      ? await onUloz({ id: slot.id, koncept, kto })
      : await onUloz({
          // Text nápadu je prvá veta konceptu — zásobník aj plán sú tá istá
          // tabuľka a nápad bez textu by v zozname nápadov svietil prázdny.
          text: koncept.trim().slice(0, 300) || `Obsah na ${mesiac}`,
          zdroj: "vlastny", faza, planovaneNa: mesiac, kto, koncept,
        });
    setBusy(false);
    if (ok) onZavri();
  };

  return (
    <div>
      <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 12, lineHeight: 1.45 }}>
        <b style={{ color: C.textMuted }}>{f?.kto}</b><br />{f?.uloha}
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

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={zapis} disabled={busy || (!koncept.trim() && !kto.trim())}
          style={{ ...tlacidlo(true), opacity: busy || (!koncept.trim() && !kto.trim()) ? 0.5 : 1 }}>
          {slot ? "uložiť" : "naplánovať"}
        </button>
        {slot && (
          <button onClick={async () => { setBusy(true); const ok = await onUloz({ id: slot.id, planovaneNa: "" }); setBusy(false); if (ok) onZavri(); }}
            disabled={busy} style={tlacidlo(false)}>
            vrátiť do zásobníka
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
