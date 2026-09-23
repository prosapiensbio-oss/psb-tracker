import { useCallback, useEffect, useMemo, useState } from "react";

import { navrhniKlientaKandidati, type ClientAgg } from "../../lib/psb/compute";
import { klucPolozky, popisZmeny, postavKarty, type Karta, type NeznamyNazov, type NepriradenaPlatba, type Zmena } from "../../lib/psb/workspaceKarty";
import { C, mix } from "../../lib/psb/theme";
import { Card } from "./ui";

/**
 * Workspace — administratíva ako kopa kariet, jedna karta = jeden DRUH práce.
 *
 * Jerry, 23. 9. 2026, po prvej skúške: „na tých kartách som si predstavoval
 * celé kategórie, nie že klienti jeden po druhom, ale zmeny kalendára
 * v jednom." Focus nie je „teraz riešim Martina", ale „teraz robím zmeny
 * v kalendári" — jeden druh naraz, lebo hlava sa neprepína.
 *
 * TRI PRAVIDLÁ, BEZ KTORÝCH JE KOPA HORŠIA NEŽ ZOZNAM
 *
 * 1. Vidno, koľko toho ešte je — v karte aj v kope. Pocit konca je celý
 *    dôvod, prečo sem človek chodí.
 * 2. Vybavený riadok zmizne z karty, ale počet vybavených je vidieť. Ticho
 *    po odklepnutí tvrdí, že práca neexistovala.
 * 3. Karta patrí tomu, kto je prihlásený. Jerry vidí svoje, Terezka svoje;
 *    peniaze sú Jerryho, tak ako mesačné kontroly.
 */

const kc = (n: number) => `${Math.round(n).toLocaleString("sk-SK")} Kč`;
const den = (s: string) => (s ? `${Number(s.slice(8))}. ${Number(s.slice(5, 7))}.` : "");

