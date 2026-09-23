import { useCallback, useEffect, useMemo, useState } from "react";

import { normName, fmtCZK, fmtDMY } from "../../lib/psb/format";
import { menoKluc } from "../../lib/psb/compute";
import { satsNaCzk } from "../../lib/psb/btcKontrola";
import { CENNIK, platnostDo } from "../../lib/psb/cennik";
import { osCasuKlienta } from "../../lib/psb/klientOsCasu";
import { zdravieKlienta } from "../../lib/psb/klientZdravie";
import type { ClientAgg } from "../../lib/psb/compute";
import type { PSBData } from "../../lib/psb/types";
import { C, mix } from "../../lib/psb/theme";
import { Dennik } from "./Dennik";
import { Info } from "./ui";

/**
 * Pracovný stôl jedného klienta — vyhľadaj a rob na ňom.
 *
 * Jerry, 23. 9. 2026: „chcel by som tam mať vyhľadávanie, vybrať klienta,
 * ukázal by sa mi jeho profil a mal by som tam možnosť robiť… aj listy:
 * tréningy (kedy bol + kedy bude), financie (všetky platby) a balíky —
 * miesto, kde ich nahadzujem."
 *
 * A jedna vec navyše, ktorú si vypýtal menovite: **s nahodením balíka má
 * vzniknúť mínus, ktorý zmizne, keď klient zaplatí.**
 *
 * MÍNUS SA NEVYMÝŠĽA
 *
 * Počíta sa z toho, čo je v appke úplné: predané balíčky z vlastnej
 * evidencie proti platbám z PTmindera (tie sú dnes jediný úplný zdroj —
 * vlastná kniha platieb má zatiaľ len banku od januára a hotovosť v nej
 * nie je). Obe sumy sú vidieť vedľa rozdielu, aby sa dalo overiť, z čoho
 * to číslo je. Keď sa súbežný chod dokončí a platby budú kompletné
 * v Kokpite, zdroj sa prepne — dovtedy by tichý odhad klamal.
 */

type Balicek = {
  id: string; klient: string; nazov: string; hodiny: number | null;
  platnost_od: string; platnost_do: string | null; cena_czk: number | null;
  zdroj: string; poznamka: string | null; zrusene_at: string | null;
};

type Platba = {
  id: string; klient: string; datum: string; suma_czk: number;
  sposob: string; fio_id: string | null; poznamka: string | null; zrusene_at: string | null;
};

const dnesISO = () => new Date().toISOString().slice(0, 10);

