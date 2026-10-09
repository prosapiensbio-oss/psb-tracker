import { useEffect, useMemo, useState } from "react";
import type { ClientAgg } from "../../lib/psb/compute";
import { normName } from "../../lib/psb/format";
import { oznam } from "../../lib/psb/obnovaSignal";
import { cisloPreBranu, dlzkaSpravy } from "../../lib/psb/sms";
import { C, mix } from "../../lib/psb/theme";
import { verejnyOdkaz } from "../../lib/psb/verejnyOdkaz";

/**
 * HROMADNÁ SPRÁVA — jedna SMS všetkým klientom alebo vybraným.
 *
 * Jerry, 5. 10. 2026: „chcel by som mať niekde možnosť napísať hromadnú
 * správu pre všetkých klientov alebo pre tých, ktorých vyberiem."
 *
 * Pravidlo „žiadna SMS neodíde sama" platí aj tu: text aj zoznam príjemcov
 * sú na očiach a odosiela sa až po druhom potvrdení s počtom SMS. Do auditu
 * ide ako `sms-hromadna`, nie `sms-odoslana` — inak by oznam pre všetkých
 * vyčistil zoznam v kroku SMS, ktorý hovorí o stave hodín.
 *
 * `{meno}` v texte sa nahradí krstným menom.
 *
 * `{dotaznik}` (9. 10. 2026) nahradí až SERVER osobným odkazom na anonymný
 * dotazník — odkaz vzniká pri odoslaní a do auditu ide ako `sms-dotaznik`.
 * Filter „neodpovedali na dotazník" je na pripomienku po týždni.
 */

type Kontakt = { klient: string; telefon?: string };
type Filter = "aktivni" | "pauza" | "vsetci" | "dotaznik";

const krstne = (meno: string) => meno.trim().split(/\s+/)[0] || meno;
const zlozText = (text: string, meno: string) => text.replace(/\{meno\}/gi, krstne(meno));
/** Dĺžka sa ráta s odkazom takej dĺžky, aký server naozaj vloží. */
const ukazkaOdkazu = () => verejnyOdkaz(`/d/${"x".repeat(14)}`, typeof window === "undefined" ? "" : window.location.origin);
const naPocitanie = (text: string, meno: string) => zlozText(text, meno).replace(/\{dotaznik\}/gi, ukazkaOdkazu());
const TEXT_DOTAZNIKA = "Ahoj {meno}, máš 2 minuty? Krátký anonymní dotazník o ProSapiens: {dotaznik} Moc nám pomůže. Jerry a Terezka";

