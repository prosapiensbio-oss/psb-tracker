/**
 * Hĺbkový test notifikácií nad ostrými dátami. Púšťa sa cez ./scripts/naostro.sh.
 *
 * PREČO EXISTUJE POPRI JEDNOTKOVÝCH TESTOCH
 *
 * Tie overujú pravidlá na vymyslených dátach. Toto overuje dve veci, ktoré sa
 * inak nedajú: čo appka povie DNES nad skutočnými 3 500 sedeniami, a čo sa
 * stane PO kliknutí — teda či odpoveď na jednom mieste naozaj niečo zmení na
 * druhom. Obe kolá takto našli chybu, ktorú testy nevideli: klienta tretieho
 * trénera, ktorého notifikácie nevidel ani Jerry, ani Terezka.
 *
 * Nič nezapisuje. Zmeny sa simulujú nad kópiou dát v pamäti.
 */
import {
  capacityByTrainer, cakajuciKlienti, deriveClients, deriveRegister, deriveSixM,
  ktoDnesTrenoval, nepotvrdeneTreningy, nezapisaneDoRegistra, odmlcaniKlienti,
  novyKlientAkNicIne, odpovedeZRegistra, parujVysvetlenia, patriTrenerovi, poslednyTrening,
  pripomienkaDovodu, pripomienkySlubov, stavPolozkyRegistra, trenerZOdpovede,
  udalostiBezMena, znieAkoZrusenie, zruseneTreningy,
} from "../src/lib/psb/compute";
import { EMPTY_DATA, type PSBData } from "../src/lib/psb/types";

const D = process.env.NAOSTRO_DATA;
if (!D) throw new Error("chýba NAOSTRO_DATA — pusti ./scripts/naostro.sh");
const nacitaj = (n: string) => JSON.parse(require("fs").readFileSync(`${D}/${n}.json`, "utf8"));

const base: PSBData = {
  ...EMPTY_DATA,
  sessions: nacitaj("sessions").map((r: any) => ({
    date: r.date, time: r.time, client: r.client_name, sessionTrainer: r.session_trainer,
    sessionName: r.session_name, sessionType: r.session_type, duration: r.duration_min, price: r.price_czk })),
  services: nacitaj("services").map((r: any) => ({
    date: r.date, client: r.client_name, serviceType: r.service_type,
    description: r.service_description, price: r.price_czk, is6m: !!r.is_6m, trainer: r.trainer })),
  payments: nacitaj("payments").map((r: any) => ({ date: r.date, client: r.client_name, amount: r.amount_czk, method: r.payment_method })),
  packages: nacitaj("packages").map((r: any) => ({
    client: r.client_name, status: r.client_status, package: r.package_name,
    remaining: r.sessions_remaining, total: r.sessions_total, added: r.added || "",
    validFrom: r.valid_from || "", validTo: r.valid_to || "", payment: r.payment_czk ?? undefined, kind: r.kind || "" })),
  leads: nacitaj("leads").map((r: any) => ({
    id: r.id, date: r.date, name: r.name, source: r.source, referrer: r.referrer,
    status: r.status, note: r.note, dovod: r.dovod, createdAt: r.created_at || "" })),
  clientOverrides: {}, anomalyAck: {},
};
for (const r of nacitaj("overrides")) base.clientOverrides[r.name] = {
  status: r.status, specialRate: !!r.special_rate, specialRateNote: r.special_rate_note || "",
  trainerNote: r.trainer_note || "", contractSigned: !!r.contract_signed, primaryTrainer: r.primary_trainer,
  bitcoin: !!r.bitcoin, duch: String(r.duch || ""), zdroj: String(r.zdroj || ""), zdrojKto: String(r.zdroj_kto || ""),
  narodeniny: String(r.narodeniny || ""), prvyKontakt: String(r.prvy_kontakt || ""), v6m: String(r.v6m || ""),
  precoNeprisiel: String(r.preco_neprisiel || "") } as any;
for (const r of nacitaj("acks")) base.anomalyAck[r.anomaly_key] = { note: r.note || "", ackedAt: r.acked_at };

// Appka číta len nezmiznuté udalosti a okno −21/+14 dní (api/kalendar.ts).
const OD = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 16);
const DO = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16);
const udalosti = nacitaj("kal_udalosti")
  .filter((u: any) => !u.zmizla_at && u.zaciatok >= OD && u.zaciatok <= DO)
  .map((u: any) => ({ zaciatok: u.zaciatok, klient: u.klient, typ: u.typ, trener: u.trener, nazov: u.nazov, zmizlaAt: null }));
const zmeny = nacitaj("kal_zmeny").map((z: any) => ({
  id: z.id, kedy: z.kedy, druh: z.druh, klient: z.klient, pred: z.pred, po: z.po,
  trener: z.trener, vysvetlene: z.vysvetlene }));

