import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { navrhniKlientaKandidati, type ClientAgg } from "../../lib/psb/compute";
import { klucPolozky, popisZmeny, postavKarty, trenerZPrihlasenia, type Karta, type NeznamyNazov, type NepriradenaPlatba, type Zmena } from "../../lib/psb/workspaceKarty";
import type { PSBData } from "../../lib/psb/types";
import { KlientStol } from "./KlientStol";
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

export function Workspace({ clients, mena, ktoSom, data, kalUdalosti, btcSats, btc }: {
  clients: Record<string, ClientAgg>;
  mena: string[];
  ktoSom: string | null;
  data: PSBData;
  kalUdalosti?: { zaciatok: string; klient: string | null; typ: string | null }[];
  btcSats?: Record<string, number>;
  /** Bitcoinová kniha a kurz — profil klienta z nej sádže záložku ₿. */
  btc?: { platby: { klient: string | null; datum: string; sats?: number; czk: number | null }[]; kurz: number | null; kedy: string | null };
}) {
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
    // Karta klienta nie je fronta — nemá položky a nikdy nezmizne. Ostatné
    // zmiznú, keď sa v nich všetko odklikalo.
    () => karty.filter((k) => k.druh === "klient"
      || (k.polozky as (Zmena | NeznamyNazov | NepriradenaPlatba)[]).some((p) => !hotove.has(klucPolozky(k.druh, p)))),
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
  /**
   * Prepínanie kariet dvoma prstami po trackpade (Jerry, 23. 9. 2026).
   *
   * macOS posiela vodorovné šmýkanie ako `wheel` s deltaX, nie ako
   * `touch`-udalosti — na touchpade žiadne prsty „nevidno". Preto sa
   * počúva koleso a sčítava sa vodorovný posun.
   *
   * Tri veci, bez ktorých to je na obtiaž:
   *   • zvislé rolovanie sa nesmie ukradnúť — keď je |deltaY| väčšie,
   *     gesto sa ignoruje, inak by sa karta prepla pri rolovaní zoznamu;
   *   • jedno gesto = jedna karta. Trackpad posiela desiatky udalostí za
   *     sekundu a bez zámku by jedno šmyknutie preletelo celou kopou;
   *   • zámok pustí až po chvíli ticha, nie po čase — dlhý dojazd zotrvačnosti
   *     na Macu inak prepne kartu druhýkrát, keď už prsty dávno nie sú na ploche.
   *
   * `passive: false` a preventDefault sú tu preto, aby Safari zo šmyknutia
   * neurobilo „krok späť v histórii" a appka sa nezavrela.
   */
  const kopa = useRef<HTMLDivElement | null>(null);
  const gesto = useRef({ suma: 0, zamknute: false, ticho: 0 as unknown as ReturnType<typeof setTimeout> });
  useEffect(() => {
    const el = kopa.current;
    if (!el || zive.length < 2) return;
    const PRAH = 60;
    const naKoleso = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      clearTimeout(gesto.current.ticho);
      gesto.current.ticho = setTimeout(() => { gesto.current.suma = 0; gesto.current.zamknute = false; }, 260);
      if (gesto.current.zamknute) return;
      gesto.current.suma += e.deltaX;
      if (Math.abs(gesto.current.suma) < PRAH) return;
      const smer = gesto.current.suma > 0 ? 1 : -1;
      gesto.current.zamknute = true;
      gesto.current.suma = 0;
      setI((x) => (x + smer + zive.length) % zive.length);
    };
    el.addEventListener("wheel", naKoleso, { passive: false });
    return () => { el.removeEventListener("wheel", naKoleso); clearTimeout(gesto.current.ticho); };
  }, [zive.length]);

  const spolu = karty.reduce((a, x) => a + x.polozky.length, 0);

  if (!zive.length) {
    return (
      <Card>
        <div style={{ padding: "28px 4px", textAlign: "center" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.green }}>Hotovo.</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 7, lineHeight: 1.6 }}>
            {vybavenych > 0
              ? `Vybavil si ${vybavenych} ${vybavenych === 1 ? "vec" : vybavenych < 5 ? "veci" : "vecí"}. Administratívu máš za sebou.`
              : trenerZPrihlasenia(ktoSom) === "Terezka"
                ? "Nič nečaká. Peniaze a uzávierku má na starosti Jerry."
                : "Nič nečaká. Administratívu máš za sebou."}
          </div>
        </div>
      </Card>
    );
  }

  const zostava = (x: Karta) => (x.polozky as (Zmena | NeznamyNazov | NepriradenaPlatba)[]).filter((p) => !hotove.has(klucPolozky(x.druh, p))).length;
  // Presvitajúce karty idú tiež dokola — na poslednej je za ňou prvá.
  const dalsie = zive.length > 1
    ? [1, 2].slice(0, Math.min(2, zive.length - 1)).map((o) => zive[(i + o) % zive.length])
    : [];

  return (
    // Celá šírka obrazovky, nie 1200 px ako zvyšok appky. Karta je pracovná
    // plocha — čím širšia, tým viac riadkov sa vybaví bez rolovania, a vpravo
    // zostane miesto na to, čo príde. Vylomenie z `maxWidth` rodiča je bežný
    // trik: 100vw a posun o polovicu rozdielu doľava.
    <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)", padding: "0 20px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11.5, color: C.textMuted, fontWeight: 700, whiteSpace: "nowrap" }}>
          Karta {Math.min(i + 1, zive.length)} z {zive.length}
        </div>
        <div style={{ flexGrow: 1, minWidth: 120, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${spolu ? (vybavenych / spolu) * 100 : 0}%`, height: "100%", background: C.accent, transition: "width .25s" }} />
        </div>
        <div style={{ fontSize: 12, color: C.textDim, whiteSpace: "nowrap" }}>
          {vybavenych > 0 ? `${vybavenych} vybavených` : `${spolu} vecí celkom`}
          {trenerZPrihlasenia(ktoSom) ? ` · len ${trenerZPrihlasenia(ktoSom) === "Jerry" ? "Jerryho" : "Terezkine"}` : ""}
        </div>
      </div>

      {/* KOPA: aktívna karta je cez celú šírku, ostatné ležia pod ňou a
          vykúkajú vpravo len okrajom.
          Predtým stáli vedľa seba v mriežke a Jerry na to povedal jasne:
          „ale ja chcem široké cez celú." Vedľa seba sa nedá mať oboje —
          buď je karta široká, alebo je vedľa nej miesto. Takto je: široká
          je, a to, že za ňou niečo je, hovorí okraj, nie stĺpec. */}
      {/* PEVNÁ výška, nie minimálna. Minimálna výšku len nadstavuje — karta
          s dlhým zoznamom aj tak narástla a šípky skákali. Fixná výška
          + `minHeight: 0` na rolovacom vnútri je jediná dvojica, ktorá vo
          flexe naozaj drží: bez tej nuly sa dieťa odmietne zmenšiť pod svoj
          obsah a `overflow` sa nikdy nezapne. */}
      <div ref={kopa} style={{ position: "relative", height: "min(72vh, 660px)" }}>
        {dalsie.map((d, j) => (
          <div
            key={d.druh}
            aria-hidden="true"
            style={{
              position: "absolute",
              top: (j + 1) * 9,
              left: (j + 1) * 9,
              right: -((j + 1) * 11),
              bottom: -((j + 1) * 9),
              borderRadius: 14,
              background: mix(C.border, 90),
              border: `1px solid ${mix(C.border, 150)}`,
              opacity: j === 0 ? 0.6 : 0.3,
              zIndex: 0,
            }}
          />
        ))}
        {/* Šípky sedia na BOKOCH karty, nie pod ňou.
            Jerry, 23. 9. 2026: „prepínanie medzi kartami by malo byť po
            stranách kariet, pretože keď chcem prepnúť, musím ďaleko
            zoskrolovať." Karta má vnútri zoznam na pol obrazovky, takže
            tlačidlo pod ňou je zakaždým na inom mieste a často mimo
            dohľadu. Bok je vždy tam, kde bol. */}
        {/* Kolotoč: z poslednej karty sa ide na prvú a naopak (Jerry, 23. 9.
            2026). Šípka na konci, ktorá sa nedá stlačiť, je slepá ulička —
            človek musí prejsť celú kopu späť, aby sa dostal o jednu ďalej. */}
        <button onClick={() => setI((x) => (x - 1 + zive.length) % zive.length)} aria-label="Predchádzajúca karta" style={bocnaSipka("left", zive.length > 1)}>‹</button>
        <button onClick={() => setI((x) => (x + 1) % zive.length)} aria-label="Ďalšia karta" style={bocnaSipka("right", zive.length > 1)}>›</button>
        {/* Karta má PEVNÚ výšku. Jerry, 23. 9. 2026: „karty musia byť stále
            rovnako veľké, aj keď je tam menej textu, aby miesto na pravej
            a ľavej strane, kde prepínam, bolo stále na tom istom mieste."
            Šípka, ktorá pri každej karte skočí inam, sa hľadá očami — a to je
            presne tá práca navyše, ktorú mala kopa odstrániť. */}
        <div style={{ position: "relative", zIndex: 1, margin: "0 46px", height: "100%" }}>
          <Card style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{k.nadpis}</div>
              {k.druh !== "klient" && <div style={{ fontSize: 11.5, color: C.textMuted }}>{zostava(k)} zostáva</div>}
            </div>
            <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 3 }}>{k.podnadpis}</div>

            <div style={{ marginTop: 14, flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              {/* Zoznamy rolujú vnútri; karta klienta si výšku riadi sama. */}
              <div style={{ flexGrow: 1, minHeight: 0, overflowY: k.druh === "klient" ? "visible" : "auto", display: k.druh === "klient" ? "flex" : "block", flexDirection: "column" }}>
              {k.druh === "zmeny" && k.polozky.map((z) => {
                const kluc = klucPolozky("zmeny", z);
                if (hotove.has(kluc)) return null;
                const t = text(kluc);
                return (
                  <div key={kluc} style={riadok}>
                    <div style={{ minWidth: 150, flex: "1 1 190px" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{z.klient || z.nazov || "(bez mena)"}</div>
                      <div style={{ fontSize: 11, color: C.textDim }}>{popisZmeny(z)} · {z.trener}</div>
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
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{n.nazov}</div>
                      <div style={{ fontSize: 11, color: C.textDim }}>{n.trener} · {n.pocet}× · {den(n.najblizsi)}</div>
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

              {k.druh === "klient" && <KlientStol clients={clients} mena={mena} data={data} kalUdalosti={kalUdalosti} btcSats={btcSats} btc={btc} />}

              {k.druh === "platby" && k.polozky.map((p) => {
                const kluc = klucPolozky("platby", p);
                if (hotove.has(kluc)) return null;
                const t = text(kluc, p.navrh);
                return (
                  <div key={kluc} style={riadok}>
                    <div style={{ minWidth: 50, fontSize: 11.5, color: C.textDim }}>{den(p.datum)}</div>
                    <div style={{ minWidth: 80, fontSize: 13, fontWeight: 700, textAlign: "right" }}>{kc(p.suma)}</div>
                    <div style={{ flex: "1 1 200px", minWidth: 150, fontSize: 11, color: C.textMuted }}>{p.text.slice(0, 96)}</div>
                    <input list="ws-klienti" value={t} onChange={(e) => nastavText(kluc, e.target.value)} placeholder="komu patrí…" style={vstup(!!t && !mena.includes(t))} />
                    <button onClick={() => void vybav(kluc, "/api/platby", { akcia: "priradz", fioId: p.fioId, klient: t.trim(), zapamataj: true })} disabled={pracujem === kluc || t.trim().length < 3} style={hlavne(t.trim().length >= 3)}>
                      {pracujem === kluc ? "…" : "Priradiť"}
                    </button>
                    <button onClick={() => void vybav(kluc, "/api/platby", { akcia: "nieKlient", fioId: p.fioId })} style={vedlajsie}>Nie je klient</button>
                  </div>
                );
              })}
              </div>
            </div>
            <datalist id="ws-klienti">{mena.map((m) => <option key={m} value={m} />)}</datalist>
            {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{chyba}</div>}
          </Card>
        </div>
      </div>

      {/* Bodky hovoria, koľko kariet je dokopy a kde v nich stojíš — číslo
          „Karta 2 z 3" to povie tiež, ale bodky to ukážu bez čítania.
          Sú to tlačidlá, nie ozdoba: dá sa nimi preskočiť rovno na kartu. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {zive.map((x, j) => (
            <button
              key={x.druh}
              onClick={() => setI(j)}
              aria-label={`${x.nadpis} (${zostava(x)} zostáva)`}
              title={`${x.nadpis} · ${zostava(x)} zostáva`}
              style={{
                width: j === i ? 11 : 8, height: j === i ? 11 : 8, borderRadius: "50%",
                border: "none", padding: 0, cursor: "pointer",
                background: j === i ? C.accent : j < i ? mix(C.green, 60) : mix(C.border, 160),
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: C.textDim }}>
          {zive.length > 1 ? `Ďalej: ${zive[(i + 1) % zive.length].nadpis}` : ""}
        </div>
      </div>
    </div>
  );
}

const riadok = {
  display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const,
  padding: "7px 0", borderBottom: `1px solid ${mix(C.border, 55)}`,
};

const vstup = (varovanie: boolean) => ({
  flex: "0 1 190px", minWidth: 150, padding: "6px 9px", borderRadius: 8, fontSize: 12,
  border: `1px solid ${varovanie ? C.orange : C.border}`, background: C.bg, color: C.text,
});

const stitok = (on: boolean) => ({
  padding: "4px 9px", borderRadius: 7, fontSize: 11, cursor: "pointer",
  border: `1px solid ${on ? C.accent : C.border}`,
  background: on ? C.accentBg : "transparent",
  color: on ? C.accentLight : C.textMuted,
});

const hlavne = (aktivne: boolean) => ({
  padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600,
  cursor: aktivne ? "pointer" : "not-allowed",
  border: `1px solid ${aktivne ? mix(C.green, 50) : C.border}`,
  background: aktivne ? mix(C.green, 12) : "transparent",
  color: aktivne ? C.green : C.textDim,
});

const vedlajsie = {
  padding: "6px 10px", borderRadius: 8, fontSize: 11.5, cursor: "pointer",
  border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
};

/**
 * Šípka prilepená na bok karty, zvisle v strede a stále na mieste.
 * `position: sticky` na zvislej osi by nefungovala (karta je v obyčajnom
 * toku), preto absolútne umiestnenie voči kope — a `top: 50%` s posunom
 * o polovicu vlastnej výšky ju drží v strede bez ohľadu na to, aký dlhý
 * je zoznam vnútri.
 */
const bocnaSipka = (strana: "left" | "right", aktivna: boolean) => ({
  position: "absolute" as const,
  [strana]: 0,
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 2,
  width: 38, height: 64, borderRadius: 12, fontSize: 24, lineHeight: 1,
  cursor: aktivna ? "pointer" : "not-allowed",
  border: `1px solid ${C.border}`,
  background: mix(C.border, 60),
  color: aktivna ? C.textMuted : C.textDim,
  opacity: aktivna ? 1 : 0.35,
});