export function HromadnaSprava({ clients, trener }: { clients: Record<string, ClientAgg>; trener: string | null }) {
  const [kontakty, setKontakty] = useState<Kontakt[] | null>(null);
  const [filter, setFilter] = useState<Filter>("aktivni");
  const [lenMoji, setLenMoji] = useState(true);
  const [vybrani, setVybrani] = useState<Set<string> | null>(null);
  const [hladaj, setHladaj] = useState("");
  const [text, setText] = useState("");
  const [potvrd, setPotvrd] = useState(false);
  const [bezi, setBezi] = useState(false);
  const [stop, setStop] = useState(false);
  const [vysledok, setVysledok] = useState<{ ok: string[]; zle: { meno: string; chyba: string }[] } | null>(null);

  /** Kto ešte neodpovedal na dotazník v otvorenom kole — pre pripomienku. */
  const [neodpovedali, setNeodpovedali] = useState<string[] | null>(null);
  useEffect(() => {
    if (filter !== "dotaznik" || neodpovedali) return;
    void fetch("/api/dotaznik", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setNeodpovedali(j?.ok && j.kolo && !j.kolo.uzavrete_at ? (j.neodpovedali || []) : []))
      .catch(() => setNeodpovedali([]));
  }, [filter, neodpovedali]);

  useEffect(() => {
    let zive = true;
    void fetch("/api/vydane-faktury", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (zive) setKontakty((j?.udaje || []) as Kontakt[]); })
      .catch(() => { if (zive) setKontakty([]); });
    return () => { zive = false; };
  }, []);

  const cislo = useMemo(() => {
    const m: Record<string, string> = {};
    for (const k of kontakty || []) {
      const c = cisloPreBranu(String(k.telefon || ""));
      if (c) m[k.klient] = c;
    }
    return m;
  }, [kontakty]);

  /** Kto spadá do filtra — predvýber, ktorý sa dá ručne meniť. */
  const vFiltri = useMemo(() => (filter === "dotaznik"
    ? (neodpovedali || []).filter((m) => !lenMoji || !trener || clients[m]?.primaryTrainer === trener)
    : Object.values(clients)
      .filter((c) => filter === "vsetci" || (filter === "pauza" ? c.status !== "Neaktívny" : c.status === "Aktívny" || c.status === "Sporadický"))
      .filter((c) => !lenMoji || !trener || c.primaryTrainer === trener)
      .map((c) => c.name))
    .sort((a, b) => a.localeCompare(b, "sk")), [clients, filter, lenMoji, trener, neodpovedali]);

  // Zmena filtra = nový predvýber (len tí s číslom).
  useEffect(() => { setVybrani(null); setPotvrd(false); }, [filter, lenMoji]);
  const vyber = vybrani ?? new Set(vFiltri.filter((m) => cislo[m]));
  const prepni = (m: string) => {
    const n = new Set(vyber);
    if (n.has(m)) n.delete(m); else n.add(m);
    setVybrani(n); setPotvrd(false);
  };

  const hq = normName(hladaj);
  // Pri hľadaní sa ukazujú aj klienti mimo filtra — tak sa dá pridať ktokoľvek.
  const zoznam = hq
    ? Object.keys(clients).filter((m) => normName(m).includes(hq)).sort((a, b) => a.localeCompare(b, "sk"))
    : vFiltri;
  const prijemcovia = [...vyber].filter((m) => cislo[m]);
  const bezCisla = vFiltri.filter((m) => !cislo[m]).length;

  const najdlhsi = prijemcovia.reduce((d, m) => Math.max(d, naPocitanie(text, m).length), naPocitanie(text, "").length);
  const ukazka = prijemcovia[0] ? naPocitanie(text, prijemcovia[0]) : text;
  const dlzka = dlzkaSpravy(prijemcovia.length ? prijemcovia.map((m) => naPocitanie(text, m)).sort((a, b) => b.length - a.length)[0] : naPocitanie(text, ""));
  const spolu = prijemcovia.reduce((n, m) => n + dlzkaSpravy(naPocitanie(text, m)).sprav, 0);

  const posli = async () => {
    setBezi(true); setStop(false);
    const ok: string[] = [];
    const zle: { meno: string; chyba: string }[] = [];
    setVysledok({ ok, zle });
    for (const m of prijemcovia) {
      // Zastavenie medzi správami — tá, čo už odišla, sa vziať nedá.
      if (stopRef.current) break;
      const r = await fetch("/api/sms", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ klient: m, telefon: cislo[m], text: zlozText(text, m), hromadna: true }),
      }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie zlyhalo" }));
      if (r?.ok) ok.push(m); else zle.push({ meno: m, chyba: String(r?.error || "neodišla") });
      setVysledok({ ok: [...ok], zle: [...zle] });
    }
    setBezi(false); setPotvrd(false);
    oznam("klienti");
  };
  // `stop` zo stavu by slučka nevidela (zachytila by hodnotu z času spustenia).
  const stopRef = useStopRef(stop);

  const pole: React.CSSProperties = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
    fontSize: 12.5, padding: "7px 10px", fontFamily: "inherit",
  };
  const cip = (on: boolean): React.CSSProperties => ({
    padding: "4px 10px", borderRadius: 14, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
    border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentBg : "transparent", color: on ? C.accentLight : C.textMuted,
  });

  if (!kontakty) return <div style={{ fontSize: 12, color: C.textDim }}>načítavam kontakty…</div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button style={cip(filter === "aktivni")} onClick={() => setFilter("aktivni")}>Aktívni</button>
        <button style={cip(filter === "pauza")} onClick={() => setFilter("pauza")}>Aktívni + pauza</button>
        <button style={cip(filter === "vsetci")} onClick={() => setFilter("vsetci")}>Všetci</button>
        <button style={cip(filter === "dotaznik")} onClick={() => { setFilter("dotaznik"); setNeodpovedali(null); }}
          title="Kto dostal odkaz na dotazník a ešte neodpovedal — na jednu pripomienku po týždni">Neodpovedali na dotazník</button>
        {trener && (
          <label style={{ fontSize: 11.5, color: C.textMuted, display: "inline-flex", gap: 5, alignItems: "center", marginLeft: 6 }}>
            <input type="checkbox" checked={lenMoji} onChange={(e) => setLenMoji(e.target.checked)} /> len moji klienti ({trener})
          </label>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={hladaj} onChange={(e) => setHladaj(e.target.value)} placeholder="pridať kohokoľvek — hľadaj meno…"
          autoComplete="off" spellCheck={false} name="psb-hromadna-hladaj" style={{ ...pole, width: 240 }} />
        <span style={{ fontSize: 12, color: C.textMuted }}>
          vybraných <b style={{ color: C.text }}>{prijemcovia.length}</b>
          {bezCisla > 0 && <> · {bezCisla} vo filtri bez čísla</>}
        </span>
        <button style={cip(false)} onClick={() => { setVybrani(new Set(vFiltri.filter((m) => cislo[m]))); setPotvrd(false); }}>označiť všetkých</button>
        <button style={cip(false)} onClick={() => { setVybrani(new Set()); setPotvrd(false); }}>zrušiť výber</button>
      </div>

      <div style={{ maxHeight: 190, overflowY: "auto", border: `1px solid ${mix(C.border, 70)}`, borderRadius: 8, padding: "6px 8px",
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "2px 10px" }}>
        {zoznam.map((m) => (
          <label key={m} title={cislo[m] ? cislo[m] : "bez telefónneho čísla"} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", padding: "2px 0",
            color: cislo[m] ? C.text : C.textDim, cursor: cislo[m] ? "pointer" : "not-allowed" }}>
            <input type="checkbox" disabled={!cislo[m]} checked={vyber.has(m) && !!cislo[m]} onChange={() => prepni(m)} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m}</span>
          </label>
        ))}
        {!zoznam.length && <span style={{ fontSize: 12, color: C.textDim }}>Nikto.</span>}
      </div>

      <div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
          <button style={cip(/\{dotaznik\}/i.test(text))} onClick={() => { setText((t) => (t.trim() ? (/\{dotaznik\}/i.test(t) ? t : `${t.trim()} {dotaznik}`) : TEXT_DOTAZNIKA)); setPotvrd(false); }}
            title="Každý klient dostane vlastný odkaz na anonymný dotazník — dá sa vyplniť raz">
            + odkaz na anonymný dotazník
          </button>
        </div>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setPotvrd(false); }} rows={3}
          placeholder="Ahoj {meno}, …  ({meno} sa nahradí krstným menom)" style={{ ...pole, width: "100%", resize: "vertical" }} />
        <div style={{ fontSize: 11.5, color: dlzka.sprav > 1 ? C.orange : C.textDim, marginTop: 4 }}>
          {najdlhsi} znakov · {dlzka.sprav} SMS na klienta{dlzka.unicode ? " (diakritika: 70 znakov na SMS)" : ""}
          {prijemcovia.length > 0 && text.trim() && <> · spolu <b>{spolu} SMS</b></>}
        </div>
        {filter === "dotaznik" && neodpovedali && !neodpovedali.length && (
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>Nikto nečaká — dotazník ešte neodišiel, alebo odpovedali všetci.</div>
        )}
        {(/\{meno\}/i.test(text) || /\{dotaznik\}/i.test(text)) && prijemcovia[0] && (
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6, padding: "6px 10px", borderLeft: `2px solid ${mix(C.accent, 60)}` }}>
            ukážka pre {prijemcovia[0]}: „{ukazka}“
          </div>
        )}
      </div>

      {!bezi && !potvrd && (
        <div>
          <button disabled={!prijemcovia.length || !text.trim()} onClick={() => setPotvrd(true)}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
              cursor: prijemcovia.length && text.trim() ? "pointer" : "not-allowed",
              border: `1px solid ${mix(C.green, 50)}`, background: prijemcovia.length && text.trim() ? mix(C.green, 12) : "transparent",
              color: prijemcovia.length && text.trim() ? C.green : C.textDim }}>
            Poslať {prijemcovia.length} {prijemcovia.length === 1 ? "klientovi" : "klientom"}
          </button>
        </div>
      )}
      {!bezi && potvrd && (
        <div style={{ padding: "9px 11px", borderRadius: 8, border: `1px solid ${mix(C.orange, 50)}`, background: mix(C.orange, 8) }}>
          <div style={{ fontSize: 12.5, color: C.text, marginBottom: 7 }}>
            Naozaj poslať <b>{spolu} SMS</b> {prijemcovia.length} {prijemcovia.length === 1 ? "klientovi" : "klientom"}? Odoslané sa nedá vziať späť.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => void posli()} style={{ padding: "6px 13px", borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${mix(C.green, 55)}`, background: mix(C.green, 16), color: C.green }}>
              Áno, poslať
            </button>
            <button onClick={() => setPotvrd(false)} style={{ padding: "6px 13px", borderRadius: 7, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}>
              Späť
            </button>
          </div>
        </div>
      )}
      {vysledok && (
        <div style={{ fontSize: 12.5, color: C.textMuted }}>
          {bezi ? "Posielam… " : ""}odoslané <b style={{ color: C.green }}>{vysledok.ok.length}</b> z {prijemcovia.length}
          {bezi && <button onClick={() => setStop(true)} style={{ marginLeft: 10, padding: "3px 10px", borderRadius: 7, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${mix(C.red, 45)}`, background: "transparent", color: C.red }}>zastaviť</button>}
          {vysledok.zle.length > 0 && (
            <div style={{ color: C.red, marginTop: 4 }}>
              Neodišlo ({vysledok.zle.length}): {vysledok.zle.map((z) => `${z.meno} — ${z.chyba}`).join(" · ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ref, ktorý slučka v `posli` číta vždy aktuálny. */
function useStopRef(stop: boolean) {
  const [ref] = useState(() => ({ current: false }));
  ref.current = stop;
  return ref;
}
