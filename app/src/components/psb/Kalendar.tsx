import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtDMY } from "../../lib/psb/format";

import { fetchBtcReserve, type BtcVyplata } from "../../lib/psb/client";
import type { ClientAgg } from "../../lib/psb/compute";
import type { PSBData } from "../../lib/psb/types";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info, Modal, Select, TrenerPills } from "./ui";

/**
 * Kalendár — čo sa chystá a čo sa práve zmenilo.
 *
 * Medzi dvoma nedeľnými exportmi z PTmindera appka o týždni nevie nič. Kalendár
 * tú dieru zapĺňa: vidí, čo je objednané, a hlavne si pamätá, ako to vyzeralo
 * naposledy — takže vie povedať „v pondelok tu bola hodina a dnes už nie je".
 *
 * Zásada, ktorá sa nesmie porušiť: odtiaľto nič netečie do peňazí. PTminder je
 * zdroj pravdy, kalendár je predpoveď. Preto je to samostatná karta a nie ďalší
 * riadok v tržbách.
 */

type Zdroj = { id: string; trener: string; aktivny: number; posledne_ok: string | null; posledna_chyba: string | null };
type Zmena = { id: string; kedy: string; trener: string; uid: string; druh: string; nazov: string | null; klient: string | null; pred: string | null; po: string | null };
type Mapa = { nazov: string; trener: string; klient: string | null; typ: string };
export type KalUdalost = { uid: string; trener: string; zaciatok: string; koniec: string; nazov: string; klient: string | null; typ: string | null };
type Nezname = { nazov: string; trener: string; pocet: number; najblizsi: string };
type Guillermo = { id: string; datum: string; druh: string; hodiny: number; suma_czk: number | null; poznamka: string | null };
type Stav = { zdroje: Zdroj[]; zmeny: Zmena[]; mapovanie: Mapa[]; udalosti: KalUdalost[]; nezname: Nezname[]; guillermo: Guillermo[] };

const TYPY = [
  { value: "trening", label: "Tréning klienta" },
  { value: "uvodny", label: "Úvodný tréning" },
  { value: "guillermo", label: "Guillermo (naše vzdelávanie)" },
  { value: "sukromne", label: "Súkromné" },
  { value: "netrening", label: "Iné (poznámka, úloha)" },
];

/**
 * Návrh, čo daný názov v kalendári znamená.
 *
 * Jerry píše udalosti podľa pravidla: bežný klient je krstné meno ALEBO
 * priezvisko, úvodný tréning je slovo „úvodný" a celé meno, Guillermo je
 * „guillermo". Pravidlo sa dá čítať strojom — appka teda nemá čakať, kým jej
 * dvadsať mien naklikáš, ale má ich navrhnúť a nechať si ich potvrdiť.
 *
 * Navrhuje, NEROZHODUJE. „Michal" môžu byť dvaja a „Katka" je prezývka ku
 * „Kateřina", ktorú z mena odvodiť nejde. Tichý omyl v mene by pritom viedol
 * k tomu, že sa hodina pripíše cudziemu balíčku — to je horšie než jedno kliknutie.
 */
const bezDiakritiky = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function navrhni(
  nazov: string,
  clients: Record<string, ClientAgg>,
): { typ: string; kandidati: string[]; meno: string } {
  const holy = bezDiakritiky(nazov);

  if (/guillermo/.test(holy)) return { typ: "guillermo", kandidati: [], meno: "" };

  const uvodny = /\buvodn/.test(holy);
  // Pri úvodnom sa slovo odreže — zvyšok je meno, ktoré Jerry píše celé.
  // Meno sa berie z PÔVODNÉHO názvu (s diakritikou a veľkými písmenami), lebo
  // pri úvodnom človek ešte nie je klientom a toto meno je jediné, čo o ňom máme.
  const meno = uvodny ? nazov.replace(/[uúUÚ]vodn\S*/g, "").replace(/\s+/g, " ").trim() : "";
  const hladane = uvodny ? holy.replace(/\buvodn\w*\b/g, "").trim() : holy;
  if (!hladane) return { typ: uvodny ? "uvodny" : "trening", kandidati: [], meno };

  const kusy = hladane.split(/[\s.,-]+/).filter((x) => x.length > 1);
  const skore: { meno: string; bod: number }[] = [];

  for (const [meno, c] of Object.entries(clients)) {
    const casti = bezDiakritiky(meno).split(/\s+/).filter(Boolean);
    let bod = 0;
    // Celé meno („Uvodny Hana Nováková") — najsilnejší signál.
    if (casti.length && kusy.length >= 2 && kusy.every((k) => casti.some((c2) => c2.startsWith(k)))) bod += 6;
    // Jedno slovo, ktoré presne sedí na krstné meno alebo priezvisko.
    else if (kusy.length === 1 && casti.includes(kusy[0])) bod += 4;
    // „Jan K" — krstné meno sedí, druhý kus je začiatok priezviska.
    else if (kusy.length === 2 && casti[0] === kusy[0] && casti.slice(1).some((c2) => c2.startsWith(kusy[1]))) bod += 5;
    if (!bod) continue;
    // Kto stále chodí a trénuje s Jerrym, je pravdepodobnejší než niekto,
    // kto odišiel pred rokom — ale nikoho to nevylučuje.
    if (c.status !== "Neaktívny") bod += 2;
    if (c.primaryTrainer === "Jerry") bod += 1;
    skore.push({ meno, bod });
  }

  skore.sort((a, b) => b.bod - a.bod || a.meno.localeCompare(b.meno, "sk"));
  return { typ: uvodny ? "uvodny" : "trening", kandidati: skore.slice(0, 4).map((x) => x.meno), meno };
}

const den = (s: string) => {
  const d = new Date(`${s}:00Z`);
  const DNI = ["Ne", "Po", "Ut", "St", "Št", "Pi", "So"];
  return `${DNI[d.getUTCDay()]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}.`;
};
const cas = (s: string) => s.slice(11, 16);

/** Vodorovné rolovanie pre mriežku — na telefóne sa sedem dní inak nezmestí. */
const ScrollX = ({ children }: { children: React.ReactNode }) => (
  <div style={{ overflowX: "auto", paddingBottom: 4 }}>{children}</div>
);

async function posli(telo: Record<string, unknown>) {
  const r = await fetch("/api/kalendar", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(telo),
  });
  return (await r.json()) as { ok: boolean; error?: string; vysledky?: Record<string, { ok: boolean; zmien?: number; udalosti?: number; chyba?: string; prveStiahnutie?: boolean }> };
}

