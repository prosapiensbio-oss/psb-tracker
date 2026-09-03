// Porovnanie bitcoinových platieb s PTminderom.
//
// Výpočet sa 31. 8. 2026 presťahoval z `Financie.tsx` sem, aby z neho mohli
// chodiť notifikácie. Tieto testy strážia, že sťahovanie nič nezmenilo —
// najmä tú zámernú asymetriu, kvôli ktorej sa čiastočná platba nehlási.
import { describe, expect, it } from "bun:test";

import { porovnajBtcPlatby } from "./btcKontrola";

const pt = (client: string, date: string, amount: number) =>
  ({ client, date, amount, method: "other", note: "" }) as any;
const btc = (klient: string, datum: string, czk: number) => ({ klient, datum, czk, sats: 0 });

describe("porovnajBtcPlatby", () => {
  it("platba, ktorá sedí, sa nehlási", () => {
    const v = porovnajBtcPlatby([pt("Jan Novak", "2026-08-10", 9000)], [btc("Jan Novak", "2026-08-10", 9000)]);
    expect(v.sedi).toBe(1);
    expect(v.nesedi).toEqual([]);
  });

  it("bitcoin je, v PTminderi nie — hlási sa", () => {
    const v = porovnajBtcPlatby([], [btc("Jan Novak", "2026-08-10", 9000)]);
    expect(v.nesedi.length).toBe(1);
    expect(v.nesedi[0].klient).toBe("Jan Novak");
    expect(v.nesedi[0].text).toContain("v PTminderi nie");
  });

  it("v PTminderi VIAC = čiastočná platba, NEhlási sa", () => {
    // Lukáš Kríž platil na dvakrát a v bitcoine bola len časť. Toto je bežná
    // vec — hlásiť ju by kartu aj register zaplnilo šumom.
    const v = porovnajBtcPlatby([pt("Lukas Kriz", "2026-08-10", 20000)], [btc("Lukas Kriz", "2026-08-10", 9000)]);
    expect(v.nesedi).toEqual([]);
    expect(v.ciastocne.length).toBe(1);
    expect(v.sedi).toBe(1);
  });

  it("v bitcoine VIAC = vážne, hlási sa", () => {
    const v = porovnajBtcPlatby([pt("Jan Novak", "2026-08-10", 5000)], [btc("Jan Novak", "2026-08-10", 20000)]);
    expect(v.nesedi.length).toBe(1);
    expect(v.nesedi[0].text).toContain("VIAC");
  });

  it("platba na viac kusov za pár dní je JEDNA platba", () => {
    // Krčmár poslal 77 tisíc v štyroch kusoch za dva dni.
    const v = porovnajBtcPlatby(
      [pt("Tomas Krcmar", "2026-08-10", 77000)],
      [btc("Tomas Krcmar", "2026-08-10", 20000), btc("Tomas Krcmar", "2026-08-11", 20000),
       btc("Tomas Krcmar", "2026-08-11", 20000), btc("Tomas Krcmar", "2026-08-12", 17000)],
    );
    expect(v.spolu).toBe(1);
    expect(v.nesedi).toEqual([]);
  });

  it("zápis o pár dní neskôr sa ešte spáruje", () => {
    // Gažo — bitcoin 12. 2., zápis v PTminderi 4. 2.
    const v = porovnajBtcPlatby([pt("Peter Gazo", "2026-02-04", 9000)], [btc("Peter Gazo", "2026-02-12", 9000)]);
    expect(v.nesedi).toEqual([]);
  });

  it("kľúč notifikácie nenesie sumu — doplatok by inak vyrobil nový riadok", () => {
    const a = porovnajBtcPlatby([], [btc("Jan Novak", "2026-08-10", 9000)]).nesedi[0].kluc;
    const b = porovnajBtcPlatby([], [btc("Jan Novak", "2026-08-10", 12000)]).nesedi[0].kluc;
    expect(a).toBe(b);
  });

  it("platba bez mena klienta sa ignoruje", () => {
    const v = porovnajBtcPlatby([], [{ klient: null, datum: "2026-08-10", czk: 9000, sats: 0 }]);
    expect(v.spolu).toBe(0);
    expect(v.nesedi).toEqual([]);
  });
});
