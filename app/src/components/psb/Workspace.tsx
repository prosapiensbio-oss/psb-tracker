import { useCallback, useEffect, useMemo, useState } from "react";

import { navrhniKlientaKandidati, type ClientAgg } from "../../lib/psb/compute";
import { postavKarty, poradie, type Karta } from "../../lib/psb/workspaceKarty";
import { C, mix } from "../../lib/psb/theme";
import { Card } from "./ui";

/**
 * Workspace — administratíva ako kopa kariet.
 *
 * Jerry, 23. 9. 2026: „tie karty by mi dali focus, že by som sa sústredil len
 * na jednu vec." Vybral si variant s KOPOU: za aktívnou kartou presvitajú
 * ďalšie dve. Dôvod je rytmus — pri jednej karte cez celú šírku je medzi
 * rozhodnutiami prázdno a nevidno, že sa niekam ide.
 *
 * ČO TU NIE JE A PREČO
 *
 * Uzávierka, nahrávanie exportov a mesačné kontroly sem nepatria: nie sú to
 * rozhodnutia, sú to postupy na dvadsať minút. Karta z nich by bola len dvere
 * inam a kopa by sa tvárila dlhšia, než je práca.
 *
 * TRI PRAVIDLÁ, BEZ KTORÝCH BY BOLA KOPA HORŠIA NEŽ ZOZNAM
 *
 * 1. Vidno, koľko toho ešte je („4 z 12"). Bez toho kopa nemá koniec — a
 *    pocit konca je celý dôvod, prečo sem človek chodí.
 * 2. Odložená karta sa VRACIA (na koniec kopy). „Neviem" nesmie znamenať
 *    „zmizlo"; to je tá istá strata odpovede, ktorú rieši register.
 * 3. Hotová karta sa neodkladá do ticha — počet vybavených je vidieť.
 */

type Zmena = { id: string; druh: string; klient: string | null; nazov: string | null; pred: string | null; po: string | null; kedy: string; trener: string };

const kc = (n: number) => `${Math.round(n).toLocaleString("sk-SK")} Kč`;
const den = (s: string) => (s ? `${Number(s.slice(8))}. ${Number(s.slice(5, 7))}.` : "");

