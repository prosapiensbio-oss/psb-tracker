import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BtcNakup } from "../../lib/psb/client";
import { parseFaktura, precoNieFaktura, type Faktura } from "../../lib/psb/faktura";
import { platbaKDokladu } from "../../lib/psb/btcKFakture";
import { VYPLATY_JERRY } from "../../lib/psb/fio";
import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import { oznam, pocuvaj } from "../../lib/psb/obnovaSignal";
import { maTextovuVrstvu, pdfRiadky } from "../../lib/psb/pdftext";
import { C, mix } from "../../lib/psb/theme";
import { BtcParovanie } from "./BtcParovanie";
import { FakturyNahlad } from "./Faktury";
import { VyberKategorie } from "./VyberKategorie";

/**
 * ALZA A NÁKUPY BITCOINOM — krok mesačnej uzávierky (9. 10. 2026).
 *
 * Jerry: „tie Alza platby si predstavujem ako samostatnú súčasť mesačnej
 * uzávierky, kde mám priestor nahrať faktúry z Alzy, Kokpit ich spáruje
 * s BTC platbami a ja rozdelím položky na faktúrach — čo je náklad, výplata,
 * Ahsoka." Diely existovali v Upload (nahrávanie, rozpis, párovanie), len
 * roztrúsené; tu sú za jeden mesiac na jednom mieste a v poradí práce:
 *
 *   1 · nahraj PDF → rozpis na položky s kategóriou → zapísať
 *   2 · faktúry mesiaca: kategória sa dá zmeniť aj po zapísaní
 *   3 · platby bitcoinom mesiaca bez faktúry: spárovať, alebo „súkromné"
 *
 * Párovanie robí App (automat podľa dňa a sumy + ručné páry); po zápise sa
 * cez signál „peniaze" prepočíta a tento krok to uvidí.
 */
type Polozka = { id: string; faktura: string; dodavatel: string; datum: string; nazov: string; ks: number; cena: number; kategoria: string };
type BtcUzavierky = {
  platby: BtcNakup[];
  faktury: { cislo: string; datum: string; celkom: number; dodavatel: string; obsadena?: boolean }[];
  parovanie: Record<string, string[]>;
  onSparuj: (id: number, f: string[]) => void;
};

/** Rýchle voľby — to, čo sa na Alze kupuje najčastejšie mimo nákladov firmy. */
const RYCHLE: { kat: string; text: string }[] = [
  { kat: VYPLATY_JERRY, text: "výplata Jerry" },
  { kat: "spolocne.Ahsoka", text: "Ahsoka" },
];

/**
 * KĽÚČ, POD KTORÝM ČAKÁ ROZPÍSANÁ, ALE NEPOTVRDENÁ FAKTÚRA.
 *
 * Jerry, 9. 10. 2026: „nahral som 1 faktúru, aj to som ju nepotvrdil,
 * a ukazuje mi, že je všetko hotové a zaradené." Mal pravdu: rozpis žil len
 * v pamäti komponentu, takže o ňom nevedel ani krok uzávierky, ani on sám po
 * obnovení stránky. To isté už raz riešil náhľad zošita.
 */
export const ALZA_CAKA = "psb-alza-caka";

/**
 * Prečo localStorage a nie sessionStorage: Jerry, 9. 10. 2026 — „keď nahrám
 * dokumenty a odídem niekam preč, je to nastavené tak, aby som o tú robotu
 * neprišiel?" Session zomrie so zavretou kartou; rozpis faktúr je práca na
 * dvadsať minút a nemá ju zmazať zatvorené okno. To isté robí náhľad zošita.
 */

