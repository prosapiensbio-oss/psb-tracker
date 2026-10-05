import { oznam } from "../../lib/psb/obnovaSignal";
import type { NavFocus } from "./App";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtDMY, normName } from "../../lib/psb/format";

import { fetchBtcReserve, type BtcVyplata } from "../../lib/psb/client";
import { navrhniKlientaKandidati, vyzeraNaMeno, type ClientAgg } from "../../lib/psb/compute";
import type { TyzdenPorovnania } from "../../lib/psb/porovnanieDochadzky";
import { trenerZPrihlasenia } from "../../lib/psb/workspaceKarty";
import { KALENDAR_TRENERA } from "../../lib/psb/nahodTrening";
import { guillermoZostatok } from "../../lib/psb/guillermo";
import type { PSBData } from "../../lib/psb/types";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info, Select, TrenerPills } from "./ui";
import { useUzke } from "./useUzke";
import { menoDoBloku, rozlozUdalosti } from "../../lib/psb/kalendarRozlozenie";
import { VyberMena } from "./VyberMena";
import { dnesPraha, terazPraha } from "../../lib/psb/cas";

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
export type Zmena = { id: string; kedy: string; trener: string; uid: string; druh: string; nazov: string | null; klient: string | null; pred: string | null; po: string | null; poznamka?: string | null; vysvetlene?: number; odpovedane_at?: string | null };
type Mapa = { nazov: string; trener: string; klient: string | null; typ: string };
export type KalUdalost = { uid: string; trener: string; zaciatok: string; koniec: string; nazov: string; klient: string | null; typ: string | null };
type Nezname = { nazov: string; trener: string; pocet: number; najblizsi: string };
/** Meno z kalendára, ktoré sedí na viacerých klientov (napr. dve Markety). */
type Nejednoznacne = { nazov: string; kandidati: string[]; casy: string[] };
type Guillermo = { id: string; datum: string; druh: string; hodiny: number; suma_czk: number | null; poznamka: string | null };
export type Porovnanie = { tyzdne: TyzdenPorovnania[]; od: string; do: string; sedeni: number; lenPtminder: number; lenKalendar: number; bezKalendara: { trener: string; sedeni: number }[] };
type Stav = { zdroje: Zdroj[]; zmeny: Zmena[]; zmenyHistoria: Zmena[]; mapovanie: Mapa[]; udalosti: KalUdalost[]; nezname: Nezname[]; guillermo: Guillermo[]; nejednoznacne: Nejednoznacne[]; porovnanie: Porovnanie | null };

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
// `normName` z format.ts — jedna normalizácia MENA pre celú appku. Lokálna
// kópia tu navyše nezlučovala viacnásobné medzery, takže „Zuzana  Spoligová"
// s dvojitou medzerou sa v jednej karte spárovala a v druhej nie (18. 8. 2026).
const bezDiakritiky = normName;

export function navrhni(
  nazov: string,
  clients: Record<string, ClientAgg>,
): { typ: string; kandidati: string[]; meno: string } {
  // Logika žije v compute.ts (navrhniKlientaKandidati) — notifikácia a táto
  // karta musia dávať ten istý návrh, inak sa raz rozídu.
  return navrhniKlientaKandidati(nazov, clients);
}

/**
 * Deň v tvare „Ut 11.8.". Znesie oba tvary, ktoré sa v zmenách vyskytujú:
 * skrátený z rozdielu kalendára (`2026-08-11T17:00`) aj plné ISO. Pri
 * nezmyselnom vstupe vráti prázdno — nie „undefined NaN.NaN.", ako to raz
 * spravil ručný zápis, ktorý uložil plné ISO. Nečitateľný dátum je chyba;
 * dátum, ktorý sa tvári ako text, je horšia chyba.
 */
export const den = (s: string) => {
  if (!s) return "";
  const d = new Date(/\dT\d{2}:\d{2}$/.test(s) ? `${s}:00Z` : s);
  if (Number.isNaN(d.getTime())) return "";
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
  type Snimka = { ok: boolean; zmien?: number; udalosti?: number; chyba?: string; prveStiahnutie?: boolean };
  return (await r.json()) as {
    ok: boolean; error?: string;
    /** Od 24. 8. 2026 sa sťahuje po jednom kalendári — odpoveď nesie jeden výsledok. */
    trener?: string; vysledok?: Snimka; zostava?: string[];
    vysledky?: Record<string, Snimka>;
  };
}

