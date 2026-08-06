import { useRef, useState } from "react";

import { fmtCZK } from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info } from "./ui";
import { VyberKategorie } from "./VyberKategorie";

// Zošit hotovostných platieb.
//
// Hotovosť sa v PSB zapisuje rukou a do appky nemala ako doraziť — chýbala
// tak časť nákladov aj časť výplat, a P&L o nej mlčalo. Fotka do Jarvisa síce
// text prečíta, ale odpoveď v chate sa nedá skontrolovať riadok po riadku ani
// potvrdiť. Ide o peniaze, takže to má ten istý dvojkrok ako Fio: najprv
// NÁHĽAD, kde sa dá všetko prepísať, až potom zápis.
//
// Rukopis sa mýli na číslach a nikdy sa nemýli nahlas — preto model označuje
// riadky, ktorými si nie je istý, a tie sú tu zvýraznené. Neistý riadok nie je
// chyba nástroja, je to jediná poctivá odpoveď na rozmazanú číslicu.

type Riadok = {
  datum: string;
  popis: string;
  suma: number;
  poznamka: string;
  isty: boolean;
  kategoria?: string;
  vypnuty?: boolean;
};

// Dátum sa zobrazuje ako v zošite: „14.5." Rok je hore vo vlastnom poli a
// opakovať ho v každom riadku je šum — pri tridsiatich riadkoch to je tridsať
// zbytočných čísel medzi tými, ktoré treba naozaj skontrolovať.
//
// Vnútri sa ale drží celý ISO dátum: zapisuje sa do rovnakej tabuľky ako
// bankové pohyby a tam neúplný dátum nemá čo robiť.
const naDenMesiac = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])}.${Number(m[2])}.` : iso;
};

/** „14.5." + rok → ISO. Vracia null, keď sa to nedá prečítať. */
const zDenMesiac = (text: string, rok: string): string | null => {
  const m = /^\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*$/.exec(text);
  if (!m) return null;
  const d = Number(m[1]);
  const mes = Number(m[2]);
  if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
  return `${rok}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

const dataUrl = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = rej;
  r.readAsDataURL(f);
});

