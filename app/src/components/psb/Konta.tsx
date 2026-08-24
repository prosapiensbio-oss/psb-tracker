import { useCallback, useEffect, useState } from "react";

import { C, mix } from "../../lib/psb/theme";
import { Info } from "./ui";

/**
 * Kontá — kto sa do appky prihlasuje.
 *
 * PREČO TO VZNIKLO
 *
 * 24. 8. 2026 pribudol pri odpovediach na notifikácie stĺpec s autorom a hneď
 * sa ukázalo, že je zbytočný: v tabuľke bol jediný účet (vypnutý testovací),
 * Jerry aj Terezka sa hlásili spoločným heslom a appka o oboch vedela len
 * „app". Prihlasovacia obrazovka menované kontá vie ponúknuť, len ich nemal
 * kto založiť — rozhranie existovalo, obrazovka nie.
 *
 * HESLO SEM NEPÍŠE APPKA ANI NIKTO INÝ NEŽ ČLOVEK PRI KLÁVESNICI
 *
 * Pole je typu password, nikam sa nepredvypĺňa a späť zo servera sa nevracia —
 * ani skrátené. Server ho ukladá ako hash so soľou, takže sa nedá prečítať ani
 * z databázy.
 */

type Konto = { login: string; name: string; active: boolean; lastLogin?: string | null };