let zlyhani = 0;
const H = (t: string) => console.log(`\n${"═".repeat(78)}\n${t}\n${"═".repeat(78)}`);
const h = (t: string) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 74 - t.length))}`);
const ok = (b: boolean, t: string) => { if (!b) zlyhani++; console.log(`  ${b ? "✓" : "✗ ZLYHALO"}  ${t}`); };

const reg = (d: PSBData, zm = zmeny, ud = udalosti) => {
  const c = deriveClients(d);
  return deriveRegister(d, c, deriveSixM(d, c), capacityByTrainer(c, d.sessions), { udalosti: ud, zmeny: zm });
};
/** Všetko, čo Kokpit v registri naozaj ukáže — vrátane pripomienok z App.tsx. */
const vsetko = (d: PSBData, zm = zmeny, ud = udalosti) => {
  const c = deriveClients(d);
  // `novyKlientAkNicIne` je posledný krok aj v App.tsx — bez neho by skript
  // ukazoval o riadok viac než appka.
  return novyKlientAkNicIne([
    ...reg(d, zm, ud),
    ...pripomienkySlubov(ud as any, d.leads as any, d.anomalyAck, new Date(), zm),
    ...pripomienkaDovodu(c, d.packages as any, ud as any, d.anomalyAck),
    ...nezapisaneDoRegistra({
      leads: d.leads || [], menaKlientov: Object.keys(c), dnes: new Date().toISOString().slice(0, 10),
      zmeny: zm.filter((z: any) => !z.vysvetlene).map((z: any) => ({ druh: z.druh, trener: z.trener })),
      podiely: [] }),
  ]);
};
const otvorene = (r: any[]) => new Set(r.filter((x) => !x.acked).map((x) => x.key));
const sAckom = (extra: Record<string, any>): PSBData => ({ ...base, anomalyAck: { ...base.anomalyAck, ...extra } });

const clients = deriveClients(base);
const exportDo = base.sessions.reduce((m, s) => (s.date > m ? s.date : m), "").slice(0, 10);

H("A · STAV — čo appka hovorí dnes");
console.log(`  sedení ${base.sessions.length} · klientov ${Object.keys(clients).length} · udalostí ${udalosti.length} · zmien ${zmeny.length}`);
console.log(`  export pokrýva sedenia do ${exportDo}`);

h("otvorené notifikácie");
const vs = vsetko(base).filter((x) => !x.acked);
for (const r of vs) console.log(`  [${r.category.padEnd(11)}] ${r.tone.padEnd(6)} ${r.title.slice(0, 62)}`);
console.log(`  spolu ${vs.length}`);

h("nezhoda kalendár vs export");
for (const n of nepotvrdeneTreningy(base.sessions, udalosti, zmeny)) console.log(`  ${n.klient.padEnd(22)} ${n.datum}  (${n.trener})`);

h("klienti čakajúci na potvrdenie z exportu");
for (const c of cakajuciKlienti(clients, udalosti, zmeny)) console.log(`  ${c.meno.padEnd(22)} úvodný ${c.uvodny}  (${c.trener})${c.zNazvu ? "  [meno z názvu]" : ""}`);

h("udalosti bez mena");
const bm = udalostiBezMena(udalosti);
console.log(bm.length ? bm.map((b) => `  ${b.datum} ${b.typ} „${b.nazov}"`).join("\n") : "  žiadne");

h("odmlčaní");
for (const o of odmlcaniKlienti(clients, udalosti, { zmeny })) console.log(`  ${o.meno.padEnd(22)} ${String(o.dni).padStart(3)} dní`);

h("pamäť odpovedí");
const pam = odpovedeZRegistra(base.anomalyAck);
console.log(`  ${pam.length} viet, najnovšia: ${pam[0]?.datum} ${pam[0]?.oCom} — ${(pam[0]?.odpoved || "").slice(0, 40)}`);

H("B · REŤAZE — čo sa stane po kliknutí");
const nezhody = nepotvrdeneTreningy(base.sessions, udalosti, zmeny);

