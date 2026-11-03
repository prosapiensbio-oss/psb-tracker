/**
 * Kokpit a Strižňa si hovoria, čo vedia (Jerry, 3. 11. 2026): Strižňa vidí
 * štatistiky a dopyty, Kokpit vidí, čo sa publikuje, aby dozor reklám radil
 * podľa skutočného obsahu. Čisté skladanie; dopyty do D1 a API sú na serveri.
 */
export type NaplanovanyPost = { datum: string; siete: string[]; typ: string; text: string; koncept: boolean; odkaz: string };
export type VysielanyPost = { datum: string; druh: string; hook: string; dosah: number; ulozenia: number; zdielania: number; url: string };
export type PlanObsahuMc = { nacitane: string; naplanovane: NaplanovanyPost[]; vyslo: VysielanyPost[] };

export const KLUC_PLANU_MC = "metricool_plan";

/** Odpoveď `GET /v2/scheduler/posts` → to, čo chystáme. Už publikované sa berie z meraní. */
export function naplanovaneZApi(riadky: Record<string, unknown>[], teraz: string): NaplanovanyPost[] {
  const out: NaplanovanyPost[] = [];
  for (const r of riadky) {
    const datum = String((r.publicationDate as { dateTime?: string } | undefined)?.dateTime ?? "");
    if (!datum || datum < teraz) continue;
    const providers = Array.isArray(r.providers) ? (r.providers as { network?: string; status?: string; publicUrl?: string }[]) : [];
    if (providers.length && providers.every((p) => p.status === "PUBLISHED")) continue;
    const ig = (r.instagramData as { type?: string } | undefined)?.type;
    out.push({
      datum: datum.slice(0, 16),
      siete: providers.map((p) => String(p.network ?? "")).filter(Boolean),
      typ: String(ig ?? "").toLowerCase(),
      text: String(r.text ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
      koncept: !!r.draft,
      odkaz: String(providers.find((p) => p.publicUrl)?.publicUrl ?? ""),
    });
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum)).slice(0, 40);
}

/**
 * Čerstvé príspevky od tých, čo ľudia najviac ukladajú a zdieľajú. To je signál,
 * že obsah má hodnotu; pozretia hovoria o háku a dajú sa kúpiť reklamou.
 */
export const podlaHodnoty = (a: VysielanyPost, b: VysielanyPost) =>
  (b.ulozenia + b.zdielania) - (a.ulozenia + a.zdielania) || b.dosah - a.dosah;
