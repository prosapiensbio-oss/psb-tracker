/**
 * Kontrolór profilu klienta nad ostrými dátami. Púšťa sa cez
 * ./scripts/kontrola-profilov.sh.
 *
 * Jerry, 27. 9. 2026: „skontroluj celú túto časť — profily, tréningy, ceny,
 * platby, dochádzku — a napíš report všetkého, čo by potenciálne mohlo
 * nesedieť."
 *
 * Každá kontrola má jeden tvar: čo sa porovnáva, koľko nálezov a menovite
 * niekoľko príkladov. Nález NEZNAMENÁ chybu — znamená, že sa dva zdroje
 * o tom istom rozchádzajú a niekto sa na to má pozrieť. Pravidlo z CLAUDE.md
 * platí aj tu: kým nevieš o každom náleze povedať, prečo tam je, kontrola
 * nie je hotová.
 */
import { deriveClients } from "../src/lib/psb/compute";
import { normName } from "../src/lib/psb/format";
import { hodinZNazvuBalicka, osCasuKlienta, type Udalost } from "../src/lib/psb/klientOsCasu";
import { EMPTY_DATA, type PSBData } from "../src/lib/psb/types";
import { priebehBalickov, vypisHodin } from "../src/lib/psb/vypisHodin";
import { historiaPreMail } from "../src/lib/psb/historiaMail";
import { dlhJednehoKlienta, dlznici } from "../src/lib/psb/dlznici";
import { dlhyKlientov } from "../src/lib/psb/zaplatene";
import { doplnHodinySpolu, KOKPIT_OD, sedeniaZKalendara, spojDochadzku } from "../src/lib/psb/sedeniaZKalendara";

const D = process.env.KONTROLA_DATA;
if (!D) throw new Error("chýba KONTROLA_DATA — pusti ./scripts/kontrola-profilov.sh");
const nacitaj = (n: string) => JSON.parse(require("fs").readFileSync(`${D}/${n}.json`, "utf8"));
const den = (x: string | null | undefined) => String(x || "").slice(0, 10);
const DNES = new Date().toISOString().slice(0, 10);

const sessions = nacitaj("sessions").map((r: any) => ({
  date: r.date, time: r.time, client: r.client_name, sessionTrainer: r.session_trainer,
  sessionName: r.session_name, sessionType: r.session_type, duration: r.duration_min, price: r.price_czk,
}));
const packages = nacitaj("packages").map((r: any) => ({
  client: r.client_name, package: r.package_name, total: r.sessions_total, remaining: r.sessions_remaining,
  validFrom: r.valid_from, validTo: r.valid_to, payment: r.payment_czk, added: r.added,
  // Bez týchto dvoch kontrolór počíta inak než appka: `kind` rozlišuje
  // členstvo od balíčka, `naObdobie` nesie prenesené hodiny (8 per month).
  kind: r.kind || "", naObdobie: Number(r.na_obdobie) || 0,
}));
const services = nacitaj("services").map((r: any) => ({
  client: r.client_name, date: r.date, serviceType: r.service_type,
  description: r.service_description, price: r.price_czk, is6m: !!r.is_6m, trainer: r.trainer,
}));
const payments = nacitaj("payments").map((r: any) => ({
  client: r.client_name, date: r.date, amount: r.amount_czk, method: r.payment_method,
}));
const platby = nacitaj("platby").filter((p: any) => !p.zrusene_at);
const poplatky = nacitaj("poplatky").map((r: any) => ({
  id: r.id, datum: r.datum, klient: r.client_name, popis: r.popis || "", suma: r.suma_czk,
}));
const treningyZdarma = nacitaj("zdarma").map((r: any) => ({
  id: "", klient: r.client_name, den: den(r.den), dovod: r.dovod || "", kto: r.kto || "",
}));
const kal = nacitaj("kal");
const balicky = nacitaj("balicky");
const historiaBalickov = nacitaj("historia").map((r: any) => ({
  client: r.klient, status: "", package: r.nazov,
  remaining: Number(r.zostatok) || 0,
  total: r.druh === "package" ? Number(r.hodiny) || 0 : 0,
  naObdobie: r.druh === "membership" ? Number(r.hodiny) || 0 : 0,
  added: r.pridane || "", validFrom: r.od || "", validTo: r.do || "",
  payment: r.platba ?? undefined, kind: r.druh, stav: r.stav || undefined,
}));
const doplneniaHodiny = Object.fromEntries(
  nacitaj("doplnenia").map((r: any) => [`${r.klient}|${den(r.den)}`, Number(r.hodiny) || 0]),
);

