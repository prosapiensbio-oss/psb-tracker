/**
 * Odpoveď API bez `cache-control` si prehliadač smie nechať podľa vlastnej
 * heuristiky — tak sa v Kokpite opakovane objavovali staré dáta. A pri `/api/*`
 * nejde len o čerstvosť: odpovede nesú osobné údaje a na zdieľanom počítači
 * nemajú ostať v keši. Trieda, čo si kešovanie nastavila sama (náhľady z editora),
 * ostáva bez zmeny.
 */
export function bezKesovaniaApi(request: Request, response: Response): Response {
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  if (!new URL(request.url).pathname.startsWith("/api/")) return response;
  if (response.headers.has("cache-control") || response.status === 101) return response;
  const h = new Headers(response.headers);
  h.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}
