import { useEffect, useRef, useState } from "react";
import { oznam, pocuvaj } from "../../lib/psb/obnovaSignal";
import { VyberMena } from "./VyberMena";

import { dlzkaSpravy, textSms, cisloPreBranu, cisloNaUkazku } from "../../lib/psb/sms";
import { C, mix } from "../../lib/psb/theme";

/**
 * SMS KLIENTOVI Z NOTIFIKÁCIE.
 *
 * Jerry, 29. 9. 2026: „chcel by som to aj do tej notifikácie." Predtým sa
 * dalo písať len zo stola klienta — karta povedala, komu balíček došiel,
 * a tým skončila.
 *
 * PREČO JE MEDZI KLIKOM A ODOSLANÍM EŠTE JEDEN KROK
 *
 * Nie preto, aby to bolo bezpečné „pre istotu". Text vidí človek preto, že
 * SMS ide von k zákazníkovi a späť sa vziať nedá — a Kokpit nevie všetko
 * rovnako isto:
 *
 *  • **Dopočítané hodiny.** PTminder vyváža offline členstvá ako `0 left
 *    from 0` a počet sa berie z názvu. Pri takom klientovi sa to povie
 *    rovno v potvrdení, lebo „dnes si mal poslednú hodinu" človeku, ktorý
 *    má ešte tri, je trapas u zákazníka.
 *  • **Dĺžka.** Text s diakritikou má 70 znakov na správu. „Jedna veta"
 *    a „dve SMS" sú dve rôzne ceny a človek to má vedieť pred klikom.
 *
 * Keď Kokpit balíčky vedie sám (po odchode z PTmindera), prvý dôvod zmizne
 * — potvrdenie zostane, ale bez varovania.
 */

type Kontakt = { klient: string; telefon?: string; telefon2?: string };

/** Príjemca, ktorý nie je klient — číslo sa napíše rukou a nikam neukladá. */
const JINE_PRIJEMCA = "Jiné (nie je klient)";

/**
 * Telefóny sa ťahajú PRI KAŽDOM OTVORENÍ okna, nie raz za načítanie stránky.
 *
 * Jerry, 4. 10. 2026 nad Romanom Pavlíkom: „upravil som číslo v profile, ale
 * pri odosielaní SMS sa neprepísalo." Okno si zoznam pamätalo od prvého
 * otvorenia, takže oprava v profile sa prejavila až po obnovení celej
 * stránky. Jeden dopyt pri otvorení nestojí nič; staré číslo v SMS áno.
 */
const kontakty = () =>
  fetch("/api/vydane-faktury", { credentials: "same-origin", cache: "no-store" })
    .then((r) => r.json())
    .then((j) => (j?.udaje || []) as Kontakt[])
    .catch(() => [] as Kontakt[]);

