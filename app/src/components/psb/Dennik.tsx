import { useEffect, useState } from "react";

import { fmtDMY } from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";

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

export type DennikZapis = { id: string; note: string; autor: string; kedy: string };

export function Dennik({ meno, limit = 4, onNovyZapis }: {
  meno: string;
  limit?: number;
  /** Zápis po uložení spracuje Jarvis na pozadí (pripomienky) — vracia
   *  jednu vetu o tom, čo si zapísal, alebo null, keď nič nevyplynulo. */
  onNovyZapis?: (meno: string, text: string) => Promise<string | null>;
}) {
  const [zapisy, setZapisy] = useState<DennikZapis[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [vsetky, setVsetky] = useState(false);
  const [jarvisOznam, setJarvisOznam] = useState("");

  const nacitaj = (m: string) => {
    void fetch(`/api/client-notes?name=${encodeURIComponent(m)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { zapisy?: DennikZapis[] }) => setZapisy(j.zapisy || []))
      .catch(() => {});
  };
  useEffect(() => { setZapisy([]); setText(""); setVsetky(false); nacitaj(meno); }, [meno]);

  const pridaj = () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    void fetch("/api/client-notes", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: meno, note: t }),
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean }) => {
        if (!j.ok) return;
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
      .finally(() => setBusy(false));
  };

  const videne = vsetky ? zapisy : zapisy.slice(0, limit);

  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Nový zápis do denníka — čo sa stalo, ako sa má…"
          rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); pridaj(); } }}
          style={{ flex: 1, minWidth: 0, resize: "vertical", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12.5, lineHeight: 1.5 }}
        />
        <button
          onClick={pridaj} disabled={busy || !text.trim()}
          style={{ alignSelf: "flex-end", padding: "7px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 10), color: C.accentLight, cursor: busy || !text.trim() ? "default" : "pointer", opacity: busy || !text.trim() ? 0.45 : 1, whiteSpace: "nowrap" }}
        >
          Pridať
        </button>
      </div>

      {jarvisOznam && (
        <div style={{ fontSize: 11.5, color: jarvisOznam.endsWith("…") ? C.textDim : C.green, marginTop: 6 }}>
          {jarvisOznam}
        </div>
      )}
      {zapisy.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {videne.map((z) => (
            <div key={z.id} style={{ padding: "6px 0", borderBottom: `1px solid ${mix(C.border, 40)}` }}>
              <div style={{ fontSize: 10.5, color: C.textDim, marginBottom: 2, fontVariantNumeric: "tabular-nums" }}>
                {fmtDMY(z.kedy)} · {z.autor}
              </div>
              <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{z.note}</div>
            </div>
          ))}
          {zapisy.length > limit && (
            <button onClick={() => setVsetky((v) => !v)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 11.5, cursor: "pointer", padding: "6px 0 0" }}>
              {vsetky ? "skryť staršie" : `zobraziť všetky (${zapisy.length})`}
            </button>
          )}
        </div>
      )}
      {zapisy.length === 0 && (
        <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 6 }}>Denník je zatiaľ prázdny — zápisy sa pridávajú a nikdy nemažú.</div>
      )}
    </div>
  );
}
