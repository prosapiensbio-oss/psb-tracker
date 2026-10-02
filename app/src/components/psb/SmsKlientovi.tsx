import { useEffect, useRef, useState } from "react";

import { dlzkaSpravy, textSms } from "../../lib/psb/sms";
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

type Kontakt = { klient: string; telefon?: string };

/** Telefóny sa ťahajú raz za načítanie obrazovky, nie pri každom riadku. */
let cacheKontaktov: Promise<Kontakt[]> | null = null;
const kontakty = () => {
  cacheKontaktov ??= fetch("/api/vydane-faktury", { credentials: "same-origin" })
    .then((r) => r.json())
    .then((j) => (j?.udaje || []) as Kontakt[])
    .catch(() => [] as Kontakt[]);
  return cacheKontaktov;
};

export function SmsKlientovi({ meno, zostatok = 0, trener = "", predvolenyText, platba, datum, odvodene = false, sMailom = false, dnesnyTrening = false, maly = false }: {
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
}) {
  const [otvorene, setOtvorene] = useState(false);
  const [telefon, setTelefon] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [bezi, setBezi] = useState(false);
  const [hlaska, setHlaska] = useState("");
  const [hotovo, setHotovo] = useState(false);
  /** Odkaz na /v/<token> — stránka s tréningmi a QR na platbu. */
  const [odkaz, setOdkaz] = useState("");
  /** Tá istá stránka pre náhľad: priamo z workera a bez počítadla otvorení. */
  const [nahlad, setNahlad] = useState("");
  const nacitane = useRef(false);

  useEffect(() => {
    if (!otvorene || nacitane.current) return;
    nacitane.current = true;
    void kontakty().then((u) => setTelefon(String(u.find((x) => x.klient === meno)?.telefon || "")));
    // Odkaz sa pýta serveru (token na klienta je jeden); text sa preskladá,
    // keď dorazí — preto je v druhom effecte nižšie.
    if (!predvolenyText) {
      void fetch("/api/sms", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "odkaz", klient: meno }),
      }).then((x) => x.json()).then((j: { ok?: boolean; url?: string; nahlad?: string }) => {
        if (j?.ok && j.url) setOdkaz(j.url);
        if (j?.nahlad) setNahlad(j.nahlad);
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
          sQr: !!platba || zostatok <= 0,
        }),
    );
    // Závislosťou sú HODNOTY, nie objekt `platba`: nový literál pri každom
    // prekreslení rodiča by text preskladal aj uprostred písania.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otvorene, meno, trener, sMailom, predvolenyText, platba, zostatok, datum, odkaz]);

  const posli = async () => {
    setBezi(true); setHlaska("");
    const r = await fetch("/api/sms", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ klient: meno, telefon, text }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setBezi(false);
    if (r?.ok) { setHotovo(true); setHlaska("odoslané"); return; }
    setHlaska(r?.error || "nepodarilo sa");
  };

  /**
   * Esc zavrie okno. Hook stojí NAD skorými návratmi — pod nimi by sa pri
   * zatvorenom okne nezavolal a React by spadol na zmenenom poradí hookov
   * (viď eslint.hooks.config.js).
   */
  useEffect(() => {
    if (!otvorene) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setOtvorene(false); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [otvorene]);

  const tlacidlo = {
    padding: maly ? "3px 8px" : "6px 12px", borderRadius: maly ? 7 : 8,
    fontSize: maly ? 11 : 12.5, cursor: "pointer", fontFamily: "inherit",
  } as const;

  if (hotovo) return <span style={{ fontSize: maly ? 11 : 12, color: C.green, flexShrink: 0 }}>SMS odoslaná</span>;

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
      onClick={() => setOtvorene(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.55)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
      }}
    >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "min(980px, 100%)", maxHeight: "92vh", overflowY: "auto",
        padding: "16px 18px 18px", borderRadius: 14, background: C.surface,
        border: `1px solid ${C.border}`, boxShadow: "0 18px 48px rgba(0,0,0,.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>SMS pre {meno}</div>
        <button
          onClick={() => setOtvorene(false)}
          aria-label="Zavrieť"
          style={{ background: "none", border: "none", color: C.textDim, fontSize: 16, cursor: "pointer", lineHeight: 1 }}
        >✕</button>
      </div>
      {telefon === null ? (
        <div style={{ fontSize: 11.5, color: C.textDim }}>hľadám číslo…</div>
      ) : !telefon ? (
        <div style={{ fontSize: 11.5, color: C.orange }}>
          {meno} nemá v Kokpite telefón — doplň ho vo fakturačných údajoch.
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
              onClick={() => void posli()} disabled={bezi || !text.trim()}
              style={{ ...tlacidlo, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 12), color: C.accentLight, fontWeight: 600 }}
            >
              {bezi ? "…" : `Poslať na ${telefon}`}
            </button>
            <button
              onClick={() => setOtvorene(false)}
              style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
            >
              späť
            </button>
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
            <div style={{ height: 420, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}`, background: "#232b1c" }}>
              <iframe
                src={nahlad}
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
