import { describe, expect, it } from "bun:test";

import { menoZNazvuUvodneho } from "./kalendar";
import { klientUdalosti } from "./compute";

/**
 * Meno z názvu úvodného tréningu.
 *
 * Jerry, 17. 8. 2026: „ten úvodný na Janu Malinovú by sa mi mal už rovno
 * spraviť ako nový profil, aby mohla vyskočiť notifikácia, či dostala SMS."
 * Meno v tom názve stálo a appka sa tvárila, že tam nie je nič.
 */

describe("menoZNazvuUvodneho — čo prejde", () => {
  it("skutočný názov z kalendára", () => {
    expect(menoZNazvuUvodneho("Uvodný tréning Jana Malinová")).toBe("Jana Malinová");
  });

  it("znesie české aj slovenské tvary a poradie", () => {
    expect(menoZNazvuUvodneho("Úvodní trénink — Petra Nováková")).toBe("Petra Nováková");
    expect(menoZNazvuUvodneho("ÚVODNÍ TRÉNINK: Jan Kral")).toBe("Jan Kral");
    expect(menoZNazvuUvodneho("Jana Malinová - úvodní")).toBe("Jana Malinová");
    expect(menoZNazvuUvodneho("uvodny trening Peter")).toBe("Peter");
  });
});

describe("menoZNazvuUvodneho — čo sa zámerne odmietne", () => {
  it("samotná nálepka nie je meno", () => {
    // Toto bola reálna chyba: bez unicode hranice slova prežilo „Úvodní"
    // a appka by z neho urobila klientku menom Úvodní.
    expect(menoZNazvuUvodneho("Úvodní trénink")).toBe(null);
    expect(menoZNazvuUvodneho("úvodný")).toBe(null);
    expect(menoZNazvuUvodneho("")).toBe(null);
  });

  it("čokoľvek s číslom nie je meno", () => {
    expect(menoZNazvuUvodneho("Úvodní trénink 9:00")).toBe(null);
    expect(menoZNazvuUvodneho("Úvodní 2× hodina")).toBe(null);
  });

  it("veta nie je meno", () => {
    expect(menoZNazvuUvodneho("Úvodní trénink — volná hodina pro nového")).toBe(null);
    expect(menoZNazvuUvodneho("úvodní trénink zrušený")).toBe(null);
  });
});

describe("klientUdalosti", () => {
  it("mapovanie vyhráva vždy", () => {
    expect(klientUdalosti({ klient: "Jana Malinova", typ: "uvodny", nazov: "Uvodný tréning Kto Iny" })).toBe("Jana Malinova");
  });

  it("pri úvodnom bez mapovania sa meno prečíta z názvu", () => {
    expect(klientUdalosti({ klient: null, typ: "uvodny", nazov: "Uvodný tréning Jana Malinová" })).toBe("Jana Malinová");
  });

  it("pri BEŽNOM tréningu sa nehádа", () => {
    // Tam by odhad pripísal hodinu existujúcemu klientovi — a s ňou peniaze.
    expect(klientUdalosti({ klient: null, typ: "trening", nazov: "Trénink Jana Malinová" })).toBe(null);
  });
});
