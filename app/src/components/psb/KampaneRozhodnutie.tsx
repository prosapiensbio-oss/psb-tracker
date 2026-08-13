import { useEffect, useMemo, useState } from "react";

import type { ClientAgg } from "../../lib/psb/compute";
import { fmtCZK } from "../../lib/psb/format";
import { ciel, type Kampan } from "../../lib/psb/kampane";
import { STROP_KLIENT, retazecKampani, verdikt } from "../../lib/psb/kampanRetazec";
import { OBDOBIA_MESACNE, mesiaceVOkne } from "../../lib/psb/obdobia";
import { C, mix, S } from "../../lib/psb/theme";
import type { Lead, PSBData } from "../../lib/psb/types";
import { Card, Empty, FilterObdobia, H3, Info, RolovaciaTabulka } from "./ui";

/**
 * Rozhodnutie: čo s ktorou kampaňou.
 *
 * PREČO TÁTO KARTA EXISTUJE POPRI „KAMPANE Z METY"
 *
 * Tá hovorí, ČO sa stalo — koľko sa minulo a koľko z toho bolo videní. Táto
 * hovorí, ČO S TÝM: dotiahne reťaz až po klienta, ktorý zaplatil, a postaví ju
 * proti stropu. Ads Manager prvú polovicu vie; druhú nevie a vedieť nemôže —
 * tréningy sa nedejú na webe.
 *
 * PREČO JE PRÁZDNA A PREČO JE TO V PORIADKU
 *
 * Za 19 mesiacov ani jedna kampaň o dopyt nepožiadala a ani jeden dopyt nenesie
 * utm_campaign. Reťaz teda nemá kde začať. Karta to ale NEPOVIE mlčaním —
 * vypíše, ktorý článok chýba a čo s ním. „Cena za klienta: —" je nepoužiteľná
 * odpoveď; „35 dopytov, z toho 0 s kampaňou → pripoj UTM" je návod.
 *
 * Postavená je teraz zámerne: v septembri sa nemá čo dorábať, len sa naplní.
 */

