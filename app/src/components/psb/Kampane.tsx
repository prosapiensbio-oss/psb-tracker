import { useEffect, useMemo, useState } from "react";

import type { ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthLabel } from "../../lib/psb/format";
import { CENA_ZA_DOPYT, hodnot } from "../../lib/psb/hodnotenie";
import { ciel, zlucKampane, type Kampan } from "../../lib/psb/kampane";
import { STROP_KLIENT, retazecKampani, verdikt } from "../../lib/psb/kampanRetazec";
import { OBDOBIA_MESACNE, mesiaceVOkne } from "../../lib/psb/obdobia";
import { C, mix, S } from "../../lib/psb/theme";
import type { Lead, PSBData } from "../../lib/psb/types";
import { Card, Empty, FilterObdobia, H3, Info, RolovaciaTabulka } from "./ui";

/**
 * Kampane — čo stáli a čo priniesli. JEDNA karta.
 *
 * PREČO BOLI CHVÍĽU DVE
 *
 * „Kampane z Mety" mala hovoriť, ČO sa stalo, a „Rozhodnutie", ČO S TÝM. Znelo
 * to dobre pri návrhu a neprežilo prvý pohľad: obe stáli pod sebou, zdieľali
 * tri stĺpce zo siedmich a — čo je horšie — **obe mali stĺpec „Dopyty", každý
 * s iným významom**. V jednej konverzie, ktoré hlási Meta; v druhej dopyty
 * z Kokpitu spárované cez UTM. To nie je jemný rozdiel, to je pasca.
 *
 * Teraz sú oba stĺpce vedľa seba a pomenované tak, aby sa nedali zameniť.
 * Rozdiel medzi nimi je poučný sám o sebe: Meta si pripíše aj toho, kto by
 * prišiel aj bez reklamy, a stiahnutie dokumentu ráta rovnako ako dopyt na
 * tréning.
 *
 * ČO Z TOHO JE ROZHODNUTIE
 *
 * Posledné dva stĺpce. Ads Manager pozná výdavok a odoslaný formulár; NIKDY
 * nepovie cenu za klienta, ktorý zostal pol roka — nevie, kto sa ním stal,
 * lebo tréningy sa nedejú na webe. Kokpit má oba konce.
 */

/** Farba podľa toho, ako ďaleko je cena od stropu. Bez čísla, len signál. */
export function farbaCeny(skore: number): string {
  if (skore >= 8.5) return C.green;
  if (skore >= 6.5) return C.accentLight;
  if (skore >= 4.5) return C.textMuted;
  if (skore >= 2.5) return C.orange;
  return C.red;
}