export function Kalendar({ clients, data, focus, ktoSom, trainer, onTrainer, onNavigate }: { clients: Record<string, ClientAgg>; data: PSBData; focus?: NavFocus | null; ktoSom?: string | null; trainer?: string; onTrainer?: (t: string) => void; onNavigate?: (tab: string, sub?: string) => void }) {
  const [stav, setStav] = useState<Stav | null>(null);
  const [chyba, setChyba] = useState("");
  const [sprava, setSprava] = useState("");
  const [pracuje, setPracuje] = useState(false);

  /**
   * Filter trénera platí na CELÚ kartu, nie len na mriežku.
   *
   * Keď si Jerry prepne na seba, nemá zmysel, aby mu pod týždňom ďalej svietili
   * Terezkine zrušenia, jej chýbajúce zápisy a jej balíčky. Prepínač je jeden a
   * drží ho tento komponent; karty dostávajú už prefiltrované dáta.
   */
  //
  // A je to TEN ISTÝ prepínač ako na Dashboarde, Klientoch a Tréningoch
  // (`trainer` z App). Dovtedy mal Kalendár vlastný, ktorý sa pri každom
  // otvorení vrátil na „Obaja" — Jerry, 14. 9. 2026: „mám nastavenú Terezku,
  // kliknem na Hodiny / týždeň a hodí ma to do kalendára na Obaja". Vlastný
  // stav zostáva len ako záloha, keby komponent niekto použil bez App.
  const [trenerLokalny, setTrenerLokalny] = useState(trainer || "all");
  const trener = trainer ?? trenerLokalny;
  const setTrener = (t: string) => (onTrainer ? onTrainer(t) : setTrenerLokalny(t));

  // Preklik z Dashboardu („Kalendár: 4 nevysvetlené zmeny →") prináša
  // trénera a chce tabuľku zmien — nie vrch stránky. Rovnaký filter ako na
  // Dashboarde, inak by Jerry klikol na svoje zmeny a uvidel Terezkine.
  // Kam zrolovať: „nezname" na kartu Nové názvy, inak na Zmeny. Preklik z
  // dvoch rôznych notifikácií viedol dovtedy na tú istú kartu (Jerry, 3. 9.).
  const [rolovatNa, setRolovatNa] = useState<string | null>(null);
  useEffect(() => {
    if (!focus?.nonce) return;
    // Preklik bez trénera nechá platiť to, čo je práve zvolené — nesmie
    // prepnúť na „Obaja".
    if (focus.trainer) setTrener(focus.trainer);
    setRolovatNa(focus.sekcia === "nezname" ? "kal-nezname" : "kal-zmeny");
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  // Roluje sa až keď obsah existuje — pri prvom otvorení sa kalendár ešte
  // len sťahuje a kotva v DOM nie je (21. 8.: preklik otvoril Kalendár,
  // ale zostal hore).
  useEffect(() => {
    if (!rolovatNa || !stav) return;
    const t = setTimeout(() => {
      const el = document.getElementById(rolovatNa);
      // Keď cieľová karta neexistuje (nič neznáme), padni späť na Zmeny —
      // radšej vrch tabuľky než nič.
      const ciel = el || document.getElementById("kal-zmeny");
      if (ciel) { ciel.scrollIntoView({ behavior: "smooth", block: "start" }); setRolovatNa(null); }
    }, 150);
    return () => clearTimeout(t);
  }, [rolovatNa, stav]);

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/kalendar", { credentials: "same-origin" });
    const j = (await r.json()) as { ok: boolean } & Stav;
    if (j.ok) setStav({ zdroje: j.zdroje, zmeny: j.zmeny, zmenyHistoria: j.zmenyHistoria || [], mapovanie: j.mapovanie, udalosti: j.udalosti, nezname: j.nezname, guillermo: j.guillermo || [], nejednoznacne: j.nejednoznacne || [], porovnanie: j.porovnanie || null });
  }, []);

  useEffect(() => { void nacitaj(); }, [nacitaj]);

  /**
   * Sťahuje sa PO JEDNOM KALENDÁRI, každý vlastnou požiadavkou.
   *
   * Oba naraz Cloudflare zabil na „Worker exceeded resource limits" — prvý
   * sa stihol zapísať, druhý nie, a keďže worker zomrel pred zápisom chyby,
   * nikto sa nedozvedel, že jeden kalendár už týždeň nechodí (24. 8. 2026).
   */
  const stiahni = async () => {
    setPracuje(true); setChyba(""); setSprava("");
    const casti: string[] = [];
    let dalsi: string | undefined;
    // Poistka proti cykleniu: zdrojov je pár, desať kôl je viac než dosť.
    for (let i = 0; i < 10; i++) {
      const j = await posli({ akcia: "stiahni", ...(dalsi ? { trener: dalsi } : {}) });
      if (!j.ok) { setChyba(j.error || "Nepodarilo sa."); break; }
      const v = j.vysledok;
      const t = j.trener || "?";
      casti.push(v?.ok
        ? `${t}: ${v.udalosti} udalostí${v.prveStiahnutie ? " (prvé načítanie)" : `, ${v.zmien} zmien`}`
        : `${t}: ${v?.chyba || "nepodarilo sa"}`);
      setSprava(casti.join(" · "));
      const zostava: string[] = Array.isArray(j.zostava) ? j.zostava : [];
      // Berie sa len ten, ktorý sme ešte v tomto kole nespracovali.
      dalsi = zostava.find((x) => !casti.some((c) => c.startsWith(`${x}:`)));
      if (!dalsi) break;
    }
    setPracuje(false);
    await nacitaj();
  };

  const menaKlientov = useMemo(() => Object.keys(clients).sort((a, b) => a.localeCompare(b, "sk")), [clients]);

  if (!stav) return <Card><Empty>Načítavam…</Empty></Card>;

  const pripojene = stav.zdroje.length > 0;
  const udalostiF = trener === "all" ? stav.udalosti : stav.udalosti.filter((u) => u.trener === trener);
  const zmenyF = trener === "all" ? stav.zmeny : stav.zmeny.filter((z) => z.trener === trener);
  // Nedávno vybavené zmeny — kvôli kroku späť. Len tie, ktoré niekto naozaj
  // odklepol (majú čas odpovede), najnovších pätnásť; staršie sú už história,
  // nie omyl spred chvíle.
  const vybaveneF = (stav.zmenyHistoria || [])
    .filter((z) => z.vysvetlene === 1 && !!z.odpovedane_at && (trener === "all" || z.trener === trener))
    .sort((a, b) => String(b.odpovedane_at).localeCompare(String(a.odpovedane_at)))
    .slice(0, 15);

  return (
    <>
      {/* Poradie kariet nesie prioritu: hore je to, na čo sa človek pozerá
          každý deň (týždeň), potom to, čo si pýta odpoveď (zmeny, nové mená),
          a celkom dole obsluha (sťahovanie, pripojenie). Kým kalendár
          pripojený nie je, obráti sa to — vtedy je jediná zmysluplná vec
          práve to pripojenie. */}
      {!pripojene && <Pripojenie zdroje={stav.zdroje} onZmena={nacitaj} />}

      {pripojene && (
        <Tyzden
          udalosti={udalostiF}
          mena={menaKlientov}
          clients={clients}
          trener={trener}
          onTrener={setTrener}
          predvolenyTrener={KALENDAR_TRENERA[trener] ? trener : (trenerZPrihlasenia(ktoSom ?? null) || "Jerry")}
          onObnov={async () => { await nacitaj(); oznam("kalendar"); }}
        />
      )}

      {/* Zmeny a nové názvy sa od 5. 10. 2026 VYBAVUJÚ vo Workspace (krok 1)
          — Jerry: „aby to nebolo na dvoch miestach". Tu ostáva odkaz, ručný
          zápis toho, čo kalendár nevidel, a „Nedávno vybavené" s krokom späť. */}
      {pripojene && <div id="kal-zmeny"><Zmeny zmeny={onNavigate ? [] : zmenyF} vybavene={vybaveneF} onHotovo={async () => { await nacitaj(); oznam("kalendar"); }} mena={menaKlientov}
        cakaVoWorkspace={onNavigate ? { zmien: zmenyF.length, nazvov: (trener === "all" ? stav.nezname : stav.nezname.filter((n) => n.trener === trener)).length, otvor: () => onNavigate("workspace", "kalendar") } : undefined} /></div>}
      {/* „Nové názvy" idú NAD „Chýba v PTminderi" (Jerry, 22. 8. 2026).
          Je to poradie práce, nie estetika: kým sa meno z názvu udalosti
          nepriradí človeku, tréning nemá komu patriť — a presne preto potom
          spadne do „Chýba v PTminderi". Priradiť najprv a až potom čítať, čo
          chýba, znamená kratší zoznam a menej otázok. */}
      {stav.nejednoznacne.length > 0 && (
        <div id="kal-nejednoznacne"><DveMena zoznam={stav.nejednoznacne} onHotovo={async () => { await nacitaj(); oznam("kalendar"); }} /></div>
      )}

      {!onNavigate && stav.nezname.length > 0 && (
        <div id="kal-nezname"><Mapovanie nezname={stav.nezname} mena={menaKlientov} clients={clients} onHotovo={async () => { await nacitaj(); oznam("kalendar"); }} trener={trener} ktoSom={ktoSom} /></div>
      )}
      {pripojene && <Kontrola udalosti={udalostiF} data={data} />}
      {/* Balíčky aj „Odpísaní, ale majú termín" sa zliali na Kokpit (Jerry,
          9. 8.): dlaždica Odmlčaní sama vynecháva ľudí s budúcim termínom,
          takže táto karta hovorila to isté druhýkrát. Sem sa chodí pozerať,
          čo sa v kalendári zmenilo, nie komu treba zavolať. */}

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
              {z && z.posledna_chyba && (
                <div style={{ fontSize: 12, color: C.red, marginTop: 3, lineHeight: 1.4 }}>
                  {z.posledna_chyba}
                  {/* Pri chybe má človek vedieť aj to, AKO staré je to, čo vidí. */}
                  <div style={{ color: C.textDim, marginTop: 2 }}>
                    {z.posledne_ok ? `naposledy stiahnutý ${fmtDMY(z.posledne_ok)} ${z.posledne_ok.slice(11, 16)}` : "ešte sa nikdy nestiahol"}
                  </div>
                </div>
              )}
              {z && !z.posledna_chyba && (() => {
                // ZASTARANÝ ZDROJ SA MUSÍ OHLÁSIŤ.
                //
                // Terezkin kalendár prestal 17. 8. 2026 chodiť a nikto sa to
                // sedem dní nedozvedel: worker zomrel na limit skôr, než stihol
                // zapísať chybu, takže `posledna_chyba` zostala prázdna a riadok
                // svietil zeleno „pripojený". Appka celý ten čas ukazovala
                // tréningy, ktoré si Terezka dávno zmazala. Zelená bez dátumu
                // je horšia než červená s ním.
                const hodin = z.posledne_ok
                  ? (Date.now() - Date.parse(z.posledne_ok)) / 3600000
                  : Infinity;
                const zastaraný = hodin > 36;
                return (
                  <div style={{ fontSize: 12, color: zastaraný ? C.red : C.green, marginTop: 3, lineHeight: 1.4 }}>
                    pripojený{z.posledne_ok ? ` · naposledy ${fmtDMY(z.posledne_ok)} ${z.posledne_ok.slice(11, 16)}` : ""}
                    {zastaraný && (
                      <div style={{ marginTop: 2 }}>
                        {Number.isFinite(hodin)
                          ? `Nesťahoval sa ${Math.floor(hodin / 24)} dní — to, čo tu vidíš, môže byť neaktuálne.`
                          : "Ešte sa nikdy nestiahol."}
                      </div>
                    )}
                  </div>
                );
              })()}
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
/**
 * Mená, ktoré sedia na viacerých klientov.
 *
 * Toto je karta, ktorá 22. 9. 2026 chýbala. V kalendári stojí „Marketa"
 * a v štúdiu sú dve — appka si jednu ticho vybrala a šesť tréningov skončilo
 * u nesprávnej (aj s tempom, dochádzkou a zostatkom balíčka).
 *
 * Rieši sa to dvoma spôsobmi a oba sú tu: buď sa meno priradí podľa ČASU
 * (Marketa 8:30 = Resnerová), alebo sa v kalendári prepíše na celé meno —
 * čo je lepšie, lebo potom niet čo hádať.
 */
function DveMena({ zoznam, onHotovo }: { zoznam: Nejednoznacne[]; onHotovo: () => Promise<void> }) {
  const [uklada, setUklada] = useState("");
  const [chyba, setChyba] = useState("");

  const priraď = async (nazov: string, trener: string, cas: string, klient: string) => {
    setUklada(`${nazov}|${trener}|${cas}`); setChyba("");
    const j = await posli({ akcia: "mapuj", nazov, trener, cas, typ: "trening", klient, vedome: true })
      .catch(() => ({ ok: false, error: "spojenie" }));
    setUklada("");
    if (!j.ok) { setChyba(j.error || "nepodarilo sa uložiť"); return; }
    await onHotovo();
  };

  return (
    <Card>
      <H3>
        <Info
          label={`Jedno meno, viac klientov (${zoznam.length})`}
          text="V kalendári stojí krstné meno a v štúdiu je viac ľudí s tým istým. Kokpit si nesmie vybrať sám — zle priradený tréning sa pripíše cudziemu človeku a pokazí mu tempo, dochádzku aj zostatok balíčka. Priraď podľa času, alebo (lepšie) prepíš v kalendári na celé meno."
        />
      </H3>
      {chyba && <div style={{ fontSize: 12, color: C.red, marginBottom: 6 }}>{chyba}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {zoznam.map((n) => (
          <div key={n.nazov} style={{ padding: "9px 11px", borderRadius: 9, background: mix(C.orange, 7), border: `1px solid ${mix(C.orange, 22)}` }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
              „{n.nazov}" — sedí na {n.kandidati.length}: {n.kandidati.join(", ")}
            </div>
            <div style={{ fontSize: 11.5, color: C.textMuted, margin: "5px 0 7px" }}>
              Priraď podľa času, alebo prepíš v Google kalendári na celé meno — potom netreba nič.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {/* „Vždy" pre prípad, že to meno v kalendári patrí naozaj len
                  jednému z nich — jeden klik a meno z karty zmizne. */}
              {[...new Set(n.casy.map((tc) => tc.split("|")[0]))].map((trener) => (
                <div key={`vzdy-${trener}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: C.textMuted, minWidth: 116 }}>{trener} · vždy</span>
                  {n.kandidati.map((kand) => (
                    <button key={kand} disabled={!!uklada}
                      onClick={() => void priraď(n.nazov, trener, "", kand)}
                      style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
                        border: `1px solid ${mix(C.accent, 40)}`, background: "transparent", color: C.accentLight, fontFamily: "inherit" }}>
                      {uklada === `${n.nazov}|${trener}|` ? "ukladám…" : `vždy ${kand.split(" ")[1] || kand}`}
                    </button>
                  ))}
                </div>
              ))}
              {n.casy.map((tc) => {
                const [trener, cas] = tc.split("|");
                const k = `${n.nazov}|${trener}|${cas}`;
                return (
                  <div key={tc} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: C.textMuted, minWidth: 116 }}>{trener} · {cas || "bez času"}</span>
                    {n.kandidati.map((kand) => (
                      <button
                        key={kand}
                        disabled={!!uklada}
                        onClick={() => void priraď(n.nazov, trener, cas, kand)}
                        style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 7, cursor: "pointer",
                          border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontFamily: "inherit" }}>
                        {uklada === k ? "ukladám…" : kand}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Mapovanie({ nezname: nezmameVsetky, mena, clients, onHotovo, trener, ktoSom }: { nezname: Nezname[]; mena: string[]; clients: Record<string, ClientAgg>; onHotovo: () => Promise<void>; trener: string; ktoSom?: string | null }) {
  // Karta poslúcha ten istý filter, čo je hore na stránke (Obaja/Jerry/Terezka)
  // — druhý filter len pre túto kartu by si mohol s ním protirečiť.
  // Jerry, 3. 9. 2026: rozdeliť podľa filtra a pri „Obaja" uprednostniť
  // prihláseného.
  // Session nesie `users.name` („Jerry" s veľkým J), nie login. Porovnanie
  // s malými písmenami tu nikdy nesedelo a poradie skupín sa podľa
  // prihláseného nikdy neriadilo — ticho, bez chyby. Jedna definícia je
  // v `workspaceKarty.trenerZPrihlasenia`.
  const ktoSomTrener = trenerZPrihlasenia(ktoSom ?? null);
  const nezname = trener === "all" ? nezmameVsetky : nezmameVsetky.filter((n) => n.trener === trener);
  const [vyber, setVyber] = useState<Record<string, { klient: string; typ: string }>>({});
  const [uklada, setUklada] = useState("");
  // Server vie vrátiť {ok:false} aj s HTTP 200 — kto telo nečíta, hlási
  // úspech aj pri odmietnutom zápise. Vzor s lokálnou chybou je ten istý
  // ako pri zdrojoch kalendára vyššie (revízia 18. 8. 2026).
  const [chybaUloz, setChybaUloz] = useState("");

  // Návrhy sa počítajú z názvu — Jerryho pravidlo (krstné meno alebo
  // priezvisko, „úvodný + celé meno", „guillermo") je čitateľné strojom.
  const navrhy = useMemo(() => {
    const m: Record<string, { typ: string; kandidati: string[]; meno: string }> = {};
    for (const n of nezmameVsetky) m[`${n.nazov}|${n.trener}`] = navrhni(n.nazov, clients);
    return m;
  }, [nezmameVsetky, clients]);
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

  /**
   * Zoskupenie podľa človeka, nie podľa názvu (Terezka, 22. 8. 2026).
   *
   * Ten istý klient chodí v kalendári pod viacerými zápismi — „Jana",
   * „Jana M.", „Uvodný tréning Jana Malinová". Ako plochý zoznam ležali
   * ďaleko od seba (zoradené podľa početnosti) a človek ich priraďoval
   * jeden po druhom bez toho, aby vedel, že sú to tri mená tej istej osoby.
   * Kľúčom je appkin NAJLEPŠÍ ODHAD človeka — teda to, čo je práve
   * v poli mena; keď odhad nie je, riadok padne do skupiny „zatiaľ bez mena".
   *
   * Tréner zostáva súčasťou kľúča riadku (Natalia u Jerryho a Natalia
   * u Terezky sú dvaja ľudia) — zoskupenie ho len zobrazí vedľa mena.
   */
  /**
   * Čo vyzerá na tréning a čo nie.
   *
   * 22. 9. 2026 mala karta 91 položiek a sedemdesiat z nich bola veterina,
   * box, plávanie a „napísať Zuzke". Nikto ju neotváral — a tak v nej celé
   * týždne ležalo aj štrnásť skutočných tréningov, v ktorých appka nespoznala
   * človeka. Dlhý zoznam nie je práca navyše, je to zoznam, ktorý sa prestane
   * čítať.
   *
   * Deliaca čiara je appkin vlastný návrh: keď v názve niekoho spoznala
   * (alebo je to úvodný či Guillermo), je to skoro isto tréning. Keď nie,
   * patrí to dole — a dole sa to dá odbaviť naraz.
   */
  const jeTreningovy = (n: Nezname) => {
    const nav = navrhy[`${n.nazov}|${n.trener}`];
    if (nav && (nav.typ !== "trening" || nav.kandidati.length > 0)) return true;
    // Bez návrhu, ale začína menom niekoho z klientely („Sofia B",
    // „Lucka-onliena"): priezvisko appka nepozná, človek ho pozná. Dole to
    // ísť nesmie — tam sa hromadne umlčiava.
    return vyzeraNaMeno(n.nazov, mena);
  };
  const asiNieTrening = nezname.filter((n) => !jeTreningovy(n));
  // Rozdelenie pre podnadpis — nech je split vidno aj v pohľade „Obaja".
  const pocty = { Jerry: 0, Terezka: 0, ine: 0 };
  for (const n of nezmameVsetky.filter(jeTreningovy)) {
    if (n.trener === "Jerry") pocty.Jerry++;
    else if (n.trener === "Terezka") pocty.Terezka++;
    else pocty.ine++;
  }
  const [ukazZvysok, setUkazZvysok] = useState(false);
  const [hromadne, setHromadne] = useState(false);
  const odlozZvysok = async () => {
    setHromadne(true); setChybaUloz("");
    const j = await posli({
      akcia: "mapujVela",
      typ: "netrening",
      polozky: asiNieTrening.map((n) => ({ nazov: n.nazov, trener: n.trener })),
    }).catch(() => ({ ok: false, error: "spojenie" }));
    setHromadne(false);
    if (!j.ok) { setChybaUloz(j.error || "nepodarilo sa uložiť"); return; }
    await onHotovo();
  };

  const skupiny = useMemo(() => {
    const m = new Map<string, { meno: string; polozky: Nezname[]; spolu: number }>();
    for (const n of nezname.filter(jeTreningovy)) {
      const k = `${n.nazov}|${n.trener}`;
      const nav = navrhy[k];
      // POZOR: kľúč sa NESMIE počítať z toho, čo je práve napísané v poli.
      // Prvá verzia doň brala `vyber[k]` — po každom písmene sa skupiny
      // prepočítali, riadok dostal nový kľúč, React ho zahodil a vyrobil
      // znova, takže input stratil kurzor po každom znaku (Jerry, 22. 8.).
      // Zoskupenie drží NÁVRH appky, ktorý sa počas písania nemení.
      const odhad = ((nav?.typ === "uvodny" ? (nav.kandidati[0] || nav.meno) : nav?.kandidati[0]) || "").trim();
      const kluc = odhad ? normName(odhad) : "";
      const e = m.get(kluc) || { meno: odhad, polozky: [], spolu: 0 };
      e.polozky.push(n);
      e.spolu += n.pocet || 0;
      if (odhad && !e.meno) e.meno = odhad;
      m.set(kluc, e);
    }
    // Pri „Obaja" idú skupiny prihláseného trénera hore; inak najviac zápisov
    // hore — tam sa jedným sedením vybaví najviac.
    const mojaSkupina = (v: { polozky: Nezname[] }) =>
      trener === "all" && ktoSomTrener && v.polozky.some((p) => p.trener === ktoSomTrener) ? 0 : 1;
    return [...m.entries()]
      .map(([kluc, v]) => ({ kluc, ...v }))
      .sort((a, b) => (mojaSkupina(a) - mojaSkupina(b))
        || (b.polozky.length - a.polozky.length) || (b.spolu - a.spolu));
  }, [nezname, navrhy, trener, ktoSomTrener]);

  const uloz = async (n: Nezname) => {
    const k = `${n.nazov}|${n.trener}`;
    const v = stav(k);
    const sMenom = v.typ === "trening" || v.typ === "uvodny";
    if (!daSa(v)) return;
    setUklada(k); setChybaUloz("");
    const j = await posli({ akcia: "mapuj", nazov: n.nazov, trener: n.trener, typ: v.typ, klient: sMenom ? v.klient.trim() : null }).catch(() => ({ ok: false, error: "spojenie" }));
    setUklada("");
    if (!j.ok) { setChybaUloz(`${n.nazov}: ${j.error || "nepodarilo sa uložiť"}`); return; }
    await onHotovo();
  };

  return (
    <Card>
      <H3>
        <Info
          text="Kalendár nesie krstné mená a skratky — appka z nich sama nespozná klienta. Potvrdíš to raz a odvtedy to vie. Čo tréning nie je (plávanie, strihanie, poznámka), označ ako súkromné alebo iné a appka sa už nikdy nespýta."
          label={`Nové názvy v kalendári (${nezname.length - asiNieTrening.length})`}
        />
      </H3>
      {/* Rozpad podľa trénera — filter je hore na stránke; toto len ukazuje,
          koľko čaká na koho, aj v pohľade „Obaja". */}
      <div style={{ fontSize: 11.5, color: C.textMuted, margin: "6px 0 4px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>Jerry <b style={{ color: C.text }}>{pocty.Jerry}</b></span>
        <span>Terezka <b style={{ color: C.text }}>{pocty.Terezka}</b></span>
        {pocty.ine > 0 && <span>bez trénera <b style={{ color: C.text }}>{pocty.ine}</b></span>}
        {trener !== "all" && <span style={{ color: C.textDim }}>· filter: {trener}</span>}
      </div>
      <div style={{ fontSize: 11.5, color: C.textDim, margin: "0 0 12px", lineHeight: 1.5 }}>
        Zoskupené podľa človeka — jeden klient chodí v kalendári aj pod tromi názvami a takto sa vybavia naraz.
        {trener === "all" && ktoSomTrener ? ` Hore sú ${ktoSomTrener === "Jerry" ? "Jerryho" : "Terezkine"}.` : " Hore sú skupiny, kde je zápisov najviac."}
        {jednoznacne > 0 && <> Pri {jednoznacne} z nich appka pozná odpoveď jednoznačne — stačí potvrdiť.</>}
      </div>
      {chybaUloz && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{chybaUloz}</div>}
      {skupiny.map((sk) => (
        <div key={sk.kluc || "?"} style={{ marginBottom: 10 }}>
          {/* Hlavičku má len skupina, ktorá naozaj spája viac zápisov —
              pri jednom riadku by bola len šum navyše. */}
          {(sk.polozky.length > 1 || !sk.kluc) && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: sk.kluc ? C.accentLight : C.orange }}>
                {sk.kluc ? sk.meno : "zatiaľ bez mena"}
              </span>
              <span style={{ fontSize: 11, color: C.textDim }}>
                {sk.polozky.length} {sk.polozky.length === 1 ? "zápis" : sk.polozky.length < 5 ? "zápisy" : "zápisov"}
                {/* Skupina bez mena NIE JE jeden človek — sú to rôzne názvy,
                    v ktorých appka nikoho nespoznala. Veta „ten istý človek"
                    tam bola prvú verziu a bola to lož na prvý pohľad. */}
                {!sk.kluc
                  ? " — appka v nich nespoznala človeka; priraď meno alebo označ ako súkromné/iné"
                  : sk.polozky.length > 1 ? " — ten istý človek pod rôznymi názvami, dajú sa vybaviť naraz" : ""}
              </span>
            </div>
          )}
          {sk.polozky.map((n) => {
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
                <div style={{ flex: "1 1 190px", minWidth: 170 }}>
                  <VyberMena
                    hodnota={v.klient}
                    mena={mena}
                    onZmen={(x) => setVyber({ ...vyber, [k]: { ...v, klient: x } })}
                    varovanie={!!v.klient && !mena.includes(v.klient)}
                  />
                </div>
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
        </div>
      ))}
      {asiNieTrening.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => setUkazZvysok(!ukazZvysok)}
              style={{
                padding: "5px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
              }}
            >
              {ukazZvysok ? "Skryť" : "Ukázať"} {asiNieTrening.length} {asiNieTrening.length < 5 ? "názvy" : "názvov"}, v ktorých appka nespoznala človeka
            </button>
            <button
              onClick={() => void odlozZvysok()}
              disabled={hromadne}
              style={{
                padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                cursor: hromadne ? "wait" : "pointer",
                border: `1px solid ${mix(C.border, 80)}`, background: "transparent", color: C.textMuted,
              }}
            >
              {hromadne ? "…" : `Toto nie sú tréningy (${asiNieTrening.length})`}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
            Veterina, box, plávanie, poznámky. Označením sa uložia ako „iné" a appka sa na ne
            už nikdy nespýta — do hodín sa nerátali ani doteraz. Keď je medzi nimi tréning,
            najprv mu tu dole priraď meno; hromadné označenie mená nenastavuje.
          </div>
          {ukazZvysok && asiNieTrening.map((n) => {
            const k = `${n.nazov}|${n.trener}`;
            // Predvolené je „iné", nie tréning: v týchto názvoch appka nikoho
            // nespoznala, takže pravdepodobnejšia odpoveď je, že to tréning nie je.
            const v = vyber[k] ?? { klient: "", typ: "netrening" };
            return (
              <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "7px 0", borderBottom: `1px solid ${mix(C.border, 55)}` }}>
                <div style={{ minWidth: 150 }}>
                  <div style={{ fontSize: 13, color: C.text }}>{n.nazov}</div>
                  <div style={{ fontSize: 11, color: C.textDim }}>{n.trener} · {n.pocet}× · {den(n.najblizsi)}</div>
                </div>
                <Select value={v.typ} onChange={(t) => setVyber({ ...vyber, [k]: { ...v, typ: t } })} options={TYPY} />
                {(v.typ === "trening" || v.typ === "uvodny") && (
                  <div style={{ flex: "1 1 170px", minWidth: 150 }}>
                    <VyberMena
                      hodnota={v.klient}
                      mena={mena}
                      onZmen={(x) => setVyber({ ...vyber, [k]: { ...v, klient: x } })}
                    />
                  </div>
                )}
                <button
                  onClick={() => void uloz(n)}
                  disabled={uklada === k || !daSa(v)}
                  style={{
                    padding: "5px 11px", borderRadius: 8, fontSize: 12,
                    cursor: daSa(v) ? "pointer" : "not-allowed",
                    border: `1px solid ${C.border}`, background: "transparent",
                    color: daSa(v) ? C.textMuted : C.textDim,
                  }}
                >
                  {uklada === k ? "…" : "Potvrdiť"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/**
 * „Vydrží kalendár sám?" — meradlo súbežného chodu.
 *
 * Jerry chce PTminder vypnúť, ale nie naslepo: nechať obe evidencie bežať
 * vedľa seba a zrušiť tú starú, keď sa prestanú rozchádzať. Táto karta je to
 * jediné, čo z toho plánu appka musí vedieť — ostatné je čakanie.
 *
 * Dve čísla, ktoré NIE SÚ symetrické:
 *   • „chýba v kalendári" je RIZIKO — presne to by sa po vypnutí PTmindera
 *     stratilo. Toto číslo rozhoduje o tom, či sa dá vypnúť.
 *   • „chýba v PTminderi" je dnešná robota navyše, nič viac. Po vypnutí
 *     PTmindera prestane existovať aj otázka.
 */
export function SubeznyChod({ p }: { p: Porovnanie }) {
  const [detail, setDetail] = useState(false);
  const stabilne = p.tyzdne.filter((t) => t.sedeni > 0);
  // Za „sedí" sa počíta týždeň bez jediného strateného sedenia. Cieľ je
  // súvislá séria od najnovšieho týždňa — jeden dobrý týždeň spred mesiaca
  // nehovorí nič o tom, ako to funguje teraz.
  let seria = 0;
  for (const t of stabilne) { if (t.lenPtminder === 0) seria++; else break; }
  const pomer = p.sedeni ? (p.sedeni - p.lenPtminder) / p.sedeni : 0;
  const farba = p.lenPtminder === 0 ? C.green : pomer > 0.97 ? C.orange : C.red;

  return (
    <Card>
      <H3>
        <Info
          text="Kalendár a PTminder bežia vedľa seba. Kým sa rozchádzajú, PTminder je potrebný. Keď „chýba v kalendári“ zostane niekoľko týždňov na nule, dochádzku unesie kalendár sám a PTminder sa dá na tento účel vypnúť."
          label="Vydrží kalendár sám?"
        />
      </H3>
      <div style={{ fontSize: 11.5, color: C.textDim, margin: "2px 0 12px" }}>
        {p.od.split("-").reverse().join(".")} – {p.do.split("-").reverse().join(".")} · porovnáva sa len obdobie, kde majú obe evidencie čo povedať
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: farba, lineHeight: 1.1 }}>{p.lenPtminder}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>sedení chýba v kalendári<br /><span style={{ color: C.textDim }}>toto by sa stratilo</span></div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.textMuted, lineHeight: 1.1 }}>{p.lenKalendar}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>tréningov chýba v PTminderi<br /><span style={{ color: C.textDim }}>dnešná robota navyše</span></div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1.1 }}>{p.sedeni}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>sedení v PTminderi<br /><span style={{ color: C.textDim }}>menovateľ</span></div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: seria >= 4 ? C.green : C.text, lineHeight: 1.1 }}>{seria}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>{seria === 1 ? "týždeň" : seria > 1 && seria < 5 ? "týždne" : "týždňov"} bez straty<br /><span style={{ color: C.textDim }}>v rade, od najnovšieho</span></div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.55, marginBottom: 10 }}>
        {p.lenPtminder === 0
          ? "Kalendár zatiaľ nestratil ani jedno sedenie. Keď táto nula vydrží, dochádzku unesie sám."
          : `Kalendár by v tomto okne stratil ${p.lenPtminder} z ${p.sedeni} sedení. Každé z nich má dôvod — pozri zoznam a buď doplň meno v kalendári, alebo vieš, že tam tréning naozaj nebol.`}
      </div>
      {(p.bezKalendara || []).length > 0 && (
        <div style={{ fontSize: 12, color: C.orange, lineHeight: 1.55, marginBottom: 10 }}>
          Mimo porovnania: {(p.bezKalendara || []).map((b) => `${b.trener} (${b.sedeni})`).join(", ")} — tento tréner nemá pripojený kalendár,
          takže jeho sedenia sa po vypnutí PTmindera nemajú odkiaľ vziať.
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ color: C.textDim, fontSize: 11, textAlign: "left" }}>
            <th style={{ padding: "4px 6px 4px 0", fontWeight: 600 }}>týždeň</th>
            <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>sedení</th>
            <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>chýba v kalendári</th>
            <th style={{ padding: "4px 0 4px 6px", fontWeight: 600, textAlign: "right" }}>chýba v PTminderi</th>
          </tr>
        </thead>
        <tbody>
          {stabilne.map((t) => (
            <tr key={t.tyzden} style={{ borderTop: `1px solid ${mix(C.border, 55)}` }}>
              <td style={{ padding: "5px 6px 5px 0", color: C.text }}>{t.od.slice(8)}.{t.od.slice(5, 7)}. – {t.do.slice(8)}.{t.do.slice(5, 7)}.</td>
              <td style={{ padding: "5px 6px", textAlign: "right", color: C.textMuted }}>{t.sedeni}</td>
              <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700, color: t.lenPtminder ? C.red : C.green }}>{t.lenPtminder}</td>
              <td style={{ padding: "5px 0 5px 6px", textAlign: "right", color: t.lenKalendar ? C.orange : C.textDim }}>{t.lenKalendar}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(p.lenPtminder > 0 || p.lenKalendar > 0) && (
        <>
          <button
            onClick={() => setDetail(!detail)}
            style={{
              marginTop: 10, padding: "5px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer",
              border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
            }}
          >
            {detail ? "Skryť" : "Ukázať"}, čo presne nesedí
          </button>
          {detail && (
            <div style={{ marginTop: 8 }}>
              {stabilne.flatMap((t) => t.chybaju).sort((a, b) => b.den.localeCompare(a.den)).map((x, i) => (
                <div key={`${x.klient}|${x.den}|${x.kde}|${i}`} style={{ display: "flex", gap: 8, fontSize: 12, padding: "3px 0", color: C.textMuted }}>
                  <span style={{ color: C.textDim, minWidth: 62 }}>{x.den.slice(8)}.{x.den.slice(5, 7)}.</span>
                  <span style={{ color: C.text, flex: 1 }}>{x.klient}</span>
                  <span style={{ color: x.kde === "ptminder" ? C.red : C.orange }}>
                    {x.kde === "ptminder" ? "nie je v kalendári" : "nie je v PTminderi"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** Rozdiely medzi snímkami — materiál na otázky typu „prečo zmizla tá hodina". */
function Zmeny({ zmeny, vybavene, onHotovo, mena, cakaVoWorkspace }: { zmeny: Zmena[]; vybavene: Zmena[]; onHotovo: () => Promise<void>; mena: string[]; cakaVoWorkspace?: { zmien: number; nazvov: number; otvor: () => void } }) {
  const [historiaOtvorena, setHistoriaOtvorena] = useState(false);
  const [pisem, setPisem] = useState<Record<string, string>>({});
  const [obnovujem, setObnovujem] = useState(false);
  const [chybaObnovy, setChybaObnovy] = useState("");
  const [pridavam, setPridavam] = useState(false);
  const [chybaZmeny, setChybaZmeny] = useState("");
  const [chybaVysv, setChybaVysv] = useState("");
  const [uklada, setUklada] = useState(false);
  const [novy, setNovy] = useState({
    druh: "zrusene" as "zrusene" | "nahrada",
    klient: "",
    datum: dnesPraha(),
    trener: "",
    poznamka: "",
  });

  const popis = (z: Zmena) => {
    const kto = z.klient || z.nazov || "udalosť";
    // Ručne zapísané nesú uid s predponou `rucne-` — vetu treba inú, lebo
    // „zmizol z kalendára" by pri telefonickom zrušení klamalo.
    // `|| ""` zámerne: jeden chýbajúci stĺpec v dopyte zhasol 25. 9. 2026
    // celý Kokpit, nie iba túto kartu. Popis má v najhoršom stratiť slovo.
    const rucne = (z.uid || "").startsWith("rucne-");
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
        onClick={async () => {
          setObnovujem(true); setChybaObnovy("");
          try {
            // Sťahovanie vie zlyhať na strane Googlu (vypršaný odkaz na
            // kalendár) a vtedy tlačidlo len prestalo točiť — vyzeralo to,
            // že je hotovo, a zoznam zostal starý.
            const j = await posli({ akcia: "stiahni" }).catch(() => ({ ok: false, error: "spojenie" }));
            if (!j.ok) { setChybaObnovy(j.error || "Stiahnutie neprešlo."); return; }
            await onHotovo();
          } finally { setObnovujem(false); }
        }}
        disabled={obnovujem}
        title="Stiahnuť kalendár teraz a prepočítať rozdiely"
        style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, cursor: obnovujem ? "wait" : "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
      >
        {obnovujem ? "Sťahujem…" : "↻ Obnoviť"}
      </button>
      {chybaObnovy && <span style={{ fontSize: 11.5, color: C.red }}>{chybaObnovy}</span>}
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
      <div style={{ flex: "1 1 180px" }}>
        <VyberMena hodnota={novy.klient} mena={mena} onZmen={(x) => setNovy({ ...novy, klient: x })} placeholder="klient" />
      </div>
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
            const j = await posli({ akcia: "zmena-rucne", druh: novy.druh, klient: novy.klient.trim(), datum: novy.datum, trener: novy.trener, poznamka: novy.poznamka }).catch(() => ({ ok: false, error: "spojenie" }));
            // Vyčistený a zavretý formulár je pre človeka potvrdenie — smie
            // prísť až po potvrdenom zápise, inak veta zmizne bez stopy.
            if (!j.ok) { setChybaZmeny(j.error || "Zápis neprešiel — skús znova."); return; }
            setChybaZmeny("");
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

  /**
   * KROK SPÄŤ nad vybavenými zmenami.
   *
   * Jerry, 25. 9. 2026: zle prečítal riadok, napísal k nesprávnemu termínu,
   * že klienti idú na dovolenku — a zmena mu zmizla z karty, lebo tá ukazuje
   * len to, čo ešte čaká. Omyl sa tak nedal ani nájsť.
   *
   * Zabalené zámerne: vybavené veci nemajú zaberať miesto tým, ktoré ešte
   * čakajú. Otvorí sa, keď človek vie, že sa pomýlil.
   */
  const historia = vybavene.length > 0 && (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${mix(C.border, 55)}` }}>
      <button
        onClick={() => setHistoriaOtvorena((x) => !x)}
        style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}
      >
        {historiaOtvorena ? "▾" : "▸"} Nedávno vybavené ({vybavene.length}) — dá sa vrátiť späť
      </button>
      {historiaOtvorena && vybavene.map((z) => (
        <div key={z.id} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", padding: "6px 0", borderBottom: `1px solid ${mix(C.border, 35)}` }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: farba(z.druh), textTransform: "uppercase" }}>{z.druh}</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>{popis(z)}</span>
          {z.poznamka && <span style={{ fontSize: 11.5, color: C.textDim, fontStyle: "italic" }}>„{z.poznamka}"</span>}
          <button
            onClick={async () => {
              const j = await posli({ akcia: "vrat", id: z.id }).catch(() => ({ ok: false, error: "spojenie" }));
              if (!j.ok) { setChybaVysv(j.error || "Vrátiť sa nepodarilo."); return; }
              setChybaVysv("");
              await onHotovo();
            }}
            style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 7, fontSize: 11.5, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontFamily: "inherit" }}
          >
            Vrátiť späť
          </button>
        </div>
      ))}
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
        {(chybaZmeny || chybaVysv) && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{chybaZmeny || chybaVysv}</div>}
        {!pridavam && (cakaVoWorkspace && cakaVoWorkspace.zmien + cakaVoWorkspace.nazvov > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0" }}>
            <span style={{ fontSize: 13, color: C.text }}>
              {[cakaVoWorkspace.zmien ? `${cakaVoWorkspace.zmien} ${cakaVoWorkspace.zmien === 1 ? "zmena čaká" : cakaVoWorkspace.zmien < 5 ? "zmeny čakajú" : "zmien čaká"} na dôvod` : "",
                cakaVoWorkspace.nazvov ? `${cakaVoWorkspace.nazvov} ${cakaVoWorkspace.nazvov === 1 ? "nový názov" : cakaVoWorkspace.nazvov < 5 ? "nové názvy" : "nových názvov"}` : ""].filter(Boolean).join(" · ")}
            </span>
            <button onClick={cakaVoWorkspace.otvor} style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accentLight, fontFamily: "inherit" }}>
              Vybaviť vo Workspace →
            </button>
          </div>
        ) : <Empty>Od posledného stiahnutia sa nič nezmenilo.</Empty>)}
        {historia}
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
      {(chybaZmeny || chybaVysv) && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{chybaZmeny || chybaVysv}</div>}
      {zmeny.map((z) => (
        <div key={z.id} style={{ padding: "10px 0", borderBottom: `1px solid ${mix(C.border, 55)}` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: farba(z.druh), textTransform: "uppercase", letterSpacing: 0.3 }}>{z.druh}</span>
            <span style={{ fontSize: 13, color: C.text }}>{popis(z)}</span>
            <span style={{ fontSize: 11, color: C.textDim, marginLeft: "auto" }}>{z.trener} · zbadané {z.kedy.slice(5, 16).replace("T", " ")}</span>
          </div>
          {/* Dôvod napísaný pri ručnom zápise — nech nie je písaný do prázdna. */}
          {z.poznamka && (
            <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4, fontStyle: "italic" }}>„{z.poznamka}"</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
            <input
              value={pisem[z.id] ?? z.poznamka ?? ""}
              onChange={(e) => setPisem({ ...pisem, [z.id]: e.target.value })}
              placeholder="prečo? (klient zrušil, presunuli sme, chyba v zápise…)"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void (async () => { const j = await posli({ akcia: "vysvetli", id: z.id, poznamka: pisem[z.id] || "" }).catch(() => ({ ok: false, error: "spojenie" })); if (!j.ok) { setChybaVysv(j.error || "Vysvetlenie sa nezapísalo."); return; } setChybaVysv(""); await onHotovo(); })(); } }}
              style={{ flex: "1 1 260px", padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}
            />
            <button
              onClick={async () => { const j = await posli({ akcia: "vysvetli", id: z.id, poznamka: pisem[z.id] || "" }).catch(() => ({ ok: false, error: "spojenie" })); if (!j.ok) { setChybaVysv(j.error || "Vysvetlenie sa nezapísalo."); return; } setChybaVysv(""); await onHotovo(); }}
              style={{ padding: "6px 13px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
            >
              Vybavené
            </button>
          </div>
        </div>
      ))}
      {historia}
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
 * Od 29. 9. 2026 sa v nej aj PRACUJE, nielen pozerá (Jerry: „keď kliknem na
 * konkrétny čas, vyskočí všetko, čo potrebujem pre zapísanie tréningu…
 * označí sa daná hodina, môžem s ňou rovno manipulovať a okno je vedľa nej,
 * nie na začiernenom pozadí"):
 *
 *   • klik na voľný čas OZNAČÍ hodinu (zameriavač) a vedľa nej otvorí okno,
 *   • klik na udalosť ju označí — okno vie zmeniť druh, meno, čas aj ju zmazať,
 *   • označený blok sa dá ťahať myšou po mriežke (deň aj čas, krok 15 minút);
 *     zápis do Googlu ide až tlačidlom v okne, nie pri každom pohybe.
 *
 * Rozsah hodín sa počíta z dát, nie natvrdo.
 */
type VyberMriezky = {
  /** Vybraná existujúca udalosť; null = nahadzuje sa nová. */
  u: KalUdalost | null;
  den: string;
  cas: string;
  minut: number;
};

const trvanieMin = (u: KalUdalost) => {
  const m = (s: string) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
  return Math.max(15, m(u.koniec) - m(u.zaciatok));
};

function Tyzden({ udalosti, mena, clients, trener, onTrener, predvolenyTrener, onObnov }: {
  udalosti: KalUdalost[];
  mena: string[];
  clients: Record<string, ClientAgg>;
  trener: string;
  onTrener: (t: string) => void;
  /** Komu sa nová udalosť predvyplní — z filtra, inak z prihlásenia. */
  predvolenyTrener: string;
  onObnov: () => Promise<void>;
}) {
  const [posun, setPosun] = useState(0);
  const [vyber, setVyber] = useState<VyberMriezky | null>(null);

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

  /**
   * Na telefóne zostáva CELÝ TÝŽDEŇ — tak, ako ho ukazuje Google Calendar
   * (Jerry, 30. 9. 2026, so snímkou). Prvá verzia kreslila jeden deň a pás
   * dní nad ním; fungovalo to, ale týždeň sa pri tom nedal prehliadnuť
   * jedným pohľadom, a to je presne to, kvôli čomu sa kalendár otvára.
   *
   * Sedem stĺpcov sa do 375 px vojde, len sa musí ubrať všade inde: užší
   * pás hodín, menšie medzery, menšie písmo, meno sa LÁME do dvoch riadkov
   * namiesto „Lukas Han…" a čas pod menom sa nekreslí (v Googli tiež nie je
   * — hodinu povie poloha bloku). Riadok je za to vyšší, aby sa tie dva
   * riadky mali kam zmestiť.
   */
  const uzke = useUzke();

  /**
   * Koľko dní je naraz na obrazovke (Jerry, 30. 9. 2026: „sprav mi v tom
   * kalendári prepínač na týždeň, 3 dni a 1 deň"). Voľba sa pamätá — inak by
   * si ju na telefóne vyberal pri každom otvorení.
   */
  const [rozsah, setRozsah] = useState<7 | 3 | 1>(() => {
    try {
      const x = Number(localStorage.getItem("psb-kalendar-rozsah"));
      return x === 1 || x === 3 ? x : 7;
    } catch { return 7; }
  });
  const dnesVTyzdni = (new Date().getDay() + 6) % 7;
  const [zac, setZac] = useState(() => dnesVTyzdni);

  const vTyzdni = udalosti.filter((u) => dni.includes(u.zaciatok.slice(0, 10)));
  const minuty = (s: string) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
  const p2 = (n: number) => String(n).padStart(2, "0");

  const zaciatok = Math.max(0, Math.min(7 - rozsah, zac));
  const viditelne = rozsah === 7 ? dni : dni.slice(zaciatok, zaciatok + rozsah);
  const POCET = viditelne.length;
  /** Čísla nad mriežkou aj výška mriežky hovoria o TOM, ČO JE VIDNO — nie o týždni. */
  const vZobrazeni = vTyzdni.filter((u) => viditelne.includes(u.zaciatok.slice(0, 10)));
  /** Pás hodín a medzery — na telefóne užšie, aby na stĺpce zostalo viac. */
  const PAS = uzke ? 22 : 42;
  const GAP = uzke ? 1 : 3;

  // Rozsah podľa skutočných hodín, s hodinou rezervy na oboch koncoch.
  // Označená hodina rozsah rozširuje — ťahom ani vpísaným časom nesmie
  // vyjsť z mriežky do neviditeľna.
  const vyberMin = vyber && viditelne.includes(vyber.den) ? Number(vyber.cas.slice(0, 2)) * 60 + Number(vyber.cas.slice(3, 5)) : null;
  const od = Math.min(
    vZobrazeni.length ? Math.max(0, Math.floor(Math.min(...vZobrazeni.map((u) => minuty(u.zaciatok))) / 60) - 1) : 7,
    vyberMin == null ? 24 : Math.floor(vyberMin / 60),
  );
  const doH = Math.max(
    vZobrazeni.length ? Math.min(24, Math.ceil(Math.max(...vZobrazeni.map((u) => minuty(u.koniec))) / 60) + 1) : 20,
    vyberMin == null ? 0 : Math.min(24, Math.ceil((vyberMin + (vyber?.minut || 60)) / 60)),
  );
  const hodin = Math.max(1, doH - od);
  const VYSKA = uzke ? 58 : 46; // px na hodinu; na telefóne vyšší kvôli zalomeným menám

  const dnesIso = dnesPraha();
  const DNI_SK = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

  const trening = vZobrazeni.filter((u) => u.typ !== "sukromne" && u.typ !== "netrening");
  const hodinSpolu = trening.reduce((a, u) => a + (minuty(u.koniec) - minuty(u.zaciatok)) / 60, 0);

  // Farba nesie typ, nie meno — rovnako, ako si Jerry farbí Google Kalendár.
  const farba = (u: KalUdalost) =>
    u.typ === "uvodny" ? C.blue
      : u.typ === "guillermo" ? C.green
        : u.typ === "sukromne" || u.typ === "netrening" ? C.textDim
          : u.trener === "Terezka" ? C.blue : C.accent;

  const popisTyzdna = `${pondelok.getDate()}. ${pondelok.getMonth() + 1}. – ${new Date(pondelok.getTime() + 6 * 86400000).getDate()}. ${new Date(pondelok.getTime() + 6 * 86400000).getMonth() + 1}.`;

  /** Popis toho, čo je vidno — pri jednom dni je to deň, nie týždeň. */
  const denPopis = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
  const popisRozsahu = rozsah === 7
    ? (posun === 0 ? "tento týždeň" : popisTyzdna)
    : rozsah === 1
      ? `${DNI_SK[dni.indexOf(viditelne[0])]} ${denPopis(viditelne[0])}`
      : `${denPopis(viditelne[0])} – ${denPopis(viditelne[viditelne.length - 1])}`;

  /**
   * Šípky posúvajú o toľko, koľko je vidno. Pri troch dňoch by skok o celý
   * týždeň preskočil štyri dni, o ktorých by sa človek nedozvedel.
   * Cez okraj týždňa sa prechádza na susedný týždeň — hranica −3 až +2 je
   * tam, kam siaha stiahnutý kalendár, a platí ďalej.
   */
  const naZaciatok = posun <= -3 && zaciatok === 0;
  const naKonci = posun >= 2 && zaciatok >= 7 - rozsah;
  const krok = (smer: 1 | -1) => {
    setVyber(null);
    if (rozsah === 7) { setPosun(posun + smer); return; }
    const novy = zaciatok + smer * rozsah;
    if (novy < 0) {
      if (posun <= -3) return;
      setPosun(posun - 1);
      setZac(7 - rozsah);
    } else if (novy > 7 - rozsah) {
      if (posun >= 2) return;
      setPosun(posun + 1);
      setZac(0);
    } else setZac(novy);
  };

  const prepniRozsah = (r: 7 | 3 | 1) => {
    setRozsah(r);
    setVyber(null);
    // Nový rozsah sa otvára tam, kde je dnešok — ak je tento týždeň na
    // obrazovke. Inak od pondelka.
    setZac(Math.max(0, Math.min(7 - r, posun === 0 ? dnesVTyzdni : 0)));
    try { localStorage.setItem("psb-kalendar-rozsah", String(r)); } catch { /* súkromné okno */ }
  };

  /**
   * ŤAHANIE PO MRIEŽKE.
   *
   * Jeden mechanizmus pre nový aj existujúci blok: pointerdown si zapamätá,
   * kde v bloku sa človek chytil (offset), a pohyb prepočítava deň zo stĺpca
   * a čas z výšky, zaokrúhlene na 15 minút. Klik bez pohybu (< 6 px) je výber,
   * nie ťah — inak by sa okno nedalo otvoriť bez toho, aby sa udalosť pohla.
   * Zápis sa NEDEJE pri pustení myši: ťah len mení označenie a okno vedľa
   * neho; do Googlu sa píše až tlačidlom. Omyl v ťahu tak nič nepokazí.
   */
  const mriezkaRef = useRef<HTMLDivElement | null>(null);
  const tah = useRef<{ u: KalUdalost | null; posunuty: boolean; offsetMin: number; minut: number; startX: number; startY: number } | null>(null);
  /** Klik, ktorý príde hneď po ťahu, patrí ťahu — stĺpec ho nesmie čítať ako „nová udalosť". */
  const ignorujKlikDo = useRef(0);

  const casZBodu = (clientX: number, clientY: number, minut: number, offsetMin: number) => {
    const el = mriezkaRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const stlpec = (r.width - PAS - GAP * POCET) / POCET;
    const idx = Math.max(0, Math.min(POCET - 1, Math.floor((clientX - r.left - PAS - GAP) / (stlpec + GAP))));
    const surove = od * 60 + ((clientY - r.top) / VYSKA) * 60 - offsetMin;
    const m = Math.max(0, Math.min(24 * 60 - minut, Math.round(surove / 15) * 15));
    return { den: viditelne[idx], cas: `${p2(Math.floor(m / 60))}:${p2(m % 60)}` };
  };

  const zacniTah = (e: React.PointerEvent, u: KalUdalost | null, den: string, cas: string, minut: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = mriezkaRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const zac = Number(cas.slice(0, 2)) * 60 + Number(cas.slice(3, 5));
    const bod = od * 60 + ((e.clientY - r.top) / VYSKA) * 60;
    tah.current = { u, posunuty: false, offsetMin: bod - zac, minut, startX: e.clientX, startY: e.clientY };

    const pohyb = (ev: PointerEvent) => {
      const t = tah.current;
      if (!t) return;
      if (!t.posunuty && Math.hypot(ev.clientX - t.startX, ev.clientY - t.startY) < 6) return;
      t.posunuty = true;
      const nove = casZBodu(ev.clientX, ev.clientY, t.minut, t.offsetMin);
      if (nove) setVyber({ u: t.u, den: nove.den, cas: nove.cas, minut: t.minut });
    };
    const koniec = () => {
      window.removeEventListener("pointermove", pohyb);
      window.removeEventListener("pointerup", koniec);
      const t = tah.current;
      tah.current = null;
      if (!t) return;
      if (t.posunuty) { ignorujKlikDo.current = Date.now() + 250; return; }
      // Klik bez ťahu na udalosť = označiť ju a otvoriť okno.
      if (t.u) setVyber({ u: t.u, den: t.u.zaciatok.slice(0, 10), cas: t.u.zaciatok.slice(11, 16), minut: trvanieMin(t.u) });
    };
    window.addEventListener("pointermove", pohyb);
    window.addEventListener("pointerup", koniec);
  };

  const vybranaUdalost = (u: KalUdalost) => !!vyber?.u && vyber.u.uid === u.uid && vyber.u.trener === u.trener;

  // Poloha okna: vedľa stĺpca označenej hodiny — vpravo od neho, pri konci
  // týždňa vľavo, aby nevyšlo z obrazovky. Žiadne stmavené pozadie.
  const vyberIdx = vyber ? dni.indexOf(vyber.den) : -1;
  const vyberTop = vyber && vyberMin != null ? ((vyberMin - od * 60) / 60) * VYSKA : 0;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <H3>
          <Info
            text="Týždeň tak, ako ho vidíš v Google Kalendári. Klik na voľný čas nahodí tréning, klik na udalosť ju otvorí — meno, druh, čas aj zmazanie. Označený blok sa dá ťahať myšou; zapíše sa až tlačidlom v okne. Súkromné udalosti sú sivé a do počtu hodín sa nerátajú."
            label="Týždeň"
          />
        </H3>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <TrenerPills value={trener} onChange={onTrener} />
          <div style={{ display: "flex", gap: 3 }}>
            {([[7, "Týždeň"], [3, "3 dni"], [1, "Deň"]] as [7 | 3 | 1, string][]).map(([r, l]) => (
              <button key={r} onClick={() => prepniRozsah(r)} style={{
                padding: "4px 9px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${rozsah === r ? C.accent : C.border}`,
                background: rozsah === r ? mix(C.accent, 14) : "transparent",
                color: rozsah === r ? C.accentLight : C.textMuted,
                fontWeight: rozsah === r ? 700 : 500,
              }}>{l}</button>
            ))}
          </div>
          {/* Tri týždne dozadu, dva dopredu — presne tam, kam siaha stiahnutý
              kalendár. Ďalej by týždeň zíval prázdnotou, ktorá vyzerá ako
              zrušené tréningy. */}
          <button onClick={() => krok(-1)} disabled={naZaciatok}
            style={{ padding: "4px 10px", borderRadius: 7, fontSize: 13, cursor: naZaciatok ? "not-allowed" : "pointer", border: `1px solid ${C.border}`, background: "transparent", color: naZaciatok ? C.textDim : C.textMuted }}>←</button>
          <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600, minWidth: 116, textAlign: "center" }}>
            {popisRozsahu}
          </span>
          <button onClick={() => krok(1)} disabled={naKonci}
            style={{ padding: "4px 10px", borderRadius: 7, fontSize: 13, cursor: naKonci ? "not-allowed" : "pointer", border: `1px solid ${C.border}`, background: "transparent", color: naKonci ? C.textDim : C.textMuted }}>→</button>
          {(posun !== 0 || (rozsah !== 7 && zaciatok !== Math.max(0, Math.min(7 - rozsah, dnesVTyzdni)))) && (
            <button onClick={() => { setPosun(0); setZac(Math.max(0, Math.min(7 - rozsah, dnesVTyzdni))); }}
              style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12, cursor: "pointer" }}>dnes</button>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
        {trening.length} tréningov · {Math.round(hodinSpolu)} h · predbežné
      </div>

      {!vZobrazeni.length && (
        <Empty>
          {trener === "all"
            ? "V tomto týždni zatiaľ nie je nič — klikni na voľný čas a nahoď prvý tréning."
            : `${trener} tu zatiaľ nemá nič — klikni na voľný čas a nahoď tréning.`}
        </Empty>
      )}

      {/* Mriežka sa kreslí aj pre prázdny týždeň — inak by sa do budúceho
          týždňa nedal nahodiť prvý tréning: nebolo by na čo kliknúť. */}
      {/* Pás dní pri jednom dni — prepínanie v rámci týždňa bez šípok
          (Jerry, 30. 9. 2026: „pri 1 dni mi daj možnosť prepínať medzi dňami
          tak, ako to bolo v pôvodnom návrhu"). Šípky zostávajú: nimi sa dá
          prejsť aj do susedného týždňa, pás ukazuje len ten, v ktorom stojíš,
          a k tomu povie, koľko je kde tréningov. */}
      {rozsah === 1 && (
        <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 8, marginBottom: 2, scrollbarWidth: "none" }}>
          {dni.map((d, i) => {
            const pocet = vTyzdni.filter((u) => u.zaciatok.slice(0, 10) === d && u.typ !== "sukromne" && u.typ !== "netrening").length;
            const tu = i === zaciatok;
            return (
              <button key={d} onClick={() => { setZac(i); setVyber(null); }} style={{
                flexShrink: 0, padding: "5px 9px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${tu ? C.accent : d === dnesIso ? mix(C.accent, 45) : C.border}`,
                background: tu ? mix(C.accent, 16) : "transparent",
                color: tu ? C.text : d === dnesIso ? C.accentLight : C.textMuted,
                fontSize: 12, fontWeight: tu ? 700 : 600, whiteSpace: "nowrap",
              }}>
                {DNI_SK[i]} {Number(d.slice(8, 10))}.
                <span style={{ marginLeft: 5, fontSize: 10.5, color: tu ? C.accentLight : C.textDim, fontVariantNumeric: "tabular-nums" }}>
                  {pocet || "–"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <ScrollX>
        <div style={{ minWidth: uzke ? 0 : 620, marginLeft: uzke ? -12 : 0, marginRight: uzke ? -12 : 0 }}>
          {/* Hlavička dní */}
          <div style={{ display: "grid", gridTemplateColumns: `${PAS}px repeat(${POCET}, 1fr)`, gap: GAP, marginBottom: 3 }}>
            <div />
            {viditelne.map((d) => {
              const i = dni.indexOf(d);
              const jeDnes = d === dnesIso;
              return (
                <div key={d} style={{
                  textAlign: "center", fontSize: uzke ? 10 : 11.5, padding: "3px 0", borderRadius: 6,
                  fontWeight: jeDnes ? 700 : 600,
                  color: jeDnes ? C.accentLight : C.textMuted,
                  background: jeDnes ? mix(C.accent, 12) : "transparent",
                  lineHeight: uzke ? 1.15 : undefined,
                }}>
                  {uzke ? <>{DNI_SK[i].slice(0, 1)}<br /><b style={{ fontSize: 12 }}>{Number(d.slice(8, 10))}</b></> : `${DNI_SK[i]} ${Number(d.slice(8, 10))}.`}
                </div>
              );
            })}
          </div>

          {/* Mriežka — position: relative kvôli oknu, ktoré sa lepí k stĺpcu. */}
          <div ref={mriezkaRef} style={{ display: "grid", gridTemplateColumns: `${PAS}px repeat(${POCET}, 1fr)`, gap: GAP, position: "relative" }}>
            <div style={{ position: "relative", height: hodin * VYSKA }}>
              {Array.from({ length: hodin }, (_, i) => (
                <div key={i} style={{ position: "absolute", top: i * VYSKA - 6, right: uzke ? 2 : 4, fontSize: uzke ? 9.5 : 10.5, color: C.textDim }}>
                  {uzke ? `${od + i}` : `${String(od + i).padStart(2, "0")}:00`}
                </div>
              ))}
            </div>
            {viditelne.map((d) => (
              <div
                key={d}
                title="Klikni na voľný čas — nahodíš tréning do kalendára"
                onClick={(e) => {
                  if (Date.now() < ignorujKlikDo.current) return;
                  // Klik na PRÁZDNE miesto stĺpca = zameriavač o tom čase.
                  const r = e.currentTarget.getBoundingClientRect();
                  const min = od * 60 + ((e.clientY - r.top) / VYSKA) * 60;
                  const z = Math.max(0, Math.min(23 * 60 + 30, Math.floor(min / 30) * 30));
                  setVyber({ u: null, den: d, cas: `${p2(Math.floor(z / 60))}:${p2(z % 60)}`, minut: 60 });
                }}
                style={{
                  position: "relative", height: hodin * VYSKA, borderRadius: 7,
                  background: d === dnesIso ? mix(C.accent, 5) : mix(C.border, 14),
                  overflow: "hidden", cursor: "copy",
                }}
              >
                {Array.from({ length: hodin }, (_, i) => (
                  <div key={i} style={{ position: "absolute", top: i * VYSKA, left: 0, right: 0, borderTop: `1px solid ${mix(C.border, 40)}` }} />
                ))}
                {((vDni) => {
                  // Prekrývajúce sa hodiny vedľa seba, nie na sebe.
                  const miesta = rozlozUdalosti(vDni.map((u) => ({ od: minuty(u.zaciatok), do: minuty(u.koniec) })));
                  return vDni.map((u, poz) => {
                  const top = ((minuty(u.zaciatok) - od * 60) / 60) * VYSKA;
                  const vyska = Math.max(18, ((minuty(u.koniec) - minuty(u.zaciatok)) / 60) * VYSKA - 2);
                  const f = farba(u);
                  const { stlpec, zo } = miesta[poz];
                  /** Iniciály sa lámať NESMÚ — „JK" na dva riadky sú zase schody. */
                  const iniciala = uzke && zo > 1;
                  return (
                    <button
                      key={`${u.uid}|${u.trener}`}
                      onPointerDown={(e) => zacniTah(e, u, u.zaciatok.slice(0, 10), u.zaciatok.slice(11, 16), trvanieMin(u))}
                      onClick={(e) => e.stopPropagation()}
                      title={`${cas(u.zaciatok)}–${cas(u.koniec)} · ${u.nazov}${u.klient ? ` → ${u.klient}` : ""} · ${u.trener} — klikni: upraviť či zmazať, ťahaj: presunúť`}
                      style={{
                        position: "absolute", top, height: vyska,
                        left: `calc(${(stlpec / zo) * 100}% + 2px)`,
                        width: `calc(${100 / zo}% - 4px)`,
                        borderRadius: 5, padding: iniciala ? "2px 0" : uzke ? "2px 2px" : "2px 4px", overflow: "hidden",
                        background: mix(f, 16), borderLeft: `${uzke ? 2 : 3}px solid ${f}`,
                        border: "none", borderLeftStyle: "solid", textAlign: "left", cursor: "grab",
                        fontSize: uzke ? 9.5 : 10.5, lineHeight: uzke ? 1.1 : 1.25, color: C.text, fontFamily: "inherit",
                        touchAction: "none",
                      }}
                    >
                      <div style={{
                        fontWeight: 600,
                        whiteSpace: uzke && !iniciala ? "normal" : "nowrap",
                        overflow: "hidden",
                        textOverflow: uzke && !iniciala ? undefined : "ellipsis",
                        overflowWrap: uzke && !iniciala ? "anywhere" : undefined,
                        textAlign: iniciala ? "center" : undefined,
                      }}>
                        {menoDoBloku(u.klient || u.nazov, uzke, zo)}{!u.klient && u.typ !== "sukromne" && u.typ !== "netrening" && <span style={{ color: C.orange }}> ?</span>}
                      </div>
                      {!uzke && vyska > 30 && <div style={{ color: C.textDim, fontSize: 10 }}>{cas(u.zaciatok)}</div>}
                    </button>
                  );
                  });
                })(vTyzdni.filter((u) => u.zaciatok.slice(0, 10) === d && !vybranaUdalost(u)))}

                {/* ZAMERIAVAČ — označená hodina. Ťahá sa za ňu; okno stojí vedľa. */}
                {vyber && vyber.den === d && vyberMin != null && (
                  <div
                    onPointerDown={(e) => zacniTah(e, vyber.u, vyber.den, vyber.cas, vyber.minut)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute",
                      top: ((vyberMin - od * 60) / 60) * VYSKA,
                      left: 1, right: 1,
                      height: Math.max(18, (vyber.minut / 60) * VYSKA - 2),
                      borderRadius: 5, padding: "2px 4px", overflow: "hidden",
                      background: mix(C.green, 22),
                      border: `1.5px dashed ${C.green}`,
                      cursor: "grab", zIndex: 3,
                      fontSize: 10.5, lineHeight: 1.25, color: C.text,
                      touchAction: "none",
                    }}
                  >
                    <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {vyber.u ? (vyber.u.klient || vyber.u.nazov) : "nový tréning"}
                    </div>
                    <div style={{ color: C.textMuted, fontSize: 10 }}>{vyber.cas}</div>
                  </div>
                )}
              </div>
            ))}

            {/* OKNO vedľa označenej hodiny — nie modal, nič sa nestmavuje. */}
            {vyber && (
              <OknoUdalosti
                key={vyber.u ? `${vyber.u.uid}|${vyber.u.trener}` : "novy"}
                vyber={vyber}
                mena={mena}
                clients={clients}
                predvolenyTrener={predvolenyTrener}
                onZmen={setVyber}
                onZavri={() => setVyber(null)}
                onHotovo={async () => { setVyber(null); await onObnov(); }}
                style={uzke
                  ? {
                    // Na telefóne sa okno lepí na SPODOK obrazovky. Plávajúce
                    // vedľa stĺpca vychádzalo z obrazovky a dalo sa naň dostať
                    // len bočným rolovaním mriežky.
                    position: "fixed", zIndex: 40, left: 8, right: 8, bottom: 8,
                    width: "auto", maxHeight: "62vh", overflowY: "auto",
                    boxShadow: "0 -8px 28px rgba(0,0,0,.45)",
                  }
                  : {
                    position: "absolute", zIndex: 6, width: 280,
                    top: Math.max(0, Math.min(vyberIdx >= 0 ? vyberTop : 0, hodin * VYSKA - 300)),
                    left: vyberIdx < 0
                      ? "calc(42px + 6px)"
                      : vyberIdx <= 3
                        ? `calc(42px + ${vyberIdx + 1} * ((100% - 42px) / 7) + 5px)`
                        : `calc(42px + ${vyberIdx} * ((100% - 42px) / 7) - 289px)`,
                  }}
              />
            )}
          </div>
        </div>
      </ScrollX>

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
 * Okno vedľa označenej hodiny — jedno pre nový tréning aj úpravu existujúcej
 * udalosti. Nie je to modal: mriežka zostáva viditeľná a blok sa dá popri
 * otvorenom okne ďalej ťahať (deň a čas v okne sa menia s ním).
 *
 * Pri existujúcej udalosti vie tri veci naraz:
 *   • DRUH a MENO — cez `mapuj`, teda pravidlo pre všetky udalosti s tým
 *     istým názvom u trénera (ako doteraz v „Upraviť udalosť"),
 *   • ČAS — cez `trening-presun`, zapíše sa do Googlu aj do kal_udalosti,
 *   • ZMAZANIE — cez `trening-zrus`, s potvrdením; maže z reálneho kalendára.
 *
 * Presun a zmazanie fungujú len na udalosti z Googlu (uid @google.com)
 * v kalendári trénera, ktorý je zdieľaný servisnému účtu — chyba z Googlu
 * sa ukazuje doslovne aj s radou, čo zdieľať.
 */
function OknoUdalosti({ vyber, mena, clients, predvolenyTrener, onZmen, onZavri, onHotovo, style }: {
  vyber: VyberMriezky;
  mena: string[];
  clients: Record<string, ClientAgg>;
  predvolenyTrener: string;
  onZmen: (v: VyberMriezky) => void;
  onZavri: () => void;
  onHotovo: () => Promise<void>;
  style: React.CSSProperties;
}) {
  const u = vyber.u;
  const navrh = useMemo(() => (u ? navrhni(u.nazov, clients) : null), [u, clients]);
  const [klient, setKlient] = useState(u ? (u.klient || "") : "");
  const [typ, setTyp] = useState(u ? (u.typ || navrh?.typ || "trening") : "trening");
  const [trenerNovej, setTrenerNovej] = useState(predvolenyTrener);
  const [uklada, setUklada] = useState(false);
  const [mazem, setMazem] = useState(false);
  const [potvrdMazanie, setPotvrdMazanie] = useState(false);
  const [chyba, setChyba] = useState("");
  /**
   * DUPLIKOVAŤ a INÝ TRÉNER (Jerry, 5. 10. 2026). Kópia ide predvolene
   * o týždeň neskôr v ten istý čas — najčastejší dôvod je „aj budúci
   * týždeň". Druhý tréner dostane ten istý termín; pôvodný sa zmaže až
   * po tom, čo nový v Googli naozaj stojí (server).
   */
  const [rezim, setRezim] = useState<"" | "kopia" | "trener">("");
  const [kopiaDen, setKopiaDen] = useState(() => {
    if (!u) return "";
    const [r, m, d] = u.zaciatok.slice(0, 10).split("-").map(Number);
    const t = new Date(Date.UTC(r, m - 1, d + 7));
    return t.toISOString().slice(0, 10);
  });
  const [kopiaCas, setKopiaCas] = useState(u ? u.zaciatok.slice(11, 16) : "");
  const druhiTreneri = Object.keys(KALENDAR_TRENERA).filter((t) => t !== (u?.trener || ""));
  const [novyTrener, setNovyTrener] = useState(druhiTreneri[0] || "");
  const [bezi, setBezi] = useState(false);
  const [hlaska, setHlaska] = useState("");

  const sMenom = typ === "trening" || typ === "uvodny";
  const trener = u ? u.trener : trenerNovej;
  const zGoogle = !u || u.uid.split("|")[0].endsWith("@google.com");
  const casZmeneny = !!u && (
    vyber.den !== u.zaciatok.slice(0, 10) || vyber.cas !== u.zaciatok.slice(11, 16) || vyber.minut !== trvanieMin(u)
  );
  const mapaZmenena = !!u && (typ !== (u.typ || "") || (sMenom ? klient.trim() : "") !== (u.klient || ""));
  const daSa = !uklada && (u ? (casZmeneny || mapaZmenena) : (sMenom && klient.trim().length >= 3));

  const pole = { padding: "6px 9px", borderRadius: 7, fontSize: 12.5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, colorScheme: "dark" } as const;
  const popisok = { display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim } as const;

  const uloz = async () => {
    if (!daSa) return;
    setUklada(true); setChyba("");
    try {
      if (!u) {
        const j = await posli({ akcia: "trening-nahod", klient: klient.trim(), den: vyber.den, cas: vyber.cas, minut: vyber.minut, trener, typ })
          .catch(() => ({ ok: false as const, error: "spojenie zlyhalo — tréning sa nezapísal" }));
        if (!j.ok) { setChyba(j.error || "Nepodarilo sa zapísať do kalendára."); return; }
      } else {
        // Poradie: najprv čas (Google), potom pravidlo mena — keď padne prvé,
        // druhé sa ani neskúsi a okno povie prečo. Nič sa nezapíše napoly potichu.
        if (casZmeneny) {
          if (!zGoogle) { setChyba("Táto udalosť nie je z Google kalendára — presunúť sa nedá."); return; }
          const j = await posli({ akcia: "trening-presun", uid: u.uid, trener: u.trener, den: vyber.den, cas: vyber.cas, minut: vyber.minut })
            .catch(() => ({ ok: false as const, error: "spojenie zlyhalo — presun sa nezapísal" }));
          if (!j.ok) { setChyba(j.error || "Presun sa nepodaril."); return; }
        }
        if (mapaZmenena) {
          const j = await posli({ akcia: "mapuj", nazov: u.nazov, trener: u.trener, typ, klient: sMenom ? klient.trim() : null })
            .catch(() => ({ ok: false as const, error: "spojenie" }));
          if (!j.ok) { setChyba(j.error || "Nepodarilo sa uložiť meno a druh."); return; }
        }
      }
      await onHotovo();
    } finally {
      setUklada(false);
    }
  };

  const klientUdalosti = (klient.trim() || u?.klient || "").trim();
  const duplikuj = async () => {
    if (!u || !klientUdalosti) return;
    setBezi(true); setChyba(""); setHlaska("");
    const j = await posli({ akcia: "trening-nahod", klient: klientUdalosti, den: kopiaDen, cas: kopiaCas, minut: trvanieMin(u), trener: u.trener, typ: u.typ === "uvodny" ? "uvodny" : "trening" })
      .catch(() => ({ ok: false as const, error: "spojenie zlyhalo — kópia sa nezapísala" }));
    setBezi(false);
    if (!j.ok) { setChyba(j.error || "Kópia sa nezapísala."); return; }
    setHlaska(`Skopírované na ${den(`${kopiaDen}T${kopiaCas}`)} o ${kopiaCas}.`);
    setRezim("");
    await onHotovo();
  };
  const inemuTrenerovi = async () => {
    if (!u || !novyTrener) return;
    setBezi(true); setChyba(""); setHlaska("");
    const j = await posli({ akcia: "trening-iny-trener", uid: u.uid, trener: u.trener, novy: novyTrener, klient: klientUdalosti })
      .catch(() => ({ ok: false as const, error: "spojenie zlyhalo — nič sa nezmenilo" }));
    setBezi(false);
    if (!j.ok) { setChyba(j.error || "Presun na iného trénera sa nepodaril."); if ((j as { castocne?: boolean }).castocne) await onHotovo(); return; }
    await onHotovo();
  };

  const vymaz = async () => {
    if (!u) return;
    setMazem(true); setChyba("");
    const j = await posli({ akcia: "trening-zrus", uid: u.uid, trener: u.trener })
      .catch(() => ({ ok: false as const, error: "spojenie zlyhalo — nezmazalo sa" }));
    setMazem(false);
    if (!j.ok) { setChyba(j.error || "Zmazanie sa nepodarilo."); return; }
    await onHotovo();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        ...style,
        /**
         * NEPRIEHĽADNÉ. Pod sklenenými paletami je `C.bg` priesvitná a okno
         * na telefóne stálo nad mriežkou, takže sa cezeň čítali mená
         * tréningov a políčka sa nedali prečítať vôbec (Jerry, 30. 9. 2026:
         * „je to priesvitné, na tom telefóne je to okno nečitateľné").
         * `C.surface` je práve tá plocha, ktorá sa nesmie presvitať — sklo
         * funguje nad plochou, nie nad textom.
         */
        background: C.surface, backdropFilter: "none", WebkitBackdropFilter: "none",
        border: `1px solid ${C.border}`, borderRadius: 11,
        padding: "12px 13px", boxShadow: "0 10px 32px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          {u ? "Udalosť" : "Nahodiť tréning"}
        </div>
        <button onClick={onZavri} aria-label="Zavrieť" style={{ background: "none", border: "none", color: C.textDim, fontSize: 15, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5, marginBottom: 10 }}>
        {u
          ? <>V kalendári stojí <b style={{ color: C.text }}>„{u.nazov}"</b> · {u.trener}</>
          : <>{den(`${vyber.den}T${vyber.cas}`)} o <b style={{ color: C.text }}>{vyber.cas}</b> — blok sa dá ťahať myšou.</>}
      </div>

      <label style={{ ...popisok, marginBottom: 8 }}>
        druh
        <select value={typ} onChange={(e) => setTyp(e.target.value)} style={pole}>
          {(u ? TYPY : TYPY.filter((t) => t.value === "trening" || t.value === "uvodny")).map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      {/* NÁZOV HOVORÍ „ÚVODNÝ", DRUH HOVORÍ NIEČO INÉ.
          Josef Pávek mal 2. 10. 2026 v kalendári „Josef Pávek-úvodný"
          a v appke druh „tréning" — uložený odtiaľto 28. 9. Odpoveď človeka
          vyhráva nad názvom navždy a potichu, takže Jerry 1. 10. hľadal,
          prečo ten človek nie je v anamnézach: úvodný, ktorý nie je úvodný,
          nezaloží profil, nevypýta anamnézu ani SMS po úvodnom.
          Voľbu to nemení — len to povie nahlas skôr, než sa uloží. */}
      {navrh?.typ === "uvodny" && typ !== "uvodny" && (
        <div style={{ fontSize: 11, color: C.orange, lineHeight: 1.5, marginBottom: 8 }}>
          V názve stojí „úvodný", ale druh je iný. Takto sa klientovi nezaloží profil ani anamnéza.
        </div>
      )}

      {sMenom && (
        <label style={{ ...popisok, marginBottom: 8 }}>
          klient
          <VyberMena
            hodnota={klient}
            mena={mena}
            onZmen={setKlient}
            autoFocus={!u}
            varovanie={!!klient && !mena.includes(klient)}
            style={{ ...pole, width: "100%" }}
          />
        </label>
      )}
      {sMenom && !!navrh && navrh.kandidati.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
          {navrh.kandidati.filter((k) => k !== klient).slice(0, 3).map((k) => (
            <button key={k} onClick={() => setKlient(k)}
              style={{ padding: "3px 9px", borderRadius: 6, fontSize: 11, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}>
              {k}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <label style={popisok}>
          deň
          <input type="date" value={vyber.den} onChange={(e) => onZmen({ ...vyber, den: e.target.value })} style={{ ...pole, width: 128 }} />
        </label>
        <label style={popisok}>
          čas
          <input type="time" value={vyber.cas} onChange={(e) => onZmen({ ...vyber, cas: e.target.value })} style={{ ...pole, width: 84 }} />
        </label>
        <label style={popisok}>
          minút
          {/* Hranice sú tie isté, aké si obsluha aj tak vynúti — bez nich šípka
              dole z poľa urobí nezmysel a kód ho ticho prepíše na 15. */}
          <input type="number" min={15} max={240} step={15} value={vyber.minut} onChange={(e) => onZmen({ ...vyber, minut: Math.max(15, Math.min(240, Number(e.target.value) || 60)) })} style={{ ...pole, width: 58 }} />
        </label>
      </div>

      {!u && (
        <label style={{ ...popisok, marginBottom: 8 }}>
          tréner
          <select value={trenerNovej} onChange={(e) => setTrenerNovej(e.target.value)} style={pole}>
            {Object.keys(KALENDAR_TRENERA).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      )}

      {u && mapaZmenena && (
        <div style={{ fontSize: 10.5, color: C.textDim, lineHeight: 1.5, marginBottom: 8 }}>
          Meno a druh platia na <b>všetky udalosti „{u.nazov}"</b> u tohto trénera. Čas sa mení len tejto jednej.
        </div>
      )}
      {chyba && <div style={{ fontSize: 11.5, color: C.red, lineHeight: 1.5, marginBottom: 8 }}>{chyba}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => void uloz()}
          disabled={!daSa}
          style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
            cursor: daSa ? "pointer" : "not-allowed",
            border: `1px solid ${mix(C.green, 50)}`,
            background: daSa ? mix(C.green, 12) : "transparent",
            color: daSa ? C.green : C.textDim,
          }}
        >
          {uklada ? "Zapisujem…" : u ? "Uložiť" : "Nahodiť do kalendára"}
        </button>
        {u && zGoogle && sMenom && !!klientUdalosti && (
          <>
            <button onClick={() => setRezim(rezim === "kopia" ? "" : "kopia")}
              style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${rezim === "kopia" ? C.accent : C.border}`, background: rezim === "kopia" ? C.accentBg : "transparent", color: rezim === "kopia" ? C.accentLight : C.textMuted }}>
              Duplikovať
            </button>
            {druhiTreneri.length > 0 && (
              <button onClick={() => setRezim(rezim === "trener" ? "" : "trener")}
                style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${rezim === "trener" ? C.accent : C.border}`, background: rezim === "trener" ? C.accentBg : "transparent", color: rezim === "trener" ? C.accentLight : C.textMuted }}>
                Iný tréner
              </button>
            )}
          </>
        )}
        {u && zGoogle && !potvrdMazanie && (
          <button onClick={() => setPotvrdMazanie(true)}
            style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${mix(C.red, 45)}`, background: "transparent", color: C.red }}>
            Vymazať
          </button>
        )}
        <button onClick={onZavri} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>
          Zrušiť
        </button>
      </div>

      {hlaska && <div style={{ fontSize: 11.5, color: C.green, lineHeight: 1.5, marginTop: 8 }}>{hlaska}</div>}
      {u && rezim === "kopia" && (
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 7) }}>
          <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5, marginBottom: 6 }}>
            Kópia pre <b style={{ color: C.text }}>{klientUdalosti}</b> · {u.trener} · {trvanieMin(u)} min
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={popisok}>
              deň
              <input type="date" value={kopiaDen} onChange={(e) => setKopiaDen(e.target.value)} style={{ ...pole, width: 128 }} />
            </label>
            <label style={popisok}>
              čas
              <input type="time" value={kopiaCas} onChange={(e) => setKopiaCas(e.target.value)} style={{ ...pole, width: 84 }} />
            </label>
            <button onClick={() => void duplikuj()} disabled={bezi || !kopiaDen || !kopiaCas}
              style={{ padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: bezi ? "wait" : "pointer", border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 12), color: C.green }}>
              {bezi ? "Zapisujem…" : "Vytvoriť kópiu"}
            </button>
          </div>
        </div>
      )}
      {u && rezim === "trener" && (
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 7) }}>
          <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5, marginBottom: 6 }}>
            Tréning <b style={{ color: C.text }}>{klientUdalosti}</b> {den(u.zaciatok)} o {u.zaciatok.slice(11, 16)} prejde z kalendára {u.trener} do kalendára:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {druhiTreneri.length > 1 && (
              <select value={novyTrener} onChange={(e) => setNovyTrener(e.target.value)} style={pole}>
                {druhiTreneri.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <button onClick={() => void inemuTrenerovi()} disabled={bezi || !novyTrener}
              style={{ padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: bezi ? "wait" : "pointer", border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 12), color: C.green }}>
              {bezi ? "Presúvam…" : `Presunúť ${({ Jerry: "Jerrymu", Terezka: "Terezke" } as Record<string, string>)[novyTrener] || novyTrener}`}
            </button>
          </div>
        </div>
      )}
      {u && potvrdMazanie && (
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${mix(C.red, 45)}`, background: mix(C.red, 8) }}>
          <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.5 }}>
            Zmaže udalosť aj z <b style={{ color: C.text }}>Google kalendára ({u.trener})</b>. Nedá sa vrátiť.
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button onClick={() => void vymaz()} disabled={mazem}
              style={{ padding: "5px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: mazem ? "wait" : "pointer", border: `1px solid ${mix(C.red, 55)}`, background: mix(C.red, 16), color: C.red }}>
              {mazem ? "Mažem…" : "Vymazať naozaj"}
            </button>
            <button onClick={() => setPotvrdMazanie(false)}
              style={{ padding: "5px 11px", borderRadius: 7, fontSize: 11.5, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}>
              Nechať tak
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Tréningy z kalendára, ktoré sú preč a v PTminderi po nich nič nezostalo. */
function Kontrola({ udalosti, data }: { udalosti: KalUdalost[]; data: PSBData }) {
  const chybajuce = useMemo(
    // Tá istá logika ako v Balíčkoch (nezapisaneTreningy) — líši sa len
    // dneškom: tu sa nekontroluje, lebo zápis zaň ešte len príde.
    () => nezapisaneTreningy(udalosti, data.sessions, "vynechaj")
      .slice()
      .sort((a, b) => b.zaciatok.localeCompare(a.zaciatok)),
    [udalosti, data.sessions],
  );

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
/**
 * JADRO porovnania kalendára s exportom — jedno pre obe karty.
 *
 * Znáša dve odchýlky, ktoré overenie na skutočných dátach odhalilo, obe
 * hlásili chýbajúci zápis tam, kde zápis existoval:
 *
 * 1. DIAKRITIKA. PTminder má „Zuzana Spoligova", kalendár „Zuzana Spoligová".
 *    Pri úvodných sa meno píše voľne (klient ešte v Trackeri nie je).
 * 2. DEŇ VEDĽA. Markéta mala v kalendári 30. 7. a v PTminderi 31. 7. —
 *    hodina sa presunula a kalendár sa neopravil. Dvakrát za dva dni ten
 *    istý klient netrénuje, takže tolerancia ±1 deň je bezpečná.
 *
 * DNEŠOK je jediné, v čom sa obe karty líšia, a líšia sa oprávnene:
 *   • „prebehnute" — Balíčky: hodina, ktorá dnes už prebehla, je minutá,
 *     nech si export myslí čokoľvek,
 *   • „vynechaj" — „Chýba v PTminderi": dnešný zápis ešte len príde, hlásiť
 *     ho ako chýbajúci by bol falošný poplach.
 * Do 18. 8. 2026 bolo toto pravidlo napísané dvakrát a docstring tvrdil, že
 * sú rovnaké — neboli.
 */
export function nezapisaneTreningy(
  udalosti: KalUdalost[],
  sedenia: { client: string; date: string }[],
  dnesok: "prebehnute" | "vynechaj" = "prebehnute",
): KalUdalost[] {
  const teraz = new Date();
  const dnes = dnesPraha(teraz);
  const zapisane = new Set(sedenia.map((x) => `${normName(x.client)}|${x.date.slice(0, 10)}`));
  const posun = (d: string, o: number) => new Date(Date.parse(`${d}T00:00:00Z`) + o * 86400000).toISOString().slice(0, 10);
  return udalosti.filter((u) => {
    if ((u.typ !== "trening" && u.typ !== "uvodny") || !u.klient) return false;
    const den = u.zaciatok.slice(0, 10);
    if (den > dnes) return false;
    if (den === dnes) {
      if (dnesok === "vynechaj") return false;
      if (Date.parse(u.zaciatok) > teraz.getTime()) return false;
    }
    const k = normName(u.klient);
    return ![-1, 0, 1].some((o) => zapisane.has(`${k}|${posun(den, o)}`));
  });
}

export function odtrenovaneMimoExportu(
  udalosti: KalUdalost[],
  sedenia: { client: string; date: string }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of nezapisaneTreningy(udalosti, sedenia, "prebehnute")) {
    out[u.klient as string] = (out[u.klient as string] || 0) + 1;
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
export function Balicky({ udalosti, buduce = [], clients, sedenia = [], onObnov, style, onKlient, onVypis, matchTrener, children, poslednyReport, hore }: {
  udalosti: KalUdalost[];
  /**
   * Objednané tréningy ĎALEKO dopredu — len klient a deň.
   *
   * `udalosti` je okno 14 dní a pre týždenný pohľad to stačí; pre otázku
   * „kedy dôjde balíček" nie. Vítězslav Papiež má termíny do konca roka
   * a karta o nich vedela dva (Jerry, 28. 9. 2026).
   */
  buduce?: { klient: string | null; zaciatok: string }[];
  clients: Record<string, ClientAgg>;
  /** Zápisy z PTmindera — podľa nich sa pozná, ktorý tréning z kalendára
   *  už JE zapísaný a ktorý sa odtrénoval, ale do exportu sa ešte nedostal. */
  sedenia?: { client: string; date: string }[];
  /** Tvrdé obnovenie: stiahne kalendár a načíta dáta odznova. */
  onObnov?: () => Promise<void>;
  style?: React.CSSProperties;
  /** Klik na meno — na Kokpite otvára profil klienta. */
  onKlient?: (meno: string) => void;
  /**
   * „Napísať" — otvorí stôl klienta s pripraveným výpisom (mail + SMS).
   *
   * Číslo bez akcie je Jerryho test pre každú metriku. Karta doteraz
   * povedala „Richardovi dnes došiel balíček" a tým skončila; napísať mu
   * znamenalo nájsť ho v Klientoch, otvoriť stôl a rozkliknúť výpis.
   * SMS naschvál NEODCHÁDZA odtiaľto: naše číslo hodín je pri časti
   * klientov dopočítané a správa „dnes si mal poslednú hodinu" človeku,
   * ktorý má ešte tri, sa späť vziať nedá. Preto sa otvorí výpis, kde je
   * text aj počet správ pred odoslaním vidieť.
   */
  onVypis?: (meno: string) => void;
  /** Prepínač trénera na Kokpite — týka sa klientov bez termínu v kalendári. */
  matchTrener?: (t: string) => boolean;
  /** Doplnková sekcia pod zoznamom (na Kokpite končiace platnosti členstiev). */
  children?: React.ReactNode;
  /** Sekcia NAD zoznamom — v bete nezaplatené (Jerry, 4. 10. 2026). */
  hore?: React.ReactNode;
  /** Posledný import balíčkov — pri pohľade „PTminder" hovorí, k akej chvíli
   *  ten stav platí. Bez neho je potvrdené číslo bez dátumu, čiže na nič. */
  poslednyReport?: { date: string; filename: string } | null;
}) {
  const [obnovujem, setObnovujem] = useState(false);
  const [chybaObnovy, setChybaObnovy] = useState("");
  /**
   * Dva zdroje toho istého čísla — a rozdiel medzi nimi je celý zmysel karty.
   *
   * Jerry, 19. 8. 2026: „na jednej strane sa zostatok dopočítava cez google
   * calendar a cez to, že hodina prebehla, ale na druhej strane skutočné
   * potvrdenie prichádza po reporte z PTminderu."
   *
   * KALENDÁR je predbežná vrstva medzi dvoma exportmi: vie o hodine, ktorá sa
   * odtrénovala pred hodinou, aj o tej, čo je dohodnutá na budúci týždeň.
   * Je rýchlejší, ale je to odhad — zrušený tréning z neho treba vymazať.
   * PTMINDER je účtovníctvo: pomalší, zato potvrdený, a platí k dátumu
   * posledného reportu. Keď sa tie dve čísla rozídu, nie je to chyba — je to
   * presne tá medzera, v ktorej sa 19. 8. stratilo Natálii päť hodín.
   */
  const [zdroj, setZdroj] = useState<"kalendar" | "ptminder">("kalendar");
  const vsetky = useMemo(() => {
    const teraz = new Date();
    const dnes = dnesPraha(teraz);
    const terazVPrahe = terazPraha(teraz);
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
    // Nielen POČET objednaných hodín, ale aj ICH DNI — z nich sa dá povedať,
    // KEDY balíček dôjde, a to je pri obnove jediná otázka, ktorá platí
    // rovnako pre šesťhodinový aj osemnásťhodinový (Jerry, 28. 9. 2026).
    const terminy: Record<string, string[]> = {};
    // Odtrénované-ale-neexportované ráta spoločný helper hore — tie isté
    // čísla číta aj sekcia „Končí platnosť členstva" na Kokpite.
    const odtrenovane = odtrenovaneMimoExportu(udalosti, sedenia);
    // Budúce termíny sa berú zo širokého radu; keď ho server nepošle
    // (staršia odpoveď v keši), spadne sa na okno udalostí.
    const dopredu = buduce.length
      ? buduce.filter((u) => u.klient).map((u) => ({ klient: u.klient as string, zaciatok: u.zaciatok }))
      : udalosti.filter((u) => u.typ === "trening" && u.klient).map((u) => ({ klient: u.klient as string, zaciatok: u.zaciatok }));
    const videne = new Set<string>();
    for (const u of dopredu) {
      const den = u.zaciatok.slice(0, 10);
      if (!(den > dnes || (den === dnes && Date.parse(u.zaciatok) > teraz.getTime()))) continue;
      // Ten istý termín môže prísť z oboch radov — počítať ho dvakrát by
      // balíček minulo skôr, než sa naozaj minie.
      const kluc = `${u.klient}|${u.zaciatok.slice(0, 16)}`;
      if (videne.has(kluc)) continue;
      videne.add(kluc);
      objednane[u.klient] = (objednane[u.klient] || 0) + 1;
      (terminy[u.klient] ||= []).push(den);
    }
    for (const meno of Object.keys(odtrenovane)) if (objednane[meno] === undefined) objednane[meno] = 0;
    // Kto má hodiny dochodené a v kalendári NIČ, je najurgentnejší telefonát zo
    // všetkých — a práve on by z kalendárového zoznamu vypadol, lebo nemá čo
    // odčítať. Preto sa dopĺňa s nulou objednaných.
    for (const c of Object.values(clients)) {
      if (objednane[c.name] !== undefined) continue;
      if (c.status === "Neaktívny" || c.status === "Pauza" || c.lenDoplnky) continue;
      if (matchTrener && !matchTrener(c.primaryTrainer)) continue;
      // `<= 1`, nie `<= 0`: v pohľade PTminder sa hlási aj posledná hodina,
      // a ten, kto ju má a v kalendári nič, by sem inak nemal ako prísť.
      if (c.packageTotal > 0 && c.packageRemaining <= 1) objednane[c.name] = 0;
    }
    return Object.entries(objednane)
      .map(([meno, kusov]) => {
        const c = clients[meno];
        if (!c || c.packageTotal == null || c.packageRemaining == null) return null;
        /**
         * FILTER TRÉNERA PLATÍ PRE CELÝ ZOZNAM, NIE LEN PRE DOPLNENÝCH.
         *
         * Dovtedy stál len o pár riadkov vyššie, v slučke, ktorá dopĺňa ľudí
         * bez termínu v kalendári. Kým sa zoznam staval z `udalosti`, stačilo
         * to: tie sa filtrovali podľa trénera udalosti ešte pred vstupom.
         * 28. 9. 2026 pribudol rad `buduce` (termíny na štyri mesiace) — ten
         * nesie len klienta a deň, žiadneho trénera — a keď je neprázdny,
         * `udalosti` NAHRÁDZA. Tým filter ticho prestal platiť a Jerry videl
         * pod svojím menom Terezkiných klientov.
         *
         * Rozhoduje primárny tréner KLIENTA, nie trénera udalosti: karta je
         * o tom, komu treba predať ďalší balíček, a to je vec toho, kto ho
         * vedie — aj keď konkrétnu hodinu odtrénoval niekto iný.
         */
        if (matchTrener && !matchTrener(c.primaryTrainer)) return null;
        // Kto má len „doplnenie členstva" alebo „za protokol", nemá balíček —
        // má paušál a v exporte stojí navždy na 0/N. Tvrdiť mu, že mu dochádzajú
        // hodiny, je nepravda o produkte, ktorý si kúpil; presne táto zámena
        // kedysi rozsvietila 40 zo 73 klientov. Rovnako klient bez akéhokoľvek
        // balíčka v PTminderi (0 z 0) — tam sa nedá povedať nič, tak sa mlčí.
        if (c.lenDoplnky) return null;
        if (!c.packageTotal && !c.membership) return null;
        const uz = odtrenovane[meno] || 0;
        /**
         * KEDY DÔJDE — deň hodiny, ktorá balíček vyčerpá.
         *
         * Jerry, 28. 9. 2026: „je rozdiel mať posledné 4 z 18 vs posledné
         * 4 zo 6, a keď mám 6 h v balíčku, tam vkuse niekto svieti."
         * Samotný zostatok tie dva prípady nerozlíši — dátum áno: kto chodí
         * raz týždenne, minie štyri hodiny za mesiac, nech má balíček
         * akýkoľvek. Šesťhodinové balíčky sa navyše míňajú stále, takže bez
         * dátumu je karta trvalo plná a nehovorí, komu zavolať PRVÉMU.
         */
        const teraz = c.packageRemaining - uz;
        const dni = (terminy[meno] || []).slice().sort();
        const dojde = teraz <= 0 ? "" : (dni[teraz - 1] || "");
        return {
          meno, kusov, uz, zostava: c.packageRemaining, spolu: c.packageTotal,
          // Dopočítaný počet hodín sa musí povedať pred odoslaním SMS.
          odvodene: !!c.packageOdvodeny, trener: c.primaryTrainer || "",
          // Bol posledný tréning dnes? Rozhoduje, či SMS smie povedať „dnes".
          // Dnešný tréning býva v kalendári, do PTmindera sa dostane o deň-dva.
          // Čas udalosti je pražský, preto aj „teraz“ musí byť pražské, nie UTC.
          // Bez kalendára by SMS v deň, keď na tom záleží, nepovedala „dnes".
          poslednyDnes: (c.sessions || []).some((x) => String(x.date).slice(0, 10) === dnes)
            || udalosti.some((u) => !!u.klient && normName(u.klient) === normName(meno)
              && (u.typ === "trening" || u.typ === "uvodny") && u.zaciatok.slice(0, 10) === dnes && u.zaciatok.slice(0, 16) <= terazVPrahe),
          po: c.packageRemaining - kusov - uz, platnostDo: c.packageValidTo || "",
          dojde, teraz, uzDosiel: teraz <= 0,
          // Členstvo, ktorému už skončila platnosť, hodiny nemíňa — tie
          // prepadli. „Dôjde 28. 9." pri členstve, ktoré skončilo 2. 9., je
          // nepravda o tom, čo sa deje (Jakub Gerich, 28. 9. 2026).
          poPlatnosti: !!c.packageValidTo && c.packageValidTo < dnes,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [udalosti, buduce, clients, matchTrener, sedenia]);

  /**
   * Filter aj poradie sa riadia zvoleným zdrojom — inak by prepínač menil
   * čísla, ale nie zoznam, a ukazoval by ľudí, ktorým podľa daného zdroja
   * nedochádza nič. Kalendár triedi podľa projekcie (po objednaných),
   * PTminder podľa toho, čo naozaj stojí v poslednom reporte.
   */
  const riadky = useMemo(() => {
    if (zdroj === "ptminder") {
      return vsetky.filter((r) => r.zostava <= 1).sort((a, b) => a.zostava - b.zostava || a.meno.localeCompare(b.meno));
    }
    /**
     * HORIZONT PÄŤ TÝŽDŇOV.
     *
     * Bez neho je karta trvalo plná: šesťhodinový balíček sa míňa stále
     * a projekcia „po objednaných bude ≤ 1" na neho sadne skoro vždy.
     * Pätnásť mien, z ktorých polovica dôjde až o dva mesiace, je zoznam,
     * ktorý sa prestane čítať — a to je presne to, čo Jerry hlásil.
     *
     * Kto hodiny minul UŽ TERAZ, zostáva bez ohľadu na dátum: to je
     * najurgentnejší telefonát a žiadny horizont ho nesmie schovať.
     */
    /**
     * HORIZONT DVA TÝŽDNE.
     *
     * Pôvodných päť bolo napísaných v čase, keď kalendár siahal 14 dní
     * dopredu a dátum sa aj tak nedal spočítať. Odkedy appka vidí termíny na
     * štyri mesiace (28. 9. 2026), päť týždňov znamená dvadsaťtri mien —
     * pri šesťhodinových balíčkoch a týždennom tempe dôjde niekomu stále.
     * Dva týždne sú toľko, koľko sa dá za týždeň naozaj obvolať.
     */
    const hranica = dnesPraha(new Date(Date.now() + 14 * 86400000));
    /**
     * Do zoznamu patrí len ten, komu balíček NAOZAJ dôjde:
     *   • hodiny už nemá,
     *   • objednané termíny ho vyčerpajú (a je to do piatich týždňov),
     *   • alebo mu zostáva posledná hodina.
     *
     * „2 zo 6 a jeden objednaný termín" medzi ne nepatrí — po ňom mu zostane
     * hodina a nič sa nedeje. Práve tieto riadky robili z karty pätnásť mien,
     * z ktorých väčšina hovorila „dôjde po objednaných", teda nedôjde.
     */
    return vsetky
      /**
       * Členstvo po platnosti sa do zoznamu NEŤAHÁ a nejde dopredu.
       *
       * Vyzeralo to ako sedem urgentných prípadov, ale väčšina z nich je len
       * chýbajúci novší riadok v exporte: Jakub Gerich má „OFF - 6h
       * S viazanosťou", ktoré sa každý mesiac obnovuje, a Regina Obrovska má
       * dokúpené hodiny z 20. 9. „Platnosť skončila" by o nich tvrdilo niečo,
       * čo appka nevie. Dátum zostáva v riadku ako informácia.
       */
      .filter((r) => r.uzDosiel || r.teraz <= 1 || (!!r.dojde && r.dojde <= hranica))
      .sort((a, b) => {
        if (a.uzDosiel !== b.uzDosiel) return a.uzDosiel ? -1 : 1;
        return (a.dojde || "9999").localeCompare(b.dojde || "9999") || a.meno.localeCompare(b.meno);
      });
  }, [vsetky, zdroj]);

  return (
    <Card style={style}>
      {hore && <div style={{ marginBottom: 18 }}>{hore}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            text={zdroj === "ptminder"
              ? "POTVRDENÝ stav: presne to číslo, ktoré stojí v poslednom reporte z PTminderu, bez akéhokoľvek dopočítania. Hodina odtrénovaná po tom reporte tu ešte nie je — na to je pohľad Kalendár. Toto je účtovníctvo: pomalšie, zato isté. Klienti s paušálnym členstvom sa nezobrazujú: tí stoja v exporte navždy na 0/N. Mení sa podľa prepínača trénera."
              : "PREDBEŽNÝ stav: zostatok z PTminderu mínus to, čo o ňom vie kalendár. Odznak je koľko má TERAZ (po hodinách, ktoré prebehli, ale do exportu sa ešte nedostali); text pod menom hovorí, čo s tým spravia objednané termíny. Kalendár je len vrstva medzi dvoma exportmi — zrušený tréning sa vráti sám, len čo ho z neho vymažeš. Potvrdené číslo je v pohľade PTminder. Klienti s paušálnym členstvom sa nezobrazujú: tí stoja v exporte navždy na 0/N. Mení sa podľa prepínača trénera."}
            label={zdroj === "ptminder"
              ? `Balíček dochádza podľa PTminderu (${riadky.length})`
              : `Balíček dojde po objednaných hodinách (${riadky.length})`}
          />
        </H3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Prepínač zdroja. Nie sú to dva pohľady na tú istú vec pre parádu:
              kalendár odpovedá na „ako to vyzerá dnes", PTminder na „čo je
              potvrdené". Keď sa rozídu, rozdiel je práve tá nezaúčtovaná
              medzera — a tú treba vedieť prečítať, nie ju schovať. */}
          {([["kalendar", "Kalendár"], ["ptminder", "PTminder"]] as const).map(([id, popis]) => (
            <button
              key={id}
              onClick={() => setZdroj(id)}
              title={id === "kalendar"
                ? "Dopočítané cez kalendár — vrátane hodín, ktoré v PTminderi ešte nie sú"
                : "Presne to, čo stojí v poslednom reporte z PTminderu"}
              style={{
                padding: "4px 10px", borderRadius: 8, fontSize: 11.5, cursor: "pointer",
                border: `1px solid ${zdroj === id ? C.accent : C.border}`,
                background: zdroj === id ? mix(C.accent, 14) : "transparent",
                color: zdroj === id ? C.accent : C.textMuted,
                fontWeight: zdroj === id ? 700 : 400,
              }}
            >
              {popis}
            </button>
          ))}
          {/* Tvrdé obnovenie patrí ku kalendáru — je to jeho zdroj. Pri pohľade
              PTminder by tlačidlo klamalo: kalendár sa stiahne, ale číslo na
              obrazovke sa nepohne, lebo to potvrdené mení až import reportu. */}
          {onObnov && zdroj === "kalendar" && (
            <button
              onClick={() => { setObnovujem(true); setChybaObnovy(""); void onObnov().catch((e) => setChybaObnovy(String((e as Error)?.message || "Obnovenie zlyhalo."))).finally(() => setObnovujem(false)); }}
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
      </div>
      {chybaObnovy && (
        <div style={{ fontSize: 11.5, color: C.red, marginTop: 4 }}>{chybaObnovy}</div>
      )}
      {/* Potvrdené číslo bez dátumu je na nič — treba vedieť, ako staré je. */}
      {zdroj === "ptminder" && (
        <div style={{ fontSize: 11, color: C.textDim, marginTop: -2, marginBottom: 8 }}>
          {poslednyReport
            ? `Podľa reportu z ${fmtDMY(poslednyReport.date.slice(0, 10))}. Novší stav dostaneš ďalším importom v záložke Upload.`
            : "Report z PTminderu zatiaľ v appke nie je — nahraj ho v záložke Upload."}
        </div>
      )}
      {!riadky.length ? (
        <Empty>{zdroj === "ptminder" ? "Podľa posledného reportu nikomu balíček nedochádza 🌿" : "Nikomu balíček po objednaných hodinách nedochádza 🌿"}</Empty>
      ) : (
        /* Tri stĺpce namiesto jedného dlhého — sedemnásť riadkov pod sebou
           znamenalo rolovať cez pol obrazovky; v mriežke je celý zoznam
           viditeľný naraz a poradie (najväčší mínus prvý) číta po riadkoch. */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
          {riadky.map((r) => (
            <div key={r.meno} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", background: mix(C.text, 4), border: `1px solid ${C.border}`, borderRadius: 9, minWidth: 0, flexWrap: "wrap" }}>
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
              {/* V pohľade PTminder sa NEODČÍTAVA nič — ani odtrénované hodiny.
                  Je to doslovný opis reportu, aby sa dalo porovnať s PTminderom
                  riadok po riadku bez rátania v hlave. */}
              <span style={{
                fontSize: 10.5, fontWeight: 700, minWidth: 40, padding: "2px 6px", borderRadius: 6, textAlign: "center", flexShrink: 0,
                color: (zdroj === "ptminder" ? r.zostava : r.po) <= 0 ? C.red : C.orange,
                background: mix((zdroj === "ptminder" ? r.zostava : r.po) <= 0 ? C.red : C.orange, 12),
              }}>
                {zdroj === "ptminder" ? r.zostava : Math.max(0, r.zostava - r.uz)}{r.spolu ? `/${r.spolu}` : ""}
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
                {/* Pri PTminderi sa kalendárové veci (odtrénované, objednané)
                    zámerne nepíšu — to je práve to, čo v tom čísle NIE JE.
                    Zostáva platnosť, ktorá je z toho istého reportu. */}
                <span style={{ fontSize: 11, color: C.textDim, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {zdroj === "ptminder" ? (
                    <>
                      {r.platnostDo ? `platnosť do ${fmtDMY(r.platnostDo)}` : "bez zapísanej platnosti"}
                      {r.uz || r.kusov ? ` · kalendár vie o ${[r.uz ? `${r.uz} odtrénovanej` : "", r.kusov ? `${r.kusov} objednaných` : ""].filter(Boolean).join(" a ")}` : ""}
                    </>
                  ) : (
                    /* KEDY dôjde je prvé, čo sa má prečítať — to je celý
                       rozdiel medzi „posledné 4 z 18" a „posledné 4 zo 6".
                       Zvyšok (odtrénované, objednané, platnosť) je kontext
                       a ide za tým. */
                    <>
                      <span style={{ color: r.uzDosiel ? C.red : C.orange, fontWeight: 600 }}>
                        {r.uzDosiel ? "hodiny minuté" : r.dojde ? `dôjde ${fmtDMY(r.dojde)}` : "dôjde po objednaných"}
                      </span>
                      {r.uz ? ` · ${r.uz} h odtrénovaná, v PTminderi ešte nie` : null}
                      {r.kusov ? ` · obj. ${r.kusov}` : null}
                      {r.platnostDo ? `${r.poPlatnosti ? " · členstvo v appke platilo do " : " · do "}${fmtDMY(r.platnostDo)}` : ""}
                    </>
                  )}
                </span>
              </div>
              {/* SMS sa od 5. 10. 2026 posielajú len z Workspace, krok „SMS pre
                  klientov" (Jerry: „chcel by som to na jednom mieste"). */}
              {onVypis && (
                <button
                  onClick={() => onVypis(r.meno)}
                  title={`Napísať ${r.meno} — výpis tréningov, QR na ďalší balíček a SMS`}
                  style={{
                    flexShrink: 0, padding: "3px 8px", borderRadius: 7, fontSize: 11, cursor: "pointer",
                    border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
                  }}
                >
                  Napísať
                </button>
              )}
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
 * KOTVA. Kalendár siaha tri týždne dozadu, takže sedenia od februára v ňom nie
 * sú. Bez pevného bodu by karta ukazovala nezmysel, preto sa raz zapíše stav
 * k dátumu a od neho sa počíta ďalej.
 */
export function GuillermoKarta() {
  const [zaznamy, setZaznamy] = useState<Guillermo[]>([]);
  const [udalosti, setUdalosti] = useState<KalUdalost[]>([]);
  const [platby, setPlatby] = useState<BtcVyplata[]>([]);
  const [kotvaOtvorena, setKotvaOtvorena] = useState(false);
  const [datum, setDatum] = useState(dnesPraha());
  const [stav, setStav] = useState("");
  const [sedeni, setSedeni] = useState<Record<string, string>>({});
  const [uklada, setUklada] = useState("");

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/kalendar", { credentials: "same-origin" });
    const j = (await r.json()) as { ok?: boolean; guillermo?: Guillermo[]; udalosti?: KalUdalost[]; guillermoUdalosti?: KalUdalost[] };
    // Odtrénované sa počíta z guillermoUdalosti (VŠETKY guillermo tréningy bez
    // ohľadu na okno), nie z `udalosti` (len 21 dní dozadu) — inak by starší
    // tréning z počtu vypadol a zostatok by narástol späť.
    if (j.ok) { setZaznamy(j.guillermo || []); setUdalosti(j.guillermoUdalosti || j.udalosti || []); }
    const btc = await fetchBtcReserve(false, true, false);
    // „FP spain" aj staršie „Jerry vyplata fp" — ten istý človek, iný zápis.
    setPlatby((btc?.vyplaty || []).filter((v) => /fp\s*spain|vyplata fp|fpspain/i.test(v.poznamka || "")));
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  const dnes = dnesPraha();
  const kotva = zaznamy.filter((z) => z.druh === "zostatok").sort((a, b) => b.datum.localeCompare(a.datum))[0] || null;
  const odKedy = kotva?.datum || "0000-00-00";
  const nakupy = zaznamy.filter((z) => z.druh === "nakup");
  // Balance math je jedna definícia v lib/psb/guillermo.ts — tú istú funkciu
  // číta aj Jarvisov kontext (aiContext.guillermo), nech sa nerozídu.
  const { zostatok, kupene, odtrenovane } = guillermoZostatok(zaznamy, udalosti, dnes);

  // Platba, ku ktorej ešte nikto nepovedal, koľko sedení kúpila.
  const zaradene = new Set(nakupy.map((z) => z.datum));
  const cakajuce = platby.filter((v) => String(v.datum).slice(0, 10) > odKedy && !zaradene.has(String(v.datum).slice(0, 10)));

  const [chybaG, setChybaG] = useState("");
  const ulozKotvu = async () => {
    const n = Number(stav);
    if (!Number.isFinite(n)) return;
    setUklada("kotva"); setChybaG("");
    const j = await posli({ akcia: "guillermo-pridaj", druh: "zostatok", datum, sedeni: n }).catch(() => ({ ok: false, error: "spojenie" }));
    setUklada("");
    if (!j.ok) { setChybaG(j.error || "Nepodarilo sa uložiť."); return; }
    setStav(""); setKotvaOtvorena(false);
    await nacitaj();
  };

  const ulozPlatbu = async (v: BtcVyplata) => {
    const den = String(v.datum).slice(0, 10);
    const n = Number(sedeni[den]);
    if (!(n > 0)) return;
    setUklada(den); setChybaG("");
    const j = await posli({ akcia: "guillermo-pridaj", druh: "nakup", datum: den, sedeni: n, suma: v.czk ?? null, poznamka: v.poznamka }).catch(() => ({ ok: false, error: "spojenie" }));
    setUklada("");
    if (!j.ok) { setChybaG(j.error || "Nepodarilo sa uložiť."); return; }
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
      <div>
        {chybaG && <div style={{ fontSize: 12, color: C.red, margin: "4px 0 8px" }}>{chybaG}</div>}
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
              <button onClick={async () => { const j = await posli({ akcia: "guillermo-zmaz", id: z.id }).catch(() => ({ ok: false, error: "spojenie" })); if (!j.ok) { setChybaG(j.error || "Zmazanie neprešlo."); return; } await nacitaj(); }}
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
