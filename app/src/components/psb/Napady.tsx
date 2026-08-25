import { useEffect, useMemo, useState } from "react";

import { C, mix } from "../../lib/psb/theme";
import type { AssistantChat } from "./Assistant";
import { Card, Empty, H3, Info } from "./ui";

/**
 * Marketingové nápady — zásobník surových viet.
 *
 * PREČO JE TO VEDĽA „ČO PUBLIKOVAŤ ĎALEJ“
 *
 * Tá karta počíta návrhy z dát: témy, na ktoré sa web zobrazuje a nikto
 * neklikne, články, ktoré ľudia čítajú. Vie však len to, čo sa už stalo.
 * Otázka, ktorú klient položil dnes pri drepe, v žiadnych dátach nie je —
 * a pritom je to najpresnejší jazyk, aký o svojom probléme použije.
 *
 * Dve karty vedľa seba teda nie sú duplicita: jedna hovorí, čo ľudia hľadali,
 * druhá čo sa nahlas spýtali.
 *
 * PREČO SA ZAMIETNUTÉ NEMAŽE
 *
 * Vedieť, že sa téma už raz zavrhla a prečo, je cennejšie než čistý zoznam.
 * Inak sa tá istá vec navrhne o dva mesiace znova a premýšľa sa nad ňou od nuly.
 */

export type Napad = {
  id: string; datum: string; text: string;
  zdroj: string; stav: string; poznamka: string; autor: string;
  /** Odkaz na hotový príspevok — tým sa kruh uzatvára. */
  odkaz?: string;
  /** Deň, keď z nápadu vyšiel obsah. Zapisuje sa sám pri „použité". */
  pouzite_at?: string;
  /** Odkaz na cudzí príspevok, ktorý nápad inšpiroval. */
  inspiracia?: string;
};

const ZDROJ_LABEL: Record<string, string> = {
  otazka_klienta: "otázka klienta", vlastny: "môj nápad", jarvis: "Jarvis", ine: "iné",
  inspiracia: "inšpirácia zvonku",
};

const fmtDen = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || "");
  return m ? `${Number(m[3])}. ${Number(m[2])}.` : d || "—";
};

