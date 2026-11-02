/**
 * ODPOVEDE KLIENTOV NA FOTKY → NOTIFIKÁCIE TRÉNEROVI (Jerry, 12. 10. 2026:
 * „ak odpovie, mohlo by sa to trénerovi, ku ktorému klient patrí, ukázať
 * v notifikáciách, aby mu tá odpoveď neušla").
 *
 * Dáta nalieva `loadData` (fotkyOdkazy.server.ts — rozšifruje text), sem ide
 * len čistý výpočet, aby obrazovka aj nočný push videli to isté.
 */
import { normName } from "./format";

export type FotkyOdpoved = { id: number; token: string; klient: string; kedy: string; trener: string | null; text: string };
export type FotkySuhlas = { token: string; klient: string; kedy: string; suhlas: "ano" | "ne"; trener: string | null };
export type FotkyNeodoslane = { token: string; klient: string; kedy: string; trener: string | null };
export type FotkyKlientov = { odpovede: FotkyOdpoved[]; suhlasy: FotkySuhlas[]; neodoslane?: FotkyNeodoslane[] };

/**
 * ODIŠLA K ODKAZU SMS? (Jerry, 2. 11. 2026 pri Lukasovi Hanusovi.) Odkaz vzniká
 * skôr než SMS a odoslanie zapisuje len audit (`sms-fotky`, predmet „klient · číslo").
 * Vráti čas prvej SMS tomuto klientovi od vzniku odkazu, inak `null`.
 */
export function smsKOdkazu(klient: string, vytvorene: string, sms: { at: string; predmet: string }[]): string | null {
  const k = normName(klient);
  return sms
    .filter((s) => normName(s.predmet.split(" · ")[0]) === k && s.at >= vytvorene)
    .map((s) => s.at)
    .sort()[0] ?? null;
}

/** Hodinu po vytvorení: dovtedy je tréner ešte v okne odkazu a notifikácia by len rušila. */
export function odkazNeodoslany(o: { vytvorene: string; platiDo: string; zrusene?: string | null; otvorene?: string | null; sms: string | null }, teraz: Date): boolean {
  if (o.zrusene || o.otvorene || o.sms) return false;
  if (o.platiDo < teraz.toISOString().slice(0, 10)) return false;
  return Date.parse(o.vytvorene) <= teraz.getTime() - 3600000;
}

export type PolozkaFotiek = {
  key: string; tone: "orange" | "blue"; title: string; detail: string; klient: string; trener: string | null;
};

const ukazka = (t: string, n = 220) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

/** Každá odpoveď je vlastná položka; súhlas „ano" sa oznámi raz (modrá — nič sa nemusí). */
export function polozkyFotiek(f: FotkyKlientov | undefined): PolozkaFotiek[] {
  if (!f) return [];
  const von: PolozkaFotiek[] = [];
  for (const o of f.odpovede) {
    von.push({
      key: `fotky|odpoved|${o.id}`, tone: "orange", klient: o.klient, trener: o.trener,
      title: `${o.klient}: odpoveď na fotky`,
      // Riadok registra kreslí DETAIL, nie titulok — meno musí byť v ňom.
      detail: `${o.klient}: odpoveď na fotky „${ukazka(o.text)}“ — celé je v profile → fotky. Odpovedz osobne (telefón, tréning); stránka odpoveď neposiela.`,
    });
  }
  for (const n of f.neodoslane || []) {
    const [, m, d] = n.kedy.slice(0, 10).split("-");
    von.push({
      key: `fotky|neodoslane|${n.token}`, tone: "orange", klient: n.klient, trener: n.trener,
      title: `${n.klient}: odkaz s fotkami neodišiel`,
      detail: `${n.klient}: odkaz s fotkami z ${Number(d)}. ${Number(m)}. je hotový, ale SMS neodišla. V profile → fotky je „Poslať SMS“.`,
    });
  }
  for (const s of f.suhlasy) {
    if (s.suhlas !== "ano") continue;
    von.push({
      key: `fotky|suhlas|${s.token}`, tone: "blue", klient: s.klient, trener: s.trener,
      title: `${s.klient} súhlasí so zverejnením porovnania`,
      detail: `${s.klient} súhlasí so zverejnením porovnania — bez tváre a bez mena (Instagram, web). Je to pri odkaze v profile → fotky; klient to môže na stránke zmeniť.`,
    });
  }
  return von;
}
