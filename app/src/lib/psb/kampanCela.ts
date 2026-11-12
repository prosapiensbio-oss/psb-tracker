/**
 * KAMPAŇ CELÁ JEDNÝM KLIKOM (Jerry, 12. 11. 2026: „dá sa to spraviť tak,
 * aby bol schopný spraviť všetko autonómne?“).
 *
 * Doteraz Jarvis vedel navrhnúť len kostru (⟦kampan|…⟧ — cieľ, adresa,
 * rozpočet) a text reklamy, video aj cielenie Brno + okruh musel Jerry
 * dopĺňať ručne vo formulári. Toto je jeden návrh, ktorý nesie VŠETKO,
 * a klik ho vykoná po krokoch tými istými akciami servera, aké používa
 * formulár a reklamný agent:
 *
 *   1. mesto → kľúč z Metinho číselníka (`mesta`)
 *   2. kampaň + sada s cielením (`zaloz-kampan`, bez textu — reklamu robí krok 3)
 *   3. reklama s textom a médiom z príspevku, videa alebo inej reklamy (`reklama-nova`)
 *   4. ak to návrh hovorí, spustenie cez kontrolór (`spusti-kampan`)
 *
 * Klik ostáva — reklama míňa peniaze a každé míňanie potvrdzuje človek.
 * Keď krok zlyhá, ďalší sa nerobí a výsledok povie, čo už v Mete je
 * (vždy POZASTAVENÉ, kým neprejde krok 4).
 */

export type KampanCela = {
  nazov: string;
  ciel: "navstevnost" | "dopyty";
  stranka: string;
  denneKc: number;
  stropKc: number;
  dni: number;
  mesto: string;
  okruhKm: number;
  text: string;
  nadpis: string;
  cta: "LEARN_MORE" | "BOOK_NOW" | "SIGN_UP" | "CONTACT_US";
  /** ID príspevku („stránka_príspevok“), videa z knižnice alebo reklamy účtu. */
  media: string;
  utmContent: string;
  spustit: boolean;
};

const CTA = new Set(["LEARN_MORE", "BOOK_NOW", "SIGN_UP", "CONTACT_US"]);
export const OKRUH_MIN = 17;
export const OKRUH_MAX = 80;

