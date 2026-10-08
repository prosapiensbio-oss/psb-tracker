/**
 * NASUCHO — TELO. Spúšťa sa cez `./scripts/nasucho.sh`, ktorý pred toto
 * prilepí hlavičku z `kontrola-profilov.ts` (tie isté namapované ostré dáta
 * ako v appke). Samostatne sa tento súbor spustiť nedá — a to je zámer:
 * ručne poskladaný vstup `deriveClients` ticho rozsype a návrhy vyjdú iné.
 */
const zoznamNavrhov: { name: string; zostatok: number | null }[] = (Object.values(clients) as any[])
  .filter((c) => c.status !== "Neaktívny")
  .map((c) => ({ name: c.name, zostatok: c.packageTotal > 0 ? c.packageRemaining : null }));

console.log(`aktívnych klientov: ${zoznamNavrhov.length}\n`);
let navrhov = 0;
for (const c of zoznamNavrhov) {
  const os = osi.get(c.name) || [];
  const { stavy } = priebehBalickov(os, c.zostatok, DNES);
  const k = normName(c.name);
  const ceny = [
    ...balicky.filter((b: any) => normName(b.klient) === k && !b.zrusene_at).map((b: any) => ({ den: String(b.platnost_od || "").slice(0, 10), cena: b.cena_czk })),
    ...historiaBalickov.filter((h: any) => normName(h.client) === k).map((h: any) => ({ den: h.validFrom || "", cena: h.payment ?? null })),
  ];
  const nav = navrhNovehoBalicka(c.name, os, stavy, ceny as never);
  if (!nav) continue;
  navrhov++;
  const dlh = bezHodin.some((b: any) => normName(b.klient) === k && b.den === nav.odDna);
  console.log(`${nav.klient.padEnd(22)} ${String(nav.nazov).padEnd(20)} ${String(nav.hodiny).padStart(2)} h  ${String(nav.cena).padStart(6)} Kč  od ${nav.odDna}  nekrytých ${nav.nekrytych}${nav.navrat ? "  · návrat" : ""}${dlh ? "  · bez hodín" : ""}`);
}
console.log(`\nspolu ${navrhov} návrhov`);

/**
 * A ČO Z TOHO BUDE DLH. Návrh sám o dlhu nerozhoduje — rozhoduje
 * `dlhyKlientov` (jedno pravidlo „zaplatený"). Preto sa tu návrhy dosadia
 * do balíčkov a dlh sa prepočíta ešte raz: to je číslo, ktoré Jerry uvidí.
 */
const navrhy: any[] = [];
for (const c of zoznamNavrhov) {
  const os = osi.get(c.name) || [];
  const { stavy } = priebehBalickov(os, c.zostatok, DNES);
  const k = normName(c.name);
  const ceny = [
    ...balicky.filter((b: any) => normName(b.klient) === k && !b.zrusene_at).map((b: any) => ({ den: String(b.platnost_od || "").slice(0, 10), cena: b.cena_czk })),
    ...historiaBalickov.filter((h: any) => normName(h.client) === k).map((h: any) => ({ den: h.validFrom || "", cena: h.payment ?? null })),
  ];
  const nav = navrhNovehoBalicka(c.name, os, stavy, ceny as never);
  if (nav) navrhy.push(nav);
}
const balickyPo = [...balicky, ...navrhy.map((n, i) => ({
  id: 9000 + i, klient: n.klient, nazov: n.nazov, hodiny: n.hodiny, cena_czk: n.cena,
  platnost_od: n.odDna, platnost_do: n.platnostDo, zdroj: "rucne", zrusene_at: null, poznamka: "automaticky",
}))];
const dlhyPo = dlhyKlientov({
  poplatky: poplatky.map((p: any) => ({ id: p.id, klient: p.klient, datum: p.datum, popis: p.popis, suma: Number(p.suma) || 0 })),
  platby: platby.map((p: any) => ({ id: p.id, klient: p.klient, datum: den(p.datum), suma: Number(p.suma_czk) || 0, zruseneAt: p.zrusene_at || null, vopred: !!p.vopred, sposob: p.sposob, fioId: p.fio_id })),
  balicky: balickyPo.map((b: any) => ({ id: b.id, klient: b.klient, nazov: String(b.nazov || ""), cena: b.cena_czk == null ? null : Number(b.cena_czk), platnostOd: den(b.platnost_od), zdroj: String(b.zdroj || ""), zruseneAt: b.zrusene_at || null })),
  ptPlatby: payments.map((p: any) => ({ klient: String(p.client || ""), datum: den(p.date), suma: Number(p.amount) || 0 })),
  ptHistoria: historiaBalickov.map((h: any) => ({ klient: h.client, od: den(h.validFrom) })),
}).polozky;
console.log("\nDLH PO ZALOŽENÍ (len dotknutí):");
for (const n of navrhy) {
  const k = normName(n.klient);
  const pred = dlhy.filter((d: any) => normName(d.klient) === k).reduce((a: number, d: any) => a + Number(d.doplatit || 0), 0);
  const po = dlhyPo.filter((d: any) => normName(d.klient) === k).reduce((a: number, d: any) => a + Number(d.doplatit || 0), 0);
  const detail = dlhyPo.filter((d: any) => normName(d.klient) === k).map((d: any) => `${d.den} ${d.nazov} ${d.doplatit} Kč (${d.zdroj})`).join(" | ");
  console.log(`  ${n.klient.padEnd(22)} dlh pred ${String(pred).padStart(6)} Kč → po ${String(po).padStart(6)} Kč   ${detail}`);
}
