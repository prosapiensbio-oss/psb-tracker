/**
 * WORKSPACE PO KROKOCH — časti štyroch kariet, ktoré v starom Workspace neboli.
 *
 * Jerry, 4. 10. 2026: „na každý ten krok by som chcel vo Workspace jeden
 * list" a „chcel by som to na jednom mieste, a tým pádom by som to
 * z ostatných dal preč." Od 5. 10. 2026 naostro, do toho dňa v bete.
 *
 * Pravidlá (kto patrí do zoznamu, aký balíček vznikne, kedy sa pýtať na
 * sumu) sú v `lib/psb/workspaceKroky.ts` a majú testy. Tu je len obrazovka.
 */
import { useEffect, useMemo, useState } from "react";

import { CENNIK, platnostDo } from "../../lib/psb/cennik";
import { maTermin, najdiKlienta, type ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, fmtDMY, normName } from "../../lib/psb/format";
import { nazovProduktu } from "../../lib/psb/nazvyProduktov";
import { oznam } from "../../lib/psb/obnovaSignal";
import type { ZostavaPoPlatnosti } from "../../lib/psb/platnostZostatok";
import { C, mix } from "../../lib/psb/theme";
import { menoDoBloku, rozlozUdalosti } from "../../lib/psb/kalendarRozlozenie";
import type { PSBData } from "../../lib/psb/types";
import { otazkyPlatieb, zoznamSms, type OtazkaPlatby } from "../../lib/psb/workspaceKroky";
import { SmsKlientovi } from "./SmsKlientovi";

export type BalicekRiadokKroku = {
  id?: string; klient: string; nazov: string; hodiny: number | null; platnost_od: string;
  platnost_do: string | null; cena_czk: number | null; zdroj: string; zrusene_at: string | null;
  poznamka?: string | null; created_at?: string | null;
};
export type PlatbaRiadokKroku = {
  klient: string; datum: string; suma_czk: number; zrusene_at: string | null;
  vopred?: number | null; created_at?: string | null;
};
export type UdalostKroku = {
  uid?: string; trener?: string; zaciatok: string; koniec?: string; nazov?: string;
  klient: string | null; typ: string | null;
};

const posli = (url: string, telo: Record<string, unknown>) =>
  fetch(url, {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" }, body: JSON.stringify(telo),
  }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" })) as Promise<{ ok: boolean; error?: string; chyba?: string } & Record<string, unknown>>;

const riadok: React.CSSProperties = {
  display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
  padding: "8px 0", borderBottom: `1px solid ${mix(C.border, 55)}`,
};
const vedlajsie: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
  border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
};
const hlavne = (on = true): React.CSSProperties => ({
  padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit",
  cursor: on ? "pointer" : "not-allowed",
  border: `1px solid ${on ? mix(C.green, 50) : C.border}`,
  background: on ? mix(C.green, 12) : "transparent",
  color: on ? C.green : C.textDim,
});
const nadpisSekcie: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: C.textDim, letterSpacing: 0.7, textTransform: "uppercase", margin: "14px 0 3px",
};

/** „Všetko vybavené" — prázdny krok z kopy nezmizne, len to povie (Jerry, 4. 10. 2026). */
export function VsetkoVybavene({ text = "Všetko vybavené." }: { text?: string }) {
  return (
    <div style={{ padding: "26px 4px", textAlign: "center" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.green }}>{text}</div>
      <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>Keď sa niečo zmení, objaví sa to tu samo.</div>
    </div>
  );
}

export function NadpisSekcie({ children, pocet }: { children: React.ReactNode; pocet?: number }) {
  return (
    <div style={nadpisSekcie}>
      {children}{pocet != null ? <span style={{ color: C.textMuted, marginLeft: 6 }}>{pocet}</span> : null}
    </div>
  );
}

/* ───────────────────────── 1 · KALENDÁR: DEŇ TRÉNERA ─────────────────────── */

/**
 * DEŇ V KALENDÁRI TRÉNERA pri otázke „Bol tam, alebo nie?".
 *
 * Jerry, 4. 10. 2026: „keď kliknem na daného klienta, rozbalí sa mi dole
 * môj kalendár, kde budú všetky udalosti, ale tento klient tam bude
 * zvýraznený červene — alebo ten moment, kedy by tam mal byť." Človek si
 * spomenie podľa toho, čo bolo pred a po, nie podľa samotného času.
 */