export function AlzaUzavierka({ mesiac, btc }: { mesiac: string; btc?: BtcUzavierky }) {
  const [nove, setNove] = useState<Faktura[]>(() => {
    try {
      const x = JSON.parse(localStorage.getItem(ALZA_CAKA) || "null") as { mesiac?: string; faktury?: Faktura[] } | null;
      return x && x.mesiac === mesiac && Array.isArray(x.faktury) ? x.faktury : [];
    } catch { return []; }
  });
  // Čo čaká na potvrdenie, musí byť vidieť aj mimo tejto karty.
  useEffect(() => {
    try {
      if (nove.length) localStorage.setItem(ALZA_CAKA, JSON.stringify({ mesiac, faktury: nove }));
      else localStorage.removeItem(ALZA_CAKA);
      oznam("peniaze");
    } catch { /* bez úložiska ostane rozpis len do obnovenia */ }
  }, [nove, mesiac]);
  const [chyby, setChyby] = useState<string[]>([]);
  const [polozky, setPolozky] = useState<Polozka[] | null>(null);
  const [uklada, setUklada] = useState("");
  const [chyba, setChyba] = useState("");
  const vstup = useRef<HTMLInputElement>(null);
  const [nadZonou, setNadZonou] = useState(false);

  const nacitaj = useCallback(() => {
    void fetch("/api/faktury", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((j: { polozky?: Polozka[] }) => setPolozky((j.polozky || []).filter((p) => String(p.datum || "").slice(0, 7) === mesiac)))
      .catch(() => setPolozky([]));
  }, [mesiac]);
  useEffect(() => { nacitaj(); return pocuvaj("peniaze", nacitaj); }, [nacitaj]);

  /** Prečítanie PDF v prehliadači — tá istá cesta ako v Upload. */
  const nahraj = async (subory: File[]) => {
    const fa: Faktura[] = [];
    const zle: string[] = [];
    for (const f of subory.filter((x) => /\.pdf$/i.test(x.name) || x.type === "application/pdf")) {
      try {
        const riadky = await pdfRiadky(await f.arrayBuffer());
        const doklad = maTextovuVrstvu(riadky) ? parseFaktura(riadky) : null;
        if (doklad) fa.push(doklad);
        else zle.push(`${f.name}: ${precoNieFaktura(riadky) || "faktúru sa nepodarilo rozpísať"}`);
      } catch (e) {
        zle.push(`${f.name}: čítanie PDF spadlo (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    setNove((p) => [...p, ...fa]);
    setChyby(zle);
  };

  const zmenKategoriu = async (p: Polozka, kategoria: string) => {
    setUklada(p.id); setChyba("");
    const j = await fetch("/api/faktury", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "kategoria", id: p.id, kategoria }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setUklada("");
    if (!j?.ok) { setChyba(j?.error || "Neuložilo sa."); return; }
    setPolozky((x) => (x || []).map((q) => (q.id === p.id ? { ...q, kategoria } : q)));
    oznam("peniaze");
  };

  // Faktúry mesiaca po dokladoch, s tým, či ich drží platba bitcoinom.
  const doklady = useMemo(() => {
    const m = new Map<string, { cislo: string; datum: string; dodavatel: string; polozky: Polozka[] }>();
    for (const p of polozky || []) {
      const d = m.get(p.faktura) || { cislo: p.faktura, datum: p.datum, dodavatel: p.dodavatel, polozky: [] };
      d.polozky.push(p);
      m.set(p.faktura, d);
    }
    const rucne = new Set(Object.values(btc?.parovanie || {}).flat());
    const obsadene = new Set((btc?.faktury || []).filter((f) => f.obsadena).map((f) => f.cislo));
    const vsetky = [...m.values()].map((d) => ({ ...d, celkom: d.polozky.reduce((a, p) => a + p.cena, 0) }));
    // Ručný pár vie, KTORÁ platba to je; inak sa hľadá podľa dňa a sumy
    // (`platbaKDokladu`) — to isté, čo vidno hneď pri nahratí.
    const rucnaPreDoklad = new Map<string, string>();
    for (const [id, cisla] of Object.entries(btc?.parovanie || {})) for (const c of cisla) rucnaPreDoklad.set(c, id);
    const platby = (btc?.platby || []).map((x) => ({ id: x.id, datum: x.datum, czk: x.czk || 0, poznamka: x.poznamka }));
    return vsetky
      .map((d) => {
        const rucnaId = rucnaPreDoklad.get(d.cislo);
        const rucna = rucnaId ? platby.find((x) => String(x.id) === rucnaId) : undefined;
        const najdena = rucna ? { platba: rucna, isto: true } : platbaKDokladu(d, platby, vsetky);
        return { ...d, sparovana: rucne.has(d.cislo) || obsadene.has(d.cislo), platba: najdena };
      })
      .sort((a, b) => a.datum.localeCompare(b.datum));
  }, [polozky, btc]);
  const nezaradene = (polozky || []).filter((p) => !p.kategoria).length;
  const platbyMesiaca = useMemo(() => (btc?.platby || []).filter((p) => String(p.datum).slice(0, 7) === mesiac), [btc, mesiac]);

  const nadpis = (n: string, t: string) => (
    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: "14px 0 6px" }}>{n} · {t}</div>
  );

  return (
    <div>
      {nadpis("1", "Nahraj faktúry z Alzy (PDF)")}
      <div
        onDragOver={(e) => { e.preventDefault(); setNadZonou(true); }}
        onDragLeave={() => setNadZonou(false)}
        onDrop={(e) => { e.preventDefault(); setNadZonou(false); void nahraj([...e.dataTransfer.files]); }}
        onClick={() => vstup.current?.click()}
        style={{ border: `1.5px dashed ${nadZonou ? C.accent : C.border}`, borderRadius: 12, padding: "16px 14px", textAlign: "center", cursor: "pointer", background: nadZonou ? mix(C.accent, 8) : "transparent", fontSize: 12.5, color: C.textMuted }}
      >
        Pretiahni sem PDF faktúry z Alzy (aj viac naraz), alebo klikni a vyber. Alza → Môj účet › Objednávky › Faktúra.
        <input ref={vstup} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { void nahraj([...(e.target.files || [])]); e.target.value = ""; }} />
      </div>
      {chyby.length > 0 && <div style={{ fontSize: 12, color: C.orange, marginTop: 6 }}>{chyby.join(" · ")}</div>}
      {nove.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <FakturyNahlad faktury={nove} btcPlatby={platbyMesiaca.map((x) => ({ id: x.id, datum: x.datum, czk: x.czk || 0, poznamka: x.poznamka }))} onZmena={(i, f) => setNove((p) => p.map((x, j) => (j === i ? f : x)))} onHotovo={() => { setNove([]); nacitaj(); }} />
        </div>
      )}

      {nadpis("2", `Faktúry za ${mesiac} — rozdeľ položky`)}
      {polozky === null ? (
        <div style={{ fontSize: 12, color: C.textDim }}>načítavam faktúry…</div>
      ) : !doklady.length ? (
        <div style={{ fontSize: 12, color: C.textDim }}>Za tento mesiac nie je zapísaná žiadna faktúra.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {nezaradene > 0 && <div style={{ fontSize: 12, color: C.orange }}>{nezaradene} {nezaradene === 1 ? "položka nemá" : "položiek nemá"} kategóriu — bez nej v P&L chýba.</div>}
          {doklady.map((d) => (
            <div key={d.cislo} style={{ border: `1px solid ${mix(C.border, 70)}`, borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{fmtDMY(d.datum)} · {d.dodavatel || "faktúra"}</span>
                <span style={{ fontSize: 11, color: C.textDim }}>{d.cislo}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{fmtCZK(d.celkom)}</span>
                <span style={{ fontSize: 11, color: d.sparovana ? C.green : d.platba ? C.orange : C.textDim, marginLeft: "auto" }}>
                  {d.platba
                    ? `${d.sparovana ? "✓ spárovaná" : "₿ zrejme"} · platba ${fmtDMY(d.platba.platba.datum)} ${fmtCZK(Math.round(d.platba.platba.czk))}${d.platba.isto ? "" : " (viac platieb sedí)"}`
                    : d.sparovana ? "✓ spárovaná s platbou bitcoinom" : "bez platby bitcoinom — z účtu alebo kartou"}
                </span>
              </div>
              {d.polozky.map((p) => (
                <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "4px 0", borderTop: `1px solid ${mix(C.border, 45)}` }}>
                  <span style={{ fontSize: 12, color: C.text, flex: "1 1 220px", minWidth: 0 }}>{p.nazov}</span>
                  <span style={{ fontSize: 12, color: C.text, minWidth: 74, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCZK(p.cena)}</span>
                  {RYCHLE.map((r) => (
                    <button key={r.kat} disabled={uklada === p.id} onClick={() => void zmenKategoriu(p, r.kat)}
                      style={{ padding: "3px 9px", borderRadius: 12, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                        border: `1px solid ${p.kategoria === r.kat ? C.accent : C.border}`, background: p.kategoria === r.kat ? C.accentBg : "transparent",
                        color: p.kategoria === r.kat ? C.accentLight : C.textMuted }}>
                      {r.text}
                    </button>
                  ))}
                  <VyberKategorie hodnota={p.kategoria} sirka={230} onZmena={(k) => void zmenKategoriu(p, k)} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{chyba}</div>}

      {nadpis("3", "Platby bitcoinom bez faktúry")}
      {btc ? (
        <BtcParovanie platby={platbyMesiaca} faktury={btc.faktury} parovanie={btc.parovanie} onSparuj={btc.onSparuj} />
      ) : <div style={{ fontSize: 12, color: C.textDim }}>Bitcoinová kniha nie je načítaná.</div>}
    </div>
  );
}