export function Kalendar({ clients, data }: { clients: Record<string, ClientAgg>; data: PSBData }) {
  const [stav, setStav] = useState<Stav | null>(null);
  const [chyba, setChyba] = useState("");
  const [sprava, setSprava] = useState("");
  const [pracuje, setPracuje] = useState(false);
  const [upravovana, setUpravovana] = useState<KalUdalost | null>(null);
  /**
   * Filter trénera platí na CELÚ kartu, nie len na mriežku.
   *
   * Keď si Jerry prepne na seba, nemá zmysel, aby mu pod týždňom ďalej svietili
   * Terezkine zrušenia, jej chýbajúce zápisy a jej balíčky. Prepínač je jeden a
   * drží ho tento komponent; karty dostávajú už prefiltrované dáta.
   */
  const [trener, setTrener] = useState("all");

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/kalendar", { credentials: "same-origin" });
    const j = (await r.json()) as { ok: boolean } & Stav;
    if (j.ok) setStav({ zdroje: j.zdroje, zmeny: j.zmeny, mapovanie: j.mapovanie, udalosti: j.udalosti, nezname: j.nezname, guillermo: j.guillermo || [] });
  }, []);

  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const stiahni = async () => {
    setPracuje(true); setChyba(""); setSprava("");
    const j = await posli({ akcia: "stiahni" });
    setPracuje(false);
    if (!j.ok) { setChyba(j.error || "Nepodarilo sa."); return; }
    const casti = Object.entries(j.vysledky || {}).map(([t, v]) =>
      v.ok ? `${t}: ${v.udalosti} udalostí${v.prveStiahnutie ? " (prvé načítanie)" : `, ${v.zmien} zmien`}` : `${t}: ${v.chyba}`,
    );
    setSprava(casti.join(" · "));
    await nacitaj();
  };

  const menaKlientov = useMemo(() => Object.keys(clients).sort((a, b) => a.localeCompare(b, "sk")), [clients]);

  if (!stav) return <Card><Empty>Načítavam…</Empty></Card>;

  const pripojene = stav.zdroje.length > 0;
  const udalostiF = trener === "all" ? stav.udalosti : stav.udalosti.filter((u) => u.trener === trener);
  const zmenyF = trener === "all" ? stav.zmeny : stav.zmeny.filter((z) => z.trener === trener);

  return (
    <>
      {/* Poradie kariet nesie prioritu: hore je to, na čo sa človek pozerá
          každý deň (týždeň), potom to, čo si pýta odpoveď (zmeny, nové mená),
          a celkom dole obsluha (sťahovanie, pripojenie). Kým kalendár
          pripojený nie je, obráti sa to — vtedy je jediná zmysluplná vec
          práve to pripojenie. */}
      {!pripojene && <Pripojenie zdroje={stav.zdroje} onZmena={nacitaj} />}

      {pripojene && <Tyzden udalosti={udalostiF} onKlik={setUpravovana} trener={trener} onTrener={setTrener} />}

      {upravovana && (
        <UpravaUdalosti
          udalost={upravovana}
          mena={menaKlientov}
          clients={clients}
          onZavri={() => setUpravovana(null)}
          onHotovo={async () => { setUpravovana(null); await nacitaj(); }}
        />
      )}
      {pripojene && <Zmeny zmeny={zmenyF} onHotovo={nacitaj} mena={menaKlientov} />}
      {pripojene && <Kontrola udalosti={udalostiF} data={data} />}
      {/* Balíčky aj „Odpísaní, ale majú termín" sa zliali na Kokpit (Jerry,
          9. 8.): dlaždica Odmlčaní sama vynecháva ľudí s budúcim termínom,
          takže táto karta hovorila to isté druhýkrát. Sem sa chodí pozerať,
          čo sa v kalendári zmenilo, nie komu treba zavolať. */}

      {stav.nezname.length > 0 && (
        <Mapovanie nezname={stav.nezname} mena={menaKlientov} clients={clients} onHotovo={nacitaj} />
      )}

      {pripojene && (
        <Card>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => void stiahni()}
              disabled={pracuje}
              style={{
                padding: "8px 16px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                cursor: pracuje ? "wait" : "pointer",
                border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 10), color: C.accentLight,
              }}
            >
              {pracuje ? "Sťahujem…" : "Stiahnuť kalendár teraz"}
            </button>
            {sprava && <span style={{ fontSize: 12, color: C.textMuted }}>{sprava}</span>}
            {chyba && <span style={{ fontSize: 12, color: C.red }}>{chyba}</span>}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
            Appka porovná kalendár s tým, čo videla naposledy. Prvé stiahnutie sa len zapamätá — otázky
            začnú vznikať až od druhého, inak by ti hneď vysypala celý rozvrh ako „pribudlo".
          </div>
        </Card>
      )}

      {pripojene && <Pripojenie zdroje={stav.zdroje} onZmena={nacitaj} />}
    </>
  );
}

