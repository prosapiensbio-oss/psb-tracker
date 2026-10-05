import { useEffect, useMemo, useState } from "react";

import { fmtCZK, fmtDMY } from "../../lib/psb/format";
import type { osCasuKlienta } from "../../lib/psb/klientOsCasu";
import { C, mix } from "../../lib/psb/theme";
import { cisloPreBranu, dlzkaSpravy, textSms } from "../../lib/psb/sms";
import { hod, poslednychMesiacov, vypisAkoText, vypisHodin, zaciatokBalicka, stavPreSpravu } from "../../lib/psb/vypisHodin";
import type { RiadokVypisu } from "../../lib/psb/vypisHodin";
import { dnesPraha } from "../../lib/psb/cas";

/**
 * Ten istý riadok, ale slovami pre klienta.
 *
 * V profile stojí „tréning 5:00pm · Jerry" a „zaplatil prevodom" — to je
 * jazyk appky. Klientovi ide veta o ňom: čo si kúpil, kedy prišiel, čo
 * zaplatil. Čas sa neopakuje, ten nesie os pod popisom.
 */
const popisPreKlienta = (r: RiadokVypisu): string => {
  if (r.druh === "balicekOd") return r.popis.split("·")[0].trim();
  if (r.druh === "platba") return `zaplatené ${r.popis.replace(/^(platba|zaplatil)\s*/i, "").split("·")[0].trim()}`;
  return "tréning";
};

/**
 * VÝPIS HODÍN PRE KLIENTA.
 *
 * Jerry, 26. 9. 2026: „s možnosťou vytvoriť z toho report a poslať to
 * klientovi na kontrolu, samozrejme aj s filtrom, keby náhodou má dlhoročnú
 * históriu a ja mu chcem poslať kontrolu len za posledných pár týždňov."
 *
 * Výpis ide do TELA mailu, nie do prílohy. Klient ho má prečítať a povedať
 * „toto sedí" alebo „tu nie" — príloha, ktorú treba otvárať, to len sťaží.
 * A text sa dá pred odoslaním prepísať, rovnako ako pri faktúre.
 */

type Os = ReturnType<typeof osCasuKlienta>;

const OBDOBIA: { l: string; m: number; uplna?: boolean }[] = [
  /**
   * `-1` = od začiatku posledného balíčka.
   *
   * Je to predvolené obdobie, lebo mail hovorí o TOMTO balíčku: ako sa minul
   * a čo príde ďalej. Kalendárne okno (mesiac, tri) by os začalo uprostred
   * a prvý bod „6 h" by v nej chýbal.
   */
  { l: "posledný balíček", m: -1 },
  { l: "posledný mesiac", m: 1 },
  { l: "3 mesiace", m: 3 },
  { l: "6 mesiacov", m: 6 },
  { l: "všetko", m: 0 },
  /**
   * Na vyžiadanie klienta (Jerry, 29. 9. 2026): celá história hodín AJ
   * platieb. To isté okno ako „všetko", ale mail sa inak volá, nehovorí
   * o dochodenom balíčku a v dlaždici je zaplatená suma namiesto tempa.
   */
  { l: "celá história + platby", m: 0, uplna: true },
];

