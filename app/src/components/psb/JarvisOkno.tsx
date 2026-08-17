import { useEffect, useMemo, useState } from "react";

import { C, mix } from "../../lib/psb/theme";
import { patriDoZoznamu, ZAMERANIA } from "../../lib/psb/zamerania";
import { ChatConversation, type AssistantChat } from "./Assistant";

/**
 * Veľké okno Jarvisa — vľavo konverzácie, vpravo rozhovor.
 *
 * PREČO TO NIE JE DRUHÝ JARVIS
 *
 * Je to ten istý `useAssistantChat` a ten istý `ChatConversation` ako
 * v plávajúcom panele. Dve okná do tej istej konverzácie s vlastným stavom by
 * sa rozišli — to je tá istá chyba ako jedna definícia na dvoch miestach, len
 * v rozhraní. Preto sa plávajúci panel v tejto záložke skryje: nie je to
 * obmedzenie, je to jediný spôsob, ako môžu ukazovať to isté.
 *
 * DVE VECI, KTORÉ SA NESMÚ ZAMIEŇAŤ
 *
 * Prvá verzia mala jeden stav na oboje a Jerry to našiel za päť minút:
 *
 *   „ked sa bavim niečo v jednej konverzacií napr v marketingu a mam
 *   rozbehnutú konverzaciu a prepnem na inú kategoriu napr peniaze tak ta
 *   konverzaica ostava"
 *
 * Kliknutie na chip vtedy nemenilo zoznam — menilo zameranie OTVORENEJ
 * konverzácie. Marketingová debata sa potichu preznačila na peniaze a
 * z marketingového zoznamu zmizla. Strata práce bez chybovej hlášky, presne
 * tá rodina, ktorú má appka mať zakázanú.
 *
 * Sú to dve nezávislé veci, ako priečinok a otvorený mail:
 *
 *   `filter`         — ktorý zoznam práve pozerám. Len tu, v obrazovke.
 *   `chat.kategoria` — zameranie OTVORENEJ konverzácie. Uložené s ňou.
 *
 * Chip mení iba `filter` a otvorenej konverzácie sa nedotkne. Zameranie
 * rozhovoru sa mení výhradne vedomým klikom vpravo, alebo tým, že sa nový
 * rozhovor založí v zvolenom priečinku.
 *
 * PREČO „VŠETKO" ZNAMENÁ VŠETKO
 *
 * Druhá Jerryho poznámka: „ked kliknem na všetko tak tam neni ta dana
 * konverzácia". Mal pravdu — „Všetko" som spravil ako ďalšiu priehradku
 * (nezaradené) namiesto zoznamu všetkého. Slovo hovorí jasne, čo má robiť,
 * a rozhranie mu má odpovedať.
 */

const fmtKedy = (ms: number) => {
  const d = new Date(ms);
  const dnes = new Date();
  const denne = d.toDateString() === dnes.toDateString();
  return denne
    ? d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })
    : `${d.getDate()}. ${d.getMonth() + 1}.`;
};

const zameranie = (id?: string) => ZAMERANIA.find((z) => z.id === (id || "")) || ZAMERANIA[0];

