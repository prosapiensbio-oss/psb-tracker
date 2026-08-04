import { useEffect, useMemo, useState } from "react";

import type { ClientAgg } from "../../lib/psb/compute";
import { fmtCZK, monthKey, monthLabel } from "../../lib/psb/format";
import { ZDROJE } from "./Klienti";
import { C, mix, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, Empty, H3, Info, Select, TableWrap } from "./ui";

// Marketing prestavaný podľa otázok, nie podľa kanálov.
//
// Doteraz bola prvá obrazovka „koľko sme toho vypustili" — počet postov, reels
// a stories. To je výkaz práce, nie odpoveď. Otázka, ktorá rozhoduje o
// peniazoch, znie „odkiaľ prišli klienti a koľko to stálo", a tá sa dá
// zodpovedať len lievikom.
//
// Instagram priviedol za 18 mesiacov 5 klientov, referencie 26. Poradie kariet
// má odteraz zodpovedať tomuto pomeru, nie tomu, kde je najviac dát.

// Konverzia nad 100 % je nemožná a znamená len to, že chýba čitateľ — typicky
// nezapísané dopyty. Vypísať „1200 %" by vyzeralo ako úspech; radšej pomlčka a
// vysvetlenie pod lievikom.
const pct = (a: number, b: number) => (b > 0 && a <= b ? Math.round((a / b) * 100) : null);

const OBDOBIA = [
  { value: "1", label: "Posledný mesiac" },
  { value: "3", label: "Posledné 3 mesiace" },
  { value: "6", label: "Posledných 6 mesiacov" },
  { value: "12", label: "Posledných 12 mesiacov" },
];

const zdrojLabel = (z: string) => ZDROJE.find((x) => x.value === z)?.label || (z ? z : "nevyplnené");

/** Mesiace v okne, od najstaršieho. Kotva je posledný mesiac s dátami, nie dnešok. */
function oknoMesiacov(data: PSBData, n: number): string[] {
  const vsetky = [...new Set(data.sessions.map((s) => monthKey(s.date)))].filter(Boolean).sort();
  return vsetky.slice(-n);
}

type Kroky = { dopyty: number; uvodne: number; klienti: number; trzba: number };

function krokyZa(data: PSBData, clients: Record<string, ClientAgg>, mesiace: string[]): Kroky {
  const v = (d: string) => mesiace.includes(monthKey(d));
  const dopyty = data.leads.filter((l) => v(l.date)).length;
  // Úvodný tréning ako UDALOSŤ, nie ako sedenie: keď niekto príde dvakrát,
  // stále je to jeden človek na začiatku cesty.
  const uvodne = new Set(data.sessions.filter((s) => s.sessionType === "UVODNE" && v(s.date)).map((s) => s.client)).size;
  // Nový KLIENT nie je každý, kto prišiel na úvodný tréning — je to ten, kto
  // potom aj niečo zaplatil. Bez tohto rozlíšenia by konverzia úvodný → klient
  // vždy vyšla 100 %, lebo úvodný tréning JE prvé sedenie a obe čísla by
  // počítali tých istých ľudí.
  const novi = Object.values(clients).filter((c) => {
    if (!c.firstSession || !v(c.firstSession)) return false;
    const zaplatil = data.payments.some((p) => p.client === c.name)
      || c.sessions.some((x) => x.sessionType !== "UVODNE" && x.price > 0);
    return zaplatil;
  });
  // Tržba z NOVÝCH klientov — nie celková. Celková tržba obsahuje aj obnovy
  // starých klientov a tie marketing nepriviedol.
  const menaNovych = new Set(novi.map((c) => c.name));
  const trzba = data.payments
    .filter((p) => p.client && menaNovych.has(p.client) && v(p.date))
    .reduce((a, p) => a + p.amount, 0);
  return { dopyty, uvodne, klienti: novi.length, trzba };
}

