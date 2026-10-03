import { describe, expect, it } from "bun:test";

import { dlzkaSpravy } from "./sms";
import { ukazkoveSms } from "./ukazkoveSms";
import { UKAZKA, jeUkazka } from "./ukazka";

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

  it("sú štyri a každé má, kde v appke vzniká", () => {
    // Bolo ich päť. Správa o zapísanom balíčku mala vlastné znenie bez
    // odkazu („QR máš v maili") a 3. 10. 2026 ju nahradila tá spoločná —
    // stav hovorí stránka, nie text správy.
    expect(vsetky).toHaveLength(4);
    for (const s of vsetky) expect(s.kde.length).toBeGreaterThan(3);
  });
});

describe("odkazy v skúšobných SMS musia viesť na ukážkové stránky", () => {
  it("nesú vyhradené tokeny, nie vymyslené", () => {
    // Jerry, 3. 10. 2026: „prišlo mi 5 SMS, ale ani jeden odkaz sa nedal
    // otvoriť." Token UKAZKA1234 v databáze nebol a stránka vrátila 404.
    const s = ukazkoveSms().map((x) => x.text).join("\n");
    expect(s).toContain(`/u/${UKAZKA.predUvodnym}`);
    expect(s).toContain(`/u/${UKAZKA.poUvodnom}`);
    expect(s).toContain(`/v/${UKAZKA.prehlad}`);
    expect(s).not.toContain("UKAZKA1234");
  });

  it("idú KRÁTKOU adresou — adresa workera je o 18 znakov dlhšia a správa by prerástla", () => {
    for (const x of ukazkoveSms()) {
      if (!x.text.includes("http")) continue;
      expect(x.text).toContain("https://prosapiens.cz/");
    }
  });

  it("každý vyhradený token prejde filtrom routy", () => {
    for (const t of Object.values(UKAZKA)) {
      expect(t).toMatch(/^[A-Za-z0-9]{8,24}$/);
      expect(jeUkazka(t)).toBe(true);
    }
    expect(jeUkazka("cVz4vMRTHMKT")).toBe(false);
  });
});
