/**
 * VÝSLEDOK BEHU AUTOMATU — z odpovede endpointu (rozbor 09, 1. 11. 2026).
 *
 * Plánovač sa pozeral len na HTTP status, lenže väčšina endpointov chybu vracia
 * ako 200: kalendár po troch 429 od Googlu `{ok:true, vysledky:{Jerry:{ok:false,
 * chyba:"HTTP 429"}}}`, schránka `{ok:false, error}`, ranná dávka `vysledky`
 * s neúspešnými telefónmi. Do `automaty` sa tak zapisovalo ok=1 a karta Zdravie
 * Kokpitu hlásila „beží" nad behom, ktorý nič neurobil — za týždeň 236 z 236.
 *
 * Bez závislostí: berie si to aj worker `cron/`, testuje sa tu.
 *
 * Falošný poplach to nerobí, lebo karta posudzuje POSLEDNÝ ÚSPECH, nie
 * poslednú chybu (`stavAutomatu`, hranica 48 h). 429 s hodinovým dobehom je
 * tak jeden červený riadok, ktorý ďalší beh prepíše; porucha je až dva dni
 * bez úspechu.
 */
export type VysledokBehu = {
  ok: boolean;
  chyba?: string;
  /**
   * Automat sa zámerne nespustil (mimo okna, tichý čas). Nie je to úspech ani
   * zlyhanie: ako úspech by prepísal chybu z ostrého behu — schránka sa číta
   * raz denne a „preskočené" zvyšných sedem behov by ju skrylo do troch hodín.
   */
  preskocene?: boolean;
};

const textChyby = (x: Record<string, unknown>): string => {
  for (const pole of ["chyba", "error", "dovod"]) {
    const v = x[pole];
    if (typeof v === "string" && v) return v;
  }
  return "";
};

const jeObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object";

export function vyhodnotBeh(status: number, telo: string): VysledokBehu {
  if (status < 200 || status >= 300) return { ok: false, chyba: `HTTP ${status}: ${telo.slice(0, 200)}` };

  let j: unknown;
  try {
    j = JSON.parse(telo);
  } catch {
    // Všetky volané endpointy odpovedajú JSONom. 200 s HTML znamená, že
    // odpovedala SSR stránka namiesto trasy, a to je porucha, nie úspech.
    return { ok: false, chyba: `odpoveď nie je JSON: ${telo.slice(0, 200)}` };
  }
  if (!jeObjekt(j)) return { ok: true };

  if (j.ok === false) return { ok: false, chyba: textChyby(j) || telo.slice(0, 200) };
  if (j.ok !== true && typeof j.error === "string" && j.error) return { ok: false, chyba: j.error };

  // `vysledky` je objekt podľa mena (kalendár) alebo pole riadkov (ranná dávka).
  if (jeObjekt(j.vysledky)) {
    const riadky = Object.entries(j.vysledky).filter(([, v]) => jeObjekt(v) && v.ok === false) as [string, Record<string, unknown>][];
    if (riadky.length) {
      const veta = riadky.map(([k, v]) => {
        const kto = typeof v.kto === "string" ? v.kto : k;
        const preco = textChyby(v) || (typeof v.status === "number" ? `HTTP ${v.status}` : "zlyhalo");
        return `${kto}: ${preco}`;
      }).join(" · ");
      return { ok: false, chyba: veta };
    }
  }
  if (typeof j.preskocene === "string" && j.preskocene) return { ok: true, preskocene: true };
  return { ok: true };
}
