import { useEffect, useMemo, useRef, useState } from "react";

import type { ClientAgg } from "../../lib/psb/compute";
import type { Lead } from "../../lib/psb/types";
import { normName, fmtDMY} from "../../lib/psb/format";
import { C, mix } from "../../lib/psb/theme";

// Hľadanie klienta odkiaľkoľvek.
//
// Doteraz sa klient hľadal tak, že človek prešiel na Tracker → Klienti a
// scrolloval v tabuľke stodesiatich mien. Pri otázke „kedy tu bola naposledy
// Eva" to znamenalo tri kliky a hľadanie očami — a keď si človek pamätal len
// priezvisko, aj to zlyhalo.
//
// Hľadá sa bez diakritiky a kdekoľvek v mene, nie len od začiatku: „proch"
// nájde Mateja Prochádzku, „stok" Kateřinu Stoklaskovú. Klávesnica: „/" sem
// skočí, šípky vyberajú, Enter otvorí, Esc zavrie.
export function HladanieKlienta({
  clients,
  leads = [],
  onPick,
  onPickLead,
}: {
  clients: Record<string, ClientAgg>;
  leads?: Lead[];
  onPick: (meno: string) => void;
  onPickLead?: () => void;
}) {
  const [q, setQ] = useState("");
  const [otvorene, setOtvorene] = useState(false);
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const najdene = useMemo(() => {
    const t = normName(q.trim());
    if (t.length < 2) return [];
    // Hľadá sa aj v mene odporúčateľa — „kto priviedol Petra" je rovnako častá
    // otázka ako „kde je Peter" a odpoveď je klient, ktorého Peter poslal.
    return Object.values(clients)
      // Hľadá sa aj podľa dátumu narodenia: „6.6." nájde všetkých, čo majú
      // vtedy narodeniny, „1988" celý ročník. Dátum sa porovnáva v oboch
      // podobách — ako sa píše (6.6.1988) aj ako sa ukladá (1988-06-06).
      .filter((c) => {
        if (normName(c.name).includes(t) || normName(c.zdrojKto || "").includes(t)) return true;
        if (!c.narodeniny) return false;
        const d = c.narodeniny;                    // 1988-06-06
        const [r, m, den] = d.split("-");
        const ludsky = `${Number(den)}.${Number(m)}.${r}`; // 6.6.1988
        const hladane = t.replace(/\s/g, "");
        return d.includes(hladane) || ludsky.includes(hladane);
      })
      // Aktívni hore a v rámci nich ten, kto tu bol naposledy — pri hľadaní
      // klienta ide skoro vždy o toho, s ktorým sa práve niečo rieši.
      .sort((a, b) => {
        const aa = a.status !== "Neaktívny" ? 0 : 1;
        const bb = b.status !== "Neaktívny" ? 0 : 1;
        return aa - bb || (b.lastSession || "").localeCompare(a.lastSession || "");
      })
      .slice(0, 6);
  }, [q, clients]);

  // Dopyty zvlášť: ľudia, ktorí ešte nie sú klienti, sa v zozname klientov
  // nenájdu — ale hľadať ich chce človek rovnako.
  const najdeneDopyty = useMemo(() => {
    const t = normName(q.trim());
    if (t.length < 2) return [];
    // Dopyt sa skryje, keď už existuje KLIENT s tým istým menom — dopyt je
    // predfáza a keď sa z človeka stal klient, ukazovať oboje mätie („prečo
    // je tam dopyt ozval sa, keď už chodí?" — Jerry pri Janovi Královi).
    const menaKlientov = new Set(Object.keys(clients).map((m) => normName(m)));
    return leads.filter((l) => l.name && normName(l.name).includes(t) && !menaKlientov.has(normName(l.name))).slice(0, 3);
  }, [q, leads]);

  useEffect(() => setI(0), [q]);

  // „/" kdekoľvek v appke skočí sem — okrem chvíle, keď človek píše do iného poľa.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOtvorene(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const vyber = (meno: string) => {
    onPick(meno);
    setQ("");
    setOtvorene(false);
    input.current?.blur();
  };

  const klavesa = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOtvorene(false); input.current?.blur(); return; }
    if (!najdene.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => (x + 1) % najdene.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => (x - 1 + najdene.length) % najdene.length); }
    if (e.key === "Enter") { e.preventDefault(); vyber(najdene[i].name); }
  };

  const ukazat = otvorene && (najdene.length > 0 || najdeneDopyty.length > 0);

  return (
    <div ref={box} style={{ position: "relative", minWidth: 0, flex: "0 1 220px" }}>
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOtvorene(true); }}
        onFocus={() => setOtvorene(true)}
        onKeyDown={klavesa}
        placeholder="Hľadať klienta  /"
        aria-label="Hľadať klienta"
        style={{
          width: "100%", padding: "6px 10px", borderRadius: 8, fontSize: 12.5,
          border: `1px solid ${ukazat ? mix(C.accent, 45) : C.border}`,
          background: C.card, color: C.text, outline: "none",
        }}
      />
      {ukazat && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, left: 0, zIndex: 40,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 9,
            boxShadow: "0 10px 28px rgba(0,0,0,0.35)", overflow: "hidden",
          }}
        >
          {najdeneDopyty.map((l) => (
            <button
              key={`d-${l.id}`}
              onClick={() => { onPickLead?.(); setQ(""); setOtvorene(false); input.current?.blur(); }}
              style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", padding: "7px 10px", border: "none", background: "transparent" }}
            >
              <span style={{ fontSize: 12.5, color: C.text, display: "block" }}>{l.name}</span>
              <span style={{ fontSize: 10.5, color: C.accentLight }}>dopyt · {l.status === "novy" ? "ozval sa" : l.status}</span>
            </button>
          ))}
          {najdene.map((c, idx) => (
            <button
              key={c.name}
              onMouseEnter={() => setI(idx)}
              onClick={() => vyber(c.name)}
              style={{
                display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                padding: "7px 10px", border: "none",
                background: idx === i ? mix(C.accent, 10) : "transparent",
              }}
            >
              <span style={{ fontSize: 12.5, color: C.text, display: "block" }}>{c.name}</span>
              <span style={{ fontSize: 10.5, color: C.textDim }}>
                {c.status === "Neaktívny" ? "neaktívny · " : ""}{c.membership || "bez balíčka"} · {c.primaryTrainer || "—"}
                {c.zdrojKto && normName(c.zdrojKto).includes(normName(q.trim())) && !normName(c.name).includes(normName(q.trim())) ? ` · odporučil(a): ${c.zdrojKto}` : ""}
                {/* Dátum sa ukáže len vtedy, keď je dôvodom nálezu — inak by
                    v zozname pribudol stĺpec, ktorý nikto nehľadal. */}
                {c.narodeniny && !normName(c.name).includes(normName(q.trim())) ? ` · nar. ${fmtDMY(c.narodeniny)}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
