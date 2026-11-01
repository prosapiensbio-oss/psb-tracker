import { mock } from "bun:test";

/**
 * Podstrčené väzby Cloudflaru pre testy skutočného `auth.server`.
 *
 * Bun drží moduly aj `mock.module` naprieč súbormi: `bindings.server` ostane
 * naviazaný na prvý `env` a `anamnezaOdoslanie.test.ts` si ho podstrčí po svojom
 * pre všetky súbory po ňom. Preto jeden objekt a volanie na začiatku každého súboru.
 */
export const env: Record<string, unknown> = {};

export function podstrcEnv(): void {
  mock.module("cloudflare:workers", () => ({ env }));
  mock.module("../bindings.server", () => ({ bindings: () => env }));
}
