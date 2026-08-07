import { type ReactNode, useEffect, useMemo, useState } from "react";
import { C, mix } from "../../lib/psb/theme";
import { BulletGraph, Info, Sparkline, Trend } from "./ui";

/**
 * Panel prístrojov — prvá obrazovka Kokpitu.
 *
 * Postavené podľa troch zdrojov, ktoré hovoria to isté:
 *
 * 1. Stephen Few (Information Dashboard Design): dashboard je JEDNA obrazovka
 *    na sledovanie, nie na analýzu; 5–9 čísel je strop; číslo bez referencie
 *    (cieľ, priemer, pásmo) sa nedá interpretovať a je teda zbytočné.
 * 2. Airbus „dark cockpit": keď je všetko v norme, NESVIETI NIČ. Zelený pás
 *    „všetko v poriadku" je rozsvietená kontrolka normálneho stavu — presne to,
 *    čo sa v kabíne nerobí. Tichý stav je jeden riadok drobným písmom.
 * 3. Endsley (situational awareness): vnímanie → pochopenie → predvídanie.
 *    Sťažnosť „nemám okamžitý situačný prehľad" je presne chýbajúca druhá a
 *    tretia úroveň — čísla tu boli, ale nič nehovorilo, či sú dobré a kam idú.
 *    Preto má každá dlaždica pásmo (dobré/na hrane/zlé) a sparkline.
 *
 * Dôležité: tmavý kokpit potláča VÝSTRAHY, nie PRÍSTROJE. Airbus nezhasína
 * letové displeje — pilot musí mať stále pred sebou svojich pár čísel, inak
 * stratí cit pre to, čo je normálne. Preto dlaždice svietia vždy; farbu má
 * len to, čo sa vymklo.
 *
 * Predtým tu bol zoznam 25 rozbalených upozornení cez celú šírku a prvé číslo
 * začínalo pod ohybom obrazovky.
 */

export type Pasmo = "ok" | "pozor" | "zle" | "nevie";

export type Pristroj = {
  id: string;
  label: string;
  hodnota: string;
  podnadpis?: string;
  pasmo: Pasmo;
  /** Jedna veta pod číslom: prečo je to mimo, alebo aké je pásmo. */
  poznamka?: string;
  vysvetlenie: string;
  seria?: number[];
  zmenaPct?: number | null;
  /** Pri nákladoch a odchodoch je rast zlá správa — obracia farbu šípky. */
  dobreHore?: boolean;
  kam?: () => void;
  /** Kotviaci prístroj: väčší, vľavo hore, s pruhom proti cieľu. */
  kotva?: { hodnota: number; ciel: number; cielLabel: string };
};

const farbaPasma = (p: Pasmo) => (p === "zle" ? C.red : p === "pozor" ? C.orange : p === "nevie" ? C.textDim : C.text);

/**
 * Značka stavu. Farba sama nestačí — červeno-zelenú nerozlíši zhruba každý
 * dvanásty muž, a to je presne tá dvojica, na ktorej stojí semafor. Preto
 * tvar (trojuholník / kruh) aj slovo, nie len odtieň.
 */
function Znacka({ pasmo }: { pasmo: Pasmo }) {
  if (pasmo === "ok" || pasmo === "nevie") return null;
  const zle = pasmo === "zle";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: zle ? C.red : C.orange, whiteSpace: "nowrap" }}>
      <span aria-hidden>{zle ? "▲" : "●"}</span>
      {zle ? "riešiť" : "sledovať"}
    </span>
  );
}

