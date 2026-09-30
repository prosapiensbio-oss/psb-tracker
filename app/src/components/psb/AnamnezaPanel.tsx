import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { doSchranky } from "../../lib/psb/kopirovanie";
import { oznam } from "../../lib/psb/obnovaSignal";
import { OBLASTI, zobrazit, type Formular, type Otazka, type Sekcia } from "../../lib/psb/anamnezaFormular";
import { C, mix } from "../../lib/psb/theme";

/**
 * ANAMNÉZA — JEDNA OTÁZKA NARAZ.
 *
 * Jerry, 30. 9. 2026: „príde mi to také nevýrazné, že keď to budem vypĺňať,
 * ťažšie sa v tom orientujem." Mal pravdu a príčina nebola vo farbách:
 * tridsať polí pod sebou vyzerá rovnako dôležito, takže oko nemá kam sadnúť
 * a človek nevie, kde v tom je.
 *
 * Zo troch návrhov si vybral rozhovor (30. 9. 2026). Orientácia stojí na
 * troch veciach a každá rieši inú polovicu problému:
 *
 *   • NA OBRAZOVKE JE PRÁVE JEDNA OTÁZKA — niet sa kam stratiť.
 *   • VĽAVO REBRÍK SEKCIÍ s počtom vyplnených — vidno, kde si a koľko ešte.
 *   • HORE PREPIS ODPOVEDANÉHO, drobným — vidno, čo je za tebou, a dá sa
 *     tam kliknúť späť.
 *
 * Kontext, ktorý treba mať pri ruke počas celého vypĺňania (klient, odkaz
 * pre neho, výstup testu postury), je v ľavom stĺpci — nie vo fronte otázok.
 * Test postury sa preto NEPÝTA; je to výstup, ktorý appka klientovi poslala.
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

/** Odpoveď ako jedna čitateľná veta — do prepisu aj do prehľadu na konci. */
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
  const [i, setI] = useState(0);
  const [bezi, setBezi] = useState(false);
  const [hlaska, setHlaska] = useState("");
  const [chyba, setChyba] = useState("");
  const [skopirovane, setSkopirovane] = useState(false);
  /**
   * Kým sa políčok nikto nedotkol, draft zrkadlí prichádzajúce dáta — inak
   * by neskorší fetch prepísal rozpísaný zápis (pravidlo z 29. 8. 2026).
   */
  const dotknute = useRef(false);
  /** Je čo uložiť? Presun na inú otázku to uloží sám. */
  const neulozene = useRef(false);

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

  /** Otázky v jednom rade — vetvenie sa prepočítava z aktuálnych odpovedí. */
  const rad = useMemo(() => {
    if (!stav) return [] as { sekcia: Sekcia; o: Otazka }[];
    return stav.formular.zapis.flatMap((s) =>
      s.otazky
        // Test postury nie je otázka, je to výstup — patrí do stĺpca vedľa.
        .filter((o) => o.typ !== "len-citat" && zobrazit(o, odp))
        .map((o) => ({ sekcia: s, o })));
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
   * Posun v rade. Čo je rozpísané, sa uloží po ceste — nič sa nestratí.
   *
   * `kam` je FUNKCIA z aktuálneho indexu, nie číslo: dve kliknutia v tom
   * istom tiku by sa inak obe počítali zo starého `i` a posunuli o jedno.
   */
  const chod = useCallback((kam: number | ((p: number) => number)) => {
    setI((p) => {
      const ciel = typeof kam === "function" ? kam(p) : kam;
      const novy = Math.max(0, Math.min(rad.length, ciel));
      if (novy !== p && neulozene.current) void uloz(true);
      return novy;
    });
    setHlaska("");
  }, [rad.length, uloz]);
  const dalej = useCallback(() => chod((p) => p + 1), [chod]);
  const spat = useCallback(() => chod((p) => p - 1), [chod]);

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
  const hotovo = i >= rad.length;
  const teraz = rad[i];
  const vyplnenych = rad.filter((x) => maOdpoved(x.o, odp[x.o.id])).length;

  /** Sekcie s počtom vyplnených — rebrík vľavo. */
  const sekcie = stav.formular.zapis.map((s) => {
    const moje = rad.filter((x) => x.sekcia.id === s.id);
    const hotovych = moje.filter((x) => maOdpoved(x.o, odp[x.o.id])).length;
    return {
      s, hotovych, spolu: moje.length,
      prvy: rad.findIndex((x) => x.sekcia.id === s.id),
      jeTu: !hotovo && teraz?.sekcia.id === s.id,
      cela: moje.length > 0 && hotovych === moje.length,
    };
  });

  /** Čo je za tebou — posledné tri odpovedané, na preklik späť. */
  const prepis = rad
    .slice(0, i)
    .map((x, idx) => ({ ...x, idx }))
    .filter((x) => maOdpoved(x.o, odp[x.o.id]))
    .slice(-3);

  return (
    <div
      style={{ display: "flex", gap: 18, minHeight: 470, height: "100%" }}
      onKeyDown={(e) => {
        // Enter posúva ďalej. V dlhom texte robí nový riadok, tam je to cmd+Enter.
        if (e.key !== "Enter") return;
        const dlhy = (e.target as HTMLElement).tagName === "TEXTAREA";
        if (dlhy && !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        dalej();
      }}
    >
      {/* ── REBRÍK SEKCIÍ A KONTEXT ── */}
      <div style={{ width: 216, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, borderRight: `1px solid ${mix(C.border, 60)}`, paddingRight: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {sekcie.map((x) => (
            <button
              key={x.s.id}
              onClick={() => x.prvy >= 0 && chod(x.prvy)}
              style={{
                display: "flex", alignItems: "center", gap: 9, padding: "7px 8px", borderRadius: 8,
                border: "none", background: x.jeTu ? mix(C.accent, 14) : "transparent",
                color: x.jeTu ? C.text : C.textMuted, fontSize: 12.5, textAlign: "left",
                cursor: "pointer", fontFamily: "inherit", width: "100%",
              }}
            >
              <span style={{
                width: 17, height: 17, flexShrink: 0, borderRadius: "50%", fontSize: 9.5, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1.5px solid ${x.cela ? C.green : x.jeTu ? C.accent : mix(C.border, 90)}`,
                background: x.jeTu ? C.accent : "transparent",
                color: x.cela ? C.green : C.onAccent,
              }}>{x.cela ? "✓" : ""}</span>
              <span style={{ flexGrow: 1, minWidth: 0 }}>{x.s.nazov}</span>
              <span style={{ fontSize: 10, color: C.textDim, fontVariantNumeric: "tabular-nums" }}>{x.hotovych}/{x.spolu}</span>
            </button>
          ))}
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

      {/* ── JEDNA OTÁZKA NARAZ ── */}
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

        {/* čo už je za tebou */}
        {prepis.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingBottom: 13, borderBottom: `1px solid ${mix(C.border, 60)}` }}>
            {prepis.map((x) => (
              <button
                key={x.o.id}
                onClick={() => chod(x.idx)}
                style={{ display: "flex", gap: 12, alignItems: "baseline", padding: 0, border: "none", background: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", width: "100%" }}
              >
                <span style={{ width: 150, flexShrink: 0, fontSize: 11, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.o.text}</span>
                <span style={{ flexGrow: 1, minWidth: 0, fontSize: 12.5, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{akoText(x.o, odp[x.o.id])}</span>
              </button>
            ))}
          </div>
        )}

        {hotovo ? (
          <Prehlad rad={rad} odp={odp} onSpat={(idx) => chod(idx)} />
        ) : (
          <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, padding: "18px 0", minHeight: 0 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.textDim }}>
                  {teraz.sekcia.nazov}
                </span>
                {stav.predvyplnene.odkial[teraz.o.id] && (
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: "2px 8px", borderRadius: 6, background: mix(C.green, 16), color: C.green, textTransform: "uppercase" }}>
                    {stav.predvyplnene.odkial[teraz.o.id]}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.3, maxWidth: "26ch" }}>
                {teraz.o.text}
              </div>
              {teraz.o.pomoc && (
                <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 8, lineHeight: 1.6, maxWidth: "52ch" }}>{teraz.o.pomoc}</div>
              )}
            </div>

            <VelkePole
              key={teraz.o.id}
              o={teraz.o}
              hodnota={odp[teraz.o.id]}
              onZmen={(v) => zmen(teraz.o.id, v)}
            />
          </div>
        )}

        {/* posun ďalej */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 13, borderTop: `1px solid ${mix(C.border, 60)}`, flexWrap: "wrap" }}>
          {hotovo ? (
            <button onClick={() => void uloz(false)} disabled={bezi} style={{ ...velkeTlacidlo, background: mix(C.green, 16), borderColor: mix(C.green, 55), color: C.green }}>
              {bezi ? "Ukladám…" : "Uložiť zápis"}
            </button>
          ) : (
            <button onClick={dalej} style={velkeTlacidlo}>Ďalej</button>
          )}
          {i > 0 && <button onClick={spat} style={{ ...maleTlacidlo, border: "none" }}>späť</button>}
          {!hotovo && (
            <span style={{ fontSize: 11.5, color: C.textDim }}>
              alebo <b style={{ color: C.textMuted }}>Enter</b>{teraz.o.typ === "dlhy" ? " (cmd+Enter)" : ""}
            </span>
          )}
          <div style={{ flexGrow: 1 }} />
          {hlaska && <span style={{ fontSize: 12, color: C.green }}>{hlaska}</span>}
          {chyba && <span style={{ fontSize: 12, color: C.red }}>{chyba}</span>}
          <span style={{ fontSize: 11.5, color: C.textDim, fontVariantNumeric: "tabular-nums" }}>
            {vyplnenych} z {rad.length} vyplnených
          </span>
          <div style={{ width: 120, height: 4, borderRadius: 3, background: mix(C.border, 90), overflow: "hidden" }}>
            <div style={{ width: `${rad.length ? (vyplnenych / rad.length) * 100 : 0}%`, height: "100%", background: C.accent }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Koniec radu — prehľad všetkého pred uložením, s preklikom späť. */
function Prehlad({ rad, odp, onSpat }: {
  rad: { sekcia: Sekcia; o: Otazka }[];
  odp: Odpovede;
  onSpat: (idx: number) => void;
}) {
  return (
    <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", padding: "16px 0" }}>
      <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.3, marginBottom: 4 }}>Prejdené. Skontroluj a ulož.</div>
      <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 16 }}>
        Klikni na ktorýkoľvek riadok, keď chceš niečo prepísať. Prázdne sa doplniť dá aj neskôr.
      </div>
      {rad.map((x, idx) => {
        const v = akoText(x.o, odp[x.o.id]);
        return (
          <button
            key={x.o.id}
            onClick={() => onSpat(idx)}
            style={{
              display: "flex", gap: 14, alignItems: "baseline", width: "100%", textAlign: "left",
              padding: "7px 0", border: "none", borderBottom: `1px solid ${mix(C.border, 40)}`,
              background: "none", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <span style={{ width: 170, flexShrink: 0, fontSize: 11.5, color: C.textDim, lineHeight: 1.45 }}>{x.o.text}</span>
            <span style={{ flexGrow: 1, minWidth: 0, fontSize: 13, color: v ? C.text : C.textDim, fontStyle: v ? "normal" : "italic", lineHeight: 1.5 }}>
              {v || "prázdne"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Ovládanie jednej otázky — veľké, aby sa dalo trafiť bez pozerania. */
function VelkePole({ o, hodnota, onZmen }: { o: Otazka; hodnota: unknown; onZmen: (v: unknown) => void }) {
  const vstup = {
    padding: "11px 13px", borderRadius: 9, fontSize: 15, fontFamily: "inherit",
    border: `1px solid ${C.border}`, background: C.bg, color: C.text, boxSizing: "border-box" as const,
  };

  if (o.typ === "oblasti") {
    const vybrane: Oblast[] = jeOblasti(hodnota) ? hodnota : [];
    const prepni = (m: string) => {
      const je = vybrane.some((x) => x.oblast === m);
      onZmen(je ? vybrane.filter((x) => x.oblast !== m) : [...vybrane, { oblast: m, sila: null }]);
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {OBLASTI.map((m) => {
            const je = vybrane.some((x) => x.oblast === m);
            return <button key={m} onClick={() => prepni(m)} style={pilulka(je)}>{m}</button>;
          })}
        </div>
        {/* Jedna oblasť = jedna stupnica. Tri zaškrtnuté = tri stupnice. */}
        {vybrane.map((x) => (
          <div key={x.oblast}>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 6 }}>
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, maxWidth: 640 }}>
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, maxWidth: 640 }}>
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
        value={String(hodnota ?? "")}
        onChange={(e) => onZmen(e.target.value)}
        rows={4}
        autoFocus
        placeholder="píš…"
        style={{ ...vstup, width: "100%", maxWidth: 640, resize: "vertical", lineHeight: 1.6 }}
      />
    );
  }

  return (
    <input
      type={o.typ === "cislo" ? "number" : o.typ === "datum" ? "date" : "text"}
      value={String(hodnota ?? "")}
      onChange={(e) => onZmen(o.typ === "cislo" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
      autoFocus
      style={{ ...vstup, width: o.typ === "cislo" ? 120 : "100%", maxWidth: 640, colorScheme: "dark" }}
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
              width: 38, height: 36, borderRadius: 8, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
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
  padding: "8px 15px", borderRadius: 9, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
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