/**
 * Jedno pravidlo „zaplatený" — tie isté vstupy ako `loadData`. Z neho idú
 * hodiny (`bezHodin`) aj dlh (`dlhy`); kontrolór bez nich počítal inú
 * kartu aj inú os než appka.
 */
const { polozky: dlhy, otvorenePoplatky, dvojcata } = dlhyKlientov({
  poplatky: poplatky.map((p: any) => ({ id: p.id, klient: p.klient, datum: p.datum, popis: p.popis, suma: Number(p.suma) || 0 })),
  platby: platby.map((p: any) => ({ id: p.id, klient: p.klient, datum: den(p.datum), suma: Number(p.suma_czk) || 0, zruseneAt: p.zrusene_at || null, vopred: !!p.vopred, sposob: p.sposob, fioId: p.fio_id })),
  balicky: balicky.map((b: any) => ({ id: b.id, klient: b.klient, nazov: String(b.nazov || ""), cena: b.cena_czk == null ? null : Number(b.cena_czk), platnostOd: den(b.platnost_od), zdroj: String(b.zdroj || ""), zruseneAt: b.zrusene_at || null })),
  ptPlatby: payments.map((p: any) => ({ klient: String(p.client || ""), datum: den(p.date), suma: Number(p.amount) || 0 })),
  ptHistoria: historiaBalickov.map((h: any) => ({ klient: h.client, od: den(h.validFrom) })),
});
const bezHodin = [...dlhy.map((d) => ({ klient: d.klient, den: d.den })), ...dvojcata];
const platbyKokpit = platby.filter((p: any) => !p.zrusene_at)
  .map((p: any) => ({ klient: String(p.klient), datum: den(p.datum), suma: Number(p.suma_czk) || 0, sposob: String(p.sposob || "") }));

/**
 * Tá istá dochádzka ako v appke: pred KOKPIT_OD PTminder, od neho kalendár.
 * Bez toho by kontrolór od 1. 10. 2026 počítal z iných tréningov než appka
 * a hlásil rozdiely, ktoré v nej nie sú.
 */
{
  const terazPraha = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Prague" }).replace(" ", "T").slice(0, 16);
  const bal = doplnHodinySpolu(
    balicky.map((r: any) => ({ klient: r.klient, nazov: r.nazov, zdroj: r.zdroj, platnost_od: String(r.platnost_od || ""), platnost_do: r.platnost_do || null, hodiny: r.hodiny ?? null, cena_czk: r.cena_czk ?? null, zrusene_at: r.zrusene_at || null })),
    packages.map((p: any) => ({ client: p.client, package: p.package, total: p.total, naObdobie: p.naObdobie })),
    hodinZNazvuBalicka,
  );
  const zKal = sedeniaZKalendara(kal.filter((u: any) => u.zaciatok >= KOKPIT_OD), bal, terazPraha);
  const spojene = spojDochadzku(sessions, zKal).sessions;
  sessions.length = 0;
  sessions.push(...spojene);
}

