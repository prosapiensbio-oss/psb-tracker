import { useEffect, useState } from "react";

import { C } from "../../lib/psb/theme";
import { dnesPraha, posunDen } from "../../lib/psb/cas";
import {
  hlbkaZoGa4, type RiadokGa4, type StrankaHlbky, vetaOStranke,
} from "../../lib/psb/hlbkaListovania";
import { Card, H3, Info } from "./ui";

/**
 * Hĺbka listovania — zoznam stránok s mikrokrivkou, po kliknutí veľká krivka.
 *
 * Podobu vybral Jerry 10. 11. 2026: „spojil by som B miniatúry a po kliknutí
 * na stránku by sa to zväčšilo rovnako ako má A." Zoznam odpovedá na otázku
 * „kde to tečie" bez preklikávania, detail na „čo presne s tou stránkou".
 *
 * Dáta sa ťahajú zo `/api/google` akcie `hlbka` (len čítanie z GA4) a
 * preskladá ich `lib/psb/hlbkaListovania.ts` — to isté počítanie, aké neskôr
 * dostane Jarvis, aby obrazovka a odpoveď nehovorili dve čísla.
 */

const OBDOBIA: { id: string; label: string; dni: number }[] = [
  { id: "14", label: "14 dní", dni: 14 },
  { id: "28", label: "28 dní", dni: 28 },
  { id: "90", label: "90 dní", dni: 90 },
];

/** Rozmery pribudli v GA4 27. 10. 2026 a spätne sa nedopočítajú. */
const OD_KEDY = "2026-10-27";

type Odpoved = { ok?: boolean; hlbka?: RiadokGa4[]; navstevy?: RiadokGa4[]; error?: string; od?: string; do?: string };

