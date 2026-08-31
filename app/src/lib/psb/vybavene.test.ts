import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * „Vybavené“ — viem o tom a je to vyriešené.
 *
 * Medzi „Skryť“ (nevybavené, len preč) a napísanou odpoveďou chýbal krok.
 * Jerry, 30. 8. 2026: pri Jarvisovej pripomienke „Ozvať sa Michalovi po
 * návrate. Zabralo to?“ nechce písať vetu — chce povedať, že je to hotové,
 * a Jarvis sa to má dozvedieť rovnako, ako keby ju napísal.
 */
describe("tlačidlo Vybavené", () => {
  const dash = readFileSync(new URL("../../components/psb/Dashboard.tsx", import.meta.url).pathname, "utf8");

  it("tlačidlo existuje a je len na neuzavretých položkách", () => {
    expect(dash).toContain(">\n              Vybavené\n            </button>");
    expect(dash).toContain('posliJarvisovi("vybavené", false)');
  });

  it("ide tou istou cestou ako napísaná odpoveď", () => {
    // nie vlastný ack, ale ten istý handler — inak by sa Jarvis nedozvedel nič
    expect(dash).toContain("const posliJarvisovi = (vlastnyText?: string, otvorOkno = true)");
    expect(dash).toContain("const t = (vlastnyText ?? text).trim();");
  });

  it("bez Jarvisa sa položka aspoň uzavrie", () => {
    expect(dash).toContain('actions.ackAnomaly(item.key, "vybavené", true)');
  });

  it("handler už nikde nepoužíva surový text, len t", () => {
    // keby zostalo text.trim(), tlačidlo by poslalo prázdno
    const i = dash.indexOf("const posliJarvisovi = (vlastnyText?: string)");
    const j = dash.indexOf("setOdpoved(false);", i);
    expect(dash.slice(i, j)).not.toContain("text.trim()");
  });
});

/** Vybavené nemá otvárať chat — je to jeden klik na uzavretie, nie debata. */
describe("Vybavené neotvára Jarvisa", () => {
  const dash = readFileSync(new URL("../../components/psb/Dashboard.tsx", import.meta.url).pathname, "utf8");

  it("okno sa otvára len na požiadanie", () => {
    expect(dash).toContain("if (otvorOkno) chat.setFloatingOpen(true);");
  });

  it("napísaná odpoveď okno stále otvára", () => {
    // tlačidlo „Poslať Jarvisovi" volá bez druhého parametra → otvorOkno = true
    expect(dash).toContain("onClick={() => posliJarvisovi()}");
  });

  it("správa Jarvisovi ide aj tak", () => {
    const i = dash.indexOf("if (otvorOkno) chat.setFloatingOpen(true);");
    expect(dash.slice(i, i + 300)).toContain("void chat.ask(");
  });
});
