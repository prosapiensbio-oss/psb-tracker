import { bindings } from "../bindings.server";
import type { PohybFio } from "./strazcaVyberu";

/**
 * JERRYHO VÝPLATY V BITCOINE pre strážcu výberov (Jerry, 28. 10. 2026:
 * „doplň do strážcu aj BTC výplaty“).
 *
 * Bitcoinová kniha posiela ako výplatu výbery s „vyplat“ v poznámke aj presun
 * Muun → Blink (viď `/api/reserve` v appke btc). Na server sa ide VÄZBOU
 * `BTC` — prehliadač si tú istú knihu ťahá cez podpísanú adresu, server ju
 * podpíše sám. Vracia riadky v tvare pohybov z Fio (`vyplaty.jerry`, záporná
 * suma), aby ich strážca sčítal rovnako ako bankové výplaty. `null` = kniha
 * neodpovedala; strážca to povie v súhrne a beží len nad bankou.
 */
export async function btcVyplatyJerryho(): Promise<PohybFio[] | null> {
  try {
    const env = bindings();
    const token = env.BTC_RESERVE_TOKEN;
    if (!token) return null;
    const exp = Date.now() + 60_000;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`exp=${exp}`)))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const url = `https://btc.prosapiensbio.workers.dev/api/reserve?exp=${exp}&sig=${sig}&vyplaty=1`;
    const r = env.BTC ? await env.BTC.fetch(new Request(url)) : await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as { vyplaty?: { datum: string; czk: number | null; poznamka?: string; kto?: string }[] };
    return (j.vyplaty || [])
      // Jerryho: s menom v poznámke alebo FP Spain (jeho osobný výdaj, v Kokpite riadok FP.Spain).
      .filter((v) => v.kto === "jerry" || /fp\s*spain/i.test(v.poznamka || ""))
      .filter((v) => typeof v.czk === "number" && v.czk > 0)
      .map((v) => ({ date: String(v.datum).slice(0, 10), suma: -(v.czk as number), kat: "vyplaty.jerry" }));
  } catch {
    return null;
  }
}