export function DenKalendara({ den, trener, udalosti, sporne, klient }: {
  den: string;
  trener: string;
  udalosti: UdalostKroku[];
  /** Termíny, ktoré zmizli — na ich mieste sa ukáže červená diera. */
  sporne: { zaciatok: string; nazov: string }[];
  klient: string;
}) {
  const riadky = useMemo(() => {
    const dna = udalosti.filter((u) => u.zaciatok.slice(0, 10) === den && (!u.trener || !trener || u.trener === trener));
    const vsetky = [
      ...dna.map((u) => ({ cas: u.zaciatok.slice(11, 16), koniec: (u.koniec || "").slice(11, 16), text: u.klient || u.nazov || "—", jeho: !!u.klient && normName(u.klient) === normName(klient), zmizla: false })),
      ...sporne.filter((s) => s.zaciatok.slice(0, 10) === den).map((s) => ({ cas: s.zaciatok.slice(11, 16), koniec: "", text: `${s.nazov || klient} — zmizlo z kalendára`, jeho: true, zmizla: true })),
    ];
    return vsetky.sort((a, b) => a.cas.localeCompare(b.cas));
  }, [den, trener, udalosti, sporne, klient]);

  return (
    <div style={{ margin: "6px 0 4px", padding: "8px 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: mix(C.card, 70) }}>
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 5 }}>{trener || "kalendár"} · {fmtDMY(den)}</div>
      {!riadky.length && <div style={{ fontSize: 12, color: C.textDim }}>V ten deň v kalendári nič nie je.</div>}
      {riadky.map((r, i) => (
        <div key={i} style={{
          display: "flex", gap: 10, padding: "4px 7px", borderRadius: 6, marginBottom: 2, fontSize: 12.5,
          color: r.jeho ? C.red : C.textMuted,
          background: r.jeho ? mix(C.red, 10) : "transparent",
          border: r.zmizla ? `1px dashed ${mix(C.red, 60)}` : r.jeho ? `1px solid ${mix(C.red, 45)}` : "1px solid transparent",
          fontWeight: r.jeho ? 700 : 400,
        }}>
          <span style={{ width: 92, fontVariantNumeric: "tabular-nums" }}>{r.cas}{r.koniec ? `–${r.koniec}` : ""}</span>
          <span>{r.text}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * TÝŽDEŇ V KALENDÁRI TRÉNERA so zvýraznenou zmenou.
 *
 * Jerry, 4. 10. 2026: „po kliknutí na meno klienta sa pod ním rozbalí
 * kalendár; keď bude vymazaný, bude ten čas označený na červeno, keď bude
 * presunutý, ukáže mi v tom kalendári žltú animáciu — ten čas, z ktorého
 * a na ktorý sa to presúva, preblikáva medzi obidvoma. To isté platí na
 * ‚bol tam, alebo nie' a na nové názvy v kalendári."
 *
 * Týždeň sa načíta zo servera (`/api/kalendar?tyzden=`) aj so zmiznutými
 * udalosťami — okno, ktoré appka drží, má len dva týždne a zmena býva
 * staršia.
 */
export type Zvyraznenie = {
  /** `YYYY-MM-DDTHH:MM` — kde v týždni to svieti. Pri `nazov` sa nepoužije. */
  zaciatok?: string;
  druh: "zmazane" | "presunZ" | "presunNa" | "sporne" | "nazov" | "nove";
  /** Pri `nazov`: všetky udalosti s týmto názvom. */
  nazov?: string;
  popis?: string;
};

type UdalostTyzdna = { uid: string; zaciatok: string; koniec: string; nazov: string; klient: string | null; typ: string | null; zmizla_at: string | null };

const DNI = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

export function TyzdenKalendara({ den, trener, zvyraznenia }: { den: string; trener: string; zvyraznenia: Zvyraznenie[] }) {
  const [stav, setStav] = useState<{ pondelok: string; udalosti: UdalostTyzdna[] } | null>(null);
  const [chyba, setChyba] = useState("");
  useEffect(() => {
    let zive = true;
    setStav(null); setChyba("");
    void fetch(`/api/kalendar?tyzden=${encodeURIComponent(den.slice(0, 10))}&trener=${encodeURIComponent(trener)}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!zive) return; if (j?.ok) setStav({ pondelok: j.pondelok, udalosti: j.udalosti || [] }); else setChyba("Kalendár sa nenačítal."); })
      .catch(() => { if (zive) setChyba("Kalendár sa nenačítal."); });
    return () => { zive = false; };
  }, [den, trener]);

  if (chyba) return <div style={{ fontSize: 12, color: C.red, padding: "6px 0" }}>{chyba}</div>;
  if (!stav) return <div style={{ fontSize: 12, color: C.textDim, padding: "6px 0" }}>načítavam týždeň…</div>;

  /**
   * TÁ ISTÁ MRIEŽKA AKO KARTA KALENDÁR (Jerry, 4. 10. 2026: „kalendár by mal
   * mať plus-mínus rovnaký dizajn ako karta Kalendár"): hodiny vľavo, bloky
   * podľa času a dĺžky, farba podľa druhu, súbežné hodiny vedľa seba
   * (`rozlozUdalosti`). Len na čítanie — upravuje sa v karte Kalendár.
   */
  const minuty = (x: string) => Number(x.slice(11, 13)) * 60 + Number(x.slice(14, 16));
  const minuta = (x: string) => String(x || "").slice(0, 16);
  const dniTyzdna = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${stav.pondelok}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
  type Blok = { zaciatok: string; koniec: string; text: string; typ: string | null; zmizla: boolean; druh?: Zvyraznenie["druh"]; popis?: string };
  const bloky: Blok[] = [];
  const pouzite = new Set<Zvyraznenie>();
  for (const u of stav.udalosti) {
    if (!dniTyzdna.includes(u.zaciatok.slice(0, 10))) continue;
    const z = zvyraznenia.find((x) => (x.druh === "nazov" ? !!x.nazov && x.nazov === u.nazov : !!x.zaciatok && minuta(x.zaciatok) === minuta(u.zaciatok)));
    if (z && z.druh !== "nazov") pouzite.add(z);
    bloky.push({ zaciatok: u.zaciatok, koniec: u.koniec || u.zaciatok, text: u.klient || u.nazov || "—", typ: u.typ, zmizla: !!u.zmizla_at, druh: z?.druh, popis: z?.popis });
  }
  // Čas, kde udalosť už nie je (presunutá preč, zmazaná) — „duch" na mieste.
  for (const z of zvyraznenia) {
    if (z.druh === "nazov" || !z.zaciatok || pouzite.has(z) || !dniTyzdna.includes(z.zaciatok.slice(0, 10))) continue;
    const koniec = `${z.zaciatok.slice(0, 11)}${String(Math.min(23, Number(z.zaciatok.slice(11, 13)) + 1)).padStart(2, "0")}${z.zaciatok.slice(13, 16)}`;
    bloky.push({ zaciatok: z.zaciatok, koniec, text: z.popis || "", typ: null, zmizla: true, druh: z.druh, popis: z.popis });
  }

  const od = bloky.length ? Math.max(0, Math.floor(Math.min(...bloky.map((b) => minuty(b.zaciatok))) / 60) - 1) : 7;
  const doH = bloky.length ? Math.min(24, Math.ceil(Math.max(...bloky.map((b) => minuty(b.koniec))) / 60) + 1) : 20;
  const hodin = Math.max(1, doH - od);
  // POLOVIČNÁ VEĽKOSŤ oproti karte Kalendár (Jerry, 4. 10. 2026: „náčrt po
  // kliknutí na meno musí byť menší, aspoň o polovicu"). Je to náhľad pod
  // riadkom, nie pracovná plocha — má ukázať, kde v týždni to je.
  const VYSKA = 23;
  const PAS = 30;
  const dnesIso = new Date().toISOString().slice(0, 10);
  // Farba nesie typ, ako v karte Kalendár.
  const farba = (b: Blok) => b.typ === "uvodny" ? C.blue
    : b.typ === "guillermo" ? C.green
      : b.typ === "sukromne" || b.typ === "netrening" ? C.textDim
        : trener === "Terezka" ? C.blue : C.accent;
  const ZLTA = "rgb(234,179,8)";

  const stylBloku = (b: Blok): React.CSSProperties => {
    const f = farba(b);
    if (b.druh === "zmazane" || b.druh === "sporne") return { background: mix(C.red, 22), borderLeft: `2px solid ${C.red}`, outline: `1px solid ${mix(C.red, 70)}`, color: C.red, fontWeight: 700 };
    if (b.druh === "presunZ") return { borderLeft: `2px solid ${ZLTA}`, outline: `1px dashed ${ZLTA}`, animation: "psbBlikA 1.6s infinite", color: C.text, fontWeight: 700 };
    if (b.druh === "presunNa") return { borderLeft: `2px solid ${ZLTA}`, outline: `1px solid ${ZLTA}`, animation: "psbBlikB 1.6s infinite", color: C.text, fontWeight: 700 };
    if (b.druh === "nazov" || b.druh === "nove") return { background: "rgba(234,179,8,.32)", borderLeft: `2px solid ${ZLTA}`, outline: `1px solid ${ZLTA}`, color: C.text, fontWeight: 700 };
    return { background: mix(f, 16), borderLeft: `2px solid ${f}`, color: b.zmizla ? C.textDim : C.text, opacity: b.zmizla ? 0.55 : 1, textDecoration: b.zmizla ? "line-through" : undefined };
  };

  return (
    <div style={{ margin: "6px 0 4px", padding: "7px 8px 6px", borderRadius: 10, maxWidth: 560, border: `1px solid ${C.border}`, background: mix(C.card, 70) }}>
      <style>{"@keyframes psbBlikA{0%,45%{background:rgba(234,179,8,.55)}55%,100%{background:transparent}}@keyframes psbBlikB{0%,45%{background:transparent}55%,100%{background:rgba(234,179,8,.55)}}"}</style>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
        <span style={{ fontSize: 11.5, color: C.text, fontWeight: 600 }}>
          {trener || "Kalendár"} · {fmtDMY(dniTyzdna[0]).replace(/\s?\d{4}$/, "")} – {fmtDMY(dniTyzdna[6])}
        </span>
        <span style={{ fontSize: 10, color: C.textDim }}>
          <span style={{ color: C.red }}>■</span> zmazané · <span style={{ color: ZLTA }}>■</span> presun / hľadaný názov · <s>prečiarknuté</s> = už nie je v kalendári
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 380 }}>
          <div style={{ display: "grid", gridTemplateColumns: `${PAS}px repeat(7, 1fr)`, gap: 2, marginBottom: 2 }}>
            <div />
            {dniTyzdna.map((d, i) => (
              <div key={d} style={{
                textAlign: "center", fontSize: 9.5, padding: "1px 0", borderRadius: 5,
                fontWeight: d === dnesIso ? 700 : 600,
                color: d === dnesIso ? C.accentLight : C.textMuted,
                background: d === dnesIso ? mix(C.accent, 12) : "transparent",
              }}>{DNI[i]} {Number(d.slice(8, 10))}.</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `${PAS}px repeat(7, 1fr)`, gap: 2 }}>
            <div style={{ position: "relative", height: hodin * VYSKA }}>
              {Array.from({ length: hodin }, (_, i) => (
                <div key={i} style={{ position: "absolute", top: i * VYSKA - 5, right: 3, fontSize: 8.5, color: C.textDim }}>
                  {od + i}
                </div>
              ))}
            </div>
            {dniTyzdna.map((d) => {
              const vDni = bloky.filter((b) => b.zaciatok.slice(0, 10) === d);
              const miesta = rozlozUdalosti(vDni.map((b) => ({ od: minuty(b.zaciatok), do: Math.max(minuty(b.zaciatok) + 30, minuty(b.koniec)) })));
              return (
                <div key={d} style={{ position: "relative", height: hodin * VYSKA, borderRadius: 5, background: d === dnesIso ? mix(C.accent, 5) : mix(C.border, 14), overflow: "hidden" }}>
                  {Array.from({ length: hodin }, (_, i) => (
                    <div key={i} style={{ position: "absolute", top: i * VYSKA, left: 0, right: 0, borderTop: `1px solid ${mix(C.border, 40)}` }} />
                  ))}
                  {vDni.map((b, poz) => {
                    const top = ((minuty(b.zaciatok) - od * 60) / 60) * VYSKA;
                    const vyska = Math.max(11, ((Math.max(minuty(b.zaciatok) + 30, minuty(b.koniec)) - minuty(b.zaciatok)) / 60) * VYSKA - 2);
                    const { stlpec, zo } = miesta[poz];
                    return (
                      <div
                        key={poz}
                        title={`${b.zaciatok.slice(11, 16)}–${b.koniec.slice(11, 16)} · ${b.text}${b.popis ? ` · ${b.popis}` : ""}`}
                        style={{
                          position: "absolute", top, height: vyska,
                          left: `calc(${(stlpec / zo) * 100}% + 2px)`, width: `calc(${100 / zo}% - 4px)`,
                          borderRadius: 3, padding: "0 3px", overflow: "hidden",
                          fontSize: 8.5, lineHeight: `${Math.min(vyska, 13)}px`, zIndex: b.druh ? 2 : 1,
                          ...stylBloku(b),
                        }}
                      >
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{menoDoBloku(b.text, false, zo)}</div>
                        {vyska > 26 && <div style={{ color: C.textDim, fontSize: 8, textDecoration: "none" }}>{b.zaciatok.slice(11, 16)}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── 2 · SMS PRE KLIENTOV ──────────────────────────── */

export function KrokSms({ clients, dlhy, udalosti, balicky, platby, trener, onPocet }: {
  clients: Record<string, ClientAgg>;
  dlhy: Record<string, number>;
  udalosti: UdalostKroku[];
  balicky: BalicekRiadokKroku[];
  platby: PlatbaRiadokKroku[];
  /** Čie: „Jerry", „Terezka" alebo `null` = všetci. */
  trener: string | null;
  onPocet?: (n: number) => void;
}) {
  const [odoslane, setOdoslane] = useState<Record<string, string> | null>(null);
  const [otvoreny, setOtvoreny] = useState("");
  /** Odoslané v tomto okne — zmiznú hneď, nečaká sa na nové načítanie. */
  const [teraz, setTeraz] = useState<Record<string, string>>({});

  useEffect(() => {
    let zive = true;
    void fetch("/api/sms?odoslane=1", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (zive) setOdoslane(j?.ok ? (j.odoslane || {}) : {}); })
      .catch(() => { if (zive) setOdoslane({}); });
    return () => { zive = false; };
  }, []);

  const riadky = useMemo(() => {
    if (!odoslane) return [];
    const dnes = new Date().toISOString().slice(0, 10);
    const terazIso = new Date().toISOString();
    /**
     * POSLEDNÁ ZMENA STAVU — tréning, ktorý sa začal, platba, balíček.
     * Časy z kalendára sú pražské bez pásma; `new Date` ich prečíta ako
     * miestne, čo je pri Jerrym to isté.
     */
    const zmena: Record<string, string> = {};
    const posun = (meno: string | null, iso: string) => {
      if (!meno || !iso || iso > terazIso) return;
      const k = Object.keys(clients).find((m) => normName(m) === normName(meno)) || meno;
      if (!zmena[k] || iso > zmena[k]) zmena[k] = iso;
    };
    const objednane = new Set<string>();
    for (const u of udalosti) {
      if (!u.klient || (u.typ !== "trening" && u.typ !== "uvodny")) continue;
      const iso = new Date(u.zaciatok).toISOString();
      if (iso > terazIso) objednane.add(normName(u.klient));
      else posun(u.klient, iso);
    }
    for (const p of platby) posun(p.klient, p.created_at || `${p.datum}T00:00:00.000Z`);
    for (const b of balicky) posun(b.klient, b.created_at || `${b.platnost_od}T00:00:00.000Z`);
    const vsetky = zoznamSms(
      Object.values(clients).filter((c) => !trener || c.primaryTrainer === trener),
      dlhy, { ...odoslane, ...teraz }, zmena, objednane, dnes,
    );
    return vsetky;
  }, [clients, dlhy, udalosti, balicky, platby, trener, odoslane, teraz]);

  useEffect(() => { onPocet?.(riadky.length); }, [riadky.length, onPocet]);

  if (!odoslane) return <div style={{ fontSize: 12, color: C.textDim }}>načítavam, komu už SMS odišla…</div>;
  if (!riadky.length) return <VsetkoVybavene text="Všetko vybavené — nikomu netreba písať." />;

  return (
    <div>
      {riadky.map((r) => {
        const otvorene = otvoreny === r.meno;
        return (
          <div key={r.meno} style={{ borderBottom: `1px solid ${mix(C.border, 55)}` }}>
            <button
              onClick={() => setOtvoreny(otvorene ? "" : r.meno)}
              style={{ ...riadok, borderBottom: "none", width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text, minWidth: 170 }}>{r.meno}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: r.stav === "minus" || r.dlh ? C.orange : C.textMuted, minWidth: 70 }}>
                {r.stav === "minus" ? `${r.zostatok} h` : r.stav === "nula" ? "0 h" : fmtCZK(r.dlh)}
              </span>
              <span style={{ fontSize: 11.5, color: C.textMuted, flex: "1 1 200px" }}>{r.veta}</span>
              <span style={{ fontSize: 11, color: C.textDim }}>{r.trener}</span>
              <span style={{ fontSize: 12, color: C.accentLight }}>{otvorene ? "zavrieť" : "otvoriť"}</span>
            </button>
            {otvorene && (
              <div style={{ padding: "4px 4px 12px" }}>
                <SmsKlientovi
                  vlozene
                  meno={r.meno}
                  trener={r.trener}
                  zostatok={r.zostatok}
                  onOdoslane={() => setTeraz((s) => ({ ...s, [r.meno]: new Date().toISOString() }))}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── 3 · PLATBY ────────────────────────────────────── */

/**
 * STIAHNUTIE PRÍJMOV Z FIO priamo v kroku Platby — JEDNÝM KLIKOM.
 *
 * Jerry, 5. 10. 2026: „dal som stiahnuť Fio výpis, ale neukázalo sa mi,
 * koho stiahlo — Hanus dnes zaplatil a pri ňom nevidím žiadnu platbu."
 * Prvá verzia mala dva kroky: „Stiahnuť" len spočítalo nové príjmy a zápis
 * čakal na druhé tlačidlo „Zapísať", ktoré nebolo vidieť ako nutné. Výpis
 * je fakt z banky, nie rozhodnutie — rozhoduje sa až pri párovaní. Preto
 * sa príjmy po stiahnutí zapíšu hneď a ukáže sa, kto poslal peniaze.
 *
 * Sťahuje sa OBDOBIE (posledných 30 dní), nie „od posledného stiahnutia":
 * to by v banke posunulo zarážku. Zapisujú sa len PRÍJMY — výdavky patria
 * obrazovke Banka, kde sa im dáva kategória do P&L. Duplicity a zamknuté
 * mesiace stráži server (`/api/fio` zapis).
 */
export function FioPrijmy({ onZapisane }: { onZapisane: () => void }) {
  const [bezi, setBezi] = useState(false);
  const [vysledok, setVysledok] = useState<{ datum: string; suma: number; kto: string }[] | null>(null);
  const [chyba, setChyba] = useState("");

  const stiahni = async () => {
    setBezi(true); setChyba(""); setVysledok(null);
    const doDna = new Date().toISOString().slice(0, 10);
    const od = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const j = await posli("/api/fio", { akcia: "stiahni", od, do: doDna });
    if (!j.ok) { setBezi(false); setChyba(String(j.chyba || j.error || "Fio sa nestiahlo.")); return; }
    type R = { datum: string; suma: number; protistrana?: string; poznamka?: string; uzMame?: boolean; zamknuty?: boolean };
    const nove = ((Array.isArray(j.riadky) ? j.riadky : []) as R[]).filter((r) => r.suma > 0 && !r.uzMame && !r.zamknuty);
    if (nove.length) {
      const z = await posli("/api/fio", { akcia: "zapis", riadky: nove });
      if (!z.ok) { setBezi(false); setChyba(String(z.error || "Príjmy sa stiahli, ale nezapísali.")); return; }
    }
    setBezi(false);
    setVysledok(nove
      .map((r) => ({ datum: String(r.datum).slice(0, 10), suma: r.suma, kto: (r.protistrana || r.poznamka || "").slice(0, 60) }))
      .sort((a, b) => b.datum.localeCompare(a.datum)));
    if (nove.length) { oznam("peniaze"); onZapisane(); }
  };

  return (
    <div style={{ padding: "6px 0 10px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => void stiahni()} disabled={bezi} style={hlavne(!bezi)}>
          {bezi ? "sťahujem a zapisujem…" : "Stiahnuť príjmy z Fio"}
        </button>
        {vysledok && !vysledok.length && <span style={{ fontSize: 12.5, color: C.green }}>Za 30 dní nie je nový príjem — všetko už je v Kokpite.</span>}
        {vysledok && vysledok.length > 0 && (
          <span style={{ fontSize: 12.5, color: C.green }}>
            Zapísané: {vysledok.length} {vysledok.length === 1 ? "nový príjem" : vysledok.length < 5 ? "nové príjmy" : "nových príjmov"}. Párujú sa nižšie — pri dlžníkovi alebo v zozname platieb bez klienta.
          </span>
        )}
        {chyba && <span style={{ fontSize: 12, color: C.red, flexBasis: "100%" }}>{chyba}</span>}
      </div>
      {vysledok && vysledok.length > 0 && (
        <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: mix(C.card, 70) }}>
          {vysledok.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 12, padding: "2px 0" }}>
              <span style={{ color: C.textDim, minWidth: 70 }}>{fmtDMY(r.datum)}</span>
              <span style={{ fontWeight: 700, minWidth: 80, textAlign: "right" }}>{fmtCZK(r.suma)}</span>
              <span style={{ color: C.textMuted }}>{r.kto || "bez textu"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * SUMA NESEDÍ NA BALÍČEK — otázka a jedným klikom oprava.
 * Pravidlá v `otazkyPlatieb`; tu sa balíček len prepíše.
 */
export function OtazkyPlatieb({ balicky, platby, trener, clients, onOpravene }: {
  balicky: BalicekRiadokKroku[];
  platby: PlatbaRiadokKroku[];
  trener: string | null;
  clients: Record<string, ClientAgg>;
  onOpravene: () => void;
}) {
  const [dovody, setDovody] = useState<Record<string, string>>({});
  const [bezi, setBezi] = useState("");
  const [chyba, setChyba] = useState("");
  const [odlozene, setOdlozene] = useState<Set<string>>(new Set());

  const otazky = useMemo(() => otazkyPlatieb(
    balicky.filter((b) => b.id).map((b) => ({
      id: String(b.id), klient: b.klient, nazov: b.nazov, hodiny: b.hodiny, cena: b.cena_czk,
      platnostOd: b.platnost_od, zdroj: b.zdroj, zruseneAt: b.zrusene_at,
    })),
    platby.map((p) => ({ klient: p.klient, datum: p.datum, suma: p.suma_czk, zruseneAt: p.zrusene_at, vopred: p.vopred })),
  ).filter((o) => !odlozene.has(o.balicekId) && (!trener || clients[o.klient]?.primaryTrainer === trener)), [balicky, platby, trener, clients, odlozene]);

  if (!otazky.length) return null;

  const oprav = async (o: OtazkaPlatby, zmena: { nazov?: string; hodiny?: number; cena: number; platnostDo?: string; dovod?: string }) => {
    const b = balicky.find((x) => x.id === o.balicekId);
    if (!b) return;
    setBezi(o.balicekId); setChyba("");
    const poznamka = [b.poznamka, zmena.dovod ? `cena ${zmena.cena} Kč: ${zmena.dovod}` : ""].filter(Boolean).join(" · ");
    const j = await posli("/api/balicky", {
      akcia: "uprav", id: b.id, klient: b.klient,
      nazov: zmena.nazov || b.nazov, hodiny: zmena.hodiny ?? b.hodiny ?? "",
      platnostOd: b.platnost_od, platnostDo: zmena.platnostDo || b.platnost_do || "",
      cenaCzk: zmena.cena, poznamka,
    });
    setBezi("");
    if (!j.ok) { setChyba(j.error || "Balíček sa neupravil."); return; }
    oznam("peniaze");
    onOpravene();
  };

  return (
    <>
      <NadpisSekcie pocet={otazky.length}>Suma nesedí na balíček</NadpisSekcie>
      {chyba && <div style={{ fontSize: 12, color: C.red }}>{chyba}</div>}
      {otazky.map((o) => (
        <div key={o.balicekId} style={riadok}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text, minWidth: 160 }}>{o.klient}</span>
          <span style={{ fontSize: 12.5, color: C.text, flex: "1 1 260px" }}>{o.veta}</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", flexBasis: "100%" }}>
            {o.moznosti.map((m, i) => m.druh === "velkost"
              ? (
                <button key={i} disabled={bezi === o.balicekId} style={hlavne(true)}
                  onClick={() => void oprav(o, { nazov: m.nazov, hodiny: m.hodiny, cena: m.cena, platnostDo: m.platnostDo })}>
                  {m.popis} — prepísať na {m.hodiny} h
                </button>
              )
              : m.dovod
                ? (
                  <button key={i} disabled={bezi === o.balicekId} style={hlavne(true)}
                    onClick={() => void oprav(o, { cena: m.cena, dovod: m.dovod })}>
                    {m.popis}
                  </button>
                )
                : (
                  <span key={i} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      value={dovody[o.balicekId] || ""}
                      onChange={(e) => setDovody((s) => ({ ...s, [o.balicekId]: e.target.value }))}
                      placeholder="prečo — napr. barter, platí za dvoch…"
                      style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, width: 230, fontFamily: "inherit" }}
                    />
                    <button disabled={bezi === o.balicekId || !(dovody[o.balicekId] || "").trim()} style={vedlajsie}
                      onClick={() => void oprav(o, { cena: m.cena, dovod: (dovody[o.balicekId] || "").trim() })}>
                      {m.popis}
                    </button>
                  </span>
                ))}
            <button style={vedlajsie} onClick={() => setOdlozene((s) => new Set([...s, o.balicekId]))}>
              doplatí zvyšok {fmtCZK(o.cena - o.zaplatene)}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

/* ───────────────────────── 4 · BALÍČKY ───────────────────────────────────── */

/** Veľkosti, z ktorých sa vyberá — aktuálne balíčky z cenníka (bez TC a starých). */
const VELKOSTI = CENNIK.filter((s) => (s.hodiny || 0) > 0 && (s.cena || 0) > 0 && s.skupina !== "Špeciálne");

/**
 * KONČIACA PLATNOSŤ — jedno rozhodnutie pre všetky členstvá.
 *
 * Jerry, 4. 10. 2026: „vyskočí na mňa niečo ako X hodín prepadlo a ja potom
 * nastavím (rovnako ako v anamnéze nastavujem výšku, váhu) počet hodín,
 * ktoré sú doplnenie členstva — ale najviac toľko, koľko prepadlo. A toto by
 * mohlo byť univerzálne naprieč všetkými členstvami. Pri viazanosti /
 * předplatnom má byť vždy možnosť presunúť 2 hodiny do ďalšieho balíčka."
 *
 * Posuvník od 0 po všetky: 0 = prepadlo všetko, plný = doplnenie všetkých,
 * čokoľvek medzi = doplnenie časti a zvyšok prepadne. Odpoveď sa zapíše do
 * `anomaly_ack` s tým istým kľúčom ako upozornenie, takže sa nevráti ani po
 * obnovení stránky — doteraz sa vracala.
 */
export function KrokPlatnost({ polozky, acks, trener, onVybavene }: {
  polozky: ZostavaPoPlatnosti[];
  acks: Record<string, unknown>;
  trener: string | null;
  onVybavene: () => void;
}) {
  const [hodnoty, setHodnoty] = useState<Record<string, number>>({});
  const [bezi, setBezi] = useState("");
  const [chyba, setChyba] = useState("");
  const [hotove, setHotove] = useState<Set<string>>(new Set());

  const zive = polozky.filter((x) => {
    const kluc = `platnost|${x.meno}|${x.platnostDo}`;
    return !acks[kluc] && !hotove.has(kluc) && (!trener || x.trener === trener);
  });
  if (!zive.length) return null;

  const odpovedz = async (x: ZostavaPoPlatnosti, doplnit: number, presun: number) => {
    const kluc = `platnost|${x.meno}|${x.platnostDo}`;
    setBezi(kluc); setChyba("");
    const prepadne = Math.max(0, Math.round((x.hodin - doplnit - presun) * 100) / 100);
    const veta = [
      doplnit ? `doplnenie ${doplnit} h` : "",
      presun ? `${presun} h presunuté do ďalšieho balíčka` : "",
      prepadne ? `${prepadne} h prepadlo` : "",
    ].filter(Boolean).join(", ") + ` — platnosť do ${x.platnostDo}`;
    if (doplnit > 0) {
      const j = await posli("/api/balicky", {
        akcia: "pridaj", klient: x.meno, nazov: "Doplnenie členstva", hodiny: doplnit,
        platnostOd: x.platnostDo, cenaCzk: 0, poznamka: `nedočerpané hodiny z členstva do ${x.platnostDo}`,
      });
      if (!j.ok) { setBezi(""); setChyba(j.error || "Doplnenie sa nezapísalo."); return; }
    }
    if (presun > 0) {
      const j = await posli("/api/balicky", { akcia: "presun", klient: x.meno, hodiny: presun, zPlatnostiDo: x.platnostDo });
      if (!j.ok) { setBezi(""); setChyba(j.error || "Presun sa nezapísal."); return; }
    }
    const a = await posli("/api/anomaly", { key: kluc, ack: true, note: veta });
    setBezi("");
    if (!a.ok) { setChyba(a.error || "Odpoveď sa neuložila."); return; }
    setHotove((s) => new Set([...s, kluc]));
    oznam("peniaze");
    onVybavene();
  };

  return (
    <>
      <NadpisSekcie pocet={zive.length}>Platnosť končí, hodiny zostávajú</NadpisSekcie>
      {chyba && <div style={{ fontSize: 12, color: C.red }}>{chyba}</div>}
      {zive.map((x) => {
        const kluc = `platnost|${x.meno}|${x.platnostDo}`;
        const doplnit = Math.min(x.hodin, hodnoty[kluc] ?? 0);
        const prepadne = Math.round((x.hodin - doplnit) * 100) / 100;
        return (
          <div key={kluc} style={{ ...riadok, alignItems: "flex-start" }}>
            <div style={{ minWidth: 170 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{x.meno}</div>
              <div style={{ fontSize: 11, color: C.textDim }}>
                {nazovProduktu(x.membership)} · {x.dni < 0 ? `končí ${fmtDMY(x.platnostDo)}` : `skončila ${fmtDMY(x.platnostDo)}`}
              </div>
            </div>
            <div style={{ flex: "1 1 320px" }}>
              <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>
                <b style={{ color: prepadne ? C.orange : C.green }}>{prepadne} h prepadne</b>
                {doplnit ? <span style={{ color: C.textMuted }}> · {doplnit} h ako doplnenie členstva</span> : null}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: C.textDim }}>doplnenie</span>
                <input
                  type="range" min={0} max={x.hodin} step={1} value={doplnit}
                  onChange={(e) => setHodnoty((s) => ({ ...s, [kluc]: Number(e.target.value) }))}
                  style={{ width: 180, accentColor: C.accent }}
                  aria-label={`Koľko hodín z ${x.hodin} dostane ${x.meno} ako doplnenie`}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 54 }}>{doplnit} / {x.hodin} h</span>
                <button disabled={bezi === kluc} style={hlavne(bezi !== kluc)} onClick={() => void odpovedz(x, doplnit, 0)}>
                  {bezi === kluc ? "…" : doplnit ? `Potvrdiť: ${doplnit} h doplnenie, ${prepadne} h prepadne` : `Potvrdiť: ${x.hodin} h prepadne`}
                </button>
                {x.predplatne && x.presunHodin > 0 && (
                  <button disabled={bezi === kluc} style={vedlajsie}
                    title="Hodiny sa pridajú k ďalšiemu balíčku — 6h Předplatné bude mať 8 h."
                    onClick={() => void odpovedz(x, 0, x.presunHodin)}>
                    preniesť {x.presunHodin} h do ďalšieho balíčka{x.hodin > x.presunHodin ? `, ${Math.round((x.hodin - x.presunHodin) * 100) / 100} h prepadne` : ""}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

/**
 * AUTOMATICKY ZALOŽENÉ BALÍČKY — len otázka „sedí?".
 *
 * Jerry, 4. 10. 2026: „keďže balíčky vznikajú automaticky začatím prvej
 * hodiny, je potrebné, aby tam to okno bolo?" Na zápis nie — balíček
 * zakladá Kokpit sám (`automatickeBalicky.server.ts`). Ostáva jediná
 * otázka, ktorú si Jerry vypýtal: pri návrate po pauze „vznikne
 * automaticky a následne sa Kokpit dopýta, či novovzniknutý balíček sedí".
 * Odpoveď sa zapíše do `anomaly_ack`, takže sa nepýta znova.
 */
export function AutomatickeBalicky({ balicky, acks, clients, trener, onVybavene }: {
  balicky: BalicekRiadokKroku[];
  acks: Record<string, unknown>;
  clients: Record<string, ClientAgg>;
  trener: string | null;
  onVybavene: () => void;
}) {
  const [velkost, setVelkost] = useState<Record<string, string>>({});
  const [bezi, setBezi] = useState("");
  const [chyba, setChyba] = useState("");
  const [hotove, setHotove] = useState<Set<string>>(new Set());

  const auto = balicky.filter((b) => b.id && !b.zrusene_at && /^automaticky/i.test(String(b.poznamka || ""))
    && (!trener || clients[b.klient]?.primaryTrainer === trener));
  const otazky = auto.filter((b) => /návrat/i.test(String(b.poznamka || "")) && !acks[`balicek-sedi|${b.id}`] && !hotove.has(String(b.id)));
  const nedavno = auto.filter((b) => (b.created_at || "") >= new Date(Date.now() - 14 * 86400000).toISOString());

  const odpovedz = async (b: BalicekRiadokKroku, ako: "sedi" | "zmen" | "zrus") => {
    const id = String(b.id);
    setBezi(id); setChyba("");
    let veta = "sedí";
    if (ako === "zmen") {
      const s = VELKOSTI.find((x) => x.nazov === velkost[id]);
      if (!s) { setBezi(""); return; }
      const j = await posli("/api/balicky", {
        akcia: "uprav", id, klient: b.klient, nazov: s.nazov, hodiny: s.hodiny ?? "",
        platnostOd: b.platnost_od, platnostDo: platnostDo(b.platnost_od.slice(0, 10), s.tyzdnov, s.mesiacov),
        cenaCzk: s.cena ?? "", poznamka: b.poznamka || "",
      });
      if (!j.ok) { setBezi(""); setChyba(j.error || "Balíček sa neupravil."); return; }
      veta = `zmenené na ${s.nazov}`;
    }
    if (ako === "zrus") {
      const j = await posli("/api/balicky", { akcia: "zrus", id });
      if (!j.ok) { setBezi(""); setChyba(j.error || "Balíček sa nezrušil."); return; }
      veta = "zrušené — klient sa nevrátil na balíček";
    }
    const a = await posli("/api/anomaly", { key: `balicek-sedi|${id}`, ack: true, note: veta });
    setBezi("");
    if (!a.ok) { setChyba(a.error || "Odpoveď sa neuložila."); return; }
    setHotove((x) => new Set([...x, id]));
    oznam("peniaze");
    onVybavene();
  };

  return (
    <>
      {otazky.length > 0 && <NadpisSekcie pocet={otazky.length}>Vrátil sa po pauze — sedí nový balíček?</NadpisSekcie>}
      {chyba && <div style={{ fontSize: 12, color: C.red }}>{chyba}</div>}
      {otazky.map((b) => {
        const id = String(b.id);
        return (
          <div key={id} style={{ ...riadok, alignItems: "flex-start" }}>
            <div style={{ minWidth: 170 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{b.klient}</div>
              <div style={{ fontSize: 11, color: C.textDim }}>{String(b.poznamka || "").split(" · ").find((x) => /návrat/i.test(x))}</div>
            </div>
            <div style={{ flex: "1 1 260px", fontSize: 12.5, color: C.text }}>
              <b>{nazovProduktu(b.nazov)}</b> · {b.hodiny ?? "—"} h · {b.cena_czk != null ? fmtCZK(b.cena_czk) : "—"} · od {fmtDMY(b.platnost_od)}{b.platnost_do ? ` do ${fmtDMY(b.platnost_do)}` : ""}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <button disabled={bezi === id} style={hlavne(bezi !== id)} onClick={() => void odpovedz(b, "sedi")}>{bezi === id ? "…" : "Sedí"}</button>
              <select
                value={velkost[id] || ""}
                onChange={(e) => setVelkost((x) => ({ ...x, [id]: e.target.value }))}
                style={{ padding: "5px 7px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, fontFamily: "inherit" }}
                aria-label={`Iná veľkosť balíčka pre ${b.klient}`}
              >
                <option value="">iná veľkosť…</option>
                {VELKOSTI.map((x) => <option key={x.nazov} value={x.nazov}>{x.nazov} · {x.cena} Kč</option>)}
              </select>
              {velkost[id] && <button disabled={bezi === id} style={vedlajsie} onClick={() => void odpovedz(b, "zmen")}>zmeniť</button>}
              <button disabled={bezi === id} style={vedlajsie} onClick={() => void odpovedz(b, "zrus")}>zrušiť balíček</button>
            </div>
          </div>
        );
      })}
      {nedavno.length > 0 && (
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.55 }}>
          Za 14 dní vznikli prvým tréningom sami: {nedavno.map((b) => `${b.klient} (${nazovProduktu(b.nazov)}, ${fmtDMY(b.platnost_od)})`).join(" · ")}.
          Zmeniť ich ide v profile klienta.
        </div>
      )}
    </>
  );
}

/* ───────────────────────── DOPYTY (Terezka) ──────────────────────────────── */

/**
 * DOPYTY — Terezkina karta (beta, Jerry 5. 10. 2026: „postav kartu pre
 * dopyty pre Terezku"). Prvý kontakt s novým klientom má v 99,9 % ona.
 *
 * Navrchu to, čo čaká na ňu: komu sa ešte nikto neozval (rýchlosť odpovede
 * je najsilnejšia páka na to, či z dopytu bude klient), dopyty bez výsledku
 * a úvodní klienti bez zdroja — to je jej krok mesačnej uzávierky. Pod tým
 * celý zoznam dopytov, ten istý ako v Marketingu, zabalený.
 */
export function KrokDopyty({ leads, clients, bezZdroja, onNavigate, onZmena, VsetkyDopyty }: {
  leads: { id: string; date: string; name: string; source: string; status: string; email: string; telefon: string; odpovedaneAt: string; dovod: string; druh: string; note: string }[];
  clients: Record<string, ClientAgg>;
  /** Úvodní klienti uzatváraného mesiaca bez zdroja (krok uzávierky „Odkiaľ prišli"). */
  bezZdroja: { mena: string[]; mesiac: string; otvor?: () => void };
  onNavigate?: (tab: string, sub?: string) => void;
  onZmena: () => void;
  /** Celý zoznam dopytov — komponent z Marketingu, aby sa nekreslil dvakrát inak. */
  VsetkyDopyty: React.ReactNode;
}) {
  const [bezi, setBezi] = useState("");
  const [chyba, setChyba] = useState("");
  const [vsetky, setVsetky] = useState(false);
  /**
   * TIE ISTÉ PRAVIDLÁ AKO OBRAZOVKA DOPYTY v Marketingu (`Dopyty.tsx`) —
   * dve definície „kto čaká" by si skôr či neskôr protirečili. Prvá verzia
   * karty brala každý dopyt so stavom „nový" a ukázala 27 ľudí od januára,
   * medzi nimi Hanusa aj Gericha, ktorí sú dávno klienti.
   *  • čas odpovede sa meria od 12. 8. 2026 (staršie dopyty pečiatku nemajú),
   *  • kto je už klient alebo má termín v kalendári, nečaká,
   *  • „prečo z toho nebol klient" sa pýta až pri dopyte bez výsledku;
   *    čerstvo dohodnutý (do 30 dní) to ešte nie je.
   */
  const menaKlientov = Object.keys(clients);
  const jeKlient = (l: { name: string }) => !!(l.name && najdiKlienta(menaKlientov, l.name));
  const dopyty = leads.filter((l) => (l.druh || "dopyt") === "dopyt" && l.date >= "2026-08-12");
  const cakaju = dopyty
    .filter((l) => l.status === "novy" && !l.odpovedaneAt && !jeKlient(l) && !maTermin(l.name || ""))
    .sort((a, b) => a.date.localeCompare(b.date));
  const bezVysledku = dopyty.filter((l) => {
    if (cakaju.includes(l) || jeKlient(l) || (l.dovod || "").trim() || maTermin(l.name || "")) return false;
    if (l.status === "dohodnuty" && (Date.now() - Date.parse(`${l.date}T12:00:00Z`)) / 86400000 <= 30) return false;
    return l.status !== "novy" || !!l.odpovedaneAt;
  });
  const dniOd = (d: string) => Math.max(0, Math.round((Date.now() - Date.parse(`${d}T00:00:00Z`)) / 86400000));

  const ozvalaSom = async (id: string) => {
    setBezi(id); setChyba("");
    const j = await posli("/api/leads", { akcia: "ozval-som-sa", id });
    setBezi("");
    if (!j.ok) { setChyba(j.error || "Nezapísalo sa."); return; }
    onZmena();
  };

  const prazdne = !cakaju.length && !bezVysledku.length && !bezZdroja.mena.length;
  return (
    <>
      {chyba && <div style={{ fontSize: 12, color: C.red }}>{chyba}</div>}
      {cakaju.length > 0 && <NadpisSekcie pocet={cakaju.length}>Čaká na odpoveď</NadpisSekcie>}
      {cakaju.map((l) => (
        <div key={l.id} style={riadok}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text, minWidth: 170 }}>{l.name || "(bez mena)"}</span>
          <span style={{ fontSize: 12, color: dniOd(l.date) > 1 ? C.orange : C.textDim, minWidth: 90 }}>
            {fmtDMY(l.date)}{dniOd(l.date) ? ` · ${dniOd(l.date)} d` : " · dnes"}
          </span>
          <span style={{ fontSize: 11.5, color: C.textMuted, flex: "1 1 200px" }}>
            {[l.source, l.telefon, l.email].filter(Boolean).join(" · ")}{l.note ? ` · ${l.note.slice(0, 60)}` : ""}
          </span>
          <button disabled={bezi === l.id} style={hlavne(bezi !== l.id)} onClick={() => void ozvalaSom(l.id)}>
            {bezi === l.id ? "…" : "Ozvala som sa"}
          </button>
        </div>
      ))}
      {bezVysledku.length > 0 && <NadpisSekcie pocet={bezVysledku.length}>Prečo z toho nebol klient</NadpisSekcie>}
      {bezVysledku.map((l) => (
        <div key={l.id} style={riadok}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text, minWidth: 170 }}>{l.name || "(bez mena)"}</span>
          <span style={{ fontSize: 12, color: C.textDim, minWidth: 90 }}>{fmtDMY(l.date)}</span>
          <span style={{ fontSize: 11.5, color: C.textMuted, flex: "1 1 200px" }}>
            {l.status === "neodpisal" ? "neodpísal" : l.status === "zruseny" ? "zrušený" : l.status === "dohodnuty" ? "dohodnutý, ale neprišiel" : "ozvala si sa, ďalej nič"} — dôvod chýba; doplň ho v zozname nižšie
          </span>
          <button style={vedlajsie} onClick={() => setVsetky(true)}>otvoriť zoznam</button>
        </div>
      ))}
      {bezZdroja.mena.length > 0 && (
        <>
          <NadpisSekcie pocet={bezZdroja.mena.length}>Odkiaľ prišli — uzávierka {bezZdroja.mesiac}</NadpisSekcie>
          <div style={{ ...riadok, alignItems: "flex-start" }}>
            <span style={{ fontSize: 12.5, color: C.text, flex: "1 1 300px", lineHeight: 1.55 }}>
              Úvodný tréning mali, zdroj nemajú: <b>{bezZdroja.mena.join(", ")}</b>.
            </span>
            {bezZdroja.otvor && <button style={hlavne(true)} onClick={bezZdroja.otvor}>Doplniť v Klientoch</button>}
          </div>
        </>
      )}
      {prazdne && <VsetkoVybavene text="Všetko vybavené — každému dopytu sa niekto ozval." />}
      <button
        onClick={() => setVsetky((v) => !v)}
        aria-expanded={vsetky}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", display: "block", width: "100%", textAlign: "left", marginTop: 10 }}
      >
        <NadpisSekcie pocet={dopyty.length}><span style={{ display: "inline-block", width: 14 }}>{vsetky ? "▾" : "▸"}</span>Všetky dopyty</NadpisSekcie>
      </button>
      {vsetky && VsetkyDopyty}
      {onNavigate && (
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
          Lievik a ceny za dopyt sú v <button style={{ ...vedlajsie, padding: "2px 6px" }} onClick={() => onNavigate("marketing", "lievik")}>Marketing → Lievik</button>
        </div>
      )}
    </>
  );
}

/* ───────────────────────── UZÁVIERKA MESIACA ─────────────────────────────── */

export type KrokUzavierkyKarta = {
  id: string; label: string; hotovo: boolean; detail: string;
  tab?: string; sub?: string; focus?: unknown;
};

/** Mesiac v tvare „september 2026". */
const nazovMesiaca = (mk: string) => {
  const m = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"][Number(mk.slice(5, 7)) - 1] || mk;
  return `${m} ${mk.slice(0, 4)}`;
};

/**
 * UZÁVIERKA MESIACA v jednej karte (beta, Jerry 5. 10. 2026: „na toto by si
 * mi vedel postaviť tiež jednotnú kartu").
 *
 * Kroky sú tie isté, aké stráži zámok v Údajoch (`krokyZamku` v App) — dva
 * zoznamy „čo je hotové" by sa rozišli. Pridané sú len dve veci:
 *  • KTO: „Odkiaľ prišli" je Terezkin krok (Jerry), ostatné Jerryho;
 *  • FIO CEZ API: „je to potrebné, keď je API?" Súbor netreba — mesiac sa
 *    stiahne tu, všetky pohyby (aj výdavky) sa zapíšu a zaradia podľa
 *    naučených pravidiel. Čo pravidlo nemá, zaradí sa v Banke.
 */
export function KrokUzavierka({ mesiac, kroky, prekazky, onNavigate, trener, onZmena }: {
  mesiac: string;
  kroky: KrokUzavierkyKarta[];
  prekazky: string[];
  onNavigate?: (tab: string, sub?: string, focus?: never) => void;
  trener: string | null;
  onZmena: () => void;
}) {
  const [zamknuty, setZamknuty] = useState<boolean | null>(null);
  const [bezi, setBezi] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [chyba, setChyba] = useState("");

  useEffect(() => {
    let zive = true;
    void fetch("/api/periods", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { periods?: { month: string; locked: boolean }[] }) => { if (zive) setZamknuty(!!(j.periods || []).find((p) => p.month === mesiac)?.locked); })
      .catch(() => { if (zive) setZamknuty(false); });
    return () => { zive = false; };
  }, [mesiac]);

  const kto = (id: string) => (id === "zdroje" ? "Terezka" : "Jerry");
  const viditelne = kroky.filter((k) => !trener || kto(k.id) === trener);
  const hotovych = viditelne.filter((k) => k.hotovo).length;

  const stiahniMesiac = async () => {
    setBezi("fio"); setChyba(""); setHlaska("");
    const od = `${mesiac}-01`;
    const [r, m] = mesiac.split("-").map(Number);
    const doDna = new Date(Date.UTC(r, m, 0)).toISOString().slice(0, 10);
    const j = await posli("/api/fio", { akcia: "stiahni", od, do: doDna });
    if (!j.ok) { setBezi(""); setChyba(String(j.chyba || j.error || "Fio sa nestiahlo.")); return; }
    type R = { suma: number; uzMame?: boolean; zamknuty?: boolean; kategoria?: string };
    const riadky = (Array.isArray(j.riadky) ? j.riadky : []) as R[];
    const nove = riadky.filter((x) => !x.uzMame && !x.zamknuty);
    if (nove.length) {
      const z = await posli("/api/fio", { akcia: "zapis", riadky: nove });
      if (!z.ok) { setBezi(""); setChyba(String(z.error || "Pohyby sa nezapísali.")); return; }
    }
    setBezi("");
    const nezaradene = nove.filter((x) => !x.kategoria).length;
    setHlaska(nove.length
      ? `Zapísané ${nove.length} pohybov za ${nazovMesiaca(mesiac)}${nezaradene ? `, ${nezaradene} bez kategórie — zaraď ich v Banke` : ", všetky majú kategóriu"}.`
      : `Za ${nazovMesiaca(mesiac)} je z Fio všetko v Kokpite.`);
    oznam("peniaze");
    onZmena();
  };

  const zamkni = async () => {
    setBezi("zamok"); setChyba("");
    const j = await posli("/api/periods", { month: mesiac, locked: true, note: "zamknuté z Workspace" });
    setBezi("");
    if (!j.ok) { setChyba(j.error || "Mesiac sa nezamkol."); return; }
    setZamknuty(true);
    oznam("peniaze");
    onZmena();
  };

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", margin: "2px 0 8px" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{nazovMesiaca(mesiac)}</span>
        <span style={{ fontSize: 12, color: zamknuty ? C.green : C.textMuted }}>
          {zamknuty ? "zamknutý ✓" : `${hotovych} z ${viditelne.length} hotovo`}
        </span>
      </div>
      {chyba && <div style={{ fontSize: 12, color: C.red, marginBottom: 6 }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12, color: C.green, marginBottom: 6 }}>{hlaska}</div>}
      {viditelne.map((k) => (
        <div key={k.id} style={riadok}>
          <span style={{ width: 20, fontSize: 14, color: k.hotovo ? C.green : C.textDim }}>{k.hotovo ? "✓" : "○"}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, minWidth: 170 }}>
            {k.id === "fio" ? "Fio — stiahnuté a zaradené" : k.id === "ptminder" ? "PTminder (kým beží súbežne)" : k.label}
          </span>
          <span style={{ fontSize: 11.5, color: k.hotovo ? C.textDim : C.textMuted, flex: "1 1 220px" }}>{k.detail}</span>
          {!trener && <span style={{ fontSize: 11, color: C.textDim, minWidth: 54 }}>{kto(k.id)}</span>}
          {k.id === "fio" && (
            <button disabled={!!bezi} style={hlavne(!bezi)} onClick={() => void stiahniMesiac()}>
              {bezi === "fio" ? "sťahujem…" : "Stiahnuť mesiac z Fio"}
            </button>
          )}
          {k.tab && onNavigate && (
            <button style={vedlajsie} onClick={() => onNavigate(k.tab as string, k.sub, k.focus as never)}>otvoriť</button>
          )}
        </div>
      ))}
      {(!trener || trener === "Jerry") && !zamknuty && (
        <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button disabled={!!bezi || prekazky.length > 0} style={hlavne(!bezi && !prekazky.length)} onClick={() => void zamkni()}>
            {bezi === "zamok" ? "…" : `Zamknúť ${nazovMesiaca(mesiac)}`}
          </button>
          {prekazky.length > 0 && <span style={{ fontSize: 11.5, color: C.textMuted }}>Ešte chýba: {prekazky.join(", ")}.</span>}
        </div>
      )}
    </>
  );
}

/* ───────────────────────── MESAČNÉ KONTROLY ──────────────────────────────── */

export type KontrolaKarta = { id: string; nadpis: string; detail: string; splatne: boolean; ciel: { tab: string; sub?: string } };

/**
 * MESAČNÉ KONTROLY v jednej karte (beta, Jerry 5. 10. 2026). Štyri oblasti,
 * každá v inom týždni mesiaca (`ritualy` → druh „kontrola"). Odškrtnutie
 * zapíše ten istý kľúč ako register na Dnes (`zapis|<id>`), takže karta
 * a pripomienka sa nemôžu rozísť.
 */
export function KrokKontroly({ kontroly, acks, onNavigate, onZmena }: {
  kontroly: KontrolaKarta[];
  acks: Record<string, unknown>;
  onNavigate?: (tab: string, sub?: string) => void;
  onZmena: () => void;
}) {
  const [bezi, setBezi] = useState("");
  const [chyba, setChyba] = useState("");
  const [hotove, setHotove] = useState<Set<string>>(new Set());
  const jeHotova = (k: KontrolaKarta) => !!acks[`zapis|${k.id}`] || hotove.has(k.id);

  const odskrtni = async (k: KontrolaKarta) => {
    setBezi(k.id); setChyba("");
    const j = await posli("/api/anomaly", { key: `zapis|${k.id}`, ack: true, note: "skontrolované z Workspace" });
    setBezi("");
    if (!j.ok) { setChyba(j.error || "Nezapísalo sa."); return; }
    setHotove((s) => new Set([...s, k.id]));
    onZmena();
  };

  return (
    <>
      {chyba && <div style={{ fontSize: 12, color: C.red }}>{chyba}</div>}
      {kontroly.map((k, i) => {
        const hotova = jeHotova(k);
        return (
          <div key={k.id} style={{ ...riadok, alignItems: "flex-start", opacity: hotova ? 0.6 : 1 }}>
            <span style={{ width: 20, fontSize: 14, color: hotova ? C.green : k.splatne ? C.orange : C.textDim }}>{hotova ? "✓" : "○"}</span>
            <div style={{ flex: "1 1 340px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                {k.nadpis.replace(/^Mesačná kontrola: /, "")}
                <span style={{ fontSize: 11, fontWeight: 500, color: k.splatne && !hotova ? C.orange : C.textDim, marginLeft: 8 }}>
                  {i + 1}. týždeň mesiaca{k.splatne && !hotova ? " — teraz" : ""}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.55, marginTop: 2 }}>{k.detail}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {onNavigate && <button style={vedlajsie} onClick={() => onNavigate(k.ciel.tab, k.ciel.sub)}>otvoriť</button>}
              {!hotova && (
                <button disabled={bezi === k.id} style={hlavne(bezi !== k.id)} onClick={() => void odskrtni(k)}>
                  {bezi === k.id ? "…" : "Skontrolované"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
