import { useCallback, useEffect, useMemo, useState } from "react";

import { oznam } from "../../lib/psb/obnovaSignal";
import { C, mix } from "../../lib/psb/theme";
import { vytlacFakturu } from "../../lib/psb/fakturaHtml";
import {
  DODAVATEL, POPISY, SPLATNOST_DNI, den, poSplatnosti, splatnostZ, suma, type Faktura,
} from "../../lib/psb/vydanaFaktura";
import { Card, H3, Info } from "./ui";

/**
 * VYDANÉ FAKTÚRY.
 *
 * Jerry fakturoval v iDokladi — 84 faktúr od 2023, z toho 37 za rok 2026.
 * Nikto iný ich od neho nepotrebuje, takže celý doklad môže vzniknúť tu:
 * pri balíčku, ktorým pohľadávka vzniká.
 *
 * ČO TU ZÁMERNE NIE JE: mazanie. Faktúra sa stornuje a číslo v rade zostane
 * obsadené. Diera v číslovaní je vec, ktorú po roku nikto nevysvetlí.
 */

type Riadok = {
  id: string; cislo: string; klient: string; balicek_id: string | null;
  vystavene: string; splatnost: string; popis: string; ks: number;
  cena_czk: number; celkom_czk: number;
  odb_firma: string; odb_ico: string; odb_dic: string; odb_ulica: string;
  odb_psc: string; odb_mesto: string; odb_stat: string; odb_email: string;
  poznamka: string; odoslane_at: string | null; odoslane_komu: string;
  uhradene_at: string | null; storno_at: string | null; storno_dovod: string;
};

type Udaje = {
  klient: string; stat: string; firma: string; ico: string; dic: string;
  ulica: string; psc: string; mesto: string; email: string; dalsie_maily: string;
  telefon: string; web: string; os_titul: string; os_meno: string;
  os_priezvisko: string; os_mobil: string;
};

export type FakturaPredvolba = { klient: string; popis: string; cena: number; balicekId?: string };

const PRAZDNE_UDAJE: Omit<Udaje, "klient"> = {
  stat: "Česká republika", firma: "", ico: "", dic: "", ulica: "", psc: "", mesto: "",
  email: "", dalsie_maily: "", telefon: "", web: "",
  os_titul: "", os_meno: "", os_priezvisko: "", os_mobil: "",
};

const dnes = () => new Date().toISOString().slice(0, 10);

const naFakturu = (r: Riadok): Faktura => ({
  cislo: r.cislo, klient: r.klient, vystavene: r.vystavene, splatnost: r.splatnost,
  popis: r.popis, ks: r.ks, cena: r.cena_czk, celkom: r.celkom_czk,
  poznamka: r.poznamka, stornoAt: r.storno_at, uhradeneAt: r.uhradene_at,
  odberatel: {
    firma: r.odb_firma, ico: r.odb_ico, dic: r.odb_dic, ulica: r.odb_ulica,
    psc: r.odb_psc, mesto: r.odb_mesto, stat: r.odb_stat, email: r.odb_email,
  },
});

