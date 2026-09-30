import { useEffect, useRef, useState } from "react";

import { dlzkaSpravy, rodZMena, textSms } from "../../lib/psb/sms";
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

export function SmsKlientovi({ meno, zostatok = 0, trener = "", predvolenyText, odvodene = false, sMailom = false, dnesnyTrening = false, maly = false }: {
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
  /** Rod klienta — heuristika z mena, prepínač M/Ž ju opraví. */
  const [rod, setRod] = useState<"m" | "z">("m");
  /** Odkaz na /v/<token> — stránka s tréningmi a QR na platbu. */
  const [odkaz, setOdkaz] = useState("");
  const nacitane = useRef(false);

  useEffect(() => {
    if (!otvorene || nacitane.current) return;
    nacitane.current = true;
    setRod(rodZMena(meno));
    void kontakty().then((u) => setTelefon(String(u.find((x) => x.klient === meno)?.telefon || "")));
    // Odkaz sa pýta serveru (token na klienta je jeden); text sa preskladá,
    // keď dorazí — preto je v druhom effecte nižšie.
    if (!predvolenyText) {
      void fetch("/api/sms", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ akcia: "odkaz", klient: meno }),
      }).then((x) => x.json()).then((j: { ok?: boolean; url?: string }) => { if (j?.ok && j.url) setOdkaz(j.url); }).catch(() => null);
    }
  }, [otvorene, meno, predvolenyText]);

  /**
   * Predvolený text sa skladá znova pri zmene rodu aj po príchode odkazu.
   * Prepíše aj rozpísaný text — prepínač rodu je vedomé „presklad mi to";
   * odkaz dorazí do sekundy od otvorenia, skôr než sa dá čokoľvek napísať.
   */
  useEffect(() => {
    if (!otvorene) return;
    setText(predvolenyText || textSms({ oslovenie: meno.split(" ")[0], trener, zostatok, sMailom, dnesnyTrening, rod, odkaz: odkaz || undefined }));
  }, [otvorene, meno, trener, zostatok, sMailom, dnesnyTrening, predvolenyText, rod, odkaz]);

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
  return (
    <div style={{ flexBasis: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, background: mix(C.text, 4), border: `1px solid ${C.border}` }}>
      {telefon === null ? (
        <div style={{ fontSize: 11.5, color: C.textDim }}>hľadám číslo…</div>
      ) : !telefon ? (
        <div style={{ fontSize: 11.5, color: C.orange }}>
          {meno} nemá v Kokpite telefón — doplň ho vo fakturačných údajoch.
        </div>
      ) : (
        <>
          {/* Rod mení „mal si" na „mala si". Heuristika z mena sa mýli
              (Saša, Nikita), preto prepínač — a preskladá celý text. */}
          {!predvolenyText && (
            <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 5 }}>
              {([["m", "on"], ["z", "ona"]] as const).map(([r, l]) => (
                <button
                  key={r}
                  onClick={() => setRod(r)}
                  style={{
                    padding: "2px 9px", borderRadius: 6, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit",
                    border: `1px solid ${rod === r ? mix(C.accent, 55) : C.border}`,
                    background: rod === r ? mix(C.accent, 14) : "transparent",
                    color: rod === r ? C.accentLight : C.textDim, fontWeight: rod === r ? 700 : 400,
                  }}
                >{l}</button>
              ))}
              {odkaz && <span style={{ fontSize: 10.5, color: C.textDim }}>· odkaz na tréningy a platbu je v texte</span>}
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
        </>
      )}
    </div>
  );
}
