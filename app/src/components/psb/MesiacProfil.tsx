import { useEffect, useMemo, useState } from "react";

import type { ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthKey, monthLabel } from "../../lib/psb/format";
import { ciel, zlucKampane, type Kampan } from "../../lib/psb/kampane";
import { statistiky, suvislosti, zmenaPct, type Bod } from "../../lib/psb/mesiac";
import { C, mix, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import type { AssistantChat } from "./Assistant";
import { Modal, RolovaciaTabulka } from "./ui";

/**
 * Rozbor jedného mesiaca — čo sa v ňom dialo a ako ďaleko je od bežného.
 *
 * PREČO TO NIE JE ĎALŠÍ GRAF
 *
 * Graf ukáže, ŽE mesiac vyskočil. Nepovie prečo. Odpoveď je rozsypaná v
 * piatich tabuľkách naprieč Marketingom a poskladať ju znamená preklikať celú
 * obrazovku. Tu je to na jednom mieste, tak ako profil klienta.
 *
 * PREČO SÚ PRI ČÍSLACH ODCHÝLKY A NIE LEN HODNOTY
 *
 * „4 796 Kč" nepovie nič. „4 796 Kč, o 154 % nad priemerom" povie všetko.
 * Mesiac sa nedá čítať sám o sebe, len proti ostatným.
 *
 * PREČO VÝKLAD PÍŠE JARVIS A NIE TENTO SÚBOR
 *
 * Súbežnosti, ktoré sa dajú spočítať, sa spočítajú tu (`suvislosti`) — a sú
 * napísané ako pozorovanie, nie ako príčina. Že v mesiaci s najvyšším
 * výdavkom prišlo najmenej dopytov, neznamená, že to reklama pokazila.
 * Výklad chce kontext, ktorý appka nemá, a preto ho robí Jarvis na požiadanie.
 * Automaticky sa negeneruje: stálo by to peniaze pri každom otvorení a Jerry
 * ho pri väčšine mesiacov nepotrebuje.
 */

type IgPrispevok = {
  id: string; datum: string; mesiac: string; typ: string; permalink: string;
  hook: string; kategoria: string; dosah: number; ulozenia: number; zdielania: number; videnia: number;
};

export type KanalRiadok = { mesiac: string; kanal: string; metrika: string; hodnota: number };

/** Metriky z mesačnej zostavy, ktoré do rozboru patria. */
const Z_KANALOV: { kanal: string; metrika: string; label: string; druh: "stav" | "tok"; farba?: string; fmt?: (v: number) => string }[] = [
  { kanal: "Instagram", metrika: "Followers", label: "Sledovatelia IG — prírastok", druh: "stav", farba: C.accentLight },
  { kanal: "Instagram", metrika: "Views", label: "Videnia IG", druh: "tok" },
  { kanal: "Instagram", metrika: "Avg reach per reel", label: "Ø dosah reelu", druh: "tok" },
  { kanal: "Meta Ads", metrika: "Spent", label: "Reklama", druh: "tok", farba: C.orange, fmt: (v) => fmtCZK(v) },
  { kanal: "Web", metrika: "Visitors", label: "Návštevníci webu", druh: "tok" },
];

const cislo = (n: number) => Math.round(n).toLocaleString("sk");

export function MesiacProfil({ mesiac, kanaly, data, clients, chat, onClose }: {
  mesiac: string;
  kanaly: KanalRiadok[];
  data: PSBData;
  clients: Record<string, ClientAgg>;
  chat?: AssistantChat;
  onClose: () => void;
}) {
  const [ig, setIg] = useState<IgPrispevok[]>([]);
  const [kampane, setKampane] = useState<Kampan[]>([]);

  useEffect(() => {
    void fetch("/api/meta?co=instagram", { credentials: "same-origin" })
      .then((r) => r.json()).then((j: { prispevky?: IgPrispevok[] }) => setIg(j.prispevky || [])).catch(() => {});
    void fetch("/api/meta", { credentials: "same-origin" })
      .then((r) => r.json()).then((j: { kampane?: Kampan[] }) => setKampane(j.kampane || [])).catch(() => {});
  }, []);

  // ── čísla z mesačnej zostavy, každé proti priemeru ostatných mesiacov ──────
  const metriky = useMemo(() => Z_KANALOV.map((k) => {
    const body: Bod[] = kanaly
      .filter((r) => r.kanal === k.kanal && r.metrika.toLowerCase() === k.metrika.toLowerCase())
      .map((r) => ({ m: r.mesiac, v: r.hodnota }))
      .sort((a, b) => a.m.localeCompare(b.m));
    const s = statistiky(body, k.druh);
    // Pri stave (sledovatelia) je hodnotou mesiaca prírastok, nie úroveň.
    const tento = s.rad.find((b) => b.m === mesiac);
    const ostatne = s.rad.filter((b) => b.m !== mesiac).map((b) => b.v);
    const priemerOstatnych = ostatne.length ? ostatne.reduce((a, v) => a + v, 0) / ostatne.length : null;
    return {
      ...k, s,
      hodnota: tento?.v ?? null,
      odchylka: tento && priemerOstatnych != null ? zmenaPct(priemerOstatnych, tento.v) : null,
      priemer: priemerOstatnych,
    };
  }), [kanaly, mesiac]);

  const hod = (label: string) => metriky.find((m) => m.label.startsWith(label))?.hodnota ?? 0;
  const pri = (label: string) => metriky.find((m) => m.label.startsWith(label))?.priemer ?? null;

  // ── čo sa v tom mesiaci reálne udialo ─────────────────────────────────────
  const prispevky = useMemo(() => ig.filter((p) => p.mesiac === mesiac).sort((a, b) => b.dosah - a.dosah), [ig, mesiac]);
  const kampaneMes = useMemo(() => zlucKampane(kampane.filter((k) => k.mesiac === mesiac)), [kampane, mesiac]);

  const lievik = useMemo(() => {
    const v = (d: string) => monthKey(d) === mesiac;
    const dopyty = data.leads.filter((l) => v(l.date));
    const uvodne = new Set(data.sessions.filter((s) => s.sessionType === "UVODNE" && v(s.date)).map((s) => s.client)).size;
    // Nový klient = ten, kto po úvodnom aj zaplatil; návrat po pauze sa neráta.
    const novi = Object.values(clients).filter((c) =>
      !c.vratenie && c.firstSession && v(c.firstSession)
      && (data.payments.some((p) => p.client === c.name)
        || c.sessions.some((x) => x.sessionType !== "UVODNE" && x.price > 0)));
    return { dopyty, uvodne, novi };
  }, [data, clients, mesiac]);

  // Priemery lievika za ostatné mesiace — bez nich sa nedá povedať, či je
  // päť dopytov veľa alebo málo.
  const priemeryLievika = useMemo(() => {
    const mesiace = [...new Set(data.leads.map((l) => monthKey(l.date)).filter(Boolean))].filter((m) => m !== mesiac);
    if (!mesiace.length) return { dopyty: null as number | null, prispevkov: null as number | null };
    const dopyty = mesiace.reduce((a, m) => a + data.leads.filter((l) => monthKey(l.date) === m).length, 0) / mesiace.length;
    const mIg = [...new Set(ig.map((p) => p.mesiac))].filter((m) => m !== mesiac);
    const prispevkov = mIg.length ? mIg.reduce((a, m) => a + ig.filter((p) => p.mesiac === m).length, 0) / mIg.length : null;
    return { dopyty, prispevkov };
  }, [data.leads, ig, mesiac]);

  const poznamky = useMemo(() => suvislosti({
    dopyty: lievik.dopyty.length, dopytyPriemer: priemeryLievika.dopyty,
    spend: hod("Reklama"), spendPriemer: pri("Reklama"),
    dosah: hod("Videnia IG"), dosahPriemer: pri("Videnia IG"),
    noviKlienti: lievik.novi.length,
    prispevkov: prispevky.length, prispevkovPriemer: priemeryLievika.prispevkov,
  }), [lievik, priemeryLievika, metriky, prispevky.length]);

  // ── výrez pre Jarvisa ─────────────────────────────────────────────────────
  const vyrez = () => [
    `Mesiac: ${monthLabel(mesiac)}`,
    "",
    "Čísla (hodnota | odchýlka od priemeru ostatných mesiacov):",
    ...metriky.map((m) => `${m.label}: ${m.hodnota == null ? "—" : cislo(m.hodnota)}${m.odchylka == null ? "" : ` | ${m.odchylka > 0 ? "+" : ""}${Math.round(m.odchylka)} %`}`),
    `Dopytov: ${lievik.dopyty.length}${priemeryLievika.dopyty == null ? "" : ` (priemer ostatných mesiacov ${priemeryLievika.dopyty.toFixed(1)})`}`,
    `Úvodných tréningov: ${lievik.uvodne}`,
    `Nových klientov: ${lievik.novi.length}`,
    "",
    `Kampane (${kampaneMes.length}):`,
    ...kampaneMes.map((k) => `- ${k.nazov} | cieľ ${ciel(k.ciel).label} | ${fmtCZK(k.spend)} | ${k.impressions} videní | ${k.clicks} klikov | ${k.vysledky} konverzií`),
    "",
    `Príspevky na Instagrame (${prispevky.length}), zoradené podľa dosahu:`,
    ...prispevky.slice(0, 15).map((p) => `- ${p.datum} | ${p.typ} | ${p.kategoria || "?"} | dosah ${p.dosah} | uložení ${p.ulozenia} | zdieľaní ${p.zdielania} | „${(p.hook || "").slice(0, 90)}"`),
    "",
    "Čo si appka všimla sama:",
    ...(poznamky.length ? poznamky.map((p) => `- ${p.text}`) : ["- nič výrazné"]),
  ].join("\n");

  const spytajSa = () => {
    if (!chat) return;
    chat.setFloatingOpen(true);
    void chat.ask([
      `Rozober mi mesiac ${monthLabel(mesiac)} z Marketingu.`,
      "",
      vyrez(),
      "",
      "Napíš mi ten mesiac ako PRÍBEH, nie ako výpis čísel — čísla si viem prečítať sám.",
      "Zaujíma ma, čo sa v ňom podľa teba stalo a prečo: ktorý obsah alebo ktorá kampaň podľa všetkého pohla dosahom, či sa to prenieslo do dopytov, a kde sa reťaz pretrhla.",
      "Rob domnienky, ale označ ich ako domnienky. Kde je vzorka malá (pár dopytov), povedz rovno, že sa z toho nedá usudzovať.",
      "Na záver jedna veta: čo by som mal v podobnom mesiaci urobiť inak.",
    ].join("\n"));
  };

  // Široké okno zámerne: rozbor má vedľa seba dlaždice aj dve tabuľky a
  // v stĺpci na 440 px by sa rolovalo cez tri obrazovky.
  return (
    <Modal title={`Mesiac ${monthLabel(mesiac)}`} onClose={onClose} sirka="min(1240px, 97vw)">
      {/* ── čísla mesiaca proti bežnému ─────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 10 }}>
        {metriky.filter((m) => m.hodnota != null).map((m) => (
          <Dlazdica key={m.label} label={m.label} farba={m.farba}
            hodnota={m.fmt ? m.fmt(m.hodnota!) : cislo(m.hodnota!)} odchylka={m.odchylka} />
        ))}
        <Dlazdica label="Dopytov" hodnota={String(lievik.dopyty.length)}
          odchylka={priemeryLievika.dopyty ? zmenaPct(priemeryLievika.dopyty, lievik.dopyty.length) : null} />
        <Dlazdica label="Úvodných tréningov" hodnota={String(lievik.uvodne)} odchylka={null} />
        <Dlazdica label="Nových klientov" hodnota={String(lievik.novi.length)} odchylka={null} farba={C.green} />
        <Dlazdica label="Príspevkov na IG" hodnota={String(prispevky.length)}
          odchylka={priemeryLievika.prispevkov ? zmenaPct(priemeryLievika.prispevkov, prispevky.length) : null} />
      </div>

      {/* ── čo si appka všimla sama ─────────────────────────────────────── */}
      {poznamky.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {poznamky.map((p, i) => (
            <div key={i} style={{
              padding: "9px 12px", borderRadius: 8, marginBottom: 6, lineHeight: 1.55, fontSize: 12.5,
              color: C.textMuted,
              background: mix(p.tón === "dobrá" ? C.green : p.tón === "zlá" ? C.red : C.accent, 8),
            }}>{p.text}</div>
          ))}
          <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
            Toto sú <b style={{ color: C.textMuted }}>súbehy, nie príčiny</b>. Že sa dve čísla pohli naraz,
            neznamená, že jedno spôsobilo druhé — pri piatich dopytoch mesačne to môže byť náhoda.
          </div>
        </div>
      )}

      {chat && (
        <button onClick={spytajSa} disabled={chat.busy}
          style={{ marginTop: 12, padding: "7px 13px", borderRadius: 8, border: `1px solid ${mix(C.accent, 45)}`,
            background: mix(C.accent, 8), color: C.accentLight, fontSize: 12, fontWeight: 600,
            cursor: chat.busy ? "default" : "pointer", opacity: chat.busy ? 0.5 : 1 }}>
          Nech mi tento mesiac rozoberie Jarvis
        </button>
      )}

      {/* Kampane a príspevky vedľa seba. Pod sebou zaberali dve obrazovky
          a pritom sa čítajú spolu — „čo sme pustili a čo sme za to zaplatili".
          Pri úzkom okne sa mriežka sama zloží pod seba. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(470px, 1fr))", gap: 18, alignItems: "start" }}>
      <div>
      <Nadpis>Kampane ({kampaneMes.length})</Nadpis>
      {kampaneMes.length === 0 ? <Nic>V tomto mesiaci nebežala žiadna kampaň.</Nic> : (
        <RolovaciaTabulka pocet={5}>
          <thead>
            <tr>
              <th style={{ ...S.th, textAlign: "left" }}>Kampaň</th>
              <th style={{ ...S.th, textAlign: "left" }}>Cieľ</th>
              <th style={{ ...S.th, textAlign: "right" }}>Minuté</th>
              <th style={{ ...S.th, textAlign: "right" }}>Videnia</th>
              <th style={{ ...S.th, textAlign: "right" }}>Kliky</th>
            </tr>
          </thead>
          <tbody>
            {kampaneMes.map((k) => (
              <tr key={k.id}>
                <td style={{ ...S.td, color: C.text }}>{k.nazov || k.id}</td>
                <td style={{ ...S.td, color: ciel(k.ciel).dopyt ? C.accentLight : C.textDim }}>{ciel(k.ciel).label}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.orange }}>{fmtCZK(k.spend)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{cislo(k.impressions)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{cislo(k.clicks)}</td>
              </tr>
            ))}
          </tbody>
        </RolovaciaTabulka>
      )}

      </div>
      <div>
      <Nadpis>Príspevky na Instagrame ({prispevky.length})</Nadpis>
      {prispevky.length === 0 ? <Nic>Za tento mesiac nemám z Instagram API žiadny príspevok.</Nic> : (
        <RolovaciaTabulka pocet={5}>
          <thead>
            <tr>
              <th style={{ ...S.th, textAlign: "left" }}>Príspevok</th>
              <th style={{ ...S.th, textAlign: "left" }}>Typ hooku</th>
              <th style={{ ...S.th, textAlign: "right" }}>Dosah</th>
              <th style={{ ...S.th, textAlign: "right" }}>Uloženia</th>
              <th style={{ ...S.th, textAlign: "right" }}>Zdieľania</th>
            </tr>
          </thead>
          <tbody>
            {prispevky.map((p) => (
              <tr key={p.id}>
                <td style={{ ...S.td, color: C.text, maxWidth: 420 }}>
                  {/* Sto znakov stačí na rozpoznanie príspevku. Celý text
                      roztiahol riadok na tri a tabuľka sa nedala prečítať. */}
                  <a href={p.permalink} target="_blank" rel="noreferrer" title={p.hook}
                    style={{ color: C.text, textDecoration: "none" }}>
                    {p.hook ? (p.hook.length > 100 ? `${p.hook.slice(0, 100)}…` : p.hook) : "(bez textu)"}
                  </a>
                  <div style={{ fontSize: 10.5, color: C.textDim }}>{p.datum} · {p.typ}</div>
                </td>
                <td style={{ ...S.td, color: C.textDim }}>{p.kategoria || "—"}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.accentLight }}>{cislo(p.dosah)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{p.ulozenia}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{p.zdielania}</td>
              </tr>
            ))}
          </tbody>
        </RolovaciaTabulka>
      )}

      </div>
      </div>

      {/* ── dopyty a klienti ────────────────────────────────────────────── */}
      <Nadpis>Dopyty ({lievik.dopyty.length}) a noví klienti ({lievik.novi.length})</Nadpis>
      {lievik.dopyty.length === 0 && lievik.novi.length === 0 ? <Nic>Za tento mesiac nemám ani dopyt, ani nového klienta.</Nic> : (
        <div style={{ fontSize: 12.5, color: C.textMuted, lineHeight: 1.7 }}>
          {lievik.dopyty.length > 0 && (
            <div><b style={{ color: C.text }}>Dopyty:</b> {lievik.dopyty.map((l) => `${l.name || "?"} (${l.source})`).join(", ")}</div>
          )}
          {lievik.novi.length > 0 && (
            <div><b style={{ color: C.text }}>Noví klienti:</b> {lievik.novi.map((c) => c.name).join(", ")}</div>
          )}
        </div>
      )}

      <div style={{ fontSize: 11, color: C.textDim, marginTop: 14, lineHeight: 1.55 }}>
        Články na webe tu nie sú: v dátach majú len rok, nie mesiac, takže sa k tomuto mesiacu
        priradiť nedajú. Kým sa to nezmení, radšej nič než tipovanie.
      </div>
    </Modal>
  );
}

function Dlazdica({ label, hodnota, odchylka, farba }: { label: string; hodnota: string; odchylka: number | null; farba?: string }) {
  const dobre = odchylka != null && odchylka > 0;
  return (
    <div style={{ padding: "10px 12px", borderRadius: 9, background: mix(C.accent, 5) }}>
      <div style={{ fontSize: 19, fontWeight: 700, color: farba || C.text, fontVariantNumeric: "tabular-nums" }}>{hodnota}</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{label}</div>
      {odchylka != null && Math.abs(odchylka) >= 1 && (
        // Rast zelený, pokles ČERVENÝ. Oranžová znamenala „pozor", nie „horšie",
        // a pri poklese to čítal ako varovanie namiesto výsledku.
        <div style={{ fontSize: 11, marginTop: 3, color: dobre ? C.green : C.red }}>
          {dobre ? "▲" : "▼"} {Math.abs(Math.round(odchylka))} % oproti bežnému mesiacu
        </div>
      )}
    </div>
  );
}

const Nadpis = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, margin: "18px 0 6px" }}>{children}</div>
);
const Nic = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.55 }}>{children}</div>
);