const poleStyl: React.CSSProperties = {
  padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.border}`,
  background: C.bg, color: C.text, fontFamily: "inherit", fontSize: 12.5, width: "100%",
  boxSizing: "border-box",
};
const popisStyl: React.CSSProperties = { fontSize: 11, color: C.textDim, marginBottom: 3, display: "block" };

function Pole({ label, hodnota, nastav, sirka = 1, typ = "text", placeholder = "" }: {
  label: string; hodnota: string; nastav: (v: string) => void; sirka?: number; typ?: string; placeholder?: string;
}) {
  return (
    <div style={{ flex: `${sirka} 1 ${sirka * 110}px`, minWidth: 110 }}>
      <span style={popisStyl}>{label}</span>
      <input type={typ} value={hodnota} placeholder={placeholder} onChange={(e) => nastav(e.target.value)} style={poleStyl} />
    </div>
  );
}

export function VydaneFaktury({ mena, predvolba, onPredvolbaSpracovana }: {
  mena: string[];
  predvolba?: FakturaPredvolba | null;
  onPredvolbaSpracovana?: () => void;
}) {
  const [riadky, setRiadky] = useState<Riadok[] | null>(null);
  const [udaje, setUdaje] = useState<Udaje[]>([]);
  const [chyba, setChyba] = useState("");
  const [hlaska, setHlaska] = useState("");
  const [pracujem, setPracujem] = useState("");
  const [otvorenaNova, setOtvorenaNova] = useState(false);
  const [upravujemUdaje, setUpravujemUdaje] = useState(false);
  const [f, setF] = useState({
    klient: "", popis: "", ks: "1", cena: "", vystavene: dnes(),
    splatnostDni: String(SPLATNOST_DNI), poznamka: "", balicekId: "",
  });
  const [u, setU] = useState<Omit<Udaje, "klient">>(PRAZDNE_UDAJE);

  const nacitaj = useCallback(async () => {
    const j = await fetch("/api/vydane-faktury", { credentials: "same-origin" })
      .then((r) => r.json()).catch(() => ({ ok: false }));
    if (!j?.ok) { setChyba(j?.error || "Faktúry sa nenačítali."); return; }
    setRiadky(j.faktury || []);
    setUdaje(j.udaje || []);
  }, []);
  useEffect(() => { void nacitaj(); }, [nacitaj]);

  // Príchod z balíčka: formulár sa otvorí predvyplnený. Jerry, 26. 9. 2026:
  // „pri vytvorení balíčka vznikne možnosť vytvoriť faktúru, pre ktorú keď sa
  // rozhodnem, tak sa automaticky všetko vyplní."
  useEffect(() => {
    if (!predvolba) return;
    setF((s) => ({
      ...s, klient: predvolba.klient, popis: predvolba.popis,
      cena: predvolba.cena ? String(Math.round(predvolba.cena)) : "",
      vystavene: dnes(), balicekId: predvolba.balicekId || "",
    }));
    setOtvorenaNova(true);
    onPredvolbaSpracovana?.();
  }, [predvolba, onPredvolbaSpracovana]);

  // Fakturačné údaje vybraného klienta sa nalejú do formulára údajov.
  const udajeKlienta = useMemo(() => udaje.find((x) => x.klient === f.klient), [udaje, f.klient]);
  useEffect(() => {
    setU(udajeKlienta ? { ...PRAZDNE_UDAJE, ...udajeKlienta } : PRAZDNE_UDAJE);
    setUpravujemUdaje(false);
  }, [udajeKlienta, f.klient]);

  const posli = async (telo: Record<string, unknown>, znacka: string) => {
    setPracujem(znacka); setChyba(""); setHlaska("");
    const j = await fetch("/api/vydane-faktury", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(telo),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem("");
    if (!j?.ok) { setChyba(j?.error || "Nepodarilo sa uložiť."); return null; }
    await nacitaj();
    oznam("peniaze");
    return j as { ok: true; cislo?: string; id?: string };
  };

  if (!riadky) return null;

  const zive = riadky.filter((r) => !r.storno_at);
  const nezaplatene = zive.filter((r) => !r.uhradene_at);
  const meskajuce = nezaplatene.filter((r) => poSplatnosti(naFakturu(r), dnes()));
  const tentoRok = zive.filter((r) => r.vystavene.startsWith(String(new Date().getFullYear())));
  const celkomRok = tentoRok.reduce((a, r) => a + r.celkom_czk, 0);

  const vystav = async () => {
    const j = await posli({
      akcia: "vystav", klient: f.klient, popis: f.popis, ks: Number(f.ks) || 1,
      cena: Number(f.cena) || 0, vystavene: f.vystavene,
      splatnostDni: Number(f.splatnostDni) || SPLATNOST_DNI,
      poznamka: f.poznamka, balicekId: f.balicekId || undefined,
    }, "vystav");
    if (!j) return;
    setHlaska(`Vystavená faktúra ${j.cislo}. Otvor ju a ulož ako PDF.`);
    setOtvorenaNova(false);
    setF((s) => ({ ...s, popis: "", cena: "", poznamka: "", balicekId: "" }));
  };

  const ulozUdaje = async () => {
    const j = await posli({
      akcia: "udaje", klient: f.klient, ...u, dalsieMaily: u.dalsie_maily,
      osTitul: u.os_titul, osMeno: u.os_meno, osPriezvisko: u.os_priezvisko, osMobil: u.os_mobil,
    }, "udaje");
    if (j) { setHlaska("Fakturačné údaje uložené."); setUpravujemUdaje(false); }
  };

  return (
    <Card>
      <H3>
        <Info
          label="Faktúry"
          text="Doklady, ktoré PSB vystavilo. Číselná rada RRRR1NNN je vlastná — nemôže sa stretnúť so starými faktúrami z iDokladu (RRRR0NNN). PSB nie je platca DPH, takže na doklade žiadne DPH nie je. Faktúra sa nemaže, chybná sa stornuje."
        />
      </H3>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "6px 0 14px" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: C.text }}>{tentoRok.length}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>faktúr tento rok<br /><span style={{ color: C.textDim }}>{suma(celkomRok)} Kč</span></div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: nezaplatene.length ? C.orange : C.green }}>{nezaplatene.length}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>čaká na zaplatenie<br /><span style={{ color: C.textDim }}>{suma(nezaplatene.reduce((a, r) => a + r.celkom_czk, 0))} Kč</span></div>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: meskajuce.length ? C.red : C.green }}>{meskajuce.length}</div>
          <div style={{ fontSize: 11.5, color: C.textMuted }}>po splatnosti<br /><span style={{ color: C.textDim }}>{meskajuce.length ? "ozvi sa" : "nič nemešká"}</span></div>
        </div>
      </div>

      {chyba && <div style={{ fontSize: 12.5, color: C.red, marginBottom: 8 }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12.5, color: C.green, marginBottom: 8 }}>{hlaska}</div>}

      <button
        type="button"
        onClick={() => setOtvorenaNova((x) => !x)}
        style={{
          padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
          border: `1px solid ${mix(C.accent, 45)}`, background: mix(C.accent, 12), color: C.accentLight,
          marginBottom: otvorenaNova ? 12 : 0,
        }}
      >
        {otvorenaNova ? "zavrieť" : "+ Nová faktúra"}
      </button>

      {otvorenaNova && (
        <div style={{ padding: 12, borderRadius: 11, border: `1px solid ${C.border}`, background: mix(C.card, 60), marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ flex: "2 1 200px" }}>
              <span style={popisStyl}>Klient</span>
              <input list="faktura-klienti" value={f.klient} onChange={(e) => setF((s) => ({ ...s, klient: e.target.value }))} style={poleStyl} placeholder="meno klienta" />
              <datalist id="faktura-klienti">{mena.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
            <Pole label="Vystavené" hodnota={f.vystavene} nastav={(v) => setF((s) => ({ ...s, vystavene: v }))} typ="date" />
            <Pole label="Splatnosť (dní)" hodnota={f.splatnostDni} nastav={(v) => setF((s) => ({ ...s, splatnostDni: v }))} typ="number" />
            <div style={{ flex: "1 1 130px", alignSelf: "flex-end", fontSize: 11.5, color: C.textDim, paddingBottom: 8 }}>
              splatná {den(splatnostZ(f.vystavene, Number(f.splatnostDni) || SPLATNOST_DNI))}
            </div>
          </div>

          <span style={popisStyl}>Popis — vyber z toho, čo už si fakturoval, alebo napíš vlastný</span>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
            {POPISY.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setF((s) => ({ ...s, popis: p.text, cena: String(p.cena) }))}
                title={`${p.text} — ${p.cena} Kč`}
                style={{
                  padding: "5px 9px", borderRadius: 999, fontSize: 11.5, cursor: "pointer",
                  border: `1px solid ${f.popis === p.text ? C.accent : C.border}`,
                  background: f.popis === p.text ? mix(C.accent, 14) : "transparent",
                  color: f.popis === p.text ? C.accentLight : C.textMuted, fontFamily: "inherit",
                }}
              >
                {p.text.length > 42 ? `${p.text.slice(0, 40)}…` : p.text}
              </button>
            ))}
          </div>
          <textarea
            value={f.popis}
            onChange={(e) => setF((s) => ({ ...s, popis: e.target.value }))}
            rows={2}
            placeholder="čo presne sa fakturuje — toto uvidí klient na doklade"
            style={{ ...poleStyl, resize: "vertical", marginBottom: 10 }}
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <Pole label="Počet m. j." hodnota={f.ks} nastav={(v) => setF((s) => ({ ...s, ks: v }))} typ="number" />
            <Pole label="Cena za m. j. (Kč)" hodnota={f.cena} nastav={(v) => setF((s) => ({ ...s, cena: v }))} typ="number" />
            <div style={{ flex: "1 1 150px", alignSelf: "flex-end", paddingBottom: 6 }}>
              <span style={{ fontSize: 11.5, color: C.textDim }}>celkom </span>
              <b style={{ fontSize: 15, color: C.text }}>{suma((Number(f.ks) || 0) * (Number(f.cena) || 0))} Kč</b>
            </div>
          </div>

          <span style={popisStyl}>Poznámka pod položkou (nepovinné)</span>
          <input value={f.poznamka} onChange={(e) => setF((s) => ({ ...s, poznamka: e.target.value }))} style={{ ...poleStyl, marginBottom: 10 }} />

          <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 8 }}>
            Odberateľ: <b style={{ color: C.text }}>{udajeKlienta?.firma || f.klient || "—"}</b>
            {udajeKlienta?.ico ? ` · IČ ${udajeKlienta.ico}` : ""}
            {udajeKlienta?.email ? ` · ${udajeKlienta.email}` : ""}
            {!udajeKlienta && f.klient ? " — fakturačné údaje ešte nemá, doplň ich nižšie" : ""}
          </div>

          <button
            type="button"
            onClick={() => void vystav()}
            disabled={pracujem === "vystav" || !f.klient || f.popis.trim().length < 3 || !(Number(f.cena) > 0)}
            style={{
              padding: "9px 16px", borderRadius: 9, fontSize: 13.5, fontWeight: 600,
              cursor: pracujem === "vystav" ? "default" : "pointer",
              border: `1px solid ${C.accent}`, background: mix(C.accent, 16), color: C.accentLight,
              opacity: !f.klient || f.popis.trim().length < 3 || !(Number(f.cena) > 0) ? 0.5 : 1,
            }}
          >
            {pracujem === "vystav" ? "vystavujem…" : "Vystaviť faktúru"}
          </button>
        </div>
      )}

      {f.klient && (
        <div style={{ padding: 12, borderRadius: 11, border: `1px solid ${C.border}`, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: upravujemUdaje ? 10 : 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Fakturačné údaje — {f.klient}</div>
            <button
              type="button"
              onClick={() => setUpravujemUdaje((x) => !x)}
              style={{ background: "none", border: "none", color: C.textDim, fontFamily: "inherit", fontSize: 12, cursor: "pointer" }}
            >
              {upravujemUdaje ? "skryť" : udajeKlienta ? "upraviť" : "doplniť"}
            </button>
          </div>
          {upravujemUdaje && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <Pole label="Štát" hodnota={u.stat} nastav={(v) => setU({ ...u, stat: v })} sirka={1.4} />
                <Pole label="Firma / meno na faktúre" hodnota={u.firma} nastav={(v) => setU({ ...u, firma: v })} sirka={2.6} placeholder={f.klient} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <Pole label="IČ" hodnota={u.ico} nastav={(v) => setU({ ...u, ico: v })} />
                <Pole label="DIČ" hodnota={u.dic} nastav={(v) => setU({ ...u, dic: v })} />
                <Pole label="Ulica" hodnota={u.ulica} nastav={(v) => setU({ ...u, ulica: v })} sirka={2} />
                <Pole label="PSČ" hodnota={u.psc} nastav={(v) => setU({ ...u, psc: v })} />
                <Pole label="Mesto" hodnota={u.mesto} nastav={(v) => setU({ ...u, mesto: v })} sirka={1.5} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <Pole label="E-mail" hodnota={u.email} nastav={(v) => setU({ ...u, email: v })} sirka={2} typ="email" />
                <Pole label="Telefón" hodnota={u.telefon} nastav={(v) => setU({ ...u, telefon: v })} />
                <Pole label="Web" hodnota={u.web} nastav={(v) => setU({ ...u, web: v })} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <Pole label="Kontaktná osoba — titul" hodnota={u.os_titul} nastav={(v) => setU({ ...u, os_titul: v })} />
                <Pole label="Meno" hodnota={u.os_meno} nastav={(v) => setU({ ...u, os_meno: v })} />
                <Pole label="Priezvisko" hodnota={u.os_priezvisko} nastav={(v) => setU({ ...u, os_priezvisko: v })} />
                <Pole label="Mobil" hodnota={u.os_mobil} nastav={(v) => setU({ ...u, os_mobil: v })} />
              </div>
              <button
                type="button"
                onClick={() => void ulozUdaje()}
                disabled={pracujem === "udaje"}
                style={{
                  padding: "7px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${mix(C.green, 45)}`, background: mix(C.green, 12), color: C.green,
                }}
              >
                {pracujem === "udaje" ? "ukladám…" : "Uložiť údaje"}
              </button>
            </>
          )}
        </div>
      )}

      {riadky.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.55 }}>
          Zatiaľ žiadna faktúra. Prvá dostane číslo {new Date().getFullYear()}1001 — stará rada
          z iDokladu (…0038) zostáva nedotknutá.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {riadky.map((r) => {
            const mesk = poSplatnosti(naFakturu(r), dnes());
            return (
              <div
                key={r.id}
                style={{
                  display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap",
                  padding: "8px 10px", borderRadius: 9,
                  border: `1px solid ${mesk ? mix(C.red, 50) : C.border}`,
                  opacity: r.storno_at ? 0.55 : 1,
                }}
              >
                <b style={{ fontSize: 12.5, color: C.text, fontVariantNumeric: "tabular-nums" }}>{r.cislo}</b>
                <span style={{ fontSize: 12.5, color: C.text, flex: "1 1 160px" }}>
                  {r.odb_firma && r.odb_firma !== r.klient ? `${r.odb_firma} · ${r.klient}` : r.klient}
                  <span style={{ color: C.textDim }}> — {r.popis.length > 46 ? `${r.popis.slice(0, 44)}…` : r.popis}</span>
                </span>
                <span style={{ fontSize: 12.5, color: C.text, fontVariantNumeric: "tabular-nums" }}>{suma(r.celkom_czk)} Kč</span>
                <span style={{ fontSize: 11.5, color: mesk ? C.red : C.textDim }}>
                  {r.storno_at ? `storno — ${r.storno_dovod}`
                    : r.uhradene_at ? `uhradená ${den(r.uhradene_at.slice(0, 10))}`
                      : mesk ? `po splatnosti od ${den(r.splatnost)}` : `splatná ${den(r.splatnost)}`}
                  {r.odoslane_at && !r.storno_at ? ` · odoslaná ${den(r.odoslane_at.slice(0, 10))}` : ""}
                </span>
                <button type="button" onClick={() => vytlacFakturu(naFakturu(r))} style={odkazStyl}>PDF</button>
                {!r.storno_at && (
                  <button
                    type="button"
                    disabled={pracujem === r.id}
                    onClick={() => {
                      const komu = r.odb_email || udaje.find((u) => u.klient === r.klient)?.email || "";
                      if (!komu) { setChyba(`${r.klient} nemá e-mail — doplň ho vo fakturačných údajoch.`); return; }
                      const znova = r.odoslane_at ? `Faktúra ${r.cislo} už raz odišla na ${r.odoslane_komu}. Poslať znova na ${komu}?` : `Poslať faktúru ${r.cislo} na ${komu}?`;
                      if (!window.confirm(znova)) return;
                      void (async () => {
                        const j = await posli({ akcia: "posli-mail", id: r.id, komu }, r.id);
                        if (j) setHlaska(`Faktúra ${r.cislo} odišla na ${komu}. Kópia je aj v tvojej schránke.`);
                      })();
                    }}
                    style={{ ...odkazStyl, color: r.odoslane_at ? C.textDim : C.green }}
                  >
                    {pracujem === r.id ? "posielam…" : r.odoslane_at ? "poslať znova" : "poslať mailom"}
                  </button>
                )}
                {!r.storno_at && !r.uhradene_at && (
                  <button type="button" onClick={() => void posli({ akcia: "uhradena", id: r.id }, r.id)} style={odkazStyl}>uhradená</button>
                )}
                {!r.storno_at && r.uhradene_at && (
                  <button type="button" onClick={() => void posli({ akcia: "neuhradena", id: r.id }, r.id)} style={odkazStyl}>predsa nie</button>
                )}
                {!r.storno_at && (
                  <button
                    type="button"
                    onClick={() => {
                      const dovod = window.prompt(`Prečo sa faktúra ${r.cislo} stornuje? Číslo v rade zostane obsadené.`);
                      if (dovod && dovod.trim()) void posli({ akcia: "storno", id: r.id, dovod: dovod.trim() }, r.id);
                    }}
                    style={{ ...odkazStyl, color: C.textMuted }}
                  >
                    storno
                  </button>
                )}
                {/* Mazanie vedľa storna, nie namiesto neho. Storno je pre
                    doklad, ktorý niekomu odišiel — má byť vidieť, že bol
                    a prečo padol. Mazanie je pre skúšobné a omylom založené
                    faktúry (Jerry, 26. 9. 2026). */}
                <button
                  type="button"
                  onClick={() => {
                    const posledna = r.cislo === riadky[0]?.cislo;
                    const otazka = r.odoslane_at
                      ? `Faktúra ${r.cislo} už bola odoslaná klientovi. Naozaj ju zmazať? Po zmazaní po nej zostane len riadok v audite.`
                      : posledna
                        ? `Zmazať faktúru ${r.cislo}? Číslo sa uvoľní a dostane ho ďalšia faktúra.`
                        : `Zmazať faktúru ${r.cislo}? V číselnej rade po nej zostane diera — ak doklad niekomu odišiel, správne je storno.`;
                    if (window.confirm(otazka)) void posli({ akcia: "zmaz", id: r.id }, r.id);
                  }}
                  style={{ ...odkazStyl, color: C.textDim }}
                >
                  zmazať
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 11, color: C.textDim, marginTop: 12, lineHeight: 1.5 }}>
        Doklad vystavuje {DODAVATEL.meno}, IČ {DODAVATEL.ico}, {DODAVATEL.dph}. Platí sa na
        {" "}{DODAVATEL.ucet}, variabilný symbol je číslo faktúry a na doklade je QR platba.
      </div>
    </Card>
  );
}

const odkazStyl: React.CSSProperties = {
  background: "none", border: "none", padding: 0, color: C.accentLight,
  fontFamily: "inherit", fontSize: 11.5, cursor: "pointer", textDecoration: "underline",
  textUnderlineOffset: 2,
};
