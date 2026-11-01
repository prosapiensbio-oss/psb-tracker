/**
 * CHYBY MIMO KOREŇOVEJ HRANICE (rozbor Kokpitu, 1. 11. 2026).
 *
 * Koreňová hranica v `__root.tsx` zachytí len pád pri vykresľovaní. Chyba
 * v obsluhe kliknutia, v časovači či nezachytený promise ju obíde: tlačidlo len
 * „nič neurobí" a stopa ostane v konzole telefónu. Toto ju pošle tam, kam ide
 * pád z hranice (`/api/chyba-prehliadaca` → Zdravie Kokpitu).
 *
 * NESMIE TO ZAPLAVIŤ AUDIT: rovnaká správa raz, najviac 5 na načítanie stránky
 * a 20 za reláciu. Šum, s ktorým sa nedá nič robiť, sa neposiela vôbec.
 */
export const LIMIT_NA_STRANKU = 5;
export const LIMIT_NA_RELACIU = 20;

/** Sieť, keď telefón stratí signál, zrušené požiadavky, hlášky prehliadača bez obsahu, stará verzia. */
const SUM = /ResizeObserver loop|^Script error\.?$|AbortError|signal is aborted|Failed to fetch|Load failed|NetworkError|Network request failed|Importing a module script failed|dynamically imported module|Loading chunk|ChunkLoadError/i;

export const jeSum = (sprava: string): boolean => !sprava.trim() || SUM.test(sprava);

/** Rozhodnutie o jednej správe. `videne` a počty drží volajúci. */
export function maSaPoslat(sprava: string, videne: Set<string>, naStranke: number, vRelacii: number): boolean {
  if (jeSum(sprava) || videne.has(sprava)) return false;
  return naStranke < LIMIT_NA_STRANKU && vRelacii < LIMIT_NA_RELACIU;
}

const textChyby = (e: unknown): { sprava: string; stack: string } => {
  if (e instanceof Error) return { sprava: `${e.name === "Error" ? "" : `${e.name}: `}${e.message}`, stack: String(e.stack || "") };
  return { sprava: typeof e === "string" ? e : JSON.stringify(e) ?? String(e), stack: "" };
};

/** Zapne hlásenie a vráti funkciu na vypnutie. Samo nikdy nespadne. */
export function zapniHlasenieChyb(): () => void {
  const KLUC = "psb-chyby-relacia";
  const videne = new Set<string>();
  let naStranke = 0;
  const posli = (e: unknown, druh: string) => {
    try {
      const { sprava: holaSprava, stack } = textChyby(e);
      const sprava = holaSprava.slice(0, 450);
      let vRelacii = 0;
      try { vRelacii = Number(sessionStorage.getItem(KLUC)) || 0; } catch { /* bez úložiska stačí limit na stránku */ }
      if (!maSaPoslat(sprava, videne, naStranke, vRelacii)) return;
      videne.add(sprava);
      naStranke++;
      try { sessionStorage.setItem(KLUC, String(vRelacii + 1)); } catch { /* dtto */ }
      void fetch("/api/chyba-prehliadaca", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sprava: `[${druh}] ${sprava}`, stack: stack.slice(0, 1500), adresa: window.location.href.slice(0, 300), sirka: window.innerWidth, ua: navigator.userAgent.slice(0, 200) }),
      }).catch(() => {});
    } catch { /* stráž nesmie rozbiť to, čo stráži */ }
  };
  const naChybu = (u: ErrorEvent) => posli(u.error ?? u.message, "okno");
  const naPromise = (u: PromiseRejectionEvent) => posli(u.reason, "promise");
  window.addEventListener("error", naChybu);
  window.addEventListener("unhandledrejection", naPromise);
  return () => {
    window.removeEventListener("error", naChybu);
    window.removeEventListener("unhandledrejection", naPromise);
  };
}