export function SmsKlientovi({ meno, zostatok = 0, trener = "", predvolenyText, platba, datum, odvodene = false, sMailom = false, dnesnyTrening = false, maly = false, vlozene = false, onOdoslane }: {
  meno: string;
  /** Koľko hodín zostáva; 0 alebo menej = balíček došiel. */
  zostatok?: number;
  trener?: string;
  /**
   * Hotový text namiesto predvoleného.
   *
   * Pri zápise balíčka sa nepíše „balíček ti došiel", ale „zapísal som ti
   * nový" — je to iný okamih, nie iná formulácia tej istej veci.
   */
  predvolenyText?: string;
  /**
   * Pripomienka platby namiesto správy o hodinách.
   *
   * Nie je to `predvolenyText`: ten text je hotový a odkaz sa pri ňom
   * nepýta. Tu odkaz TREBA — za ním je QR na platbu, kvôli ktorému sa
   * správa píše — takže text sa skladá až po jeho príchode.
   */
  platba?: { suma: number; datum?: string };
  /**
   * Dátum balíčka, o ktorý ide — „9. 9. 2026". Ide do vety „za balíček z…".
   * Keď ho obrazovka nepozná, veta drží aj bez neho.
   */
  datum?: string;
  /** `true` = počet hodín je dopočítaný z názvu členstva, nie z exportu. */
  odvodene?: boolean;
  /** Ide spolu s mailom? Mení vetu o tom, kde nájde dochádzku. */
  sMailom?: boolean;
  /** Bol tréning dnes? Bez toho sa správa na dnešok neodvoláva. */
  dnesnyTrening?: boolean;
  maly?: boolean;
  /**
   * Okno priamo v riadku zoznamu, bez tlačidla a bez prekrytia stránky.
   * Karta „SMS pre klientov" vo Workspace (Jerry, 4. 10. 2026): „klik na
   * meno, rozbalí sa na veľké a tam skontrolujem číslo a pošlem."
   */
  vlozene?: boolean;
  /** Správa odišla — zoznam klienta schová, kým sa mu nezmení stav. */
  onOdoslane?: () => void;
}) {
  const [otvorene, setOtvorene] = useState(vlozene);
  const [telefon, setTelefon] = useState<string | null>(null);
  /** Kam správa naozaj odíde — ten istý prevod, aký urobí server. */
  const cislo = telefon ? cisloPreBranu(telefon) : null;
  /**
   * KOMU SPRÁVA IDE (Jerry, 4. 10. 2026): „poslať niekomu inému — rozbaľovací
   * zoznam klientov + Jiné, keby to išlo niekomu, kto nie je klient." Predvolene
   * klient sám; `JINE_PRIJEMCA` = číslo napísané rukou, ktoré sa nikam neukladá.
   */
  const [komu, setKomu] = useState(meno);
  const [vsetkyKontakty, setVsetkyKontakty] = useState<Kontakt[]>([]);
  /** Rozpísané číslo v úprave; `null` = neupravuje sa. */
  const [upravaCisla, setUpravaCisla] = useState<string | null>(null);
  const [ukladamCislo, setUkladamCislo] = useState(false);
  const jeJine = komu === JINE_PRIJEMCA;
  /**
   * Kým sa meno v „Komu" len píše, príjemca nie je vybraný a číslo patrí
   * predošlému — poslať sa nesmie (správa by odišla niekomu inému, než je
   * napísané v políčku).
   */
  const platnyKomu = komu === meno || jeJine || vsetkyKontakty.some((x) => x.klient === komu);
  const [text, setText] = useState("");
  const [bezi, setBezi] = useState(false);
  const [hlaska, setHlaska] = useState("");
  const [hotovo, setHotovo] = useState(false);
  /** Odkaz na /v/<token> — stránka s tréningmi a QR na platbu. */
  const [odkaz, setOdkaz] = useState("");
  /** Tá istá stránka pre náhľad: priamo z workera a bez počítadla otvorení. */
  const [nahlad, setNahlad] = useState("");
  /**
   * KOĽKO BALÍČKOV HISTÓRIE klient za odkazom uvidí. 0 = celá história.
   *
   * Jerry, 3. 10. 2026: „Hanus bol v mínuse, keď platil naposledy, aj teraz.
   * Keď mu pošlem iba posledný balík, bude to neprehľadné — keby som ale
   * v okne pred odoslaním mal možnosť poslať mnou určenú históriu, mohlo by
   * sa mu to vyjasniť."
   *
   * Nedrží sa to v adrese, ale pri tokene (`klient_odkazy.balickov`) —
   * presmerovanie z prosapiens.cz query string zahadzuje. Preto sa zmena
   * najprv ULOŽÍ a až potom sa prekreslí náhľad: to, čo Jerry vidí, je to,
   * čo si vypýta prehliadač klienta.
   */
  const [balickov, setBalickov] = useState(1);
  const [rozsahBezi, setRozsahBezi] = useState(false);
  /**
   * Čo klient za odkazom NAOZAJ uvidí — vypočítané serverom tým istým
   * kódom, ktorý stránku kreslí (`obsahOdkazu`). Číslo `zostatok`, ktoré
   * pošle obrazovka, je len záloha, kým odpoveď nepríde.
   */
  const [stavStranky, setStavStranky] = useState<{ sQr: boolean } | null>(null);
  /** Zmena čísla donúti iframe načítať stránku znova. */
  const [verzia, setVerzia] = useState(0);
  const nacitane = useRef(false);

  useEffect(() => {
    // Zatvorené okno zabudne číslo — pri ďalšom otvorení sa načíta znova.
    if (!otvorene) { nacitane.current = false; setKomu(meno); setUpravaCisla(null); return; }
    if (nacitane.current) return;
    nacitane.current = true;
    setTelefon(null);
    void kontakty().then((u) => {
      setVsetkyKontakty(u);
      setTelefon(String(u.find((x) => x.klient === meno)?.telefon || ""));
    });
    // Odkaz sa pýta serveru (token na klienta je jeden); text sa preskladá,
    // keď dorazí — preto je v druhom effecte nižšie.
    if (!predvolenyText) {
      void fetch("/api/sms", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "odkaz", klient: meno }),
      }).then((x) => x.json()).then((j: { ok?: boolean; url?: string; nahlad?: string; balickov?: number; stav?: { sQr: boolean } | null }) => {
        if (j?.ok && j.url) setOdkaz(j.url);
        if (j?.stav) setStavStranky(j.stav);
        if (j?.nahlad) setNahlad(j.nahlad);
        if (typeof j?.balickov === "number") setBalickov(j.balickov);
      }).catch(() => null);
    }
  }, [otvorene, meno, predvolenyText]);

  /**
   * Predvolený text sa skladá znova pri zmene rodu aj po príchode odkazu.
   * Prepíše aj rozpísaný text — prepínač rodu je vedomé „presklad mi to";
   * odkaz dorazí do sekundy od otvorenia, skôr než sa dá čokoľvek napísať.
   */
  useEffect(() => {
    if (!otvorene) return;
    const oslovenie = meno.split(" ")[0];
    setText(
      predvolenyText
        || textSms({
          oslovenie, trener, sMailom, odkaz: odkaz || undefined,
          datum: platba?.datum || datum,
          /**
           * QR sľubuje len vtedy, keď na stránke naozaj bude. Stránka ho
           * kreslí pri dlhu a pri dochodenom alebo prečerpanom balíčku
           * (vtedy ponúkne ďalší za cenu toho posledného). Pri zostávajúcich
           * hodinách nie je čo platiť — a správa, ktorá sľúbi QR a klient ho
           * tam nenájde, je horšia než stručná.
           */
          // Kým server nepovie, či QR na stránke bude, správa ho NESĽUBUJE —
          // obrazovka ráta zostatok inak než stránka a sľub bez QR je horší
          // než stručná správa (pamäť „Jedna SMS, stav hovorí stránka").
          // Odpoveď príde do sekundy a text sa preskladá.
          sQr: stavStranky ? stavStranky.sQr : false,
        }),
    );
    // Závislosťou sú HODNOTY, nie objekt `platba`: nový literál pri každom
    // prekreslení rodiča by text preskladal aj uprostred písania.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otvorene, meno, trener, sMailom, predvolenyText, platba, zostatok, datum, odkaz, stavStranky]);

  /**
   * Rozsah sa ULOŽÍ, až potom sa prekreslí náhľad. Keď zápis zlyhá, číslo
   * sa vráti späť a povie sa to — inak by Jerry poslal odkaz v presvedčení,
   * že klient uvidí dva balíčky, a klient by videl jeden.
   */
  const zmenRozsah = async (n: number) => {
    const bolo = balickov;
    setBalickov(n); setRozsahBezi(true); setHlaska("");
    const r = await fetch("/api/sms", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "rozsah", klient: meno, balickov: n }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setRozsahBezi(false);
    if (!r?.ok) { setBalickov(bolo); setHlaska("rozsah sa neuložil"); return; }
    setVerzia((v) => v + 1);
  };

  /** Výber príjemcu: klient zo zoznamu dostane svoje číslo, „Jiné" prázdne políčko. */
  const vyberKomu = (kto: string) => {
    setKomu(kto);
    setHlaska("");
    if (kto === JINE_PRIJEMCA) { setTelefon(""); setUpravaCisla(""); return; }
    setUpravaCisla(null);
    setTelefon(String(vsetkyKontakty.find((x) => x.klient === kto)?.telefon || ""));
  };

  /**
   * ÚPRAVA ČÍSLA. Pri klientovi sa uloží DO PROFILU (ten istý zápis ako
   * „Upraviť profil", posiela sa len telefón a zvyšok kontaktu server
   * zachová) a oznámi sa to — profil aj ďalšie okná SMS majú hneď to isté.
   * Pri „Jiné" sa číslo nikam neukladá: patrí niekomu, kto klientom nie je.
   */
  const ulozCislo = async () => {
    const nove = (upravaCisla || "").trim();
    if (jeJine) { setTelefon(nove); setUpravaCisla(null); return; }
    setUkladamCislo(true); setHlaska("");
    const r = await fetch("/api/vydane-faktury", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "udaje", klient: komu, telefon: nove }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setUkladamCislo(false);
    if (!r?.ok) { setHlaska(r?.error || "číslo sa neuložilo"); return; }
    setTelefon(nove);
    setVsetkyKontakty((xs) => xs.some((x) => x.klient === komu)
      ? xs.map((x) => (x.klient === komu ? { ...x, telefon: nove } : x))
      : [...xs, { klient: komu, telefon: nove }]);
    setUpravaCisla(null);
    setHlaska("číslo uložené aj v profile");
    oznam("klienti");
  };

  /**
   * DRUHÉ ČÍSLO KLIENTA (Jerry, 4. 10. 2026): „keby použijem číslo, ktoré
   * nepatrí žiadnemu klientovi, mala by byť možnosť toto číslo uložiť na
   * profil daného klienta ako druhé číslo." Hlavné číslo ostáva, ako je.
   */
  const novyCudzi = (() => {
    const c = cisloPreBranu(upravaCisla || "");
    if (!c) return false;
    return !vsetkyKontakty.some((x) => cisloPreBranu(x.telefon || "") === c || cisloPreBranu(x.telefon2 || "") === c);
  })();
  const ulozDruhe = async () => {
    const nove = (upravaCisla || "").trim();
    setUkladamCislo(true); setHlaska("");
    const r = await fetch("/api/vydane-faktury", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "udaje", klient: meno, telefon2: nove }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setUkladamCislo(false);
    if (!r?.ok) { setHlaska(r?.error || "číslo sa neuložilo"); return; }
    setTelefon(nove);
    setVsetkyKontakty((xs) => xs.some((x) => x.klient === meno)
      ? xs.map((x) => (x.klient === meno ? { ...x, telefon2: nove } : x))
      : [...xs, { klient: meno, telefon2: nove }]);
    setUpravaCisla(null);
    setHlaska(`uložené ako druhé číslo — ${meno}`);
    oznam("klienti");
  };
  /** Druhé číslo klienta, keď nejaké má — dá sa naň prepnúť jedným klikom. */
  const druhe = komu === meno ? String(vsetkyKontakty.find((x) => x.klient === meno)?.telefon2 || "") : "";
  const hlavne = komu === meno ? String(vsetkyKontakty.find((x) => x.klient === meno)?.telefon || "") : "";

  const posli = async () => {
    setBezi(true); setHlaska("");
    const r = await fetch("/api/sms", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ klient: meno, telefon, text, prijemca: komu === meno ? undefined : (jeJine ? "iné číslo" : komu) }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setBezi(false);
    if (r?.ok) { setHotovo(true); setHlaska("odoslané"); onOdoslane?.(); return; }
    setHlaska(r?.error || "nepodarilo sa");
  };

  /**
   * Esc zavrie okno. Hook stojí NAD skorými návratmi — pod nimi by sa pri
   * zatvorenom okne nezavolal a React by spadol na zmenenom poradí hookov
   * (viď eslint.hooks.config.js).
   */
  /**
   * Číslo opravené v profile, kým je okno otvorené, sa prejaví hneď —
   * profil po uložení oznámi „klienti". Rozpísanú úpravu to neprepíše.
   */
  useEffect(() => {
    if (!otvorene) return;
    return pocuvaj("klienti", () => {
      void kontakty().then((u) => {
        setVsetkyKontakty(u);
        if (upravaCisla === null && komu !== JINE_PRIJEMCA) setTelefon(String(u.find((x) => x.klient === komu)?.telefon || ""));
      });
    });
  }, [otvorene, komu, upravaCisla]);

  useEffect(() => {
    if (!otvorene || vlozene) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setOtvorene(false); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [otvorene, vlozene]);

  const tlacidlo = {
    padding: maly ? "3px 8px" : "6px 12px", borderRadius: maly ? 7 : 8,
    fontSize: maly ? 11 : 12.5, cursor: "pointer", fontFamily: "inherit",
  } as const;

  if (hotovo) return <span style={{ fontSize: maly ? 11 : 12, color: C.green, flexShrink: 0 }}>SMS odoslaná{vlozene ? ` — ${meno} zo zoznamu zmizne, kým sa mu nezmení stav.` : ""}</span>;

  if (!otvorene) {
    return (
      <button
        onClick={() => setOtvorene(true)}
        title={`Poslať SMS — ${meno}`}
        style={{ ...tlacidlo, flexShrink: 0, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
      >
        SMS
      </button>
    );
  }

  const kolko = dlzkaSpravy(text);
  /**
   * SAMOSTATNÉ OKNO, NIE RIADOK V DLAŽDICI.
   *
   * Jerry, 2. 10. 2026: „keď kliknem na SMS hocikomu, nech sa otvorí
   * samostatné okno, kde bude text tej SMS a náhľad obsahu odkazu — a keď to
   * skontrolujem, tak to pošlem."
   *
   * Dovtedy sa panel rozbalil vnútri dlaždice: text sa dal prečítať, ale to,
   * ČO klient za odkazom uvidí, nie. A práve to je vec, ktorá sa mení podľa
   * stavu klienta (QR, dochodený balíček, os času) a stojí za kontrolu
   * predtým, než správa odíde — späť sa vziať nedá.
   *
   * Náhľad je ŽIVÁ stránka, nie obrázok: ten istý worker, tá istá adresa,
   * len s `?nahlad=1`, ktoré nezdvíha počítadlo otvorení.
   */
  return (
    <div
      onClick={() => { if (!vlozene) setOtvorene(false); }}
      style={vlozene ? { width: "100%" } : {
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.55)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
      }}
    >
    <div
      onClick={(e) => e.stopPropagation()}
      style={vlozene ? { padding: "6px 2px 4px" } : {
        width: "min(980px, 100%)", maxHeight: "92vh", overflowY: "auto",
        padding: "16px 18px 18px", borderRadius: 14, background: C.surface,
        border: `1px solid ${C.border}`, boxShadow: "0 18px 48px rgba(0,0,0,.5)",
      }}
    >
      {!vlozene && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>SMS pre {meno}</div>
        <button
          onClick={() => setOtvorene(false)}
          aria-label="Zavrieť"
          style={{ background: "none", border: "none", color: C.textDim, fontSize: 16, cursor: "pointer", lineHeight: 1 }}
        >✕</button>
      </div>}
      {telefon !== null && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10, fontSize: 12 }}>
          <span style={{ color: C.textDim }}>Komu:</span>
          <div style={{ width: 230 }}>
            <VyberMena
              hodnota={komu}
              mena={[meno, ...vsetkyKontakty.map((x) => x.klient).filter((m) => m !== meno).sort((a, b) => a.localeCompare(b, "cs")), JINE_PRIJEMCA]}
              onZmen={(v) => { if (v === meno || v === JINE_PRIJEMCA || vsetkyKontakty.some((x) => x.klient === v)) vyberKomu(v); else setKomu(v); }}
              placeholder="komu poslať…"
              style={{ width: "100%", padding: "4px 8px", fontSize: 12 }}
            />
          </div>
          {upravaCisla === null ? (
            <>
              <span style={{ color: cislo ? C.text : C.orange, fontVariantNumeric: "tabular-nums" }}>
                {cislo ? cisloNaUkazku(cislo) : telefon ? `${telefon} — nedá sa poslať` : "bez čísla"}
              </span>
              <button onClick={() => setUpravaCisla(telefon || "")} style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                {telefon ? "upraviť" : "doplniť číslo"}
              </button>
              {druhe && cisloPreBranu(druhe) && (
                <button
                  onClick={() => setTelefon(cisloPreBranu(telefon || "") === cisloPreBranu(druhe) ? hlavne : druhe)}
                  style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                >
                  {cisloPreBranu(telefon || "") === cisloPreBranu(druhe) ? "späť na hlavné číslo" : `druhé číslo: ${cisloNaUkazku(cisloPreBranu(druhe)!)}`}
                </button>
              )}
            </>
          ) : (
            <>
              <input
                autoFocus value={upravaCisla} onChange={(e) => setUpravaCisla(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void ulozCislo(); if (e.key === "Escape") { e.stopPropagation(); setUpravaCisla(null); } }}
                placeholder="+421 944 096 975"
                style={{ width: 150, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, fontFamily: "inherit" }}
              />
              {upravaCisla.trim() && (
                <span style={{ fontSize: 11, color: cisloPreBranu(upravaCisla) ? C.textDim : C.orange }}>
                  {cisloPreBranu(upravaCisla) ? cisloNaUkazku(cisloPreBranu(upravaCisla)!) : "toto nie je číslo"}
                </span>
              )}
              <button onClick={() => void ulozCislo()} disabled={ukladamCislo || !cisloPreBranu(upravaCisla)}
                style={{ ...tlacidlo, border: `1px solid ${C.border}`, background: "transparent", color: C.accentLight }}>
                {ukladamCislo ? "…" : jeJine ? "použiť" : "uložiť aj do profilu"}
              </button>
              {novyCudzi && (
                <button onClick={() => void ulozDruhe()} disabled={ukladamCislo}
                  title={`Číslo nepatrí žiadnemu klientovi. Uloží sa k ${meno} ako druhé — hlavné ostane.`}
                  style={{ ...tlacidlo, border: `1px solid ${C.border}`, background: "transparent", color: C.accentLight }}>
                  {ukladamCislo ? "…" : `uložiť ako druhé číslo — ${meno.split(" ")[0]}`}
                </button>
              )}
              {!jeJine && (
                <button onClick={() => setUpravaCisla(null)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>zrušiť</button>
              )}
            </>
          )}
        </div>
      )}
      {telefon === null ? (
        <div style={{ fontSize: 11.5, color: C.textDim }}>hľadám číslo…</div>
      ) : !telefon ? (
        <div style={{ fontSize: 11.5, color: C.orange }}>
          {jeJine ? "Napíš číslo, na ktoré má správa odísť." : `${komu} nemá v Kokpite telefón — doplň ho vyššie, uloží sa aj do profilu.`}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          {/* Prepínač rodu je preč: od 2. 10. 2026 je znenie jedno pre
              všetky situácie a nie je v ňom ani jedno sloveso v minulom
              čase, takže sa „mal/mala" nemá kde pomýliť. */}
          {odkaz && (
            <div style={{ fontSize: 10.5, color: C.textDim, marginBottom: 5 }}>
              odkaz na tréningy, QR a otázky je v texte
            </div>
          )}
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={3}
            style={{ width: "100%", boxSizing: "border-box", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit", resize: "vertical" }}
          />
          {odvodene && (
            <div style={{ fontSize: 11, color: C.orange, marginTop: 4, lineHeight: 1.5 }}>
              Počet hodín je pri tomto klientovi dopočítaný z názvu členstva, nie z exportu — over ho, kým to odíde.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <button
              onClick={() => void posli()} disabled={bezi || !text.trim() || !cislo || !platnyKomu || upravaCisla !== null}
              style={{ ...tlacidlo, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 12), color: C.accentLight, fontWeight: 600 }}
            >
              {bezi ? "…" : !platnyKomu ? "vyber, komu poslať" : upravaCisla !== null ? "najprv ulož číslo" : cislo ? `Poslať na ${cisloNaUkazku(cislo)}` : "číslo nedáva zmysel — oprav ho vyššie"}
            </button>
            {!vlozene && (
              <button
                onClick={() => setOtvorene(false)}
                style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
              >
                späť
              </button>
            )}
            <span style={{ fontSize: 11, color: kolko.sprav > 1 ? C.orange : C.textDim }}>
              {kolko.znakov} znakov · {kolko.sprav} {kolko.sprav === 1 ? "správa" : kolko.sprav < 5 ? "správy" : "správ"}
              {kolko.unicode ? " (diakritika)" : ""}
            </span>
            {hlaska && <span style={{ fontSize: 11.5, color: C.red }}>{hlaska}</span>}
          </div>
        </div>

        {/* ČO KLIENT UVIDÍ ZA ODKAZOM.
            Živá stránka, nie obrázok — mení sa podľa jeho stavu (QR pri dlhu,
            dochodený balíček, os času). `?nahlad=1` nezdvíha počítadlo
            otvorení, inak by sa z neho nedalo zistiť, či klient klikol. */}
        {nahlad && (
          <div style={{ flex: "0 0 300px", maxWidth: "100%" }}>
            <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: C.textDim, marginBottom: 7 }}>
              Čo uvidí za odkazom
            </div>
            {/* Koľko histórie mu stránka ukáže. Pri klientovi, ktorému sa
                mínus prenáša z balíčka do balíčka, jeden nestačí — z jedného
                sa nedá vyčítať, kam sa hodiny podeli. */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 7, alignItems: "center" }}>
              {[1, 2, 3, 0].map((n) => (
                <button
                  key={n}
                  onClick={() => void zmenRozsah(n)}
                  disabled={rozsahBezi}
                  title={n === 0 ? "celá história od prvého tréningu" : `posledných ${n} balíčkov`}
                  style={{
                    padding: "3px 8px", borderRadius: 7, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                    border: `1px solid ${balickov === n ? mix(C.accent, 55) : C.border}`,
                    background: balickov === n ? mix(C.accent, 14) : "transparent",
                    color: balickov === n ? C.accentLight : C.textDim,
                  }}
                >
                  {n === 0 ? "celá" : `${n} balíček${n > 1 ? "y" : ""}`}
                </button>
              ))}
              {rozsahBezi && <span style={{ fontSize: 10.5, color: C.textDim }}>…</span>}
            </div>
            <div style={{ height: 420, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}`, background: "#232b1c" }}>
              <iframe
                key={verzia}
                src={verzia ? `${nahlad}&v=${verzia}` : nahlad}
                title={`Stránka klienta — ${meno}`}
                style={{ width: 400, height: 560, border: 0, transform: "scale(.75)", transformOrigin: "0 0" }}
              />
            </div>
            <a
              href={nahlad} target="_blank" rel="noreferrer"
              style={{ display: "inline-block", marginTop: 7, fontSize: 11.5, color: C.accentLight }}
            >otvoriť celú stránku ↗</a>
          </div>
        )}
        </div>
      )}
    </div>
    </div>
  );
}
