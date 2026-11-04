import { describe, expect, it } from "bun:test";
import { adresatiSkupin, skupinaKlienta, spocitajSkupiny } from "./mailSkupiny";

const TERAZ = new Date("2026-11-04T12:00:00Z");
const zaklad = { klienti: [], odberatelia: [], fakturacia: [], leady: [], anamnezy: [], nedavne: [], teraz: TERAZ };
const sk = (r: ReturnType<typeof spocitajSkupiny>, id: string) => r.find((s) => s.id === id)!;

describe("skupiny mailera", () => {
  it("zaradí klienta podľa toho, čo sa stalo", () => {
    expect(skupinaKlienta({ name: "A", status: "Aktívny", sessions: [] })).toBe("trenuje");
    expect(skupinaKlienta({ name: "A", status: "Pauza", sessions: [] })).toBe("pauza");
    expect(skupinaKlienta({ name: "A", status: "Neaktívny", sessions: [{ sessionType: "UVODNE" }] })).toBe("len_uvodny");
    expect(skupinaKlienta({ name: "A", status: "Neaktívny", sessions: [{ sessionType: "UVODNE" }, { sessionType: "OFFLINE" }] })).toBe("skoncil");
  });

  it("nezaškrtnutý newsletter v anamnéze znamená nepísať", () => {
    const r = spocitajSkupiny({
      ...zaklad,
      klienti: [{ name: "Jana Nová", status: "Aktívny", sessions: [] }, { name: "Petr Starý", status: "Aktívny", sessions: [] }],
      fakturacia: [{ klient: "Jana Nová", email: "Jana@x.cz " }, { klient: "Petr Starý", email: "petr@x.cz" }],
      anamnezy: [{ klient: "Jana Nová", suhlasy_json: '{"newsletter":false}' }, { klient: "Petr Starý", suhlasy_json: '{"newsletter":true}' }],
    });
    const t = sk(r, "trenuje");
    expect(t.adresati.map((a) => a.email)).toEqual(["petr@x.cz"]);
    expect(t.vynechani).toEqual([{ email: "jana@x.cz", meno: "Jana Nová", prekazka: "anamneza_nie" }]);
  });

  it("odhlásený a nedoručiteľný sa nedostanú do žiadnej skupiny na odoslanie", () => {
    const r = spocitajSkupiny({
      ...zaklad,
      klienti: [{ name: "Jana", status: "Aktívny", sessions: [] }, { name: "Eva", status: "Pauza", sessions: [] }],
      fakturacia: [{ klient: "Jana", email: "jana@x.cz" }, { klient: "Eva", email: "eva@x.cz" }],
      odberatelia: [{ email: "JANA@x.cz", status: "unsubscribed" }, { email: "eva@x.cz", status: "bounced" }],
    });
    expect(r.flatMap((s) => s.adresati)).toEqual([]);
    expect(sk(r, "trenuje").vynechani[0].prekazka).toBe("odhlaseny");
    expect(sk(r, "pauza").vynechani[0].prekazka).toBe("nedorucitelny");
  });

  it("dokument ani test postury bez súhlasu nestačia", () => {
    const r = spocitajSkupiny({
      ...zaklad,
      leady: [
        { email: "a@x.cz", druh: "magnet", note: "LEAD MAGNET | postura" },
        { email: "b@x.cz", note: "TEST POSTURY | bolí" },
        { email: "c@x.cz", druh: "dopyt", note: "chci trénink" },
      ],
    });
    for (const id of ["dokument_novy", "test_postury", "dopyt"]) {
      expect(sk(r, id).adresati).toEqual([]);
      expect(sk(r, id).vynechani[0].prekazka).toBe("bez_suhlasu");
    }
  });

  it("zaškrtnutý súhlas platí až po potvrdení v maili", () => {
    const r = spocitajSkupiny({
      ...zaklad,
      odberatelia: [
        { email: "caka@x.cz", status: "caka_potvrdenie", suhlas_at: "2026-11-04" },
        { email: "ok@x.cz", status: "active", suhlas_at: "2026-11-04", potvrdene_at: "2026-11-04" },
      ],
      leady: [{ email: "ok@x.cz", druh: "magnet", note: "LEAD MAGNET | x" }],
    });
    const n = sk(r, "newsletter_web");
    expect(n.adresati.map((a) => a.email)).toEqual(["ok@x.cz"]);
    expect(n.vynechani[0].prekazka).toBe("caka_potvrdenie");
    expect(sk(r, "dokument_novy").vsetkych).toBe(0);
  });

  it("starý zoznam: aktívny smie, klient v ňom sa neráta druhýkrát", () => {
    const r = spocitajSkupiny({
      ...zaklad,
      klienti: [{ name: "Jana", status: "Aktívny", sessions: [] }],
      odberatelia: [{ email: "jana@x.cz", status: "active", klient: "Jana" }, { email: "doc@x.cz", status: "active", meno: "Doc" }],
    });
    expect(sk(r, "trenuje").adresati.map((a) => a.email)).toEqual(["jana@x.cz"]);
    expect(sk(r, "dokument_2025").adresati.map((a) => a.email)).toEqual(["doc@x.cz"]);
  });

  it("ručné skupiny Test a Klienti nie sú stiahnutý dokument", () => {
    const r = spocitajSkupiny({
      ...zaklad,
      odberatelia: [
        { email: "t@x.cz", status: "active", skupiny: "Test" },
        { email: "k@x.cz", status: "active", skupiny: "Klienti aktívny sep.25" },
        { email: "d@x.cz", status: "active", skupiny: "Klienti aktívny sep.25 · Protokol" },
      ],
    });
    expect(sk(r, "dokument_2025").adresati.map((a) => a.email)).toEqual(["d@x.cz"]);
  });

  it("brzda 14 dní: nedávny mail vynechá, starší nie", () => {
    const r = spocitajSkupiny({
      ...zaklad,
      odberatelia: [{ email: "a@x.cz", status: "active" }, { email: "b@x.cz", status: "active" }],
      nedavne: [{ email: "a@x.cz", odoslane_at: "2026-10-30T10:00:00Z" }, { email: "b@x.cz", odoslane_at: "2026-10-01T10:00:00Z" }],
    });
    const d = sk(r, "dokument_2025");
    expect(d.adresati.map((a) => a.email)).toEqual(["b@x.cz"]);
    expect(d.vynechani[0].prekazka).toBe("nedavno");
  });

  it("spoločný mail rodiča a dieťaťa dostane jeden mail", () => {
    const r = spocitajSkupiny({
      ...zaklad,
      klienti: [{ name: "Luky", status: "Aktívny", sessions: [] }, { name: "Dominika", status: "Pauza", sessions: [] }],
      fakturacia: [{ klient: "Luky", email: "d@x.cz" }, { klient: "Dominika", email: "d@x.cz" }],
    });
    expect(adresatiSkupin(r, ["trenuje", "pauza"]).map((a) => a.email)).toEqual(["d@x.cz"]);
  });
});