export function Konta() {
  const [kontá, setKontá] = useState<Konto[]>([]);
  const [ja, setJa] = useState("");
  const [nacitane, setNacitane] = useState(false);
  const [chyba, setChyba] = useState("");
  const [sprava, setSprava] = useState("");
  const [busy, setBusy] = useState(false);

  // Formulár nového konta aj zmeny hesla — jeden, prepína sa `upravovany`.
  const [upravovany, setUpravovany] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [meno, setMeno] = useState("");
  const [heslo, setHeslo] = useState("");

  const nacitaj = useCallback(() => {
    void fetch("/api/users", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; ja?: string; users?: Konto[] }) => {
        setKontá(j.users || []);
        setJa(j.ja || "");
        setNacitane(true);
      })
      .catch(() => setNacitane(true));
  }, []);
  useEffect(nacitaj, [nacitaj]);

  const posli = async (telo: Record<string, unknown>, hlaska: string) => {
    setChyba(""); setSprava(""); setBusy(true);
    try {
      const r = await fetch("/api/users", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(telo),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!j.ok) {
        // Chyby zo servera sú kódy — preložiť ich je práca obrazovky.
        setChyba({
          bad_login: "Prihlasovacie meno smie mať len malé písmená, číslice, bodku, pomlčku alebo podčiarkovník (2–40 znakov).",
          short_password: "Heslo musí mať aspoň 8 znakov.",
          need_password: "Nové konto potrebuje heslo.",
          bad_request: "Nepodarilo sa prečítať formulár.",
        }[j.error || ""] || j.error || "Nepodarilo sa uložiť.");
        return false;
      }
      setSprava(hlaska);
      setHeslo(""); setLogin(""); setMeno(""); setUpravovany(null);
      nacitaj();
      return true;
    } catch {
      setChyba("Nepodarilo sa uložiť — spojenie zlyhalo.");
      return false;
    } finally { setBusy(false); }
  };

  if (!nacitane) return null;

  const vstup = {
    background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 13,
    border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px",
    boxSizing: "border-box" as const,
  };
  const tlacidlo = (hlavne: boolean) => ({
    background: hlavne ? C.accent : "none", color: hlavne ? "#fff" : C.textMuted,
    border: hlavne ? "none" : `1px solid ${C.border}`, borderRadius: 6,
    padding: "7px 13px", fontSize: 12.5, fontFamily: "inherit", cursor: busy ? "default" : "pointer",
  });

  const noveKonto = upravovany === null;
  const platny = noveKonto
    ? /^[a-z0-9._-]{2,40}$/.test(login.trim()) && heslo.length >= 8
    : heslo.length >= 8;

  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
        {kontá.length === 0
          ? "Zatiaľ nemá vlastné prihlásenie nikto — appka preto pri každej odpovedi na notifikáciu zapíše len „app“ a nedá sa zistiť, kto ju napísal. Založ konto sebe aj Terezke; na prihlasovacej obrazovke sa potom ukážu ako tlačidlá."
          : `Prihlásený si ako ${ja}. Heslo sa nikam nevracia — server ho ukladá zahashované so soľou, takže sa nedá prečítať ani z databázy.`}
      </div>

      {kontá.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 14, background: C.border, border: `1px solid ${C.border}`, borderRadius: 7, overflow: "hidden" }}>
          {kontá.map((k) => (
            <div key={k.login} style={{
              display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
              background: C.card, padding: "9px 11px",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: k.active ? C.text : C.textDim, flex: "1 1 130px" }}>
                {k.name}
                <span style={{ color: C.textDim, fontWeight: 400 }}> · {k.login}</span>
                {k.login === ja && <span style={{ color: C.accentLight, fontWeight: 400 }}> · to si ty</span>}
              </span>
              <span style={{ fontSize: 11, color: C.textDim, flex: "0 0 auto" }}>
                {k.active ? (k.lastLogin ? `naposledy ${k.lastLogin.slice(0, 10)}` : "ešte sa neprihlásil") : "vypnuté"}
              </span>
              <button
                onClick={() => { setUpravovany(k.login); setLogin(k.login); setMeno(k.name); setHeslo(""); setSprava(""); setChyba(""); }}
                disabled={busy} style={{ ...tlacidlo(false), padding: "4px 9px", fontSize: 11.5 }}>
                zmeniť heslo
              </button>
              {/* Vlastné konto sa vypnúť nedá — kto by sa potom prihlásil. */}
              {k.login !== ja && (
                <button
                  onClick={() => void posli({ login: k.login, name: k.name, active: !k.active },
                    k.active ? `Konto ${k.name} je vypnuté.` : `Konto ${k.name} je späť.`)}
                  disabled={busy} style={{ ...tlacidlo(false), padding: "4px 9px", fontSize: 11.5 }}>
                  {k.active ? "vypnúť" : "zapnúť"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: 12, borderRadius: 8, background: mix(C.accent, 0.05), border: `1px solid ${mix(C.border, 0.9)}` }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 9 }}>
          {noveKonto ? "Nové konto" : `Nové heslo pre ${meno || upravovany}`}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {noveKonto && (
            <>
              <input value={login} onChange={(e) => setLogin(e.target.value.toLowerCase())}
                placeholder="prihlasovacie meno (napr. jerry)" autoComplete="off"
                style={{ ...vstup, flex: "1 1 170px" }} />
              <input value={meno} onChange={(e) => setMeno(e.target.value)}
                placeholder="meno, ktoré uvidíš (napr. Jerry)" autoComplete="off"
                style={{ ...vstup, flex: "1 1 170px" }} />
            </>
          )}
          <input type="password" value={heslo} onChange={(e) => setHeslo(e.target.value)}
            placeholder="heslo — aspoň 8 znakov" autoComplete="new-password"
            style={{ ...vstup, flex: "1 1 170px" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => void posli(
              { login: (noveKonto ? login : upravovany)!.trim(), name: (meno || login).trim(), password: heslo },
              noveKonto ? `Konto ${meno || login} je založené — nech sa ním prihlási.` : "Heslo zmenené.",
            )}
            disabled={busy || !platny}
            style={{ ...tlacidlo(true), opacity: busy || !platny ? 0.5 : 1 }}>
            {noveKonto ? "založiť konto" : "zmeniť heslo"}
          </button>
          {!noveKonto && (
            <button onClick={() => { setUpravovany(null); setLogin(""); setMeno(""); setHeslo(""); }}
              disabled={busy} style={tlacidlo(false)}>zrušiť</button>
          )}
          <span style={{ fontSize: 11, color: C.textDim }}>
            Heslo si napíš sám — appka si ho nikde nepamätá a späť ho nezobrazí.
          </span>
        </div>
      </div>

      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{chyba}</div>}
      {sprava && <div style={{ fontSize: 12, color: C.green, marginTop: 10 }}>{sprava}</div>}
    </div>
  );
}

/** Nadpis karty — drží sa pri komponente, nech ho netreba písať dvakrát. */
export function KontaNadpis() {
  return (
    <Info
      label="Kto sa prihlasuje"
      text="Kým sa všetci hlásia jedným heslom, appka pri odpovedi na notifikáciu zapíše „app“ a nedá sa zistiť, kto ju napísal. S vlastnými kontami sa na prihlasovacej obrazovke ukážu mená ako tlačidlá a pri každej odpovedi bude vidieť autor. Heslá appka neukladá v čitateľnej podobe a späť ich nikdy nezobrazí."
    />
  );
}
