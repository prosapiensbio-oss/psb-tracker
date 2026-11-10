import { useCallback, useEffect, useMemo, useState } from "react";

import { deriveSixM, type ClientAgg } from "../../lib/psb/compute";
import { normName } from "../../lib/psb/format";
import { doSchranky } from "../../lib/psb/kopirovanie";
import { textSmsZmluvy } from "../../lib/psb/smsSablony";
import { C, mix } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { PodpisPlatno } from "./PodpisPlatno";
import { SmsKlientovi } from "./SmsKlientovi";

/**
 * ZMLUVY 6M — kartotéka vo Workspace (Jerry, 10. 11. 2026: „možnosť
 * v Kokpite podobne ako sú anamnézy, ale boli by zmluvy pre 6M proces").
 *
 * Postup ako v DocuSeal: tréner podpíše (prstom alebo perom), vznikne odkaz,
 * odíde klientovi SMS-kou (alebo ho klient podpíše rovno na iPade v štúdiu).
 * Podpísaná zmluva zapne klientovi „zmluva podpísaná“ a príde notifikácia.
 *
 * Kto do zoznamu „Bez zmluvy“ patrí, hovorí 6M proces (`deriveSixM`) —
 * tá istá vec, z ktorej žije pripomienka „nemá podpísanú zmluvu“.
 */

type Zmluva = {
  id: string; klient: string; token: string; stav: "caka" | "podpisana" | "zrusena"; verzia: string;
  autor: string | null; vytvorene: string; otvorene: string | null; podpisane: string | null; zrusene: string | null; odkaz: string;
  zdroj?: string; email?: string | null;
};