export function KampaneRozhodnutie({ data, clients, leads }: {
  data: PSBData; clients: Record<string, ClientAgg>; leads: Lead[];
}) {
  const [kampane, setKampane] = useState<Kampan[]>([]);
  const [obdobie, setObdobie] = useState("all");
  const [nacitane, setNacitane] = useState(false);
  const [chyba, setChyba] = useState("");

  useEffect(() => {
    void fetch("/api/meta", { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`server odpovedal ${r.status}`);
        return r.json();
      })
      .then((j: { kampane?: Kampan[] }) => setKampane(j.kampane || []))
      .catch((e) => setChyba(String(e?.message || e).slice(0, 120)))
      .finally(() => setNacitane(true));
  }, []);

  const v = useMemo(() => {
    const okno = new Set(mesiaceVOkne(obdobie, kampane.map((k) => k.mesiac)));
    // Mesačné riadky tej istej kampane sa sčítajú — rozhoduje sa o kampani
    // ako celku, nie o jej máji.
    const podlaId = new Map<string, { id: string; nazov: string; ciel: string; spend: number; vysledkyMeta: number }>();
    for (const k of kampane) {
      if (!okno.has(k.mesiac)) continue;
      const e = podlaId.get(k.id);
      if (e) { e.spend += k.spend; e.vysledkyMeta += k.vysledky; if (k.nazov) e.nazov = k.nazov; e.ciel = k.ciel || e.ciel; }
      else podlaId.set(k.id, { id: k.id, nazov: k.nazov, ciel: k.ciel, spend: k.spend, vysledkyMeta: k.vysledky });
    }

    // Klient = ten, po kom zostali peniaze. Nie ten, kto prišiel na úvodný:
    // úvodný JE prvé sedenie, takže by konverzia vyšla vždy 100 %.
    const mapaKlientov: Record<string, { zaplatil: boolean; trzba: number }> = {};
    for (const c of Object.values(clients)) {
      const trzba = data.payments.filter((p) => p.client === c.name).reduce((a, p) => a + p.amount, 0);
      mapaKlientov[c.name] = {
        zaplatil: trzba > 0 || c.sessions.some((s) => s.sessionType !== "UVODNE" && s.price > 0),
        trzba,
      };
    }

    return retazecKampani(
      [...podlaId.values()],
      leads.map((l) => ({ id: l.id, date: l.date, name: l.name, kampan: l.kampan || "", source: l.source })),
      mapaKlientov,
    );
  }, [kampane, clients, data.payments, leads]);

  if (!nacitane) return null;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            label="Rozhodnutie: čo s ktorou kampaňou"
            text={`Celý reťazec od koruny po klienta, ktorý zaplatil — jediné miesto, kde sa dá zostaviť. Ads Manager pozná výdavok a odoslaný formulár, ale nikdy nepovie cenu za klienta, ktorý zostal pol roka: nevie, kto sa ním stal. Klient tu znamená TEN, KTO ZAPLATIL, nie ten, kto prišiel na úvodný — úvodný je prvé sedenie a konverzia by vždy vyšla 100 %. Strop ${STROP_KLIENT.terezka.toLocaleString("sk")} Kč platí u Terezkiných klientov (850 Kč z hodiny je náklad firmy), ${STROP_KLIENT.jerry.toLocaleString("sk")} Kč u Jerryho (je to jeho vlastná výplata).`}
          />
        </H3>
        <FilterObdobia hodnota={obdobie} onChange={setObdobie} moznosti={OBDOBIA_MESACNE} />
      </div>

      {chyba && <Empty>Nepodarilo sa načítať kampane: {chyba}</Empty>}

      {/* ── kde sa reťaz trhá ─────────────────────────────────────────────── */}
      {v.prekazky.length > 0 && (
        <div style={{ margin: "12px 0 4px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            Reťaz zatiaľ nedrží. Chýba toto:
          </div>
          {v.prekazky.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 12px", borderRadius: 8, marginBottom: 6, background: mix(C.orange, 8), fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }}>
              <span style={{ color: C.orange, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
              <span>{p}</span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.55 }}>
            Prekážky sú v poradí riešenia — kým nie je odstránená prvá, ostatné sa ani nedajú zmerať.
          </div>
        </div>
      )}

      {/* ── reťaz v číslach ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap", margin: "14px 0" }}>
        <Clanok popis="Minuté" hodnota={fmtCZK(v.spolu.spend)} farba={C.orange} />
        <Sipka />
        <Clanok popis="Dopytov z kampaní" hodnota={String(v.spolu.dopytov)} farba={v.spolu.dopytov ? C.text : C.red} />
        <Sipka />
        <Clanok popis="Z nich klientov" hodnota={String(v.spolu.klientov)} farba={v.spolu.klientov ? C.green : C.red} />
        <Sipka />
        <Clanok popis="Tržba od nich" hodnota={fmtCZK(v.spolu.trzba)} farba={C.accentLight} />
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 14 }}>
        <Cifra popis="Cena za dopyt" hodnota={v.spolu.cenaZaDopyt == null ? "—" : fmtCZK(v.spolu.cenaZaDopyt)} />
        <Cifra
          popis={`Cena za klienta · strop ${STROP_KLIENT.terezka.toLocaleString("sk")} Kč`}
          hodnota={v.spolu.cenaZaKlienta == null ? "—" : fmtCZK(v.spolu.cenaZaKlienta)}
          farba={v.spolu.cenaZaKlienta == null ? C.textDim
            : v.spolu.cenaZaKlienta <= STROP_KLIENT.terezka ? C.green
            : v.spolu.cenaZaKlienta <= STROP_KLIENT.mix ? C.orange : C.red}
        />
        <Cifra
          popis="Vrátilo sa"
          hodnota={v.spolu.spend > 0 ? `${Math.round((v.spolu.trzba / v.spolu.spend) * 100)} %` : "—"}
          farba={v.spolu.trzba >= v.spolu.spend ? C.green : C.textMuted}
        />
      </div>

      {v.clanky.length === 0 ? (
        <Empty>V tomto období nemám z Mety žiadnu kampaň.</Empty>
      ) : (
        <RolovaciaTabulka pocet={3}>
          <thead>
            <tr>
              <th style={{ ...S.th, textAlign: "left" }}>Kampaň</th>
              <th style={{ ...S.th, textAlign: "left" }}>Cieľ</th>
              <th style={{ ...S.th, textAlign: "right" }}>Minuté</th>
              <th style={{ ...S.th, textAlign: "right" }}>Dopyty</th>
              <th style={{ ...S.th, textAlign: "right" }}>Klienti</th>
              <th style={{ ...S.th, textAlign: "right" }}>Za klienta</th>
              <th style={{ ...S.th, textAlign: "left" }}>Verdikt</th>
            </tr>
          </thead>
          <tbody>
            {v.clanky.map((c) => {
              const ver = verdikt(c.cenaZaKlienta);
              const cl = ciel(c.kampan.ciel);
              return (
                <tr key={c.kampan.id}>
                  <td style={{ ...S.td, color: C.text }}>{c.kampan.nazov || c.kampan.id}</td>
                  <td style={{ ...S.td, color: cl.dopyt ? C.accentLight : C.textDim }} title={cl.co}>{cl.label}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.orange }}>{fmtCZK(c.kampan.spend)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: c.dopyty.length ? C.text : C.textDim }}>
                    {c.dopyty.length || "—"}
                  </td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: c.klienti.length ? C.green : C.textDim }}
                    title={c.klienti.map((k) => k.name).join(", ")}>
                    {c.klienti.length || "—"}
                  </td>
                  <td style={{ ...S.td, textAlign: "right", color: c.cenaZaKlienta == null ? C.textDim : ver.tón === "dobrá" ? C.green : ver.tón === "zlá" ? C.red : C.textMuted }}>
                    {c.cenaZaKlienta == null ? "—" : fmtCZK(c.cenaZaKlienta)}
                  </td>
                  <td style={{ ...S.td, fontSize: 11.5, color: ver.tón === "dobrá" ? C.green : ver.tón === "zlá" ? C.red : C.textDim }}>
                    {cl.dopyt || c.dopyty.length ? ver.text : "nepýtala dopyt"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </RolovaciaTabulka>
      )}

      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.6 }}>
        Stĺpec <b style={{ color: C.textMuted }}>Dopyty</b> počíta dopyty z Kokpitu spárované cez
        utm_campaign — nie konverzie, ktoré hlási Meta. Tie sú v karte vyššie a bývajú vyššie: Meta si
        pripíše aj toho, kto by prišiel aj bez reklamy, a stiahnutie dokumentu ráta rovnako ako dopyt
        na tréning.
      </div>
    </Card>
  );
}

function Clanok({ popis, hodnota, farba }: { popis: string; hodnota: string; farba: string }) {
  return (
    <div style={{ flex: "1 1 130px", minWidth: 120, padding: "11px 13px", borderRadius: 9, background: mix(C.accent, 5) }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: farba, fontVariantNumeric: "tabular-nums" }}>{hodnota}</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{popis}</div>
    </div>
  );
}

const Sipka = () => (
  <div style={{ alignSelf: "center", color: C.textDim, fontSize: 15, flexShrink: 0 }}>→</div>
);

function Cifra({ popis, hodnota, farba }: { popis: string; hodnota: string; farba?: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: farba || C.text, fontVariantNumeric: "tabular-nums" }}>{hodnota}</div>
      <div style={{ fontSize: 11.5, color: C.textMuted }}>{popis}</div>
    </div>
  );
}
