// Report — appka po sebe napíše, ako jej to išlo, v texte, ktorý sa dá vziať
// preč.
//
// Dva reálne dôvody, prečo existuje (Jerryho odpoveď):
//   1. Keď v Claude projekte plánuje obsah, potrebuje tam vložiť VŠETKO, čo
//      appka vie — inak plánuje naslepo a Claude si domýšľa čísla.
//   2. Keď výsledky ukazuje Jarkovi alebo Terezke, potrebuje z toho vetu, nie
//      screenshot dashboardu.
//
// Preto markdown, nie CSV: markdown sa dá prilepiť do chatu aj poslať človeku a
// v oboch prípadoch je čitateľný.
//
// Pravidlá, ktoré tu držíme, aby report neklamal:
//   • Filter podľa trénera platí na SEDENIA (hodiny, vyfakturované, kapacita).
//     Platby v PTminderi trénera nemajú, takže prijaté tržby sú vždy za celé
//     štúdio — a je to v reporte napísané, nie zamlčané.
//   • Prijaté tržby ≠ vyfakturované. Tržba je peniaz, ktorý prišiel (často za
//     balík dopredu), vyfakturované je hodnota odtrénovaných sedení. V mesiaci,
//     keď si päť ľudí predplatí, sa tie dve čísla nemajú rovnať.
//   • Marketingové čísla sú z Metricoolu/GA4/GSC a o klientoch nevedia nič.
//     Nikdy sa tu nespájajú s peniazmi — jediný poctivý most je dopyt a pole
//     „odkiaľ prišiel".
import {
  monthlyFinance,
  type CapacityRow,
  type ClientAgg,
  type RegisterItem,
  type SixMRow,
} from "./compute";
import { monthKey, monthLabel } from "./format";
import { GA4_MESACNE, GSC_DOPYTY, GSC_MESACNE, MKT_MESACNE, MKT_TOP } from "./marketing";
import type { PSBData } from "./types";

export type SekciaId = "peniaze" | "klienti" | "treningy" | "marketing" | "dopyty" | "signaly";

export const SEKCIE: { id: SekciaId; label: string; popis: string }[] = [
  { id: "peniaze", label: "Peniaze", popis: "Prijaté tržby, vyfakturované, sedenia po mesiacoch." },
  { id: "klienti", label: "Klienti", popis: "Koľko ich je, kto pribudol, kto prestal chodiť, rozloženie balíčkov." },
  { id: "treningy", label: "Tréningy a kapacita", popis: "Odtrénované hodiny, rozdelenie medzi trénerov, vyťaženie." },
  { id: "marketing", label: "Marketing", popis: "Instagram, web a vyhľadávanie — vstupy, nie výsledky." },
  { id: "dopyty", label: "Dopyty a zdroje", popis: "Odkiaľ ľudia prichádzajú a čo sa s dopytmi stalo." },
  { id: "signaly", label: "Na čo sa pozrieť", popis: "Otvorené signály z dashboardu." },
];

export type ReportFilter = {
  od: string;            // "YYYY-MM"
  doM: string;           // "YYYY-MM"
  trener: string;        // "obaja" | "Jerry" | "Terezka"
  sekcie: SekciaId[];
  detail: boolean;       // true = tabuľky po mesiacoch a menné zoznamy
};

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const kc = (n: number) => `${r0(n).toLocaleString("cs-CZ")} Kč`;
const vRozsahu = (mk: string, f: ReportFilter) => !!mk && mk >= f.od && mk <= f.doM;

/** Mesiace, v ktorých appka vôbec niečo má — z toho sa ponúka rozsah. */
export function dostupneMesiace(data: PSBData): string[] {
  const s = new Set<string>();
  for (const x of data.sessions) s.add(monthKey(x.date));
  for (const p of data.payments) if (p.client) s.add(monthKey(p.date));
  for (const m of MKT_MESACNE) s.add(m.m);
  return [...s].filter(Boolean).sort();
}

const tabulka = (hlavicka: string[], riadky: (string | number)[][]): string => {
  const out = [`| ${hlavicka.join(" | ")} |`, `| ${hlavicka.map(() => "---").join(" | ")} |`];
  for (const r of riadky) out.push(`| ${r.join(" | ")} |`);
  return out.join("\n");
};

