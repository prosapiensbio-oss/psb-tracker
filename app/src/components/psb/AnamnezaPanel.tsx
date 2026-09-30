import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { doSchranky } from "../../lib/psb/kopirovanie";
import { oznam } from "../../lib/psb/obnovaSignal";
import { OBLASTI, zobrazit, type Formular, type Otazka, type Sekcia } from "../../lib/psb/anamnezaFormular";
import { C, mix } from "../../lib/psb/theme";

/**
 * ANAMNÉZA — JEDNA SEKCIA NA OKNO.
 *
 * Jerry, 30. 9. 2026: „príde mi to také nevýrazné, že keď to budem vypĺňať,
 * ťažšie sa v tom orientujem." Príčina nebola vo farbách: tridsať polí pod
 * sebou vyzerá rovnako dôležito, oko nemá kam sadnúť a človek nevie, kde
 * v tom je.
 *
 * Prvý pokus bral otázky po jednej (návrh „rozhovor", ktorý si vybral).
 * Jerry ho o hodinu neskôr upresnil: „nemôže byť v jednom okne jedna
 * otázka, daj mi celú kategóriu otázok na jedno okno." Má pravdu a dôvod
 * je praktický: anamnéza sa vypĺňa PRI klientovi, kde sa jedna odpoveď
 * odvíja od druhej — kto počas rozprávania doplní niečo o dve otázky
 * späť, nemá sa preklikávať.
 *
 * Orientácia teda stojí na tom istom, len o úroveň vyššie:
 *
 *   • NA OKNE JE PRÁVE JEDNA SEKCIA — nie celá anamnéza a nie jedno pole.
 *   • VĽAVO REBRÍK SEKCIÍ s počtom vyplnených — vidno, kde si a čo chýba.
 *   • KONTEXT (klient, odkaz preň, test postury) stojí bokom po celý čas,
 *     nie medzi otázkami.
 */

type Oblast = { oblast: string; sila: number | null };
type Odpovede = Record<string, unknown>;

type Stav = {
  formular: Formular;
  anamneza: {
    stav: string; token: string;
    klientOdpovede: Odpovede; zapisOdpovede: Odpovede;
    suhlasy: Record<string, unknown>;
    klientVyplnilAt: string | null; zapisAt: string | null;
  } | null;
  predvyplnene: {
    hodnoty: Odpovede;
    odkial: Record<string, string>;
    test: { oblasti: string[]; odchylky: string[]; vzorec: string; kedy: string } | null;
  };
  odkaz: string | null;
};

const jeOblasti = (x: unknown): x is Oblast[] =>
  Array.isArray(x) && x.every((o) => !!o && typeof o === "object" && "oblast" in (o as object));

