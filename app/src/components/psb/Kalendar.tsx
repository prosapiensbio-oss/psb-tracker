import { useCallback, useEffect, useMemo, useState } from "react";

import type { ClientAgg } from "../../lib/psb/compute";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info, Select } from "./ui";

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
type Udalost = { uid: string; trener: string; zaciatok: string; koniec: string; nazov: string; klient: string | null; typ: string | null };
type Nezname = { nazov: string; trener: string; pocet: number; najblizsi: string };
type Stav = { zdroje: Zdroj[]; zmeny: Zmena[]; mapovanie: Mapa[]; udalosti: Udalost[]; nezname: Nezname[] };

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

async function posli(telo: Record<string, unknown>) {
  const r = await fetch("/api/kalendar", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(telo),
  });
  return (await r.json()) as { ok: boolean; error?: string; vysledky?: Record<string, { ok: boolean; zmien?: number; udalosti?: number; chyba?: string; prveStiahnutie?: boolean }> };
}

export function Kalendar({ clients }: { clients: Record<string, ClientAgg> }) {
  const [stav, setStav] = useState<Stav | null>(null);
  const [chyba, setChyba] = useState("");
  const [sprava, setSprava] = useState("");
  const [pracuje, setPracuje] = useState(false);

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/kalendar", { credentials: "same-origin" });
    const j = (await r.json()) as { ok: boolean } & Stav;
    if (j.ok) setStav({ zdroje: j.zdroje, zmeny: j.zmeny, mapovanie: j.mapovanie, udalosti: j.udalosti, nezname: j.nezname });
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

  return (
    <>
      <Pripojenie zdroje={stav.zdroje} onZmena={nacitaj} />

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

      {stav.nezname.length > 0 && (
        <Mapovanie nezname={stav.nezname} mena={menaKlientov} clients={clients} onHotovo={nacitaj} />
      )}

      {pripojene && <Zmeny zmeny={stav.zmeny} onHotovo={nacitaj} />}
      {pripojene && <Tyzden udalosti={stav.udalosti} />}
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
function Zmeny({ zmeny, onHotovo }: { zmeny: Zmena[]; onHotovo: () => Promise<void> }) {
  const [pisem, setPisem] = useState<Record<string, string>>({});

  const popis = (z: Zmena) => {
    const kto = z.klient || z.nazov || "udalosť";
    if (z.druh === "zrusene") return `${kto} — zmizol tréning z ${z.pred ? `${den(z.pred)} ${cas(z.pred)}` : "kalendára"}`;
    if (z.druh === "posunute") return `${kto} — presun z ${z.pred ? `${den(z.pred)} ${cas(z.pred)}` : "?"} na ${z.po ? `${den(z.po)} ${cas(z.po)}` : "?"}`;
    if (z.druh === "pridane") return `${kto} — pribudol tréning ${z.po ? `${den(z.po)} ${cas(z.po)}` : ""}`;
    return `${kto} — zmena názvu z „${z.pred}" na „${z.po}"`;
  };
  const farba = (d: string) => (d === "zrusene" ? C.red : d === "posunute" ? C.orange : d === "pridane" ? C.green : C.textMuted);

  if (!zmeny.length) {
    return (
      <Card>
        <H3><Info text="Rozdiel medzi posledným a predchádzajúcim stiahnutím kalendára. Zrušenia a presuny sa tu objavia aj vtedy, keď na ne zabudneš — a keď ich vysvetlíš, zápis zostane." label="Zmeny v kalendári" /></H3>
        <Empty>Od posledného stiahnutia sa nič nezmenilo.</Empty>
      </Card>
    );
  }

  return (
    <Card>
      <H3><Info text="Rozdiel medzi posledným a predchádzajúcim stiahnutím kalendára. Vysvetlenie sa uloží — o rok bude pri tom mesiaci vidieť, prečo hodina zmizla." label={`Zmeny v kalendári (${zmeny.length})`} /></H3>
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

/** Čo je objednané. Dva týždne dopredu — ďalej je opakovanie zvykom, nie plánom. */
function Tyzden({ udalosti }: { udalosti: Udalost[] }) {
  const dnes = new Date().toISOString().slice(0, 10);
  const buduce = udalosti.filter((u) => u.zaciatok.slice(0, 10) >= dnes && u.typ !== "sukromne" && u.typ !== "netrening");
  const podlaDna: Record<string, Udalost[]> = {};
  for (const u of buduce) (podlaDna[u.zaciatok.slice(0, 10)] ||= []).push(u);

  const hodin = buduce.reduce((a, u) => a + (Date.parse(`${u.koniec}:00Z`) - Date.parse(`${u.zaciatok}:00Z`)) / 3600000, 0);

  return (
    <Card>
      <H3><Info text="Čo je v kalendári objednané odteraz dva týždne dopredu. Je to predpoveď, nie zápis — skutočnosť napíše až nedeľný export z PTmindera." label="Objednané dopredu" /></H3>
      <div style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 12px" }}>
        {buduce.length} tréningov · {Math.round(hodin)} h · predbežné
      </div>
      {!buduce.length && <Empty>Dopredu nie je nič — alebo sa kalendár ešte nestiahol.</Empty>}
      {Object.entries(podlaDna).sort().map(([d, zoznam]) => (
        <div key={d} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: `1px solid ${mix(C.border, 45)}`, alignItems: "baseline", flexWrap: "wrap" }}>
          <div style={{ minWidth: 78, fontSize: 12.5, fontWeight: 700, color: C.textMuted }}>{den(`${d}T00:00`)}</div>
          <div style={{ flex: 1, display: "flex", gap: 7, flexWrap: "wrap" }}>
            {zoznam.sort((a, b) => a.zaciatok.localeCompare(b.zaciatok)).map((u) => (
              <span
                key={`${u.uid}|${u.trener}`}
                title={`${u.trener} · ${u.nazov}`}
                style={{
                  fontSize: 11.5, padding: "3px 8px", borderRadius: 6,
                  background: mix(u.trener === "Jerry" ? C.accent : C.blue, 12),
                  border: `1px solid ${mix(u.trener === "Jerry" ? C.accent : C.blue, 35)}`,
                  color: C.text, whiteSpace: "nowrap",
                }}
              >
                {cas(u.zaciatok)} {u.klient || u.nazov}
                {!u.klient && <span style={{ color: C.orange }}> ?</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}
