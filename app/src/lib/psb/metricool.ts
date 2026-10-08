/**
 * METRICOOL BEZ EXPORTOV (Jerry, 8. 10. 2026: „prerob mesačnú uzávierku tak,
 * že v nej len ťuknem a stiahne sa to samé").
 *
 * API Metricoolu je len v pláne Advanced. MCP server (ai.metricool.com/mcp)
 * je na KAŽDOM pláne a prihlasuje sa štandardným OAuth s dynamickou
 * registráciou klienta — Kokpit sa preto pripojí rovnako ako Claude: raz
 * „Pripojiť" (Jerry povolí v Metricoole), potom už len obnovuje token.
 *
 * Tu sú len čisté časti (mapovanie riadkov, rozbor odpovede MCP); siete
 * a tokeny sú v `metricool.server.ts`.
 *
 * Zapisuje sa TO ISTÉ, čo import CSV exportu (`parseMetricool` → tabuľka
 * `mkt_prispevky`) a PDF zostavy (`kanaly_mesiace`). ID príspevku a reelsu
 * sú v MCP rovnaké ako v exporte (`<media>_<účet>`), story má ako ID adresu
 * — overené 8. 10. 2026, takže sa nič nezdvojí.
 */

export const MCP_URL = "https://ai.metricool.com/mcp";
/** ProSapiens Biomechanic v Metricoole. */
export const BRAND_PSB = "2101108";

export type PrispevokMc = {
  id: string; druh: "post" | "reel" | "story"; datum: string; mesiac: string; url: string; hook: string;
  views: number; dosah: number; ulozenia: number; zdielania: number; komentare: number; lajky: number;
  spend: number; viewRate: number; watchTime: number;
};

// Poradie polí v dopyte = poradie stĺpcov v odpovedi.
export const POLIA_REELS = ["IGRE04", "IGRE02", "IGRE06", "IGRE03", "IGRE23", "IGRE11", "IGRE12", "IGRE21", "IGRE07", "IGRE10", "IGRE20", "IGRE28", "IGRE24"];
export const POLIA_POSTS = ["IGPO04", "IGPO02", "IGPO06", "IGPO03", "IGPO28", "IGPO14", "IGPO15", "IGPO27", "IGPO08", "IGPO13", "IGPO26"];
export const POLIA_STORIES = ["IGST06", "IGST02", "IGST03", "IGST09", "IGST10"];
/** Vývoj účtu po dňoch: sledovatelia, získaní, stratení, zobrazenia, dosah (+ deň na konci). */
export const POLIA_VYVOJ = ["IGEV01", "IGEV43", "IGEV44", "IGEV05", "IGEV06"];

const cislo = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const text = (x: unknown) => (x == null ? "" : String(x));
/** „20260828205644" → „2026-08-28". */
export const denZCasu = (t: unknown) => { const s = text(t); return /^\d{8}/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ""; };
const hook = (x: unknown) => text(x).replace(/\s+/g, " ").trim().slice(0, 300);

export function riadkyNaPrispevky(druh: PrispevokMc["druh"], rows: unknown[][]): PrispevokMc[] {
  const out: PrispevokMc[] = [];
  for (const r of rows) {
    const datum = denZCasu(r[1]);
    const id = text(r[0]);
    if (!id || !datum) continue;
    const zaklad = { id, druh, datum, mesiac: datum.slice(0, 7), url: text(r[2]) || (druh === "story" ? id : ""), hook: hook(r[3]) };
    if (druh === "reel") {
      out.push({ ...zaklad, views: cislo(r[4]), dosah: cislo(r[5]), ulozenia: cislo(r[6]), zdielania: cislo(r[7]), komentare: cislo(r[8]), lajky: cislo(r[9]),
        // Export nesie spend, pomer zhliadnutí v % a priemerný čas v ms — MCP čas v sekundách.
        spend: cislo(r[10]), viewRate: Math.round(cislo(r[11]) * 10) / 10, watchTime: Math.round(cislo(r[12]) * 1000) });
    } else if (druh === "post") {
      out.push({ ...zaklad, views: cislo(r[4]), dosah: cislo(r[5]), ulozenia: cislo(r[6]), zdielania: cislo(r[7]), komentare: cislo(r[8]), lajky: cislo(r[9]),
        spend: cislo(r[10]), viewRate: 0, watchTime: 0 });
    } else {
      out.push({ ...zaklad, url: id, hook: hook(r[2]), views: cislo(r[3]), dosah: cislo(r[4]), ulozenia: 0, zdielania: 0, komentare: 0, lajky: 0, spend: 0, viewRate: 0, watchTime: 0 });
    }
  }
  return out;
}

/**
 * Mesačné čísla Instagramu do `kanaly_mesiace` — tie isté názvy metrík, aké
 * zapisuje PDF zostava (Kanaly.tsx ich číta presne týmito reťazcami).
 * Riadok vývoja: [sledovatelia, získaní, stratení, zobrazenia, dosah, deň].
 */
