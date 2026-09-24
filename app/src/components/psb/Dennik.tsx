import { useEffect, useState } from "react";

import { fmtDMY } from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";
import { enterPosle } from "./ui";

// Denník klienta — príbeh v čase, nie prepisovateľné pole.
//
// Pôvodne bola poznámka jedno políčko: nový zápis znamenal zmazať starý.
// Jerry to odmietol správne — „marec: rameno prestalo bolieť, máj: začal
// behať" nie je smetisko, je to história klienta, ktorá sa inak nedá
// zrekonštruovať. Preto sa sem PRIDÁVA a nikdy nemaže; každý zápis nesie
// dátum a autora (kontá Jerry/Terezka už existujú).
//
// Stála poznámka na karte klienta zostáva — na fakty, ktoré sa nemenia
// (kto za koho platí, na čo si dať pozor). Udalosti patria sem.

/**
 * Riadok histórie klienta — zápis z denníka, poznámka pri zrušení, odpoveď na
 * notifikáciu, záver z debaty s Jarvisom, meranie alebo pole z karty.
 *
 * Jerry, 31. 8. 2026: „mal by existovať jeden veľký register, jedno miesto
 * o jednom klientovi, kde sa zapisuje všetko, čo sa ho týka."
 * Zapisuje sa ďalej tam, kde sa vec stane — zlúčené je čítanie.
 */
export type HistoriaRiadok = { id: string; kedy: string; odkial: string; text: string; autor: string };

/** Odkiaľ zápis prišiel. Farba nesie zdroj, aby sa nemusel čítať štítok. */
const FARBA_ZDROJA: Record<string, string> = {
  "denník": C.green,
  "kalendár": C.blue,
  "notifikácia": C.orange,
  "Jarvis": C.accentLight,
  "meranie": C.bark,
  "karta klienta": C.textMuted,
};

export function Dennik({ meno, limit = 4, onNovyZapis, obnovKluc = 0 }: {
  meno: string;
  limit?: number;
  /**
   * Zmena tohto čísla načíta denník znova.
   *
   * Prepis stálej poznámky odkladá jej starú verziu do denníka (rieši to
   * server), lenže denník sa načítaval len pri zmene mena — takže riadok
   * „Stála poznámka predtým: …" sa v otvorenom okne neobjavil (kontrola
   * 24. 9. 2026). Kto poznámku prepíše, zvýši toto číslo.
   */
  obnovKluc?: number;
  /** Zápis po uložení spracuje Jarvis na pozadí (pripomienky) — vracia
   *  jednu vetu o tom, čo si zapísal, alebo null, keď nič nevyplynulo. */
  onNovyZapis?: (meno: string, text: string) => Promise<string | null>;
}) {
  const [historia, setHistoria] = useState<HistoriaRiadok[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [vsetky, setVsetky] = useState(false);
  const [jarvisOznam, setJarvisOznam] = useState("");
  const [chybaZapisu, setChybaZapisu] = useState<string | null>(null);

  const nacitaj = (m: string) => {
    void fetch(`/api/client-notes?name=${encodeURIComponent(m)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { historia?: HistoriaRiadok[] }) => setHistoria(j.historia || []))
      .catch(() => {});
  };
  useEffect(() => { setHistoria([]); setText(""); setVsetky(false); nacitaj(meno); }, [meno]); // eslint-disable-line react-hooks/exhaustive-deps

  const pridaj = () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setChybaZapisu(null);
    void fetch("/api/client-notes", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: meno, note: t }),
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string }) => {
        // Ticho zlyhávajúci zápis je horší než hlasitá chyba: do 19. 8. 2026
        // sa pri ok:false (typicky vypršaná relácia) nič nepovedalo — tlačidlo
        // sa odblokovalo, text zostal v poli a vyzeralo to ako uložené.
        // Merania o pár riadkov vyššie to mali správne, zápis nie.
        if (!j.ok) { setChybaZapisu(String(j.error || "Zápis sa neuložil — skús znova (možno vypršalo prihlásenie).")); return; }
        setText("");
        nacitaj(meno);
        // Jarvis číta zápis na pozadí — „Dan ide na operáciu, o 2 týždne sa
        // ozvať" sa nemusí písať druhýkrát do chatu. Ukladanie zápisu na
        // odpovedi modelu NEZÁVISÍ: zápis už je v denníku, toto je nadstavba.
        if (onNovyZapis) {
          setJarvisOznam("Jarvis číta zápis…");
          void onNovyZapis(meno, t)
            .then((o) => {
              setJarvisOznam(o || "");
              // Jarvisov záver sa uloží až TERAZ — os času sa načítala pred
              // ním, takže riadok „Jarvis: …" v nej chýbal až do zavretia
              // a otvorenia karty (kontrola 24. 9. 2026).
              if (o) nacitaj(meno);
            })
            .catch(() => setJarvisOznam(""));
        }
      })
      .catch(() => setChybaZapisu("Zápis sa neuložil — server neodpovedal."))
      .finally(() => setBusy(false));
  };

  const videne = vsetky ? historia : historia.slice(0, limit);

  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Nový zápis do denníka — čo sa stalo, ako sa má…"
          rows={2}
          onKeyDown={enterPosle(pridaj)}
          style={{ flex: 1, minWidth: 0, resize: "vertical", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5, lineHeight: 1.5 }}
        />
        <button
          onClick={pridaj} disabled={busy || !text.trim()}
          style={{ alignSelf: "flex-end", padding: "7px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 10), color: C.accentLight, cursor: busy || !text.trim() ? "default" : "pointer", opacity: busy || !text.trim() ? 0.45 : 1, whiteSpace: "nowrap" }}
        >
          Pridať
        </button>
      </div>
      {chybaZapisu && (
        <div style={{ fontSize: 11.5, color: C.red, marginTop: 6 }}>{chybaZapisu}</div>
      )}

      {jarvisOznam && (
        <div style={{ fontSize: 11.5, color: jarvisOznam.endsWith("…") ? C.textDim : C.green, marginTop: 6 }}>
          {jarvisOznam}
        </div>
      )}
      {historia.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {videne.map((z) => (
            <div key={z.id} style={{ padding: "6px 0", borderBottom: `1px solid ${mix(C.border, 40)}` }}>
              <div style={{ fontSize: 10.5, color: C.textDim, marginBottom: 2, fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 6 }}>
                <span>{fmtDMY(z.kedy)}</span>
                {/* Štítok zdroja. Bez neho by odpoveď na notifikáciu a zápis
                    z denníka vyzerali rovnako — a Jerry by nevedel, či si to
                    napísal sám, alebo to appka len zachytila pri zrušení. */}
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: FARBA_ZDROJA[z.odkial] || C.textDim, background: mix(FARBA_ZDROJA[z.odkial] || C.textDim, 14), padding: "1px 5px", borderRadius: 5 }}>
                  {z.odkial}
                </span>
                {z.autor && <span>· {z.autor}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{z.text}</div>
            </div>
          ))}
          {historia.length > limit && (
            <button onClick={() => setVsetky((v) => !v)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer", padding: "6px 0 0" }}>
              {vsetky ? "skryť staršie" : `zobraziť všetko (${historia.length})`}
            </button>
          )}
        </div>
      )}
      {historia.length === 0 && (
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6 }}>Zatiaľ nič — zápisy sa pridávajú a nikdy nemažú.</div>
      )}
    </div>
  );
}