export function HlbkaListovania() {
  const [dni, setDni] = useState("28");
  const [stav, setStav] = useState<"nacitavam" | "hotovo" | "chyba">("nacitavam");
  const [chyba, setChyba] = useState("");
  const [stranky, setStranky] = useState<StrankaHlbky[]>([]);
  const [otvorena, setOtvorena] = useState("");
  const [obdobie, setObdobie] = useState("");

  useEffect(() => {
    let zive = true;
    const pocet = OBDOBIA.find((o) => o.id === dni)?.dni ?? 28;
    const vcera = posunDen(dnesPraha(), -1);
    // Dnešok sa neberie: je neúplný a krivka by z neho vyzerala plytšia.
    // Zľava sa nejde pred deň, keď rozmery vznikli — prázdne dni nie sú nula,
    // sú „nevie sa", a v krivke by boli na nerozoznanie.
    const od = [posunDen(vcera, -(pocet - 1)), OD_KEDY].sort().at(-1) as string;
    setStav("nacitavam");
    setChyba("");
    void fetch("/api/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ akcia: "hlbka", od, do: vcera }),
    })
      .then((r) => r.json() as Promise<Odpoved>)
      .then((j) => {
        if (!zive) return;
        if (!j.ok) {
          setStav("chyba");
          setChyba(j.error || "GA4 neodpovedala použiteľne.");
          return;
        }
        setStranky(hlbkaZoGa4(j.hlbka || [], j.navstevy || []));
        setObdobie(`${j.od || od} – ${j.do || vcera}`);
        setStav("hotovo");
      })
      .catch((e: unknown) => {
        if (!zive) return;
        setStav("chyba");
        setChyba(String(e).slice(0, 200));
      });
    return () => { zive = false; };
  }, [dni]);

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            label="Dokiaľ ľudia dolistujú"
            text="Web sa listuje do strany, takže „čas na stránke“ ani scroll nemerajú nič. Pri každom posune hlbšie pošle web udalosť s číslom obrazovky; tu je z nej krivka, koľko ľudí ktorú obrazovku videlo. Klikni na stránku a krivka sa zväčší aj s názvami obrazoviek a rozpadom na počítač a telefón. Rozmery v GA4 vznikli 27. 10. 2026 a spätne sa nedopočítajú, takže staršie obdobie sa nedá pozrieť."
          />
        </H3>
        <div style={{ display: "flex", gap: 6 }}>
          {OBDOBIA.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setDni(o.id)}
              style={{
                background: dni === o.id ? C.accent : C.track,
                color: dni === o.id ? "#10140d" : C.text,
                border: `1px solid ${dni === o.id ? C.accent : C.border}`,
                borderRadius: 999, padding: "4px 12px", fontSize: 13, cursor: "pointer",
                fontWeight: dni === o.id ? 600 : 400,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {stav === "nacitavam" && <p style={{ color: C.textDim, fontSize: 14 }}>Čítam z GA4…</p>}
      {stav === "chyba" && (
        <p style={{ color: C.red, fontSize: 14 }}>
          Nedá sa prečítať: {chyba} <span style={{ color: C.textDim }}>— nie je to to isté ako „nikto nelistoval“.</span>
        </p>
      )}
      {stav === "hotovo" && !stranky.length && (
        <p style={{ color: C.textDim, fontSize: 14 }}>
          Za toto obdobie neprišla z webu ani jedna udalosť o listovaní. Nevie sa z toho, či ľudia nelistovali, alebo sa meranie prerušilo — pozri nočnú kontrolu webu.
        </p>
      )}

      {stav === "hotovo" && stranky.length > 0 && (
        <>
          <p style={{ color: C.textDim, fontSize: 12.5, margin: "2px 0 10px" }}>{obdobie}</p>
          <div>
            {stranky.map((s) => (
              <Riadok
                key={s.cesta}
                s={s}
                otvorena={otvorena === s.cesta}
                onKlik={() => setOtvorena(otvorena === s.cesta ? "" : s.cesta)}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/** Jeden riadok zoznamu; po kliknutí sa pod ním rozbalí veľká krivka. */
function Riadok({ s, otvorena, onKlik }: { s: StrankaHlbky; otvorena: boolean; onKlik: () => void }) {
  const max = Math.max(1, ...s.krivka);
  const padZnacka = s.pad && s.pad.podiel >= 0.5;
  return (
    <div style={{ borderTop: `1px solid ${C.border}` }}>
      <button
        type="button"
        onClick={onKlik}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 0",
          background: "none", border: 0, color: C.text, cursor: "pointer", textAlign: "left", flexWrap: "wrap",
        }}
      >
        <span style={{ fontWeight: 600, flex: "1 1 180px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {s.cesta}
        </span>
        <span style={{ color: C.textDim, fontSize: 13, width: 70 }}>{s.ludia || "—"} ľudí</span>
        <Mikrokrivka krivka={s.krivka} max={max} padOd={padZnacka ? s.pad?.od : undefined} />
        <span style={{ color: C.textDim, fontSize: 13, width: 92 }}>
          polovica do {s.dokial}. z {s.krivka.length}
        </span>
        <span
          style={{
            fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "2px 8px",
            background: padZnacka ? "rgba(194,91,68,.18)" : "rgba(143,190,82,.16)",
            color: padZnacka ? C.red : C.green,
            whiteSpace: "nowrap",
          }}
        >
          {s.pad ? `${s.pad.od}. → ${s.pad.od + 1}. −${Math.round(s.pad.podiel * 100)} %` : "bez pádu"}
        </span>
      </button>
      {otvorena && <Detail s={s} />}
    </div>
  );
}

function Mikrokrivka({ krivka, max, padOd }: { krivka: number[]; max: number; padOd?: number }) {
  return (
    <span style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 26, width: 120, flex: "0 0 120px" }}>
      {krivka.map((v, i) => (
        <span
          key={i}
          style={{
            flex: 1, minHeight: 2, borderRadius: "2px 2px 0 0",
            height: Math.max(2, Math.round((v / max) * 24)),
            background: padOd !== undefined && i === padOd ? C.red : C.accent,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Veľká krivka s názvami obrazoviek a rozpadom na zariadenia.
 *
 * Rozpad je tu zámerne: 10. 11. 2026 vyzerala úvodná stránka ako problém
 * obsahu (83 % odpadlo po prvej obrazovke), kým rozpad ukázal, že na telefóne
 * listuje väčšina a nelistuje sa na POČÍTAČI. Bez neho sa opravuje naslepo.
 */
function Detail({ s }: { s: StrankaHlbky }) {
  const max = Math.max(1, ...s.krivka);
  const rady: { meno: string; rad: number[] }[] = [
    { meno: "Počítač", rad: s.podlaZariadenia.pc },
    { meno: "Telefón", rad: s.podlaZariadenia.telefon },
  ].filter((r) => r.rad.some((v) => v > 0));

  return (
    <div style={{ padding: "4px 0 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 86 }}>
        {s.krivka.map((v, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: C.textDim }}>{v}</span>
            <span
              style={{
                width: "100%", minHeight: 3, borderRadius: "4px 4px 0 0",
                height: Math.max(3, Math.round((v / max) * 58)),
                background: s.pad && i === s.pad.od && s.pad.podiel >= 0.5 ? C.red : C.accent,
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
        {s.nazvy.map((n, i) => (
          <span
            key={i}
            style={{ flex: 1, fontSize: 10.5, color: C.textDim, textAlign: "center", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={n}
          >
            {n || i + 1}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 13, margin: "10px 0 0" }}>{vetaOStranke(s)}</p>
      {rady.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {rady.map((r) => (
            <div key={r.meno} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
              <span style={{ color: C.textDim, width: 62 }}>{r.meno}</span>
              <span style={{ color: C.text }}>{r.rad.join(" · ")}</span>
            </div>
          ))}
        </div>
      )}
      {s.bezRozmeru > 0 && (
        <p style={{ fontSize: 12, color: C.textDim, margin: "8px 0 0" }}>
          {s.bezRozmeru} ľudí má udalosť bez čísla obrazovky — sú to návštevy spred 27. 10. 2026, keď rozmer v GA4 ešte nebol.
        </p>
      )}
    </div>
  );
}