export function KlientStol({ clients, mena, data, kalUdalosti, btcSats, btc }: {
  clients: Record<string, ClientAgg>;
  mena: string[];
  data: PSBData;
  kalUdalosti?: { zaciatok: string; klient: string | null; typ: string | null }[];
  /** Koľko satoshi klient celkovo zaplatil (z appky PSB Bitcoin). */
  btcSats?: Record<string, number>;
  /** Jednotlivé bitcoinové platby a aktuálny kurz — na záložku ₿. */
  btc?: { platby: { klient: string | null; datum: string; sats?: number; czk: number | null }[]; kurz: number | null; kedy: string | null };
}) {
  const [hladam, setHladam] = useState("");
  const [novy, setNovy] = useState(false);
  const [stav, setStav] = useState<"aktivni" | "neaktivni">("aktivni");
  const [meno, setMeno] = useState("");
  const [filter, setFilter] = useState<"zdravie" | "vsetko" | "peniaze" | "balicky" | "poznamky">("zdravie");
  const [detaily, setDetaily] = useState(false);
  const [pisemPlatbu, setPisemPlatbu] = useState(false);
  const [pl, setPl] = useState({ datum: dnesISO(), suma: "", sposob: "hotovost", poznamka: "" });
  const [balicky, setBalicky] = useState<Balicek[]>([]);
  const [vlastnePlatby, setVlastnePlatby] = useState<Platba[]>([]);
  /** Čo sa práve upravuje — id riadku, alebo prázdno. */
  const [upravaPlatby, setUpravaPlatby] = useState("");
  const [upravaBalicka, setUpravaBalicka] = useState("");
  const [penazSub, setPenazSub] = useState<"platby" | "bitcoin">("platby");
  const [pisem, setPisem] = useState(false);
  const [f, setF] = useState({ nazov: "", hodiny: "", platnostOd: dnesISO(), platnostDo: "", cenaCzk: "", poznamka: "" });
  const [pracujem, setPracujem] = useState(false);
  const [chyba, setChyba] = useState("");

  const nacitajBalicky = useCallback(async () => {
    const r = await fetch("/api/balicky", { credentials: "same-origin" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setBalicky(r.balicky || []);
  }, []);
  const nacitajPlatby = useCallback(async () => {
    const r = await fetch("/api/platby?klient=1", { credentials: "same-origin" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) setVlastnePlatby(r.platby || []);
  }, []);
  useEffect(() => { void nacitajBalicky(); void nacitajPlatby(); }, [nacitajBalicky, nacitajPlatby]);

  const c = meno ? clients[meno] : undefined;
  const os = useMemo(
    () => (meno ? osCasuKlienta(meno, { sessions: data.sessions as never, payments: data.payments as never, packages: (data.packages || []) as never, kalUdalosti }) : []),
    [meno, data.sessions, data.payments, data.packages, kalUdalosti],
  );

  const mojeBalicky = useMemo(
    () => balicky.filter((b) => normName(b.klient) === normName(meno) && !b.zrusene_at).sort((a, b) => b.platnost_od.localeCompare(a.platnost_od)),
    [balicky, meno],
  );

  const mojePlatby = useMemo(
    () => vlastnePlatby.filter((x) => normName(x.klient) === normName(meno) && !x.zrusene_at).sort((a, b) => b.datum.localeCompare(a.datum)),
    [vlastnePlatby, meno],
  );

  /** Bitcoinové platby tohto klienta. Kľúč je fuzzy — BTC kniha píše mená inak. */
  const mojeBtc = useMemo(() => {
    if (!btc?.platby?.length || !meno) return [];
    const k = menoKluc(meno);
    return btc.platby
      .filter((x) => x.klient && menoKluc(x.klient) === k)
      .map((x) => ({
        datum: String(x.datum).slice(0, 10),
        sats: x.sats || 0,
        vtedy: Math.round(x.czk || 0),
        dnes: satsNaCzk(x.sats || 0, btc.kurz ?? null),
      }))
      .sort((a, b) => b.datum.localeCompare(a.datum));
  }, [btc, meno]);

  const buduce = useMemo(() => {
    const d = dnesISO();
    return (kalUdalosti || [])
      .filter((u) => u.klient && normName(u.klient) === normName(meno) && (u.typ === "trening" || u.typ === "uvodny") && u.zaciatok.slice(0, 10) >= d)
      .map((u) => u.zaciatok)
      .sort();
  }, [kalUdalosti, meno]);

  const platby = useMemo(
    () => (data.payments || []).filter((p) => normName(p.client) === normName(meno)).sort((a, b) => b.date.localeCompare(a.date)),
    [data.payments, meno],
  );

  /** Dopyt, z ktorého klient vznikol — odkiaľ prišiel a za čo sme ho kúpili. */
  const dopyt = useMemo(
    () => (data.leads || []).find((l) => normName(l.name || "") === normName(meno)) || null,
    [data.leads, meno],
  );

  /** Koho priviedol — klienti, ktorí ho uviedli ako odporúčateľa. */
  const priviedol = useMemo(
    () => Object.values(clients).filter((x) => x.zdrojKto && normName(x.zdrojKto) === normName(meno)).map((x) => x.name),
    [clients, meno],
  );

  /** Nezaplatené poplatky z PTmindera. */
  const poplatkyKlienta = useMemo(
    () => (data.poplatky || []).filter((x) => normName((x as { client?: string }).client || "") === normName(meno)),
    [data.poplatky, meno],
  );

  /** Závery z debát s Jarvisom, ktoré sa týkajú tohto klienta. */
  const zavery = useMemo(
    () => (data.zavery || []).filter((z) => normName((z as { klient?: string }).klient || "") === normName(meno)),
    [data.zavery, meno],
  );

  /**
   * Ručne nastavený stav, ktorý dáta už neplatia — koľko tréningov odvtedy.
   *
   * Override sa zapisuje raz a platí navždy; nikto ho nechodí rušiť. Preto
   * sa pýta appka.
   */
  const zabudnutaPauza = useMemo(() => {
    const ov = (data.clientOverrides || {})[meno];
    const [stav, doDna] = (ov?.status || "").split("|");
    if (!c || (stav !== "Pauza" && stav !== "Neaktívny")) return 0;
    // „Pauza|2026-08-27" hovorí, dokedy pauza trvá — po tom dni už tréning
    // nie je rozpor. Pri holej „Pauze" je hranicou deň, keď sa zapísala.
    const od = (doDna || (ov?.updatedAt || "").slice(0, 10));
    if (!od) return 0;
    return c.sessions.filter((x) => x.date.slice(0, 10) > od).length;
  }, [data.clientOverrides, meno, c]);

  /** Zrušené tréningy za 90 dní — z histórie zmien v kalendári. */
  const [zruseneKal, setZruseneKal] = useState<{ klient: string | null; druh: string; kedy: string }[]>([]);
  useEffect(() => {
    void fetch("/api/kalendar", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { zmenyHistoria?: { klient: string | null; druh: string; kedy: string }[] }) => setZruseneKal(j.zmenyHistoria || []))
      .catch(() => setZruseneKal([]));
  }, []);

  /**
   * Zdravie vzťahu — štyri signály s mierkou (Jerryho výber: návrh 3 + 5).
   * Výpočet žije v `lib/psb/klientZdravie.ts`, aby ho mohla použiť aj
   * notifikácia a Jarvis, keď na to príde — dve kópie by sa raz rozišli.
   */
  /**
   * Obnovy balíčka: po skončení jedného začal ďalší do mesiaca?
   * Posledný balíček sa nepočíta — ešte nemal príležitosť.
   */
  const obnovy = useCallback((zoznam: Balicek[]) => {
    const zor = [...zoznam].filter((b) => !b.zrusene_at && b.platnost_do).sort((a, b) => a.platnost_od.localeCompare(b.platnost_od));
    let mohol = 0, obnovil = 0;
    for (let i = 0; i < zor.length - 1; i++) {
      const koniec = Date.parse(`${zor[i].platnost_do}T00:00:00Z`);
      const dalsi = Date.parse(`${zor[i + 1].platnost_od}T00:00:00Z`);
      if (!Number.isFinite(koniec) || !Number.isFinite(dalsi)) continue;
      mohol++;
      if ((dalsi - koniec) / 86400000 <= 31) obnovil++;
    }
    return { mohol, obnovil };
  }, []);

  const dni = useCallback((n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10), []);

  /**
   * Priemery klientely — RAZ nad všetkými, nie odvodené od otvoreného klienta.
   * Prvá verzia delila sedenia ostatných mesiacmi tohto klienta, takže sa
   * „priemer" menil podľa toho, koho si človek otvoril.
   */
  const priemery = useMemo(() => {
    const ostatni = Object.values(clients);
    const tempa = ostatni.map((x) => x.sessions.filter((y) => y.date.slice(0, 10) > dni(90)).length / 3).filter((x) => x > 0);
    const tempo = tempa.length ? tempa.reduce((a, b) => a + b, 0) / tempa.length : 0;

    const zruseneVsetky = zruseneKal.filter((z) => z.druh === "zrusene" && z.kedy.slice(0, 10) > dni(90));
    const aktivnych = Math.max(1, ostatni.filter((x) => x.sessions.some((y) => y.date.slice(0, 10) > dni(90))).length);
    const zrusene = zruseneVsetky.length / aktivnych;

    const podlaKlienta = new Map<string, Balicek[]>();
    for (const b of balicky) {
      const k = normName(b.klient);
      if (!podlaKlienta.has(k)) podlaKlienta.set(k, []);
      podlaKlienta.get(k)!.push(b);
    }
    let m = 0, o = 0;
    for (const zoznam of podlaKlienta.values()) { const r = obnovy(zoznam); m += r.mohol; o += r.obnovil; }
    return { tempo, zrusene, obnovy: m ? o / m : 0.7 };
  }, [clients, zruseneKal, balicky, dni, obnovy]);

  const zdravie = useMemo(() => {
    if (!c) return null;
    const vokne = (od: string, doD: string) => c.sessions.filter((x) => x.date.slice(0, 10) > od && x.date.slice(0, 10) <= doD).length;
    /**
     * Obvyklý odstup medzi tréningami — medián, nie priemer.
     * Jedna dovolenka v lete by priemer vytiahla natoľko, že by potom
     * „mešká" nevyzeralo ako meškanie u nikoho.
     */
    const dniS = c.sessions.map((x) => x.date.slice(0, 10)).sort();
    const odstupy: number[] = [];
    for (let i = 1; i < dniS.length; i++) odstupy.push((Date.parse(dniS[i]) - Date.parse(dniS[i - 1])) / 86400000);
    odstupy.sort((a, b) => a - b);
    const obvyklyOdstup = odstupy.length >= 4 ? odstupy[Math.floor(odstupy.length / 2)] : null;
    const posledny = dniS[dniS.length - 1];
    const r = obnovy(mojeBalicky);
    return zdravieKlienta(c, {
      tempoTeraz: vokne(dni(90), dni(0)) / 3,
      tempoPredtym: vokne(dni(180), dni(90)) / 3,
      zrusene: zruseneKal.filter((z) => z.druh === "zrusene" && z.klient && normName(z.klient) === normName(meno) && z.kedy.slice(0, 10) > dni(90)).length,
      dniOdPosledneho: posledny ? Math.floor((Date.now() - Date.parse(posledny)) / 86400000) : null,
      obvyklyOdstup,
      obnovil: r.obnovil, mohol: r.mohol,
      priemery,
    });
  }, [c, meno, zruseneKal, mojeBalicky, priemery, dni, obnovy]);

  /** Koľko údajov je pod tlačidlom „ďalších N" — aby číslo nebolo vymyslené. */
  const dalsichUdajov = useMemo(
    () => (c ? stitky(c, dopyt, priviedol, poplatkyKlienta, btcSats?.[meno]).length : 0),
    [c, dopyt, priviedol, poplatkyKlienta, btcSats, meno],
  );

  const zaplatene = platby.reduce((a, p) => a + p.amount, 0);
  /** Čo klient naozaj dlhuje — otvorené poplatky z PTmindera, nie odhad. */
  const dlzi = Math.round(poplatkyKlienta.reduce((a, x) => a + ((x as { suma?: number }).suma || 0), 0));

  const pridajPlatbu = async () => {
    setPracujem(true); setChyba("");
    const r = await fetch("/api/platby", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "hotovost", klient: meno, ...pl }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!r.ok) { setChyba(r.error || "nepodarilo sa uložiť"); return; }
    setPl({ datum: dnesISO(), suma: "", sposob: "hotovost", poznamka: "" });
    setPisemPlatbu(false);
  };

  const naZoznam = () => { setMeno(""); setFilter("zdravie"); setPisem(false); setPisemPlatbu(false); };

  /** Zmena kategórie klienta — ručný stav prebije automatický. */
  const nastavStav = async (novy: string) => {
    setPracujem(true); setChyba("");
    const r = await fetch("/api/override", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: meno, key: "status", value: novy }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!r.ok) { setChyba(r.error || "nepodarilo sa uložiť"); return; }
    // Stav žije v `data`, ktoré sem prichádzajú zhora — kým sa nenačítajú
    // znova, obrazovka by tvrdila staré. Radšej povedať, že treba obnoviť,
    // než ukázať číslo, ktoré už neplatí.
    setChyba("Uložené. Obnov stránku, aby sa stav prepočítal všade.");
  };

  const pridaj = async () => {
    setPracujem(true); setChyba("");
    const r = await fetch("/api/balicky", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "pridaj", klient: meno, ...f }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!r.ok) { setChyba(r.error || "nepodarilo sa uložiť"); return; }
    setF({ nazov: "", hodiny: "", platnostOd: dnesISO(), platnostDo: "", cenaCzk: "", poznamka: "" });
    setPisem(false);
    await nacitajBalicky();
  };

  /**
   * Oprava a zrušenie — pre to, čo appka vie, že napísal človek.
   *
   * Riadky z banky a z PTmindera sa tu neupravujú: ich pravdou je výpis,
   * respektíve export. Keby sa prepísali tu, najbližší import by ich
   * prepísal späť a nikto by nevedel, ktorá suma platí.
   *
   * Zrušenie NEMAŽE riadok, len ho odloží — platba je záznam v knihe.
   */
  const upravPlatbu = async (id: string) => {
    setPracujem(true); setChyba("");
    const r = await fetch("/api/platby", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "uprav", id, ...pl }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!r.ok) { setChyba(r.error || "nepodarilo sa uložiť"); return; }
    setUpravaPlatby(""); setPl({ datum: dnesISO(), suma: "", sposob: "hotovost", poznamka: "" });
    await nacitajPlatby();
  };

  const zrusPlatbu = async (id: string) => {
    if (!confirm("Zrušiť túto platbu? Zo súčtov zmizne, v knihe zostane.")) return;
    setPracujem(true); setChyba("");
    const r = await fetch("/api/platby", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "zrus", id }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!r.ok) { setChyba(r.error || "nepodarilo sa zrušiť"); return; }
    await nacitajPlatby();
  };

  const upravBalicek = async (id: string) => {
    setPracujem(true); setChyba("");
    const r = await fetch("/api/balicky", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "uprav", id, klient: meno, ...f }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!r.ok) { setChyba(r.error || "nepodarilo sa uložiť"); return; }
    setUpravaBalicka(""); setF({ nazov: "", hodiny: "", platnostOd: dnesISO(), platnostDo: "", cenaCzk: "", poznamka: "" });
    await nacitajBalicky();
  };

  const zrusBalicek = async (id: string) => {
    if (!confirm("Zrušiť tento balíček? Zo zostatku zmizne, v evidencii zostane.")) return;
    setPracujem(true); setChyba("");
    const r = await fetch("/api/balicky", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "zrus", id }),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!r.ok) { setChyba(r.error || "nepodarilo sa zrušiť"); return; }
    await nacitajBalicky();
  };

  if (!meno) {
    /**
     * Zoznam všetkých klientov — pod sebou, po abecede, s hlavičkou písmena.
     *
     * Prvá verzia ich sypala vedľa seba ako štítky; pri sedemdesiatich menách
     * z toho bola stena, v ktorej sa nedalo nič nájsť. Jerry, 23. 9. 2026:
     * „daj ich ako zoznam, nie vedľa seba, rozdeľ na A a všetci na A, B
     * a všetci na B, a nech je to rolovacie."
     *
     * Predvolene AKTÍVNI. Neaktívnych je viac než aktívnych a kto otvára
     * stôl, ide skoro vždy za niekým, kto chodí.
     */
    const vsetci = [...new Set([...mena, ...Object.keys(data.clientOverrides || {})])];
    const jeAktivny = (m: string) => (clients[m]?.status || "") !== "Neaktívny";
    const podlaStavu = vsetci.filter((m) => (stav === "aktivni" ? jeAktivny(m) : !jeAktivny(m)));
    const q = normName(hladam);
    // Hľadá sa cez OBE skupiny — kto píše meno, chce toho človeka nájsť,
    // nie sa dozvedieť, že je v druhej záložke.
    const zdrojHladania = q ? vsetci : podlaStavu;
    const vidno = (q ? zdrojHladania.filter((m) => normName(m).includes(q)) : podlaStavu)
      .sort((a, b) => a.localeCompare(b, "sk"));

    const skupiny: { pismeno: string; mena: string[] }[] = [];
    for (const m of vidno) {
      const p = (m.trim()[0] || "?").toLocaleUpperCase("sk");
      const posledna = skupiny[skupiny.length - 1];
      if (posledna && posledna.pismeno === p) posledna.mena.push(m);
      else skupiny.push({ pismeno: p, mena: [m] });
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          <input
            value={hladam}
            onChange={(e) => setHladam(e.target.value)}
            placeholder="hľadať klienta…"
            autoFocus
            style={{ flex: "1 1 240px", minWidth: 190, padding: "9px 12px", borderRadius: 10, fontSize: 13.5, background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
          />
          <div style={{ display: "flex", gap: 5 }}>
            <button onClick={() => setStav("aktivni")} style={prepinac(stav === "aktivni")}>Aktívni</button>
            <button onClick={() => setStav("neaktivni")} style={prepinac(stav === "neaktivni")}>Neaktívni</button>
          </div>
          <button onClick={() => setNovy(true)} style={{ ...navrhTlacidlo, borderColor: mix(C.green, 45), color: C.green, fontWeight: 600 }}>
            + Nový klient
          </button>
          <span style={{ fontSize: 11.5, color: C.textDim }}>{vidno.length}</span>
        </div>

        {novy && <NovyKlient onHotovo={(m: string | null) => { setNovy(false); if (m) setMeno(m); }} />}

        <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", marginTop: 12 }}>
          {skupiny.map((sk) => (
            <div key={sk.pismeno}>
              <div style={{
                position: "sticky", top: 0, background: C.card, zIndex: 1,
                fontSize: 11, fontWeight: 800, color: C.accentLight, letterSpacing: 0.6,
                padding: "6px 2px 4px", borderBottom: `1px solid ${mix(C.border, 60)}`,
              }}>
                {sk.pismeno}
              </div>
              {sk.mena.map((m) => {
                const c2 = clients[m];
                return (
                  <button key={m} onClick={() => { setMeno(m); setHladam(""); }} style={{
                    display: "flex", width: "100%", gap: 10, alignItems: "baseline", textAlign: "left",
                    padding: "7px 4px", border: "none", borderBottom: `1px solid ${mix(C.border, 35)}`,
                    background: "transparent", color: C.text, fontSize: 13, cursor: "pointer",
                  }}>
                    <span style={{ flex: 1 }}>{m}</span>
                    {c2 ? (
                      <span style={{ fontSize: 11, color: C.textDim }}>
                        {c2.primaryTrainer}
                        {c2.lastSession ? ` · naposledy ${fmtDMY(c2.lastSession)}` : ""}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: C.textDim }}>čaká na prvý tréning</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {!vidno.length && <Prazdne>Nikto taký. Skús menej písmen, alebo ho založ tlačidlom vyššie.</Prazdne>}
        </div>
      </div>
    );
  }

  return (
    /**
     * Profil podľa návrhu C (Jerry si ho vybral 23. 9. 2026): vľavo úzky
     * stĺpec s tým podstatným, vpravo celá história v čase s filtrami.
     *
     * Predtým to bolo dvadsať štítkov vedľa seba — Jerry: „vyzerá to extrémne
     * zle a som v tom mega stratený." Mal pravdu a je to tá istá chyba, pred
     * ktorou appka inde sama varuje: keď svieti všetko, nesvieti nič.
     * Naľavo je preto len to, na čo sa človek pýta zakaždým; zvyšok je pod
     * jedným tlačidlom a nekričí.
     */
    <div style={{ display: "flex", gap: 20, height: "100%", minHeight: 0 }}>

      <div style={{ width: 250, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", minHeight: 0 }}>
        <div>
          {/* Krok späť patrí hore vľavo (Jerry, 23. 9. 2026) — dole na konci
              stĺpca ho pri dlhom profile nebolo vidno bez rolovania. */}
          <button onClick={naZoznam} title="späť na zoznam" style={{
            border: "none", background: "transparent", color: C.textMuted,
            fontSize: 16, cursor: "pointer", padding: "0 6px 4px 0", lineHeight: 1,
          }}>←</button>
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>{meno}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            {/* Rozbaľovačka, nie riadok tlačidiel (Jerry, 23. 9. 2026).
                Prázdna hodnota vráti rozhodovanie appke — ručný zápis, na
                ktorý sa zabudne, je horší než žiadny. */}
            <select value={c?.statusOverride ? c.status : ""} disabled={!c || pracujem}
              onChange={(e) => void nastavStav(e.target.value)} style={{
                padding: "3px 7px", borderRadius: 7, fontSize: 11.5, cursor: "pointer",
                border: `1px solid ${zabudnutaPauza ? C.orange : C.border}`,
                background: zabudnutaPauza ? mix(C.orange, 15) : C.card,
                color: zabudnutaPauza ? C.orange : C.textMuted,
              }}>
              <option value="">{c ? `${c.status} (počíta appka)` : "čaká na prvý tréning"}</option>
              {["Aktívny", "Pauza", "Neaktívny"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            {c && <span style={{ fontSize: 11.5, color: C.textDim }}>{c.primaryTrainer}</span>}
          </div>

          {/* Pauzu ruší tréning sám (compute.ts) — tu sa to len POVIE, aby sa
              človek nedivil, prečo tam stav, ktorý zapísal, nie je. */}
          {c?.pauzaZrusenaTreningom && (
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
              Ručná pauza padla — odvtedy bol na tréningu. Appka stav počíta znova sama.
            </div>
          )}
          {/* „Neaktívny" tréning neprebíja: je to rozhodnutie o konci vzťahu,
              nie tvrdenie o budúcom týždni. Preto sa appka spýta. */}
          {zabudnutaPauza > 0 && !c?.pauzaZrusenaTreningom && (
            <div style={{ fontSize: 11, color: C.orange, marginTop: 6, lineHeight: 1.5 }}>
              Ručne nastavené „{c?.status}", ale odvtedy {zabudnutaPauza} {zabudnutaPauza === 1 ? "tréning" : zabudnutaPauza < 5 ? "tréningy" : "tréningov"}. Platí to ešte?
            </div>
          )}

        </div>

        {/* NEZAPLATENÉ, nie vymyslený rozdiel.
            Prvá verzia odčítavala „predané balíčky" od „zaplatené celkovo"
            a Anetke z toho vyšlo „predplatené 60 240 Kč" — porovnávala
            platby za celý život s balíčkami, ktoré sú v Kokpite od 2026.
            Číslo, ktoré nikomu nič nehovorí, je horšie než žiadne.
            Toto je priamy zdroj: nezaplatené poplatky z PTmindera. */}
        <div style={{ padding: "11px 13px", borderRadius: 11, background: mix(dlzi > 0 ? C.red : C.green, 10), border: `1px solid ${mix(dlzi > 0 ? C.red : C.green, 40)}` }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: dlzi > 0 ? C.red : C.green }}>
            {dlzi > 0 ? `nezaplatené ${fmtCZK(dlzi)}` : "nič nedlhuje"}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
            {dlzi > 0
              ? `${poplatkyKlienta.length} ${poplatkyKlienta.length === 1 ? "položka" : poplatkyKlienta.length < 5 ? "položky" : "položiek"} z PTmindera`
              : `zaplatil ${fmtCZK(zaplatene)} celkom`}
          </div>
        </div>

        {c && c.packageTotal > 0 && (
          <div style={{ padding: "11px 13px", borderRadius: 11, background: mix(C.accent, 10), border: `1px solid ${mix(C.accent, 40)}` }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.accentLight }}>
              {c.packageOdvodeny ? "≈" : ""}{c.packageRemaining} h zostáva
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
              {c.membership || `z ${c.packageTotal}`}
              {c.packageValidTo ? ` · do ${fmtDMY(c.packageValidTo)}` : ""}
            </div>
          </div>
        )}

        {c && (
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.95 }}>
            {/* Narodeniny s odpočtom namiesto „chodí od" (Jerry, 23. 9.):
                deň, kedy začal chodiť, sa nedá použiť na nič — narodeniny áno. */}
            {c.narodeniny ? (
              <div>
                <span style={{ color: C.textDim }}>narodeniny</span> {fmtDMY(c.narodeniny)}
                {doNarodenin(c.narodeniny) != null && (
                  <span style={{ color: doNarodenin(c.narodeniny)! <= 14 ? C.accentLight : C.textDim }}>
                    {" "}· {doNarodenin(c.narodeniny) === 0 ? "dnes!" : `o ${doNarodenin(c.narodeniny)} dní`}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ color: C.textDim }}>narodeniny nezapísané</div>
            )}
            <div><span style={{ color: C.textDim }}>dochádzka</span> {Math.round((c.attendance || 0) * 100)} %</div>
            <div><span style={{ color: C.textDim }}>Ø hodina</span> {c.avgPrice ? fmtCZK(Math.round(c.avgPrice)) : "—"}</div>
            {c.zdrojKto && <div><span style={{ color: C.textDim }}>priviedol</span> {c.zdrojKto}</div>}
          </div>
        )}

        <button onClick={() => setDetaily(!detaily)} style={{ ...navrhTlacidlo, textAlign: "left" }}>
          {detaily ? "Skryť detaily ▴" : `Ďalších ${dalsichUdajov} údajov ▾`}
        </button>
        {detaily && c && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {stitky(c, dopyt, priviedol, poplatkyKlienta, btcSats?.[meno]).map((x) => (
              <span key={x.k} title={x.info} style={{
                fontSize: 10.5, padding: "3px 7px", borderRadius: 6,
                background: mix(x.farba || C.border, 20), color: x.farba || C.textMuted,
                border: `1px solid ${mix(x.farba || C.border, 50)}`,
              }}>
                <span style={{ opacity: 0.7 }}>{x.k}</span> {x.v}
              </span>
            ))}
          </div>
        )}

      </div>

      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, letterSpacing: 0.5 }}>VŠETKO V ČASE</div>
          <div style={{ flexGrow: 1 }} />
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {/* „Tréningy" a „Odkiaľ prišiel" sú preč (Jerry, 23. 9. 2026):
                prvé bolo to isté, čo „všetko" bez dvoch riadkov, druhé sa
                pozerá raz za život a kradlo miesto tomu, čo sa rieši denne. */}
            {([["zdravie", "zdravie"], ["vsetko", "všetko"], ["peniaze", "peniaze"], ["balicky", "balíčky"], ["poznamky", "poznámky"]] as const).map(([id, l]) => (
              <button key={id} onClick={() => setFilter(id)} style={prepinac(filter === id)}>{l}</button>
            ))}
          </div>
        </div>

        {/* Pridávanie patrí k svojej záložke (Jerry, 23. 9. 2026). Tlačidlo
            „nahodiť balíček" pri zozname tréningov je ponuka na vec, ktorú
            človek v tej chvíli nerieši — a pri piatich takých tlačidlách sa
            prestanú čítať všetky. */}
        {filter === "balicky" && (
          <button onClick={() => setPisem(!pisem)} style={{ ...navrhTlacidlo, marginTop: 10, alignSelf: "flex-start", borderColor: mix(C.green, 45), color: C.green, fontWeight: 600 }}>
            {pisem ? "Zavrieť" : "+ Nahodiť balíček alebo členstvo"}
          </button>
        )}
        {/* Bitcoin je pod Peniazmi vlastná záložka (Jerry, 23. 9. 2026).
            Do zoznamu platieb sa miešať nedá: v knihe je to satoshi, nie
            koruny, a jedna suma tam má dve hodnoty — vtedajšiu a dnešnú. */}
        {filter === "peniaze" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
            {([["platby", "platby"], ["bitcoin", "₿ bitcoin"]] as const).map(([id, l]) => (
              <button key={id} onClick={() => setPenazSub(id)} style={prepinac(penazSub === id)}>{l}</button>
            ))}
            {penazSub === "platby" && (
              <button onClick={() => { setPisemPlatbu(!pisemPlatbu); setUpravaPlatby(""); }} style={{ ...navrhTlacidlo, borderColor: mix(C.green, 45), color: C.green, fontWeight: 600 }}>
                {pisemPlatbu ? "Zavrieť" : "+ Pridať platbu"}
              </button>
            )}
          </div>
        )}
        {filter === "balicky" && pisem && <FormularBalicka f={f} setF={setF} pracujem={pracujem} onUloz={() => void pridaj()} />}
        {filter === "peniaze" && penazSub === "platby" && pisemPlatbu && !upravaPlatby && (
          <FormularPlatby
            p={pl}
            setP={setPl}
            pracujem={pracujem}
            onUloz={() => void pridajPlatbu()}
          />
        )}
        {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}

        <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", marginTop: 10 }}>
          {filter === "zdravie" && zdravie && (
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {zdravie.signaly.map((sig) => (
                <div key={sig.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, fontSize: 12.5 }}>
                    <span style={{ color: C.textMuted }}>{sig.nazov}</span>
                    <span style={{ color: TON[sig.tón], fontWeight: 700 }}>{sig.hodnota}</span>
                  </div>
                  {/* Pás s mierkou. V náhľade vyzeral inak než naživo, lebo
                      výplň po priemer bola takmer neviditeľná a značky sa
                      strácali — bez nich pás nehovorí nič, len zaberá miesto.
                      Teraz je výplň po HODNOTU klienta (to je to, čo sa číta
                      ako prvé) a priemer je zvislá čiarka s popiskom. */}
                  <div style={{ position: "relative", height: 10, background: mix(C.border, 90), borderRadius: 5, marginTop: 8, overflow: "visible" }}>
                    {sig.tón !== "nevieme" && (
                      <>
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(2, sig.podiel * 100)}%`, background: TON[sig.tón], borderRadius: 5, opacity: 0.85 }} />
                        <div style={{ position: "absolute", left: `${sig.priemer * 100}%`, top: -4, width: 2, height: 18, background: C.textMuted }} title="priemer klientely" />
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 10.5, color: C.textDim, marginTop: 6 }}>
                    <span>{sig.detail}</span>
                    {sig.tón !== "nevieme" && <span style={{ whiteSpace: "nowrap" }}>│ priemer klientely</span>}
                  </div>
                </div>
              ))}
              <div style={{ padding: "11px 13px", borderRadius: 10, background: mix(TON[zdravie.tón], 12), border: `1px solid ${mix(TON[zdravie.tón], 45)}`, fontSize: 12.5, color: C.textMuted, lineHeight: 1.55 }}>
                <b style={{ color: TON[zdravie.tón] }}>{zdravie.zaver}</b>
                <div style={{ fontSize: 11, color: C.textDim, marginTop: 5 }}>
                  Sivá značka na páse je priemer klientely. Appka nepredpovedá odchod — hovorí, čo sa zmenilo.
                </div>
              </div>
            </div>
          )}

          {filter === "vsetko" && buduce.map((z) => (
            <div key={z} style={{ ...riadok, color: C.blue }}>
              <span style={stlpecDen}>{fmtDMY(z.slice(0, 10))}</span>
              <span style={{ flex: 1 }}>objednané {z.slice(11, 16)} · z kalendára</span>
            </div>
          ))}

          {/* VLASTNÁ EVIDENCIA — to, čo Jerry nahodil v Kokpite.
              Doteraz sa nahodený balíček nikde nezobrazoval: zapísal sa do
              databázy a z obrazovky zmizol. Len tieto riadky sa dajú upraviť
              a zrušiť; PTminder pod nimi je export, nie zápisník. */}
          {filter === "balicky" && !!mojeBalicky.length && (
            <div style={{ marginBottom: 14 }}>
              <div style={hlavicka}>NAHODENÉ V KOKPITE</div>
              {mojeBalicky.map((b) => (
                <div key={b.id}>
                  <div style={riadok}>
                    <span style={stlpecDen}>{fmtDMY(b.platnost_od)}</span>
                    <span style={{ flex: 1 }}>
                      {b.nazov}
                      <span style={{ color: C.textDim }}>
                        {b.hodiny ? ` · ${b.hodiny} h` : ""}
                        {b.platnost_do ? ` · do ${fmtDMY(b.platnost_do)}` : ""}
                        {b.poznamka ? ` · ${b.poznamka}` : ""}
                      </span>
                    </span>
                    {!!b.cena_czk && <span style={{ color: C.textMuted }}>{fmtCZK(b.cena_czk)}</span>}
                    <Upravit
                      naUpravu={() => {
                        setUpravaBalicka(b.id); setPisem(false);
                        setF({
                          nazov: b.nazov, hodiny: b.hodiny == null ? "" : String(b.hodiny),
                          platnostOd: b.platnost_od, platnostDo: b.platnost_do || "",
                          cenaCzk: b.cena_czk == null ? "" : String(b.cena_czk), poznamka: b.poznamka || "",
                        });
                      }}
                      naZrusenie={() => void zrusBalicek(b.id)}
                      pracujem={pracujem}
                    />
                  </div>
                  {upravaBalicka === b.id && (
                    <FormularBalicka f={f} setF={setF} pracujem={pracujem} onUloz={() => void upravBalicek(b.id)} popis="Uložiť zmenu" />
                  )}
                </div>
              ))}
              <div style={hlavicka}>Z PTMINDERA</div>
            </div>
          )}

          {/* VLASTNÉ PLATBY — banka z výpisu a hotovosť zo zošita.
              Hotovosť sa dá opraviť aj zrušiť, riadok z banky nie: jeho
              pravdou je výpis a najbližší import by opravu aj tak prepísal. */}
          {filter === "peniaze" && penazSub === "platby" && !!mojePlatby.length && (
            <div style={{ marginBottom: 14 }}>
              <div style={hlavicka}>V KOKPITE</div>
              {mojePlatby.map((x) => (
                <div key={x.id}>
                  <div style={riadok}>
                    <span style={stlpecDen}>{fmtDMY(x.datum)}</span>
                    <span style={{ flex: 1, color: C.green }}>
                      {SPOSOB[x.sposob] || x.sposob}
                      {x.fio_id ? <span style={{ color: C.textDim }}> · z výpisu</span> : ""}
                      {x.poznamka ? <span style={{ color: C.textDim }}> · {x.poznamka}</span> : ""}
                    </span>
                    <span style={{ color: C.green, fontWeight: 700 }}>{fmtCZK(x.suma_czk)}</span>
                    {x.fio_id ? <span style={{ width: 46 }} /> : (
                      <Upravit
                        naUpravu={() => {
                          setUpravaPlatby(x.id); setPisemPlatbu(false);
                          setPl({ datum: x.datum.slice(0, 10), suma: String(x.suma_czk), sposob: x.sposob, poznamka: x.poznamka || "" });
                        }}
                        naZrusenie={() => void zrusPlatbu(x.id)}
                        pracujem={pracujem}
                      />
                    )}
                  </div>
                  {upravaPlatby === x.id && (
                    <FormularPlatby p={pl} setP={setPl} pracujem={pracujem} onUloz={() => void upravPlatbu(x.id)} popis="Uložiť zmenu" />
                  )}
                </div>
              ))}
              <div style={hlavicka}>Z PTMINDERA</div>
            </div>
          )}

          {/* BITCOIN — tá istá tabuľka ako v BTC appke, len pre jedného človeka.
              „Vtedy" je suma, za ktorú sa tréning predal; „dnes" je, čo tie
              satoshi stoja teraz. Bez kurzu sa druhý stĺpec netvrdí. */}
          {filter === "peniaze" && penazSub === "bitcoin" && (
            mojeBtc.length ? (
              <div>
                {(() => {
                  const sats = mojeBtc.reduce((a, x) => a + x.sats, 0);
                  const vtedy = mojeBtc.reduce((a, x) => a + x.vtedy, 0);
                  const dnes = satsNaCzk(sats, btc?.kurz ?? null);
                  const rozdiel = dnes === null ? null : dnes - vtedy;
                  return (
                    <div style={{ padding: "12px 14px", borderRadius: 11, background: mix(C.orange, 10), border: `1px solid ${mix(C.orange, 40)}`, marginBottom: 12 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: C.orange }}>{sats.toLocaleString("cs-CZ")} sats</div>
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                        zaplatil za {fmtCZK(vtedy)}
                        {dnes !== null && <> · dnes {fmtCZK(dnes)}</>}
                        {rozdiel !== null && vtedy > 0 && (
                          <span style={{ color: rozdiel >= 0 ? C.green : C.red, fontWeight: 700 }}>
                            {" "}({rozdiel >= 0 ? "+" : ""}{Math.round((rozdiel / vtedy) * 1000) / 10} %)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 5 }}>
                        {mojeBtc.length} {mojeBtc.length === 1 ? "platba" : mojeBtc.length < 5 ? "platby" : "platieb"}
                        {btc?.kedy ? ` · kurz z ${fmtDMY(String(btc.kedy).slice(0, 10))}` : " · kurz nepoznáme, dnešná hodnota sa netvrdí"}
                      </div>
                    </div>
                  );
                })()}
                {mojeBtc.map((x, i) => (
                  <div key={i} style={riadok}>
                    <span style={stlpecDen}>{fmtDMY(x.datum)}</span>
                    <span style={{ flex: 1, color: C.orange }}>{x.sats.toLocaleString("cs-CZ")} sats</span>
                    <span style={{ color: C.textMuted }}>{fmtCZK(x.vtedy)}</span>
                    {x.dnes !== null && (
                      <span style={{ width: 96, textAlign: "right", color: x.dnes >= x.vtedy ? C.green : C.red, fontWeight: 700 }}>
                        → {fmtCZK(x.dnes)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Prazdne>
                {btc?.platby?.length
                  ? "Tento klient v bitcoine neplatil. Platby sú v appke PSB Bitcoin."
                  : "Bitcoinová kniha sa nenačítala."}
              </Prazdne>
            )
          )}

          {filter !== "poznamky" && filter !== "zdravie" && !(filter === "peniaze" && penazSub === "bitcoin") && os
            .filter((x) => filter === "vsetko"
              || (filter === "peniaze" && x.druh === "platba")
              || (filter === "balicky" && (x.druh === "balicekOd" || x.druh === "balicekDo")))
            .map((x, i) => <RiadokOsi key={i} u={x} />)}

          {filter === "poznamky" && (
            <>
              {c?.trainerNote && <Blok nadpis="Poznámka trénera">{c.trainerNote}</Blok>}
              {c?.precoNeprisiel && <Blok nadpis="Prečo po úvodnom neprišiel">{c.precoNeprisiel}</Blok>}
              {c?.duch && <Blok nadpis="Odchod">{c.duch}</Blok>}
              {c?.specialRateNote && <Blok nadpis="Špeciálna sadzba">{c.specialRateNote}</Blok>}
              {zavery.map((z, i) => (
                <Blok key={i} nadpis="Záver z debaty">{(z as { text?: string }).text || ""}</Blok>
              ))}
              <Dennik meno={meno} limit={12} />
            </>
          )}

        </div>
      </div>
    </div>
  );
}

/** Koľko dní do najbližších narodenín. null = dátum nedáva zmysel. */
function doNarodenin(narodeniny: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(narodeniny);
  if (!m) return null;
  const dnes = new Date();
  const dnesUTC = Date.UTC(dnes.getUTCFullYear(), dnes.getUTCMonth(), dnes.getUTCDate());
  let d = Date.UTC(dnes.getUTCFullYear(), Number(m[2]) - 1, Number(m[3]));
  if (d < dnesUTC) d = Date.UTC(dnes.getUTCFullYear() + 1, Number(m[2]) - 1, Number(m[3]));
  return Math.round((d - dnesUTC) / 86400000);
}

function RiadokOsi({ u }: { u: ReturnType<typeof osCasuKlienta>[number] }) {
  if (u.druh === "balicekOd") {
    return (
      <div style={{ ...riadok, background: mix(C.accent, 10), borderRadius: 7, padding: "8px 9px", marginTop: 4, border: "none" }}>
        <span style={stlpecDen}>{fmtDMY(u.den)}</span>
        <span style={{ flex: 1 }}>
          <b>{u.nazov}</b>
          <span style={{ color: C.textMuted }}>
            {" "}· {u.hodin ? `${u.hodin} h` : "bez limitu"}{u.doDna ? ` · do ${fmtDMY(u.doDna)}` : ""}
            {u.zaplatene ? ` · ${fmtCZK(u.zaplatene)}` : ""}
          </span>
        </span>
      </div>
    );
  }
  if (u.druh === "balicekDo") {
    return <div style={{ ...riadok, color: C.textDim }}><span style={stlpecDen}>{fmtDMY(u.den)}</span><span style={{ flex: 1 }}>skončila platnosť — {u.nazov}</span></div>;
  }
  if (u.druh === "platba") {
    return (
      <div style={riadok}>
        <span style={stlpecDen}>{fmtDMY(u.den)}</span>
        <span style={{ flex: 1, color: C.green }}>zaplatil {u.metoda === "bank" ? "prevodom" : u.metoda === "cash" ? "hotovosť" : "iné"}</span>
        <span style={{ color: C.green, fontWeight: 700 }}>{fmtCZK(u.suma)}</span>
      </div>
    );
  }
  return (
    <div style={riadok}>
      <span style={stlpecDen}>{fmtDMY(u.den)}</span>
      <span style={{ flex: 1, color: C.textMuted }}>tréning{u.cas ? ` ${u.cas}` : ""}{u.trener ? ` · ${u.trener}` : ""}</span>
      {u.zKalendara && <span style={{ fontSize: 11, color: C.blue }}>z kalendára</span>}
    </div>
  );
}

function FormularBalicka({ f, setF, pracujem, onUloz, popis = "Nahodiť" }: {
  f: Record<string, string>;
  setF: (v: never) => void;
  pracujem: boolean;
  onUloz: () => void;
  /** Ten istý formulár slúži na nahodenie aj na opravu. */
  popis?: string;
}) {
  /**
   * Zo šablóny sa predvyplní VŠETKO, čo sa dá — a dá sa to prepísať.
   *
   * PSB má pevné formáty (prevadzka.md, oddiel 1), takže písať názov rukou
   * znamená len šancu na preklep: iný názov = iný „typ" balíčka a porovnanie
   * s PTminderom by ho hlásilo ako rozdiel navždy. Ceny sú katalógové, lebo
   * zľavy (Jarek, barter, bitcoin) sú v PSB bežné — predvyplnenie je pomoc,
   * nie tvrdenie.
   */
  const zoSablony = (nazov: string) => {
    const sab = CENNIK.find((x) => x.nazov === nazov);
    if (!sab) { setF({ ...f, nazov } as never); return; }
    setF({
      ...f,
      nazov: sab.nazov,
      hodiny: sab.hodiny == null ? "" : String(sab.hodiny),
      cenaCzk: sab.cena == null ? "" : String(sab.cena),
      platnostDo: platnostDo(f.platnostOd, sab.tyzdnov),
    } as never);
  };

  /**
   * Zmena začiatku musí posunúť aj koniec.
   *
   * Prvá verzia počítala „platí do" LEN pri výbere šablóny, takže keď Jerry
   * potom prepísal „platí od", koniec zostal starý a ticho nesedel. To je tá
   * istá chyba ako formulár, ktorý sa nakreslí skôr, než dorazia dáta:
   * obrazovka ukazuje niečo, čo už neplatí, a nič o tom nepovie.
   */
  const zmenOd = (od: string) => {
    const sab = CENNIK.find((x) => x.nazov === f.nazov);
    setF({ ...f, platnostOd: od, platnostDo: sab ? platnostDo(od, sab.tyzdnov) : f.platnostDo } as never);
  };

  const skupiny = ["Offline", "Online", "Špeciálne"] as const;

  return (
    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", padding: "11px 12px", borderRadius: 10, background: mix(C.border, 40) }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim }}>
        balíček alebo členstvo
        <select
          value={CENNIK.some((x) => x.nazov === f.nazov) ? f.nazov : ""}
          onChange={(e) => zoSablony(e.target.value)}
          style={{ width: 226, padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
        >
          <option value="">— vyber zo zoznamu —</option>
          {skupiny.map((sk) => (
            <optgroup key={sk} label={sk}>
              {CENNIK.filter((x) => x.skupina === sk).map((x) => (
                <option key={x.nazov} value={x.nazov}>
                  {x.nazov}{x.cena ? ` · ${x.cena.toLocaleString("sk-SK")} Kč` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {([
        { k: "hodiny", l: "hodín", w: 70, typ: "text" },
        { k: "platnostOd", l: "platí od", w: 145, typ: "date", vlastne: true },
        { k: "platnostDo", l: "platí do", w: 145, typ: "date" },
        { k: "cenaCzk", l: "cena Kč", w: 95, typ: "text" },
        { k: "poznamka", l: "poznámka", w: 150, typ: "text" },
      ]).map((x) => (
        <label key={x.k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim }}>
          {x.l}
          <input
            type={x.typ}
            value={f[x.k]}
            onChange={(e) => ((x as { vlastne?: boolean }).vlastne ? zmenOd(e.target.value) : setF({ ...f, [x.k]: e.target.value } as never))}
            style={{ width: x.w, padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text, colorScheme: "dark" }}
          />
        </label>
      ))}

      {/* Názov mimo cenníka je dovolený (výnimky sa dejú), ale je vidieť. */}
      {f.nazov && !CENNIK.some((x) => x.nazov === f.nazov) && (
        <input
          value={f.nazov}
          onChange={(e) => setF({ ...f, nazov: e.target.value } as never)}
          placeholder="vlastný názov"
          style={{ width: 190, padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.orange}`, background: C.bg, color: C.text }}
        />
      )}

      <button onClick={onUloz} disabled={pracujem || !f.nazov.trim()} style={{
        padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
        cursor: f.nazov.trim() ? "pointer" : "not-allowed",
        border: `1px solid ${mix(C.green, 50)}`,
        background: f.nazov.trim() ? mix(C.green, 12) : "transparent",
        color: f.nazov.trim() ? C.green : C.textDim,
      }}>
        {pracujem ? "…" : popis}
      </button>
    </div>
  );
}

/**
 * Ručná platba — hotovosť zo zošita, barter, čokoľvek, čo nejde cez banku.
 *
 * Bankové platby sa priraďujú vo vlastnej karte z výpisu; sem sa píše to,
 * čo v banke nikdy nebude. Preto je predvolená „hotovosť" a nie prevod —
 * prevod, ktorý by sa sem zapísal ručne, by sa raz spároval z výpisu ešte
 * raz a klient by mal zaplatené dvakrát.
 */
function FormularPlatby({ p, setP, pracujem, onUloz, popis = "Uložiť platbu" }: {
  p: { datum: string; suma: string; sposob: string; poznamka: string };
  setP: (v: never) => void;
  pracujem: boolean;
  onUloz: () => void;
  popis?: string;
}) {
  const platne = Number(p.suma) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.datum);
  return (
    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", padding: "11px 12px", borderRadius: 10, background: mix(C.border, 40) }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim }}>
        kedy zaplatil
        <input type="date" value={p.datum} onChange={(e) => setP({ ...p, datum: e.target.value } as never)}
          style={{ width: 145, padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text, colorScheme: "dark" }} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim }}>
        suma Kč
        <input value={p.suma} onChange={(e) => setP({ ...p, suma: e.target.value } as never)}
          style={{ width: 100, padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim }}>
        ako
        <select value={p.sposob} onChange={(e) => setP({ ...p, sposob: e.target.value } as never)}
          style={{ width: 130, padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}>
          <option value="hotovost">hotovosť</option>
          <option value="prevod">bankový prevod</option>
          <option value="bitcoin">bitcoin</option>
          <option value="ine">iné (barter)</option>
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim }}>
        poznámka
        <input value={p.poznamka} onChange={(e) => setP({ ...p, poznamka: e.target.value } as never)}
          style={{ width: 180, padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }} />
      </label>
      <button onClick={onUloz} disabled={pracujem || !platne} style={{
        padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
        cursor: platne ? "pointer" : "not-allowed",
        border: `1px solid ${mix(C.green, 50)}`,
        background: platne ? mix(C.green, 12) : "transparent",
        color: platne ? C.green : C.textDim,
      }}>
        {pracujem ? "…" : popis}
      </button>
      <div style={{ fontSize: 11, color: p.sposob === "prevod" ? C.orange : C.textDim, flexBasis: "100%", lineHeight: 1.5 }}>
        {p.sposob === "prevod"
          ? "Pozor: prevod z účtu sa sem dostane sám z výpisu Fio. Ručne ho píš len vtedy, keď vo výpise nie je (cudzí účet, Revolut) — inak bude klient zaplatený dvakrát."
          : "Bankové platby sem nepíš — tie sa priraďujú z výpisu v karte „Platby z banky“, inak by sa započítali dvakrát."}
      </div>
    </div>
  );
}

/**
 * Štítky s tým, čo o klientovi appka vie. Prázdne polia sa NEUKAZUJÚ —
 * dvadsať prázdnych štítkov by z hlavičky spravilo tapetu a to, čo tam
 * naozaj je, by sa v nich stratilo.
 */
function stitky(
  c: ClientAgg,
  dopyt: { source?: string } | null,
  priviedol: string[],
  poplatky: unknown[],
  satoshi?: number,
): { k: string; v: string; farba?: string; info?: string }[] {
  const out: { k: string; v: string; farba?: string; info?: string }[] = [];
  const pridaj = (k: string, v: string | number | undefined | null | false, farba?: string, info?: string) => {
    if (v === undefined || v === null || v === "" || v === false) return;
    out.push({ k, v: String(v), farba, info });
  };

  pridaj("od", c.firstSession ? fmtDMY(c.firstSession) : "", undefined, "prvé sedenie v dátach");
  pridaj("naposledy", c.lastSession ? fmtDMY(c.lastSession) : "");
  pridaj("segment", c.segment);
  pridaj("dochádzka", c.attendance ? `${Math.round(c.attendance * 100)} %` : "");
  pridaj("hodín", c.totalHours ? c.totalHours.toFixed(0) : "");
  pridaj("Ø hodina", c.avgPrice ? fmtCZK(Math.round(c.avgPrice)) : "");
  pridaj("narodeniny", c.narodeniny ? fmtDMY(c.narodeniny) : "", C.accentLight);
  pridaj("členstvo", c.membership);
  if (c.packageTotal) {
    pridaj("balíček", `${c.packageOdvodeny ? "≈" : ""}${c.packageRemaining}/${c.packageTotal}`,
      c.packageRemaining <= 1 ? C.orange : undefined,
      c.packageOdkial || "zostatok z exportu PTmindera");
  }
  pridaj("platí do", c.packageValidTo ? fmtDMY(c.packageValidTo) : "");
  pridaj("zdroj", c.zdroj || dopyt?.source);
  pridaj("priviedol ho", c.zdrojKto);
  if (priviedol.length) pridaj("priviedol", `${priviedol.length}`, C.green);
  pridaj("6M", c.is6m ? "áno" : "", C.accentLight);
  pridaj("zmluva", c.contractSigned ? "podpísaná" : "", C.green);
  pridaj("sadzba", c.specialRate ? "špeciálna" : "", C.orange, c.specialRateNote);
  pridaj("bitcoin", c.bitcoin ? (satoshi ? `${satoshi.toLocaleString("sk-SK")} sat` : "áno") : "", C.accentLight);
  pridaj("modalita", c.modality);
  pridaj("zastupoval", c.substituteCount ? `${c.substituteCount}×` : "");
  if (poplatky.length) pridaj("nezaplatené", `${poplatky.length}`, C.red, "poplatky z PTmindera");
  pridaj("pauza do", c.pauseUntil ? fmtDMY(c.pauseUntil) : "", C.orange);
  pridaj("odišiel", c.duch ? "áno" : "", C.red, c.duch);
  return out;
}

const Blok = ({ nadpis, children }: { nadpis: string; children: React.ReactNode }) => (
  <div style={{ padding: "8px 10px", borderRadius: 8, background: mix(C.border, 40), marginBottom: 8 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textDim, letterSpacing: 0.4 }}>{nadpis.toUpperCase()}</div>
    <div style={{ fontSize: 12.5, color: C.text, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{children}</div>
  </div>
);

/**
 * Nový klient — založený v Kokpite skôr, než o ňom vie PTminder.
 *
 * Jerry, 23. 9. 2026: „potrebujem aj vytvoriť nového klienta."
 *
 * Zakladá sa riadok v `client_overrides`, takže človek existuje hneď —
 * dá sa mu zapísať balíček, poznámka aj narodeniny. Sedenia a platby
 * pribudnú samy, keď dorazí export.
 *
 * PRETO JE MENO NAJDÔLEŽITEJŠIE POLE. Spája sa podľa neho: keď sa tu napíše
 * inak než v PTminderi, vzniknú dvaja ľudia a všetko sa rozdelí na polovicu.
 * Karta to hovorí nahlas — nie je to detail, ktorý si niekto domyslí.
 */
function NovyKlient({ onHotovo }: { onHotovo: (meno: string | null) => void }) {
  const [f, setF] = useState({ meno: "", narodeniny: "", zdroj: "", zdrojKto: "", poznamka: "" });
  const [pracujem, setPracujem] = useState(false);
  const [chyba, setChyba] = useState("");

  const zaloz = async () => {
    const meno = f.meno.trim();
    if (meno.length < 3) { setChyba("Meno je príliš krátke."); return; }
    setPracujem(true); setChyba("");
    // Prvé pole zakladá riadok, ostatné ho dopĺňajú. Keď prvé zlyhá, ďalšie
    // sa neposielajú — inak by sa polia zapisovali do neexistujúceho človeka.
    const polia: [string, string][] = [
      ["zdroj", f.zdroj.trim() || "ine"],
      ["narodeniny", f.narodeniny.trim()],
      ["zdrojKto", f.zdrojKto.trim()],
      ["trainerNote", f.poznamka.trim()],
    ];
    for (const [key, value] of polia) {
      if (!value) continue;
      const r = await fetch("/api/override", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: meno, key, value }),
      }).then((x) => x.json()).catch(() => ({ ok: false, error: "spojenie" }));
      if (!r.ok) { setPracujem(false); setChyba(r.error || "nepodarilo sa založiť"); return; }
    }
    setPracujem(false);
    onHotovo(meno);
  };

  return (
    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, border: `1px solid ${mix(C.green, 40)}`, background: mix(C.green, 8) }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Nový klient</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {([
          { k: "meno" as const, l: "meno a priezvisko", w: 220 },
          { k: "narodeniny" as const, l: "narodeniny (RRRR-MM-DD)", w: 170 },
          { k: "zdroj" as const, l: "odkiaľ prišiel", w: 150 },
          { k: "zdrojKto" as const, l: "kto ho priviedol", w: 170 },
          { k: "poznamka" as const, l: "poznámka", w: 200 },
        ]).map((x) => (
          <label key={x.k} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10.5, color: C.textDim }}>
            {x.l}
            <input
              value={f[x.k]}
              onChange={(e) => setF({ ...f, [x.k]: e.target.value })}
              style={{ width: x.w, padding: "7px 9px", borderRadius: 8, fontSize: 12.5, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
            />
          </label>
        ))}
        <button onClick={() => void zaloz()} disabled={pracujem || f.meno.trim().length < 3} style={{
          padding: "8px 15px", borderRadius: 9, fontSize: 12.5, fontWeight: 700,
          cursor: f.meno.trim().length >= 3 ? "pointer" : "not-allowed",
          border: `1px solid ${mix(C.green, 50)}`,
          background: f.meno.trim().length >= 3 ? mix(C.green, 14) : "transparent",
          color: f.meno.trim().length >= 3 ? C.green : C.textDim,
        }}>
          {pracujem ? "…" : "Založiť"}
        </button>
        <button onClick={() => onHotovo(null)} style={navrhTlacidlo}>Zrušiť</button>
      </div>
      <div style={{ fontSize: 11.5, color: C.orange, marginTop: 9, lineHeight: 1.5 }}>
        Meno napíš PRESNE tak, ako ho budeš mať v PTminderi. Podľa neho sa to spojí — pri inom
        zápise vzniknú dvaja ľudia a sedenia aj platby sa rozdelia medzi nich.
      </div>
      {chyba && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>{chyba}</div>}
    </div>
  );
}