h('1 · „Netrénoval" pri nezhode');
if (!nezhody.length) console.log("  (žiadna nezhoda — preskakujem)");
else {
  const n = nezhody[nezhody.length - 1];
  const zm2 = [...zmeny, { druh: "zrusene", klient: n.klient, pred: `${n.datum}T00:00`, po: null, id: "sim", kedy: new Date().toISOString() }];
  const po = otvorene(reg(sAckom({ [`nepotvrdene|${n.datum}|${n.klient}`]: { note: "netrénoval" } }), zm2));
  ok(!po.has(`nepotvrdene|${n.datum}|${n.klient}`), `${n.meno ?? n.klient}: nezhoda zmizla`);
  // Klienta môže kryť INÝ tréning v kalendári než ten zrušený — vtedy sa
  // „prestal chodiť" vrátiť NEMÁ. 19. 8. 2026 tu kontrola spadla na Richardovi
  // Matlovi, ktorý mal v kalendári ďalší tréning v deň behu; chybná bola ona,
  // nie appka (tretí taký prípad — viď varovanie v hlavičke skriptu).
  const inyKryje = udalosti.some((u) =>
    u.klient === n.klient && u.zaciatok.slice(0, 10) !== n.datum && !u.zmizla_at
    && (u.typ === "trening" || u.typ === "uvodny")
    && u.zaciatok.slice(0, 10) > n.datum);
  if (inyKryje) ok(!po.has(`gone|${n.klient}`), "kalendar ho kryje inym treningom - prestal chodit sa NEVRACIA");
  else ok(po.has(`gone|${n.klient}`) || po.has(`duch|${n.klient}`), "prestal chodit sa VRATIL - kalendar ho uz nekryje");
}

h('2 · „Trénoval" — hodina chýba v PTminderi');
if (nezhody.length) {
  const n = nezhody[nezhody.length - 1];
  const po = otvorene(reg(sAckom({ [`nepotvrdene|${n.datum}|${n.klient}`]: { note: "trénoval — chýba v PTminderi" } })));
  ok(!po.has(`nepotvrdene|${n.datum}|${n.klient}`), "nezhoda vybavená");
  ok(!po.has(`gone|${n.klient}`), "prestal chodit sa NEVRATIL - trening plati");
}

h("3 · Odloženie a návrat po termíne");
{
  const kluc = [...otvorene(reg(base))][0];
  const buduci = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const vcera = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  ok(!otvorene(reg(sAckom({ [kluc]: { note: `odlozene|${buduci}|` } }))).has(kluc), `${kluc.slice(0, 28)}: po odložení skrytá`);
  const v = reg(sAckom({ [kluc]: { note: `odlozene|${vcera}|este som nezistil` } })).find((r) => r.key === kluc);
  ok(v?.acked === false, "po termíne sa vrátila sama");
  ok((v?.note || "").includes("este som nezistil"), "aj s dôvodom, prečo bola odložená");
}

h('4 · „Nehlásiť" umlčí celý druh');
{
  const po = otvorene(reg(sAckom({ "mute|nepotvrdene": { note: "nehlásiť" } })));
  ok([...po].filter((k) => k.startsWith("nepotvrdene|")).length === 0, `umlčaných všetkých ${nezhody.length} nezhôd`);
  ok([...po].filter((k) => k.startsWith("novy|")).length > 0, "iné druhy zostali");
}

h("5 · Odpoveď priradí trénera");
ok(trenerZOdpovede("to je klientka terezky") === "Terezka", "veta rozpoznaná");
ok(trenerZOdpovede("Terezka mi hovorila, ze sa vrati") === null, "obyčajná zmienka nič nepriradí");

h('6 · Odpoveď „dnes zrušil" utíši všetky miesta naraz');
{
  const dnes = new Date().toISOString().slice(0, 10);
  const kto = ktoDnesTrenoval(udalosti as any, { zmeny })[0];
  ok(znieAkoZrusenie("dneska zrušil pretoze ho štipla včela"), "veta rozpoznaná ako zrušenie");
  if (!kto) console.log("  (dnes nikto netrénuje — preskakujem)");
  else {
    const zm2 = [...zmeny, { druh: "zrusene", klient: kto, pred: `${dnes}T00:00`, po: null, id: "sim", kedy: new Date().toISOString() }];
    ok(!ktoDnesTrenoval(udalosti as any, { zmeny: zm2 }).includes(kto), `${kto}: zmizol z chipov v + Zápis`);
    const smsPred = pripomienkySlubov(udalosti as any, base.leads as any, {}, new Date(), zmeny).filter((s) => s.key.includes(kto));
    const smsPo = pripomienkySlubov(udalosti as any, base.leads as any, {}, new Date(), zm2).filter((s) => s.key.includes(kto));
    ok(smsPo.length <= smsPred.length, `SMS a dopyt: ${smsPred.length} → ${smsPo.length}`);
  }
}

h("7 · Čakajúce vysvetlenie sa spáruje, keď sa zmena objaví");
{
  const dnes = new Date().toISOString().slice(0, 10);
  const ack = { [`kalvysv|josef snirych|${dnes}`]: { note: "štípla ho včela" } };
  ok(parujVysvetlenia(ack, [], new Date()).hotove.length === 0, "kým zmena nie je, veta čaká");
  const h1 = parujVysvetlenia(ack, [{ id: "z1", klient: "Josef Šnirych", kedy: new Date().toISOString() }], new Date()).hotove;
  ok(h1.length === 1 && h1[0].poznamka === "štípla ho včela", "po objavení sa spárovala");
  ok(parujVysvetlenia({ "kalvysv|kto|2026-01-01": { note: "x" } }, [], new Date()).expirovane.length === 1, "po týždni vyprší");
}