const data: PSBData = {
  ...EMPTY_DATA, sessions, packages, services, payments, poplatky: otvorenePoplatky, treningyZdarma,
  dlhy, bezHodin, platbyKokpit, historiaBalickov, doplneniaHodiny,
  // Od 1. 10. 2026 sa zostatok na karte počíta z týchto balíčkov — bez nich
  // by kontrolór videl iné číslo než appka.
  balickyKokpit: balicky.map((r: any) => ({
    klient: r.klient, nazov: r.nazov, hodiny: r.hodiny ?? null,
    platnostOd: String(r.platnost_od || "").slice(0, 10), platnostDo: r.platnost_do ? String(r.platnost_do).slice(0, 10) : null,
    zruseneAt: r.zrusene_at || null, kotva: /^zostatok prevzatý/i.test(String(r.poznamka || "")),
  })),
  /**
   * RUČNÉ ZÁSAHY SA MUSIA VOLAŤ `clientOverrides` A BYŤ MAPA PODĽA MENA.
   *
   * Do 28. 9. 2026 tu stálo `overrides: [...]` — pole pod iným názvom, na
   * ktoré sa `deriveClients` ani nepozrie. Kontrolór teda celý čas bežal,
   * akoby Jerry nikdy nič ručne nenastavil: manuálne „Neaktívny" neplatil,
   * kotvy `balicek_zostatok` sa neuplatnili a časť nálezov boli ľudia,
   * o ktorých už dávno rozhodol. Je to presne tá chyba, pred ktorou varuje
   * CLAUDE.md — dvakrát sa mýlila kontrola, nie appka.
   */
  clientOverrides: Object.fromEntries(nacitaj("overrides").map((r: any) => [r.name, {
    status: r.status,
    specialRate: !!r.special_rate,
    specialRateNote: r.special_rate_note || "",
    trainerNote: r.trainer_note || "",
    contractSigned: !!r.contract_signed,
    primaryTrainer: r.primary_trainer,
    bitcoin: !!r.bitcoin,
    duch: String(r.duch || ""),
    zdroj: String(r.zdroj || ""),
    zdrojKto: String(r.zdroj_kto || ""),
    narodeniny: String(r.narodeniny || ""),
    prvyKontakt: String(r.prvy_kontakt || ""),
    v6m: String(r.v6m || ""),
    precoNeprisiel: String(r.preco_neprisiel || ""),
    balicekZostatok: r.balicek_zostatok == null ? null : Number(r.balicek_zostatok),
    balicekKDatumu: String(r.balicek_k_datumu || ""),
    updatedAt: String(r.updated_at || ""),
  }])),
  acks: nacitaj("acks"), leads: nacitaj("leads"),
} as PSBData;

const clients = deriveClients(data);
const mena = Object.keys(clients);
// Len udalosti, ktoré už začali — ako appka (`osKlientaZoServera` s hodinou).
// Ráno by inak dnešný tréning o 17:00 stál na osi ako odtrénovaný a kontrolór
// hlásil „odkaz −1 · karta 0" pri každom, kto dnes trénuje (6. 10. 2026: 13×).
const terazKontroly = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Prague" }).replace(" ", "T").slice(0, 16);
const kalUdalosti = kal.filter((r: any) => String(r.zaciatok).slice(0, 16) <= terazKontroly)
  .map((r: any) => ({ zaciatok: r.zaciatok, klient: r.klient, typ: r.typ }));
const osi = new Map<string, Udalost[]>();
for (const m of mena) {
  osi.set(m, osCasuKlienta(m, { sessions, payments, packages, services, poplatky: otvorenePoplatky, treningyZdarma, balicky, kalUdalosti, bezHodin, platbyKokpit, historia: historiaBalickov, doplneniaHodiny } as never, DNES));
}

let nalezov = 0;
const sekcia = (n: string) => console.log(`\n\u001b[1m${n}\u001b[0m`);
const hlas = (popis: string, kusy: string[], vysvetlenie = "") => {
  if (!kusy.length) { console.log(`  \u001b[32m✓\u001b[0m ${popis}`); return; }
  nalezov += kusy.length;
  console.log(`  \u001b[33m•\u001b[0m ${popis}: \u001b[1m${kusy.length}\u001b[0m`);
  if (vysvetlenie) console.log(`      ${vysvetlenie}`);
  for (const k of kusy.slice(0, 8)) console.log(`      ${k}`);
  if (kusy.length > 8) console.log(`      … a ďalších ${kusy.length - 8}`);
};