const Prazdne = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 12, color: C.textDim, padding: "10px 2px" }}>{children}</div>
);

const riadok = {
  display: "flex", gap: 10, alignItems: "baseline",
  padding: "6px 2px", borderBottom: `1px solid ${mix(C.border, 40)}`, fontSize: 12,
};
const stlpecDen = { color: C.textDim, minWidth: 74, fontVariantNumeric: "tabular-nums" as const };

/** Farba podľa tónu signálu — jedno miesto, nech sa pásy a záver nerozídu. */
/** Spôsob platby ľudsky. `prevod` píše Jerry ručne, `bank` prišlo z exportu. */
const SPOSOB: Record<string, string> = {
  hotovost: "hotovosť", prevod: "bankový prevod", bitcoin: "bitcoin", ine: "iné",
  cash: "hotovosť", bank: "prevodom",
};

const hlavicka: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: C.textDim, letterSpacing: 0.6,
  padding: "8px 0 4px", borderBottom: `1px solid ${mix(C.border, 60)}`, marginBottom: 2,
};

/**
 * Ceruzka a krížik. Sú malé a sivé zámerne — pri každom riadku svieti
 * tlačidlo „zmazať" len dovtedy, kým ho niekto nestlačí omylom.
 */
const Upravit = ({ naUpravu, naZrusenie, pracujem }: { naUpravu: () => void; naZrusenie: () => void; pracujem: boolean }) => (
  <span style={{ display: "flex", gap: 4, width: 46, justifyContent: "flex-end" }}>
    {([["✎", naUpravu, "upraviť"], ["✕", naZrusenie, "zrušiť"]] as const).map(([z, fn, t]) => (
      <button key={z} onClick={fn} disabled={pracujem} title={t} style={{
        border: "none", background: "transparent", color: C.textDim,
        fontSize: 12, cursor: pracujem ? "not-allowed" : "pointer", padding: "0 2px", lineHeight: 1,
      }}>{z}</button>
    ))}
  </span>
);

const TON: Record<string, string> = { dobre: C.green, vsimnut: C.orange, zle: C.red, nevieme: C.textDim };

const prepinac = (on: boolean) => ({
  padding: "6px 11px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: `1px solid ${on ? C.accent : C.border}`,
  background: on ? C.accentBg : "transparent",
  color: on ? C.accentLight : C.textMuted,
});

const navrhTlacidlo = {
  padding: "6px 11px", borderRadius: 8, fontSize: 12, cursor: "pointer",
  border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted,
};

const podzalozka = (on: boolean) => ({
  padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
  border: `1px solid ${on ? C.accent : C.border}`,
  background: on ? C.accentBg : "transparent",
  color: on ? C.accentLight : C.textMuted,
});
