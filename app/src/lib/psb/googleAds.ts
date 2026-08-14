/**
 * Google Ads — dopyty do API a čítanie odpovedí.
 *
 * PREČO JE TOTO ODDELENÉ OD `google.ts`
 *
 * GA4 aj Search Console sú jednoduché: pošli JSON, dostaň riadky. Google Ads
 * je iný svet — vlastný dopytovací jazyk (GAQL), peniaze v mikrách, celé čísla
 * ako reťazce a odpoveď zabalená do polí. Tie zvláštnosti nemajú čo robiť
 * v súbore o Analytics.
 *
 * ČO SA TU MERIA A ČO NIE
 *
 * Explorer úroveň tokenu pustí výkon vlastných kampaní, ale NEPUSTÍ plánovač
 * kľúčových slov (`KeywordPlanIdeaService`). Preto je tu zatiaľ len čítanie
 * výkonu. Objem hľadania pribudne, keď Google udelí Basic — a nebude to
 * prestavba, len ďalší dopyt.
 *
 * NAJCENNEJŠIA TABUĽKA NIE JE NÁKLAD
 *
 * Sú to `search_term_view` — skutočné vety, ktoré ľudia napísali do Googlu
 * predtým, než klikli. Odhad objemu hľadania hovorí, čo by sa dalo kúpiť;
 * tieto riadky hovoria, čo sa naozaj kúpilo a za koľko.
 */

/** Google Ads má vlastný rozsah, oddelený od Analytics a Search Console. */
export const SCOPE_ADS = "https://www.googleapis.com/auth/adwords";

/**
 * Verzia API. Podporované sú v21–v25; v25 vyšla 22. 7. 2026.
 *
 * Držíme v24: vyšla v apríli 2026, minor updaty dostávala do júna a nemá
 * zlomové zmeny, ktoré prináša každá major verzia. Keď Google v24 vypne,
 * zmení sa tu jeden reťazec — preto je to konstanta a nie vlepené v URL.
 */
export const ADS_VERZIA = "v24";

export const adsUrl = (cesta: string) => `https://googleads.googleapis.com/${ADS_VERZIA}/${cesta}`;

export type AdsKampan = {
  campaignId: string; nazov: string; typ: string; stav: string; mesiac: string;
  naklad: number; kliky: number; zobrazenia: number; konverzie: number;
};

export type AdsMesiac = {
  mesiac: string; naklad: number; kliky: number; zobrazenia: number; konverzie: number;
};

export type AdsDopyt = {
  mesiac: string; dopyt: string; kliky: number; zobrazenia: number; naklad: number; konverzie: number;
};

export type AdsUcet = { id: string; nazov: string; valuta: string; jeManager: boolean };

/**
 * ID účtu → desať číslic.
 *
 * Google ho v rozhraní píše s pomlčkami (410-571-5629), v API ho chce bez
 * nich. Prepisovanie z hlavy je zdroj chýb, tak nech to znesie oba tvary.
 * Čokoľvek, čo nemá presne desať číslic, je preklep a vracia sa prázdno —
 * uhádnuté ID by sa ťahalo do každého ďalšieho dopytu.
 */
export function normCustomer(s: string): string {
  const c = String(s || "").replace(/\D/g, "");
  return c.length === 10 ? c : "";
}

/** Celé čísla prichádzajú ako reťazce (int64 v JSON-e). */
export function cislo(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mikrá → mena účtu.
 *
 * Google drží peniaze v milióntinách, aby sa vyhnul desatinným miestam.
 * Zabudnuté delenie je chyba, ktorá vyzerá ako reálne číslo — 1 080 Kč by
 * sa hlásilo ako 1 080 000 000 a nikto by si nevšimol, že je to nezmysel,
 * lebo to má správny počet číslic na to, aby to bola suma.
 */
export function mikroNaKc(v: unknown): number {
  return Math.round((cislo(v) / 1_000_000) * 100) / 100;
}

/** `segments.month` prichádza ako 'YYYY-MM-01'; nás zaujíma mesiac. */
export function mesiacZo(s: unknown): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(s ?? ""));
  return m ? `${m[1]}-${m[2]}` : "";
}