export function mesacneInstagram(vyvoj: unknown[][], prispevky: PrispevokMc[], mesiac: string): { metrika: string; hodnota: number }[] {
  const dni = vyvoj
    .map((r) => ({ den: text(r[r.length - 1]), sled: r[0] == null ? null : cislo(r[0]), plus: cislo(r[1]), minus: cislo(r[2]), views: cislo(r[3]), dosah: cislo(r[4]) }))
    .filter((d) => /^\d{8}$/.test(d.den) && `${d.den.slice(0, 4)}-${d.den.slice(4, 6)}` === mesiac)
    .sort((a, b) => a.den.localeCompare(b.den));
  const v = prispevky.filter((p) => p.mesiac === mesiac);
  const druh = (d: PrispevokMc["druh"]) => v.filter((p) => p.druh === d);
  const priemer = (xs: PrispevokMc[]) => (xs.length ? Math.round((xs.reduce((a, p) => a + p.dosah, 0) / xs.length) * 100) / 100 : 0);
  const posledni = [...dni].reverse().find((d) => d.sled != null);
  const out: { metrika: string; hodnota: number }[] = [];
  if (posledni) out.push({ metrika: "Followers", hodnota: posledni.sled as number });
  if (dni.length) {
    out.push({ metrika: "Followers balance", hodnota: dni.reduce((a, d) => a + d.plus - d.minus, 0) });
    out.push({ metrika: "Views", hodnota: dni.reduce((a, d) => a + d.views, 0) });
    out.push({ metrika: "Reach", hodnota: dni.reduce((a, d) => a + d.dosah, 0) });
  }
  out.push(
    { metrika: "Posts", hodnota: druh("post").length },
    { metrika: "Reels", hodnota: druh("reel").length },
    { metrika: "Stories", hodnota: druh("story").length },
    { metrika: "Avg reach per post", hodnota: priemer(druh("post")) },
    { metrika: "Avg reach per reel", hodnota: priemer(druh("reel")) },
    { metrika: "Avg reach per story", hodnota: priemer(druh("story")) },
    { metrika: "Saved", hodnota: v.reduce((a, p) => a + p.ulozenia, 0) },
    { metrika: "Shares", hodnota: v.reduce((a, p) => a + p.zdielania, 0) },
  );
  return out;
}

/**
 * Odpoveď MCP môže prísť ako JSON aj ako prúd udalostí (SSE) — podľa toho,
 * ako sa serveru zachce. Vráti JSON-RPC správu s daným id.
 */
export function rozoberOdpovedMcp(telo: string, contentType: string, id: number): { result?: unknown; error?: { message?: string } } | null {
  const kandidati: string[] = [];
  if (/event-stream/i.test(contentType)) {
    for (const blok of telo.split(/\r?\n\r?\n/)) {
      const data = blok.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (data) kandidati.push(data);
    }
  } else kandidati.push(telo);
  for (const k of kandidati) {
    try {
      const j = JSON.parse(k) as { id?: number } | { id?: number }[];
      const zoznam = Array.isArray(j) ? j : [j];
      const m = zoznam.find((x) => x && x.id === id);
      if (m) return m as { result?: unknown; error?: { message?: string } };
    } catch { /* ďalší blok */ }
  }
  return null;
}

/** Výsledok nástroja → riadky. Nástroj vracia text s JSON `{rows:[…]}`, alebo chybu ako text. */
export function riadkyZVysledku(result: unknown): { rows: unknown[][] } | { chyba: string } {
  const r = result as { content?: { type?: string; text?: string }[]; isError?: boolean; structuredContent?: { rows?: unknown[][] } };
  if (r?.structuredContent?.rows) return { rows: r.structuredContent.rows };
  const t = (r?.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("\n");
  if (r?.isError) return { chyba: t.slice(0, 300) || "Metricool vrátil chybu." };
  try {
    const j = JSON.parse(t) as { rows?: unknown[][] };
    return { rows: Array.isArray(j.rows) ? j.rows : [] };
  } catch {
    return { chyba: t.slice(0, 300) || "Odpoveď Metricoolu sa nedala prečítať." };
  }
}

/** Mesiac → rozsah pre Metricool v pražskom čase (ISO s posunom). */
export function rozsahMesiaca(mesiac: string): { from: string; to: string } {
  const [r, m] = mesiac.split("-").map(Number);
  const posledny = new Date(Date.UTC(r, m, 0)).getUTCDate();
  // Posun pásma stačí približne — Metricool reže po dňoch.
  const posun = (mm: number) => (mm >= 4 && mm <= 10 ? "+02:00" : "+01:00");
  return { from: `${mesiac}-01T00:00:00${posun(m)}`, to: `${mesiac}-${String(posledny).padStart(2, "0")}T23:59:59${posun(m)}` };
}
