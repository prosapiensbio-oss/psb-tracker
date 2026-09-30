/**
 * ANAMNÉZA — ČÍTANIE A ZÁPIS.
 *
 * Jedno miesto pre obe strany: verejnú stránku klienta (`/a/<token>`) aj
 * zápis v Kokpite. Šifrovanie sedí tu, nie v routách — inak by sa raz
 * zapísalo cez cestu, ktorá naň zabudne, a v databáze by ležal čitateľný
 * zdravotný záznam bez toho, aby to niekto zistil.
 */

import type { D1Database } from "@cloudflare/workers-types";

import { OBLAST_Z_TESTU, zTestuPostury } from "./anamnezaFormular";
import { odsifruj, zasifruj } from "./sifra.server";

export type Anamneza = {
  id: string;
  klient: string;
  token: string;
  stav: "ceka" | "klient_vyplnil" | "hotova";
  verzia: number;
  klientOdpovede: Record<string, unknown>;
  zapisOdpovede: Record<string, unknown>;
  suhlasy: Record<string, unknown>;
  klientVyplnilAt: string | null;
  zapisAt: string | null;
  vytvoreneAt: string;
};

type Riadok = {
  id: string; klient: string; token: string; stav: string; verzia: number;
  klient_json: string | null; zapis_json: string | null; suhlasy_json: string | null;
  klient_vyplnil_at: string | null; zapis_at: string | null; vytvorene_at: string;
};

const STLPCE = "id, klient, token, stav, verzia, klient_json, zapis_json, suhlasy_json, klient_vyplnil_at, zapis_at, vytvorene_at";

/** Bez 0/O/I/l/1 — token sa občas prepisuje z telefónu rukou. */
const ABECEDA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function novyToken(dlzka = 14): string {
  const n = crypto.getRandomValues(new Uint8Array(dlzka));
  return [...n].map((x) => ABECEDA[x % ABECEDA.length]).join("");
}

async function zRiadku(r: Riadok, kluc: string): Promise<Anamneza> {
  const rozbal = async (s: string | null): Promise<Record<string, unknown>> => {
    if (!s) return {};
    try { return JSON.parse(await odsifruj(s, kluc)) as Record<string, unknown>; }
    // Zlý kľúč nesmie zhodiť celú kartu klienta — radšej prázdne odpovede
    // a hláška vedľa nich než biela obrazovka.
    catch { return { __nedaSaPrecitat: true }; }
  };
  return {
    id: r.id, klient: r.klient, token: r.token,
    stav: (r.stav as Anamneza["stav"]) || "ceka",
    verzia: r.verzia || 1,
    klientOdpovede: await rozbal(r.klient_json),
    zapisOdpovede: await rozbal(r.zapis_json),
    suhlasy: r.suhlasy_json ? (JSON.parse(r.suhlasy_json) as Record<string, unknown>) : {},
    klientVyplnilAt: r.klient_vyplnil_at,
    zapisAt: r.zapis_at,
    vytvoreneAt: r.vytvorene_at,
  };
}

export async function podlaTokenu(DB: D1Database, token: string, kluc: string): Promise<Anamneza | null> {
  const r = await DB.prepare(`SELECT ${STLPCE} FROM anamnezy WHERE token = ?1`).bind(token).first<Riadok>();
  return r ? zRiadku(r, kluc) : null;
}

export async function podlaKlienta(DB: D1Database, klient: string, kluc: string): Promise<Anamneza | null> {
  const r = await DB.prepare(`SELECT ${STLPCE} FROM anamnezy WHERE klient = ?1`).bind(klient).first<Riadok>();
  return r ? zRiadku(r, kluc) : null;
}

/** Vráti existujúcu anamnézu klienta, alebo založí prázdnu s novým tokenom. */
export async function zalozAleboNajdi(DB: D1Database, klient: string, kluc: string, autor: string): Promise<Anamneza> {
  const uz = await podlaKlienta(DB, klient, kluc);
  if (uz) return uz;
  const id = crypto.randomUUID();
  const token = novyToken();
  const teraz = new Date().toISOString();
  await DB.prepare(
    "INSERT INTO anamnezy (id, klient, token, stav, verzia, klient_json, zapis_json, suhlasy_json, klient_vyplnil_at, zapis_at, vytvorene_at, autor) VALUES (?1,?2,?3,'ceka',1,NULL,NULL,NULL,NULL,NULL,?4,?5)",
  ).bind(id, klient, token, teraz, autor).run();
  return {
    id, klient, token, stav: "ceka", verzia: 1,
    klientOdpovede: {}, zapisOdpovede: {}, suhlasy: {},
    klientVyplnilAt: null, zapisAt: null, vytvoreneAt: teraz,
  };
}

