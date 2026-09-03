import { useEffect, useState } from "react";

import { C, mix } from "../../lib/psb/theme";

// Zapnutie notifikácií na telefón.
//
// Jerry, 31. 8. 2026: „ak stačí spraviť 1 a vyskakovacie notifikácie aj bez
// app, je to skvelé." Stačí — od iOS 16.4 chodí web push aj do PWA. Má to
// ale jednu podmienku, ktorú nemožno obísť a ktorá sa nedá vysvetliť inak než
// nahlas: **iPhone doručí push LEN do appky pridanej na plochu.** V Safari
// otvorenej stránke sa tlačidlo ani neukáže — inak by ho človek stlačil,
// povolil notifikácie a čakal na niečo, čo nikdy nepríde.
//
// Preto tento komponent nemá dva stavy (zapnuté/vypnuté), ale štyri, a v tom
// nepoužiteľnom hovorí, ČO SA S TÝM DÁ UROBIŤ.

type Stav = "zistujem" | "nepodporovane" | "trebaNaPlochu" | "vypnute" | "zapnute";

const jeIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Beží appka z plochy (standalone), alebo v karte prehliadača? */
const zPlochy = () => window.matchMedia("(display-mode: standalone)").matches
  || (navigator as unknown as { standalone?: boolean }).standalone === true;

const b64uNaBajty = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

export function PushOdber() {
  const [stav, setStav] = useState<Stav>("zistujem");
  const [mojich, setMojich] = useState(0);
  const [hlaska, setHlaska] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // Na iPhone to znamená jedno jediné: appka nie je na ploche. Safari
        // tam PushManager v obyčajnej karte vôbec nevystaví.
        setStav(jeIOS() && !zPlochy() ? "trebaNaPlochu" : "nepodporovane");
        return;
      }
      if (jeIOS() && !zPlochy()) { setStav("trebaNaPlochu"); return; }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const odber = await reg.pushManager.getSubscription();
        const j = await fetch("/api/push", { credentials: "same-origin" }).then((r) => r.json());
        setMojich(j.mojich || 0);
        setStav(odber && j.mojich ? "zapnute" : "vypnute");
      } catch (e) {
        setStav("nepodporovane");
        setHlaska(String(e).slice(0, 120));
      }
    })();
  }, []);

  const zapni = async () => {
    setBusy(true); setHlaska("");
    try {
      // Povolenie sa MUSÍ pýtať z kliknutia. Zavolané pri načítaní stránky ho
      // Safari aj Chrome ticho zamietnu a stav zostane „default".
      const povolenie = await Notification.requestPermission();
      if (povolenie !== "granted") {
        setHlaska(povolenie === "denied"
          ? "Notifikácie sú zakázané — povoľ ich v Nastavenia → Kokpit → Oznámenia."
          : "Bez povolenia sa poslať nedá.");
        setBusy(false); return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const j = await fetch("/api/push", { credentials: "same-origin" }).then((r) => r.json());
      if (!j.verejnyKluc) { setHlaska("Na serveri chýba VAPID kľúč."); setBusy(false); return; }

      const odber = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64uNaBajty(j.verejnyKluc) as BufferSource,
      });
      const ulozene = await fetch("/api/push", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: odber.toJSON(), zariadenie: navigator.userAgent.slice(0, 120) }),
      }).then((r) => r.json());

      // Tichý neúspech je tu obzvlášť zlý: odber by v prehliadači existoval,
      // na serveri nie, a človek by čakal na notifikácie navždy.
      if (!ulozene.ok) { setHlaska("Odber sa nepodarilo uložiť — skús znova."); setBusy(false); return; }
      setStav("zapnute"); setMojich((n) => n + 1); setHlaska("Zapnuté. Pošli si skúšku.");
    } catch (e) {
      setHlaska(String(e).slice(0, 140));
    }
    setBusy(false);
  };

  const skuska = async () => {
    setBusy(true); setHlaska("posielam…");
    const j = await fetch("/api/push", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ test: true }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));
    setHlaska(j.ok ? "Odoslané — mala by prísť do pár sekúnd."
      : j.error === "ziadne_odbery" ? "Toto zariadenie nie je prihlásené."
      : `Neprešlo to: ${j.vysledky?.[0]?.chyba || j.error || "neznáma chyba"}`);
    setBusy(false);
  };

  const vypni = async () => {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const odber = await reg?.pushManager.getSubscription();
    if (odber) {
      await fetch(`/api/push?endpoint=${encodeURIComponent(odber.endpoint)}`, { method: "DELETE", credentials: "same-origin" });
      await odber.unsubscribe();
    }
    setStav("vypnute"); setMojich(0); setHlaska(""); setBusy(false);
  };

  if (stav === "zistujem") return null;

  const styl = { background: "none", border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 12, cursor: busy ? "wait" : "pointer", color: C.textMuted } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {stav === "nepodporovane" && (
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>
          Tento prehliadač notifikácie nevie. Funguje Safari na iPhone (appka pridaná na plochu),
          Chrome a Safari na Macu.{hlaska && ` — ${hlaska}`}
        </div>
      )}

      {/* Toto NIE JE chyba a nesmie tak vyzerať. iPhone doručuje push len do
          appky na ploche, takže jediné, čo tu chýba, sú dva klepy — a tie sa
          dajú napísať presne. */}
      {stav === "trebaNaPlochu" && (
        <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }}>
          <div style={{ marginBottom: 4 }}>
            Aby notifikácie chodili na iPhone, musí byť Kokpit <b style={{ color: C.text }}>pridaný na plochu</b> —
            v Safari otvorenej stránke ich Apple nedoručí vôbec.
          </div>
          <div style={{ color: C.textDim }}>
            1. Safari → <b style={{ color: C.textMuted }}>Zdieľať</b> → <b style={{ color: C.textMuted }}>Pridať na plochu</b><br />
            2. Spusti Kokpit z ikony na ploche<br />
            3. Vráť sa sem a klikni na Zapnúť notifikácie
          </div>
        </div>
      )}

      {stav === "vypnute" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => void zapni()} disabled={busy} style={{ ...styl, borderColor: mix(C.accent, 50), color: C.accentLight }}>
            Zapnúť notifikácie
          </button>
          <span style={{ fontSize: 11.5, color: C.textDim }}>Platí pre toto zariadenie — na telefóne aj notebooku sa zapína zvlášť.</span>
        </div>
      )}

      {stav === "zapnute" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: C.green, fontWeight: 600 }}>Zapnuté</span>
          <span style={{ fontSize: 11.5, color: C.textDim }}>
            prihlásené zariadenia: {mojich || 1}
          </span>
          <button onClick={() => void skuska()} disabled={busy} style={styl}>Poslať skúšku</button>
          <button onClick={() => void vypni()} disabled={busy} style={styl}>Vypnúť</button>
        </div>
      )}

      {hlaska && stav !== "nepodporovane" && (
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: /Zapnuté|Odoslané/.test(hlaska) ? C.green : C.orange }}>{hlaska}</div>
      )}
    </div>
  );
}