// ── GAQL ──────────────────────────────────────────────────────────────────
//
// Dopyty sú tu ako funkcie a nie ako reťazce v route, aby sa dali otestovať.
// Preklep v GAQL vráti prázdno s HTTP 200 — a prázdna odpoveď nie je dôkaz,
// že sa nič nedeje.

/** Výkon kampaní po mesiacoch. Mesiace sa z toho derivujú, nedopytujú zvlášť. */
export function gaqlKampane(od: string): string {
  return [
    "SELECT campaign.id, campaign.name, campaign.advertising_channel_type,",
    "campaign.status, segments.month, metrics.impressions, metrics.clicks,",
    "metrics.cost_micros, metrics.conversions",
    "FROM campaign",
    `WHERE segments.date >= '${od}'`,
  ].join(" ");
}

/**
 * Skutočné dopyty, na ktoré reklama vyskočila.
 *
 * Prázdny výsledok tu neznamená, že ľudia nič nehľadali: `search_term_view`
 * existuje len pre kampane vo vyhľadávaní. Display alebo Smart kampaň nevráti
 * ani riadok, hoci minula tie isté peniaze.
 */
export function gaqlDopyty(od: string): string {
  return [
    "SELECT search_term_view.search_term, segments.month, metrics.impressions,",
    "metrics.clicks, metrics.cost_micros, metrics.conversions",
    "FROM search_term_view",
    `WHERE segments.date >= '${od}'`,
  ].join(" ");
}

/** Účty pod manažérskym účtom — vrátane mien a meny, aby sa nehádalo. */
export function gaqlUcty(): string {
  return [
    "SELECT customer_client.id, customer_client.descriptive_name,",
    "customer_client.currency_code, customer_client.manager,",
    "customer_client.status",
    "FROM customer_client",
    "WHERE customer_client.status = 'ENABLED'",
  ].join(" ");
}

// ── čítanie odpovedí ──────────────────────────────────────────────────────

/**
 * `searchStream` vracia POLE dávok, nie objekt s `results`.
 *
 * Toto je tichá pasca: kód napísaný podľa bežného endpointu prečíta
 * `data.results`, nájde `undefined` a ohlási „žiadne dáta" pri odpovedi,
 * ktorá je plná riadkov.
 */
export function adsRiadky(data: unknown): Record<string, unknown>[] {
  const davky = Array.isArray(data) ? data : [data];
  const von: Record<string, unknown>[] = [];
  for (const d of davky) {
    const r = (d as { results?: unknown })?.results;
    if (Array.isArray(r)) von.push(...(r as Record<string, unknown>[]));
  }
  return von;
}

const pod = (r: Record<string, unknown>, k: string): Record<string, unknown> =>
  (r[k] || {}) as Record<string, unknown>;

export function adsKampane(riadky: Record<string, unknown>[]): AdsKampan[] {
  const von: AdsKampan[] = [];
  for (const r of riadky) {
    const c = pod(r, "campaign");
    const s = pod(r, "segments");
    const m = pod(r, "metrics");
    const mesiac = mesiacZo(s.month);
    const campaignId = String(c.id ?? "");
    if (!mesiac || !campaignId) continue;
    von.push({
      campaignId,
      nazov: String(c.name ?? ""),
      typ: String(c.advertisingChannelType ?? ""),
      stav: String(c.status ?? ""),
      mesiac,
      naklad: mikroNaKc(m.costMicros),
      kliky: cislo(m.clicks),
      zobrazenia: cislo(m.impressions),
      konverzie: cislo(m.conversions),
    });
  }
  return von;
}

export function adsDopyty(riadky: Record<string, unknown>[]): AdsDopyt[] {
  const von = new Map<string, AdsDopyt>();
  for (const r of riadky) {
    const v = pod(r, "searchTermView");
    const s = pod(r, "segments");
    const m = pod(r, "metrics");
    const mesiac = mesiacZo(s.month);
    const dopyt = String(v.searchTerm ?? "").trim().toLowerCase();
    if (!mesiac || !dopyt) continue;
    const k = `${mesiac}|${dopyt}`;
    const p = von.get(k);
    // Ten istý dopyt môže prísť viackrát — raz za každú reklamnú skupinu.
    // Bez zlúčenia by sa v tabuľke tvárila jedna veta ako niekoľko rôznych.
    von.set(k, {
      mesiac, dopyt,
      kliky: (p?.kliky ?? 0) + cislo(m.clicks),
      zobrazenia: (p?.zobrazenia ?? 0) + cislo(m.impressions),
      naklad: Math.round(((p?.naklad ?? 0) + mikroNaKc(m.costMicros)) * 100) / 100,
      konverzie: (p?.konverzie ?? 0) + cislo(m.conversions),
    });
  }
  return [...von.values()].sort((a, b) => b.zobrazenia - a.zobrazenia);
}