// ───────────────────────────────────────────────────────── ODPOČET HODÍN
sekcia("ODPOČET HODÍN V ČLENSTVE");
{
  // Karta počíta k DŇU EXPORTU. Os ide ďalej o tréningy z kalendára, takže
  // porovnávať treba k tomu istému dňu — inak by „nesedí" hlásilo každého,
  // kto bol na tréningu po poslednom nahratí.
  const denExportu = sessions.reduce((n: string, s: any) => (den(s.date) > n ? den(s.date) : n), "");
  const zaporne: string[] = [], nesedi: string[] = [], bezOdpoctu: string[] = [];
  for (const m of mena) {
    const c = clients[m];
    const zostatokTeraz = c.packageTotal > 0 ? c.packageRemaining : null;
    const v = vypisHodin(osi.get(m)!, "", DNES, zostatokTeraz);
    if (v.riadky.some((r) => r.zostatok !== null && r.zostatok < 0)) zaporne.push(m);
    const kExportu = vypisHodin(osi.get(m)!, "", denExportu, zostatokTeraz).koniec;
    if (zostatokTeraz != null && kExportu !== null && kExportu !== zostatokTeraz) {
      // Najčastejšia príčina: os pozná dokúpené hodiny (`Added` + počet
      // v exporte), karta ráta len z aktívneho členstva a o doplnení nevie.
      const dopl = packages.find((b: any) => normName(b.client) === normName(m) && /doplnenie/i.test(b.package) && b.added && b.total > 0);
      // Druhá príčina: posledný balíček nahodil Jerry v Kokpite. Karta ráta
      // z exportu PTmindera, takže o ňom nevie — a vedieť ani nemá.
      // Os je zoradená najnovším hore, takže prvý nájdený je ten posledný.
      const vlastny = osi.get(m)!.find((x: any) => x.druh === "balicekOd" && x.hodin > 0) as any;
      const preco = dopl
        ? ` — os počíta dokúpené hodiny z ${den(dopl.added)} (${dopl.total} h)`
        : vlastny?.zKokpitu
          ? ` — posledný balíček je nahodený v Kokpite (${vlastny.nazov}, ${den(vlastny.den)}); PTminder o ňom nevie`
          : " — príčina neznáma";
      nesedi.push(`${m}: os ${kExportu} h · karta ${zostatokTeraz} h${preco}`);
    }
    // Zaujíma len ten, komu karta hlási ZOSTATOK. Dočerpané členstvo bez
    // odpočtu nikomu nechýba.
    if (c.packageRemaining > 0 && v.koniec === null) bezOdpoctu.push(`${m} — ${c.membership || "bez názvu"} (karta ${c.packageRemaining} h)`);
  }
  hlas("záporný odpočet (nikdy by nemal byť)", zaporne);
  hlas("os času a karta klienta hovoria iné číslo", nesedi, "os sa má posledným členstvom zrovnať s kartou");
  hlas("karta hlási hodiny, os odpočet nevie spočítať", bezOdpoctu, "členstvo bez počtu hodín v názve");
}