export function Napady({ chat }: { chat?: AssistantChat }) {
  // Vloženie cudzieho odkazu. Nie je to samostatná obrazovka zámerne — nápad
  // zvonku je nápad ako každý iný, len má navyše adresu, odkiaľ prišiel.
  const [odkazVstup, setOdkazVstup] = useState("");
  const [ukladam, setUkladam] = useState(false);
  const [napady, setNapady] = useState<Napad[]>([]);
  const [nacitane, setNacitane] = useState(false);
  const [ajHotove, setAjHotove] = useState(false);

  const nacitaj = () => void fetch("/api/napady", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((j: { napady?: Napad[] }) => setNapady(j.napady || []))
    .catch(() => {})
    .finally(() => setNacitane(true));
  useEffect(nacitaj, []);

  const [chyba, setChyba] = useState("");
  /**
   * Kruh sa uzatvára odkazom (Jerry, 18. 8. 2026).
   *
   * „Použité" bez odkazu je len odškrtnutie — appka potom nikdy nezistí, či
   * témy zachytené pri tréningu fungujú lepšie než témy z hlavy, a to je
   * jediný dôvod, prečo sa nápady zbierajú. Adresa sa dá preskočiť: nútiť
   * ju by znamenalo, že sa nápad neoznačí vôbec.
   */
  const [pytaOdkaz, setPytaOdkaz] = useState<string | null>(null);
  const [odkazText, setOdkazText] = useState("");
  const zmen = async (id: string, zmena: Partial<Napad>) => {
    const j = await fetch("/api/napady", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...zmena }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));
    setChyba(j?.ok ? "" : "Zmena sa nezapísala — skús znova.");
    nacitaj();
  };

  const otvorene = useMemo(() => napady.filter((n) => n.stav === "novy"), [napady]);
  const hotove = useMemo(() => napady.filter((n) => n.stav !== "novy"), [napady]);
  const vidno = ajHotove ? napady : otvorene;

  /**
   * Verdikt od Jarvisa. Zámerne sa pýta na obe strany naraz — či to je téma
   * a či nie — inak model prikyvuje: nápad, ktorý dostane otázku „čo z toho
   * publikovať“, sa vždy dá nejako publikovať.
   */
  const posud = (n: Napad) => {
    if (!chat) return;
    chat.setFloatingOpen(true);
    void chat.ask([
      `Posúď tento marketingový nápad: „${n.text}“`,
      `Zdroj: ${ZDROJ_LABEL[n.zdroj] || n.zdroj}, zapísaný ${fmtDen(n.datum)}.`,
      "",
      "Odpovedz v tomto poradí:",
      "1. Je to téma, alebo nie? Ak nie je, povedz to rovno a prečo — mlčať a hľadať na tom niečo dobré je horšie.",
      "2. Ak je: pre koho presne a na akú otázku odpovedá. Použi čísla z dát, ak nejaké súvisia (Search Console, obsah → dopyt).",
      "3. V akom formáte a prečo práve v tom.",
      "4. Čo by som s tým NEMAL robiť — kde je pri tejto téme hranica FP pravidiel alebo indexu brand-konfliktov.",
      "",
      "Ak by si to prepracoval, napíš ako — nie len to, že by si to prepracoval.",
    ].join("\n"), `Posúď nápad: ${n.text.slice(0, 60)}`);
  };

  /**
   * Rozbor cudzieho príspevku.
   *
   * ČO JARVIS VIDIEŤ NEVIE
   *
   * Video neprehrá a Instagram odkaz zvonku neotvorí — oEmbed od Mety chce
   * vlastné schválenie, ktoré appka nemá (overené 23. 8. 2026). Obrázky
   * VIDIEŤ vie, takže rozbor stojí na snímke obrazovky. Preto sa o ňu pýta
   * hneď v prvej vete namiesto toho, aby predstieral, že si video pozrel.
   */
  const rozober = async (n: Napad) => {
    if (!chat) return;
    chat.setFloatingOpen(true);
    // Titulný záber sa ťahá AŽ TERAZ, nie pri vkladaní: adresa obrázka
    // z Instagramu je podpísaná a vyprší, takže uložená by o hodinu nefungovala.
    const meta = n.inspiracia
      ? await fetch("/api/inspiracia", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: n.inspiracia }),
        }).then((x) => x.json()).catch(() => null) as { ok?: boolean; obrazok?: string; popis?: string } | null
      : null;
    const obrazky = meta?.ok && meta.obrazok ? [meta.obrazok] : [];
    void chat.ask([
      "Našiel som cudzí príspevok, ktorý ma zaujal, a chcem z neho spraviť niečo naše.",
      n.inspiracia ? `Odkaz: ${n.inspiracia}` : "",
      n.text ? `Čo si o ňom pamätám: ${n.text}` : "",
      "",
      obrazky.length
        ? "PRILOŽENÝ OBRÁZOK JE TITULNÝ ZÁBER — teda PRVÁ SEKUNDA videa, nie jeho priebeh. Rozober z neho formát, text v obraze a kompozíciu, ale NETVRĎ, že vieš, ako sa v ňom hýbe kamera ani čo je ďalej. Keď je pohyb kamery podstatný, povedz mi, nech pošlem záznam obrazovky."
        : "DÔLEŽITÉ: ten odkaz otvoriť nevieš a video nevidíš. Nepredstieraj, že áno. Povedz mi rovno, nech ti pošlem snímku obrazovky — stačí prvá sekunda a popis. Až potom rozoberaj.",
      "",
      "Keď snímku máš, odpovedz takto:",
      "1. ČO NA TOM FUNGUJE — nie čo tam je, ale prečo to zastaví palec. Pomenuj mechanizmus.",
      "2. DÁ SA TO PRENIESŤ NA PSB? Ak nie, povedz to rovno — cudzí formát, ktorý sedí inej značke,",
      "   je horší než žiadny. Skontroluj to proti FP pravidlám a indexu brand-konfliktov.",
      "3. AK ÁNO: naša verzia — do ktorej fázy nákupného cyklu patrí, aký úvodný záber,",
      "   a prvá veta po slovensky, ako ju poviem na kameru.",
      "4. ČO Z TOHO NEBRAŤ — čo v origináli funguje im a nám by uškodilo.",
      "",
      "Keď je návrh konkrétny, pridaj psb-action naplanuj-obsah tak, ako to robíš inak.",
    ].filter(Boolean).join("\n"), `Rozbor inšpirácie: ${n.text.slice(0, 50)}`, undefined, obrazky);
  };

  const vlozOdkaz = async () => {
    const url = odkazVstup.trim();
    if (!/^https?:\/\//i.test(url)) return;
    setUkladam(true);
    try {
      // Metadáta najprv: keď ich Instagram vydá, nápad má rovno popis, autora
      // a čísla namiesto holej adresy. Keď nevydá, nápad vznikne aj tak —
      // odkaz je cennejší než nič a rozbor si vypýta snímku obrazovky.
      const meta = await fetch("/api/inspiracia", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      }).then((x) => x.json()).catch(() => null) as
        { ok?: boolean; autor?: string; popis?: string; lajky?: number | null; komentare?: number | null; datum?: string } | null;

      const zhrnutie = meta?.ok && meta.popis
        ? [
            meta.autor ? `${meta.autor}:` : "",
            meta.popis.replace(/\s+/g, " ").slice(0, 400),
          ].filter(Boolean).join(" ")
        : `Inšpirácia: ${url}`;
      const cisla = meta?.ok
        ? [
            meta.datum || "",
            meta.lajky != null ? `${meta.lajky} lajkov` : "",
            meta.komentare != null ? `${meta.komentare} komentárov` : "",
          ].filter(Boolean).join(" · ")
        : "";

      const r = await fetch("/api/napady", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: zhrnutie,
          poznamka: cisla,
          zdroj: "inspiracia", inspiracia: url,
        }),
      });
      const j = (await r.json()) as { ok?: boolean };
      if (j.ok) { setOdkazVstup(""); nacitaj(); }
    } catch { /* obrazovka nechá pole vyplnené, nič sa nestratí */ }
    setUkladam(false);
  };

  const platnyOdkaz = /^https?:\/\//i.test(odkazVstup.trim());

  if (!nacitane) return null;

  return (
    <Card>
      {chyba && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{chyba}</div>}

      {/* Odkaz zvonku. Jarvis ho otvoriť nevie — appka ho len uloží a rozbor
          beží zo snímky obrazovky, ktorú Jerry priloží do rozhovoru. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          value={odkazVstup}
          onChange={(e) => setOdkazVstup(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void vlozOdkaz(); }}
          placeholder="vlož odkaz na cudzí reel, ktorý ťa zaujal"
          style={{
            flex: "1 1 240px", background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5,
            border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 10px", boxSizing: "border-box",
          }} />
        <button onClick={() => void vlozOdkaz()} disabled={ukladam || !platnyOdkaz}
          style={{
            background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "7px 12px",
            fontSize: 12.5, fontFamily: "inherit",
            color: platnyOdkaz ? C.accentLight : C.textDim,
            cursor: platnyOdkaz ? "pointer" : "default",
          }}>
          uložiť ako inšpiráciu
        </button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            label={`Nápady na obsah (${otvorene.length})`}
            text="Surové vety, z ktorých môže byť obsah — zapisujú sa v „+ Zápis“ jedným riadkom. Najcennejšie sú otázky klientov počas tréningu: to je jazyk, ktorým ľudia o svojom tele naozaj hovoria, a v žiadnych dátach nie je. Karta „Čo publikovať ďalej“ vie len to, čo sa už stalo; táto vie, čo sa nahlas spýtali. Zamietnuté sa nemažú — vedieť, že sa téma už raz zavrhla a prečo, je cennejšie než prázdny zoznam."
          />
        </H3>
        {hotove.length > 0 && (
          <button onClick={() => setAjHotove((v) => !v)}
            style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer" }}>
            {ajHotove ? "skryť vyriešené" : `ukázať aj vyriešené (${hotove.length})`}
          </button>
        )}
      </div>

      {vidno.length === 0 ? (
        <Empty>
          Zatiaľ žiadny nápad. Zapisujú sa v <b>+ Zápis</b> hore — jeden riadok, kým to máš v hlave.
          Otázka, ktorú ti klient položí pri drepe, je o mesiac nenávratne stratená.
        </Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {vidno.map((n) => (
            <div key={n.id} style={{
              borderLeft: `2px solid ${n.stav === "pouzity" ? C.green : n.stav === "zamietnuty" ? mix(C.text, 25) : n.zdroj === "otazka_klienta" ? C.accent : mix(C.accent, 45)}`,
              paddingLeft: 10, opacity: n.stav === "zamietnuty" ? 0.6 : 1,
            }}>
              <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.45, textDecoration: n.stav === "zamietnuty" ? "line-through" : undefined }}>
                {n.text}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: C.textDim }}>
                  {ZDROJ_LABEL[n.zdroj] || n.zdroj} · {fmtDen(n.datum)}
                  {n.stav === "pouzity" && (
                    <span style={{ color: C.green }}>
                      {" "}· použité{n.pouzite_at ? ` ${fmtDen(n.pouzite_at)}` : ""}
                      {n.odkaz && (
                        <>
                          {" "}·{" "}
                          <a href={n.odkaz} target="_blank" rel="noopener noreferrer" style={{ color: C.accentLight }}>príspevok ↗</a>
                        </>
                      )}
                    </span>
                  )}
                  {n.stav === "zamietnuty" && <span> · zamietnuté</span>}
                </span>
                {n.stav === "novy" && (
                  <>
                    {chat && (
                      <>
                      {n.zdroj === "inspiracia" && (
                        <button onClick={() => void rozober(n)} disabled={chat.busy}
                          style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontSize: 11.5, cursor: chat.busy ? "default" : "pointer", fontFamily: "inherit", marginRight: 10 }}>
                          rozobrať s Jarvisom
                        </button>
                      )}
                      <button onClick={() => posud(n)} disabled={chat.busy}
                        style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontSize: 11.5, cursor: chat.busy ? "default" : "pointer", fontFamily: "inherit" }}>
                        Čo si o tom myslíš?
                      </button>
                      </>
                    )}
                    <button onClick={() => void zmen(n.id, { stav: "pouzity" })}
                      style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
                      použité
                    </button>
                    <button onClick={() => void zmen(n.id, { stav: "zamietnuty" })}
                      style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
                      nie je to téma
                    </button>
                  </>
                )}
                {pytaOdkaz === n.id && (
                  <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", width: "100%", marginTop: 4 }}>
                    <input
                      value={odkazText}
                      onChange={(e) => setOdkazText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { void zmen(n.id, { stav: "pouzity", odkaz: odkazText.trim() }); setPytaOdkaz(null); setOdkazText(""); } }}
                      autoFocus
                      placeholder="Odkaz na príspevok (nepovinné, Enter potvrdí)"
                      style={{ flex: 1, minWidth: 220, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }}
                    />
                    <button onClick={() => { void zmen(n.id, { stav: "pouzity", odkaz: odkazText.trim() }); setPytaOdkaz(null); setOdkazText(""); }}
                      style={{ background: C.accentBg, border: `1px solid ${C.accent}`, borderRadius: 6, padding: "3px 10px", color: C.accentLight, fontSize: 11.5, cursor: "pointer" }}>
                      označiť
                    </button>
                  </span>
                )}
                {n.stav !== "novy" && (
                  <button onClick={() => void zmen(n.id, { stav: "novy" })}
                    style={{ background: "none", border: "none", padding: 0, color: C.textDim, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
                    vrátiť
                  </button>
                )}
              </div>
              {n.poznamka && (
                <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3, lineHeight: 1.5 }}>{n.poznamka}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
