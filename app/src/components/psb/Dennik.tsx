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

export function Dennik({ meno, limit = 4, onNovyZapis }: {
  meno: string;
  limit?: number;
  /** Zápis po uložení spracuje Jarvis na pozadí (pripomienky) — vracia
   *  jednu vetu o tom, čo si zapísal, alebo null, keď nič nevyplynulo. */
  onNovyZapis?: (meno: string, text: string) => Promise<string | null>;
}) {
  const [historia, setHistoria] = useState<HistoriaRiadok[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [vsetky, setVsetky] = useState(false);
  const [jarvisOznam, setJarvisOznam] = useState("");
  /**
   * Bolesť 0–10 — jediné číslo, ktoré meria to, čo PSB predáva.
   *
   * Je tu, a nie na vlastnej obrazovke, zámerne: zapisuje sa v tej istej
   * chvíli ako veta do denníka, teda hneď po tréningu. Samostatná obrazovka
   * by znamenala ďalšie klikanie a rovnaký osud, aký mal denník — prázdno.
   */
  const [bolest, setBolest] = useState<number | null>(null);
  const [merania, setMerania] = useState<{ datum: string; bolest: number | null }[]>([]);

  const nacitajMerania = (m: string) => {
    void fetch(`/api/merania?name=${encodeURIComponent(m)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { merania?: { datum: string; bolest: number | null }[] }) => setMerania(j.merania || []))
      .catch(() => {});
  };

  const ulozMeranie = async (hodnota: number) => {
    setBolest(hodnota);
    const j = await fetch("/api/merania", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ klient: meno, bolest: hodnota }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));
    if (j.ok) { nacitajMerania(meno); return; }
    // Zvýraznené číslo bez zápisu je presne tá lož, kvôli ktorej Jerry celý
    // večer vypisoval dôvody do prázdna (precoNeprisiel, 13. 8.). Tlačidlo
    // sa vráti a chyba sa povie.
    setBolest(null);
    setChybaMerania(String((j as { error?: string }).error || "Meranie sa nezapísalo — skús znova."));
  };
  const [chybaMerania, setChybaMerania] = useState<string | null>(null);
  const [chybaZapisu, setChybaZapisu] = useState<string | null>(null);

  const nacitaj = (m: string) => {
    void fetch(`/api/client-notes?name=${encodeURIComponent(m)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { historia?: HistoriaRiadok[] }) => setHistoria(j.historia || []))
      .catch(() => {});
  };
  useEffect(() => { setHistoria([]); setText(""); setVsetky(false); setBolest(null); setMerania([]); nacitaj(meno); nacitajMerania(meno); }, [meno]); // eslint-disable-line react-hooks/exhaustive-deps

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
            .then((o) => setJarvisOznam(o || ""))
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

      {/*
        Bolesť 0–10. Jedenásť čísel na klik, žiadne písanie — inak sa to
        nezapíše, presne ako sa nezapisoval denník.
        0 = žiadna bolesť, 10 = najhoršia predstaviteľná; je to bežná
        stupnica z ordinácie, takže ju klient nemusí vysvetľovať.
      */}
      <div style={{ marginTop: 9, display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: C.textMuted, marginRight: 2 }}>Bolesť dnes:</span>
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => { setChybaMerania(null); void ulozMeranie(i); }}
            title={i === 0 ? "žiadna bolesť" : i === 10 ? "najhoršia predstaviteľná" : ""}
            style={{
              width: 24, height: 24, borderRadius: 6, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${bolest === i ? C.accent : C.border}`,
              background: bolest === i ? mix(C.accent, 20) : "transparent",
              color: bolest === i ? C.accentLight : C.textMuted,
            }}
          >
            {i}
          </button>
        ))}
      </div>

      {chybaMerania && (
        <div style={{ fontSize: 11.5, color: C.red, marginTop: 6 }}>{chybaMerania}</div>
      )}

      {merania.length > 0 && (
        <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 6 }}>
          {(() => {
            const sCislom = merania.filter((m) => m.bolest !== null);
            if (!sCislom.length) return null;
            const prve = sCislom[sCislom.length - 1];
            const posledne = sCislom[0];
            if (sCislom.length === 1) return `Prvé meranie ${fmtDMY(prve.datum)}: ${prve.bolest}/10.`;
            const rozdiel = (prve.bolest as number) - (posledne.bolest as number);
            const smer = rozdiel > 0 ? `o ${rozdiel} menej` : rozdiel < 0 ? `o ${-rozdiel} viac` : "bez zmeny";
            return `${fmtDMY(prve.datum)}: ${prve.bolest}/10 → ${fmtDMY(posledne.datum)}: ${posledne.bolest}/10 — ${smer} (${sCislom.length} meraní).`;
          })()}
        </div>
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