export function JarvisOkno({
  chat, onClientClick, onNavigate,
}: {
  chat: AssistantChat;
  onClientClick?: (name: string) => void;
  onNavigate?: (tab: string, sub?: string) => void;
}) {
  /** Ktorý zoznam pozerám. Prázdne = všetky rozhovory, nie „nezaradené". */
  const [filter, setFilter] = useState("");
  const [archivOtvoreny, setArchivOtvoreny] = useState(false);
  const [menimZameranie, setMenimZameranie] = useState(false);

  /**
   * Vstup do záložky vždy otvorí nový rozhovor.
   *
   * Jerry: „ked kliknem na jarvisa mala by sa vzdy začat nova konverzacia
   * a stara by mala byt ulozena." Ukladanie riešiť netreba — deje sa samo pri
   * každej zmene správ, takže predošlá debata je hneď prvá v zozname vľavo.
   *
   * Prázdny rozhovor sa nikam neukládá (`if (!msgs.length) return`), takže
   * vstup a výstup zo záložky nezanáša zoznam prázdnymi záznamami.
   */
  // Načisto — okrem prípadu, keď sem niekto rozhovor priniesol (tlačidlo
  // „Zadanie" z karty Čo publikovať ďalej). Vtedy by prázdny štart zmazal
  // presne to, kvôli čomu sa okno otvorilo.
  useEffect(() => { if (!chat.spotrebujZachovaj()) chat.newChat(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [hladane, setHladane] = useState("");
  const zam = zameranie(chat.kategoria);

  /**
   * Hľadanie ide cez NÁZVY AJ TEXT SPRÁV.
   *
   * Názov je prvá Jerryho veta v rozhovore — ale hľadá sa spravidla to, čo
   * padlo až v jeho strede („kde sme sa bavili o Google Ads"). Hľadanie len
   * v názvoch by preto minulo väčšinu toho, čo človek naozaj hľadá.
   *
   * Beží v prehliadači: správy sú načítané už pri otvorení okna, takže sa
   * nečaká na server a výsledok sa mení pri každom písmene.
   *
   * PRI HĽADANÍ SA ZAMERANIE IGNORUJE. Kto hľadá, nevie, v ktorom priečinku
   * to je — a keby sa hľadalo len vo vybranom, výsledok by mlčal a nepovedal
   * by prečo.
   */
  const { aktivne, archiv, najdenych } = useMemo(() => {
    const h = hladane.trim().toLowerCase();
    const patri = (k?: string) => (h ? true : patriDoZoznamu(k, filter));
    const sedi = (c: typeof chat.chats[number]) => {
      if (!h) return true;
      if ((c.title || "").toLowerCase().includes(h)) return true;
      return (c.messages || []).some((m) => (m.text || "").toLowerCase().includes(h));
    };
    const zoradene = [...chat.chats].sort((a, b) => b.updatedAt - a.updatedAt);
    const vybrane = zoradene.filter((c) => patri(c.kategoria) && sedi(c));
    return {
      aktivne: vybrane.filter((c) => !c.archived),
      archiv: vybrane.filter((c) => c.archived),
      najdenych: h ? vybrane.length : -1,
    };
  }, [chat.chats, filter, hladane]);

  /** Kúsok správy, v ktorom sa hľadaný výraz našiel — aby bolo vidieť prečo. */
  /**
   * Úryvok ukazuje TEXT, nie značky.
   *
   * Odpoveď nesie vnútorné značky pre odkazy — ⟦Peniaze → Výplaty|vzas|vyplaty⟧,
   * «meno klienta», **tučné**, psbdoc:<id>. V bubline sa z nich stanú tlačidlá,
   * ale v úryvku pod výsledkom hľadania presvitali tak, ako sú, a bolo z toho
   * nečitateľné „karta Guillermo v ⟦Peniaze → Výplaty|vzas|vypl…".
   */
  const ocisti = (t: string) =>
    (t || "")
      .replace(/⟦([^|⟧]+)(\|[^⟧]*)?⟧/g, "$1")
      .replace(/«([^»]+)»/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/psbdoc:[^|\s]+\|/g, "");

  const uryvok = (c: typeof chat.chats[number]) => {
    const h = hladane.trim().toLowerCase();
    if (!h) return "";
    if ((c.title || "").toLowerCase().includes(h)) return "";
    const m = (c.messages || []).find((x) => (x.text || "").toLowerCase().includes(h));
    if (!m) return "";
    const t = ocisti(m.text || "");
    const i = t.toLowerCase().indexOf(h);
    if (i < 0) return "";
    const od = Math.max(0, i - 34);
    return (od > 0 ? "…" : "") + t.slice(od, i + h.length + 46).replace(/\s+/g, " ").trim() + "…";
  };

  const chip = (aktivny: boolean) => ({
    padding: "5px 11px", borderRadius: 999, fontSize: 12, cursor: "pointer",
    border: `1px solid ${aktivny ? C.accent : C.border}`,
    background: aktivny ? mix(C.accent, 16) : "transparent",
    color: aktivny ? C.accentLight : C.textMuted,
    fontFamily: "inherit", whiteSpace: "nowrap" as const,
  });

  return (
    <div style={{
      display: "flex", gap: 14, alignItems: "stretch",
      // Okno má byť pracovný stôl, nie ďalšia karta, ktorou sa roluje.
      height: "calc(100vh - 150px)", minHeight: 420,
    }}>
      {/* ── vľavo: priečinky a konverzácie ───────────────────────────── */}
      <div style={{
        width: 250, flexShrink: 0, display: "flex", flexDirection: "column",
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{ padding: 10, borderBottom: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 5 }}>
          {ZAMERANIA.map((z) => (
            <button
              key={z.id || "vsetko"}
              /*
                Prepnutie priečinka otvorí NOVÝ rozhovor v ňom.
                Prvá verzia nechala otvorenú predošlú debatu a Jerry skončil
                v Peniazoch a pokračoval v marketingovej konverzácii. Stará sa
                uloží sama a je hneď prvá v zozname nižšie.
              */
              onClick={() => { setFilter(z.id); chat.newChat(z.id); }}
              style={chip(z.id === filter)}
              title={z.id ? `${z.label} — otvorí nový rozhovor v tomto zameraní` : "Všetky rozhovory"}
            >
              {z.label}
            </button>
          ))}
        </div>

        <div style={{ margin: "10px 10px 0", position: "relative" }}>
          <input
            value={hladane}
            onChange={(e) => setHladane(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setHladane(""); }}
            placeholder="Hľadať v rozhovoroch…"
            style={{
              width: "100%", padding: "7px 26px 7px 10px", borderRadius: 8,
              border: `1px solid ${C.border}`, background: "transparent", color: C.text,
              fontSize: 12.5, fontFamily: "inherit", outline: "none",
            }}
          />
          {hladane && (
            <button
              onClick={() => setHladane("")}
              title="Zrušiť hľadanie (Esc)"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.textDim, fontSize: 12, cursor: "pointer", padding: 2, lineHeight: 1 }}
            >✕</button>
          )}
        </div>
        {najdenych >= 0 && (
          <div style={{ padding: "6px 12px 0", fontSize: 11, color: C.textDim }}>
            {najdenych === 0
              ? "Nič sa nenašlo — hľadá sa v názvoch aj v texte správ."
              : `${najdenych} ${najdenych === 1 ? "rozhovor" : najdenych < 5 ? "rozhovory" : "rozhovorov"} · hľadá sa naprieč všetkými zameraniami`}
          </div>
        )}

        <button
          onClick={() => chat.newChat(filter)}
          style={{
            margin: 10, marginBottom: 6, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
            border: `1px dashed ${C.border}`, background: "transparent", color: C.textMuted,
            fontSize: 12.5, fontFamily: "inherit", textAlign: "left",
          }}
        >
          + Nový rozhovor{filter ? `: ${zameranie(filter).label}` : ""}
        </button>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 10px" }}>
          {aktivne.length === 0 && (
            <div style={{ padding: "10px 8px", fontSize: 11.5, color: C.textDim, lineHeight: 1.5 }}>
              {hladane.trim()
                ? ""
                : filter
                  ? `V zameraní „${zameranie(filter).label}“ ešte žiadny rozhovor nie je.`
                  : "Zatiaľ žiadny rozhovor."}
            </div>
          )}
          {aktivne.map((c) => (
            <Riadok
              key={c.id} nazov={(c as {vetva?:boolean}).vetva ? `⑂ ${c.title}` : c.title} kedy={fmtKedy(c.updatedAt)}
              // Odznak sa ukazuje len v spoločnom zozname — v priečinku by na
              // každom riadku svietilo to isté slovo a nič by nehovorilo.
              odznak={!filter && c.kategoria ? zameranie(c.kategoria).label : ""}
              uryvok={uryvok(c)}
              aktivny={c.id === chat.chatId}
              onOpen={() => chat.openChat(c.id, hladane)}
              onArchive={() => chat.archiveChat(c.id)}
              onDelete={() => chat.deleteChat(c.id)}
              onPresun={(k) => chat.presunChat(c.id, k)}
              teraz={c.kategoria || ""}
              archivTitle="Archivovať"
            />
          ))}

          {archiv.length > 0 && (
            <>
              <button
                onClick={() => setArchivOtvoreny((v) => !v)}
                style={{
                  width: "100%", textAlign: "left", background: "none", border: "none",
                  padding: "8px", marginTop: 6, borderTop: `1px solid ${C.border}`,
                  color: C.textDim, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Archív ({archiv.length}) {archivOtvoreny ? "▾" : "▸"}
              </button>
              {archivOtvoreny && archiv.map((c) => (
                <Riadok
                  key={c.id} nazov={(c as {vetva?:boolean}).vetva ? `⑂ ${c.title}` : c.title} kedy={fmtKedy(c.updatedAt)}
                  odznak={!filter && c.kategoria ? zameranie(c.kategoria).label : ""}
                  uryvok={uryvok(c)}
                  aktivny={c.id === chat.chatId} dim
                  onOpen={() => chat.openChat(c.id, hladane)}
                  onArchive={() => chat.archiveChat(c.id)}
                  onDelete={() => chat.deleteChat(c.id)}
                  onPresun={(k) => chat.presunChat(c.id, k)}
                  teraz={c.kategoria || ""}
                  archivTitle="Vrátiť z archívu"
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── vpravo: rozhovor ─────────────────────────────────────────── */}
      <div style={{
        flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
      }}>
        {/*
          Kto Jarvis v TOMTO rozhovore je. Nie je to ozdoba: bez toho sa nedá
          overiť, či zameranie naozaj niečo robí — a nastavenie, ktorého účinok
          sa nedá overiť očami, je nebezpečné aj keď funguje.

          Zmena zamerania je tu, a nie vľavo, naschvál. Vľavo sa prepínajú
          priečinky; prepísať zameranie rozbehnutej debaty musí byť vedomý klik,
          nie vedľajší účinok pozerania do iného zoznamu.
        */}
        <div style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, background: mix(C.accent, 4) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{zam.rola}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, lineHeight: 1.45 }}>{zam.popis}</div>
            </div>
            <button
              onClick={() => setMenimZameranie((v) => !v)}
              style={{
                background: "none", border: "none", padding: 0, color: C.accentLight,
                fontSize: 11, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {menimZameranie ? "zavrieť" : "zmeniť zameranie"}
            </button>
          </div>

          {menimZameranie && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {ZAMERANIA.map((z) => (
                  <button
                    key={z.id || "vsetko"}
                    onClick={() => { chat.setKategoria(z.id); setMenimZameranie(false); }}
                    style={chip(z.id === chat.kategoria)}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
                Zmení zameranie tohto rozhovoru — teda pravidlá, podľa ktorých Jarvis odpovedá.
                Doterajšie správy zostávajú.
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <ChatConversation chat={chat} autoFocus onClientClick={onClientClick} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

function Riadok({
  nazov, kedy, odznak, uryvok, aktivny, dim, teraz, onOpen, onArchive, onDelete, onPresun, archivTitle,
}: {
  nazov: string; kedy: string; odznak?: string; uryvok?: string; aktivny: boolean; dim?: boolean; teraz: string;
  onOpen: () => void; onArchive: () => void; onDelete: () => void;
  onPresun: (kategoria: string) => void; archivTitle: string;
}) {
  const [nad, setNad] = useState(false);
  const [presuvam, setPresuvam] = useState(false);
  const ikona = {
    background: "none", border: "none", cursor: "pointer", padding: 2,
    color: C.textDim, fontSize: 12, lineHeight: 1, fontFamily: "inherit",
  } as const;

  return (
    <>
    <div
      onMouseEnter={() => setNad(true)} onMouseLeave={() => setNad(false)}
      style={{
        display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderRadius: 8,
        background: aktivny ? mix(C.accent, 12) : nad ? mix(C.text, 5) : "transparent",
        opacity: dim ? 0.6 : 1,
      }}
    >
      <button
        onClick={onOpen}
        style={{
          flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none",
          cursor: "pointer", padding: 0, fontFamily: "inherit",
          color: aktivny ? C.accentLight : C.text, fontSize: 12.5,
        }}
      >
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {nazov || "(bez názvu)"}
        </span>
        {/*
          Úryvok sa ukáže len vtedy, keď sa výraz našiel v texte správy a nie
          v názve — inak by len zopakoval riadok nad sebou. Je to odpoveď na
          otázku „prečo mi to tento rozhovor ponúka".
        */}
        {uryvok && (
          <span style={{ display: "block", fontSize: 10.5, color: C.textDim, lineHeight: 1.4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>
            {uryvok}
          </span>
        )}
        <span style={{ fontSize: 10.5, color: C.textDim, display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
          {kedy}
          {/*
            Zameranie ako farebný odznak, nie ako text za bodkou. Jerry si ho
            vyžiadal osobitne — v spoločnom zozname je to jediná vec, podľa
            ktorej sa dve rovnako pomenované debaty rozlíšia.
          */}
          {odznak && (
            <span style={{
              padding: "1px 6px", borderRadius: 999, fontSize: 9.5, fontWeight: 600,
              background: mix(C.accent, 14), color: C.accentLight, whiteSpace: "nowrap",
            }}>
              {odznak}
            </span>
          )}
        </span>
      </button>
      {(nad || presuvam) && (
        <>
          <button onClick={() => setPresuvam((v) => !v)} title="Presunúť do iného zamerania" style={ikona}>⇄</button>
          <button onClick={onArchive} title={archivTitle} style={ikona}>▾</button>
          <button onClick={onDelete} title="Zmazať" style={ikona}>✕</button>
        </>
      )}
    </div>
    {presuvam && (
      <div style={{ padding: "4px 8px 8px 8px", display: "flex", flexWrap: "wrap", gap: 4 }}>
        {ZAMERANIA.map((z) => (
          <button
            key={z.id || "vsetko"}
            onClick={() => { onPresun(z.id); setPresuvam(false); }}
            disabled={z.id === teraz}
            style={{
              padding: "3px 8px", borderRadius: 999, fontSize: 10.5, fontFamily: "inherit",
              cursor: z.id === teraz ? "default" : "pointer",
              border: `1px solid ${C.border}`, background: "transparent",
              color: z.id === teraz ? C.textDim : C.textMuted,
            }}
          >
            {z.id === teraz ? `• ${z.label}` : z.label}
          </button>
        ))}
      </div>
    )}
    </>
  );
}