h("8 · Export dorazí → čakajúci sa potvrdia");
{
  const cak = cakajuciKlienti(clients, udalosti, zmeny);
  console.log(`  čakajú: ${cak.map((c) => c.meno).join(", ") || "nikto"}`);
  if (cak.length) {
    const sExportom: PSBData = { ...base, sessions: [...base.sessions, ...cak.map((c) => ({
      date: c.uvodny, time: "4:00pm", client: c.meno, sessionTrainer: c.trener,
      sessionName: "Úvodní", sessionType: "UVODNE", duration: 60, price: 1490 } as any))] };
    ok(cakajuciKlienti(deriveClients(sExportom), udalosti, zmeny).length === 0, "po nahratí exportu nikto nečaká");
    ok(![...otvorene(reg(sExportom))].some((k) => k.startsWith("novy|")), "notifikacie noveho klienta zmizli samy");
    ok(!!deriveClients(sExportom)[cak[0].meno], `${cak[0].meno} je odteraz plnohodnotný klient`);
  }
}

h("9 · Knižnica a obrazovka hovoria to isté");
{
  const kluc = [...otvorene(reg(base))][0];
  const a = { [kluc]: { note: "odlozene|2099-01-01|" } };
  const zK = reg(sAckom(a)).find((r) => r.key === kluc);
  const zO = stavPolozkyRegistra(kluc, a);
  ok(zK?.acked === zO.acked && zK?.note === zO.note, `${kluc.slice(0, 30)}: rovnaký stav aj poznámka`);
}

H("C · KOMU SA NOTIFIKÁCIA UKÁŽE");
{
  const vidi = (x: any, t: string) => patriTrenerovi(x, clients as any, t);
  const j = vs.filter((x) => vidi(x, "Jerry")), t = vs.filter((x) => vidi(x, "Terezka"));
  console.log(`  Jerry ${j.length} · Terezka ${t.length} · spolu ${vs.length}\n`);
  console.log(`  ${"kľúč".padEnd(38)}${"tréner".padEnd(10)}${"koho sa týka".padEnd(22)}J  T`);
  for (const x of vs) {
    const meno = x.oKom || (x.client && !x.client.includes("|") ? x.client : "");
    console.log(`  ${x.key.slice(0, 36).padEnd(38)}${(x.trener || "—").padEnd(10)}${(meno || "—").slice(0, 20).padEnd(22)}${vidi(x, "Jerry") ? "A " : "- "}${vidi(x, "Terezka") ? " A" : " -"}`);
  }
  const nikto = vs.filter((x) => !vidi(x, "Jerry") && !vidi(x, "Terezka"));
  ok(nikto.length === 0, `notifikácia, ktorú nevidí nikto: ${nikto.length ? nikto.map((x) => x.key).join(", ") : "žiadna"}`);
}

H("D · DUPLICITY A ZAPLAVENIE");
{
  const podla: Record<string, string[]> = {};
  for (const r of vs) {
    const m = r.oKom || (r.client && !r.client.includes("|") ? r.client : null);
    if (m) (podla[m] ||= []).push(r.key.split("|")[0]);
  }
  // Duplicita je TÁ ISTÁ otázka dvakrát, teda dva kľúče rovnakého druhu.
  // Dve rôzne úlohy o jednom človeku (poslať SMS + dopísať dopyt) duplicita
  // nie sú — prvá verzia tejto kontroly to hlásila ako chybu a mýlila sa.
  const dvakrat = Object.entries(podla).filter(([, v]) => new Set(v).size !== v.length);
  ok(dvakrat.length === 0, dvakrat.length
    ? `tá istá otázka dvakrát: ${dvakrat.map(([m, v]) => `${m} (${v.join(", ")})`).join(" · ")}`
    : "nikto nedostal tú istú otázku dvakrát");

  // Zaplavenie sa nehlási ako chyba, ale vidieť ho treba: tri riadky o jednom
  // človeku sú hranica, za ktorou sa zoznam prestáva čítať.
  const vela = Object.entries(podla).filter(([, v]) => v.length >= 3);
  console.log(`  ${vela.length ? "⚠" : "·"}  ľudia s 3+ notifikáciami: ${vela.length ? vela.map(([m, v]) => `${m} (${v.join(", ")})`).join(" · ") : "žiadni"}`);
}

H(zlyhani === 0 ? "VŠETKO PREŠLO" : `ZLYHANÍ: ${zlyhani}`);
process.exit(zlyhani === 0 ? 0 : 1);