export function Kampane({ data, clients, leads }: {
  data: PSBData; clients: Record<string, ClientAgg>; leads: Lead[];
}) {
  const [kampane, setKampane] = useState<Kampan[]>([]);
  const [obdobie, setObdobie] = useState("all");
  const [nacitane, setNacitane] = useState(false);
  const [chyba, setChyba] = useState("");
  const [radenie, setRadenie] = useState<"spend" | "impressions" | "clicks" | "vysledky" | "cena">("spend");

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

  const vObdobi = useMemo(() => {
    const okno = new Set(mesiaceVOkne(obdobie, kampane.map((k) => k.mesiac)));
    return kampane.filter((k) => okno.has(k.mesiac));
  }, [kampane, obdobie]);

  const zlucene = useMemo(() => zlucKampane(vObdobi), [vObdobi]);

  // Reťazec kampaň → dopyt → klient. Klient je ten, po kom zostali peniaze:
  // úvodný tréning JE prvé sedenie, takže by konverzia vyšla vždy 100 %.
  const retaz = useMemo(() => {
    const mapaKlientov: Record<string, { zaplatil: boolean; trzba: number }> = {};
    for (const c of Object.values(clients)) {
      const trzba = data.payments.filter((p) => p.client === c.name).reduce((a, p) => a + p.amount, 0);
      mapaKlientov[c.name] = {
        zaplatil: trzba > 0 || c.sessions.some((s) => s.sessionType !== "UVODNE" && s.price > 0),
        trzba,
      };
    }
    return retazecKampani(
      zlucene.map((k) => ({ id: k.id, nazov: k.nazov, ciel: k.ciel, spend: k.spend, vysledkyMeta: k.vysledky })),
      leads.map((l) => ({ id: l.id, date: l.date, name: l.name, kampan: l.kampan || "", source: l.source })),
      mapaKlientov,
    );
  }, [zlucene, clients, data.payments, leads]);

  const podlaId = useMemo(() => new Map(retaz.clanky.map((c) => [c.kampan.id, c])), [retaz]);

  const riadky = useMemo(() => {
    if (radenie === "spend") return zlucene;
    const kluc = (k: (typeof zlucene)[number]) => {
      if (radenie !== "cena") return k[radenie];
      // Kampaň bez klienta nemá cenu za klienta. Nula by ju vystrelila na
      // prvé miesto ako najlacnejšiu — pri radení patrí na koniec.
      const c = podlaId.get(k.id);
      return c?.cenaZaKlienta != null ? -c.cenaZaKlienta : -Infinity;
    };
    return [...zlucene].sort((a, b) => kluc(b) - kluc(a));
  }, [zlucene, radenie, podlaId]);

  const s = retaz.spolu;
  const podielNaDopyt = useMemo(() => {
    const spend = zlucene.reduce((a, k) => a + k.spend, 0);
    const naDopyt = zlucene.reduce((a, k) => a + (ciel(k.ciel).dopyt ? k.spend : 0), 0);
    return spend > 0 ? (naDopyt / spend) * 100 : 0;
  }, [zlucene]);
  const videnia = useMemo(() => zlucene.reduce((a, k) => a + k.impressions, 0), [zlucene]);
  const metaKonverzie = useMemo(() => zlucene.reduce((a, k) => a + k.vysledky, 0), [zlucene]);

  const hlavicka = (id: typeof radenie, text: string) => (
    <th onClick={() => setRadenie(id)}
      style={{ ...S.th, textAlign: "right", cursor: "pointer", userSelect: "none",
        color: radenie === id ? C.accentLight : C.textMuted }}>
      {text}<span style={{ marginLeft: 4, fontSize: 9, color: radenie === id ? C.accent : C.textDim }}>
        {radenie === id ? "▼" : "↕"}</span>
    </th>
  );

  if (!nacitane) return null;
  if (chyba) {
    return (
      <Card>
        <H3><Info label="Kampane" text="Sťahuje sa v Mesiac → Dáta a uzávierka → Meta." /></H3>
        <Empty>Nepodarilo sa načítať kampane: {chyba}</Empty>
      </Card>
    );
  }
  if (kampane.length === 0) {
    return (
      <Card>
        <H3><Info label="Kampane" text="Sťahuje sa v Mesiac → Dáta a uzávierka → Meta — reklama a Instagram." /></H3>
        <Empty>Ešte som z Mety nestiahol žiadnu kampaň. Choď do Mesiac → Dáta a uzávierka → Meta a klikni „Stiahnuť kampane od 2025“.</Empty>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <H3>
          <Info
            label="Kampane — čo stáli a čo priniesli"
            text={`Skutočný výdavok po kampaniach z Meta Marketing API, dotiahnutý až po klienta, ktorý zaplatil. Cieľ kampane je hneď za menom zámerne: kampaň s cieľom „dosah“ nemá ako priniesť dopyt, takže jej nula nie je zlyhanie, ale zadanie. Pozor na dva rôzne stĺpce: „Konverzie (Meta)“ sú to, čo si pripíše Meta — aj stiahnutie dokumentu, aj človeka, ktorý by prišiel aj bez reklamy. „Dopyty (Kokpit)“ sú skutočné dopyty spárované cez utm_campaign. Klient znamená TEN, KTO ZAPLATIL, nie ten, kto prišiel na úvodný — úvodný je prvé sedenie a konverzia by vždy vyšla 100 %. Strop ${STROP_KLIENT.terezka.toLocaleString("sk")} Kč platí u Terezkiných klientov, ${STROP_KLIENT.jerry.toLocaleString("sk")} Kč u Jerryho, kde je hodina jeho vlastná výplata.`}
          />
        </H3>
        <FilterObdobia hodnota={obdobie} onChange={setObdobie} moznosti={OBDOBIA_MESACNE} />
      </div>

      {/* Verdikt navrchu. Bez neho je to tabuľka, z ktorej si každý prečíta,
          čo chce — a Jerry na obrazovku pozerá pár minút mesačne. */}
      <div style={{ margin: "12px 0 4px", padding: "11px 13px", borderRadius: 8, background: mix(podielNaDopyt < 20 ? C.red : C.accent, 8), lineHeight: 1.6, fontSize: 12.5, color: C.textMuted }}>
        <b style={{ color: C.text }}>Čo z toho čítať:</b>{" "}
        {podielNaDopyt < 20 ? (
          <>
            Z {fmtCZK(s.spend)} išlo na kampane, ktoré vôbec pýtali dopyt, len{" "}
            <b style={{ color: C.red }}>{Math.round(podielNaDopyt)} %</b>. Zvyšok kupoval videnia,
            prekliky a interakcie. <b style={{ color: C.text }}>Nula klientov z reklamy preto nie je
            zlyhanie kreatívy — je to splnené zadanie.</b> Kým bude cieľ kampane „dosah“, žiadna
            zmena textu ani obrázka na tom nič nezmení.
          </>
        ) : (
          <>
            Na dopyt bolo namierených <b style={{ color: C.text }}>{Math.round(podielNaDopyt)} %</b>{" "}
            výdavku. Rozhoduje stĺpec <b style={{ color: C.text }}>za klienta</b> proti stropu{" "}
            {STROP_KLIENT.terezka.toLocaleString("sk")} Kč.
          </>
        )}
      </div>

      {/* Reťazec od koruny po klienta. */}
      <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap", margin: "14px 0" }}>
        <Clanok popis="Minuté" hodnota={fmtCZK(s.spend)} farba={C.orange} />
        <Sipka />
        <Clanok popis="Videní" hodnota={videnia.toLocaleString("sk")} farba={C.textMuted} />
        <Sipka />
        <Clanok popis="Dopytov z Kokpitu" hodnota={String(s.dopytov)} farba={s.dopytov ? C.text : C.red} />
        <Sipka />
        <Clanok popis="Z nich klientov" hodnota={String(s.klientov)} farba={s.klientov ? C.green : C.red} />
        <Sipka />
        <Clanok popis="Tržba od nich" hodnota={fmtCZK(s.trzba)} farba={C.accentLight} />
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 14 }}>
        <Cifra popis="Konverzie podľa Mety" hodnota={String(metaKonverzie)} />
        <Cifra popis="Cena za dopyt" hodnota={s.cenaZaDopyt == null ? "—" : fmtCZK(s.cenaZaDopyt)}
          farba={s.cenaZaDopyt == null ? C.textDim : farbaCeny(hodnot(s.cenaZaDopyt, CENA_ZA_DOPYT).skore)} />
        <Cifra
          popis={`Cena za klienta · strop ${STROP_KLIENT.terezka.toLocaleString("sk")} Kč`}
          hodnota={s.cenaZaKlienta == null ? "—" : fmtCZK(s.cenaZaKlienta)}
          farba={s.cenaZaKlienta == null ? C.textDim
            : s.cenaZaKlienta <= STROP_KLIENT.terezka ? C.green
            : s.cenaZaKlienta <= STROP_KLIENT.mix ? C.orange : C.red}
        />
        <Cifra popis="Vrátilo sa" hodnota={s.spend > 0 ? `${Math.round((s.trzba / s.spend) * 100)} %` : "—"}
          farba={s.trzba >= s.spend ? C.green : C.textMuted} />
      </div>

      {/* Kde sa reťaz trhá — v poradí riešenia. */}
      {retaz.prekazky.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            Reťaz zatiaľ nedrží. Chýba toto:
          </div>
          {retaz.prekazky.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 12px", borderRadius: 8, marginBottom: 6, background: mix(C.orange, 8), fontSize: 12.5, color: C.textMuted, lineHeight: 1.6 }}>
              <span style={{ color: C.orange, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
              <span>{p}</span>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: C.textDim, lineHeight: 1.55 }}>
            Kým nie je odstránená prvá prekážka, ostatné sa ani nedajú zmerať.
          </div>
        </div>
      )}

      <RolovaciaTabulka pocet={3}>
        <thead>
          <tr>
            <th style={{ ...S.th, textAlign: "left" }}>Kampaň</th>
            <th style={{ ...S.th, textAlign: "left" }}>Cieľ</th>
            {hlavicka("spend", "Minuté")}
            {hlavicka("impressions", "Videnia")}
            {hlavicka("clicks", "Kliky")}
            {hlavicka("vysledky", "Konverzie (Meta)")}
            <th style={{ ...S.th, textAlign: "right" }}>Dopyty (Kokpit)</th>
            <th style={{ ...S.th, textAlign: "right" }}>Klienti</th>
            {hlavicka("cena", "Za klienta")}
            <th style={{ ...S.th, textAlign: "left" }}>Verdikt</th>
          </tr>
        </thead>
        <tbody>
          {riadky.map((k) => {
            const c = ciel(k.ciel);
            const cl = podlaId.get(k.id);
            const ver = verdikt(cl?.cenaZaKlienta ?? null);
            return (
              <tr key={k.id}>
                <td style={{ ...S.td, color: C.text }}>
                  {k.nazov || k.id}
                  <div style={{ fontSize: 10.5, color: C.textDim }}>
                    {k.od === k.do ? monthLabel(k.od) : `${monthLabel(k.od)} – ${monthLabel(k.do)}`}
                  </div>
                </td>
                <td style={{ ...S.td, color: c.dopyt ? C.accentLight : C.textDim }} title={c.co}>{c.label}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.orange }}>{fmtCZK(k.spend)}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{k.impressions.toLocaleString("sk")}</td>
                <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{k.clicks.toLocaleString("sk")}</td>
                <td style={{ ...S.td, textAlign: "right", color: k.vysledky ? C.textMuted : C.textDim }}>{k.vysledky || "—"}</td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: cl?.dopyty.length ? C.text : C.textDim }}>
                  {cl?.dopyty.length || "—"}
                </td>
                <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: cl?.klienti.length ? C.green : C.textDim }}
                  title={cl?.klienti.map((x) => x.name).join(", ")}>
                  {cl?.klienti.length || "—"}
                </td>
                <td style={{ ...S.td, textAlign: "right", color: cl?.cenaZaKlienta == null ? C.textDim : ver.tón === "dobrá" ? C.green : ver.tón === "zlá" ? C.red : C.textMuted }}>
                  {cl?.cenaZaKlienta == null ? "—" : fmtCZK(cl.cenaZaKlienta)}
                </td>
                <td style={{ ...S.td, fontSize: 11.5, color: ver.tón === "dobrá" ? C.green : ver.tón === "zlá" ? C.red : C.textDim }}>
                  {c.dopyt || cl?.dopyty.length ? ver.text : "nepýtala dopyt"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </RolovaciaTabulka>

      <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.6 }}>
        <b style={{ color: C.textMuted }}>Konverzie (Meta)</b> a <b style={{ color: C.textMuted }}>Dopyty (Kokpit)</b> sú
        dve rôzne čísla a rozdiel medzi nimi je poučný. Meta si pripíše aj toho, kto by prišiel aj bez reklamy,
        a stiahnutie dokumentu ráta rovnako ako dopyt na tréning — 525 stiahnutí príručky z jari 2025 stálo
        4,60 Kč za kus a ani jedno sa nestalo klientom. Kokpit počíta len dopyty spárované cez utm_campaign.
      </div>
    </Card>
  );
}

function Clanok({ popis, hodnota, farba }: { popis: string; hodnota: string; farba: string }) {
  return (
    <div style={{ flex: "1 1 120px", minWidth: 110, padding: "11px 13px", borderRadius: 9, background: mix(C.accent, 5) }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: farba, fontVariantNumeric: "tabular-nums" }}>{hodnota}</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{popis}</div>
    </div>
  );
}

const Sipka = () => <div style={{ alignSelf: "center", color: C.textDim, fontSize: 15, flexShrink: 0 }}>→</div>;

function Cifra({ popis, hodnota, farba }: { popis: string; hodnota: string; farba?: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: farba || C.text, fontVariantNumeric: "tabular-nums" }}>{hodnota}</div>
      <div style={{ fontSize: 11.5, color: C.textMuted }}>{popis}</div>
    </div>
  );
}