function Dlazdica({ p, velka }: { p: Pristroj; velka?: boolean }) {
  const [hover, setHover] = useState(false);
  const mimo = p.pasmo === "pozor" || p.pasmo === "zle";
  const farba = farbaPasma(p.pasmo);
  return (
    <div
      onClick={p.kam}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: mimo ? mix(p.pasmo === "zle" ? C.red : C.orange, 7) : C.card,
        border: `1px solid ${mimo ? mix(farba, 38) : C.border}`,
        // Pásik naľavo je jediná plocha, ktorú prístroj v poriadku nemá. Oko ho
        // nájde aj periférne, bez čítania.
        borderLeft: `3px solid ${mimo ? farba : "transparent"}`,
        borderRadius: 10,
        padding: velka ? "14px 16px" : "11px 13px",
        cursor: p.kam ? "pointer" : "default",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        transition: "border-color .15s, background .15s",
        ...(hover && p.kam ? { borderColor: mix(C.accent, 45) } : null),
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginBottom: velka ? 5 : 3 }}>
        <span style={{ fontSize: velka ? 11.5 : 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.label}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <Znacka pasmo={p.pasmo} />
          <Info text={p.vysvetlenie} />
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: velka ? 34 : 21, fontWeight: 700, color: farba, lineHeight: 1.1, whiteSpace: "nowrap" }}>{p.hodnota}</div>
          {p.podnadpis && <div style={{ fontSize: velka ? 11.5 : 10.5, color: C.textDim, marginTop: 2 }}>{p.podnadpis}</div>}
        </div>
        {p.seria && p.seria.length > 1 && (
          <Sparkline values={p.seria} color={mimo ? farba : mix(C.accent, 65)} width={velka ? 108 : 68} height={velka ? 32 : 22} />
        )}
      </div>

      {p.kotva && (
        <div style={{ marginTop: 10 }}>
          <BulletGraph hodnota={p.kotva.hodnota} ciel={p.kotva.ciel} farba={mimo ? farba : mix(C.accent, 80)} label={p.kotva.cielLabel} />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: velka ? 8 : 6, flexWrap: "wrap" }}>
        {p.zmenaPct !== undefined && <Trend zmenaPct={p.zmenaPct ?? null} dobreHore={p.dobreHore ?? true} tiche={!mimo} />}
        {p.poznamka && (
          <span style={{ fontSize: 10.5, color: mimo ? farba : C.textDim, lineHeight: 1.35 }}>{p.poznamka}</span>
        )}
      </div>
    </div>
  );
}

// ── Čo sa zmenilo od minule ──────────────────────────────────────────────────
// Iné než výstrahy: výstraha je „teraz je niečo zle", toto je „toto sa stalo,
// kým si sa nepozeral". Kokpit sa neotvára každý deň a bez tohto riadku sa
// nedá odlíšiť nové číslo od toho, ktoré tam bolo aj minule.

const SNAP_KEY = "psb-prehlad-snapshot";

type Snapshot = { ts: number; hodnoty: Record<string, number> };

export type Zmena = { label: string; z: number; na: number; fmt: (n: number) => string; dobreHore: boolean };

function nacitajSnapshot(): Snapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(SNAP_KEY) || "null");
    return s && typeof s.ts === "number" && s.hodnoty ? s : null;
  } catch {
    return null;
  }
}

/**
 * Porovná dnešok s posledným otvorením a snapshot prepíše. Zapisuje sa len raz
 * za pol dňa — inak by dve otvorenia po sebe zmazali všetko, čo sa medzitým
 * stalo, a riadok by bol navždy prázdny.
 */
export function useZmenyOdMinule(hodnoty: Record<string, number>, pripravene: boolean) {
  const [stav, setStav] = useState<{ ts: number; predtym: Record<string, number> } | null>(null);
  useEffect(() => {
    if (!pripravene) return;
    const stary = nacitajSnapshot();
    const teraz = Date.now();
    if (stary) setStav({ ts: stary.ts, predtym: stary.hodnoty });
    if (!stary || teraz - stary.ts > 12 * 3600_000) {
      try {
        localStorage.setItem(SNAP_KEY, JSON.stringify({ ts: teraz, hodnoty }));
      } catch {
        /* ignore */
      }
    }
    // Zámerne bez `hodnoty` v závislostiach: snapshot sa porovná a uloží raz pri
    // otvorení, nie pri každom prepočte modelu.
  }, [pripravene]); // eslint-disable-line react-hooks/exhaustive-deps
  return stav;
}

const predDnami = (ts: number) => {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return "dnes";
  if (d === 1) return "včera";
  return `pred ${d} dňami`;
};

function ZmenyRiadok({ ts, zmeny }: { ts: number; zmeny: Zmena[] }) {
  if (!zmeny.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "7px 12px", borderRadius: 9, background: mix(C.blue, 6), border: `1px solid ${mix(C.blue, 20)}`, marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: C.textDim, whiteSpace: "nowrap" }}>Od posledného otvorenia ({predDnami(ts)}):</span>
      {zmeny.map((z, i) => {
        const rozdiel = z.na - z.z;
        const dobre = rozdiel > 0 === z.dobreHore;
        return (
          <span key={i} style={{ fontSize: 11.5, color: C.textMuted, whiteSpace: "nowrap" }}>
            {i > 0 && <span style={{ color: mix(C.textDim, 60), marginRight: 8 }}>·</span>}
            {z.label}{" "}
            <strong style={{ color: dobre ? C.green : C.orange }}>
              {rozdiel > 0 ? "+" : "−"}{z.fmt(Math.abs(rozdiel))}
            </strong>
          </span>
        );
      })}
    </div>
  );
}

