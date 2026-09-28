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
}));
const services = nacitaj("services").map((r: any) => ({
  client: r.client_name, date: r.date, serviceType: r.service_type,
  description: r.service_description, price: r.price_czk, is6m: !!r.is_6m, trainer: r.trainer,
}));
const payments = nacitaj("payments").map((r: any) => ({
  client: r.client_name, date: r.date, amount: r.amount_czk, method: r.payment_method,
}));
const platby = nacitaj("platby");
const poplatky = nacitaj("poplatky").map((r: any) => ({
  id: r.id, datum: r.datum, klient: r.client_name, popis: r.popis || "", suma: r.suma_czk,
}));
const treningyZdarma = nacitaj("zdarma").map((r: any) => ({
  id: "", klient: r.client_name, den: den(r.den), dovod: r.dovod || "", kto: r.kto || "",
}));
const kal = nacitaj("kal");
const balicky = nacitaj("balicky");

const data: PSBData = {
  ...EMPTY_DATA, sessions, packages, services, payments, poplatky, treningyZdarma,
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
const kalUdalosti = kal.map((r: any) => ({ zaciatok: r.zaciatok, klient: r.klient, typ: r.typ }));
const osi = new Map<string, Udalost[]>();
for (const m of mena) {
  osi.set(m, osCasuKlienta(m, { sessions, payments, packages, services, poplatky, treningyZdarma, balicky, kalUdalosti } as never, DNES));
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
    "výpis pre klienta berie platby z PTmindera — tieto v ňom nebudú");

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

console.log(`\n${nalezov ? `\u001b[33m${nalezov} vecí na pozretie\u001b[0m` : "\u001b[32mbez nálezov\u001b[0m"}\n`);