export function Zosit({ onZapisane }: { onZapisane?: () => void }) {
  const [riadky, setRiadky] = useState<Riadok[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [stav, setStav] = useState("");
  const [vysledok, setVysledok] = useState<string | null>(null);
  const [rok, setRok] = useState(String(new Date().getFullYear()));
  const [nadZonou, setNadZonou] = useState(false);
  // Poradie riadkov. Chronologicky sa to kontroluje proti papieru, opačne sa
  // hľadá posledný zápis — obe sa hodia, tak nech sa dá prepnúť. Nemení to
  // dáta, len pohľad; zapisuje sa vždy všetko označené.
  const [odNajstarsich, setOdNajstarsich] = useState(true);
  /** Rozpísaný text v poli dátumu — kým sa nedá prečítať, ISO sa nemení. */
  const [denMesiac, setDenMesiac] = useState<Record<number, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const nacitaj = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setStav("Čítam rukopis…");
    setVysledok(null);
    try {
      const obrazky = await Promise.all(Array.from(files).slice(0, 4).map(dataUrl));
      const r = await fetch("/api/zosit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ obrazky, rok }),
      });
      const j = (await r.json()) as { ok?: boolean; riadky?: Riadok[]; error?: string; zahodenych?: number };
      if (!j.ok || !j.riadky) { setStav(j.error || "Nepodarilo sa prečítať."); return; }
      // Nové riadky sa pripájajú — zošit má dve strany a fotí sa po častiach.
      setRiadky((p) => [...(p || []), ...j.riadky!.map((x) => ({ ...x, kategoria: "", vypnuty: false }))]);
      setStav(`Prečítaných ${j.riadky.length} riadkov${j.zahodenych ? ` (${j.zahodenych} sa nedalo prečítať)` : ""}. Skontroluj ich, potom zapíš.`);
    } catch (e) {
      setStav(`Nepodarilo sa: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const uprav = (i: number, patch: Partial<Riadok>) =>
    setRiadky((p) => p!.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const zapis = async () => {
    if (!riadky) return;
    const doZapisu = riadky.filter((r) => !r.vypnuty);
    if (!doZapisu.length) return;
    setBusy(true);
    setStav("Zapisujem…");
    try {
      const r = await fetch("/api/fio", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          akcia: "zapis",
          // Hotovosť ide do tej istej tabuľky ako banka — nie do vlastnej.
          // Kategorizácia, P&L aj Zapísané pohyby tak fungujú bez ďalšieho
          // kódu; „typ" povie, odkiaľ riadok prišiel.
          riadky: doZapisu.map((x) => ({
            id: "", datum: x.datum, suma: x.suma,
            protistrana: x.popis,
            poznamka: [x.poznamka, "zo zošita"].filter(Boolean).join(" · "),
            typ: "hotovosť", kategoria: x.kategoria || "",
          })),
        }),
      });
      const j = (await r.json()) as { ok?: boolean; pridane?: number; preskocene?: number; zamknute?: number; error?: string };
      if (!j.ok) { setStav(j.error || "Zápis zlyhal."); return; }
      setVysledok(
        `Zapísaných ${j.pridane ?? 0}` +
        (j.preskocene ? ` · ${j.preskocene} už bolo v databáze` : "") +
        (j.zamknute ? ` · ${j.zamknute} v zamknutom mesiaci` : ""),
      );
      setRiadky(null);
      // Rozpísané dátumy sú kľúčované indexom riadku — ďalšia dávka by ich
      // zdedila a riadok č. 3 by ukazoval dátum z riadku č. 3 minulej strany.
      setDenMesiac({});
      setStav("");
      onZapisane?.();
    } catch (e) {
      setStav(`Zápis zlyhal: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // Dôležité: triedi sa POHĽAD, nie pole. Každý riadok si nesie pôvodný index,
  // takže úprava zapíše tam, kam patrí, aj keď je poradie prehodené.
  const zoradene = riadky
    ? riadky.map((r, i) => ({ r, i })).sort((a, b) => (odNajstarsich ? 1 : -1) * a.r.datum.localeCompare(b.r.datum))
    : [];
  const neisté = riadky?.filter((r) => !r.isty && !r.vypnuty).length ?? 0;
  const spolu = riadky?.filter((r) => !r.vypnuty).reduce((a, r) => a + r.suma, 0) ?? 0;

  return (
    <Card>
      <H3>
        <Info
          label="Zošit — hotovostné platby"
          text="Odfoť stranu zošita a appka z nej spraví riadky, ktoré sa dajú opraviť a potom zapísať. Zapisujú sa do tej istej tabuľky ako pohyby z banky, takže sa objavia v P&L aj v Zapísaných pohyboch. Riadky, ktorými si model nie je istý, sú zvýraznené — rukopis sa mýli na číslach a nikdy sa nemýli nahlas, tak sa to radšej povie."
        />
      </H3>

      {/* Pretiahnutie je pri fotke prirodzenejšie než dialóg na výber súboru —
          fotka býva už otvorená vedľa. Klik zostáva pre mobil, kde sa ťahať
          nedá a `capture` otvorí rovno fotoaparát. */}
      <div
        onDragOver={(e) => { e.preventDefault(); setNadZonou(true); }}
        onDragLeave={() => setNadZonou(false)}
        onDrop={(e) => { e.preventDefault(); setNadZonou(false); void nacitaj(e.dataTransfer.files); }}
        onClick={() => !busy && inputRef.current?.click()}
        style={{
          border: `2px dashed ${nadZonou ? C.accent : C.border}`,
          background: nadZonou ? mix(C.accent, 10) : "transparent",
          borderRadius: 10, padding: "14px 16px", textAlign: "center",
          cursor: busy ? "default" : "pointer", marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 13, color: C.text }}>
          {busy ? "Čítam rukopis…" : riadky ? "Pretiahni sem ďalšiu stranu — alebo klikni" : "Pretiahni sem fotku strany zošita — alebo klikni"}
        </div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
          Aj viac strán naraz. Riadky sa pripoja k tým, čo už máš v náhľade.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontSize: 11.5, color: C.textDim, display: "flex", alignItems: "center", gap: 6 }}>
          Rok
          <input
            value={rok}
            onChange={(e) => setRok(e.target.value.replace(/\D/g, "").slice(0, 4))}
            style={{ width: 62, padding: "4px 7px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}
          />
          <span>— v zošite je len deň a mesiac</span>
        </label>
        <input
          ref={inputRef} type="file" accept="image/*" multiple capture="environment"
          style={{ display: "none" }}
          onChange={(e) => { void nacitaj(e.target.files); e.target.value = ""; }}
        />
      </div>

      {stav && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, lineHeight: 1.5 }}>{stav}</div>}
      {vysledok && (
        <div style={{ fontSize: 12.5, color: C.green, background: mix(C.green, 10), border: `1px solid ${mix(C.green, 30)}`, borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
          {vysledok}
        </div>
      )}

      {riadky && riadky.length > 0 && (
        <>
          {neisté > 0 && (
            <div style={{ fontSize: 12, color: C.orange, background: mix(C.orange, 9), border: `1px solid ${mix(C.orange, 30)}`, borderRadius: 8, padding: "8px 10px", marginBottom: 9, lineHeight: 1.5 }}>
              <b>{neisté}</b> {neisté === 1 ? "riadok je" : neisté < 5 ? "riadky sú" : "riadkov je"} označených ako neistý prepis —
              sú podfarbené. Skontroluj ich proti papieru skôr, než zapíšeš.
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${mix(C.accent, 35)}` }}>
                  {["", "Dátum", "Popis", "Suma", "Kategória"].map((h, i) => (
                    <th key={i} style={{ textAlign: i === 3 ? "right" : "left", padding: "7px 8px", fontSize: 11, color: C.textMuted, fontWeight: 600 }}>
                      {i === 1 ? (
                        <button
                          onClick={() => setOdNajstarsich((o) => !o)}
                          title="Prepnúť poradie"
                          style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Dátum {odNajstarsich ? "↑" : "↓"}
                        </button>
                      ) : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zoradene.map(({ r, i }) => (
                  <tr key={i} style={{
                    background: r.vypnuty ? "transparent" : r.isty ? "transparent" : mix(C.orange, 8),
                    opacity: r.vypnuty ? 0.4 : 1,
                    borderBottom: `1px solid ${mix(C.border, 50)}`,
                  }}>
                    <td style={{ padding: "5px 8px", width: 28 }}>
                      <input
                        type="checkbox" checked={!r.vypnuty}
                        onChange={(e) => uprav(i, { vypnuty: !e.target.checked })}
                        title="Zapísať tento riadok"
                        style={{ accentColor: C.accent, cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                      <input
                        value={denMesiac[i] ?? naDenMesiac(r.datum)}
                        onChange={(e) => {
                          const t = e.target.value;
                          setDenMesiac((p) => ({ ...p, [i]: t }));
                          // Prepíše sa len keď sa dátum dá prečítať — inak by
                          // sa pri písaní „1" stratil zvyšok riadku.
                          const iso = zDenMesiac(t, r.datum.slice(0, 4) || rok);
                          if (iso) uprav(i, { datum: iso });
                        }}
                        onBlur={() => setDenMesiac((p) => { const n = { ...p }; delete n[i]; return n; })}
                        placeholder="14.5."
                        style={{ width: 62, padding: "4px 6px", borderRadius: 5, border: `1px solid ${zDenMesiac(denMesiac[i] ?? naDenMesiac(r.datum), rok) ? (r.isty ? C.border : mix(C.orange, 45)) : C.red}`, background: C.bg, color: C.text, fontSize: 12, textAlign: "center" }}
                      />
                      {/* Rok sa ukáže LEN keď sedí iný než nastavený hore —
                          napríklad pri prelome roka. Vtedy je to jediná vec,
                          ktorá riadok odlišuje, a schovať ju by bola chyba. */}
                      {r.datum.slice(0, 4) !== rok && (
                        <span style={{ fontSize: 11, color: C.orange, marginLeft: 5 }}>{r.datum.slice(0, 4)}</span>
                      )}
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <input
                        value={r.popis} onChange={(e) => uprav(i, { popis: e.target.value })}
                        style={{ width: "100%", minWidth: 140, padding: "4px 6px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}
                      />
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>
                      <input
                        value={String(r.suma)}
                        onChange={(e) => uprav(i, { suma: Number(e.target.value.replace(/[^\d-]/g, "")) || 0 })}
                        style={{ width: 92, padding: "4px 6px", borderRadius: 5, border: `1px solid ${r.isty ? C.border : mix(C.orange, 45)}`, background: C.bg, color: r.suma < 0 ? C.red : C.green, fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      />
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <VyberKategorie hodnota={r.kategoria || ""} onZmena={(k) => uprav(i, { kategoria: k })} sirka={190} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 11 }}>
            <button
              onClick={() => void zapis()}
              disabled={busy}
              style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 8, padding: "7px 16px", color: C.accentLight, fontSize: 12.5, cursor: busy ? "default" : "pointer" }}
            >
              Zapísať {riadky.filter((r) => !r.vypnuty).length} riadkov
            </button>
            <button
              onClick={() => { setRiadky(null); setDenMesiac({}); setStav(""); }}
              style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}
            >
              Zahodiť
            </button>
            <span style={{ fontSize: 11.5, color: C.textDim, fontVariantNumeric: "tabular-nums" }}>
              Súčet označených: <b style={{ color: spolu < 0 ? C.red : C.green }}>{fmtCZK(spolu)}</b>
            </span>
          </div>
        </>
      )}

      {!riadky && !busy && !vysledok && (
        <Empty>Odfoť stranu zošita — appka z nej spraví riadky, ktoré si pred zápisom skontroluješ a opravíš.</Empty>
      )}
    </Card>
  );
}