const denCz = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}` : "");

/** Odpoveď ako jedna čitateľná veta — do prehľadu na konci. */
function akoText(o: Otazka, v: unknown): string {
  if (v == null || v === "") return "";
  if (o.typ === "oblasti" && jeOblasti(v)) {
    return v.map((x) => (x.sila == null ? x.oblast : `${x.oblast} ${x.sila}/10`)).join(" · ");
  }
  if (Array.isArray(v)) return v.join(", ");
  if (o.typ === "skala") return `${v}/10`;
  return String(v);
}

const maOdpoved = (o: Otazka, v: unknown): boolean => akoText(o, v).length > 0;

export function AnamnezaPanel({ meno }: { meno: string }) {
  const [stav, setStav] = useState<Stav | null>(null);
  const [odp, setOdp] = useState<Odpovede>({});
  /** Index sekcie. `=== počet sekcií` znamená záverečný prehľad. */
  const [i, setI] = useState(0);
  const [bezi, setBezi] = useState(false);
  const [hlaska, setHlaska] = useState("");
  const [chyba, setChyba] = useState("");
  const [skopirovane, setSkopirovane] = useState(false);
  /** Pôvodná anamnéza z Google Forms — otvára sa cez rebrík, na čítanie. */
  const [archivOtvoreny, setArchivOtvoreny] = useState(false);
  /**
   * Kým sa políčok nikto nedotkol, draft zrkadlí prichádzajúce dáta — inak
   * by neskorší fetch prepísal rozpísaný zápis (pravidlo z 29. 8. 2026).
   */
  const dotknute = useRef(false);
  /** Je čo uložiť? Presun na inú sekciu to uloží sám. */
  const neulozene = useRef(false);
  /** Telo sekcie — pri prepnutí sa roluje späť hore. */
  const telo = useRef<HTMLDivElement | null>(null);

  const nacitaj = useCallback(async () => {
    const r = await fetch(`/api/anamneza?klient=${encodeURIComponent(meno)}`, { credentials: "same-origin" })
      .then((x) => x.json()).catch(() => null) as (Stav & { ok?: boolean; error?: string }) | null;
    if (!r?.ok) { setChyba(r?.error || "Anamnézu sa nepodarilo načítať."); return; }
    setStav(r);
    if (!dotknute.current) setOdp({ ...r.predvyplnene.hodnoty, ...(r.anamneza?.zapisOdpovede || {}) });
  }, [meno]);

  useEffect(() => {
    dotknute.current = false; neulozene.current = false;
    setStav(null); setOdp({}); setI(0); setHlaska(""); setChyba("");
    void nacitaj();
  }, [nacitaj]);

  /**
   * Sekcie s otázkami, ktoré sa pri týchto odpovediach majú ukázať.
   * Vetvenie sa prepočítava zakaždým — odpoveď „Ano" pri tehotenstve
   * otvorí ďalšiu otázku hneď, bez prepnutia okna.
   */
  const sekcie = useMemo(() => {
    if (!stav) return [] as { s: Sekcia; otazky: Otazka[] }[];
    return stav.formular.zapis
      .map((s) => ({
        s,
        // Test postury nie je otázka, je to výstup — patrí do stĺpca vedľa.
        otazky: s.otazky.filter((o) => o.typ !== "len-citat" && zobrazit(o, odp)),
      }))
      .filter((x) => x.otazky.length > 0);
  }, [stav, odp]);

  const uloz = useCallback(async (ticho: boolean) => {
    if (!ticho) { setBezi(true); setChyba(""); setHlaska(""); }
    const r = await fetch("/api/anamneza", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "zapis", klient: meno, odpovede: odp }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    if (!ticho) setBezi(false);
    if (!r?.ok) { setChyba(r?.error || "Zápis sa neuložil."); return false; }
    neulozene.current = false;
    if (!ticho) {
      setHlaska("Uložené.");
      dotknute.current = false;
      oznam("klienti");
      await nacitaj();
    }
    return true;
  }, [meno, odp, nacitaj]);

  /**
   * Prepnutie sekcie. Rozpísané sa uloží po ceste — nič sa nestratí ani
   * vtedy, keď človek uprostred odskočí inam.
   *
   * `kam` je FUNKCIA z aktuálneho indexu, nie číslo: dve kliknutia v tom
   * istom tiku by sa inak obe počítali zo starého `i`.
   */
  const chod = useCallback((kam: number | ((p: number) => number)) => {
    setI((p) => {
      const ciel = typeof kam === "function" ? kam(p) : kam;
      const novy = Math.max(0, Math.min(sekcie.length, ciel));
      if (novy !== p && neulozene.current) void uloz(true);
      return novy;
    });
    setHlaska("");
    if (telo.current) telo.current.scrollTop = 0;
  }, [sekcie.length, uloz]);

  const zmen = (id: string, v: unknown) => {
    dotknute.current = true;
    neulozene.current = true;
    setOdp((p) => ({ ...p, [id]: v }));
  };

  const vyrobOdkaz = async () => {
    setBezi(true); setChyba("");
    const r = await fetch("/api/anamneza", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "odkaz", klient: meno }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setBezi(false);
    if (!r?.ok) { setChyba(r?.error || "Odkaz sa nepodarilo vyrobiť."); return; }
    oznam("klienti");
    await nacitaj();
  };

  if (chyba && !stav) return <div style={{ fontSize: 12.5, color: C.red, padding: "10px 2px" }}>{chyba}</div>;
  if (!stav) return <div style={{ fontSize: 12.5, color: C.textDim, padding: "10px 2px" }}>Načítavam…</div>;

  const a = stav.anamneza;
  const test = stav.predvyplnene.test;
  const koniec = i >= sekcie.length;
  const teraz = sekcie[i];

  const vsetky = sekcie.flatMap((x) => x.otazky);
  const vyplnenych = vsetky.filter((o) => maOdpoved(o, odp[o.id])).length;

  /**
   * Pôvodná anamnéza z Google Forms, keď sa k tomuto klientovi preniesla.
   * Otázky, ktoré dnešný formulár nemá („ochotní obetovať", stará ponuka
   * cieľov, intenzita bolesti bez miesta), sa nemapovali — ležia tu.
   * Bez tejto obrazovky by boli v databáze a nikde inde.
   */
  const archiv = odp._archiv as { kedy: string; polozky: [string, string][] } | undefined;

  return (
    <div style={{ display: "flex", gap: 18, minHeight: 470, height: "100%" }}>

      {/* ── REBRÍK SEKCIÍ A KONTEXT ── */}
      <div style={{ width: 216, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, borderRight: `1px solid ${mix(C.border, 60)}`, paddingRight: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {sekcie.map((x, idx) => {
            const hotovych = x.otazky.filter((o) => maOdpoved(o, odp[o.id])).length;
            const cela = hotovych === x.otazky.length;
            const jeTu = !koniec && !archivOtvoreny && idx === i;
            return (
              <button
                key={x.s.id}
                onClick={() => { setArchivOtvoreny(false); chod(idx); }}
                style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "8px 8px", borderRadius: 8,
                  border: "none", background: jeTu ? mix(C.accent, 14) : "transparent",
                  color: jeTu ? C.text : C.textMuted, fontSize: 12.5, textAlign: "left",
                  cursor: "pointer", fontFamily: "inherit", width: "100%",
                }}
              >
                <span style={{
                  width: 17, height: 17, flexShrink: 0, borderRadius: "50%", fontSize: 9.5, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1.5px solid ${cela ? C.green : jeTu ? C.accent : mix(C.border, 90)}`,
                  background: jeTu ? C.accent : "transparent",
                  color: cela ? C.green : C.onAccent,
                }}>{cela ? "✓" : ""}</span>
                <span style={{ flexGrow: 1, minWidth: 0 }}>{x.s.nazov}</span>
                <span style={{ fontSize: 10, color: C.textDim, fontVariantNumeric: "tabular-nums" }}>{hotovych}/{x.otazky.length}</span>
              </button>
            );
          })}
          {archiv && (
            <button
              onClick={() => setArchivOtvoreny((x) => !x)}
              style={{
                display: "flex", alignItems: "center", gap: 9, padding: "8px 8px", borderRadius: 8, marginTop: 4,
                border: "none", background: archivOtvoreny ? mix(C.accent, 14) : "transparent",
                color: archivOtvoreny ? C.text : C.textDim, fontSize: 12.5, textAlign: "left",
                cursor: "pointer", fontFamily: "inherit", width: "100%",
              }}
            >
              <span style={{ width: 17, flexShrink: 0 }} />
              <span style={{ flexGrow: 1, minWidth: 0 }}>Pôvodná z Google Forms</span>
              <span style={{ fontSize: 10, color: C.textDim }}>{archiv.polozky.length}</span>
            </button>
          )}
          <button
            onClick={() => { setArchivOtvoreny(false); chod(sekcie.length); }}
            style={{
              display: "flex", alignItems: "center", gap: 9, padding: "8px 8px", borderRadius: 8, marginTop: 4,
              border: "none", background: koniec && !archivOtvoreny ? mix(C.accent, 14) : "transparent",
              color: koniec && !archivOtvoreny ? C.text : C.textDim, fontSize: 12.5, textAlign: "left",
              cursor: "pointer", fontFamily: "inherit", width: "100%",
            }}
          >
            <span style={{ width: 17, flexShrink: 0 }} />
            <span>Prehľad a uloženie</span>
          </button>
        </div>

        {/* Odkaz pre klienta — patrí ku kontextu, nie medzi otázky. */}
        <div style={{ padding: "10px 12px", borderRadius: 9, background: mix(C.border, 40) }}>
          <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", color: C.textDim }}>Pred úvodným</div>
          {!stav.odkaz ? (
            <button onClick={() => void vyrobOdkaz()} disabled={bezi} style={{ ...maleTlacidlo, borderColor: mix(C.green, 45), color: C.green, marginTop: 7 }}>
              {bezi ? "…" : "Vyrobiť odkaz"}
            </button>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: a?.klientVyplnilAt ? C.green : C.textMuted, marginTop: 5, lineHeight: 1.5 }}>
                {a?.klientVyplnilAt ? `Klient vyplnil ${denCz(a.klientVyplnilAt)}` : "Klient zatiaľ nevyplnil"}
              </div>
              <button
                onClick={() => void doSchranky(stav.odkaz || "").then((ok) => { setSkopirovane(ok); if (!ok) setChyba("Skopíruj odkaz ručne — schránka odmietla."); })}
                style={{ ...maleTlacidlo, marginTop: 7 }}
              >{skopirovane ? "skopírované" : "Kopírovať odkaz"}</button>
            </>
          )}
        </div>

        {/* Výstup testu postury — kontext po celý čas, nie otázka. */}
        {test && (test.odchylky.length > 0 || test.vzorec) && (
          <div style={{ padding: "10px 12px", borderRadius: 9, background: mix(C.accent, 8), borderLeft: `2px solid ${C.accent}` }}>
            <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", color: C.accentLight }}>
              Test postury{test.kedy ? ` · ${denCz(test.kedy)}` : ""}
            </div>
            <div style={{ fontSize: 11.5, color: C.text, marginTop: 5, lineHeight: 1.55 }}>
              {test.odchylky.length > 0 && <>{test.odchylky.join(", ")}<br /></>}
              {test.vzorec && <b>{test.vzorec}</b>}
            </div>
          </div>
        )}

        <div style={{ marginTop: "auto", fontSize: 10.5, color: C.textDim, lineHeight: 1.6 }}>
          Zdravotné odpovede sú v databáze zašifrované — vidíš ich len ty.
        </div>
      </div>

      {/* ── CELÁ SEKCIA NA JEDNO OKNO ── */}
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>

        {archivOtvoreny && archiv ? (
          <>
            <div style={{ paddingBottom: 14, borderBottom: `1px solid ${mix(C.border, 60)}` }}>
              <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.textDim }}>
                Len na čítanie{archiv.kedy ? ` · vyplnené ${denCz(archiv.kedy)}` : ""}
              </div>
              <div style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.3, marginTop: 5 }}>Pôvodná anamnéza</div>
              <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 6, lineHeight: 1.6, maxWidth: "62ch" }}>
                Otázky zo starého formulára v Google Forms, ktoré dnešná anamnéza nemá — preto sa neprepísali do polí vyššie.
                Zvyšok odpovedí je rozpísaný v sekciách.
              </div>
            </div>
            <div ref={telo} style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", paddingTop: 14 }}>
              {archiv.polozky.map(([otazka, odpoved]) => (
                <div key={otazka} style={{ display: "flex", gap: 14, alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${mix(C.border, 40)}` }}>
                  <span style={{ width: 210, flexShrink: 0, fontSize: 11.5, color: C.textDim, lineHeight: 1.45 }}>{otazka}</span>
                  <span style={{ flexGrow: 1, minWidth: 0, fontSize: 13, color: C.text, lineHeight: 1.55 }}>{odpoved}</span>
                </div>
              ))}
            </div>
          </>
        ) : koniec ? (
          <>
            <div style={{ paddingBottom: 14, borderBottom: `1px solid ${mix(C.border, 60)}` }}>
              <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: -0.3 }}>Prejdené. Skontroluj a ulož.</div>
              <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 5 }}>
                Klikni na ktorýkoľvek riadok, keď chceš niečo prepísať. Prázdne sa doplniť dá aj neskôr.
              </div>
            </div>
            <div ref={telo} style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", paddingTop: 12 }}>
              {sekcie.map((x, idx) => (
                <div key={x.s.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.textDim, marginBottom: 7 }}>{x.s.nazov}</div>
                  {x.otazky.map((o) => {
                    const v = akoText(o, odp[o.id]);
                    return (
                      <button
                        key={o.id}
                        onClick={() => chod(idx)}
                        style={{
                          display: "flex", gap: 14, alignItems: "baseline", width: "100%", textAlign: "left",
                          padding: "6px 0", border: "none", borderBottom: `1px solid ${mix(C.border, 40)}`,
                          background: "none", cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        <span style={{ width: 178, flexShrink: 0, fontSize: 11.5, color: C.textDim, lineHeight: 1.45 }}>{o.text}</span>
                        <span style={{ flexGrow: 1, minWidth: 0, fontSize: 13, color: v ? C.text : C.textDim, fontStyle: v ? "normal" : "italic", lineHeight: 1.5 }}>
                          {v || "prázdne"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ paddingBottom: 14, borderBottom: `1px solid ${mix(C.border, 60)}` }}>
              <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.textDim }}>
                Sekcia {i + 1} z {sekcie.length}
              </div>
              <div style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.3, marginTop: 5 }}>{teraz.s.nazov}</div>
              {teraz.s.pozn && (
                <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 6, lineHeight: 1.6, maxWidth: "62ch" }}>{teraz.s.pozn}</div>
              )}
            </div>

            <div ref={telo} style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", paddingTop: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 680 }}>
                {teraz.otazky.map((o, idx) => (
                  <div key={o.id}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{o.text}</span>
                      {stav.predvyplnene.odkial[o.id] && (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "2px 8px", borderRadius: 6, background: mix(C.green, 16), color: C.green, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                          {stav.predvyplnene.odkial[o.id]}
                        </span>
                      )}
                    </div>
                    {o.pomoc && (
                      <div style={{ fontSize: 11.5, color: C.textDim, marginBottom: 7, lineHeight: 1.55, maxWidth: "58ch" }}>{o.pomoc}</div>
                    )}
                    <Pole o={o} hodnota={odp[o.id]} prve={idx === 0} onZmen={(v) => zmen(o.id, v)} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* posun medzi sekciami */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 13, borderTop: `1px solid ${mix(C.border, 60)}`, flexWrap: "wrap" }}>
          {koniec ? (
            <button onClick={() => void uloz(false)} disabled={bezi} style={{ ...velkeTlacidlo, background: mix(C.green, 16), borderColor: mix(C.green, 55), color: C.green }}>
              {bezi ? "Ukladám…" : "Uložiť zápis"}
            </button>
          ) : (
            <button onClick={() => chod((p) => p + 1)} style={velkeTlacidlo}>
              {i === sekcie.length - 1 ? "Na prehľad" : "Ďalšia sekcia"}
            </button>
          )}
          {i > 0 && <button onClick={() => chod((p) => p - 1)} style={{ ...maleTlacidlo, border: "none" }}>späť</button>}
          {!koniec && (
            <button onClick={() => void uloz(false)} disabled={bezi} style={maleTlacidlo}>Uložiť priebežne</button>
          )}
          <div style={{ flexGrow: 1 }} />
          {hlaska && <span style={{ fontSize: 12, color: C.green }}>{hlaska}</span>}
          {chyba && <span style={{ fontSize: 12, color: C.red }}>{chyba}</span>}
          <span style={{ fontSize: 11.5, color: C.textDim, fontVariantNumeric: "tabular-nums" }}>
            {vyplnenych} z {vsetky.length} vyplnených
          </span>
          <div style={{ width: 120, height: 4, borderRadius: 3, background: mix(C.border, 90), overflow: "hidden" }}>
            <div style={{ width: `${vsetky.length ? (vyplnenych / vsetky.length) * 100 : 0}%`, height: "100%", background: C.accent }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Šírka políčok na písanie.
 *
 * Jerry, 30. 9. 2026: „tie okná na písanie daj o polovicu menšie."
 * Boli na celú šírku stĺpca (680 px) a dve zbytočné veci robili naraz:
 * riadok textu sa tiahol cez celé okno, takže sa horšie čítal, a prázdne
 * pole vyzeralo ako veľa práce. Polovica stačí — a dlhý text sa aj tak
 * zmestí, lebo výška políčka rastie s obsahom.
 */
const SIRKA_PISANIA = 340;
/**
 * Voľné pole začína NA JEDNOM RIADKU a rastie s textom (Jerry, 30. 9. 2026:
 * „myslím výšku tých okien o polovicu zmenši"). Prázdna anamnéza tak nie je
 * stena prázdnych obdĺžnikov a vidno viac otázok naraz; kto píše odstavec,
 * dostane miesto sám od seba. Strop je tu preto, aby jedna dlhá odpoveď
 * neodtlačila zvyšok sekcie mimo obrazovku.
 */
const MAX_VYSKA = 150;

/** Ovládanie jednej otázky. Veľké natoľko, aby sa dalo trafiť bez pozerania. */
function Pole({ o, hodnota, prve, onZmen }: { o: Otazka; hodnota: unknown; prve: boolean; onZmen: (v: unknown) => void }) {
  const vstup = {
    padding: "6px 10px", borderRadius: 8, fontSize: 14, fontFamily: "inherit",
    border: `1px solid ${C.border}`, background: C.bg, color: C.text, boxSizing: "border-box" as const,
  };

  /** Prispôsobí výšku obsahu — bez toho by nízke pole dlhý text orezalo. */
  const rast = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_VYSKA)}px`;
  };

  if (o.typ === "oblasti") {
    const vybrane: Oblast[] = jeOblasti(hodnota) ? hodnota : [];
    const prepni = (m: string) => {
      const je = vybrane.some((x) => x.oblast === m);
      onZmen(je ? vybrane.filter((x) => x.oblast !== m) : [...vybrane, { oblast: m, sila: null }]);
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {OBLASTI.map((m) => {
            const je = vybrane.some((x) => x.oblast === m);
            return <button key={m} onClick={() => prepni(m)} style={pilulka(je)}>{m}</button>;
          })}
        </div>
        {/* Jedna oblasť = jedna stupnica. Tri zaškrtnuté = tri stupnice. */}
        {vybrane.map((x) => (
          <div key={x.oblast}>
            <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 5 }}>
              <b style={{ color: C.text }}>{x.oblast}</b> — ako silné, keď je to najhoršie?
            </div>
            <Stupnica
              hodnota={x.sila}
              onZmen={(n) => onZmen(vybrane.map((y) => (y.oblast === x.oblast ? { ...y, sila: n } : y)))}
            />
          </div>
        ))}
      </div>
    );
  }

  if (o.typ === "viac") {
    const vybrane = Array.isArray(hodnota) ? (hodnota as string[]) : [];
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(o.moznosti || []).map((m) => {
          const je = vybrane.includes(m);
          return (
            <button key={m} onClick={() => onZmen(je ? vybrane.filter((x) => x !== m) : [...vybrane, m])} style={pilulka(je)}>{m}</button>
          );
        })}
      </div>
    );
  }

  if (o.typ === "jedna" || o.typ === "ano-nie") {
    const moznosti = o.typ === "ano-nie" ? ["Ano", "Ne"] : (o.moznosti || []);
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {moznosti.map((m) => (
          <button key={m} onClick={() => onZmen(hodnota === m ? "" : m)} style={pilulka(hodnota === m)}>{m}</button>
        ))}
      </div>
    );
  }

  if (o.typ === "skala") {
    return <Stupnica hodnota={typeof hodnota === "number" ? hodnota : null} onZmen={(n) => onZmen(n)} />;
  }

  if (o.typ === "dlhy") {
    return (
      <textarea
        ref={rast}
        value={String(hodnota ?? "")}
        onChange={(e) => { rast(e.target); onZmen(e.target.value); }}
        rows={1}
        autoFocus={prve}
        placeholder="píš…"
        style={{ ...vstup, width: "100%", maxWidth: SIRKA_PISANIA, resize: "vertical", lineHeight: 1.45, overflow: "hidden" }}
      />
    );
  }

  return (
    <input
      type={o.typ === "cislo" ? "number" : o.typ === "datum" ? "date" : "text"}
      value={String(hodnota ?? "")}
      onChange={(e) => onZmen(o.typ === "cislo" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
      autoFocus={prve}
      style={{ ...vstup, width: o.typ === "cislo" ? 90 : "100%", maxWidth: SIRKA_PISANIA, colorScheme: "dark" }}
    />
  );
}

function Stupnica({ hodnota, onZmen }: { hodnota: number | null; onZmen: (n: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {Array.from({ length: 11 }, (_, n) => {
        const je = hodnota === n;
        return (
          <button
            key={n}
            onClick={() => onZmen(n)}
            style={{
              width: 36, height: 34, borderRadius: 8, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${je ? mix(C.accent, 60) : C.border}`,
              background: je ? C.accent : "transparent",
              color: je ? C.onAccent : C.textMuted, fontWeight: je ? 700 : 400,
            }}
          >{n}</button>
        );
      })}
    </div>
  );
}

const pilulka = (je: boolean) => ({
  padding: "7px 14px", borderRadius: 9, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
  border: `1.5px solid ${je ? mix(C.accent, 60) : C.border}`,
  background: je ? mix(C.accent, 16) : "transparent",
  color: je ? C.accentLight : C.textMuted,
  fontWeight: je ? 600 : 400,
});

const velkeTlacidlo = {
  padding: "9px 20px", borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  border: `1px solid ${mix(C.accent, 55)}`, background: mix(C.accent, 14), color: C.accentLight,
};

const maleTlacidlo = {
  padding: "5px 11px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
};
