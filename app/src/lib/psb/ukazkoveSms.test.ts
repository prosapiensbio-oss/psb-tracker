import { describe, expect, it } from "bun:test";

import { dlzkaSpravy } from "./sms";
import { ukazkoveSms } from "./ukazkoveSms";

describe("ukazkoveSms — stráž nad všetkými znaniami naraz", () => {
  const vsetky = ukazkoveSms();

  it("žiadne znenie nemá diakritiku", () => {
    // Jeden mäkčeň zráža limit zo 160 znakov na 70.
    for (const s of vsetky) {
      expect(s.text).not.toMatch(/[áäčďéíľĺňóôŕšťúýžÁČĎÉÍĽŇÓŠŤÚÝŽěřůŘ]/);
    }
  });

  it("každé sa zmestí do jednej správy", () => {
    // Toto by 2. 10. 2026 padlo na správe o zapísanom balíčku — bola
    // napísaná priamo v obrazovke, mimo `textSms`.
    for (const s of vsetky) {
      expect({ kedy: s.kedy, sprav: dlzkaSpravy(s.text).sprav }).toEqual({ kedy: s.kedy, sprav: 1 });
    }
  });

  it("každé nesie odkaz alebo povie, kde ho klient nájde", () => {
    for (const s of vsetky) {
      expect(s.text).toMatch(/prosapiens\.cz\/|v maili/);
    }
  });

  it("je ich päť a každé má, kde v appke vzniká", () => {
    expect(vsetky).toHaveLength(5);
    for (const s of vsetky) expect(s.kde.length).toBeGreaterThan(3);
  });
});