export function buildReport(
  data: PSBData,
  clients: Record<string, ClientAgg>,
  sixM: SixMRow[],
  capacity: CapacityRow[],
  register: RegisterItem[],
  f: ReportFilter,
): string {
  const chce = (s: SekciaId) => f.sekcie.includes(s);
  const trenerFilter = f.trener !== "obaja";
  const sedenia = data.sessions.filter(
    (s) => vRozsahu(monthKey(s.date), f) && (!trenerFilter || s.sessionTrainer === f.trener),
  );
  const obdobie = f.od === f.doM ? monthLabel(f.od) : `${monthLabel(f.od)} – ${monthLabel(f.doM)}`;
  const pocetMesiacov = Math.max(1, new Set(sedenia.map((s) => monthKey(s.date))).size);

  const out: string[] = [];
  out.push(`# ProSapiens Biomechanic — report za ${obdobie}`);
  out.push("");
  out.push(
    `*Vygenerované ${new Date().toISOString().slice(0, 10)} z Trackera.* ` +
      (trenerFilter
        ? `Filter: **${f.trener}** — platí na sedenia, hodiny a vyfakturované. Prijaté tržby trénera nerozlišujú (platba v PTminderi nemá trénera), takže sú za celé štúdio.`
        : "Čísla sú za oboch trénerov spolu."),
  );
  out.push("");

  // ── Peniaze ────────────────────────────────────────────────────────────────
  if (chce("peniaze")) {
    const fin = monthlyFinance(data).filter((m) => vRozsahu(m.month, f));
    const trzby = fin.reduce((a, m) => a + m.cash, 0);
    const vyfakt = trenerFilter
      ? sedenia.reduce((a, s) => a + s.price, 0)
      : fin.reduce((a, m) => a + m.revenue, 0);
    const pocetSedeni = sedenia.length;

    out.push("## Peniaze");
    out.push("");
    out.push(`- **Prijaté tržby:** ${kc(trzby)} (${kc(trzby / fin.length || 0)} / mesiac)`);
    out.push(`- **Vyfakturované** (hodnota odtrénovaných sedení): ${kc(vyfakt)}`);
    out.push(`- **Sedení:** ${pocetSedeni} · priemerná cena sedenia ${kc(pocetSedeni ? vyfakt / pocetSedeni : 0)}`);
    out.push("");
    out.push(
      "> Prijaté tržby a vyfakturované sa nemajú rovnať: tržba je peniaz, ktorý prišiel " +
        "(často za balík dopredu), vyfakturované je hodnota sedení, ktoré sa naozaj odtrénovali.",
    );
    out.push("");
    if (f.detail && fin.length > 1) {
      const rows = fin.map((m) => {
        const sed = sedenia.filter((s) => monthKey(s.date) === m.month);
        const rev = trenerFilter ? sed.reduce((a, s) => a + s.price, 0) : m.revenue;
        return [monthLabel(m.month), kc(m.cash), kc(rev), trenerFilter ? sed.length : m.sessions];
      });
      out.push(tabulka(["Mesiac", "Prijaté tržby", "Vyfakturované", "Sedení"], rows));
      out.push("");
    }
  }

  // ── Klienti ────────────────────────────────────────────────────────────────
  if (chce("klienti")) {
    const zoznam = Object.values(clients).filter(
      (c) => !trenerFilter || c.primaryTrainer === f.trener,
    );
    const aktivni = zoznam.filter((c) => c.status !== "Neaktívny");
    const novi = zoznam.filter((c) => vRozsahu(monthKey(c.firstSession), f));
    // „Prestal chodiť" = posledné sedenie padlo do obdobia, ale odvtedy nič.
    // Zámerne sa neopiera o status: ten sa dá prepísať ručne a report by potom
    // hovoril o rozhodnutí, nie o skutočnosti.
    const koniecObdobia = `${f.doM}-31`;
    const stratili = zoznam.filter(
      (c) => c.lastSession && vRozsahu(monthKey(c.lastSession), f) && c.lastSession < koniecObdobia && !data.sessions.some((s) => s.client === c.name && s.date > c.lastSession),
    ).filter((c) => c.status === "Neaktívny");

    const podla = (fn: (c: ClientAgg) => string) => {
      const m: Record<string, number> = {};
      for (const c of aktivni) m[fn(c)] = (m[fn(c)] || 0) + 1;
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };

    out.push("## Klienti");
    out.push("");
    out.push(`- **Aktívnych:** ${aktivni.length} z ${zoznam.length} evidovaných`);
    out.push(`- **V 6M procese:** ${sixM.length}`);
    out.push(`- **Pribudli v období:** ${novi.length}${novi.length && f.detail ? ` — ${novi.map((c) => c.name).join(", ")}` : ""}`);
    out.push(`- **Prestali chodiť:** ${stratili.length}${stratili.length && f.detail ? ` — ${stratili.map((c) => c.name).join(", ")}` : ""}`);
    out.push("");
    out.push(`**Podľa segmentu:** ${podla((c) => c.segment).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    out.push("");
    out.push(`**Podľa balíčka:** ${podla((c) => c.membership || "Bez balíčka").map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    out.push("");
    if (f.detail) {
      const rows = aktivni
        .slice()
        .sort((a, b) => (b.lastSession || "").localeCompare(a.lastSession || ""))
        .map((c) => [
          c.name, c.segment, c.membership || "—", c.primaryTrainer || "—",
          c.packageTotal ? `${c.packageRemaining}/${c.packageTotal}` : "—",
          c.lastSession || "—",
        ]);
      out.push(tabulka(["Klient", "Segment", "Balíček", "Tréner", "Zostatok", "Naposledy"], rows));
      out.push("");
    }
  }

  // ── Tréningy a kapacita ────────────────────────────────────────────────────
  if (chce("treningy")) {
    const hodiny = sedenia.reduce((a, s) => a + s.duration / 60, 0);
    const podlaTrenera: Record<string, number> = {};
    for (const s of sedenia) podlaTrenera[s.sessionTrainer] = (podlaTrenera[s.sessionTrainer] || 0) + s.duration / 60;
    const typy: Record<string, number> = {};
    for (const s of sedenia) typy[s.sessionType] = (typy[s.sessionType] || 0) + 1;

    out.push("## Tréningy a kapacita");
    out.push("");
    out.push(`- **Odtrénované hodiny:** ${r0(hodiny)} h · ${r1(hodiny / pocetMesiacov)} h / mesiac`);
    out.push(`- **Podľa trénera:** ${Object.entries(podlaTrenera).map(([k, v]) => `${k} ${r0(v)} h`).join(" · ") || "—"}`);
    out.push(`- **Typy sedení:** ${Object.entries(typy).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}`);
    out.push("");
    const cap = capacity.filter((c) => !trenerFilter || c.trainer === f.trener);
    if (cap.length) {
      out.push(tabulka(
        ["Tréner", "Typický týždeň", "Rušný týždeň", "Vyťaženie", "Zvládne ešte"],
        cap.map((c) => [c.trainer, `${r0(c.recentWeekly)} h`, `${r0(c.busyWeekly)} h`, `${r0(c.util)} %`, `${c.canTake} klientov`]),
      ));
      out.push("");
      out.push("> Vyťaženie je „dvojitý strop“: rastie, kým typický týždeň nedosiahne ideál alebo rušný týždeň nenarazí na hornú hranicu zdravej zóny — čo príde skôr. Počíta sa z posledných týždňov, nie z celého obdobia reportu.");
      out.push("");
    }
  }

  // ── Marketing ──────────────────────────────────────────────────────────────
  if (chce("marketing")) {
    const mkt = MKT_MESACNE.filter((m) => vRozsahu(m.m, f));
    const sum = (k: keyof (typeof MKT_MESACNE)[number]) => mkt.reduce((a, m) => a + (m[k] as number), 0);
    out.push("## Marketing");
    out.push("");
    if (!mkt.length) {
      out.push("*Za toto obdobie nemám marketingové dáta — posledný Metricool export končí skôr.*");
      out.push("");
    } else {
      out.push(`- **Obsah:** ${sum("posty")} postov · ${sum("reels")} reels · ${sum("stories")} stories`);
      out.push(`- **Videnia:** ${sum("views").toLocaleString("cs-CZ")} · dosah ${sum("dosah").toLocaleString("cs-CZ")}`);
      out.push(`- **Uloženia:** ${sum("ulozenia")} · zdieľania ${sum("zdielania")}`);
      out.push(`- **Reklama:** ${kc(sum("spend"))}`);
      out.push("");
      if (f.detail) {
        out.push(tabulka(
          ["Mesiac", "Posty", "Reels", "Stories", "Videnia", "Dosah", "Reklama"],
          mkt.map((m) => [monthLabel(m.m), m.posty, m.reels, m.stories, m.views.toLocaleString("cs-CZ"), m.dosah.toLocaleString("cs-CZ"), kc(m.spend)]),
        ));
        out.push("");
        const top = MKT_TOP.filter((t) => vRozsahu(t.m, f)).sort((a, b) => b.views - a.views).slice(0, 5);
        if (top.length) {
          out.push("**Čo najviac zabralo:**");
          out.push("");
          for (const t of top) out.push(`- *${monthLabel(t.m)}, ${t.typ}* (${t.views} videní, ${t.ulozenia} uložení): „${t.hook.trim()}“`);
          out.push("");
        }
      }
      // Mesiace s chybou merania sa nesčítavajú — nula návštev by sa čítala ako
      // „nikto neprišiel", pritom sa len nemeralo.
      const ga4vsetky = GA4_MESACNE.filter((m) => vRozsahu(m.m, f));
      const ga4 = ga4vsetky.filter((m) => !m.chyba);
      if (ga4.length) {
        const diera = ga4vsetky.length - ga4.length;
        out.push(
          `- **Web (GA4):** ${ga4.reduce((a, m) => a + m.novi, 0).toLocaleString("cs-CZ")} nových návštevníkov · ` +
          `organické vyhľadávanie ${ga4.reduce((a, m) => a + m.organicSearch, 0).toLocaleString("cs-CZ")}` +
          (diera ? ` *(${diera} mesiacov bez merania sa nepočíta)*` : ""),
        );
      }
      const gsc = GSC_MESACNE.filter((m) => vRozsahu(m.m, f));
      if (gsc.length) {
        out.push(`- **Vyhľadávanie (GSC):** ${gsc.reduce((a, m) => a + m.kliky, 0)} klikov z ${gsc.reduce((a, m) => a + m.zobrazenia, 0).toLocaleString("cs-CZ")} zobrazení`);
        if (f.detail) {
          const d = GSC_DOPYTY.slice(0, 8);
          out.push("");
          out.push(tabulka(["Dopyt", "Kliky", "Zobrazenia", "Pozícia"], d.map((x) => [x.dopyt, x.kliky, x.zobrazenia, x.pozicia])));
        }
      }
      out.push("");
      out.push("> Instagram ani web nevedia, kto sa stal klientom. Sú to vstupy — jediný poctivý most k peniazom je dopyt a pole „odkiaľ prišiel“.");
      out.push("");
    }
  }

  // ── Dopyty a zdroje ────────────────────────────────────────────────────────
  if (chce("dopyty")) {
    const dopyty = data.leads.filter((l) => vRozsahu(monthKey(l.date), f));
    const podlaZdroja: Record<string, number> = {};
    for (const l of dopyty) podlaZdroja[l.source] = (podlaZdroja[l.source] || 0) + 1;
    const dohodnute = dopyty.filter((l) => l.status === "dohodnuty").length;

    const zdrojKlientov: Record<string, number> = {};
    for (const c of Object.values(clients)) {
      if (!vRozsahu(monthKey(c.firstSession), f)) continue;
      zdrojKlientov[c.zdroj || "nevyplnené"] = (zdrojKlientov[c.zdroj || "nevyplnené"] || 0) + 1;
    }

    out.push("## Dopyty a zdroje");
    out.push("");
    out.push(`- **Dopytov v období:** ${dopyty.length}${dopyty.length ? ` · dohodnutých ${dohodnute} (${r0((dohodnute / dopyty.length) * 100)} %)` : ""}`);
    if (dopyty.length) out.push(`- **Odkiaľ dopyty:** ${Object.entries(podlaZdroja).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    const zk = Object.entries(zdrojKlientov).sort((a, b) => b[1] - a[1]);
    if (zk.length) out.push(`- **Odkiaľ prišli klienti, ktorí v období začali:** ${zk.map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    out.push("");
    if (f.detail && dopyty.length) {
      out.push(tabulka(
        ["Dátum", "Meno", "Zdroj", "Stav", "Poznámka"],
        dopyty.map((l) => [l.date, l.name, l.source + (l.referrer ? ` (${l.referrer})` : ""), l.status, (l.note || "").replace(/\|/g, "/").slice(0, 80)]),
      ));
      out.push("");
    }
  }

  // ── Signály ────────────────────────────────────────────────────────────────
  if (chce("signaly")) {
    const otvorene = register.filter((r) => !r.acked);
    out.push("## Na čo sa pozrieť");
    out.push("");
    if (!otvorene.length) {
      out.push("*Nič otvorené — všetky signály sú vybavené.*");
    } else {
      for (const r of otvorene) {
        const z = r.tone === "red" ? "vysoká" : r.tone === "orange" ? "stredná" : "nízka";
        out.push(`- **${r.title}** (${r.category}, závažnosť ${z}) — ${r.detail}`);
      }
    }
    out.push("");
    out.push("> Signály sú stav ku dňu vygenerovania, nie za obdobie reportu.");
    out.push("");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
