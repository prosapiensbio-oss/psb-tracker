import { useMemo, useState } from "react";

import { C, mix } from "../../lib/psb/theme";
import { ZAMERANIA } from "../../lib/psb/zamerania";
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
 * Jerry to sám navrhol takto („ked som v tom okne tak sa neda pustit druhé
 * okno jarvisa ktoré je vpravom dolnom rohu") a mal pravdu. Ja som mu pôvodne
 * oponoval, že jedno okno už existuje — odpovedal som na inú otázku, než akú
 * dával. Panel v pravom dolnom rohu má veľkosť obálky; toto je pracovný stôl.
 *
 * PREČO ZAMERANIE PATRÍ KU KONVERZÁCII A NIE K OBRAZOVKE
 *
 * Keď sa vrátiš k starej debate o peniazoch, má sa otvoriť ako debata
 * o peniazoch — vrátane pravidiel, ktoré v nej platili. Preto sa ukládá so
 * správami a nie do stavu tejto obrazovky.
 */



const fmtKedy = (ms: number) => {
  const d = new Date(ms);
  const dnes = new Date();
  const denne = d.toDateString() === dnes.toDateString();
  return denne
    ? d.toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })
    : `${d.getDate()}. ${d.getMonth() + 1}.`;
};

export function JarvisOkno({
  chat, onClientClick, onNavigate,
}: {
  chat: AssistantChat;
  onClientClick?: (name: string) => void;
  onNavigate?: (tab: string, sub?: string) => void;
}) {
  const [archivOtvoreny, setArchivOtvoreny] = useState(false);
  const zam = ZAMERANIA.find((z) => z.id === chat.kategoria) || ZAMERANIA[0];

  // Konverzácie sa filtrujú podľa zamerania. Staré rozhovory (vytvorené pred
  // touto zmenou) nemajú zameranie — patria do „Všetko", nezmiznú.
  const { aktivne, archiv } = useMemo(() => {
    const patri = (k?: string) => (k || "") === chat.kategoria;
    const zoradene = [...chat.chats].sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      aktivne: zoradene.filter((c) => !c.archived && patri(c.kategoria)),
      archiv: zoradene.filter((c) => c.archived && patri(c.kategoria)),
    };
  }, [chat.chats, chat.kategoria]);

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
      // Výška na celú obrazovku mínus hlavička — okno má byť pracovný stôl,
      // nie ďalšia karta, ktorou sa roluje.
      height: "calc(100vh - 150px)", minHeight: 420,
    }}>
      {/* ── vľavo: zameranie a konverzácie ───────────────────────────── */}
      <div style={{
        width: 250, flexShrink: 0, display: "flex", flexDirection: "column",
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{ padding: 10, borderBottom: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 5 }}>
          {ZAMERANIA.map((z) => (
            <button key={z.id || "vsetko"} onClick={() => chat.setKategoria(z.id)} style={chip(z.id === chat.kategoria)}>
              {z.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => chat.newChat(chat.kategoria)}
          style={{
            margin: 10, marginBottom: 6, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
            border: `1px dashed ${C.border}`, background: "transparent", color: C.textMuted,
            fontSize: 12.5, fontFamily: "inherit", textAlign: "left",
          }}
        >
          + Nový rozhovor
        </button>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 10px" }}>
          {aktivne.length === 0 && (
            <div style={{ padding: "10px 8px", fontSize: 11.5, color: C.textDim, lineHeight: 1.5 }}>
              V tomto zameraní ešte žiadny rozhovor nie je.
            </div>
          )}
          {aktivne.map((c) => (
            <Riadok
              key={c.id} nazov={c.title} kedy={fmtKedy(c.updatedAt)}
              aktivny={c.id === chat.chatId}
              onOpen={() => chat.openChat(c.id)}
              onArchive={() => chat.archiveChat(c.id)}
              onDelete={() => chat.deleteChat(c.id)}
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
                  key={c.id} nazov={c.title} kedy={fmtKedy(c.updatedAt)}
                  aktivny={c.id === chat.chatId} dim
                  onOpen={() => chat.openChat(c.id)}
                  onArchive={() => chat.archiveChat(c.id)}
                  onDelete={() => chat.deleteChat(c.id)}
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
          Kto Jarvis práve je. Nie je to ozdoba: bez toho sa nedá overiť, či
          prepnutie zamerania naozaj niečo zmenilo, a nastavenie, ktoré sa nedá
          overiť očami, je nebezpečné aj keď funguje.
        */}
        <div style={{ padding: "9px 12px", borderBottom: `1px solid ${C.border}`, background: mix(C.accent, 4) }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{zam.rola}</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, lineHeight: 1.45 }}>{zam.popis}</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <ChatConversation chat={chat} autoFocus onClientClick={onClientClick} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

function Riadok({
  nazov, kedy, aktivny, dim, onOpen, onArchive, onDelete, archivTitle,
}: {
  nazov: string; kedy: string; aktivny: boolean; dim?: boolean;
  onOpen: () => void; onArchive: () => void; onDelete: () => void; archivTitle: string;
}) {
  const [nad, setNad] = useState(false);
  const ikona = {
    background: "none", border: "none", cursor: "pointer", padding: 2,
    color: C.textDim, fontSize: 12, lineHeight: 1, fontFamily: "inherit",
  } as const;

  return (
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
        <span style={{ fontSize: 10.5, color: C.textDim }}>{kedy}</span>
      </button>
      {nad && (
        <>
          <button onClick={onArchive} title={archivTitle} style={ikona}>▾</button>
          <button onClick={onDelete} title="Zmazať" style={ikona}>✕</button>
        </>
      )}
    </div>
  );
}
