import { useEffect, useMemo, useState } from "react";

import { monthLabel } from "../../lib/psb/format";
import type { AssistantChat } from "./Assistant";
import type { KrokUzavierky, NavFocus } from "./App";
import { SpravaMesiaca } from "./SpravaMesiaca";
import { fetchKonta, fetchPeriods, setPeriodLock, ulozKonto, type AuditRiadok, type Konto, type Obdobie } from "../../lib/psb/client";
import { C, mix } from "../../lib/psb/theme";
import { Card, Empty, H3, Info } from "./ui";

// Uzávierky a audit — brána pred importom z banky.
//
// Doteraz sa dalo v appke zmeniť čokoľvek a nezostala po tom stopa. Pri
// tréningových dátach to bolo únosné, dajú sa znova nahrať z PTmindera. Pri
// peniazoch z banky to únosné nie je: keď sa raz uzavretý mesiac ticho prepíše
// importom, nikto to nezistí a čísla prestanú zodpovedať tomu, čo bolo
// odovzdané účtovníčke.
//
// Zámok nie je varovanie, je to odmietnutie: import riadky z uzavretého mesiaca
// preskočí a povie o tom. A záloha existuje preto, že zámok ani audit nevrátia
// stav späť — hovoria len, čo sa stalo.

const MESIACE = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
const label = (m: string) => `${MESIACE[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const POPIS: Record<string, string> = {
  "import": "Import CSV",
  "uprava-klienta": "Úprava klienta",
  "skrytie-signalu": "Skrytie signálu",
  "vratenie-signalu": "Vrátenie signálu",
  "nastavenie": "Zmena nastavenia",
  "zapis-zaveru": "Zápis záveru",
  "vyhodnotenie-zaveru": "Vyhodnotenie záveru",
  "zmazanie-dopytu": "Zmazanie dopytu",
  "zamknutie-obdobia": "Zamknutie mesiaca",
  "odomknutie-obdobia": "Odomknutie mesiaca",
  "zaloha": "Stiahnutá záloha",
  "import-banka": "Import z banky",
  "zmazanie-klienta": "Zmazanie klienta",
  "nove-konto": "Nové konto",
  "uprava-konta": "Úprava konta",
};

const CHYBY: Record<string, string> = {
  bad_login: "Prihlasovacie meno smie mať len písmená bez diakritiky, číslice, bodku, pomlčku alebo podčiarkovník.",
  short_password: "Heslo musí mať aspoň 8 znakov.",
  need_password: "Nové konto sa nedá založiť bez hesla.",
  no_db: "Databáza neodpovedala.",
};

// Kontá — kto sa prihlasuje pod svojím menom.
//
// Nejde o oprávnenia: Jerry aj Terezka vidia všetko. Ide o to, aby sa v audite
// nižšie dalo prečítať, KTO zmenu spravil. Kým konto nemá nikto, appka beží na
// zdieľanom hesle a v audite je pri všetkom „app".
function Konta() {
  const [users, setUsers] = useState<Konto[]>([]);
  const [ja, setJa] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [meno, setMeno] = useState("");
  const [heslo, setHeslo] = useState("");
  const [chyba, setChyba] = useState("");
  const [hotovo, setHotovo] = useState("");
  const [busy, setBusy] = useState(false);

  // Len aktívne kontá. Deaktivované konto je pre appku preč — kým sa nezaloží
  // znova s heslom, nemá sa čím pripomínať.
  const nacitaj = () => { void fetchKonta().then((r) => { setUsers(r.users.filter((u) => u.active)); setJa(r.ja); }); };
  useEffect(nacitaj, []);

  const uloz = async (e: React.FormEvent) => {
    e.preventDefault();
    setChyba(""); setHotovo(""); setBusy(true);
    const r = await ulozKonto({ login, name: meno || login, password: heslo });
    setBusy(false);
    if (!r.ok) { setChyba(CHYBY[r.error || ""] || "Nepodarilo sa uložiť."); return; }
    setHotovo(`Konto ${meno || login} uložené.`);
    setLogin(""); setMeno(""); setHeslo("");
    nacitaj();
  };

  return (
    <Card>
      <H3><Info text="Kým konto nemá nikto, appka beží na zdieľanom hesle a v audite je pri každej zmene „app“. Keď má každý vlastné konto, v audite je vidieť meno. Prístup majú obaja rovnaký — konto je identita, nie oprávnenie. Zdieľané heslo zostáva funkčné ako núdzová brzda." label="Kontá" /></H3>
      {users.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textDim, margin: "6px 0 12px", lineHeight: 1.55 }}>
          Zatiaľ žiadne kontá — appka beží na zdieľanom hesle a v audite je pri všetkom „app“.
        </div>
      ) : (
        <div style={{ margin: "8px 0 14px" }}>
          {users.map((u) => (
            <div key={u.login} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderBottom: `1px solid ${mix(C.border, 55)}`, fontSize: 12.5 }}>
              <span style={{ color: C.text, fontWeight: 600, minWidth: 110 }}>{u.name}</span>
              <span style={{ color: C.textDim, fontSize: 11 }}>{u.login}</span>
              {ja === u.login && <span style={{ color: C.green, fontSize: 11 }}>· prihlásený</span>}
              <span style={{ marginLeft: "auto", color: C.textDim, fontSize: 11 }}>
                {u.lastLogin ? `naposledy ${u.lastLogin.slice(0, 10)}` : "ešte sa neprihlásil"}
              </span>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={uloz} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 130px", fontSize: 11, color: C.textMuted }}>
          Meno
          <input value={meno} onChange={(e) => setMeno(e.target.value)} placeholder="Terezka"
            style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
        </label>
        <label style={{ flex: "1 1 130px", fontSize: 11, color: C.textMuted }}>
          Prihlasovacie meno
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="terezka" autoComplete="off"
            style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
        </label>
        <label style={{ flex: "1 1 150px", fontSize: 11, color: C.textMuted }}>
          Heslo (min. 8 znakov)
          <input value={heslo} onChange={(e) => setHeslo(e.target.value)} type="password" autoComplete="new-password"
            style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }} />
        </label>
        <button type="submit" disabled={busy || !login || heslo.length < 8}
          style={{
            padding: "9px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: busy || !login || heslo.length < 8 ? "default" : "pointer",
            border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 8), color: C.accentLight,
            opacity: busy || !login || heslo.length < 8 ? 0.45 : 1,
          }}>
          {busy ? "Ukladám…" : "Uložiť konto"}
        </button>
      </form>
      <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
        Rovnaké prihlasovacie meno prepíše existujúcemu kontu heslo — tak sa heslo aj mení.
      </div>
      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}
      {hotovo && <div style={{ fontSize: 12, color: C.green, marginTop: 8 }}>{hotovo}</div>}
    </Card>
  );
}

export function Uzavierky({ prekazky, kroky, podklady, onNavigate, chat }: {
  /** Čo za daný mesiac ešte nie je hotové. Prázdne pole = dá sa zamknúť. */
  prekazky?: (mesiac: string) => string[];
  /** To isté ako kroky s fajkami — pre kokpit uzávierky. */
  kroky?: (mesiac: string) => KrokUzavierky[];
  /** Všetko, čo appka o mesiaci vie — vstup pre mesačnú správu. */
  podklady?: (mesiac: string) => string;
  onNavigate?: (tab: string, sub?: string, focus?: NavFocus) => void;
  chat?: AssistantChat;
} = {}) {
  const [obdobia, setObdobia] = useState<Obdobie[]>([]);
  const [log, setLog] = useState<AuditRiadok[]>([]);
  const [nacitava, setNacitava] = useState(true);
  const [prebieha, setPrebieha] = useState<string | null>(null);

  const nacitaj = () => {
    void fetchPeriods().then(({ periods, audit }) => {
      setObdobia(periods);
      setLog(audit);
      setNacitava(false);
    });
  };
  useEffect(nacitaj, []);

  const zamky = useMemo(() => new Map(obdobia.map((o) => [o.month, o])), [obdobia]);
  // Mesiace idú z kalendára (od januára 2025 po posledný SKONČENÝ mesiac), nie
  // z rozsahu VZAS. Ten má natvrdo 18 mesiacov z Excelu a končí júnom 2026 —
  // takže júl, prvý mesiac, ktorý reálne treba uzavrieť pred bankou, sa nedal
  // zamknúť. Bežiaci mesiac sa nezamyká: dáta doň ešte pribúdajú (uzávierka je
  // prvý víkend nasledujúceho).
  const dnesMesiac = new Date().toISOString().slice(0, 7);
  const mesiace = useMemo(() => {
    const out: string[] = [];
    for (let rok = 2025; rok <= Number(dnesMesiac.slice(0, 4)); rok++) {
      for (let m = 1; m <= 12; m++) {
        const mk = `${rok}-${String(m).padStart(2, "0")}`;
        if (mk < dnesMesiac) out.push(mk);
      }
    }
    return out.reverse();
  }, [dnesMesiac]);

  // Zamknúť sa dá až vtedy, keď je mesiac naozaj hotový.
  //
  // Zámok znamená „toto číslo už nikto nezmení" — a keď sa zamkne mesiac s
  // nenahratým dokladom alebo nevysvetlenou anomáliou, tá chyba v ňom zostane
  // navždy a bude sa tváriť ako overená. Odomknúť sa dá, ale nikto sa
  // nevracia k mesiacu, ktorý vyzerá uzavretý.
  //
  // Odmietnutie nestačí — musí povedať ČO chýba, inak je to hádanka.
  const prepni = async (m: string, na: boolean) => {
    if (na && prekazky) {
      const chyba = prekazky(m);
      if (chyba.length) {
        setBrani({ mesiac: m, zoznam: chyba });
        return;
      }
    }
    setPrebieha(m);
    await setPeriodLock(m, na);
    nacitaj();
    setPrebieha(null);
    // Zamknutie je jediný okamih, keď je o mesiaci známe všetko naraz. Preto
    // sa práve tu ponúkne mesačná správa — o týždeň by si už nikto nepamätal,
    // prečo boli čísla také, aké boli.
    if (na) setZamknuty(m);
  };

  /** Mesiac, ktorý sa Jerry pokúsil zamknúť predčasne, a čo mu chýba. */
  const [brani, setBrani] = useState<{ mesiac: string; zoznam: string[] } | null>(null);

  const pocetZamknutych = obdobia.filter((o) => o.locked).length;

  // Mesiac, ktorý je na rade: najnovší skončený a ešte nezamknutý.
  const naRade = useMemo(() => mesiace.find((m) => !zamky.get(m)?.locked) || null, [mesiace, zamky]);
  const krokyNaRade = naRade && kroky ? kroky(naRade) : null;
  const hotovych = krokyNaRade ? krokyNaRade.filter((k) => k.hotovo).length : 0;
  const vsetkoHotove = !!krokyNaRade && hotovych === krokyNaRade.length;

  /** Mesiac, ktorý sa práve zamkol — spustí návrh mesačnej správy. */
  const [zamknuty, setZamknuty] = useState<string | null>(null);
  const [hromadne, setHromadne] = useState(false);

  // Staršie mesiace zamknúť naraz, TAK AKO SÚ.
  //
  // Excel do júna 2026 je hotová história — prekontrolovať ju šesťkrát po
  // riadku by nič nezmenilo, lebo z nej sa už neúčtuje. Zámok tu neznamená
  // „overil som to", ale „ďalej sa toho nedotýkam"; podmienka šiestich krokov
  // sa preto zámerne preskakuje a v audite zostane, kedy sa to stalo.
  // Bežiaci mesiac a ten, ktorý sa práve rieši, sa nezamykajú.
  const staršie = useMemo(
    () => mesiace.filter((m) => !zamky.get(m)?.locked && (!naRade || m < naRade)),
    [mesiace, zamky, naRade],
  );
  const zamkniStaršie = async () => {
    setHromadne(true);
    for (const m of staršie) await setPeriodLock(m, true);
    nacitaj();
    setHromadne(false);
  };

  return (
    <>
      {/* Kokpit uzávierky — šesť krokov na jednom mieste, s fajkami.
          Nahrádza stav, keď sa dalo zistiť, čo mesiacu chýba, jedine pokusom
          o zamknutie. */}
      {krokyNaRade && naRade && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <H3><Info text="Čo musí byť hotové, kým sa mesiac zamkne. Zámok znamená „toto číslo už nikto nezmení“ — keď sa zamkne mesiac s nenahratým dokladom alebo nevysvetlenou anomáliou, tá chyba v ňom zostane navždy a bude sa tváriť ako overená. Uzávierku vieš robiť na etapy: sem sa vrátiš a vidíš, kde si." label={`Uzávierka ${monthLabel(naRade)}`} /></H3>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: vsetkoHotove ? C.green : C.textMuted }}>
              {hotovych} zo {krokyNaRade.length} hotovo
            </span>
          </div>

          <div style={{ marginBottom: 12 }}>
            {krokyNaRade.map((k) => (
              <div key={k.id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 2px", borderBottom: `1px solid ${mix(C.border, 45)}`, fontSize: 12.5, flexWrap: "wrap" }}>
                <span style={{ color: k.hotovo ? C.green : C.orange, fontWeight: 700, width: 14, flexShrink: 0 }}>{k.hotovo ? "✓" : "✗"}</span>
                <span style={{ color: C.text, fontWeight: 600, minWidth: 150 }}>{k.label}</span>
                <span style={{ color: k.hotovo ? C.textDim : C.orange, flex: 1, minWidth: 140, lineHeight: 1.45 }}>{k.detail}</span>
                {!k.hotovo && onNavigate && k.tab && (
                  <button
                    onClick={() => onNavigate(k.tab as string, k.sub, k.focus)}
                    style={{ background: "none", border: `1px solid ${mix(C.accent, 40)}`, borderRadius: 7, padding: "3px 10px", color: C.accentLight, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Vybaviť →
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => vsetkoHotove && void prepni(naRade, true)}
              disabled={!vsetkoHotove || prebieha === naRade}
              title={vsetkoHotove ? "Zamknúť mesiac" : "Najprv doplň chýbajúce kroky"}
              style={{
                padding: "8px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                cursor: vsetkoHotove ? "pointer" : "not-allowed",
                border: `1px solid ${vsetkoHotove ? mix(C.green, 55) : C.border}`,
                background: vsetkoHotove ? mix(C.green, 14) : "transparent",
                color: vsetkoHotove ? C.green : C.textDim,
              }}
            >
              🔒 Zamknúť {monthLabel(naRade)}
            </button>
            {!vsetkoHotove && (
              <span style={{ fontSize: 11.5, color: C.textDim }}>
                Chýba {krokyNaRade.length - hotovych}× — zámok sa odomkne, keď bude fajka pri každom kroku.
              </span>
            )}
          </div>

          {staršie.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${mix(C.border, 50)}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => void zamkniStaršie()}
                disabled={hromadne}
                style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, cursor: hromadne ? "wait" : "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
              >
                {hromadne ? "Zamykám…" : `🔒 Zamknúť starších ${staršie.length} mesiacov naraz`}
              </button>
              <span style={{ fontSize: 11, color: C.textDim, flex: 1, minWidth: 220, lineHeight: 1.5 }}>
                {staršie[staršie.length - 1] && label(staršie[staršie.length - 1])} – {label(staršie[0])}, tak ako sú.
                Kroky sa pri nich nekontrolujú: história z Excelu sa už nemení a zámok tu znamená
                „ďalej sa toho nedotýkam", nie „prekontroloval som to". Odomknúť sa dá kedykoľvek.
              </span>
            </div>
          )}
        </Card>
      )}

      {zamknuty && podklady && (
        <SpravaMesiaca mesiac={zamknuty} podklady={podklady(zamknuty)} onZavri={() => setZamknuty(null)} />
      )}

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3><Info text="Uzavretý mesiac sa nedá prepísať importom — riadky, ktoré doň patria, sa preskočia a upload o tom povie. Zamykaj až po tom, čo mesiac skontroluješ; odomknúť sa dá kedykoľvek a zostane po tom záznam v audite. Bežiaci mesiac sa zamknúť nedá, dáta doň ešte pribúdajú (uzávierka je prvý víkend nasledujúceho mesiaca)." label="Uzavreté mesiace" /></H3>
          <a
            href="/api/export"
            download
            style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 8), color: C.accentLight, fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}
          >
            ⬇ Stiahnuť zálohu
          </a>
        </div>
        <div style={{ fontSize: 12, color: C.textDim, margin: "6px 0 12px", lineHeight: 1.55 }}>
          Záloha je jediná vec, ktorá dovolí vrátiť stav späť — zámok aj audit len hovoria, čo sa stalo.
          Stiahni si ju pred prvým importom z banky a nechaj ju mimo appky.
          {pocetZamknutych > 0 && <> Zamknutých mesiacov: <b style={{ color: C.text }}>{pocetZamknutych}</b>.</>}
        </div>

        {brani && (
          <div style={{ background: mix(C.orange, 10), border: `1px solid ${mix(C.orange, 35)}`, borderRadius: 9, padding: "11px 13px", marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 6 }}>
              {monthLabel(brani.mesiac)} sa ešte nedá zamknúť
            </div>
            <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }}>
              {brani.zoznam.map((x) => <li key={x}>{x}</li>)}
            </ul>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {chat && (
                <button
                  onClick={() => {
                    chat.setFloatingOpen(true);
                    void chat.ask(
                      `Chcem zamknúť ${brani.mesiac}, ale appka hlási, že to ešte nejde. Chýba: ${brani.zoznam.join("; ")}. ` +
                      `Prejdi to so mnou — čo z toho viem vyriešiť hneď a čo potrebuje moje rozhodnutie? Ak niečo vieš zapísať sám, navrhni to.`,
                    );
                    setBrani(null);
                  }}
                  style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 7, padding: "5px 13px", color: C.accentLight, fontSize: 12.5, cursor: "pointer" }}
                >
                  Prejsť to s Jarvisom
                </button>
              )}
              <button onClick={() => setBrani(null)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer" }}>zavrieť</button>
            </div>
          </div>
        )}

        {nacitava ? (
          <div style={{ fontSize: 12.5, color: C.textDim }}>Načítavam…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 8 }}>
            {mesiace.map((m) => {
              const o = zamky.get(m);
              const zamknuty = !!o?.locked;
              return (
                <button
                  key={m}
                  onClick={() => void prepni(m, !zamknuty)}
                  disabled={prebieha === m}
                  title={zamknuty ? `Uzavreté ${o?.lockedAt?.slice(0, 10) || ""} — klik odomkne` : "Klik uzavrie mesiac"}
                  style={{
                    padding: "9px 11px", borderRadius: 9, cursor: "pointer", textAlign: "left",
                    border: `1px solid ${zamknuty ? mix(C.green, 45) : C.border}`,
                    background: zamknuty ? mix(C.green, 10) : "transparent",
                    color: zamknuty ? C.text : C.textMuted, fontSize: 12.5,
                    opacity: prebieha === m ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{zamknuty ? "🔒" : "🔓"} {label(m)}</div>
                  <div style={{ fontSize: 10.5, color: zamknuty ? C.green : C.textDim, marginTop: 2 }}>
                    {zamknuty ? "uzavretý" : "otvorený"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <H3><Info text="Každá zmena v appke necháva riadok: čo sa zmenilo, z čoho na čo a kedy. Zobrazuje sa posledných 200 záznamov. Existuje preto, aby sa pri peniazoch dalo dohľadať, kto čo prepísal — do importu z banky bolo možné zmeniť čokoľvek bez stopy." label="Audit — posledné zmeny" /></H3>
        {log.length === 0 ? (
          <Empty>Zatiaľ žiadne zmeny. Prvá zmena po nasadení sa objaví tu.</Empty>
        ) : (
          <div style={{ maxHeight: 420, overflowY: "auto", marginTop: 8 }}>
            {log.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${mix(C.border, 55)}`, fontSize: 12.5, flexWrap: "wrap" }}>
                <span style={{ color: C.textDim, fontSize: 11, minWidth: 118, fontVariantNumeric: "tabular-nums" }}>
                  {r.at.slice(0, 16).replace("T", " ")}
                </span>
                <span style={{ color: C.textMuted, fontSize: 11, minWidth: 58 }}>{r.actor === "app" ? "—" : r.actor}</span>
                <span style={{ color: C.accentLight, minWidth: 150 }}>{POPIS[r.action] || r.action}</span>
                <span style={{ color: C.text, flex: "1 1 200px", minWidth: 0 }}>
                  {r.predmet}
                  {r.neu && <span style={{ color: C.textMuted }}> → {r.neu.length > 90 ? `${r.neu.slice(0, 90)}…` : r.neu}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Konta />
    </>
  );
}