export function adsUcty(riadky: Record<string, unknown>[]): AdsUcet[] {
  const von: AdsUcet[] = [];
  for (const r of riadky) {
    const c = pod(r, "customerClient");
    const id = normCustomer(String(c.id ?? ""));
    if (!id) continue;
    von.push({
      id,
      nazov: String(c.descriptiveName ?? ""),
      valuta: String(c.currencyCode ?? ""),
      jeManager: c.manager === true || String(c.manager) === "true",
    });
  }
  return von;
}

/**
 * Mesiace sa počítajú z kampaní, nie samostatným dopytom.
 *
 * Druhý dopyt na to isté číslo je druhá definícia — a keď sa raz rozídu,
 * obrazovka bude ukazovať iný náklad než rozpad po kampaniach a nikto
 * nezistí, ktorý platí.
 */
export function adsMesiace(kampane: AdsKampan[]): AdsMesiac[] {
  const von = new Map<string, AdsMesiac>();
  for (const k of kampane) {
    const p = von.get(k.mesiac) || { mesiac: k.mesiac, naklad: 0, kliky: 0, zobrazenia: 0, konverzie: 0 };
    von.set(k.mesiac, {
      mesiac: k.mesiac,
      naklad: Math.round((p.naklad + k.naklad) * 100) / 100,
      kliky: p.kliky + k.kliky,
      zobrazenia: p.zobrazenia + k.zobrazenia,
      konverzie: p.konverzie + k.konverzie,
    });
  }
  return [...von.values()].sort((a, b) => a.mesiac.localeCompare(b.mesiac));
}

/** Cena za klik za celé obdobie. Nula klikov nie je nula korún — je to „—". */
export function cenaZaKlik(mesiace: AdsMesiac[]): number | null {
  const naklad = mesiace.reduce((a, m) => a + m.naklad, 0);
  const kliky = mesiace.reduce((a, m) => a + m.kliky, 0);
  if (kliky <= 0) return null;
  return Math.round((naklad / kliky) * 100) / 100;
}

/**
 * Veta pod tabuľkou — počítaná, nie napísaná.
 *
 * PREČO SA NULA KONVERZIÍ HLÁSI NAHLAS
 *
 * Kampaň s tisíckou klikov a nulou konverzií skoro nikdy neznamená, že nikto
 * nekonvertoval. Znamená, že sa konverzie nemerali. Ticho by z toho urobilo
 * záver „Google nefunguje" — a to je presne ten druh omylu, ktorý nás pri
 * Mete stál devätnásť mesiacov.
 */
export function zhrnutieAds(mesiace: AdsMesiac[], valuta = ""): string {
  const aktivne = mesiace.filter((m) => m.naklad > 0 || m.kliky > 0);
  if (aktivne.length === 0) return "Za sledované obdobie sa v Google Ads nič neutratilo.";

  const naklad = Math.round(aktivne.reduce((a, m) => a + m.naklad, 0));
  const kliky = aktivne.reduce((a, m) => a + m.kliky, 0);
  const konverzie = aktivne.reduce((a, m) => a + m.konverzie, 0);
  const cpc = cenaZaKlik(aktivne);
  const mena = valuta === "CZK" ? "Kč" : valuta || "";

  const casti = [
    `${aktivne.length} ${aktivne.length === 1 ? "mesiac" : aktivne.length < 5 ? "mesiace" : "mesiacov"} s výdajom`,
    `${naklad} ${mena}`.trim(),
    `${kliky} klikov`,
  ];
  if (cpc !== null) casti.push(`${cpc} ${mena}`.trim() + " za klik");

  const zaklad = casti.join(" · ");
  return konverzie > 0
    ? `${zaklad} · ${Math.round(konverzie * 10) / 10} konverzií`
    : `${zaklad}. Konverzie: žiadne — to takmer isto znamená, že sa nemerali, nie že nikto nekonvertoval.`;
}