export function VypisHodinPanel({ meno, os, email, zostatokTeraz, trener = "", mesiacov = 0, hodinSpolu = 0, tempo = 0, odkedy = "", cenaBalicka = 0, telefon = "", dalsi = "", otvorHned = false, onOtvorene }: {
  meno: string; os: Os; email?: string; zostatokTeraz: number | null;
  /** Kto ho vedie — mailom sa podpíše. */
  trener?: string;
  /** Koľko mesiacov klient chodí — tretie číslo v maili. */
  mesiacov?: number;
  hodinSpolu?: number;
  /** Tréningov mesačne — ten istý výpočet, aký ukazuje profil. */
  tempo?: number;
  /** Odkedy klient chodí. */
  odkedy?: string;
  /** Cena posledného balíčka — predvyplní sa do QR platby. */
  cenaBalicka?: number;
  /** Telefón klienta — bez neho sa SMS neponúka. */
  telefon?: string;
  /** Najbližší dohodnutý termín z kalendára — posledný bod osi v maili. */
  dalsi?: string;
  /**
   * Otvor výpis hneď — prišlo sa sem z karty „Balíček dojde" preto, aby sa
   * klientovi napísalo. Nechať človeka rozklikávať panel, o ktorý si pred
   * sekundou povedal, je polovičná práca.
   */
  otvorHned?: boolean;
  onOtvorene?: () => void;
}) {
  const [otvorene, setOtvorene] = useState(otvorHned);
  const [volba, setVolba] = useState(0);
  const obdobie = OBDOBIA[volba].m;
  const uplna = !!OBDOBIA[volba].uplna;
  // Signál príde až potom, ako je panel na obrazovke — meno sa na stôl
  // dostáva o krok neskôr než pokyn „píš mu".
  useEffect(() => {
    if (!otvorHned) return;
    setOtvorene(true);
    onOtvorene?.();
  }, [otvorHned, onOtvorene]);
  const [komu, setKomu] = useState(email || "");
  /** Osobná veta na začiatok HTML mailu; prázdna = predvolená veta appky. */
  const [uvod, setUvod] = useState("");
  const [predmet, setPredmet] = useState("");
  const [pracujem, setPracujem] = useState(false);
  const [hlaska, setHlaska] = useState("");
  /** Suma do QR platby; prázdne = platba sa do mailu nedáva. */
  const [suma, setSuma] = useState("");
  const [popisPlatby, setPopisPlatby] = useState("Ďalší balíček");
  /**
   * SMS je ZVONČEK K MAILU, nie druhá správa.
   *
   * Jerry, 28. 9. 2026: „stačilo by, že by klientovi došla SMS, že dnes máš
   * posledný tréning." Celý prehľad je v maili; SMS má jedinú úlohu — aby si
   * ho klient otvoril v deň, keď na tom záleží. Preto sa posiela tým istým
   * tlačidlom a text sa píše zvlášť: do mailu sa zmestí veta navyše, do SMS
   * sedemdesiat znakov.
   */
  const [smskou, setSmskou] = useState(false);
  const [smsText, setSmsText] = useState("");
  const [smsRucne, setSmsRucne] = useState(false);
  const [chyba, setChyba] = useState("");

  const v = useMemo(() => {
    const { od, do: doDna } = obdobie > 0 ? poslednychMesiacov(obdobie) : { od: "", do: "" };
    return vypisHodin(os, obdobie === -1 ? zaciatokBalicka(os) : od, doDna, zostatokTeraz);
  }, [os, obdobie, zostatokTeraz]);

  /**
   * TABUĽKA UŽ NIE JE TELO MAILU.
   *
   * Do 29. 9. 2026 sa celý tento text posielal ako „osobná veta" a v HTML
   * maili by stál pod nadpisom dvakrát — raz ako intro, raz ako os času.
   * Mail skladá server z údajov; tu zostáva textová podoba len na čítanie
   * a kopírovanie (Jerry ňou odpovedá na otázky v chate s klientom).
   */
  const zobrazenyText = useMemo(() => vypisAkoText(v, meno), [v, meno]);

  /** Stav so znamienkom — `v.koniec` sa na nule zastaví (viď `stavPreSpravu`). */
  const stav = useMemo(() => stavPreSpravu(v, dnesPraha()), [v]);
  const navrhSms = useMemo(
    () => textSms({ oslovenie: meno.split(" ")[0], trener: trener || "Jerry", sMailom: true }),
    [meno, trener, stav],
  );
  const zobrazenaSms = smsRucne ? smsText : navrhSms;
  const dlzka = useMemo(() => dlzkaSpravy(zobrazenaSms), [zobrazenaSms]);
  const cisloOk = !!cisloPreBranu(telefon);

  const posli = async () => {
    setPracujem(true); setChyba(""); setHlaska("");
    const j = await fetch("/api/vydane-faktury", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        akcia: "posli-vypis",
        klient: meno,
        komu: komu.trim(),
        predmet: predmet.trim() || (uplna ? "Tvoje tréningy a platby — ProSapiens" : `Výpis hodín — ProSapiens Biomechanic`),
        telo: zobrazenyText,
        uvod: uvod.trim(),
        /**
         * ÚDAJE, NIE HOTOVÉ HTML.
         *
         * Mail sádže server z týchto polí — v prehliadači vzniká len to, čo
         * Jerry naozaj napísal. Správa ide cudziemu človeku z našej adresy,
         * takže hotové HTML z prehliadača by bola zbytočne otvorená cesta.
         */
        vypis: {
          klient: meno,
          oslovenie: meno.split(" ")[0],
          trener,
          /**
           * Os ide do mailu OD NAJSTARŠIEHO — číta sa ako príbeh smerom dole.
           * V profile je najnovšie hore, lebo tam Jerry hľadá poslednú vec;
           * klient chce vidieť, ako sa balíček míňal.
           */
          os: [...v.riadky].reverse()
            .filter((r) => r.druh !== "balicekDo")
            .map((r) => ({
              den: r.den,
              cas: (/\d{1,2}:\d{2}/.exec(r.popis) || [""])[0] || undefined,
              popis: popisPreKlienta(r),
              druh: r.druh as "balicekOd" | "trening" | "platba",
              zostatok: r.zostatok,
              dlh: r.dlh,
            })),
          zostatok: stav.zostatok,
          hodinSpolu,
          tempo,
          odkedy,
          mesiacov,
          dnes: dnesPraha(),
          uplna,
          zaplateneSpolu: uplna ? v.zaplatene : undefined,
          dalsi,
          platba: Number(suma) > 0
            ? { popis: popisPlatby.trim() || "Ďalší balíček", suma: Number(suma), ucet: "2302732185/2010", sprava: meno }
            : undefined,
        },
      }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    setPracujem(false);
    if (!j?.ok) { setChyba(j?.error || "Nepodarilo sa odoslať."); return; }

    /**
     * SMS ide AŽ PO maili a len keď mail prešiel.
     *
     * Správa hovorí „v maili nájdeš dochádzku a QR" — poslať ju skôr než
     * mail (alebo vtedy, keď mail neodišiel) by klienta poslalo do prázdnej
     * schránky. Keď zlyhá SMS, mail už odišiel a povie sa to; opačne to
     * naopraviteľné nie je.
     */
    if (!smskou) { setHlaska(`Výpis odišiel na ${komu.trim()}.`); return; }
    const s = await fetch("/api/sms", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ klient: meno, telefon, text: zobrazenaSms }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "spojenie" }));
    if (!s?.ok) {
      setHlaska(`Výpis odišiel na ${komu.trim()}.`);
      setChyba(s?.error || "SMS sa nepodarilo odoslať.");
      return;
    }
    setHlaska(`Výpis odišiel na ${komu.trim()} a SMS na ${telefon}.`);
  };

  if (!otvorene) {
    return (
      <button
        onClick={() => setOtvorene(true)}
        style={{
          marginTop: 10, padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
          border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontFamily: "inherit",
        }}
      >
        ✉ Výpis hodín pre klienta
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 11, border: `1px solid ${mix(C.accentLight, 40)}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <b style={{ fontSize: 12.5, color: C.text }}>Výpis hodín — {meno}</b>
        <div style={{ display: "flex", gap: 4 }}>
          {OBDOBIA.map((o, i) => (
            <button
              key={o.l}
              onClick={() => setVolba(i)}
              style={{
                padding: "4px 9px", borderRadius: 999, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${volba === i ? C.accent : C.border}`,
                background: volba === i ? mix(C.accent, 14) : "transparent",
                color: volba === i ? C.accentLight : C.textMuted,
              }}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8, fontSize: 12 }}>
        <span style={{ color: C.textMuted }}>zaplatené <b style={{ color: C.text }}>{fmtCZK(v.zaplatene)}</b></span>
        <span style={{ color: C.textMuted }}>odtrénované <b style={{ color: C.text }}>{hod(v.odtrenovane)} h</b></span>
        {v.kupene > 0 && <span style={{ color: C.textMuted }}>kúpené <b style={{ color: C.green }}>+{hod(v.kupene)} h</b></span>}
        {v.koniec !== null && (
          <span style={{ color: C.textMuted }}>zostáva <b style={{ color: v.koniec > 0 ? C.green : C.orange }}>{hod(v.koniec)} h</b></span>
        )}
        {v.naDlh > 0 && (
          <span style={{ color: C.textMuted }}>na nezaplatené <b style={{ color: C.orange }}>{v.naDlh}×</b></span>
        )}
        <span style={{ color: C.textDim }}>{v.od ? `${fmtDMY(v.od)} – ${fmtDMY(v.do)}` : ""}</span>
      </div>

      {/* Dve rôzne čísla treba oddeliť slovami, inak si ich klient zlúči.
          Zostatok appka vie len od balíčka, ktorý vidí; odtrénované hodiny
          pozná od prvého dňa. */}
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>
        {v.koniec === null
          ? "Odpočet hodín tu nebeží — posledné členstvo nemá počet hodín v názve (paušál) alebo v appke žiadne nie je."
          : `Odpočet sa pri každom začiatku členstva vracia na jeho hodiny; posledné je z ${fmtDMY(v.kotva)}.`}
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 8 }}>
        <input
          value={komu}
          onChange={(e) => setKomu(e.target.value)}
          placeholder="komu (e-mail klienta)"
          style={{ flex: "1 1 220px", padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
        />
        <input
          value={predmet}
          onChange={(e) => setPredmet(e.target.value)}
          placeholder="Výpis hodín — ProSapiens Biomechanic"
          style={{ flex: "2 1 260px", padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
        />
      </div>

      {/* QR na platbu sa do mailu dá LEN keď je vyplnená suma. Prázdne pole
          znamená „len výpis" — a to je bežnejší prípad. Do poznámky pre
          príjemcu ide meno klienta, podľa neho Kokpit platbu spáruje. */}
      <div style={{ display: "flex", gap: 7, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={suma}
          onChange={(e) => setSuma(e.target.value.replace(/[^\d]/g, ""))}
          placeholder={cenaBalicka ? `QR na platbu — napr. ${cenaBalicka}` : "QR na platbu — suma v Kč"}
          inputMode="numeric"
          style={{ flex: "0 1 200px", padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
        />
        {!!cenaBalicka && !suma && (
          <button onClick={() => setSuma(String(Math.round(cenaBalicka)))} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}>
            posledný balíček
          </button>
        )}
        {!!suma && (
          <input
            value={popisPlatby}
            onChange={(e) => setPopisPlatby(e.target.value)}
            placeholder="za čo to je"
            style={{ flex: "1 1 200px", padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.text }}
          />
        )}
      </div>

      {/* SMS — zvonček k mailu. Ponúka sa len vtedy, keď má klient použiteľné
          číslo; „nemá telefón" je iná vec než „SMS nechcem" a mlčať o tom by
          znamenalo, že Jerry klikne a nič sa nestane. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: cisloOk ? C.textMuted : C.textDim, cursor: cisloOk ? "pointer" : "not-allowed" }}>
          <input type="checkbox" checked={smskou} disabled={!cisloOk} onChange={(e) => setSmskou(e.target.checked)} />
          poslať aj SMS {cisloOk ? `na ${telefon}` : "— klient nemá použiteľné číslo"}
        </label>
        {smskou && (
          <span style={{ fontSize: 11, color: dlzka.sprav > 2 ? C.orange : C.textDim }}>
            {dlzka.znakov} znakov · {dlzka.sprav} {dlzka.sprav === 1 ? "správa" : dlzka.sprav < 5 ? "správy" : "správ"}
            {dlzka.unicode ? " (diakritika — 70 znakov na správu)" : ""}
          </span>
        )}
      </div>
      {smskou && (
        <textarea
          value={zobrazenaSms}
          onChange={(e) => { setSmsRucne(true); setSmsText(e.target.value); }}
          rows={2}
          style={{
            width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, fontSize: 12,
            border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit",
            lineHeight: 1.5, resize: "vertical", marginBottom: 8,
          }}
        />
      )}

      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>
        Osobná veta na začiatok mailu — nechaj prázdne a appka použije vlastnú.
      </div>
      <input
        value={uvod}
        onChange={(e) => setUvod(e.target.value)}
        placeholder="posielam prehľad aj QR na ďalší."
        style={{
          width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, fontSize: 12,
          border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "inherit", marginBottom: 8,
        }}
      />

      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>
        Textová podoba — len na čítanie a kopírovanie; mail s dlaždicami, osou a QR skladá appka.
      </div>

      <textarea
        value={zobrazenyText}
        readOnly
        rows={14}
        style={{
          width: "100%", boxSizing: "border-box", padding: "8px 9px", borderRadius: 8, fontSize: 12,
          border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          lineHeight: 1.5, resize: "vertical", marginBottom: 8,
        }}
      />

      {chyba && <div style={{ fontSize: 12, color: C.red, marginBottom: 6 }}>{chyba}</div>}
      {hlaska && <div style={{ fontSize: 12, color: C.green, marginBottom: 6 }}>{hlaska}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => void posli()}
          disabled={pracujem || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(komu.trim())}
          style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            cursor: pracujem ? "default" : "pointer",
            border: `1px solid ${mix(C.green, 50)}`, background: mix(C.green, 13), color: C.green, fontFamily: "inherit",
            opacity: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(komu.trim()) ? 1 : 0.5,
          }}
        >
          {pracujem ? "posielam…" : "Poslať klientovi"}
        </button>
        <button
          onClick={() => { void navigator.clipboard?.writeText(zobrazenyText); setHlaska("Výpis skopírovaný."); }}
          style={{ background: "none", border: "none", color: C.accentLight, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
        >
          skopírovať
        </button>
        <button onClick={() => setOtvorene(false)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          zavrieť
        </button>
        {!komu.trim() && <span style={{ fontSize: 11, color: C.textDim }}>klient nemá mail — doplň ho v Poznámkach</span>}
      </div>
    </div>
  );
}