export function Workspace({ clients, mena, ktoSom }: { clients: Record<string, ClientAgg>; mena: string[]; ktoSom: string | null }) {
  const [zdroje, setZdroje] = useState<{ zmeny: Zmena[]; nezname: { nazov: string; trener: string; pocet: number; najblizsi: string }[]; platby: { fioId: string; datum: string; suma: number; text: string; kandidati: string[] }[] } | null>(null);
  const [hotove, setHotove] = useState<Set<string>>(new Set());
  const [texty, setTexty] = useState<Record<string, string>>({});
  const [i, setI] = useState(0);
  const [pracujem, setPracujem] = useState("");
  const [chyba, setChyba] = useState("");

  const nacitaj = useCallback(async () => {
    const [k, p] = await Promise.all([
      fetch("/api/kalendar", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
      fetch("/api/platby", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
    ]);
    setZdroje({ zmeny: (k?.zmeny || []) as Zmena[], nezname: k?.nezname || [], platby: p?.nepriradene || [] });
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const karty = useMemo(() => {
    if (!zdroje) return [];
    return postavKarty({
      ...zdroje,
      ktoSom,
      navrhMena: (nazov) => {
        const v = navrhniKlientaKandidati(nazov, clients);
        return v.typ === "uvodny" ? (v.kandidati[0] || v.meno) : (v.kandidati.length === 1 ? v.kandidati[0] : "");
      },
    });
  }, [zdroje, clients, ktoSom]);

  // Karta, v ktorej už nič nezostalo, z kopy zmizne — ale až po tom, čo sa
  // v nej naozaj odklikalo; inak by zmizla pod rukami uprostred práce.
  const zive = useMemo(
    () => karty.filter((k) => (k.polozky as (Zmena | NeznamyNazov | NepriradenaPlatba)[]).some((p) => !hotove.has(klucPolozky(k.druh, p)))),
    [karty, hotove],
  );
  const k = zive[Math.min(i, Math.max(0, zive.length - 1))];

  const text = (kluc: string, predvolene = "") => texty[kluc] ?? predvolene;
  const nastavText = (kluc: string, v: string) => setTexty((s) => ({ ...s, [kluc]: v }));

  const posli = async (url: string, telo: Record<string, unknown>) => {
    const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(telo) });
    return (await r.json()) as { ok: boolean; error?: string };
  };

  const vybav = async (kluc: string, url: string, telo: Record<string, unknown>) => {
    setPracujem(kluc); setChyba("");
    const j = await posli(url, telo).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem("");
    if (!j.ok) { setChyba(j.error || "nepodarilo sa uložiť"); return; }
    setHotove((s) => new Set([...s, kluc]));
  };

  if (!zdroje) return null;

  const vybavenych = hotove.size;
  const spolu = karty.reduce((a, x) => a + x.polozky.length, 0);

  if (!zive.length) {
    return (
      <Card>
        <div style={{ padding: "28px 4px", textAlign: "center" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.green }}>Hotovo.</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 7, lineHeight: 1.6 }}>
            {vybavenych > 0
              ? `Vybavil si ${vybavenych} ${vybavenych === 1 ? "vec" : vybavenych < 5 ? "veci" : "vecí"}. Administratívu máš za sebou.`
              : ktoSom === "terezka"
                ? "Nič nečaká. Peniaze a uzávierku má na starosti Jerry."
                : "Nič nečaká. Administratívu máš za sebou."}
          </div>
        </div>
      </Card>
    );
  }

  const zostava = (x: Karta) => (x.polozky as (Zmena | NeznamyNazov | NepriradenaPlatba)[]).filter((p) => !hotove.has(klucPolozky(x.druh, p))).length;
  const dalsie = zive.slice(i + 1, i + 3);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12.5, color: C.textMuted, fontWeight: 700, whiteSpace: "nowrap" }}>
          Karta {Math.min(i + 1, zive.length)} z {zive.length}
        </div>
        <div style={{ flexGrow: 1, minWidth: 120, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${spolu ? (vybavenych / spolu) * 100 : 0}%`, height: "100%", background: C.accent, transition: "width .25s" }} />
        </div>
        <div style={{ fontSize: 12, color: C.textDim, whiteSpace: "nowrap" }}>
          {vybavenych > 0 ? `${vybavenych} vybavených` : `${spolu} vecí celkom`}
          {ktoSom === "jerry" || ktoSom === "terezka" ? ` · len ${ktoSom === "jerry" ? "Jerryho" : "Terezkine"}` : ""}
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", overflow: "hidden" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <Card style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{k.nadpis}</div>
              <div style={{ fontSize: 12.5, color: C.textMuted }}>{zostava(k)} zostáva</div>
            </div>
            <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 4 }}>{k.podnadpis}</div>

            <div style={{ marginTop: 16, maxHeight: 430, overflowY: "auto" }}>
              {k.druh === "zmeny" && k.polozky.map((z) => {
                const kluc = klucPolozky("zmeny", z);
                if (hotove.has(kluc)) return null;
                const t = text(kluc);
                return (
                  <div key={kluc} style={riadok}>
                    <div style={{ minWidth: 150, flex: "1 1 190px" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{z.klient || z.nazov || "(bez mena)"}</div>
                      <div style={{ fontSize: 11.5, color: C.textDim }}>{popisZmeny(z)} · {z.trener}</div>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {["klient zrušil", "presunuli sme", "chyba v zápise"].map((d) => (
                        <button key={d} onClick={() => nastavText(kluc, d)} style={stitok(t === d)}>{d}</button>
                      ))}
                    </div>
                    <input value={t} onChange={(e) => nastavText(kluc, e.target.value)} placeholder="alebo vlastnými slovami…" style={vstup(false)} />
                    <button onClick={() => void vybav(kluc, "/api/kalendar", { akcia: "vysvetli", id: z.id, poznamka: t.trim() })} disabled={pracujem === kluc || t.trim().length < 2} style={hlavne(t.trim().length >= 2)}>
                      {pracujem === kluc ? "…" : "Vybavené"}
                    </button>
                  </div>
                );
              })}

              {k.druh === "mena" && k.polozky.map((n) => {
                const kluc = klucPolozky("mena", n);
                if (hotove.has(kluc)) return null;
                const t = text(kluc, n.navrh);
                return (
                  <div key={kluc} style={riadok}>
                    <div style={{ minWidth: 130, flex: "1 1 160px" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{n.nazov}</div>
                      <div style={{ fontSize: 11.5, color: C.textDim }}>{n.trener} · {n.pocet}× · {den(n.najblizsi)}</div>
                    </div>
                    <input list="ws-klienti" value={t} onChange={(e) => nastavText(kluc, e.target.value)} placeholder="kto to je…" style={vstup(!!t && !mena.includes(t))} />
                    <button onClick={() => void vybav(kluc, "/api/kalendar", { akcia: "mapuj", nazov: n.nazov, trener: n.trener, typ: "trening", klient: t.trim() })} disabled={pracujem === kluc || t.trim().length < 3} style={hlavne(t.trim().length >= 3)}>
                      {pracujem === kluc ? "…" : "Je to on"}
                    </button>
                    <button onClick={() => void vybav(kluc, "/api/kalendar", { akcia: "mapuj", nazov: n.nazov, trener: n.trener, typ: "netrening", klient: null })} style={vedlajsie}>
                      Nie je tréning
                    </button>
                  </div>
                );
              })}

              {k.druh === "platby" && k.polozky.map((p) => {
                const kluc = klucPolozky("platby", p);
                if (hotove.has(kluc)) return null;
                const t = text(kluc, p.navrh);
                return (
                  <div key={kluc} style={riadok}>
                    <div style={{ minWidth: 54, fontSize: 12, color: C.textDim }}>{den(p.datum)}</div>
                    <div style={{ minWidth: 84, fontSize: 14, fontWeight: 700, textAlign: "right" }}>{kc(p.suma)}</div>
                    <div style={{ flex: "1 1 200px", minWidth: 150, fontSize: 11.5, color: C.textMuted }}>{p.text.slice(0, 80)}</div>
                    <input list="ws-klienti" value={t} onChange={(e) => nastavText(kluc, e.target.value)} placeholder="komu patrí…" style={vstup(!!t && !mena.includes(t))} />
                    <button onClick={() => void vybav(kluc, "/api/platby", { akcia: "priradz", fioId: p.fioId, klient: t.trim(), zapamataj: true })} disabled={pracujem === kluc || t.trim().length < 3} style={hlavne(t.trim().length >= 3)}>
                      {pracujem === kluc ? "…" : "Priradiť"}
                    </button>
                    <button onClick={() => void vybav(kluc, "/api/platby", { akcia: "nieKlient", fioId: p.fioId })} style={vedlajsie}>Nie je klient</button>
                  </div>
                );
              })}
            </div>
            <datalist id="ws-klienti">{mena.map((m) => <option key={m} value={m} />)}</datalist>
            {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{chyba}</div>}
          </Card>
        </div>

        {/* Ďalšie karty presvitajú — za aktívnou je vidieť, že sa niekam ide. */}
        {dalsie.map((d, j) => (
          <div key={d.druh} style={{ flex: "0 0 auto", width: j === 0 ? 220 : 160, opacity: j === 0 ? 0.5 : 0.26, pointerEvents: "none" }}>
            <Card style={{ marginBottom: 0 }}>
              <div style={{ fontSize: j === 0 ? 16 : 14, fontWeight: 700, lineHeight: 1.25 }}>{d.nadpis}</div>
              <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6 }}>{zostava(d)} zostáva</div>
            </Card>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
        <button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="Späť" style={sipka(i > 0)}>←</button>
        <button onClick={() => setI((x) => Math.min(zive.length - 1, x + 1))} disabled={i >= zive.length - 1} aria-label="Ďalej" style={sipka(i < zive.length - 1)}>→</button>
        <div style={{ fontSize: 12, color: C.textDim }}>
          {i < zive.length - 1 ? `Ďalej: ${zive[i + 1].nadpis}` : "Toto je posledná karta."}
        </div>
      </div>
    </div>
  );
}

const riadok = {
  display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const,
  padding: "9px 0", borderBottom: `1px solid ${mix(C.border, 55)}`,
};

const vstup = (varovanie: boolean) => ({
  flex: "0 1 180px", minWidth: 150, padding: "7px 10px", borderRadius: 8, fontSize: 12.5,
  border: `1px solid ${varovanie ? C.orange : C.border}`, background: C.bg, color: C.text,
});

const stitok = (on: boolean) => ({
  padding: "5px 10px", borderRadius: 7, fontSize: 11.5, cursor: "pointer",
  border: `1px solid ${on ? C.accent : C.border}`,
  background: on ? C.accentBg : "transparent",
  color: on ? C.accentLight : C.textMuted,
});

const hlavne = (aktivne: boolean) => ({
  padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
  cursor: aktivne ? "pointer" : "not-allowed",
  border: `1px solid ${aktivne ? mix(C.green, 50) : C.border}`,
  background: aktivne ? mix(C.green, 12) : "transparent",
  color: aktivne ? C.green : C.textDim,
});

const vedlajsie = {
  padding: "7px 11px", borderRadius: 8, fontSize: 12, cursor: "pointer",
  border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
};

const sipka = (aktivna: boolean) => ({
  width: 40, height: 40, borderRadius: "50%", fontSize: 16,
  cursor: aktivna ? "pointer" : "not-allowed",
  border: `1px solid ${C.border}`, background: "transparent",
  color: aktivna ? C.textMuted : C.textDim,
});
