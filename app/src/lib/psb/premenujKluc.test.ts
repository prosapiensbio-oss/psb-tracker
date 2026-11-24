import { describe, expect, test } from "bun:test";
import { premenujKlucOdpovede } from "./premenujKluc";

describe("premenovanie kľúča odpovede", () => {
  const zo = "Matej Prochadzka", na = "Matěj Procházka";
  test("skutočné kľúče z revízie októbra 2026", () => {
    expect(premenujKlucOdpovede("platnost|Matej Prochadzka|2026-11-10", zo, na)).toBe("platnost|Matěj Procházka|2026-11-10");
    expect(premenujKlucOdpovede("mute|gone|Matej Prochadzka", zo, na)).toBe("mute|gone|Matěj Procházka");
    expect(premenujKlucOdpovede("narodeniny|Matej Prochadzka|2026|7", zo, na)).toBe("narodeniny|Matěj Procházka|2026|7");
  });
  test("kľúč s menom v tvare normName", () => {
    expect(premenujKlucOdpovede("uvodny-sms|matej prochadzka|2026-11-27", zo, na)).toBe("uvodny-sms|matej prochazka|2026-11-27");
  });
  test("iné meno alebo len časť dielu sa nemení", () => {
    expect(premenujKlucOdpovede("mute|gone|Matej Prochadzka ml.", zo, na)).toBeNull();
    expect(premenujKlucOdpovede("dnes|2026-09-01|Jan Kral", zo, na)).toBeNull();
  });
});
