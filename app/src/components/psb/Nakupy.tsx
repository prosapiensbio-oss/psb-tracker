import { useEffect, useMemo, useState } from "react";

import { fetchWishlist, ulozWish, type WishPolozka } from "../../lib/psb/client";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info } from "./ui";

// Nákupný zoznam — prenesený z hárku vo VZAS.
//
// V Exceli to boli dve skupiny s vlastnými medzisúčtami (Vybavenie 17 016 Kč,
// Kurzy 58 400 Kč) a v appke po ňom zostala jediná veta v cieli „Doplnenie
// vybavenia": ~17 000 Kč. Nedalo sa pozrieť, z čoho to číslo je ani čo z toho
// je kúpené, takže sa nikdy neaktualizovalo.
//
// Nie je to náklad: kým sa vec nekúpi, je to plán. Do peňazí vstúpi až cez
// banku ako každý iný výdavok. Tu ide len o to, čo chceme, koľko to stojí a čo
// už máme.

const kc = (n: number) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;

const vstup = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  padding: "7px 9px", borderRadius: 7, border: `1px solid ${C.border}`,
  background: C.bg, color: C.text, fontSize: 13, width: "100%", ...extra,
});

export function Nakupy() {
  const [polozky, setPolozky] = useState<WishPolozka[]>([]);
  const [nacitava, setNacitava] = useState(true);
  const [nazov, setNazov] = useState("");
  const [cena, setCena] = useState("");
  const [link, setLink] = useState("");
  const [kategoria, setKategoria] = useState("Vybavenie");

  const nacitaj = () => { void fetchWishlist().then((p) => { setPolozky(p); setNacitava(false); }); };
  useEffect(nacitaj, []);

  const suma = useMemo(() => {
    const chceme = polozky.filter((p) => !p.kupene).reduce((a, p) => a + p.cena, 0);
    const kupene = polozky.filter((p) => p.kupene).reduce((a, p) => a + p.cena, 0);
    return { chceme, kupene, spolu: chceme + kupene };
  }, [polozky]);

  // Skupiny v poradí, v akom prvýkrát pribudli — nie abecedne. V Exceli bolo
  // Vybavenie hore a Kurzy pod ním a to poradie niečo znamená.
  const skupiny = useMemo(() => {
    const m = new Map<string, WishPolozka[]>();
    for (const p of polozky) {
      const k = p.kategoria || "Vybavenie";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()].map(([nazovSkupiny, ps]) => ({
      nazov: nazovSkupiny,
      polozky: [...ps.filter((p) => !p.kupene), ...ps.filter((p) => p.kupene)],
      chceme: ps.filter((p) => !p.kupene).reduce((a, p) => a + p.cena, 0),
      spolu: ps.reduce((a, p) => a + p.cena, 0),
    }));
  }, [polozky]);

  const kategorie = useMemo(
    () => [...new Set([...polozky.map((p) => p.kategoria || "Vybavenie"), "Vybavenie", "Kurzy"])],
    [polozky],
  );

  // Optimisticky lokálne, potom na server. Písanie do inputu, ktoré čaká na
  // odpoveď databázy, sa píše ako cez blato — a pri cene, ktorú človek prepisuje
  // podľa e-shopu, je to najhoršie.
  const [chyba, setChyba] = useState("");
  const uprav = (id: string, zmena: Partial<WishPolozka>) => {
    const predtym = polozky;
    setPolozky((prev) => prev.map((p) => (p.id === id ? { ...p, ...zmena } : p)));
    const p = { ...polozky.find((x) => x.id === id)!, ...zmena };
    void ulozWish({ id, nazov: p.nazov, cena: p.cena, link: p.link, kupene: p.kupene, poznamka: p.poznamka, kategoria: p.kategoria })
      .then((ok) => { if (!ok) { setPolozky(predtym); setChyba("Zmena sa nezapísala — skús znova."); } else setChyba(""); });
  };

  const zmaz = (p: WishPolozka) => {
    const predtym = polozky;
    setPolozky((prev) => prev.filter((x) => x.id !== p.id));
    void ulozWish({ id: p.id, zmazat: true })
      .then((ok) => { if (!ok) { setPolozky(predtym); setChyba("Zmazanie neprešlo — položka je späť."); } else setChyba(""); });
  };

  const pridaj = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = nazov.trim();
    if (!n) return;
    await ulozWish({ nazov: n, cena: Number(cena.replace(/\s/g, "")) || 0, link: link.trim(), kategoria });
    setNazov(""); setCena(""); setLink("");
    nacitaj();
  };

  return (
    <Card>
      <H3><Info text="Zoznam z hárku vo VZAS. Zaškrtnutá položka sa presunie na koniec svojej skupiny a odráta sa zo sumy „ešte treba“. Nie je to náklad — do peňazí to vstúpi až cez banku ako bežný výdavok. Skupiny majú vlastné medzisúčty rovnako ako v Exceli." label="Nákupný zoznam" /></H3>

      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "10px 0 16px" }}>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted }}>Ešte treba</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{kc(suma.chceme)}</div>
          <div style={{ fontSize: 11, color: C.textDim }}>{polozky.filter((p) => !p.kupene).length} položiek</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted }}>Už kúpené</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.green, fontVariantNumeric: "tabular-nums" }}>{kc(suma.kupene)}</div>
          <div style={{ fontSize: 11, color: C.textDim }}>{polozky.filter((p) => p.kupene).length} položiek</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted }}>Celý zoznam</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{kc(suma.spolu)}</div>
          <div style={{ fontSize: 11, color: C.textDim }}>{polozky.length} položiek</div>
        </div>
      </div>

      {nacitava ? (
        <div style={{ fontSize: 12.5, color: C.textDim }}>Načítavam…</div>
      ) : polozky.length === 0 ? (
        <Empty>Zoznam je prázdny — pridaj prvú položku nižšie.</Empty>
      ) : (
        skupiny.map((s) => (
          <div key={s.nazov} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "4px 0 6px", borderBottom: `1px solid ${mix(C.accent, 30)}` }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.accentLight, letterSpacing: 0.2 }}>{s.nazov}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>
                ešte treba <b style={{ color: C.text }}>{kc(s.chceme)}</b>
                {s.spolu !== s.chceme && <span style={{ color: C.textDim }}> · celkom {kc(s.spolu)}</span>}
              </span>
            </div>
            {s.polozky.map((p) => (
              // Mriežka, nie flex: pri flexe si input vypýta svoju vlastnú šírku a
              // na telefóne odskočilo × na samostatný riadok. Takto sú riadky
              // rovnaké v každej šírke — hore názov a cena, pod tým odkaz.
              <div
                key={p.id}
                style={{
                  display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) 92px auto auto",
                  gap: 8, alignItems: "center", padding: "9px 0",
                  borderBottom: `1px solid ${mix(C.border, 55)}`,
                  opacity: p.kupene ? 0.55 : 1,
                }}
              >
                <input
                  type="checkbox" checked={p.kupene} onChange={(e) => uprav(p.id, { kupene: e.target.checked })}
                  title={p.kupene ? `Kúpené ${p.kupeneAt?.slice(0, 10) || ""}` : "Označ ako kúpené"}
                  style={{ width: 17, height: 17, accentColor: C.green, cursor: "pointer" }}
                />
                <input
                  value={p.nazov} onChange={(e) => uprav(p.id, { nazov: e.target.value })}
                  title={p.poznamka || undefined}
                  style={vstup({ minWidth: 0, textDecoration: p.kupene ? "line-through" : "none" })}
                />
                <input
                  value={p.cena || ""} onChange={(e) => uprav(p.id, { cena: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })}
                  inputMode="numeric" placeholder="cena"
                  style={vstup({ minWidth: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" })}
                />
                <a
                  href={p.link ? (p.link.startsWith("http") ? p.link : `https://${p.link}`) : undefined}
                  target="_blank" rel="noreferrer" title={p.link ? "Otvoriť odkaz" : "Bez odkazu"}
                  style={{ color: p.link ? C.accentLight : mix(C.textDim, 40), fontSize: 14, textDecoration: "none", padding: "0 2px", cursor: p.link ? "pointer" : "default" }}
                >
                  ↗
                </a>
                <button
                  onClick={() => zmaz(p)} title="Zmazať položku"
                  style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 16, padding: "0 2px" }}
                >
                  ×
                </button>
                <input
                  value={p.link} onChange={(e) => uprav(p.id, { link: e.target.value })} placeholder="odkaz na e-shop"
                  style={vstup({ gridColumn: "2 / -1", minWidth: 0, fontSize: 11.5, padding: "5px 8px", color: C.textMuted })}
                />
              </div>
            ))}
          </div>
        ))
      )}

      <form onSubmit={pridaj} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 92px auto", gap: 8, marginTop: 14 }}>
        <input value={nazov} onChange={(e) => setNazov(e.target.value)} placeholder="Nová položka"
          style={vstup({ minWidth: 0 })} />
        <input value={cena} onChange={(e) => setCena(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="cena"
          style={vstup({ minWidth: 0, textAlign: "right" })} />
        <button type="submit" disabled={!nazov.trim()}
          style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: nazov.trim() ? "pointer" : "default",
            border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 8), color: C.accentLight,
            opacity: nazov.trim() ? 1 : 0.45,
          }}>
          Pridať
        </button>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="odkaz na e-shop (nepovinné)"
          style={vstup({ gridColumn: "1 / 3", minWidth: 0, fontSize: 11.5, padding: "5px 8px" })} />
        <select
          value={kategoria} onChange={(e) => setKategoria(e.target.value)}
          style={{ ...vstup({ minWidth: 0, fontSize: 11.5, padding: "5px 8px" }), cursor: "pointer" }}
        >
          {kategorie.map((k) => <option key={k} value={k} style={{ background: C.card }}>{k}</option>)}
        </select>
      </form>
      <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
        Zmeny sa ukladajú samé. Do auditu ide pridanie, zmazanie a zaškrtnutie „kúpené“ — nie prepisovanie ceny.
      </div>
    </Card>
  );
}
