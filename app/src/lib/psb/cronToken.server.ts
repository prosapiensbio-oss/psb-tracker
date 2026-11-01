/**
 * TOKEN PLÁNOVAČA — porovnanie v konštantnom čase.
 *
 * Do 1. 11. 2026 stálo v trinástich endpointoch `token === dany`. Reťazcové
 * porovnanie končí pri prvom rozdielnom znaku, takže odpoveď prezrádza, koľko
 * znakov sedelo. `timingSafeEqual` v `auth.server` to rieši, ale nie je
 * exportovaný a stiahol by za sebou celú reláciu.
 *
 * ZÁMERNE BEZ IMPORTOV: súbor si berie aj worker `cron/`, ktorý má vlastný
 * zväzok a o `bindings` appky nesmie vedieť.
 */
export function rovnakyToken(a: string, b: string): boolean {
  // Dĺžka sa započíta do výsledku, nie ako skorý návrat — slučka beží vždy
  // cez dlhší z reťazcov, čas teda nezávisí od toho, kde sa líšia.
  let rozdiel = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) rozdiel |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return rozdiel === 0;
}

/** Preukázala sa požiadavka tokenom plánovača? Bez nastaveného tokenu nikdy. */
export function jeOdPlanovaca(request: Request, token: string | undefined): boolean {
  return !!token && rovnakyToken(token, request.headers.get("x-cron-token") || "");
}
