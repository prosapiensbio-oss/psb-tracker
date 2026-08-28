import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Jarvis začína načisto.
 *
 * Panel po štarte preberal poslednú konverzáciu a ukazoval odpoveď spred dní
 * (28. 8. 2026: rezerva s vtedajším kurzom BTC, ktorá si protirečila
 * s dlaždicou). Kto panel otvára s hotovou otázkou, si rozhovor ponecháva —
 * preto sa reset drží v `otvorPrazdny`, nie v `setFloatingOpen`.
 */
describe("Jarvisov panel sa otvára prázdny", () => {
  const zdroj = readFileSync(new URL("../../components/psb/Assistant.tsx", import.meta.url).pathname, "utf8");

  it("po štarte sa neberie posledná konverzácia", () => {
    // Zoznam do histórie áno, správy nie.
    expect(zdroj).toContain("if (Array.isArray(raw) && raw.length) setChats(raw);");
    expect(zdroj).not.toContain("setMsgs(opravStratene(recent.messages || []))");
  });

  it("bublina otvára cez otvorPrazdny, nie cez setOpen", () => {
    const i = zdroj.indexOf('aria-label="Otvoriť Jarvisa"');
    expect(i).toBeGreaterThan(0);
    const tlacidlo = zdroj.slice(Math.max(0, i - 900), i);
    expect(tlacidlo).toContain("chat.otvorPrazdny()");
  });

  it("otvorPrazdny najprv zastaví rozpísanú odpoveď", () => {
    const m = /const otvorPrazdny = \(\) => \{([^}]*)\}/.exec(zdroj);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("abortRef.current?.abort()");
    expect(m![1]).toContain("newChat()");
  });

  it("kto nesie otázku, rozhovor si ponecháva", () => {
    // Register aj karty obsahu volajú setFloatingOpen priamo — keby volali
    // otvorPrazdny, otázka by sa cestou stratila.
    const dash = readFileSync(new URL("../../components/psb/Dashboard.tsx", import.meta.url).pathname, "utf8");
    expect(dash).toContain("chat.setFloatingOpen(true)");
    expect(dash).not.toContain("otvorPrazdny");
  });
});