const den = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()}. ${d.getMonth() + 1}.`;
};

const tl = { padding: "5px 11px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted } as const;

function Nadpis({ children, pocet }: { children: string; pocet: number }) {
  return (
    <div style={{ marginTop: 16, marginBottom: 2, fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase", color: C.textDim, fontWeight: 700 }}>
      {children} <span style={{ fontWeight: 400 }}>· {pocet}</span>
    </div>
  );
}

export function ZmluvyKarta({ data, clients, mena }: { data: PSBData; clients: Record<string, ClientAgg>; mena: string[] }) {
  const [zmluvy, setZmluvy] = useState<Zmluva[] | null>(null);
  const [chyba, setChyba] = useState("");
  const [hlaska, setHlaska] = useState("");
  /** Klient, ktorému sa práve pripravuje zmluva (podpis poskytovateľa). */
  const [pripravujem, setPripravujem] = useState("");
  const [podpis, setPodpis] = useState<string | null>(null);
  const [minuly, setMinuly] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [sms, setSms] = useState<{ klient: string; url: string } | null>(null);
  const [hladanie, setHladanie] = useState("");
  const [nova, setNova] = useState(false);
  const [archiv, setArchiv] = useState(false);
  /** Okno „Poslať mailom“ — id zmluvy a adresa v políčku. */
  const [mail, setMail] = useState<{ id: string; komu: string; posielam?: boolean } | null>(null);

  const nacitaj = useCallback(async () => {
    const r = await fetch("/api/zmluvy", { credentials: "same-origin", cache: "no-store" }).then((x) => x.json()).catch(() => null) as { ok?: boolean; zmluvy?: Zmluva[]; error?: string } | null;
    if (!r?.ok) { setChyba(r?.error || "Zmluvy sa nepodarilo načítať."); return; }
    setChyba("");
    setZmluvy(r.zmluvy || []);
  }, []);

  useEffect(() => {
    void nacitaj();
    // Klient podpisuje inde — po návrate do okna nech je stav čerstvý.
    const naFokus = () => { if (document.visibilityState === "visible") void nacitaj(); };
    document.addEventListener("visibilitychange", naFokus);
    return () => document.removeEventListener("visibilitychange", naFokus);
  }, [nacitaj]);

  const sixM = useMemo(() => deriveSixM(data, clients), [data, clients]);
  const caka = (zmluvy || []).filter((z) => z.stav === "caka");
  const podpisane = (zmluvy || []).filter((z) => z.stav === "podpisana");
  const maOtvorenu = new Set(caka.map((z) => normName(z.klient)));
  const maPodpisanu = new Set(podpisane.map((z) => normName(z.klient)));
  const bezZmluvy = sixM
    .filter((r) => !r.contractSigned && !maOtvorenu.has(normName(r.client)) && !maPodpisanu.has(normName(r.client)))
    .map((r) => ({ klient: r.client, trener: r.primaryTrainer || "" }));
  const trenerKlienta = (m: string) => clients[m]?.primaryTrainer || "";

  const zacni = async (klient: string) => {
    setPripravujem(klient); setPodpis(null); setMinuly(null); setNova(false); setHladanie("");
    const r = await fetch("/api/zmluvy?mojPodpis=1", { credentials: "same-origin", cache: "no-store" }).then((x) => x.json()).catch(() => null) as { podpis?: string | null } | null;
    setMinuly(r?.podpis || null);
  };

  const vytvor = async () => {
    if (!pripravujem || !podpis) return;
    setUkladam(true); setChyba("");
    const r = await fetch("/api/zmluvy", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "vytvor", klient: pripravujem, podpis }),
    }).then((x) => x.json()).catch(() => null) as { ok?: boolean; odkaz?: string; error?: string } | null;
    setUkladam(false);
    if (!r?.ok || !r.odkaz) { setChyba(r?.error || "Zmluvu sa nepodarilo vytvoriť."); return; }
    const klient = pripravujem;
    setPripravujem(""); setPodpis(null);
    setSms({ klient, url: r.odkaz });
    setHlaska(`Zmluva pre ${klient} je pripravená — pošli odkaz alebo ju nechaj podpísať tu.`);
    await nacitaj();
  };

  const zrus = async (z: Zmluva) => {
    if (!window.confirm(`Zrušiť nepodpísanú zmluvu pre ${z.klient}? Odkaz prestane platiť.`)) return;
    const r = await fetch("/api/zmluvy", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "zrus", id: z.id }),
    }).then((x) => x.json()).catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!r?.ok) { setChyba(r?.error || "Zrušenie zlyhalo."); return; }
    await nacitaj();
  };

  const kopiruj = async (url: string, klient: string) => {
    const ok = await doSchranky(url);
    setChyba(ok ? "" : "Skopíruj odkaz ručne — schránka odmietla.");
    if (ok) { setHlaska(`Odkaz pre ${klient} je v schránke.`); setTimeout(() => setHlaska(""), 2500); }
  };

  // ── Príprava: podpis poskytovateľa ─────────────────────────────────────────
  if (pripravujem) {
    return (
      <div>
        <button onClick={() => setPripravujem("")} style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>← späť</button>
        <div style={{ fontSize: 15, fontWeight: 700, margin: "8px 0 4px" }}>Zmluva 6M pre {pripravujem}</div>
        <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.55, marginBottom: 10 }}>
          Najprv podpis za ProSapiens. Potom vznikne odkaz: klient si prečíta podmienky, odklikne šesť pravidiel, doplní dátum a podpíše sa.
        </div>
        <PodpisPlatno onZmena={setPodpis} predvolba={null} />
        {minuly && <MinulyPodpis png={minuly} onPouzi={setPodpis} />}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button
            onClick={() => void vytvor()}
            disabled={!podpis || ukladam}
            style={{ ...tl, padding: "9px 16px", fontSize: 13, fontWeight: 600, borderColor: mix(C.green, 50), color: podpis ? C.green : C.textDim, cursor: podpis && !ukladam ? "pointer" : "not-allowed" }}
          >{ukladam ? "Ukladám…" : "Podpísať a vytvoriť odkaz"}</button>
        </div>
        {chyba && <div style={{ color: C.red, fontSize: 12.5, marginTop: 8 }}>{chyba}</div>}
      </div>
    );
  }

  const riadok = (z: Zmluva) => {
    const otvorena = sms?.klient === z.klient && z.stav === "caka";
    return (
      <div key={z.id} style={{ padding: "10px 0", borderBottom: `1px solid ${mix(C.border, 45)}` }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <b style={{ fontSize: 14 }}>{z.klient}</b>
          {trenerKlienta(z.klient) && <span style={{ fontSize: 11.5, color: C.textDim }}>· {trenerKlienta(z.klient)}</span>}
          <div style={{ flexGrow: 1 }} />
          <span style={{ fontSize: 11.5, color: z.stav === "podpisana" ? C.green : z.otvorene ? C.accentLight : C.textMuted }}>
            {z.stav === "podpisana" ? `podpísaná ${den(z.podpisane)}` : z.otvorene ? `otvoril(a) ${den(z.otvorene)}, nepodpísal(a)` : `pripravená ${den(z.vytvorene)}, zatiaľ neotvorená`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 7, marginTop: 7, flexWrap: "wrap" }}>
          {z.stav === "caka" ? (
            <>
              <button onClick={() => setSms(otvorena ? null : { klient: z.klient, url: z.odkaz })} style={{ ...tl, borderColor: mix(C.accent, 45), color: C.accentLight }}>{otvorena ? "Zavrieť SMS" : "Poslať SMS"}</button>
              <button onClick={() => setMail(mail?.id === z.id ? null : { id: z.id, komu: z.email || "" })} style={{ ...tl, borderColor: mix(C.accent, 45), color: C.accentLight }} title="Celé znenie v maili, aby si ho klient prečítal ešte pred podpisom">{mail?.id === z.id ? "Zavrieť mail" : "Poslať mailom"}</button>
              <button onClick={() => void kopiruj(z.odkaz, z.klient)} style={{ ...tl, borderColor: mix(C.green, 45), color: C.green }}>Kopírovať odkaz</button>
              <a href={z.odkaz} target="_blank" rel="noreferrer" style={{ ...tl, textDecoration: "none" }} title="Otvorí zmluvu na podpis — klient ju podpíše rovno na tomto zariadení">Podpísať tu (iPad)</a>
              <a href={`${z.odkaz}?nahlad=1`} target="_blank" rel="noreferrer" style={{ ...tl, textDecoration: "none" }}>Náhľad</a>
              <button onClick={() => void zrus(z)} style={tl}>Zrušiť</button>
            </>
          ) : (
            <a href={z.odkaz} target="_blank" rel="noreferrer" style={{ ...tl, textDecoration: "none" }}>{z.zdroj === "docuseal" ? "Otvoriť PDF (DocuSeal)" : "Otvoriť podpísanú"}</a>
          )}
        </div>
        {mail?.id === z.id && z.stav === "caka" && (
          <div style={{ marginTop: 8, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={mail.komu} onChange={(e) => setMail({ ...mail, komu: e.target.value })} placeholder="e-mail klienta" type="email"
              autoComplete="off" spellCheck={false}
              style={{ flex: "1 1 220px", padding: "7px 10px", borderRadius: 8, fontSize: 13, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit" }}
            />
            <button
              disabled={!mail.komu.trim() || mail.posielam}
              onClick={() => void (async () => {
                setMail({ ...mail, posielam: true }); setChyba("");
                const r = await fetch("/api/zmluvy", {
                  method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
                  body: JSON.stringify({ akcia: "mail", id: z.id, komu: mail.komu }),
                }).then((x) => x.json()).catch(() => null) as { ok?: boolean; error?: string } | null;
                if (!r?.ok) { setMail({ ...mail, posielam: false }); setChyba(r?.error || "Mail neodišiel."); return; }
                setMail(null); setHlaska(`Zmluva odišla mailom na ${mail.komu.trim()}.`);
              })()}
              style={{ ...tl, borderColor: mix(C.green, 45), color: C.green, fontWeight: 600 }}
            >{mail.posielam ? "Posielam…" : "Odoslať zmluvu"}</button>
            <div style={{ flexBasis: "100%", fontSize: 11.5, color: C.textDim }}>V maili je celé znenie podmienok a tlačidlo „Přečíst a podepsat“ na ten istý odkaz.</div>
          </div>
        )}
        {otvorena && (
          <div style={{ marginTop: 8 }}>
            <SmsKlientovi
              meno={z.klient}
              trener={trenerKlienta(z.klient)}
              vlozene
              druhAuditu="zmluva"
              predvolenyText={textSmsZmluvy(z.klient, z.odkaz)}
              nahladOdkazu={z.odkaz}
              onOdoslane={() => { setSms(null); setHlaska(`SMS so zmluvou pre ${z.klient} odišla.`); }}
            />
          </div>
        )}
      </div>
    );
  };

  const najdene = mena.filter((m) => hladanie && normName(m).includes(normName(hladanie))).slice(0, 10);

  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.55 }}>
        Podmienky spolupráce 6M na podpis. Ty podpíšeš prvý, klient odklikne pravidlá a podpíše sa prstom. Podpísaná zmluva sa priradí k profilu.
      </div>
      {hlaska && <div style={{ color: C.green, fontSize: 12.5, marginTop: 8 }}>{hlaska}</div>}
      {chyba && <div style={{ color: C.red, fontSize: 12.5, marginTop: 8 }}>{chyba}</div>}

      <div style={{ marginTop: 10 }}>
        {nova ? (
          <div>
            <input
              value={hladanie} onChange={(e) => setHladanie(e.target.value)} placeholder="komu? hľadať klienta…" autoFocus
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name="psb-vyber"
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 8, fontSize: 13, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit" }}
            />
            {najdene.map((m) => (
              <button key={m} onClick={() => void zacni(m)} style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 9px", border: "none", background: "transparent", color: C.text, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                {m}{maPodpisanu.has(normName(m)) && <span style={{ color: C.textDim, fontSize: 11, marginLeft: 8 }}>už má podpísanú — vznikne nová</span>}
              </button>
            ))}
            <button onClick={() => { setNova(false); setHladanie(""); }} style={{ ...tl, marginTop: 6 }}>Zavrieť</button>
          </div>
        ) : (
          <button onClick={() => setNova(true)} style={{ ...tl, borderColor: mix(C.green, 45), color: C.green, fontWeight: 600 }}>+ Nová zmluva</button>
        )}
      </div>

      {zmluvy === null && !chyba && <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 12 }}>Načítavam…</div>}

      {caka.length > 0 && <Nadpis pocet={caka.length}>Čaká na klienta</Nadpis>}
      {caka.map(riadok)}

      {bezZmluvy.length > 0 && <Nadpis pocet={bezZmluvy.length}>6M bez podpísanej zmluvy</Nadpis>}
      {bezZmluvy.map((b) => (
        <div key={b.klient} style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${mix(C.border, 45)}`, flexWrap: "wrap" }}>
          <b style={{ fontSize: 14 }}>{b.klient}</b>
          {b.trener && <span style={{ fontSize: 11.5, color: C.textDim }}>· {b.trener}</span>}
          <div style={{ flexGrow: 1 }} />
          <button onClick={() => void zacni(b.klient)} style={{ ...tl, borderColor: mix(C.green, 45), color: C.green }}>Pripraviť zmluvu</button>
        </div>
      ))}

      {podpisane.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${mix(C.border, 60)}` }}>
          <button onClick={() => setArchiv((p) => !p)} style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ display: "inline-block", width: 13, fontSize: 9 }}>{archiv ? "▼" : "▶"}</span>
            Podpísané ({podpisane.length})
          </button>
          {archiv && podpisane.map(riadok)}
        </div>
      )}
      {zmluvy !== null && !caka.length && !bezZmluvy.length && !podpisane.length && (
        <div style={{ fontSize: 12.5, color: C.textDim, marginTop: 12 }}>Nikto nečaká. Klient v 6M bez podpísanej zmluvy sa tu objaví sám.</div>
      )}
    </div>
  );
}

/** Minulý podpis ako náhľad s tlačidlom — vloží ho do plochy namiesto kreslenia. */
function MinulyPodpis({ png, onPouzi }: { png: string; onPouzi: (p: string) => void }) {
  const [pouzity, setPouzity] = useState(false);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
      <img src={png} alt="minulý podpis" style={{ height: 56, background: "#FFFFFF", borderRadius: 6, border: `1px solid ${C.border}` }} />
      <button
        onClick={() => { onPouzi(png); setPouzity(true); }}
        style={{ ...tl, borderColor: mix(C.green, 45), color: pouzity ? C.green : C.textMuted }}
      >{pouzity ? "Použitý minulý podpis ✓" : "Použiť tento minulý podpis"}</button>
    </div>
  );
}
