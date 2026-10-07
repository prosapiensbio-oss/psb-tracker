import { useCallback, useEffect, useState } from "react";

import { doSchranky } from "../../lib/psb/kopirovanie";
import { TRENERI } from "../../lib/psb/mailFaktury";
import { C, mix } from "../../lib/psb/theme";
import { SmsKlientovi } from "./SmsKlientovi";

/**
 * KALENDÁR V MOBILE — dlaždica v profile klienta (náčrt A1, Jerry 7. 10. 2026).
 *
 * Jedným klikom SMS s odkazom na `/k/<token>`; potom už len stav. Stav
 * hovorí telefón sám: kalendár si pravidelne sťahuje, takže Kokpit vie,
 * kedy naposledy a čím (iPhone, Google Kalendár…). Klient vidí LEN svoje
 * tréningy — kalendár trénera sa nezdieľa.
 */
type Odkaz = { token: string; url: string; createdAt: string; posledne: string | null; pocet: number; platforma: string | null; odobera: boolean };

const dm = (iso: string) => { const d = new Date(iso); return `${d.getDate()}. ${d.getMonth() + 1}.`; };
const predKolko = (iso: string) => {
  const h = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 3600000));
  return h < 1 ? "pred chvíľou" : h < 48 ? `pred ${h} h` : `pred ${Math.round(h / 24)} dňami`;
};

export function KalendarVMobile({ meno, trener }: { meno: string; trener: string }) {
  const [odkaz, setOdkaz] = useState<Odkaz | null | undefined>(undefined);
  const [sms, setSms] = useState<string | null>(null);
  const [hlaska, setHlaska] = useState("");
  const [bezi, setBezi] = useState(false);

  const nacitaj = useCallback(async () => {
    const j = await fetch(`/api/kalendar-mobil?klient=${encodeURIComponent(meno)}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json()).catch(() => null);
    setOdkaz(j?.ok ? j.odkaz : null);
  }, [meno]);
  useEffect(() => { setSms(null); setHlaska(""); setOdkaz(undefined); void nacitaj(); }, [nacitaj]);

  const vyrob = async (akcia: "odkaz" | "novy") => {
    setBezi(true); setHlaska("");
    const j = await fetch("/api/kalendar-mobil", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia, klient: meno }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
    setBezi(false);
    if (!j?.ok) { setHlaska(j?.error || "Odkaz sa nevyrobil."); return null; }
    await nacitaj();
    return j.url as string;
  };
  const posliSms = async () => {
    const url = odkaz?.url || (await vyrob("odkaz"));
    if (!url) return;
    const krstne = meno.trim().split(/\s+/)[0] || "";
    const podpis = (TRENERI[trener] || TRENERI.Jerry).krstne;
    setSms(`${krstne ? `${krstne}, v` : "V"}aše tréninky si můžete dát do kalendáře v mobilu — připomene vám je sám: ${url} ${podpis}`);
  };
  const kopiruj = async () => {
    const url = odkaz?.url || (await vyrob("odkaz"));
    if (!url) return;
    setHlaska((await doSchranky(url)) ? "odkaz skopírovaný" : "skopíruj ručne: " + url);
  };
  const novy = async () => {
    if (!window.confirm("Vyrobiť nový odkaz? Starý prestane platiť a klientovi z kalendára zmiznú tréningy, kým si nepridá nový.")) return;
    if (await vyrob("novy")) setHlaska("nový odkaz je hotový — pošli ho klientovi");
  };

  if (odkaz === undefined) return null;
  const stav = !odkaz
    ? { text: "neodoberá", farba: C.textDim, veta: "" }
    : odkaz.odobera
      ? { text: "● odoberá", farba: C.green, veta: `od ${dm(odkaz.createdAt)}${odkaz.platforma ? ` · ${odkaz.platforma}` : ""}${odkaz.posledne ? ` · obnovené ${predKolko(odkaz.posledne)}` : ""}` }
      : odkaz.pocet > 0 && odkaz.posledne
        ? { text: "prestal odoberať?", farba: C.orange, veta: `naposledy ${predKolko(odkaz.posledne)}${odkaz.platforma ? ` · ${odkaz.platforma}` : ""}` }
        : { text: "poslané", farba: C.accentLight, veta: `odkaz z ${dm(odkaz.createdAt)} · ešte si ho nepridal` };
  const maly = { padding: "4px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontFamily: "inherit", fontSize: 11.5, cursor: "pointer" } as const;

  return (
    <div style={{
      padding: 9, borderRadius: 10, fontSize: 12,
      border: `1px solid ${odkaz?.odobera ? mix(C.green, 55) : mix(C.border, 110)}`,
      background: odkaz?.odobera ? mix(C.green, 7) : "transparent",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12.5 }}>📅 Kalendár v mobile</b>
        <span style={{ fontSize: 11, fontWeight: 700, color: stav.farba }}>{stav.text}</span>
      </div>
      {stav.veta && <div style={{ color: C.textDim, marginTop: 3, lineHeight: 1.45 }}>{stav.veta}</div>}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
        <button type="button" disabled={bezi} onClick={() => void posliSms()} style={{ ...maly, borderColor: C.accent, color: C.accentLight, background: mix(C.accent, 12), fontWeight: 600 }}>
          {odkaz ? "poslať znova SMS" : "Poslať odkaz SMS"}
        </button>
        <button type="button" disabled={bezi} onClick={() => void kopiruj()} style={maly}>kopírovať</button>
        {odkaz && <button type="button" disabled={bezi} onClick={() => void novy()} style={maly} title="Starý odkaz prestane platiť">nový odkaz</button>}
      </div>
      {hlaska && <div style={{ marginTop: 6, color: C.textMuted }}>{hlaska}</div>}
      {sms && (
        <div style={{ marginTop: 8 }}>
          <SmsKlientovi meno={meno} trener={trener} vlozene druhAuditu="kalendar" predvolenyText={sms} onOdoslane={() => { setSms(null); setHlaska("SMS odišla"); }} />
        </div>
      )}
      {!odkaz && !sms && <div style={{ color: C.textDim, marginTop: 6, lineHeight: 1.45 }}>Klient si pridá do mobilu len svoje tréningy — telefón ho na ne upozorní sám. Tvoj kalendár nevidí.</div>}
    </div>
  );
}