// ───────────────────────────────────────────────────────── ZDROJE BALÍČKOV
sekcia("ZDROJE ČLENSTIEV");
{
  const bezHodin = new Map<string, number>();
  // Dokúpenie bez dátumu sa na os položiť nedá. Keď je ale dočerpané
  // (`remaining = 0`), nič to dnes nemení — je to len chýbajúci riadok
  // v histórii. Hlási sa preto len to, čo má ešte zostatok.
  const bezDatumu: string[] = [];
  let docerpanychBezDatumu = 0;
  for (const b of packages) {
    if (b.validFrom || b.added || b.total <= 0) continue;
    if (b.remaining > 0) bezDatumu.push(`${b.client} — ${b.package} (${b.remaining}/${b.total})`);
    else docerpanychBezDatumu++;
  }
  console.log(`  \u001b[2m  dočerpaných dokúpení bez dátumu: ${docerpanychBezDatumu} — dnes už nič nemenia\u001b[0m`);
  // Staré stupne (SILVER, BRONZ, GOLD…) sa predávali do 2025 a Jerry ich už
  // nerieši (27. 9. 2026). Hlási sa len to, čo sa predáva TERAZ — zoznam,
  // ktorý sa nedá vyčistiť, sa prestane čítať.
  const odKedy = new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10);
  for (const s of services) {
    if (s.serviceType !== "Membership" && s.serviceType !== "Package") continue;
    if (/doplnenie/i.test(s.description) || den(s.date) < odKedy) continue;
    if (!hodinZNazvuBalicka(s.description)) bezHodin.set(s.description, (bezHodin.get(s.description) || 0) + 1);
  }
  hlas("členstvo predané za posledného pol roka bez počtu hodín (odpočet preň nebeží)",
    [...bezHodin.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} — ${n}×`),
    "hodiny nie sú v názve ani v mape HODIN_PODLA_NAZVU");
  hlas("dokúpené hodiny so zostatkom, ale bez dátumu", bezDatumu, "na os ich položiť nejde a klientovi hodiny chýbajú");

  const dvojice = new Map<string, number>();
  for (const b of packages) {
    if (!b.validFrom) continue;
    const k = `${b.client}|${den(b.validFrom)}|${b.package}`;
    dvojice.set(k, (dvojice.get(k) || 0) + 1);
  }
  hlas("dva rovnaké balíčky v ten istý deň", [...dvojice.entries()].filter(([, n]) => n > 1).map(([k, n]) => {
    const [kl, d, nz] = k.split("|");
    const vKnihe = services.filter((x: any) => normName(x.client) === normName(kl) && den(x.date) === d && x.description === nz).length;
    return `${kl} · ${d} · ${nz} — v snímke ${n}×, v knihe predajov ${vKnihe}×${vKnihe < n ? " → os berie knihu" : ""}`;
  }), "snímka môže mať duplicitu; rozhoduje kniha predajov");
}

// ───────────────────────────────────────────────────────── TRÉNINGY
sekcia("TRÉNINGY A DOCHÁDZKA");
{
  const dvaVDen = new Map<string, number>();
  for (const s of sessions) dvaVDen.set(`${normName(s.client)}|${den(s.date)}`, (dvaVDen.get(`${normName(s.client)}|${den(s.date)}`) || 0) + 1);
  const viacero = [...dvaVDen.entries()].filter(([, n]) => n > 1);
  hlas("klient má v jeden deň viac sedení", viacero.map(([k, n]) => `${k.split("|")[0]} · ${k.split("|")[1]} — ${n}×`),
    "os času páruje kalendár s exportom PO DŇOCH a značka „zdarma\" je tiež na deň");

  const bezKlienta = new Set<string>();
  for (const s of sessions) if (!clients[s.client]) bezKlienta.add(s.client);
  hlas("sedenie na meno, ktoré nie je klient", [...bezKlienta]);

  const buducnost = sessions.filter((s: any) => den(s.date) > DNES).map((s: any) => `${s.client} · ${den(s.date)}`);
  hlas("sedenie s dátumom v budúcnosti", buducnost);

  // Dva rôzne prípady s jedným tvarom: čerstvé (čakajú na nový export) a
  // staré (z obdobia, ktoré export nepokrýva — PTminder ide od 1/2025).
  const prvySession = sessions.reduce((n: string, x: any) => (n && n < den(x.date) ? n : den(x.date)), "");
  const denExportu2 = sessions.reduce((n: string, x: any) => (den(x.date) > n ? den(x.date) : n), "");
  const cerstve: string[] = [], stare: string[] = [];
  for (const m of mena) {
    const kal = osi.get(m)!.filter((u) => u.druh === "trening" && u.zKalendara);
    const c = kal.filter((u) => u.den > denExportu2).length;
    const st = kal.filter((u) => u.den < prvySession).length;
    if (c) cerstve.push(`${m} — ${c}×`);
    if (st) stare.push(`${m} — ${st}×`);
  }
  hlas(`tréningy po dni exportu (${denExportu2}) — čakajú na nový upload`, cerstve,
    "normálny stav medzi exportmi; do odpočtu sa počítajú, karta o nich ešte nevie");
  hlas(`tréningy spred začiatku exportu (${prvySession}) — len z kalendára`, stare,
    "PTminder v appke siaha po tento deň; staršie hodiny nemajú k čomu patriť");
}

// ───────────────────────────────────────────────────────── PLATBY
sekcia("PLATBY");
{
  const bezKlienta = new Set<string>();
  for (const p of payments) if (!clients[p.client]) bezKlienta.add(p.client);
  hlas("platba z PTmindera na meno, ktoré nie je klient", [...bezKlienta]);

  const vlastne = new Set<string>();
  for (const p of platby) if (!mena.some((m) => normName(m) === normName(p.klient))) vlastne.add(p.klient);
  hlas("platba zapísaná v Kokpite na meno, ktoré nie je klient", [...vlastne]);

  // Tá istá suma, ten istý klient, ten istý deň v OBOCH zdrojoch = riziko
  // dvojitého započítania počas súbežného chodu.
  const zPt = new Set(payments.map((p: any) => `${normName(p.client)}|${den(p.date)}|${Math.round(p.amount)}`));
  const dvakrat = platby
    .filter((p: any) => zPt.has(`${normName(p.klient)}|${den(p.datum)}|${Math.round(p.suma_czk)}`))
    .map((p: any) => `${p.klient} · ${den(p.datum)} · ${Math.round(p.suma_czk)} Kč`);
  hlas("tá istá platba je v PTminderi aj v Kokpite", dvakrat,
    "sčítať oba zdroje sa počas súbežného chodu NESMIE");

  const lenVKokpite = platby
    .filter((p: any) => !zPt.has(`${normName(p.klient)}|${den(p.datum)}|${Math.round(p.suma_czk)}`))
    .map((p: any) => `${p.klient} · ${den(p.datum)} · ${Math.round(p.suma_czk)} Kč`);
  hlas("platba je LEN v Kokpite, v PTminderi nie", lenVKokpite,
    "na osi aj vo výpise pre klienta sú (od 5. 10. 2026 `zlucPlatby`), len v PTminderi chýbajú");

  const duplicity = new Map<string, number>();
  for (const p of payments) {
    const k = `${normName(p.client)}|${den(p.date)}|${Math.round(p.amount)}`;
    duplicity.set(k, (duplicity.get(k) || 0) + 1);
  }
  hlas("dve rovnaké platby v jeden deň (PTminder)", [...duplicity.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k.replace(/\|/g, " · ")} — ${n}×`),
    "môže byť pravda (dve časti), ale aj dvojitý import");
}