/** Pripojenie kalendárov. Tajná adresa sa vkladá TU — nikdy nemá ísť cez chat. */
function Pripojenie({ zdroje, onZmena }: { zdroje: Zdroj[]; onZmena: () => Promise<void> }) {
  const [otvorene, setOtvorene] = useState(zdroje.length === 0);
  const [trener, setTrener] = useState("Jerry");
  const [url, setUrl] = useState("");
  const [chyba, setChyba] = useState("");
  const [uklada, setUklada] = useState(false);

  const uloz = async () => {
    setUklada(true); setChyba("");
    const j = await posli({ akcia: "zdroj-pridaj", trener, url });
    setUklada(false);
    if (!j.ok) { setChyba(j.error || "Nepodarilo sa uložiť."); return; }
    setUrl("");
    await onZmena();
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            text="Appka číta kalendár cez tajnú iCal adresu — len na čítanie, nikdy do neho nezasiahne. Adresa je heslo v podobe odkazu: kto ju má, vidí tvoj kalendár. Preto sa vkladá sem a nikam inam."
            label="Pripojené kalendáre"
          />
        </H3>
        <button onClick={() => setOtvorene(!otvorene)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12.5, cursor: "pointer" }}>
          {otvorene ? "skryť" : "pripojiť / zmeniť"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0 4px" }}>
        {["Jerry", "Terezka"].map((t) => {
          const z = zdroje.find((x) => x.trener === t);
          return (
            <div key={t} style={{ flex: "1 1 220px", padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: mix(C.border, 18) }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t}</div>
              {!z && <div style={{ fontSize: 12, color: C.textDim, marginTop: 3 }}>nepripojený</div>}
              {z && z.posledna_chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 3 }}>{z.posledna_chyba}</div>}
              {z && !z.posledna_chyba && (
                <div style={{ fontSize: 12, color: C.green, marginTop: 3 }}>
                  pripojený{z.posledne_ok ? ` · naposledy ${z.posledne_ok.slice(0, 16).replace("T", " ")}` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {otvorene && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 10 }}>
            Kde ju nájdeš: Google Kalendár na počítači → ozubené koliesko <b>Nastavenia</b> → vľavo pod
            „Nastavenia mojich kalendárov" klikni na daný kalendár → dole <b>Integrovať kalendár</b> →
            skopíruj <b>Tajná adresa vo formáte iCal</b>. Terezka to spraví u seba a pošle ti ju.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Select value={trener} onChange={setTrener} options={[{ value: "Jerry", label: "Jerry" }, { value: "Terezka", label: "Terezka" }]} />
            <input
              type="password"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              style={{
                flex: "1 1 320px", padding: "8px 11px", borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5,
              }}
            />
            <button
              onClick={() => void uloz()}
              disabled={uklada || !url.trim()}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 12), color: C.green,
              }}
            >
              {uklada ? "Ukladám…" : "Pripojiť"}
            </button>
          </div>
          {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 8 }}>
            Pole je skryté ako heslo zámerne — adresa sa nemá objaviť na obrazovke, keď za tebou niekto stojí.
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Čo appka v kalendári nepozná. Kľúčom je meno AJ tréner: „Natalia" u Jerryho
 * a „Natalia" u Terezky sú dvaja rôzni ľudia a jedno pravidlo pre oboch by ich
 * ticho zlialo do jedného klienta.
 */
function Mapovanie({ nezname, mena, clients, onHotovo }: { nezname: Nezname[]; mena: string[]; clients: Record<string, ClientAgg>; onHotovo: () => Promise<void> }) {
  const [vyber, setVyber] = useState<Record<string, { klient: string; typ: string }>>({});
  const [uklada, setUklada] = useState("");

  // Návrhy sa počítajú z názvu — Jerryho pravidlo (krstné meno alebo
  // priezvisko, „úvodný + celé meno", „guillermo") je čitateľné strojom.
  const navrhy = useMemo(() => {
    const m: Record<string, { typ: string; kandidati: string[]; meno: string }> = {};
    for (const n of nezname) m[`${n.nazov}|${n.trener}`] = navrhni(n.nazov, clients);
    return m;
  }, [nezname, clients]);
  const stav = (k: string) => {
    if (vyber[k]) return vyber[k];
    const n = navrhy[k];
    // Pri úvodnom je predvyplnené meno z názvu, nie klient zo zoznamu — ten
    // človek ešte klientom nie je.
    const klient = n?.typ === "uvodny" ? (n.kandidati[0] || n.meno || "") : (n?.kandidati[0] || "");
    return { klient, typ: n?.typ || "trening" };
  };

  /**
   * Kedy sa dá potvrdiť.
   *
   * Meno stačí napísať — nemusí byť v Trackeri. Pôvodne to musel byť existujúci
   * klient a bolo to zle: Roman Pavlík prišiel na úvodný a hneď nato mal bežný
   * tréning, pričom klientom sa stane až po nedeľnom exporte z PTmindera. Prísna
   * podmienka tak zablokovala presne toho človeka, kvôli ktorému kalendár čítame
   * — nového záujemcu.
   *
   * Riziko preklepu zostáva, ale je viditeľné: neznáme meno má oranžový rám a
   * pod ním vetu, že klientom ešte nie je. Tichá blokáda je horšia než varovanie,
   * ktoré človek vidí.
   */
  const daSa = (v: { klient: string; typ: string }) =>
    v.typ === "trening" || v.typ === "uvodny" ? v.klient.trim().length >= 3 : true;
  const jednoznacne = nezname.filter((n) => {
    const k = `${n.nazov}|${n.trener}`;
    return (navrhy[k]?.kandidati.length === 1 && !vyber[k]) || navrhy[k]?.typ === "guillermo";
  }).length;

  const uloz = async (n: Nezname) => {
    const k = `${n.nazov}|${n.trener}`;
    const v = stav(k);
    const sMenom = v.typ === "trening" || v.typ === "uvodny";
    if (!daSa(v)) return;
    setUklada(k);
    await posli({ akcia: "mapuj", nazov: n.nazov, trener: n.trener, typ: v.typ, klient: sMenom ? v.klient.trim() : null });
    setUklada("");
    await onHotovo();
  };

  return (
    <Card>
      <H3>
        <Info
          text="Kalendár nesie krstné mená a skratky — appka z nich sama nespozná klienta. Potvrdíš to raz a odvtedy to vie. Čo tréning nie je (plávanie, strihanie, poznámka), označ ako súkromné alebo iné a appka sa už nikdy nespýta."
          label={`Nové názvy v kalendári (${nezname.length})`}
        />
      </H3>
      <div style={{ fontSize: 11.5, color: C.textDim, margin: "6px 0 12px", lineHeight: 1.5 }}>
        Zoradené podľa toho, ako často sa vyskytujú — hore je práca, ktorá sa najviac oplatí.
        {jednoznacne > 0 && <> Pri {jednoznacne} z nich appka pozná odpoveď jednoznačne — stačí potvrdiť.</>}
      </div>
      {nezname.map((n) => {
        const k = `${n.nazov}|${n.trener}`;
        const v = stav(k);
        const navrh = navrhy[k];
        const trening = v.typ === "trening" || v.typ === "uvodny";
        return (
          <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "9px 0", borderBottom: `1px solid ${mix(C.border, 55)}` }}>
            <div style={{ minWidth: 150 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{n.nazov}</div>
              <div style={{ fontSize: 11, color: C.textDim }}>
                {n.pocet}× · najbližšie {den(n.najblizsi)}
                {navrh && navrh.kandidati.length > 1 && <span style={{ color: C.orange }}> · {navrh.kandidati.length} možností</span>}
                {navrh && trening && !navrh.kandidati.length && <span style={{ color: C.orange }}> · nepoznám</span>}
              </div>
            </div>
            <Select
              value={v.typ}
              onChange={(t) => setVyber({ ...vyber, [k]: { ...v, typ: t } })}
              options={TYPY}
            />
            {trening && (
              <>
                {/* Sto šestnásť mien v rolete sa nedá prejsť očami. Písanie
                    filtruje priebežne — a keď appka niekoho navrhla, meno už
                    v poli stojí a stačí ho potvrdiť. */}
                <input
                  list={`kl-${n.trener}-${n.nazov}`}
                  value={v.klient}
                  onChange={(e) => setVyber({ ...vyber, [k]: { ...v, klient: e.target.value } })}
                  placeholder="píš meno…"
                  style={{
                    flex: "1 1 190px", minWidth: 170, padding: "7px 10px", borderRadius: 8, fontSize: 12.5,
                    border: `1px solid ${v.klient && !mena.includes(v.klient) ? C.orange : C.border}`,
                    background: C.bg, color: C.text,
                  }}
                />
                <datalist id={`kl-${n.trener}-${n.nazov}`}>
                  {mena.map((m) => <option key={m} value={m} />)}
                </datalist>
                {!mena.includes(v.klient) && v.klient.trim().length >= 3 && (
                  <span style={{ fontSize: 11, color: C.textDim, flexBasis: "100%" }}>
                    Zatiaľ nie je klientom — uloží sa tak, ako si ho napísal, a spáruje sa sám,
                    keď sa objaví v PTminderi.
                  </span>
                )}
                {/* Ďalšie možnosti na jeden klik — pri „Michal" alebo „Jan K"
                    ich býva viac a preklikať sa k nim je rýchlejšie než písať. */}
                {navrh && navrh.kandidati.length > 1 && navrh.kandidati.slice(0, 3).map((kand) => (
                  kand === v.klient ? null : (
                    <button
                      key={kand}
                      onClick={() => setVyber({ ...vyber, [k]: { ...v, klient: kand } })}
                      style={{
                        padding: "4px 9px", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
                        border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
                      }}
                    >
                      {kand}
                    </button>
                  )
                ))}
              </>
            )}
            <button
              onClick={() => void uloz(n)}
              disabled={uklada === k || !daSa(v)}
              style={{
                padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: daSa(v) ? "pointer" : "not-allowed",
                border: `1px solid ${mix(C.green, 45)}`,
                background: daSa(v) ? mix(C.green, 12) : "transparent",
                color: daSa(v) ? C.green : C.textDim,
              }}
            >
              {uklada === k ? "…" : "Potvrdiť"}
            </button>
          </div>
        );
      })}
    </Card>
  );
}

/** Rozdiely medzi snímkami — materiál na otázky typu „prečo zmizla tá hodina". */
function Zmeny({ zmeny, onHotovo, mena }: { zmeny: Zmena[]; onHotovo: () => Promise<void>; mena: string[] }) {
  const [pisem, setPisem] = useState<Record<string, string>>({});
  const [obnovujem, setObnovujem] = useState(false);
  const [pridavam, setPridavam] = useState(false);
  const [uklada, setUklada] = useState(false);
  const [novy, setNovy] = useState({
    druh: "zrusene" as "zrusene" | "nahrada",
    klient: "",
    datum: new Date().toISOString().slice(0, 10),
    trener: "",
    poznamka: "",
  });

  const popis = (z: Zmena) => {
    const kto = z.klient || z.nazov || "udalosť";
    // Ručne zapísané nesú uid s predponou `rucne-` — vetu treba inú, lebo
    // „zmizol z kalendára" by pri telefonickom zrušení klamalo.
    const rucne = z.uid.startsWith("rucne-");
    if (rucne) {
      return z.druh === "nahrada"
        ? `${kto} — náhrada dohodnutá na ${z.po ? den(z.po) : "?"} (zapísané ručne)`
        : `${kto} — zrušený tréning ${z.pred ? den(z.pred) : ""} (zapísané ručne)`;
    }
    if (z.druh === "zrusene") return `${kto} — zmizol tréning z ${z.pred ? `${den(z.pred)} ${cas(z.pred)}` : "kalendára"}`;
    if (z.druh === "posunute") return `${kto} — presun z ${z.pred ? `${den(z.pred)} ${cas(z.pred)}` : "?"} na ${z.po ? `${den(z.po)} ${cas(z.po)}` : "?"}`;
    if (z.druh === "pridane") return `${kto} — pribudol tréning ${z.po ? `${den(z.po)} ${cas(z.po)}` : ""}`;
    return `${kto} — zmena názvu z „${z.pred}" na „${z.po}"`;
  };
  const farba = (d: string) => (d === "zrusene" ? C.red : d === "posunute" ? C.orange : d === "pridane" ? C.green : d === "nahrada" ? C.blue : C.textMuted);

  const hlavicka = (
    // Obnoviť a Zapísať ručne priamo v hlavičke karty (Jerry, 11. 8.).
    // „Stiahnuť kalendár teraz" existovalo, ale až celkom dole pri obsluhe —
    // a človek, ktorý sa práve pozerá na prázdny zoznam zmien, potrebuje
    // stiahnutie presne TU, nie o dve obrazovky nižšie.
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
      <button
        onClick={async () => { setObnovujem(true); try { await posli({ akcia: "stiahni" }); await onHotovo(); } finally { setObnovujem(false); } }}
        disabled={obnovujem}
        title="Stiahnuť kalendár teraz a prepočítať rozdiely"
        style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, cursor: obnovujem ? "wait" : "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
      >
        {obnovujem ? "Sťahujem…" : "↻ Obnoviť"}
      </button>
      <button
        onClick={() => setPridavam((p) => !p)}
        title="Zapísať zrušenie alebo náhradu, ktorú kalendár nezachytil"
        style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 10), color: C.accentLight }}
      >
        {pridavam ? "Zavrieť" : "+ Zrušenie / náhrada"}
      </button>
    </div>
  );

  const formular = pridavam && (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10, padding: "10px 12px", borderRadius: 9, background: mix(C.accent, 5), border: `1px solid ${mix(C.accent, 22)}` }}>
      <select
        value={novy.druh}
        onChange={(e) => setNovy({ ...novy, druh: e.target.value as "zrusene" | "nahrada" })}
        style={{ padding: "6px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}
      >
        <option value="zrusene">Zrušený tréning</option>
        <option value="nahrada">Náhrada</option>
      </select>
      <input
        list="psb-kal-klienti"
        value={novy.klient}
        onChange={(e) => setNovy({ ...novy, klient: e.target.value })}
        placeholder="klient"
        style={{ flex: "1 1 180px", padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}
      />
      <datalist id="psb-kal-klienti">{mena.map((m) => <option key={m} value={m} />)}</datalist>
      <input
        type="date"
        value={novy.datum}
        onChange={(e) => setNovy({ ...novy, datum: e.target.value })}
        style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, colorScheme: "dark" }}
      />
      <input
        value={novy.poznamka}
        onChange={(e) => setNovy({ ...novy, poznamka: e.target.value })}
        placeholder="prečo? (nepovinné)"
        style={{ flex: "1 1 200px", padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}
      />
      <button
        disabled={!novy.klient.trim() || uklada}
        onClick={async () => {
          setUklada(true);
          try {
            // Zapíše sa zmena a hneď aj vysvetlenie, ak ho Jerry napísal —
            // ručný zápis je sám o sebe odpoveď, nemá zmysel pýtať sa naň znova.
            await posli({ akcia: "zmena-rucne", druh: novy.druh, klient: novy.klient.trim(), datum: novy.datum, trener: novy.trener, poznamka: novy.poznamka });
            setNovy({ ...novy, klient: "", poznamka: "" });
            setPridavam(false);
            await onHotovo();
          } finally { setUklada(false); }
        }}
        style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: novy.klient.trim() ? "pointer" : "default", opacity: novy.klient.trim() ? 1 : 0.5, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight }}
      >
        {uklada ? "Ukladám…" : "Zapísať"}
      </button>
    </div>
  );

  if (!zmeny.length) {
    return (
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <H3 style={{ marginBottom: 0 }}><Info text="Rozdiel medzi posledným a predchádzajúcim stiahnutím kalendára. Zrušenia a presuny sa tu objavia aj vtedy, keď na ne zabudneš — a keď ich vysvetlíš, zápis zostane. Čo kalendár nevidel (zrušenie po telefóne, náhrada dohodnutá mimo), zapíšeš tlačidlom vpravo." label="Zmeny v kalendári" /></H3>
          {hlavicka}
        </div>
        {formular}
        {!pridavam && <Empty>Od posledného stiahnutia sa nič nezmenilo.</Empty>}
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <H3 style={{ marginBottom: 0 }}><Info text="Rozdiel medzi posledným a predchádzajúcim stiahnutím kalendára. Vysvetlenie sa uloží — o rok bude pri tom mesiaci vidieť, prečo hodina zmizla. Čo kalendár nevidel, zapíšeš tlačidlom vpravo." label={`Zmeny v kalendári (${zmeny.length})`} /></H3>
        {hlavicka}
      </div>
      {formular}
      {zmeny.map((z) => (
        <div key={z.id} style={{ padding: "10px 0", borderBottom: `1px solid ${mix(C.border, 55)}` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: farba(z.druh), textTransform: "uppercase", letterSpacing: 0.3 }}>{z.druh}</span>
            <span style={{ fontSize: 13, color: C.text }}>{popis(z)}</span>
            <span style={{ fontSize: 11, color: C.textDim, marginLeft: "auto" }}>{z.trener} · zbadané {z.kedy.slice(5, 16).replace("T", " ")}</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
            <input
              value={pisem[z.id] || ""}
              onChange={(e) => setPisem({ ...pisem, [z.id]: e.target.value })}
              placeholder="prečo? (klient zrušil, presunuli sme, chyba v zápise…)"
              style={{ flex: "1 1 260px", padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}
            />
            <button
              onClick={async () => { await posli({ akcia: "vysvetli", id: z.id, poznamka: pisem[z.id] || "" }); await onHotovo(); }}
              style={{ padding: "6px 13px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
            >
              Vybavené
            </button>
          </div>
        </div>
      ))}
    </Card>
  );
}

/**
 * Týždeň tak, ako ho Jerry pozná z Google Kalendára — mriežka, nie zoznam.
 *
 * Zoznam po dňoch hovoril, ČO je objednané, ale nie KEDY: nebolo z neho vidieť
 * diery medzi hodinami, dvojité obsadenie ani to, že piatok je prázdny. Mriežka
 * to ukáže bez čítania, lebo tvar dňa je v nej priamo vidieť.
 *
 * Rozsah hodín sa počíta z dát, nie natvrdo: kto trénuje od siedmej do ôsmej
 * večer, nemá pozerať na prázdny pás od polnoci. Späť sa dá ísť len po dnešok —
 * história patrí do PTmindera, tu je reč o tom, čo sa chystá.
 */
function Tyzden({ udalosti, onKlik, trener, onTrener }: { udalosti: KalUdalost[]; onKlik: (u: KalUdalost) => void; trener: string; onTrener: (t: string) => void }) {
  const [posun, setPosun] = useState(0);

  // Pondelok ako začiatok týždňa — tak to má Jerry aj v Google Kalendári.
  const pondelok = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const doPondelka = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - doPondelka + posun * 7);
    return d;
  }, [posun]);

  const dni = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(pondelok);
      d.setDate(d.getDate() + i);
      const p2 = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    }),
    [pondelok],
  );

  const vTyzdni = udalosti.filter((u) => dni.includes(u.zaciatok.slice(0, 10)));
  const minuty = (s: string) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));

  // Rozsah podľa skutočných hodín, s hodinou rezervy na oboch koncoch.
  const od = vTyzdni.length ? Math.max(0, Math.floor(Math.min(...vTyzdni.map((u) => minuty(u.zaciatok))) / 60) - 1) : 7;
  const doH = vTyzdni.length ? Math.min(24, Math.ceil(Math.max(...vTyzdni.map((u) => minuty(u.koniec))) / 60) + 1) : 20;
  const hodin = Math.max(1, doH - od);
  const VYSKA = 46; // px na hodinu

  const dnesIso = new Date().toISOString().slice(0, 10);
  const DNI_SK = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

  const trening = vTyzdni.filter((u) => u.typ !== "sukromne" && u.typ !== "netrening");
  const hodinSpolu = trening.reduce((a, u) => a + (minuty(u.koniec) - minuty(u.zaciatok)) / 60, 0);

  // Farba nesie typ, nie meno — rovnako, ako si Jerry farbí Google Kalendár.
  const farba = (u: KalUdalost) =>
    u.typ === "uvodny" ? C.blue
      : u.typ === "guillermo" ? C.green
        : u.typ === "sukromne" || u.typ === "netrening" ? C.textDim
          : u.trener === "Terezka" ? C.blue : C.accent;

  const popisTyzdna = `${pondelok.getDate()}. ${pondelok.getMonth() + 1}. – ${new Date(pondelok.getTime() + 6 * 86400000).getDate()}. ${new Date(pondelok.getTime() + 6 * 86400000).getMonth() + 1}.`;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <H3>
          <Info
            text="Týždeň tak, ako ho vidíš v Google Kalendári. Je to predpoveď, nie zápis — skutočnosť napíše až nedeľný export z PTmindera. Súkromné udalosti sú sivé a do počtu hodín sa nerátajú."
            label="Týždeň"
          />
        </H3>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <TrenerPills value={trener} onChange={onTrener} />
          <button onClick={() => setPosun(posun - 1)} disabled={posun <= 0}
            style={{ padding: "4px 10px", borderRadius: 7, fontSize: 13, cursor: posun <= 0 ? "not-allowed" : "pointer", border: `1px solid ${C.border}`, background: "transparent", color: posun <= 0 ? C.textDim : C.textMuted }}>←</button>
          <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600, minWidth: 96, textAlign: "center" }}>
            {posun === 0 ? "tento týždeň" : popisTyzdna}
          </span>
          <button onClick={() => setPosun(posun + 1)} disabled={posun >= 2}
            style={{ padding: "4px 10px", borderRadius: 7, fontSize: 13, cursor: posun >= 2 ? "not-allowed" : "pointer", border: `1px solid ${C.border}`, background: "transparent", color: posun >= 2 ? C.textDim : C.textMuted }}>→</button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
        {trening.length} tréningov · {Math.round(hodinSpolu)} h · predbežné
      </div>

      {!vTyzdni.length && (
        <Empty>
          {trener === "all"
            ? "V tomto týždni nie je nič — alebo kalendár siaha len dva týždne dopredu."
            : `${trener} tu nemá nič — buď v tomto týždni netrénuje, alebo jeho kalendár ešte nie je pripojený.`}
        </Empty>
      )}

      {vTyzdni.length > 0 && (
        <ScrollX>
          <div style={{ minWidth: 620 }}>
            {/* Hlavička dní */}
            <div style={{ display: "grid", gridTemplateColumns: "42px repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
              <div />
              {dni.map((d, i) => {
                const jeDnes = d === dnesIso;
                return (
                  <div key={d} style={{
                    textAlign: "center", fontSize: 11.5, padding: "3px 0", borderRadius: 6,
                    fontWeight: jeDnes ? 700 : 600,
                    color: jeDnes ? C.accentLight : C.textMuted,
                    background: jeDnes ? mix(C.accent, 12) : "transparent",
                  }}>
                    {DNI_SK[i]} {Number(d.slice(8, 10))}.
                  </div>
                );
              })}
            </div>

            {/* Mriežka */}
            <div style={{ display: "grid", gridTemplateColumns: "42px repeat(7, 1fr)", gap: 3 }}>
              <div style={{ position: "relative", height: hodin * VYSKA }}>
                {Array.from({ length: hodin }, (_, i) => (
                  <div key={i} style={{ position: "absolute", top: i * VYSKA - 6, right: 4, fontSize: 10.5, color: C.textDim }}>
                    {String(od + i).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {dni.map((d) => (
                <div key={d} style={{
                  position: "relative", height: hodin * VYSKA, borderRadius: 7,
                  background: d === dnesIso ? mix(C.accent, 5) : mix(C.border, 14),
                  overflow: "hidden",
                }}>
                  {Array.from({ length: hodin }, (_, i) => (
                    <div key={i} style={{ position: "absolute", top: i * VYSKA, left: 0, right: 0, borderTop: `1px solid ${mix(C.border, 40)}` }} />
                  ))}
                  {vTyzdni.filter((u) => u.zaciatok.slice(0, 10) === d).map((u) => {
                    const top = ((minuty(u.zaciatok) - od * 60) / 60) * VYSKA;
                    const vyska = Math.max(18, ((minuty(u.koniec) - minuty(u.zaciatok)) / 60) * VYSKA - 2);
                    const f = farba(u);
                    return (
                      <button
                        key={`${u.uid}|${u.trener}`}
                        onClick={() => onKlik(u)}
                        title={`${cas(u.zaciatok)}–${cas(u.koniec)} · ${u.nazov}${u.klient ? ` → ${u.klient}` : ""} · ${u.trener} — klikni na úpravu`}
                        style={{
                          position: "absolute", top, left: 2, right: 2, height: vyska,
                          borderRadius: 5, padding: "2px 4px", overflow: "hidden",
                          background: mix(f, 16), borderLeft: `3px solid ${f}`,
                          border: "none", borderLeftStyle: "solid", textAlign: "left", cursor: "pointer",
                          fontSize: 10.5, lineHeight: 1.25, color: C.text, fontFamily: "inherit",
                        }}
                      >
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {u.klient || u.nazov}{!u.klient && u.typ !== "sukromne" && u.typ !== "netrening" && <span style={{ color: C.orange }}> ?</span>}
                        </div>
                        {vyska > 30 && <div style={{ color: C.textDim, fontSize: 10 }}>{cas(u.zaciatok)}</div>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </ScrollX>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, fontSize: 11, color: C.textDim }}>
        {[["Tréning", C.accent], ["Úvodný", C.blue], ["Guillermo", C.green], ["Súkromné", C.textDim]].map(([l, f]) => (
          <span key={String(l)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: String(f) }} /> {l}
          </span>
        ))}
      </div>
    </Card>
  );
}

/**
 * Oprava toho, čo appka o udalosti usúdila.
 *
 * Mení sa PRAVIDLO, nie jeden výskyt: „Gazo" v Jerryho kalendári znamená vždy
 * toho istého človeka, takže oprava platí na všetky jeho hodiny — minulé aj
 * budúce. Opravovať každý týždeň zvlášť by znamenalo tú istú chybu prepisovať
 * donekonečna.
 *
 * Je to napísané aj na obrazovke. Kto opravuje meno, má vedieť, čoho sa to týka
 * — inak by čakal zmenu jednej dlaždice a prekvapilo by ho, že sa prekreslil
 * celý mesiac.
 */
function UpravaUdalosti({
  udalost, mena, clients, onZavri, onHotovo,
}: {
  udalost: KalUdalost;
  mena: string[];
  clients: Record<string, ClientAgg>;
  onZavri: () => void;
  onHotovo: () => Promise<void>;
}) {
  const navrh = useMemo(() => navrhni(udalost.nazov, clients), [udalost.nazov, clients]);
  const [klient, setKlient] = useState(udalost.klient || "");
  const [typ, setTyp] = useState(udalost.typ || navrh.typ);
  const [uklada, setUklada] = useState(false);

  const sMenom = typ === "trening" || typ === "uvodny";
  const daSa = sMenom ? klient.trim().length >= 3 : true;

  const uloz = async () => {
    if (!daSa) return;
    setUklada(true);
    await posli({
      akcia: "mapuj", nazov: udalost.nazov, trener: udalost.trener,
      typ, klient: sMenom ? klient.trim() : null,
    });
    setUklada(false);
    await onHotovo();
  };

  return (
    <Modal title="Upraviť udalosť" onClose={onZavri}>
      <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
        V kalendári stojí <b style={{ color: C.text }}>„{udalost.nazov}"</b> ·{" "}
        {den(udalost.zaciatok)} {cas(udalost.zaciatok)}–{cas(udalost.koniec)} · {udalost.trener}
      </div>

      <label style={{ fontSize: 11.5, color: C.textMuted, display: "block", marginBottom: 5 }}>Čo to je</label>
      <Select value={typ} onChange={setTyp} options={TYPY} />

      {sMenom && (
        <>
          <label style={{ fontSize: 11.5, color: C.textMuted, display: "block", margin: "12px 0 5px" }}>Klient</label>
          <input
            list="uprava-klienti"
            value={klient}
            onChange={(e) => setKlient(e.target.value)}
            placeholder="píš meno…"
            style={{
              width: "100%", padding: "8px 11px", borderRadius: 8, fontSize: 13,
              border: `1px solid ${klient && !mena.includes(klient) ? C.orange : C.border}`,
              background: C.bg, color: C.text,
            }}
          />
          <datalist id="uprava-klienti">
            {mena.map((m) => <option key={m} value={m} />)}
          </datalist>
          {klient.trim().length >= 3 && !mena.includes(klient) && (
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
              Zatiaľ nie je klientom — uloží sa tak, ako ho napíšeš, a spáruje sa sám,
              keď sa objaví v PTminderi.
            </div>
          )}
          {navrh.kandidati.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {navrh.kandidati.filter((k) => k !== klient).slice(0, 3).map((k) => (
                <button key={k} onClick={() => setKlient(k)}
                  style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11.5, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}>
                  {k}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ fontSize: 11, color: C.textDim, margin: "14px 0 12px", lineHeight: 1.55 }}>
        Oprava platí na <b>všetky udalosti s týmto názvom</b> u tohto trénera — minulé aj budúce.
        Rovnaký názov u druhého trénera zostáva nedotknutý, lebo to nemusí byť ten istý človek.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => void uloz()}
          disabled={uklada || !daSa}
          style={{
            padding: "8px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600,
            cursor: daSa ? "pointer" : "not-allowed",
            border: `1px solid ${mix(C.green, 50)}`,
            background: daSa ? mix(C.green, 12) : "transparent",
            color: daSa ? C.green : C.textDim,
          }}
        >
          {uklada ? "Ukladám…" : "Uložiť"}
        </button>
        <button onClick={onZavri} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12.5, cursor: "pointer" }}>
          Zrušiť
        </button>
      </div>
    </Modal>
  );
}

/** Tréningy z kalendára, ktoré sú preč a v PTminderi po nich nič nezostalo. */
function Kontrola({ udalosti, data }: { udalosti: KalUdalost[]; data: PSBData }) {
  const chybajuce = useMemo(() => {
    const dnes = new Date().toISOString().slice(0, 10);
    /**
     * Porovnanie znáša dve odchýlky, ktoré overenie na skutočných dátach
     * odhalilo — obe hlásili chýbajúci zápis tam, kde zápis existoval:
     *
     * 1. DIAKRITIKA. PTminder má „Zuzana Spoligova", v kalendári stálo
     *    „Zuzana Spoligová". Pri úvodných sa meno píše voľne (klient ešte
     *    v Trackeri nie je), takže sa presná zhoda spoľahnúť nedá.
     * 2. DEŇ VEDĽA. Markéta mala v kalendári 30. 7. a v PTminderi 31. 7. —
     *    hodina sa presunula a kalendár sa neopravil. Tolerancia ±1 deň to
     *    zmieri; dvakrát za dva dni ten istý klient netrénuje.
     *
     * Radšej zmlčať hraničný prípad než hlásiť poplach, ktorý sa po overení
     * ukáže ako nič — karta, ktorá kričí zbytočne, sa prestane čítať.
     */
    const hola = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const posun = (d: string, o: number) => new Date(Date.parse(`${d}T00:00:00Z`) + o * 86400000).toISOString().slice(0, 10);
    const sedenia = new Set(data.sessions.map((x) => `${hola(x.client)}|${x.date.slice(0, 10)}`));
    return udalosti
      .filter((u) => {
        if (u.typ !== "trening" && u.typ !== "uvodny") return false;
        if (!u.klient) return false;
        const d = u.zaciatok.slice(0, 10);
        // Dnešok sa nekontroluje — hodina ešte prebieha a zápis príde neskôr.
        if (d >= dnes) return false;
        const k = hola(u.klient);
        return ![-1, 0, 1].some((o) => sedenia.has(`${k}|${posun(d, o)}`));
      })
      .sort((a, b) => b.zaciatok.localeCompare(a.zaciatok));
  }, [udalosti, data.sessions]);

  return (
    <Card>
      <H3>
        <Info
          text="Hodina bola v kalendári, prebehla — a v PTminderi po nej nie je zápis. Buď sa klient neukázal, alebo sa zabudlo zapísať. To druhé je priamo nevyfakturovaný peniaz. Kontrola má zmysel až po nedeľnom exporte: dovtedy PTminder o poslednom týždni nevie."
          label={`Chýba v PTminderi (${chybajuce.length})`}
        />
      </H3>
      {!chybajuce.length ? (
        <Empty>Každá odtrénovaná hodina z kalendára má v PTminderi svoj zápis.</Empty>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: C.textDim, margin: "6px 0 10px", lineHeight: 1.5 }}>
            Zoradené od najnovšieho. Ak export ešte neprišiel, posledný týždeň tu bude celý — to je
            v poriadku, skutočnosť dorazí v nedeľu.
          </div>
          {chybajuce.slice(0, 25).map((u) => (
            <div key={`${u.uid}|${u.trener}`} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${mix(C.border, 50)}`, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: C.textMuted, minWidth: 92 }}>{den(u.zaciatok)} {cas(u.zaciatok)}</span>
              <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{u.klient}</span>
              <span style={{ fontSize: 11.5, color: C.textDim }}>{u.trener}{u.typ === "uvodny" ? " · úvodný" : ""}</span>
            </div>
          ))}
          {chybajuce.length > 25 && (
            <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 8 }}>…a ďalších {chybajuce.length - 25}.</div>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Hodiny, ktoré už prebehli podľa kalendára, ale v PTminderi ešte nie sú.
 *
 * Vytiahnuté z karty Balíčky, lebo tú istú otázku kladie aj sekcia „Končí
 * platnosť členstva": Kadličková mala v Balíčkoch 2/6 (po odtrénovanej
 * hodine) a o pár riadkov nižšie 3/6 (holá momentka z exportu) — dve rôzne
 * čísla pre tú istú klientku na jednej obrazovke. Porovnáva sa bez
 * diakritiky a s toleranciou ±1 deň, rovnako ako „Chýba v PTminderi".
 */
export function odtrenovaneMimoExportu(
  udalosti: KalUdalost[],
  sedenia: { client: string; date: string }[],
): Record<string, number> {
  const teraz = new Date();
  const dnes = teraz.toISOString().slice(0, 10);
  const hola = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const posun = (d: string, o: number) => new Date(Date.parse(`${d}T00:00:00Z`) + o * 86400000).toISOString().slice(0, 10);
  const zapisane = new Set(sedenia.map((x) => `${hola(x.client)}|${x.date.slice(0, 10)}`));
  const out: Record<string, number> = {};
  for (const u of udalosti) {
    if (u.typ !== "trening" || !u.klient) continue;
    const den = u.zaciatok.slice(0, 10);
    if (den > dnes || (den === dnes && Date.parse(u.zaciatok) > teraz.getTime())) continue;
    const k = hola(u.klient);
    if ([-1, 0, 1].some((o) => zapisane.has(`${k}|${posun(den, o)}`))) continue;
    out[u.klient] = (out[u.klient] || 0) + 1;
  }
  return out;
}

/**
 * Balíčky po započítaní toho, čo je už objednané — nie po poslednom exporte.
 *
 * Karta žije na Kokpite, nie v Kalendári: je to vec, ktorá si pýta akciu dnes
 * (ozvať sa, kým klienta ešte vidíš na hodine), a tie patria na prvú obrazovku.
 * Kalendár je miesto, kde sa dáta zbierajú; Kokpit je miesto, kde sa konajú.
 */
export function Balicky({ udalosti, clients, sedenia = [], onObnov, style, onKlient, matchTrener, children }: {
  udalosti: KalUdalost[];
  clients: Record<string, ClientAgg>;
  /** Zápisy z PTmindera — podľa nich sa pozná, ktorý tréning z kalendára
   *  už JE zapísaný a ktorý sa odtrénoval, ale do exportu sa ešte nedostal. */
  sedenia?: { client: string; date: string }[];
  /** Tvrdé obnovenie: stiahne kalendár a načíta dáta odznova. */
  onObnov?: () => Promise<void>;
  style?: React.CSSProperties;
  /** Klik na meno — na Kokpite otvára profil klienta. */
  onKlient?: (meno: string) => void;
  /** Prepínač trénera na Kokpite — týka sa klientov bez termínu v kalendári. */
  matchTrener?: (t: string) => boolean;
  /** Doplnková sekcia pod zoznamom (na Kokpite končiace platnosti členstiev). */
  children?: React.ReactNode;
}) {
  const [obnovujem, setObnovujem] = useState(false);
  const riadky = useMemo(() => {
    const teraz = new Date();
    const dnes = teraz.toISOString().slice(0, 10);
    /**
     * Zostatok v PTminderi je pravda k poslednému importu, nie k tejto minúte.
     *
     * Jerry (10. 8., 19:08): „mal som teraz tréning s Annou o 18:00, ostáva jej
     * 3/6" — hodina sa odtrénovala, ale export z PTmindera príde až v nedeľu,
     * takže appka ju ešte nevidí. Kalendár ju vidí. Preto sa od zostatku
     * odčítavajú DVE veci: hodiny už odtrénované (v kalendári sú v minulosti
     * a v PTminderi zatiaľ nie sú) a hodiny objednané dopredu.
     *
     * Porovnáva sa bez diakritiky a s toleranciou ±1 deň — tá istá logika ako
     * v karte „Chýba v PTminderi", lebo je to tá istá otázka.
     *
     * Keď klient tréning zrušil a Jerry ho z kalendára vymaže, udalosť zmizne
     * a hodina sa vráti sama. Účtovníctvo tak zostáva na PTminderi; kalendár
     * je len predbežná vrstva medzi dvoma nedeľnými exportmi.
     */
    const objednane: Record<string, number> = {};
    // Odtrénované-ale-neexportované ráta spoločný helper hore — tie isté
    // čísla číta aj sekcia „Končí platnosť členstva" na Kokpite.
    const odtrenovane = odtrenovaneMimoExportu(udalosti, sedenia);
    for (const u of udalosti) {
      if (u.typ !== "trening" || !u.klient) continue;
      const den = u.zaciatok.slice(0, 10);
      if (den > dnes || (den === dnes && Date.parse(u.zaciatok) > teraz.getTime())) {
        objednane[u.klient] = (objednane[u.klient] || 0) + 1;
      }
    }
    for (const meno of Object.keys(odtrenovane)) if (objednane[meno] === undefined) objednane[meno] = 0;
    // Kto má hodiny dochodené a v kalendári NIČ, je najurgentnejší telefonát zo
    // všetkých — a práve on by z kalendárového zoznamu vypadol, lebo nemá čo
    // odčítať. Preto sa dopĺňa s nulou objednaných.
    for (const c of Object.values(clients)) {
      if (objednane[c.name] !== undefined) continue;
      if (c.status === "Neaktívny" || c.status === "Pauza" || c.lenDoplnky) continue;
      if (matchTrener && !matchTrener(c.primaryTrainer)) continue;
      if (c.packageTotal > 0 && c.packageRemaining <= 0) objednane[c.name] = 0;
    }
    return Object.entries(objednane)
      .map(([meno, kusov]) => {
        const c = clients[meno];
        if (!c || c.packageTotal == null || c.packageRemaining == null) return null;
        // Kto má len „doplnenie členstva" alebo „za protokol", nemá balíček —
        // má paušál a v exporte stojí navždy na 0/N. Tvrdiť mu, že mu dochádzajú
        // hodiny, je nepravda o produkte, ktorý si kúpil; presne táto zámena
        // kedysi rozsvietila 40 zo 73 klientov. Rovnako klient bez akéhokoľvek
        // balíčka v PTminderi (0 z 0) — tam sa nedá povedať nič, tak sa mlčí.
        if (c.lenDoplnky) return null;
        if (!c.packageTotal && !c.membership) return null;
        const uz = odtrenovane[meno] || 0;
        return { meno, kusov, uz, zostava: c.packageRemaining, spolu: c.packageTotal, po: c.packageRemaining - kusov - uz, platnostDo: c.packageValidTo || "" };
      })
      .filter((x): x is NonNullable<typeof x> => !!x && x.po <= 1)
      .sort((a, b) => a.po - b.po || a.meno.localeCompare(b.meno));
  }, [udalosti, clients, matchTrener, sedenia]);

  return (
    <Card style={style}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            text="Odznak je zostatok PRESNE ako v PTminderi — to číslo, ktoré vidíš v ňom. Text pod menom hovorí, čo s ním spraví kalendár: odtrénované sú hodiny, ktoré už prebehli, ale do nedeľného exportu sa ešte nedostali; obj. sú dohodnuté termíny dopredu. PTminder je účtovníctvo, kalendár len predbežná vrstva medzi dvoma exportmi — preto sa zrušený tréning vráti sám, len čo ho z kalendára vymažeš. Klienti s paušálnym členstvom sa nezobrazujú: tí stoja v exporte navždy na 0/N. Mení sa podľa prepínača trénera."
            label={`Balíček dojde po objednaných hodinách (${riadky.length})`}
          />
        </H3>
        {/* Tvrdé obnovenie. Kalendár sa sťahuje sám (cron ráno a večer), ale
            keď práve dotrénuješ, chceš to vidieť hneď — nie o dvanásť hodín. */}
        {onObnov && (
          <button
            onClick={() => { setObnovujem(true); void onObnov().finally(() => setObnovujem(false)); }}
            disabled={obnovujem}
            title="Stiahnuť kalendár teraz a prepočítať zostatky"
            style={{
              padding: "4px 11px", borderRadius: 8, fontSize: 11.5, cursor: obnovujem ? "wait" : "pointer",
              border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
            }}
          >
            {obnovujem ? "Sťahujem…" : "↻ Obnoviť"}
          </button>
        )}
      </div>
      {!riadky.length ? (
        <Empty>Nikomu balíček po objednaných hodinách nedochádza 🌿</Empty>
      ) : (
        /* Tri stĺpce namiesto jedného dlhého — sedemnásť riadkov pod sebou
           znamenalo rolovať cez pol obrazovky; v mriežke je celý zoznam
           viditeľný naraz a poradie (najväčší mínus prvý) číta po riadkoch. */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
          {riadky.map((r) => (
            <div key={r.meno} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", background: mix(C.text, 4), border: `1px solid ${C.border}`, borderRadius: 9, minWidth: 0 }}>
              {/* Odznak = STAV Z PTMINDERA, presne to číslo, ktoré Jerry vidí
                  v PTminderi — žiadna projekcia. Prvá verzia ukazovala zostatok
                  PO objednaných („−2/17") a proti PTminderu vyzerala ako chyba;
                  Jerry ju trikrát čítal ako zlé dáta. Projekcia (mínus) je
                  v texte vedľa, farba sa ňou riadi ďalej. */}
              {/* Odznak = koľko má TERAZ. Je to zostatok z PTmindera mínus
                  hodiny, ktoré sa už odtrénovali a do exportu sa ešte
                  nedostali — teda číslo, na ktorom PTminder bude po najbližšom
                  importe. Nie je to projekcia z objednávok: tú nesie text
                  vedľa. Rozdiel je podstatný — odtrénovaná hodina sa STALA,
                  objednaná sa ešte stať nemusí. */}
              <span style={{
                fontSize: 10.5, fontWeight: 700, minWidth: 40, padding: "2px 6px", borderRadius: 6, textAlign: "center", flexShrink: 0,
                color: r.po <= 0 ? C.red : C.orange,
                background: mix(r.po <= 0 ? C.red : C.orange, 12),
              }}>
                {Math.max(0, r.zostava - r.uz)}{r.spolu ? `/${r.spolu}` : ""}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {onKlient ? (
                  <button
                    onClick={() => onKlient(r.meno)}
                    title={`Otvoriť profil — ${r.meno}`}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 12.5, color: C.text, fontWeight: 600, cursor: "pointer", textAlign: "left", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}
                  >
                    {r.meno}
                  </button>
                ) : (
                  <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.meno}</span>
                )}
                {/* Namiesto projekcie („→ v mínuse o 4 h") stojí DÁTUM, dokedy
                    členstvo platí (Jerry, 10. 8.: „to mi príde irelevantné,
                    daj tam radšej dátum"). Projekcia hovorila, čo sa stane
                    s hodinami, ale otázka pri obnove je kedy — a odpoveď na
                    ňu má appka v exporte. Kto platnosť zapísanú nemá, má
                    riadok kratší; vymýšľať sa nedá. */}
                <span style={{ fontSize: 11, color: C.textDim, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.uz ? `${r.uz} h odtrénovaná, v PTminderi ešte nie` : null}
                  {r.uz && r.kusov ? " · " : null}
                  {r.kusov ? `obj. ${r.kusov}` : r.uz ? null : "bez termínu"}
                  {r.platnostDo ? ` · platnosť do ${fmtDMY(r.platnostDo)}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {children}
    </Card>
  );
}


/**
 * Účet u Guillerma.
 *
 * Nie sú to „predplatené hodiny", ale účet, ktorý ide oboma smermi: Jerry platí
 * dopredu v dávkach a medzi platbami padá do mínusu.
 *
 * Ručne sa zadáva JEDINÁ vec — koľko sedení daná platba kúpila. Platby si appka
 * ťahá sama z bitcoinovej knihy (výbery „FP spain"), lebo tam ich Jerry aj tak
 * zapisuje; prepisovať sumu druhýkrát by znamenalo dva zdroje o tom istom.
 * A koľko sedení za tie peniaze bolo, sa z výberu vyčítať nedá — kurz aj cena
 * sa menia a delenie by len tvorilo presné čísla bez opory.
 *
 * KOTVA. Kalendár siaha dva týždne dozadu, takže sedenia od februára v ňom nie
 * sú. Bez pevného bodu by karta ukazovala nezmysel, preto sa raz zapíše stav
 * k dátumu a od neho sa počíta ďalej.
 */
export function GuillermoKarta() {
  const [zaznamy, setZaznamy] = useState<Guillermo[]>([]);
  const [udalosti, setUdalosti] = useState<KalUdalost[]>([]);
  const [platby, setPlatby] = useState<BtcVyplata[]>([]);
  const [kotvaOtvorena, setKotvaOtvorena] = useState(false);
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [stav, setStav] = useState("");
  const [sedeni, setSedeni] = useState<Record<string, string>>({});
  const [uklada, setUklada] = useState("");

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/kalendar", { credentials: "same-origin" });
    const j = (await r.json()) as { ok?: boolean; guillermo?: Guillermo[]; udalosti?: KalUdalost[] };
    if (j.ok) { setZaznamy(j.guillermo || []); setUdalosti(j.udalosti || []); }
    const btc = await fetchBtcReserve(false, true, false);
    // „FP spain" aj staršie „Jerry vyplata fp" — ten istý človek, iný zápis.
    setPlatby((btc?.vyplaty || []).filter((v) => /fp\s*spain|vyplata fp|fpspain/i.test(v.poznamka || "")));
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const dnes = new Date().toISOString().slice(0, 10);
  const kotva = zaznamy.filter((z) => z.druh === "zostatok").sort((a, b) => b.datum.localeCompare(a.datum))[0] || null;
  const odKedy = kotva?.datum || "0000-00-00";
  const nakupy = zaznamy.filter((z) => z.druh === "nakup");
  const kupene = nakupy.filter((z) => z.datum > odKedy).reduce((a, z) => a + z.hodiny, 0);
  const odtrenovane = udalosti.filter((u) => u.typ === "guillermo" && u.zaciatok.slice(0, 10) > odKedy && u.zaciatok.slice(0, 10) <= dnes).length;
  const zostatok = (kotva?.hodiny ?? 0) + kupene - odtrenovane;

  // Platba, ku ktorej ešte nikto nepovedal, koľko sedení kúpila.
  const zaradene = new Set(nakupy.map((z) => z.datum));
  const cakajuce = platby.filter((v) => String(v.datum).slice(0, 10) > odKedy && !zaradene.has(String(v.datum).slice(0, 10)));

  const ulozKotvu = async () => {
    const n = Number(stav);
    if (!Number.isFinite(n)) return;
    setUklada("kotva");
    await posli({ akcia: "guillermo-pridaj", druh: "zostatok", datum, sedeni: n });
    setUklada(""); setStav(""); setKotvaOtvorena(false);
    await nacitaj();
  };

  const ulozPlatbu = async (v: BtcVyplata) => {
    const den = String(v.datum).slice(0, 10);
    const n = Number(sedeni[den]);
    if (!(n > 0)) return;
    setUklada(den);
    await posli({ akcia: "guillermo-pridaj", druh: "nakup", datum: den, sedeni: n, suma: v.czk ?? null, poznamka: v.poznamka });
    setUklada("");
    await nacitaj();
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            text="Účet u Guillerma (Functional Patterns Spain). Jerryho osobné peniaze, nie náklad firmy — do P&L to nezasahuje. Platby si appka ťahá z bitcoinovej knihy (výbery „FP spain“); ručne zadávaš jedinú vec — koľko sedení tá platba kúpila. Čerpanie hovorí kalendár: každá udalosť označená ako Guillermo je jedno sedenie."
            label="Guillermo"
          />
        </H3>
        <button onClick={() => setKotvaOtvorena(!kotvaOtvorena)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12.5, cursor: "pointer" }}>
          {kotvaOtvorena ? "skryť" : "opraviť stav"}
        </button>
      </div>

      {!kotva ? (
        <div style={{ fontSize: 12, color: C.orange, margin: "8px 0 0", lineHeight: 1.55 }}>
          Zatiaľ nie je od čoho počítať. Klikni na <b>opraviť stav</b> a zapíš, koľko sedení si mal
          k danému dňu — napríklad „+3 k 29. 7. 2026" podľa správy Josému.
        </div>
      ) : (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "10px 0 4px", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: zostatok < 0 ? C.red : zostatok === 0 ? C.orange : C.green }}>
              {zostatok > 0 ? "+" : ""}{zostatok}
            </div>
            <div style={{ fontSize: 11.5, color: C.textDim }}>
              {zostatok < 0 ? `${-zostatok} sedení dlžíš` : zostatok === 0 ? "vyrovnané — čas zaplatiť" : "sedení dopredu"}
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>
            od {kotva.datum.split("-").reverse().join(". ")} bolo {kotva.hodiny > 0 ? "+" : ""}{kotva.hodiny}
            {kupene ? ` · pribudlo ${kupene}` : ""} · odtrénované {odtrenovane}
          </div>
        </div>
      )}

      {zostatok <= 0 && kotva && (
        <div style={{ fontSize: 12, color: C.orange, marginTop: 8, padding: "8px 11px", borderRadius: 8, background: mix(C.orange, 10), lineHeight: 1.55 }}>
          Predplatené sedenia došli. Pošli Josému platbu a zapíš ju v bitcoinovej knihe ako
          „FP spain" — appka ju tu potom sama ponúkne a ty len doplníš, koľko sedení kúpila.
        </div>
      )}

      {cakajuce.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>
            Platby z bitcoinovej knihy — koľko sedení kúpili?
          </div>
          {cakajuce.map((v) => {
            const den = String(v.datum).slice(0, 10);
            return (
              <div key={den} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "5px 0" }}>
                <span style={{ fontSize: 12.5, color: C.text, minWidth: 92 }}>{den.split("-").reverse().join(". ")}</span>
                <span style={{ fontSize: 12.5, color: C.textMuted, minWidth: 90 }}>
                  {v.czk ? `${Math.round(v.czk).toLocaleString("cs-CZ")} Kč` : `${v.sats.toLocaleString("cs-CZ")} sats`}
                </span>
                <input value={sedeni[den] || ""} onChange={(e) => setSedeni({ ...sedeni, [den]: e.target.value })}
                  placeholder="sedení" style={{ width: 92, padding: "6px 9px", borderRadius: 7, fontSize: 12.5, border: `1px solid ${C.border}`, background: C.bg, color: C.text }} />
                <button onClick={() => void ulozPlatbu(v)} disabled={uklada === den || !(Number(sedeni[den]) > 0)}
                  style={{ padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: Number(sedeni[den]) > 0 ? "pointer" : "not-allowed",
                    border: `1px solid ${mix(C.green, 45)}`, background: Number(sedeni[den]) > 0 ? mix(C.green, 12) : "transparent", color: Number(sedeni[den]) > 0 ? C.green : C.textDim }}>
                  {uklada === den ? "…" : "Zapísať"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {kotvaOtvorena && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: C.textMuted }}>Stav k dátumu:</span>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, fontSize: 12.5, border: `1px solid ${C.border}`, background: C.bg, color: C.text }} />
          <input value={stav} onChange={(e) => setStav(e.target.value)} placeholder="napr. 3 alebo -5"
            style={{ width: 120, padding: "7px 10px", borderRadius: 8, fontSize: 12.5, border: `1px solid ${C.border}`, background: C.bg, color: C.text }} />
          <button onClick={() => void ulozKotvu()} disabled={uklada === "kotva" || stav.trim() === ""}
            style={{ padding: "7px 15px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: stav.trim() ? "pointer" : "not-allowed",
              border: `1px solid ${mix(C.green, 45)}`, background: stav.trim() ? mix(C.green, 12) : "transparent", color: stav.trim() ? C.green : C.textDim }}>
            {uklada === "kotva" ? "…" : "Zapísať"}
          </button>
        </div>
      )}

      {nakupy.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {nakupy.map((z) => (
            <div key={z.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${mix(C.border, 45)}`, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: C.textMuted, minWidth: 82 }}>{z.datum.split("-").reverse().join(". ")}</span>
              <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>+{z.hodiny} sedení</span>
              {z.suma_czk ? <span style={{ fontSize: 12, color: C.textMuted }}>{Math.round(z.suma_czk).toLocaleString("cs-CZ")} Kč</span> : null}
              <button onClick={async () => { await posli({ akcia: "guillermo-zmaz", id: z.id }); await nacitaj(); }}
                style={{ marginLeft: "auto", background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer" }}>
                zmazať
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