/** Zápis odpovedí klienta z verejnej stránky. Súhlasy sa NEŠIFRUJÚ. */
export async function ulozKlienta(
  DB: D1Database, token: string, odpovede: Record<string, unknown>, suhlasy: Record<string, unknown>, kluc: string,
): Promise<boolean> {
  const sifra = await zasifruj(JSON.stringify(odpovede), kluc);
  const v = await DB.prepare(
    "UPDATE anamnezy SET klient_json = ?1, suhlasy_json = ?2, klient_vyplnil_at = ?3, stav = CASE WHEN stav = 'hotova' THEN 'hotova' ELSE 'klient_vyplnil' END WHERE token = ?4",
  ).bind(sifra, JSON.stringify(suhlasy), new Date().toISOString(), token).run();
  return (v.meta?.changes || 0) > 0;
}

/** Zápis trénera z karty klienta. */
export async function ulozZapis(DB: D1Database, klient: string, odpovede: Record<string, unknown>, kluc: string): Promise<boolean> {
  const sifra = await zasifruj(JSON.stringify(odpovede), kluc);
  const v = await DB.prepare(
    "UPDATE anamnezy SET zapis_json = ?1, zapis_at = ?2, stav = 'hotova' WHERE klient = ?3",
  ).bind(sifra, new Date().toISOString(), klient).run();
  return (v.meta?.changes || 0) > 0;
}

/**
 * ČO UŽ VIEME — predvyplnenie zápisu.
 *
 * Jerry, 30. 9. 2026: „keď klient nejaké veci vyplní pred úvodným, mali by
 * sa automaticky zobraziť v anamnéze, ktorú s ním budem vypĺňať ja."
 * A k tomu test postury: pýta sa na tie isté oblasti bolesti, takže to nie
 * je druhá evidencia, ale ten istý údaj z iného dňa.
 *
 * Poradie dôvery: čo odklikol KLIENT, prebíja test aj Kokpit — je to
 * najčerstvejšie a povedal to o sebe sám.
 */
export type Predvyplnene = {
  hodnoty: Record<string, unknown>;
  /** Odkiaľ ktorá hodnota prišla — obrazovka to má povedať nahlas. */
  odkial: Record<string, string>;
  /** Výstup testu postury na čítanie, keď ho klient robil. */
  test: { oblasti: string[]; odchylky: string[]; vzorec: string; kedy: string } | null;
};

export function predvyplnZapisu(v: {
  klientOdpovede: Record<string, unknown>;
  klientVyplnilAt: string | null;
  /** Dopyt klienta — poznámka môže niesť test postury, zdroj a odporúčateľa. */
  lead?: { note?: string | null; date?: string | null } | null;
  zdroj?: string | null;
  zdrojKto?: string | null;
}): Predvyplnene {
  const hodnoty: Record<string, unknown> = {};
  const odkial: Record<string, string> = {};
  const den = (s: string | null | undefined) => (s || "").slice(0, 10);

  // 1. Test postury — najstarší zdroj, prepíše ho čokoľvek novšie.
  const t = zTestuPostury(v.lead?.note || "");
  const test = t ? { ...t, kedy: den(v.lead?.date) } : null;
  if (test?.oblasti.length) {
    hodnoty.oblasti = test.oblasti.map((o) => ({ oblast: o, sila: null }));
    odkial.oblasti = `z testu postury${test.kedy ? ` · ${test.kedy}` : ""}`;
  }

  // 2. Zdroj z Dopytov — pri odporúčaní aj meno toho, kto klienta poslal.
  if (v.zdroj) {
    hodnoty.zdroj = ZDROJ_Z_KOKPITU[v.zdroj] || "Jiné";
    odkial.zdroj = "z Dopytov";
    if (v.zdrojKto) { hodnoty.zdroj_kto = v.zdrojKto; odkial.zdroj_kto = "z Dopytov"; }
  }

  // 3. Čo odklikol klient — prebíja všetko.
  const kedy = v.klientVyplnilAt ? ` · ${den(v.klientVyplnilAt)}` : "";
  for (const kluc of ["oblasti", "ciel"]) {
    const x = v.klientOdpovede[kluc];
    if (x != null && !(Array.isArray(x) && x.length === 0)) {
      hodnoty[kluc] = x;
      odkial[kluc] = `od klienta${kedy}`;
    }
  }
  return { hodnoty, odkial, test };
}

/** Preklad zdroja z Kokpitu na možnosť v anamnéze. */
const ZDROJ_Z_KOKPITU: Record<string, string> = {
  referencia: "Doporučení",
  instagram: "Instagram",
  google: "Google",
  fp: "Functional Patterns",
  offline: "Leták nebo billboard",
  ai: "AI (ChatGPT a spol.)",
  web: "Jiné",
  ine: "Jiné",
};

/** Oblasti z testu postury — vystavené kvôli kontrole v testoch. */
export { OBLAST_Z_TESTU };