// ───────────────────────────────────────────────────────── DLH
sekcia("TRÉNINGY NA NEZAPLATENOM ČLENSTVE");
{
  const hranica = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const sDlhom: { m: string; nedavno: number; spolu: number; posledny: string }[] = [];
  let treningovSpolu = 0, znaciekSpolu = 0;
  for (const m of mena) {
    const { stavy } = priebehBalickov(osi.get(m)!, null, DNES);
    let nedavno = 0, spolu = 0, posledny = "";
    for (const u of osi.get(m)!) {
      if (u.druh === "trening") treningovSpolu++;
      const s = stavy.get(u);
      if (!s?.dlh) continue;
      spolu++; znaciekSpolu++;
      if (u.den >= hranica) nedavno++;
      if (!posledny) posledny = u.den;
    }
    if (spolu) sDlhom.push({ m, nedavno, spolu, posledny });
  }
  console.log(`  \u001b[2m  značiek spolu ${znaciekSpolu} z ${treningovSpolu} tréningov (${Math.round((100 * znaciekSpolu) / treningovSpolu)} %), klientov so značkou ${sDlhom.length} zo ${mena.length}\u001b[0m`);
  hlas("klienti so značkou za posledné 2 mesiace",
    sDlhom.filter((x) => x.nedavno).sort((a, b) => b.nedavno - a.nedavno).map((x) => `${x.m} — ${x.nedavno}× za 2 mesiace (${x.spolu}× celkovo, naposledy ${x.posledny})`),
    "značka = tréning skôr, než zaň prišla platba; nie je to automaticky chyba");

  const otvorene = poplatky.map((p: any) => `${p.klient} · ${den(p.datum)} · ${Math.round(p.suma)} Kč — ${String(p.popis).slice(0, 44)}`);
  hlas("otvorené poplatky v PTminderi", otvorene, "toto sú skutočne nezaplatené veci");
}

// ───────────────────────────────────────────────────────── CENY
sekcia("CENY A HODINY");
{
  const bezCeny = sessions.filter((s: any) => !s.price).length;
  console.log(`  \u001b[32m✓\u001b[0m sedení s nulovou cenou: ${bezCeny} z ${sessions.length} — normálne, znamená „platené balíčkom\"`);

  const dlhsie = sessions.filter((s: any) => s.duration && s.duration !== 60).map((s: any) => `${s.client} · ${den(s.date)} · ${s.duration} min`);
  hlas("sedenie s inou dĺžkou než 60 minút", dlhsie, "do odpočtu ide skutočná dĺžka (90 min = 1,5 h)");

  const zd = treningyZdarma.map((z: any) => `${z.klient} · ${z.den}${z.dovod ? ` — ${z.dovod}` : " — BEZ DÔVODU"}`);
  hlas("tréningy označené ako zdarma", zd, "hodina sa z členstva nestrhla");
}