export function Workspace({ clients, mena }: { clients: Record<string, ClientAgg>; mena: string[] }) {
  const [zdroje, setZdroje] = useState<{ zmeny: Zmena[]; nezname: { nazov: string; trener: string; pocet: number; najblizsi: string }[]; platby: { fioId: string; datum: string; suma: number; text: string; kandidati: string[] }[] } | null>(null);
  const [hotove, setHotove] = useState<Set<string>>(new Set());
  const [odlozene, setOdlozene] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [text, setText] = useState("");
  const [pracujem, setPracujem] = useState(false);
  const [chyba, setChyba] = useState("");

  const nacitaj = useCallback(async () => {
    const [k, p] = await Promise.all([
      fetch("/api/kalendar", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
      fetch("/api/platby", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
    ]);
    setZdroje({
      zmeny: (k?.zmeny || []) as Zmena[],
      nezname: k?.nezname || [],
      platby: p?.nepriradene || [],
    });
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const karty = useMemo(() => {
    if (!zdroje) return [];
    return postavKarty({
      ...zdroje,
      navrhMena: (nazov) => {
        const v = navrhniKlientaKandidati(nazov, clients);
        return v.typ === "uvodny" ? (v.kandidati[0] || v.meno) : (v.kandidati.length === 1 ? v.kandidati[0] : "");
      },
    });
  }, [zdroje, clients]);

  const rad = useMemo(() => poradie(karty, hotove, odlozene), [karty, hotove, odlozene]);
  const k = rad[Math.min(i, Math.max(0, rad.length - 1))];
  const kluc = (x: Karta) => `${x.druh}|${x.id}`;

  // Predvyplnenie sa mení s kartou, nie s písaním — inak by sa človeku pod
  // rukami prepisovalo to, čo práve napísal.
  useEffect(() => {
    if (!k) { setText(""); return; }
    setText(k.druh === "zmena" ? "" : k.navrh);
  }, [k?.druh, k && kluc(k)]); // eslint-disable-line react-hooks/exhaustive-deps

  const posun = (o: number) => { setChyba(""); setI((x) => Math.max(0, Math.min(rad.length - 1, x + o))); };

  useEffect(() => {
    const naKlavesu = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") posun(1);
      if (e.key === "ArrowLeft") posun(-1);
    };
    window.addEventListener("keydown", naKlavesu);
    return () => window.removeEventListener("keydown", naKlavesu);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const posli = async (url: string, telo: Record<string, unknown>) => {
    const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(telo) });
    return (await r.json()) as { ok: boolean; error?: string };
  };

  const vybav = async (url: string, telo: Record<string, unknown>) => {
    if (!k) return;
    setPracujem(true); setChyba("");
    const j = await posli(url, telo).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!j.ok) { setChyba(j.error || "nepodarilo sa uložiť"); return; }
    setHotove((s) => new Set([...s, kluc(k)]));
    setOdlozene((s) => s.filter((x) => x !== kluc(k)));
    setI((x) => Math.min(x, Math.max(0, rad.length - 2)));
  };

  const odloz = () => {
    if (!k) return;
    setOdlozene((s) => (s.includes(kluc(k)) ? s : [...s, kluc(k)]));
    setI((x) => x); // karta sa presunie na koniec, index ukáže ďalšiu
  };

  if (!zdroje) return null;

  const spolu = karty.length;
  const vybavenych = hotove.size;

  if (!rad.length) {
    return (
      <Card>
        <div style={{ padding: "26px 4px", textAlign: "center" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.green }}>Hotovo.</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 7, lineHeight: 1.6 }}>
            {vybavenych > 0
              ? `Vybavil si ${vybavenych} ${vybavenych === 1 ? "vec" : vybavenych < 5 ? "veci" : "vecí"}. Administratívu máš za sebou — nič iné otvárať nemusíš.`
              : "Nič nečaká. Administratívu máš za sebou."}
          </div>
        </div>
      </Card>
    );
  }

  const dalsie = rad.slice(i + 1, i + 3);

  return (
    <div>
      {/* Postup hore — bez neho kopa nemá koniec. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 12.5, color: C.textMuted, fontWeight: 700, whiteSpace: "nowrap" }}>
          {Math.min(i + 1, rad.length)} z {rad.length}
        </div>
        <div style={{ flexGrow: 1, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${spolu ? (vybavenych / spolu) * 100 : 0}%`, height: "100%", background: C.accent, transition: "width .25s" }} />
        </div>
        <div style={{ fontSize: 12, color: C.textDim, whiteSpace: "nowrap" }}>
          {vybavenych > 0 && `${vybavenych} vybavených`}
          {vybavenych > 0 && odlozene.length > 0 && " · "}
          {odlozene.length > 0 && `${odlozene.length} odložených na koniec`}
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, alignItems: "stretch", overflow: "hidden" }}>
        <div style={{ flex: "0 0 auto", width: "min(100%, 680px)" }}>
          <Card style={{ marginBottom: 0, height: "100%" }}>
            {k.druh === "zmena" && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, letterSpacing: 0.6 }}>ZMENA V KALENDÁRI</div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 10, lineHeight: 1.15 }}>{k.nadpis}</div>
                <div style={{ fontSize: 13.5, color: C.textMuted, marginTop: 6 }}>{k.detail}</div>
                <div style={{ fontSize: 13, marginTop: 20 }}>Prečo?</div>
                <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                  {["klient zrušil", "presunuli sme", "chyba v zápise", "ja som zrušil"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setText(t)}
                      style={{ padding: "7px 13px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", border: `1px solid ${text === t ? C.accent : C.border}`, background: text === t ? C.accentBg : "transparent", color: text === t ? C.accentLight : C.textMuted }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="alebo napíš vlastnými slovami…"
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 12, padding: "11px 13px", borderRadius: 10, fontSize: 14, background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                />
                <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
                  <button
                    onClick={() => void vybav("/api/kalendar", { akcia: "vysvetli", id: k.id, poznamka: text.trim() })}
                    disabled={pracujem || text.trim().length < 2}
                    style={tlacidloHlavne(text.trim().length >= 2)}
                  >
                    {pracujem ? "…" : "Vybavené"}
                  </button>
                  <button onClick={odloz} style={tlacidloVedlajsie}>Neviem — vráť mi to</button>
                </div>
              </>
            )}

            {k.druh === "meno" && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.accentLight, letterSpacing: 0.6 }}>NOVÝ NÁZOV V KALENDÁRI</div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 10, lineHeight: 1.15 }}>{k.nazov}</div>
                <div style={{ fontSize: 13.5, color: C.textMuted, marginTop: 6 }}>
                  {k.trener} · {k.pocet}× · najbližšie {den(k.najblizsi)}
                </div>
                <div style={{ fontSize: 13, marginTop: 20 }}>Kto to je?</div>
                <input
                  list="ws-klienti"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="píš meno…"
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 9, padding: "11px 13px", borderRadius: 10, fontSize: 15, background: C.bg, border: `1px solid ${text && !mena.includes(text) ? C.orange : C.border}`, color: C.text }}
                />
                <datalist id="ws-klienti">{mena.map((m) => <option key={m} value={m} />)}</datalist>
                <div style={{ display: "flex", gap: 9, marginTop: 18, flexWrap: "wrap" }}>
                  <button
                    onClick={() => void vybav("/api/kalendar", { akcia: "mapuj", nazov: k.nazov, trener: k.trener, typ: "trening", klient: text.trim() })}
                    disabled={pracujem || text.trim().length < 3}
                    style={tlacidloHlavne(text.trim().length >= 3)}
                  >
                    {pracujem ? "…" : "Je to tréning tohto klienta"}
                  </button>
                  <button
                    onClick={() => void vybav("/api/kalendar", { akcia: "mapuj", nazov: k.nazov, trener: k.trener, typ: "netrening", klient: null })}
                    style={tlacidloVedlajsie}
                  >
                    Nie je to tréning
                  </button>
                  <button onClick={odloz} style={tlacidloVedlajsie}>Vráť mi to</button>
                </div>
              </>
            )}

            {k.druh === "platba" && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: 0.6 }}>PLATBA Z BANKY · {den(k.datum)}</div>
                <div style={{ fontSize: 34, fontWeight: 800, marginTop: 10, lineHeight: 1.1 }}>{kc(k.suma)}</div>
                <div style={{ fontSize: 13, color: C.textMuted, marginTop: 7, lineHeight: 1.5 }}>{k.text.slice(0, 120)}</div>
                <div style={{ fontSize: 13, marginTop: 20 }}>Komu patrí?</div>
                <input
                  list="ws-klienti"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="píš meno…"
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 9, padding: "11px 13px", borderRadius: 10, fontSize: 15, background: C.bg, border: `1px solid ${text && !mena.includes(text) ? C.orange : C.border}`, color: C.text }}
                />
                {k.navrh && <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8 }}>Appka našla meno v texte platby. Platiteľa si zapamätá.</div>}
                <div style={{ display: "flex", gap: 9, marginTop: 18, flexWrap: "wrap" }}>
                  <button
                    onClick={() => void vybav("/api/platby", { akcia: "priradz", fioId: k.id, klient: text.trim(), zapamataj: true })}
                    disabled={pracujem || text.trim().length < 3}
                    style={tlacidloHlavne(text.trim().length >= 3)}
                  >
                    {pracujem ? "…" : "Priradiť"}
                  </button>
                  <button onClick={() => void vybav("/api/platby", { akcia: "nieKlient", fioId: k.id })} style={tlacidloVedlajsie}>Nie je to klient</button>
                  <button onClick={odloz} style={tlacidloVedlajsie}>Vráť mi to</button>
                </div>
              </>
            )}

            {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 12 }}>{chyba}</div>}
          </Card>
        </div>

        {/* Ďalšie karty presvitajú — za aktívnou je vidieť, že sa niekam ide. */}
        {dalsie.map((d, j) => (
          <div key={kluc(d)} style={{ flex: "0 0 auto", width: j === 0 ? 300 : 200, opacity: j === 0 ? 0.55 : 0.28, pointerEvents: "none" }}>
            <Card style={{ marginBottom: 0, height: "100%" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textDim, letterSpacing: 0.6 }}>
                {d.druh === "zmena" ? "ZMENA V KALENDÁRI" : d.druh === "meno" ? "NOVÝ NÁZOV" : "PLATBA Z BANKY"}
              </div>
              <div style={{ fontSize: j === 0 ? 19 : 16, fontWeight: 700, marginTop: 8, lineHeight: 1.25 }}>
                {d.druh === "zmena" ? d.nadpis : d.druh === "meno" ? d.nazov : kc(d.suma)}
              </div>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                {d.druh === "zmena" ? d.detail : d.druh === "meno" ? `${d.trener} · ${d.pocet}×` : den(d.datum)}
              </div>
            </Card>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
        <button onClick={() => posun(-1)} disabled={i === 0} aria-label="Späť" style={sipka(i > 0)}>←</button>
        <button onClick={() => posun(1)} disabled={i >= rad.length - 1} aria-label="Ďalej" style={sipka(i < rad.length - 1)}>→</button>
        <div style={{ fontSize: 12, color: C.textDim }}>Šípkami sa dá preskakovať aj z klávesnice.</div>
      </div>
    </div>
  );
}

const tlacidloHlavne = (aktivne: boolean) => ({
  padding: "11px 22px", borderRadius: 10, fontSize: 14, fontWeight: 700,
  cursor: aktivne ? "pointer" : "not-allowed",
  border: `1px solid ${aktivne ? mix(C.green, 55) : C.border}`,
  background: aktivne ? mix(C.green, 14) : "transparent",
  color: aktivne ? C.green : C.textDim,
});

const tlacidloVedlajsie = {
  padding: "11px 16px", borderRadius: 10, fontSize: 12.5, cursor: "pointer",
  border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
};

const sipka = (aktivna: boolean) => ({
  width: 42, height: 42, borderRadius: "50%", fontSize: 17,
  cursor: aktivna ? "pointer" : "not-allowed",
  border: `1px solid ${C.border}`, background: "transparent",
  color: aktivna ? C.textMuted : C.textDim,
});