function Krok({ cislo, popis, farba, konverzia }: { cislo: string; popis: string; farba?: string; konverzia?: number | null }) {
  return (
    <>
      <div style={{ flex: "1 1 110px", minWidth: 0 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: farba || C.text, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{cislo}</div>
        <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3 }}>{popis}</div>
      </div>
      {konverzia !== undefined && (
        <div style={{ flex: "0 0 auto", textAlign: "center", color: C.textDim, alignSelf: "center" }}>
          <div style={{ fontSize: 16, lineHeight: 1 }}>→</div>
          <div style={{ fontSize: 11, marginTop: 3, color: konverzia == null ? C.textDim : C.accentLight }}>
            {konverzia == null ? "—" : `${konverzia} %`}
          </div>
        </div>
      )}
    </>
  );
}

export function Lievik({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [okno, setOkno] = useState("3");
  const [web, setWeb] = useState<{ ga4: { m: string; udalosti: number }[]; dopyty: { dopyt: string; kliky: number }[] }>({ ga4: [], dopyty: [] });

  useEffect(() => {
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ga4?: { m: string; udalosti: number }[]; gscDopyty?: { dopyt: string; kliky: number }[] }) =>
        setWeb({ ga4: j.ga4 || [], dopyty: j.gscDopyty || [] }))
      .catch(() => {});
  }, []);

  const mesiace = useMemo(() => oknoMesiacov(data, Number(okno)), [data, okno]);
  const k = useMemo(() => krokyZa(data, clients, mesiace), [data, clients, mesiace]);

  // Rozpad podľa zdroja — len klienti, ktorí v období začali.
  const podlaZdroja = useMemo(() => {
    const m = new Map<string, { klientov: number; trzba: number }>();
    const menaVObdobi = Object.values(clients).filter((c) => c.firstSession && mesiace.includes(monthKey(c.firstSession)));
    for (const c of menaVObdobi) {
      const z = c.zdroj || "";
      const e = m.get(z) || { klientov: 0, trzba: 0 };
      e.klientov++;
      e.trzba += data.payments
        .filter((p) => p.client === c.name && mesiace.includes(monthKey(p.date)))
        .reduce((a, p) => a + p.amount, 0);
      m.set(z, e);
    }
    return [...m.entries()].sort((a, b) => b[1].klientov - a[1].klientov);
  }, [clients, data.payments, mesiace]);

  // Predstihové čísla — jediné, ktoré appka dostáva automaticky a presne.
  const ga4Okno = web.ga4.filter((g) => mesiace.includes(g.m));
  const udalosti = ga4Okno.reduce((a, g) => a + g.udalosti, 0);
  const znackove = web.dopyty.filter((d) => /prosapiens|pro sapiens/i.test(d.dopyt)).reduce((a, d) => a + d.kliky, 0);

  const obdobiePopis = mesiace.length ? `${monthLabel(mesiace[0])} – ${monthLabel(mesiace[mesiace.length - 1])}` : "";
  // Menej dopytov než úvodných tréningov je fyzikálne nemožné — každý, kto
  // prišiel, sa najprv musel ozvať. Znamená to len jedno: dopyty sa nezapisujú.
  const chybajuDopyty = k.dopyty < k.uvodne;

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3><Info text="Cesta od prvého ozvania po zaplatený balíček. Percentá sú konverzie medzi krokmi. Tržba je len z klientov, ktorí v tomto období ZAČALI — obnovy starých klientov marketing nepriviedol a do lievika nepatria." label={`Odkiaľ prišli klienti · ${obdobiePopis}`} /></H3>
          <Select value={okno} onChange={setOkno} options={OBDOBIA} />
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", margin: "14px 0 4px" }}>
          <Krok cislo={String(k.dopyty)} popis="Dopyty" konverzia={pct(k.uvodne, k.dopyty)} />
          <Krok cislo={String(k.uvodne)} popis="Úvodné tréningy" konverzia={pct(k.klienti, k.uvodne)} />
          <Krok cislo={String(k.klienti)} popis="Noví klienti" konverzia={undefined} />
          <div style={{ flex: "1 1 130px", minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.accentLight, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(k.trzba)}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 3 }}>Tržba od nových</div>
          </div>
        </div>

        {chybajuDopyty && (
          <div style={{ marginTop: 12, padding: "10px 13px", borderRadius: 9, background: mix(C.orange, 8), border: `1px solid ${mix(C.orange, 26)}`, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
            <b>Dopytov je menej než úvodných tréningov, čo nie je možné</b> — každý, kto prišiel, sa najprv musel ozvať.
            Znamená to, že sa dopyty nezapisujú, a prvé dve čísla lievika sú preto slepé. Zapisujú sa v{" "}
            <b>Prevádzka → Klienti → Dopyty</b> alebo cez <b>+ Zápis</b> hore.
          </div>
        )}
      </Card>

      <Card>
        <H3><Info text="Tieto dve čísla appka dostáva automaticky a sú presné — na rozdiel od dopytov, ktoré závisia od toho, či si ich niekto zapíše. Kľúčové udalosti v GA4 sú odoslané formuláre (kontakt + ďakovná stránka), teda ľudia, ktorí sa reálne ozvali cez web. Značkové vyhľadávanie je počet klikov na dopyt „prosapiens“ — najčistejší ukazovateľ toho, že o vás ľudia vedia a hľadajú vás menom." label="Predstihové čísla (automatické)" /></H3>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: udalosti ? C.text : C.textDim, fontVariantNumeric: "tabular-nums" }}>{udalosti || "—"}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>Odoslaných formulárov (GA4)</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: znackove ? C.text : C.textDim, fontVariantNumeric: "tabular-nums" }}>{znackove || "—"}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>Klikov na „prosapiens“ v Google</div>
          </div>
        </div>
        {!udalosti && !znackove && (
          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.5 }}>
            Zatiaľ prázdne — nahraj GA4 export a Search Console (Údaje → Upload CSV).
          </div>
        )}
      </Card>

      <Card>
        <H3><Info text="Klienti, ktorí v zvolenom období odtrénovali svoje prvé sedenie, rozdelení podľa toho, odkiaľ sa o PSB dozvedeli. Zdroj sa berie z anamnézy alebo z ručného zápisu v karte klienta." label="Odkiaľ konkrétne" /></H3>
        {podlaZdroja.length === 0 ? (
          <Empty>V tomto období nezačal žiadny nový klient.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left" }}>Zdroj</th>
                <th style={{ ...S.th, textAlign: "right" }}>Klientov</th>
                <th style={{ ...S.th, textAlign: "right" }}>Tržba</th>
                <th style={{ ...S.th, textAlign: "right" }}>Podiel</th>
              </tr>
            </thead>
            <tbody>
              {podlaZdroja.map(([z, v]) => (
                <tr key={z || "—"}>
                  <td style={S.td}>{zdrojLabel(z)}</td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: C.text }}>{v.klientov}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.accentLight }}>{fmtCZK(v.trzba)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.textMuted }}>{pct(v.klientov, k.klienti)} %</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}