/** Overí blok z rozhovoru. Vráti návrh, alebo dôvod, prečo z neho tlačidlo nebude. */
export function kampanCelaZBloku(o: Record<string, unknown>): { ok: true; k: KampanCela } | { ok: false; preco: string } {
  const s = (x: unknown) => String(x ?? "").trim();
  const nazov = s(o.nazov).slice(0, 120);
  const stranka = s(o.stranka);
  const denneKc = Math.round(Number(o.denneKc) || 0);
  const stropKc = Math.round(Number(o.stropKc) || 0);
  const dni = Math.round(Number(o.dni) || 0);
  const okruhKm = Math.round(Number(o.okruhKm) || 20);
  const text = s(o.text).slice(0, 600);
  const media = s(o.media);
  if (!nazov) return { ok: false, preco: "chýba názov" };
  if (!/^https:\/\/(www\.)?prosapiens\.cz\//.test(stranka)) return { ok: false, preco: "stránka musí byť na prosapiens.cz" };
  if (denneKc < 22) return { ok: false, preco: "denný rozpočet pod 22 Kč" };
  if (stropKc && stropKc < 2000) return { ok: false, preco: "strop pod 2 000 Kč" };
  if (text.length < 20) return { ok: false, preco: "chýba text reklamy" };
  if (!/^[0-9]{5,}(_[0-9]{5,})?$/.test(media)) return { ok: false, preco: "chýba médium (ID príspevku, videa alebo reklamy)" };
  if (okruhKm < OKRUH_MIN || okruhKm > OKRUH_MAX) return { ok: false, preco: `okruh mimo ${OKRUH_MIN}–${OKRUH_MAX} km` };
  return {
    ok: true,
    k: {
      nazov, ciel: s(o.ciel) === "dopyty" ? "dopyty" : "navstevnost", stranka, denneKc, stropKc, dni,
      mesto: s(o.mesto) || "Brno", okruhKm, text, nadpis: s(o.nadpis).slice(0, 120),
      cta: (CTA.has(s(o.cta)) ? s(o.cta) : "LEARN_MORE") as KampanCela["cta"], media,
      utmContent: s(o.utmContent).replace(/[^a-z0-9-]/gi, "").slice(0, 40), spustit: o.spustit === true,
    },
  };
}

/** Čo sa klikom stane — veta na tlačidlo a do potvrdenia. */
export function popisKampane(k: KampanCela): string {
  const spolu = k.dni ? `, ${k.dni} dní ≈ ${String(k.denneKc * k.dni).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kč` : "";
  return `${k.spustit ? "Založiť a SPUSTIŤ" : "Založiť (pozastavenú)"}: ${k.nazov} · ${k.denneKc} Kč/deň${spolu} · ${k.mesto} + ${k.okruhKm} km`;
}

type Volaj = (telo: Record<string, unknown>) => Promise<Record<string, unknown>>;

/** Vykoná návrh krok po kroku. `volaj` posiela telo na /api/meta. */
export async function zalozCeluKampan(k: KampanCela, volaj: Volaj): Promise<{ ok: boolean; veta: string; kampanId?: string }> {
  const m = await volaj({ akcia: "mesta", q: k.mesto });
  const mesta = (m.mesta as { key: string; nazov: string; krajina: string }[] | undefined) || [];
  const norm = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  // „Brno“ aj „Brno, Czech Republic“ — nikdy nie mestská časť „Brno-jih“.
  const rovnake = (x: { nazov: string }) => norm(x.nazov.split(",")[0]) === norm(k.mesto);
  const mesto = mesta.find((x) => rovnake(x) && (!x.krajina || x.krajina === "CZ")) || mesta.find(rovnake);
  if (!m.ok || !mesto) return { ok: false, veta: `Nič som nezaložil: mesto „${k.mesto}“ som v Mete nenašiel${m.error ? ` (${String(m.error)})` : ""}.` };

  const z = await volaj({
    akcia: "zaloz-kampan", nazov: k.nazov, ciel: k.ciel, stranka: k.stranka, denneKc: k.denneKc, stropKc: k.stropKc,
    rezimRozpoctu: "denne", celkomKc: 0, oblast: "cz", dni: k.dni, mestoKey: mesto.key, okruhKm: k.okruhKm,
    text: "", nadpis: "",
  });
  const kampanId = String(z.id || "");
  const sadaId = String(z.sadaId || "");
  if (!z.ok || !kampanId) return { ok: false, veta: `Kampaň sa nezaložila: ${String(z.error || "server neodpovedal")}.` };
  if (!sadaId) return { ok: false, kampanId, veta: `Kampaň ${kampanId} vznikla POZASTAVENÁ, ale sada nie (${String(z.chybaSady || "bez dôvodu")}) — reklamu som nezakladal.` };

  const r = await volaj({
    akcia: "reklama-nova", sadaId, mediaZReklamy: k.media, nazov: `${k.nazov} — A1`, text: k.text, nadpis: k.nadpis,
    odkaz: k.stranka, cta: k.cta, utmContent: k.utmContent || "a1", spustit: false,
  });
  if (!r.ok) return { ok: false, kampanId, veta: `Kampaň ${kampanId} a sada (${mesto.nazov} + ${k.okruhKm} km) sú POZASTAVENÉ, ale reklama neprešla: ${String(r.error || "bez dôvodu")}.` };

  if (!k.spustit) return { ok: true, kampanId, veta: `Hotové a POZASTAVENÉ: kampaň ${kampanId}, sada ${mesto.nazov} + ${k.okruhKm} km, reklama s textom aj médiom. ${String(r.veta || "")}` };

  const sp = await volaj({ akcia: "spusti-kampan", kampanId });
  if (!sp.ok) {
    const kontrola = Array.isArray(sp.kontrola) ? (sp.kontrola as string[]).join(" · ") : String(sp.error || "bez dôvodu");
    return { ok: false, kampanId, veta: `Kampaň je založená celá, ale NESPUSTENÁ — kontrolór ju nepustil: ${kontrola}.` };
  }
  return { ok: true, kampanId, veta: `SPUSTENÁ: kampaň ${kampanId}, sada ${mesto.nazov} + ${k.okruhKm} km, reklama s textom aj médiom — ${k.denneKc} Kč/deň. Meta ju ešte schvaľuje (minúty až hodiny).` };
}
