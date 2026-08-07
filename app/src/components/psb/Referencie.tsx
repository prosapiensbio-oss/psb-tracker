import { useMemo, useState } from "react";

import type { ClientAgg } from "../../lib/psb/compute";
import { fmtCZK } from "../../lib/psb/format";
import { C, mix, S } from "../../lib/psb/theme";
import type { PSBData } from "../../lib/psb/types";
import { Card, Empty, H3, Info, Select, TableWrap } from "./ui";

// Referencie — presunuté z Marketingu ku klientom (Jerryho postreh:
// odporúčanie je vzťah medzi ľuďmi, nie kanál). Vo vlastnom súbore preto,
// aby Klienti ↔ MarketingLievik netvorili kruhový import — tá trieda chýb
// včera zložila celú appku.
//
// Filter obdobia je tu prvou implementáciou jednotného štandardu: rovnaké
// možnosti ako v Peniazoch (Celé · 2026 · 2025 · 12 mes. · 6 mes.), Jerryho
// výhrada bola presná — „zarobili 2M" bolo za dva roky a nedalo sa pozrieť,
// koľko z toho je tento rok.
export const OBDOBIA_STD = [
  { value: "all", label: "Celé obdobie" },
  { value: "2025", label: "2025" },
  { value: "2026", label: "2026" },
  { value: "6m", label: "Posledných 6 mes." },
  { value: "3m", label: "Posledné 3 mes." },
  { value: "1m", label: "Posledný mesiac" },
  { value: "custom", label: "Vlastné" },
];

export function obdobieOd(hodnota: string): { od: string; do_: string } {
  const dnes = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (hodnota === "2026") return { od: "2026-01-01", do_: "2026-12-31" };
  if (hodnota === "2025") return { od: "2025-01-01", do_: "2025-12-31" };
  if (hodnota === "6m") return { od: iso(new Date(dnes.getTime() - 183 * 86400000)), do_: iso(dnes) };
  if (hodnota === "3m") return { od: iso(new Date(dnes.getTime() - 92 * 86400000)), do_: iso(dnes) };
  if (hodnota === "1m") return { od: iso(new Date(dnes.getTime() - 31 * 86400000)), do_: iso(dnes) };
  return { od: "0000-01-01", do_: "9999-12-31" };
}

export function Referencie({ data, clients, onKlient }: { data: PSBData; clients: Record<string, ClientAgg>; onKlient?: (m: string) => void }) {
  const [obdobie, setObdobie] = useState("all");
  const [vlastneOd, setVlastneOd] = useState("");
  const [vlastneDo, setVlastneDo] = useState("");
  const r = useMemo(() => {
    const { od, do_ } = obdobie === "custom"
      ? { od: vlastneOd || "0000-01-01", do_: vlastneDo || "9999-12-31" }
      : obdobieOd(obdobie);
    const vsetci = Object.values(clients);
    const zRef = vsetci.filter((c) => c.zdroj === "referencia");
    // Tržba len z platieb VO ZVOLENOM OBDOBÍ — zoznam odporúčateľov zostáva
    // celý (kto koho priviedol sa nemení), mení sa len to, koľko tie vzťahy
    // v danom čase zarobili.
    const trzbaKlienta = (meno: string) => data.payments
      .filter((p) => p.client === meno && p.date.slice(0, 10) >= od && p.date.slice(0, 10) <= do_)
      .reduce((a, p) => a + p.amount, 0);

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
  // `obdobie` v závislostiach je CELÝ filter — bez neho sa memo neprepočíta
  // a prepínač nerobí nič. Presne to sa stalo v prvej verzii.
  }, [clients, data.payments, obdobie, vlastneOd, vlastneDo]);

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <H3><Info text="Najsilnejší kanál PSB. Podiel je z klientov, ktorí majú vyplnený zdroj — nie zo všetkých, lebo pri zvyšku sa jednoducho nevie. Tržba sa počíta z platieb vo zvolenom období; kto koho priviedol sa obdobím nemení." label="Referenčný motor" /></H3>
          <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Select value={obdobie} onChange={setObdobie} options={OBDOBIA_STD} />
            {obdobie === "custom" && (
              <>
                <input type="date" value={vlastneOd} onChange={(e) => setVlastneOd(e.target.value)} style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, colorScheme: "dark" }} />
                <span style={{ color: C.textDim }}>–</span>
                <input type="date" value={vlastneDo} onChange={(e) => setVlastneDo(e.target.value)} style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, colorScheme: "dark" }} />
              </>
            )}
          </span>
        </div>
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
                  <td style={{ ...S.td, fontWeight: 600 }}>
                    {/* Odporúčateľ je klikateľný, len keď je sám klientom — cudzí
                        človek nemá v appke kartu, na ktorú by sa dalo ísť. */}
                    {clients[x.kto] && onKlient ? (
                      <button onClick={() => onKlient(x.kto)} style={{ background: "none", border: "none", padding: 0, color: C.accentLight, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{x.kto}</button>
                    ) : (
                      <span style={{ color: C.text }}>{x.kto}</span>
                    )}
                  </td>
                  <td style={{ ...S.td, textAlign: "right", color: x.klienti.length > 1 ? C.accentLight : C.textMuted }}>{x.klienti.length}</td>
                  <td style={{ ...S.td, fontSize: 12 }}>
                    {x.klienti.map((m, i) => (
                      <span key={m}>
                        {i > 0 && ", "}
                        {onKlient ? (
                          <button onClick={() => onKlient(m)} style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 12, cursor: "pointer", textDecoration: "underline", textDecorationColor: mix(C.border, 90) }}>{m}</button>
                        ) : m}
                      </span>
                    ))}
                  </td>
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