// ───────────────────────────────────────── ODKAZ PRE KLIENTA
/**
 * ČO UVIDÍ KLIENT ZA ODKAZOM — a či to sedí s tým, čo vidí Jerry.
 *
 * Jerry, 3. 10. 2026: „zápisy v tých odkazoch by mali byť totožné s tým, čo
 * nájdem u každého klienta jednotlivo." Stránka `/v/<token>` a stôl klienta
 * dnes čítajú tie isté tabuľky a tú istú funkciu, ale sú to dve miesta v kóde
 * a raz sa rozídu. Táto kontrola to hlási skôr, než to uvidí klient:
 *
 *   • tréning bez čísla — ani hodina, ani mínus,
 *   • diera v odpočte — 6, 5, 3 namiesto 6, 5, 4,
 *   • nadpis stránky („Zbývá ti…") proti číslu na karte,
 *   • suma na QR proti karte dlžníkov.
 *
 * Kontroluje sa KAŽDÝ klient, nielen tých pár, čo odkaz už dostali — SMS sa
 * posiela na klik a nikto si pred ňou nebude prechádzať os ručne.
 */
sekcia("ODKAZ PRE KLIENTA");
{

  const prazdne: string[] = [];
  const diery: string[] = [];
  const nadpisy: string[] = [];
  const sumy: string[] = [];
  const dlzniciPodlaMena = new Map(dlznici(dlhy, {}, DNES).map((d) => [normName(d.meno), d.spolu]));

  /**
   * Len ľudia, ktorým SMS naozaj môže odísť — kto netrénoval tri mesiace,
   * odkaz nedostane a jeho os z roku 2025 by kontrolu len zasypala. Nálezy
   * sa počítajú po KLIENTOVI, nie po riadku: „David Novotný má 40 prázdnych
   * riadkov" je jeden problém, nie štyridsať.
   */
  const hranicaAktivity = new Date(Date.parse(`${DNES}T12:00:00Z`) - 90 * 86400000).toISOString().slice(0, 10);
  for (const m of mena) {
    const c = clients[m];
    const posledny = (osi.get(m) || []).filter((u) => u.druh === "trening").map((u) => u.den).sort().pop() || "";
    if (posledny < hranicaAktivity) continue;
    const v = historiaPreMail(m, osi.get(m)!, c, DNES, undefined, false);

    /**
     * Prázdny riadok sa počíta LEN tam, kde výpis stojí na balíčku. Kto
     * balíček nemá (platí tréning po tréningu, starý paušál), nemá odkiaľ
     * vziať číslo a prázdno je pravda, nie chyba.
     */
    if (v.os.some((b) => b.druh === "balicekOd")) {
      const bez = v.os.filter((b) => b.druh === "trening" && b.zostatok == null && !b.dlh);
      if (bez.length) prazdne.push(`${m} — ${bez.length}× (naposledy ${bez[bez.length - 1].den})`);
    }

    const hodiny = v.os.filter((b) => b.druh === "trening" && b.zostatok != null).map((b) => b.zostatok as number);
    for (let i = 1; i < hodiny.length; i++) {
      // Nový balíček smie číslo zdvihnúť; pokles o viac než hodinu nie.
      if (hodiny[i] < hodiny[i - 1] - 1) diery.push(`${m} · ${hodiny[i - 1]} → ${hodiny[i]}`);
    }

    // Nadpis stránky vychádza zo `zostatok`; karta klienta z `packageRemaining`.
    if (v.zostatok != null && c.packageTotal > 0 && v.zostatok !== c.packageRemaining) {
      nadpisy.push(`${m} — odkaz ${v.zostatok} h · karta ${c.packageRemaining} h`);
    }

    const dlh = dlhJednehoKlienta(dlhy, m);
    const naKarte = dlzniciPodlaMena.get(normName(m)) || 0;
    if (Math.round(dlh.dlzi) !== Math.round(naKarte)) {
      sumy.push(`${m} — odkaz ${Math.round(dlh.dlzi)} Kč · karta dlžníkov ${Math.round(naKarte)} Kč`);
    }
  }

  hlas("tréning bez čísla na osi", prazdne, "klient vidí riadok, ktorý nič nehovorí");
  hlas("diera v odpočte hodín", diery, "6, 5, 4… sa nesmie preskočiť");
  hlas("nadpis odkazu proti karte klienta", nadpisy, "obe čísla majú hovoriť to isté");
  hlas("suma na QR proti karte dlžníkov", sumy, "dve definície dlhu sa rozišli");
}

console.log(`\n${nalezov ? `\u001b[33m${nalezov} vecí na pozretie\u001b[0m` : "\u001b[32mbez nálezov\u001b[0m"}\n`);