// ── Čo to stálo ──────────────────────────────────────────────────────────────
export function Naklady({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const [kanaly, setKanaly] = useState<{ mesiac: string; kanal: string; metrika: string; hodnota: number }[]>([]);
  useEffect(() => {
    void fetch("/api/marketing", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { kanaly?: { mesiac: string; kanal: string; metrika: string; hodnota: number }[] }) => setKanaly(j.kanaly || []))
      .catch(() => {});
  }, []);

  const riadky = useMemo(() => {
    // Výdavok na reklamu podľa mesiaca: z mesačnej zostavy (Meta Ads) a
    // z Metricool exportu (spend pri príspevkoch) — čo je k dispozícii.
    const spend = new Map<string, number>();
    for (const r of kanaly) {
      if (!/spent|spend/i.test(r.metrika)) continue;
      spend.set(r.mesiac, (spend.get(r.mesiac) || 0) + r.hodnota);
    }
    const noviVMesiaci = new Map<string, number>();
    const trzbaVMesiaci = new Map<string, number>();
    for (const c of Object.values(clients)) {
      if (!c.firstSession) continue;
      const m = monthKey(c.firstSession);
      noviVMesiaci.set(m, (noviVMesiaci.get(m) || 0) + 1);
      const t = data.payments.filter((p) => p.client === c.name && monthKey(p.date) === m).reduce((a, p) => a + p.amount, 0);
      trzbaVMesiaci.set(m, (trzbaVMesiaci.get(m) || 0) + t);
    }
    return [...spend.keys()].sort().map((m) => ({
      mesiac: m,
      spend: spend.get(m) || 0,
      novi: noviVMesiaci.get(m) || 0,
      trzba: trzbaVMesiaci.get(m) || 0,
    }));
  }, [kanaly, clients, data.payments]);

  const spolu = riadky.reduce((a, r) => ({ spend: a.spend + r.spend, novi: a.novi + r.novi, trzba: a.trzba + r.trzba }), { spend: 0, novi: 0, trzba: 0 });

  return (
    <Card>
      <H3><Info text="Koľko stála reklama a koľko klientov v tom mesiaci začalo. Je to ZMIEŠANÉ číslo, nie cena za klienta z reklamy: anamnéza sa nepýta, či človek prišiel z platenej alebo neplatenej cesty, takže sa nedá povedať, ktorý z tých klientov je z reklamy. Aj tak je to použiteľné — hovorí, koľko celý marketing stojí na jedného získaného klienta, a to je číslo, ktoré sa dá porovnať s cenou balíčka." label="Čo to stálo" /></H3>

      {riadky.length === 0 ? (
        <Empty>Zatiaľ nemám výdavky na reklamu. Nahraj mesačnú zostavu z Metricoolu (PDF alebo CSV).</Empty>
      ) : (
        <>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap", margin: "10px 0 14px" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.orange, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(spolu.spend)}</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>Reklama spolu</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{spolu.novi}</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>Nových klientov</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: spolu.novi ? C.accentLight : C.textDim, fontVariantNumeric: "tabular-nums" }}>
                {spolu.novi ? fmtCZK(spolu.spend / spolu.novi) : "—"}
              </div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>Zmiešaná cena za klienta</div>
            </div>
          </div>

          <TableWrap>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left" }}>Mesiac</th>
                <th style={{ ...S.th, textAlign: "right" }}>Reklama</th>
                <th style={{ ...S.th, textAlign: "right" }}>Nových klientov</th>
                <th style={{ ...S.th, textAlign: "right" }}>Cena za klienta</th>
                <th style={{ ...S.th, textAlign: "right" }}>Tržba od nich</th>
              </tr>
            </thead>
            <tbody>
              {riadky.map((r) => (
                <tr key={r.mesiac}>
                  <td style={S.td}>{monthLabel(r.mesiac)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.orange }}>{fmtCZK(r.spend)}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{r.novi}</td>
                  <td style={{ ...S.td, textAlign: "right", fontWeight: 600, color: r.novi ? C.text : C.textDim }}>
                    {r.novi ? fmtCZK(r.spend / r.novi) : "—"}
                  </td>
                  <td style={{ ...S.td, textAlign: "right", color: C.accentLight }}>{fmtCZK(r.trzba)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <div style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.55 }}>
            Mesiac bez nového klienta má prázdnu cenu, nie nulu — reklama v ňom nebola zadarmo, len sa nekúpila.
            Ak by sa mala oddeliť platená cesta od neplatenej, musela by anamnéza rozlišovať „Instagram“ a „reklama na Instagrame“.
          </div>
        </>
      )}
    </Card>
  );
}

// ── Referenčný motor ─────────────────────────────────────────────────────────
export function Referencie({ data, clients }: { data: PSBData; clients: Record<string, ClientAgg> }) {
  const r = useMemo(() => {
    const vsetci = Object.values(clients);
    const zRef = vsetci.filter((c) => c.zdroj === "referencia");
    const trzbaKlienta = (meno: string) => data.payments.filter((p) => p.client === meno).reduce((a, p) => a + p.amount, 0);

    const podlaOdporucatela = new Map<string, { klienti: string[]; trzba: number }>();
    for (const c of zRef) {
      const kto = (c.zdrojKto || "").trim();
      if (!kto) continue;
      const e = podlaOdporucatela.get(kto) || { klienti: [], trzba: 0 };
      e.klienti.push(c.name);
      e.trzba += trzbaKlienta(c.name);
      podlaOdporucatela.set(kto, e);
    }
    const rebricek = [...podlaOdporucatela.entries()]
      .map(([kto, v]) => ({ kto, ...v }))
      .sort((a, b) => b.klienti.length - a.klienti.length || b.trzba - a.trzba);

    const soZdrojom = vsetci.filter((c) => c.zdroj).length;
    return {
      rebricek,
      zRef: zRef.length,
      soZdrojom,
      bezMena: zRef.filter((c) => !(c.zdrojKto || "").trim()).length,
      trzbaRef: zRef.reduce((a, c) => a + trzbaKlienta(c.name), 0),
      // Porovnáva sa s tržbou klientov so ZNÁMYM zdrojom, nie so všetkými.
      // Inak by to vyzeralo, že odporúčania sú 55 % klientov, ale len 17 %
      // peňazí — pritom ten rozdiel robí 68 klientov, pri ktorých sa jednoducho
      // nevie, odkiaľ prišli. Percento z neznámeho základu je klamstvo.
      trzbaZnamych: vsetci.filter((c) => c.zdroj).reduce((a, c) => a + trzbaKlienta(c.name), 0),
    };
  }, [clients, data.payments]);

  return (
    <>
      <Card>
        <H3><Info text="Najsilnejší kanál PSB, ktorý doteraz nemal v appke ani riadok. Podiel je z klientov, ktorí majú vyplnený zdroj — nie zo všetkých, lebo pri zvyšku sa jednoducho nevie. Tržba je celoživotná, teda všetko, čo daný klient kedy zaplatil." label="Referenčný motor" /></H3>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", margin: "10px 0 6px" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.accentLight, fontVariantNumeric: "tabular-nums" }}>
              {r.soZdrojom ? Math.round((r.zRef / r.soZdrojom) * 100) : 0} %
            </div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>klientov z odporúčania</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontVariantNumeric: "tabular-nums" }}>{r.zRef}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>z {r.soZdrojom} so známym zdrojom</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.green, fontVariantNumeric: "tabular-nums" }}>{fmtCZK(r.trzbaRef)}</div>
            <div style={{ fontSize: 11.5, color: C.textMuted }}>
              tržba z odporúčaní{r.trzbaZnamych ? ` · ${Math.round((r.trzbaRef / r.trzbaZnamych) * 100)} % z klientov so známym zdrojom` : ""}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <H3><Info text="Kto koho priviedol. Meno odporúčateľa sa vypĺňa v karte klienta (Klienti → ✎ → Odkiaľ sa o nás dozvedel). Bez neho sa nedá odovzdať odmena za doporučenie a nedá sa ani povedať, kto je pre PSB najcennejší človek." label="Kto koho priviedol" /></H3>
        {r.rebricek.length === 0 ? (
          <Empty>Zatiaľ nikto nemá vyplnené meno odporúčateľa.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th style={{ ...S.th, textAlign: "left" }}>Odporúčateľ</th>
                <th style={{ ...S.th, textAlign: "right" }}>Priviedol</th>
                <th style={{ ...S.th, textAlign: "left" }}>Koho</th>
                <th style={{ ...S.th, textAlign: "right" }}>Tržba z nich</th>
              </tr>
            </thead>
            <tbody>
              {r.rebricek.map((x) => (
                <tr key={x.kto}>
                  <td style={{ ...S.td, fontWeight: 600, color: C.text }}>{x.kto}</td>
                  <td style={{ ...S.td, textAlign: "right", color: x.klienti.length > 1 ? C.accentLight : C.textMuted }}>{x.klienti.length}</td>
                  <td style={{ ...S.td, color: C.textMuted, fontSize: 12 }}>{x.klienti.join(", ")}</td>
                  <td style={{ ...S.td, textAlign: "right", color: C.green }}>{fmtCZK(x.trzba)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {r.bezMena > 0 && (
          <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 9, background: mix(C.orange, 7), border: `1px solid ${mix(C.orange, 22)}`, fontSize: 12, color: C.text, lineHeight: 1.55 }}>
            <b>{r.bezMena} klientov prišlo z odporúčania, ale nevie sa od koho.</b> Bez mena sa nedá odovzdať odmena
            za doporučenie ani poďakovať — a práve to je celý mechanizmus, ktorý ten kanál drží pri živote.
          </div>
        )}
      </Card>
    </>
  );
}
