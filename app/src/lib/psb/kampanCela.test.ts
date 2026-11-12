import { describe, expect, it } from "bun:test";

import { kampanCelaZBloku, popisKampane, zalozCeluKampan } from "./kampanCela";

const BLOK = {
  type: "kampan-cela", nazov: "PSB 2026-11 — Nejde jen o trénink", ciel: "navstevnost",
  stranka: "https://www.prosapiens.cz/jak-to-funguje/", denneKc: 67, stropKc: 2000, dni: 30,
  mesto: "Brno", okruhKm: 20, text: "Nejde jen o trénink. Jde o to, jak se hýbeš celý den.", nadpis: "Úvodní trénink",
  cta: "BOOK_NOW", media: "134954005386935_3949632315333321", spustit: true,
};

function server(odpovede: Record<string, Record<string, unknown>>) {
  const volane: Record<string, unknown>[] = [];
  return { volane, volaj: async (t: Record<string, unknown>) => { volane.push(t); return odpovede[String(t.akcia)] || { ok: false, error: "?" }; } };
}
const MESTA = { ok: true, mesta: [{ key: "1", nazov: "Brno", krajina: "CZ" }, { key: "2", nazov: "Brno-jih", krajina: "CZ" }] };

describe("kampanCelaZBloku", () => {
  it("prijme úplný návrh a popíše, čo klik spraví", () => {
    const r = kampanCelaZBloku(BLOK);
    expect(r.ok).toBe(true);
    if (r.ok) expect(popisKampane(r.k)).toBe("Založiť a SPUSTIŤ: PSB 2026-11 — Nejde jen o trénink · 67 Kč/deň, 30 dní ≈ 2 010 Kč · Brno + 20 km");
  });
  it("bez textu, média alebo s adresou mimo webu tlačidlo nebude", () => {
    expect(kampanCelaZBloku({ ...BLOK, text: "" }).ok).toBe(false);
    expect(kampanCelaZBloku({ ...BLOK, media: "" }).ok).toBe(false);
    expect(kampanCelaZBloku({ ...BLOK, stranka: "https://example.com/" }).ok).toBe(false);
    expect(kampanCelaZBloku({ ...BLOK, okruhKm: 10 }).ok).toBe(false);
  });
});

describe("zalozCeluKampan", () => {
  const k = (kampanCelaZBloku(BLOK) as { ok: true; k: import("./kampanCela").KampanCela }).k;
  it("prejde všetky štyri kroky a cieli na Brno, nie na mestskú časť", async () => {
    const s = server({ mesta: MESTA, "zaloz-kampan": { ok: true, id: "111", sadaId: "222" }, "reklama-nova": { ok: true, veta: "ok" }, "spusti-kampan": { ok: true } });
    const v = await zalozCeluKampan(k, s.volaj);
    expect(v.ok).toBe(true);
    expect(s.volane.map((x) => x.akcia)).toEqual(["mesta", "zaloz-kampan", "reklama-nova", "spusti-kampan"]);
    expect(s.volane[1]).toMatchObject({ mestoKey: "1", okruhKm: 20, text: "" });
    expect(s.volane[2]).toMatchObject({ sadaId: "222", mediaZReklamy: BLOK.media, spustit: false });
  });
  it("bez mesta nezaloží nič", async () => {
    const s = server({ mesta: { ok: true, mesta: [{ key: "2", nazov: "Brno-jih", krajina: "CZ" }] } });
    const v = await zalozCeluKampan(k, s.volaj);
    expect(v.ok).toBe(false);
    expect(s.volane.length).toBe(1);
  });
  it("keď reklama neprejde, nespúšťa a povie, čo už v Mete je", async () => {
    const s = server({ mesta: MESTA, "zaloz-kampan": { ok: true, id: "111", sadaId: "222" }, "reklama-nova": { ok: false, error: "video nepatrí PSB" } });
    const v = await zalozCeluKampan(k, s.volaj);
    expect(v.ok).toBe(false);
    expect(v.veta).toContain("POZASTAVENÉ");
    expect(s.volane.map((x) => x.akcia)).not.toContain("spusti-kampan");
  });
  it("kontrolór, ktorý nepustí, nechá kampaň založenú a povie prečo", async () => {
    const s = server({ mesta: MESTA, "zaloz-kampan": { ok: true, id: "111", sadaId: "222" }, "reklama-nova": { ok: true }, "spusti-kampan": { ok: false, kontrola: ["reklama zamietnutá"] } });
    const v = await zalozCeluKampan(k, s.volaj);
    expect(v.veta).toContain("NESPUSTENÁ");
    expect(v.veta).toContain("reklama zamietnutá");
  });
});