function Pasmo({ titulok, popis, deti }: { titulok: string; popis: string; deti: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 6px" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: C.textDim }}>{titulok}</span>
        <span style={{ fontSize: 10.5, color: mix(C.textDim, 75) }}>{popis}</span>
        <div style={{ flex: 1, height: 1, background: mix(C.border, 50) }} />
      </div>
      {deti}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

export function PrehladPanel({
  kotva,
  vysledok,
  varovne,
  zmeny,
  zmenyTs,
  vyzaduju,
  registerPanel,
  vpravo,
  cerstvost,
}: {
  /** Kotviaci prístroj — jeden, vľavo hore, väčší. Bod, kam sa oko vracia. */
  kotva: Pristroj;
  /** Čo sa už stalo (oneskorené ukazovatele). */
  vysledok: Pristroj[];
  /** Čo sa chystá (predstihové ukazovatele) — tu sa dá ešte zasiahnuť. */
  varovne: Pristroj[];
  zmeny: Zmena[];
  zmenyTs: number | null;
  vyzaduju: { kritickych: number };
  registerPanel: ReactNode;
  vpravo?: ReactNode;
  /** Dáta k dátumu + či nie sú zastarané. Tichý dashboard nad starými dátami
   *  vyzerá presne ako tichý dashboard nad dobrými — preto je to výstraha. */
  cerstvost: { text: string; zastarane: boolean };
}) {
  const vsetky = [kotva, ...vysledok, ...varovne];
  const mimo = vsetky.filter((p) => p.pasmo === "pozor" || p.pasmo === "zle");
  const zle = mimo.filter((p) => p.pasmo === "zle");
  const cisto = !mimo.length && !vyzaduju.kritickych && !cerstvost.zastarane;

  const stav = useMemo(() => {
    const casti: string[] = [];
    if (zle.length) casti.push(`${zle.length}× mimo pásma`);
    const pozor = mimo.length - zle.length;
    if (pozor) casti.push(`${pozor}× na hrane`);
    if (vyzaduju.kritickych) casti.push(`${vyzaduju.kritickych} na akciu`);
    return { text: casti.join(" · "), farba: zle.length ? C.red : C.orange };
  }, [mimo.length, zle.length, vyzaduju.kritickych]);

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Stavový riadok. V poriadku je to jeden riadok drobným sivým písmom —
          nie zelený pás. Rozsvietená kontrolka normálneho stavu je presne to,
          čo tmavý kokpit zakazuje. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
        {cisto ? (
          <span style={{ fontSize: 11.5, color: C.textDim }}>
            Všetko v norme · dáta k {cerstvost.text}
          </span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, flexWrap: "wrap" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: stav.farba, flexShrink: 0, boxShadow: `0 0 8px ${stav.farba}` }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: stav.farba }}>{stav.text}</span>
            {mimo.length > 0 && (
              <span style={{ fontSize: 12, color: C.textDim }}>— {mimo.map((p) => p.label.toLowerCase()).join(", ")}</span>
            )}
            {cerstvost.zastarane && (
              <span style={{ fontSize: 11.5, color: C.red, fontWeight: 600 }}>⚠ dáta len k {cerstvost.text} — nahraj nový export</span>
            )}
          </div>
        )}
        {vpravo}
      </div>

      <Pasmo
        titulok="Ako to dopadlo"
        popis="uzavreté čísla — už sa nedajú ovplyvniť"
        deti={
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 9, alignItems: "stretch" }}>
            {/* Kotva zaberá dva stĺpce a je vľavo hore — tam, kde oko začína
                čítať, a kam sa medzi prístrojmi vracia (letecké „basic T"). */}
            <div style={{ gridColumn: "span 2", minWidth: 0, display: "flex" }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Dlazdica p={kotva} velka />
                </div>
              </div>
            </div>
            {vysledok.map((p) => <Dlazdica key={p.id} p={p} />)}
          </div>
        }
      />

      <Pasmo
        titulok="Čo sa chystá"
        popis="tu sa dá ešte zasiahnuť"
        deti={
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))", gap: 9 }}>
            {varovne.map((p) => <Dlazdica key={p.id} p={p} />)}
          </div>
        }
      />

      {zmenyTs !== null && <ZmenyRiadok ts={zmenyTs} zmeny={zmeny} />}

      {registerPanel}
    </div>
  );
}
