import { describe, expect, it } from "bun:test";

import { nezapisaneDoRegistra } from "./compute";
import { jeTestPostury, nechceHovor } from "./dopytTestPostury";

const radka = { note: "TEST POSTURY | bolí: Bedro, SI kloub | hovor: Ne, stačí mi analýza e-mailem", stranka: "https://www.prosapiens.cz/test-postury/" };

describe("test postury a „Hovor: Ne\" (Radka Pelánová, 30. 10. 2026)", () => {
  it("pozná test postury aj odmietnutý hovor", () => {
    expect(jeTestPostury(radka)).toBe(true);
    expect(nechceHovor(radka)).toBe(true);
    expect(nechceHovor({ note: "Nový test postury · Hovor: Ne, stačí mi analýza e-mailem" })).toBe(true);
  });
  it("hovor áno alebo bežný dopyt sa ozvať chce", () => {
    expect(nechceHovor({ note: "TEST POSTURY | hovor: Ano, zavolejte mi" })).toBe(false);
    expect(nechceHovor({ note: "Ne, dnes nemôžem, ozvite sa zajtra" })).toBe(false);
  });
  it("nepýta sa „prečo z toho nebol klient\"", () => {
    const leads = [{ id: "r", name: "Radka Pelánová", date: "2026-10-29", dovod: "", status: "novy", odpovedaneAt: "", createdAt: "", druh: "dopyt", ...radka }];
    const von = nezapisaneDoRegistra({ leads: leads as never, dnes: "2026-10-30", menaKlientov: [], zmeny: [] });
    expect(von.some((x) => x.key === "dopyt|nevyriesene")).toBe(false);
  });
});
